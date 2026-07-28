using CourierSA.Application.DTOs.Parcels;
using CourierSA.Application.DTOs.Quotes;
using CourierSA.Application.Interfaces.Repositories;
using CourierSA.Application.Interfaces.Services;
using CourierSA.Domain.Entities;
using CourierSA.Domain.Enums;
using CourierSA.Domain.Exceptions;
using Microsoft.EntityFrameworkCore;

namespace CourierSA.Infrastructure.Services;

/// <summary>
/// Orchestrates the full parcel lifecycle:
/// Draft → Pending → Approved → InWarehouse → InTransit → Delivered (or Failed)
/// </summary>
public class ParcelService : IParcelService
{
    private readonly IUnitOfWork          _uow;
    private readonly IQuoteService        _quoteService;
    private readonly IBarcodeService      _barcodeService;
    private readonly INotificationService _notificationService;
    private readonly IAuditService        _audit;

    public ParcelService(
        IUnitOfWork          uow,
        IQuoteService        quoteService,
        IBarcodeService      barcodeService,
        INotificationService notificationService,
        IAuditService        audit)
    {
        _uow                 = uow;
        _quoteService        = quoteService;
        _barcodeService      = barcodeService;
        _notificationService = notificationService;
        _audit               = audit;
    }

    // ── Book ──────────────────────────────────────────────────────────────────
    public async Task<ParcelDetailDto> BookAsync(
    CreateParcelDto dto, Guid customerId, CancellationToken ct = default)
    {
        var customer = await _uow.Query<CustomerProfile>()
    .Query()
    .FirstOrDefaultAsync(c => c.UserId == customerId, ct)
    ?? throw new NotFoundException("Customer profile not found.");

        // 1. Fetch or recalculate the quote
        Quote? quote = null;
        decimal finalQuoteAmount = 0;

        if (dto.QuoteId.HasValue)
        {
            // A) Use the existing quote provided by the frontend
            quote = await _uow.Quotes.GetByIdAsync(dto.QuoteId.Value, ct);

            if (quote is null || quote.Status != QuoteStatus.Pending)
                throw new BadRequestException("Quote is invalid or has already been used.");
            if (quote.ExpiresAt < DateTime.UtcNow)
                throw new BadRequestException("Quote has expired. Please request a new quote.");

            finalQuoteAmount = quote.TotalAmountZAR;
        }
        else
        {
            // B) FALLBACK: Recalculate on the fly if the frontend didn't pass a QuoteId.
            // Using positional record instantiation as defined in your DTOs
            var quoteRequest = new QuoteRequestDto(
                dto.PickupAddress.Province,
                dto.DeliveryAddress.Province,
                dto.WeightKg,
                dto.ServiceType,
                dto.DeclaredValueZAR,
                dto.InsuranceRequired,
                dto.Dimensions is null ? null : new DimensionsDto(
                    dto.Dimensions.LengthCm,
                    dto.Dimensions.WidthCm,
                    dto.Dimensions.HeightCm
                )
            );

            // By passing customer.UserId, QuoteService will automatically save it to the DB
            var calculatedQuote = await _quoteService.CalculateAsync(quoteRequest, customer.UserId, ct);
            finalQuoteAmount = calculatedQuote.TotalAmountZAR;

            // Fetch the newly generated quote so we can mark it as Accepted below
            if (calculatedQuote.QuoteId.HasValue)
            {
                quote = await _uow.Quotes.GetByIdAsync(calculatedQuote.QuoteId.Value, ct);
            }
        }

        // 2. Generate Tracking Number & Addresses
        var trackingNumber = await _uow.Parcels.GenerateTrackingNumberAsync();

        var pickup = MapAddress(dto.PickupAddress);
        var delivery = MapAddress(dto.DeliveryAddress);

        await _uow.Query<ParcelAddress>().AddAsync(pickup, ct);
        await _uow.Query<ParcelAddress>().AddAsync(delivery, ct);

        // 3. Create the Parcel
        var parcel = new Parcel
        {
            Id = Guid.NewGuid(),
            TrackingNumber = trackingNumber,
            CustomerId = customer.Id,
            Status = ParcelStatus.PendingApproval,
            ServiceType = dto.ServiceType,
            WeightKg = dto.WeightKg,
            Dimensions = dto.Dimensions is null ? null : new ParcelDimensions
            {
                LengthCm = dto.Dimensions.LengthCm,
                WidthCm = dto.Dimensions.WidthCm,
                HeightCm = dto.Dimensions.HeightCm
            },
            DeclaredValueZAR = dto.DeclaredValueZAR,
            Description = dto.Description,
            SpecialInstructions = dto.SpecialInstructions,
            IsFragile = dto.IsFragile,
            RequiresSignature = dto.RequiresSignature,
            InsuranceRequired = dto.InsuranceRequired,
            PickupAddressId = pickup.Id,
            DeliveryAddressId = delivery.Id,
            QuoteAmountZAR = finalQuoteAmount, // <--- Using the guaranteed valid amount
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        // Generate barcode
        parcel.BarcodeImagePath = await _barcodeService.GenerateAsync(trackingNumber, ct);

        await _uow.Parcels.AddAsync(parcel, ct);

        // 4. Mark quote as used
        if (quote is not null)
        {
            quote.Status = QuoteStatus.Accepted;
            quote.ParcelId = parcel.Id;
            _uow.Quotes.Update(quote);
        }

        // 5. Debit Wallet
        if (dto.PayFromWallet)
        {
            if (parcel.QuoteAmountZAR is null)
                throw new BadRequestException("Cannot pay from wallet: No quote amount provided.");

            if (customer.WalletBalanceZAR < parcel.QuoteAmountZAR)
                throw new BadRequestException("Insufficient wallet balance to book this parcel.");

            await DebitWalletAsync(customer, parcel, ct);
        }

        // 6. Save & Notify
        AddTrackingEvent(parcel, TrackingEventType.Booked, "Parcel booking confirmed", pickup.City);

        await _uow.SaveChangesAsync(ct);

        await _notificationService.SendParcelBookedAsync(customer.UserId, parcel.TrackingNumber, ct);

        await _audit.LogAsync("PARCEL_BOOKED", "Parcel", parcel.Id,
            null, new { parcel.TrackingNumber, parcel.Status }, customerId, null, ct);

        return await GetDetailAsync(parcel.Id, ct)
               ?? throw new InvalidOperationException("Failed to retrieve parcel after booking.");
    }
    // ── Approve ───────────────────────────────────────────────────────────────
    public async Task ApproveAsync(
        Guid parcelId, Guid staffId, CancellationToken ct = default)
    {
        var parcel = await GetOrThrowAsync(parcelId, ct);
        EnsureStatus(parcel, ParcelStatus.PendingApproval);

        parcel.Status    = ParcelStatus.Approved;
        parcel.UpdatedAt = DateTime.UtcNow;

        var trackingEvent = AddTrackingEvent(parcel, TrackingEventType.Approved,
      "Booking approved by dispatcher");
        await _uow.TrackingEvents.AddAsync(trackingEvent, ct);
        await _uow.SaveChangesAsync(ct);
    }

    // ── Reject ────────────────────────────────────────────────────────────────
    public async Task RejectAsync(
        Guid parcelId, string reason, Guid staffId, CancellationToken ct = default)
    {
        var parcel = await GetOrThrowAsync(parcelId, ct);
        EnsureStatus(parcel, ParcelStatus.PendingApproval);

        var old = new { parcel.Status };
        parcel.Status    = ParcelStatus.Cancelled;
        parcel.UpdatedAt = DateTime.UtcNow;

        var trackingEvent = AddTrackingEvent(parcel, TrackingEventType.Cancelled,
    $"Booking rejected: {reason}");
        await _uow.TrackingEvents.AddAsync(trackingEvent, ct);
        await _uow.SaveChangesAsync(ct);
    }

    // ── Check In at Warehouse ─────────────────────────────────────────────────
    public async Task CheckInAsync(
        Guid parcelId, string warehouseLocation,
        Guid staffId, CancellationToken ct = default)
    {
        var parcel = await GetOrThrowAsync(parcelId, ct);
        EnsureStatus(parcel, ParcelStatus.Approved);

        parcel.Status    = ParcelStatus.InWarehouse;
        parcel.UpdatedAt = DateTime.UtcNow;
        var trackingEvent = AddTrackingEvent(parcel, TrackingEventType.ReceivedAtWarehouse,
            "Parcel received at warehouse", warehouseLocation);
        await _uow.TrackingEvents.AddAsync(trackingEvent, ct);

        await _uow.SaveChangesAsync(ct);
    }

    // ── Dispatch ──────────────────────────────────────────────────────────────
    public async Task DispatchAsync(
        Guid parcelId, Guid driverId,
        Guid dispatcherId, CancellationToken ct = default)
    {
        var parcel = await GetOrThrowAsync(parcelId, ct);
        if (parcel.Status != ParcelStatus.InWarehouse &&
            parcel.Status != ParcelStatus.Approved)
            throw new BadRequestException(
                $"Cannot dispatch parcel in status '{parcel.Status}'.");
        var driver = await _uow.Query<DriverProfile>().GetByIdAsync(driverId, ct)
    ?? throw new NotFoundException("Driver not found.");

        if (driver.Status != DriverStatus.Available)
            throw new BadRequestException("Driver is not currently available.");

        var delivery = new Delivery
        {
            Id            = Guid.NewGuid(),
            ParcelId      = parcel.Id,
            DriverId      = driverId,
            Status        = DeliveryStatus.Assigned,
            DispatchedAt  = DateTime.UtcNow,
            CreatedAt     = DateTime.UtcNow,
            UpdatedAt     = DateTime.UtcNow
        };

        parcel.Status    = ParcelStatus.OutForDelivery;
        parcel.UpdatedAt = DateTime.UtcNow;

        driver.Status    = DriverStatus.OnDelivery;

        await _uow.Deliveries.AddAsync(delivery, ct);
        _uow.Parcels.Update(parcel);

        AddTrackingEvent(parcel, TrackingEventType.OutForDelivery,
            $"Dispatched to driver {driver.User?.FullName ?? driverId.ToString()}");

        await _uow.SaveChangesAsync(ct);
        await _notificationService.SendDispatchedAsync(
            parcel.Customer!.UserId, parcel.TrackingNumber, ct);

        await _audit.LogAsync("PARCEL_DISPATCHED", "Parcel", parcelId,
            null, new { Status = "OutForDelivery", driverId }, dispatcherId, null, ct);
    }

    // ── Mark Delivered ────────────────────────────────────────────────────────
    public async Task MarkDeliveredAsync(
        Guid deliveryId, ProofOfDeliveryDto pod,
        Guid driverId, CancellationToken ct = default)
    {
        var delivery = await _uow.Deliveries.GetByIdAsync(deliveryId, ct)
            ?? throw new NotFoundException("Delivery not found.");

        if (delivery.DriverId != driverId)
            throw new ForbiddenException("You are not assigned to this delivery.");

        var parcel = await GetOrThrowAsync(delivery.ParcelId, ct);

        delivery.Status                  = DeliveryStatus.Delivered;
        delivery.DeliveredAt             = DateTime.UtcNow;
        delivery.ProofOfDeliveryImagePath = pod.ImagePath;
        delivery.RecipientSignaturePath  = pod.SignaturePath;
        delivery.AttemptNotes            = pod.Notes;
        delivery.UpdatedAt               = DateTime.UtcNow;

        parcel.Status    = ParcelStatus.Delivered;
        parcel.UpdatedAt = DateTime.UtcNow;

        var driver = await _uow.Query<DriverProfile>().GetByIdAsync(driverId, ct);
        if (driver is not null) driver.Status = DriverStatus.Available;

        AddTrackingEvent(parcel, TrackingEventType.Delivered,
            "Parcel delivered successfully");

        _uow.Deliveries.Update(delivery);
        _uow.Parcels.Update(parcel);
        await _uow.SaveChangesAsync(ct);

        await _notificationService.SendDeliveredAsync(
            parcel.Customer!.UserId, parcel.TrackingNumber, ct);

        await _audit.LogAsync("PARCEL_DELIVERED", "Parcel", parcel.Id,
            null, new { Status = "Delivered" }, driverId, null, ct);
    }

    // ── Mark Failed ───────────────────────────────────────────────────────────
    public async Task MarkFailedAsync(
        Guid deliveryId, FailedDeliveryDto dto,
        Guid driverId, CancellationToken ct = default)
    {
        var delivery = await _uow.Deliveries.GetByIdAsync(deliveryId, ct)
            ?? throw new NotFoundException("Delivery not found.");

        if (delivery.DriverId != driverId)
            throw new ForbiddenException("You are not assigned to this delivery.");

        var parcel = await GetOrThrowAsync(delivery.ParcelId, ct);

        delivery.Status        = DeliveryStatus.Failed;
        delivery.FailureReason = dto.Reason;
        delivery.AttemptNotes  = dto.Notes;
        delivery.UpdatedAt     = DateTime.UtcNow;

        parcel.Status    = ParcelStatus.FailedDelivery;
        parcel.UpdatedAt = DateTime.UtcNow;

        var driver = await _uow.Query<DriverProfile>().GetByIdAsync(driverId, ct);
        if (driver is not null) driver.Status = DriverStatus.Available;

        AddTrackingEvent(parcel, TrackingEventType.DeliveryFailed,
            $"Delivery failed: {dto.Reason}");

        _uow.Deliveries.Update(delivery);
        _uow.Parcels.Update(parcel);
        await _uow.SaveChangesAsync(ct);

        await _notificationService.SendFailedDeliveryAsync(
            parcel.Customer!.UserId, parcel.TrackingNumber, dto.Reason.ToString(), ct);

        await _audit.LogAsync("DELIVERY_FAILED", "Delivery", deliveryId,
            null, new { dto.Reason, dto.Notes }, driverId, null, ct);
    }

    // ── Public Tracking (no auth required) ───────────────────────────────────
    public async Task<TrackingResultDto?> TrackAsync(
        string trackingNumber, CancellationToken ct = default)
    {
        var parcel = await _uow.Parcels
            .GetByTrackingNumberAsync(trackingNumber, ct);

        if (parcel is null) return null;

        return new TrackingResultDto(
            TrackingNumber: parcel.TrackingNumber,
            Status:         parcel.Status.ToString(),
            ServiceType:    parcel.ServiceType.ToString(),
            Destination:    $"{parcel.DeliveryAddress!.City}, {parcel.DeliveryAddress.Province}",
            EstimatedDelivery: parcel.EstimatedDeliveryDate,
            Events: parcel.TrackingEvents
                .OrderByDescending(e => e.OccurredAt)
                .Select(e => new TrackingEventDto(
                    e.EventType.ToString(),
                    e.Location,
                    e.Description,
                    e.OccurredAt,
                    e.Latitude,
                    e.Longitude))
                .ToList()
        );
    }

    // ── Get Detail ────────────────────────────────────────────────────────────
    public async Task<ParcelDetailDto?> GetDetailAsync(
        Guid id, CancellationToken ct = default)
    {
        var p = await _uow.Parcels.GetWithFullDetailsAsync(id, ct);
        return p is null ? null : MapToDetail(p);
    }

    // ── Paged List ────────────────────────────────────────────────────────────
    public async Task<PagedResult<ParcelSummaryDto>> GetPagedAsync(
    ParcelFilterDto filter, Guid customerId, CancellationToken ct = default)
    {
        var customer = await _uow.Query<CustomerProfile>()
            .FirstOrDefaultAsync(c => c.UserId == customerId, ct)
            ?? throw new NotFoundException("Customer profile not found.");

        var parcels = await _uow.Parcels
            .GetByCustomerAsync(customer.Id, filter.Page, filter.PageSize, ct);
        var count = await _uow.Parcels
            .CountAsync(p => p.CustomerId == customer.Id, ct);

        return new PagedResult<ParcelSummaryDto>(
            Items: parcels.Select(MapToSummary).ToList(),
            TotalCount: count,
            Page: filter.Page,
            PageSize: filter.PageSize
        );
    }
    // ── Helpers ───────────────────────────────────────────────────────────────
    private async Task<Parcel> GetOrThrowAsync(Guid id, CancellationToken ct)
        => await _uow.Parcels.GetByIdAsync(id, ct)
           ?? throw new NotFoundException($"Parcel {id} not found.");

    private static void EnsureStatus(Parcel parcel, ParcelStatus expected)
    {
        if (parcel.Status != expected)
            throw new BadRequestException(
                $"Expected status '{expected}' but parcel is '{parcel.Status}'.");
    }

    private static TrackingEvent AddTrackingEvent(
    Parcel parcel, TrackingEventType type, string description,
    string? location = null)
    {
        var trackingEvent = new TrackingEvent
        {
            Id = Guid.NewGuid(),
            ParcelId = parcel.Id,
            EventType = type,
            Description = description,
            Location = location,
            OccurredAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        parcel.TrackingEvents.Add(trackingEvent);
        return trackingEvent;
    }
    private async Task DebitWalletAsync(
        CustomerProfile customer, Parcel parcel, CancellationToken ct)
    {
        var amount = parcel.QuoteAmountZAR ?? 0;
        customer.WalletBalanceZAR -= amount;

        await _uow.WalletTransactions.AddAsync(new WalletTransaction
        {
            Id              = Guid.NewGuid(),
            UserId          = customer.UserId,
            Type            = WalletTransactionType.Debit,
            AmountZAR       = amount,
            BalanceAfterZAR = customer.WalletBalanceZAR,
            ReferenceId     = parcel.Id,
            ReferenceType   = "Parcel",
            Description     = $"Payment for parcel {parcel.TrackingNumber}",
            CreatedAt       = DateTime.UtcNow,
            UpdatedAt       = DateTime.UtcNow
        }, ct);
    }

    private static ParcelAddress MapAddress(CreateAddressDto dto) => new()
    {
        Id               = Guid.NewGuid(),
        RecipientName    = dto.RecipientName,
        RecipientPhone   = dto.RecipientPhone,
        RecipientEmail   = dto.RecipientEmail,
        StreetAddress    = dto.StreetAddress,
        Suburb           = dto.Suburb,
        City             = dto.City,
        Province         = dto.Province,
        PostalCode       = dto.PostalCode,
        Country          = dto.Country ?? "South Africa",
        SpecialInstructions = dto.SpecialInstructions,
        CreatedAt        = DateTime.UtcNow,
        UpdatedAt        = DateTime.UtcNow
    };

    private static ParcelSummaryDto MapToSummary(Parcel p) => new(
        p.Id, p.TrackingNumber, p.Status.ToString(), p.ServiceType.ToString(),
        p.DeliveryAddress?.City ?? "—", p.DeliveryAddress?.Province.ToString() ?? "—",
        p.WeightKg, p.QuoteAmountZAR, p.CreatedAt, p.EstimatedDeliveryDate);

    private static ParcelDetailDto MapToDetail(Parcel p) => new(
    p.Id, p.TrackingNumber, p.Status.ToString(), p.ServiceType.ToString(),
    p.WeightKg, p.Dimensions, p.DeclaredValueZAR, p.Description,
    p.SpecialInstructions, p.IsFragile, p.RequiresSignature, p.InsuranceRequired,
    p.QuoteAmountZAR, p.BarcodeImagePath, p.CreatedAt, p.EstimatedDeliveryDate,
    MapAddress(p.PickupAddress), MapAddress(p.DeliveryAddress),
    p.TrackingEvents.OrderByDescending(t => t.OccurredAt)
        .Select(t => new TrackingEventDto(
            t.EventType.ToString(), t.Location, t.Description,
            t.OccurredAt, t.Latitude, t.Longitude))
        .ToList(),
    p.ActiveDelivery is null ? null : new DeliveryDto(
        p.ActiveDelivery.Id,
        p.Id,
        p.TrackingNumber,
        p.ActiveDelivery.Status.ToString(),
        p.DeliveryAddress.RecipientName,
        p.DeliveryAddress.RecipientPhone,
        p.DeliveryAddress.StreetAddress,
        p.DeliveryAddress.City,
        p.DeliveryAddress.SpecialInstructions,
        p.IsFragile,
        p.ActiveDelivery.DispatchedAt
    ));

    private static ParcelAddressDto? MapAddress(ParcelAddress? addr) => addr is null ? null : new(
        addr.RecipientName, addr.RecipientPhone, addr.RecipientEmail,
        addr.StreetAddress, addr.Suburb, addr.City, addr.Province.ToString(), addr.PostalCode
    );

    // ── Driver deliveries ─────────────────────────────────────────────────────
    public async Task<IEnumerable<DeliveryDto>> GetDriverDeliveriesAsync(
        Guid driverId, CancellationToken ct = default)
    {
        var profile = await _uow.Query<DriverProfile>()
            .FirstOrDefaultAsync(d => d.UserId == driverId, ct)
            ?? throw new NotFoundException("Driver profile not found.");

        var deliveries = await _uow.Deliveries
            .GetDriverActiveDeliveriesAsync(profile.Id, ct);

        return deliveries.Select(d => new DeliveryDto(
            Id:                  d.Id,
            ParcelId:            d.ParcelId,
            TrackingNumber:      d.Parcel?.TrackingNumber ?? "—",
            Status:              d.Status.ToString(),
            RecipientName:       d.Parcel?.DeliveryAddress?.RecipientName ?? "—",
            RecipientPhone:      d.Parcel?.DeliveryAddress?.RecipientPhone ?? "—",
            DeliveryAddress:     $"{d.Parcel?.DeliveryAddress?.StreetAddress}, {d.Parcel?.DeliveryAddress?.Suburb}".Trim(',', ' '),
            City:                d.Parcel?.DeliveryAddress?.City ?? "—",
            SpecialInstructions: d.Parcel?.SpecialInstructions,
            IsFragile:           d.Parcel?.IsFragile ?? false,
            DispatchedAt:        d.DispatchedAt
        ));
    }

    // ── Update driver GPS location ────────────────────────────────────────────
    public async Task UpdateDriverLocationAsync(
        Guid driverId, decimal lat, decimal lng, CancellationToken ct = default)
    {
        var profile = await _uow.Query<DriverProfile>()
            .FirstOrDefaultAsync(d => d.UserId == driverId, ct);

        if (profile is null) return;   // silent — GPS pings should never crash the app

        profile.CurrentLatitude  = lat;
        profile.CurrentLongitude = lng;
        profile.UpdatedAt        = DateTime.UtcNow;

        await _uow.SaveChangesAsync(ct);
    }

    
}
