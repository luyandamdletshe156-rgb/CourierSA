using CourierSA.Application.DTOs.Parcels;
using CourierSA.Application.DTOs.Quotes;
using CourierSA.Application.DTOs.Sorting;
using CourierSA.Application.DTOs.Routing;
using CourierSA.Application.Interfaces.Repositories;
using CourierSA.Application.Interfaces.Services;
using CourierSA.Domain.Entities;
using CourierSA.Domain.Enums;
using CourierSA.Domain.Exceptions;
using Microsoft.EntityFrameworkCore;
using ZXing;

namespace CourierSA.Infrastructure.Services;

/// <summary>
/// Orchestrates the full parcel lifecycle:
/// Draft → Pending → Approved → AwaitingCheckIn → InWarehouse → InTransit → Delivered (or Failed)
/// </summary>
public class ParcelService : IParcelService
{
    private readonly IUnitOfWork _uow;
    private readonly IQuoteService _quoteService;
    private readonly IBarcodeService _barcodeService;
    private readonly INotificationService _notificationService;
    private readonly IAuditService _audit;
    private readonly ITrackingHubService _hubService;

    public ParcelService(
        IUnitOfWork uow,
        IQuoteService quoteService,
        IBarcodeService barcodeService,
        INotificationService notificationService,
        IAuditService audit,
        ITrackingHubService hubService)
    {
        _uow = uow;
        _quoteService = quoteService;
        _barcodeService = barcodeService;
        _notificationService = notificationService;
        _audit = audit;
        _hubService = hubService;
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
            quote = await _uow.Quotes.GetByIdAsync(dto.QuoteId.Value, ct);

            if (quote is null || quote.Status != QuoteStatus.Pending)
                throw new BadRequestException("Quote is invalid or has already been used.");
            if (quote.ExpiresAt < DateTime.UtcNow)
                throw new BadRequestException("Quote has expired. Please request a new quote.");

            finalQuoteAmount = quote.TotalAmountZAR;
        }
        else
        {
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

            var calculatedQuote = await _quoteService.CalculateAsync(quoteRequest, customer.UserId, ct);
            finalQuoteAmount = calculatedQuote.TotalAmountZAR;

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

        // 2b. Determine sorting zone from delivery postal code
        var deliveryPostalCode = int.TryParse(delivery.PostalCode, out var pc) ? pc : (int?)null;

        SortingZone? zone = null;
        if (deliveryPostalCode.HasValue)
        {
            var zoneRule = await _uow.Query<PostalCodeZoneRule>()
                .Query()
                .FirstOrDefaultAsync(r =>
                    deliveryPostalCode.Value >= r.PostalCodeFrom &&
                    deliveryPostalCode.Value <= r.PostalCodeTo, ct);

            zone = zoneRule?.Zone;
        }


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
            QuoteAmountZAR = finalQuoteAmount,
            Zone = zone,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        parcel.BarcodeImagePath = await _barcodeService.GenerateAsync(trackingNumber, ct);
        await _uow.Parcels.AddAsync(parcel, ct);

        // 4. Mark quote as used
        if (quote is not null)
        {
            quote.Status = QuoteStatus.Accepted;
            quote.ParcelId = parcel.Id;
            _uow.Quotes.Update(quote);
        }

        parcel.PaymentMethod = dto.PaymentMethod;

        switch (dto.PaymentMethod)
        {
            case PaymentMethod.Wallet:
                if (parcel.QuoteAmountZAR is null)
                    throw new BadRequestException("Cannot pay from wallet: No quote amount provided.");
                if (customer.WalletBalanceZAR < parcel.QuoteAmountZAR)
                    throw new BadRequestException("Insufficient wallet balance to book this parcel.");
                await DebitWalletAsync(customer, parcel, ct);
                parcel.IsPaid = true;
                parcel.PaidAt = DateTime.UtcNow;
                break;
            case PaymentMethod.Card:
            case PaymentMethod.EFT:
                parcel.IsPaid = true;
                parcel.PaidAt = DateTime.UtcNow;
                break;
            case PaymentMethod.CashOnCollection:
                parcel.IsPaid = false;
                break;
        }

        // 6. Save & Notify
        AddTrackingEvent(parcel, TrackingEventType.Booked, "Parcel booking confirmed", pickup.City);
        await _uow.SaveChangesAsync(ct);

        await _notificationService.SendParcelBookedAsync(customer.UserId, parcel.TrackingNumber, serviceType: parcel.ServiceType.ToString(), destinationCity: delivery.City, amountZAR: parcel.QuoteAmountZAR, ct: ct);
        await _audit.LogAsync("PARCEL_BOOKED", "Parcel", parcel.Id, null, new { parcel.TrackingNumber, parcel.Status }, customerId, null, ct);

        return await GetDetailAsync(parcel.Id, ct)
               ?? throw new InvalidOperationException("Failed to retrieve parcel after booking.");
    }

    // ── Approve ───────────────────────────────────────────────────────────────
    public async Task ApproveAsync(
        Guid parcelId, Guid staffId, CancellationToken ct = default)
    {
        var parcel = await GetOrThrowAsync(parcelId, ct);
        EnsureStatus(parcel, ParcelStatus.PendingApproval);

        parcel.Status = ParcelStatus.Approved;
        parcel.UpdatedAt = DateTime.UtcNow;

        var trackingEvent = AddTrackingEvent(parcel, TrackingEventType.Approved, "Booking approved by dispatcher");
        await _uow.TrackingEvents.AddAsync(trackingEvent, ct);
        await _uow.SaveChangesAsync(ct);

        await _hubService.NotifyParcelStatusChangedAsync(parcel.TrackingNumber, "Approved", ct: ct);
    }

    // ── Reject ────────────────────────────────────────────────────────────────
    public async Task RejectAsync(
        Guid parcelId, string reason, Guid staffId, CancellationToken ct = default)
    {
        var parcel = await GetOrThrowAsync(parcelId, ct);
        EnsureStatus(parcel, ParcelStatus.PendingApproval);

        parcel.Status = ParcelStatus.Cancelled;
        parcel.UpdatedAt = DateTime.UtcNow;

        var trackingEvent = AddTrackingEvent(parcel, TrackingEventType.Cancelled, $"Booking rejected: {reason}");
        await _uow.TrackingEvents.AddAsync(trackingEvent, ct);
        await _uow.SaveChangesAsync(ct);
    }

    // ── Check In at Warehouse ─────────────────────────────────────────────────
    // ── Check In at Warehouse ─────────────────────────────────────────────────
    public async Task CheckInAsync(
        Guid parcelId, Guid sortingBinId,
        Guid staffId, CancellationToken ct = default)
    {
        var parcel = await GetOrThrowAsync(parcelId, ct);
        EnsureStatus(parcel, ParcelStatus.AwaitingCheckIn);

        var bin = await _uow.Query<SortingBin>().GetByIdAsync(sortingBinId, ct)
            ?? throw new NotFoundException("Sorting bin not found.");

        if (!bin.IsActive)
            throw new BadRequestException("This sorting bin is inactive and cannot be used.");

        var assignment = await _uow.Query<ParcelSortingAssignment>()
            .Query()
            .FirstOrDefaultAsync(a => a.ParcelId == parcel.Id, ct);

        if (assignment is null)
        {
            assignment = new ParcelSortingAssignment
            {
                Id = Guid.NewGuid(),
                ParcelId = parcel.Id,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            await _uow.Query<ParcelSortingAssignment>().AddAsync(assignment, ct);
        }

        assignment.ConfirmedBinId = bin.Id;
        assignment.ConfirmedAt = DateTime.UtcNow;
        assignment.ConfirmedByStaffId = staffId;
        assignment.UpdatedAt = DateTime.UtcNow;

        bin.CurrentCount += 1;
        bin.UpdatedAt = DateTime.UtcNow;

        parcel.Status = ParcelStatus.InWarehouse;
        parcel.UpdatedAt = DateTime.UtcNow;

        var trackingEvent = AddTrackingEvent(
            parcel, TrackingEventType.ReceivedAtWarehouse,
            "Parcel received at warehouse", bin.BinCode);
        await _uow.TrackingEvents.AddAsync(trackingEvent, ct);

        await _uow.SaveChangesAsync(ct);

        await _hubService.NotifyParcelStatusChangedAsync(parcel.TrackingNumber, "InWarehouse", bin.BinCode, ct);
    }


    // ── Checkout ──────────────────────────────────────────────────────────────
    public async Task CheckoutAsync(Guid parcelId, Guid staffId, CancellationToken ct = default)
    {
        var parcel = await GetOrThrowAsync(parcelId, ct);
        EnsureStatus(parcel, ParcelStatus.InWarehouse);

        parcel.Status = ParcelStatus.CheckedOut;
        parcel.UpdatedAt = DateTime.UtcNow;

        var trackingEvent = AddTrackingEvent(
            parcel, TrackingEventType.CheckedOut, "Parcel checked out — ready for dispatch");
        await _uow.TrackingEvents.AddAsync(trackingEvent, ct);

        await _uow.SaveChangesAsync(ct);

        await _audit.LogAsync("PARCEL_CHECKED_OUT", "Parcel", parcelId,
            null, new { parcel.Status }, staffId, null, ct);

        await _hubService.NotifyParcelStatusChangedAsync(parcel.TrackingNumber, "CheckedOut", ct: ct);
    }

    // ── Log Inspection (CheckIn or Checkout stage) ───────────────────────────────
    public async Task<ParcelInspectionDto> LogInspectionAsync(
        Guid parcelId, LogParcelInspectionDto dto, Guid staffId, CancellationToken ct = default)
    {
        var parcel = await _uow.Parcels.GetWithFullDetailsAsync(parcelId, ct)
            ?? throw new NotFoundException($"Parcel {parcelId} not found.");

        var inspection = new ParcelInspection
        {
            Id = Guid.NewGuid(),
            ParcelId = parcel.Id,
            Stage = dto.Stage,
            Result = dto.Result,
            StaffId = staffId,
            PackagingIntact = dto.PackagingIntact,
            NoMoistureDamage = dto.NoMoistureDamage,
            WeightMatchesDeclared = dto.WeightMatchesDeclared,
            FragileHandlingOk = dto.FragileHandlingOk,
            SealIntact = dto.SealIntact,
            Notes = dto.Notes,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        await _uow.Query<ParcelInspection>().AddAsync(inspection, ct);
        await _uow.SaveChangesAsync(ct);

        // Non-blocking: Damaged/Rejected never stops checkout, but does flag + notify + claim
        if (dto.Result != ParcelInspectionResult.Pass)
        {
            var trackingEvent = AddTrackingEvent(parcel, TrackingEventType.ExceptionRaised,
                $"{dto.Stage} inspection flagged: {dto.Result}" +
                (string.IsNullOrWhiteSpace(dto.Notes) ? "" : $" — {dto.Notes}"));
            await _uow.TrackingEvents.AddAsync(trackingEvent, ct);
            await _uow.SaveChangesAsync(ct);

            if (parcel.Customer is not null)
            {
                try
                {
                    await _notificationService.SendParcelDamagedAsync(
                        parcel.Customer.UserId, parcel.TrackingNumber, dto.Stage.ToString(), ct);
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[NOTIFY] Damaged notification failed: {ex.Message}");
                }
            }

            if (parcel.InsuranceRequired && dto.Result == ParcelInspectionResult.Damaged)
            {
                var claim = new InsuranceClaim
                {
                    Id = Guid.NewGuid(),
                    ParcelId = parcel.Id,
                    CustomerId = parcel.CustomerId,
                    ClaimNumber = $"CLM-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString()[..6].ToUpper()}",
                    Type = ClaimType.Damage,
                    Status = ClaimStatus.Submitted,
                    ClaimedAmountZAR = parcel.DeclaredValueZAR ?? 0,
                    Description = $"Auto-logged from {dto.Stage} inspection." +
                                  (string.IsNullOrWhiteSpace(dto.Notes) ? "" : $" {dto.Notes}"),
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };
                await _uow.Query<InsuranceClaim>().AddAsync(claim, ct);
                await _uow.SaveChangesAsync(ct);
            }
        }

        await _audit.LogAsync("PARCEL_INSPECTED", "Parcel", parcel.Id,
            null, new { dto.Stage, dto.Result }, staffId, null, ct);

        return new ParcelInspectionDto(
            inspection.Id, parcel.Id, parcel.TrackingNumber,
            inspection.Stage.ToString(), inspection.Result.ToString(),
            inspection.PackagingIntact, inspection.NoMoistureDamage, inspection.WeightMatchesDeclared,
            inspection.FragileHandlingOk, inspection.SealIntact, inspection.Notes, inspection.CreatedAt
        );
    }

    // ── List Inspections (for the Inspections page) ──────────────────────────────
    public async Task<IEnumerable<ParcelInspectionDto>> GetInspectionsAsync(CancellationToken ct = default)
    {
        var inspections = await _uow.Query<ParcelInspection>()
            .Query()
            .AsNoTracking()
            .Include(i => i.Parcel)
            .OrderByDescending(i => i.CreatedAt)
            .Take(200)
            .ToListAsync(ct);

        return inspections.Select(i => new ParcelInspectionDto(
            i.Id, i.ParcelId, i.Parcel?.TrackingNumber ?? "—",
            i.Stage.ToString(), i.Result.ToString(),
            i.PackagingIntact, i.NoMoistureDamage, i.WeightMatchesDeclared,
            i.FragileHandlingOk, i.SealIntact, i.Notes, i.CreatedAt
        ));
    }


    // ── Get or Create Sorting Suggestion (for check-in modal) ──────────────────
    public async Task<SortingSuggestionDto> GetSortingSuggestionAsync(
        Guid parcelId, CancellationToken ct = default)
    {
        var parcel = await GetOrThrowAsync(parcelId, ct);

        var assignment = await _uow.Query<ParcelSortingAssignment>()
            .Query()
            .FirstOrDefaultAsync(a => a.ParcelId == parcel.Id, ct);

        if (assignment is null)
        {
            SortingBin? bestBin = null;

            if (parcel.Zone.HasValue)
            {
                bestBin = await _uow.Query<SortingBin>()
                    .Query()
                    .Where(b => b.IsActive &&
                                b.Zone == parcel.Zone.Value &&
                                b.CurrentCount < b.Capacity)
                    .OrderBy(b => b.CurrentCount)
                    .FirstOrDefaultAsync(ct);
            }

            assignment = new ParcelSortingAssignment
            {
                Id = Guid.NewGuid(),
                ParcelId = parcel.Id,
                SuggestedBinId = bestBin?.Id,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            await _uow.Query<ParcelSortingAssignment>().AddAsync(assignment, ct);
            await _uow.SaveChangesAsync(ct);
        }

        var allBins = await _uow.Query<SortingBin>()
            .Query()
            .AsNoTracking()
            .Where(b => b.IsActive)
            .OrderBy(b => b.Zone).ThenBy(b => b.BinCode)
            .Select(b => new SortingBinDto(
                b.Id, b.BinCode, b.Zone.ToString(), b.Capacity, b.CurrentCount))
            .ToListAsync(ct);

        return new SortingSuggestionDto(
            ParcelId: parcel.Id,
            ParcelZone: parcel.Zone?.ToString(),
            SuggestedBinId: assignment.SuggestedBinId,
            Bins: allBins
        );
    }
    // ── Dispatch ──────────────────────────────────────────────────────────────
    public async Task DispatchAsync(
        Guid parcelId, Guid driverId,
        Guid dispatcherId, CancellationToken ct = default)
    {
        var parcel = await _uow.Parcels.GetWithFullDetailsAsync(parcelId, ct)
            ?? throw new NotFoundException($"Parcel {parcelId} not found.");

        // CHANGED: InWarehouse → CheckedOut. Approved (pickup leg) untouched.
        if (parcel.Status != ParcelStatus.CheckedOut &&
            parcel.Status != ParcelStatus.Approved)
            throw new BadRequestException(
                $"Cannot dispatch parcel in status '{parcel.Status}'.");

        if (parcel.Customer is null)
            throw new InvalidOperationException(
                $"Parcel {parcel.TrackingNumber} has no linked customer profile.");

        var driver = await _uow.Query<DriverProfile>().GetByIdAsync(driverId, ct)
            ?? throw new NotFoundException("Driver not found.");

        if (driver.Status is DriverStatus.OffDuty or DriverStatus.Suspended)
            throw new BadRequestException("Driver is off duty or suspended and cannot be dispatched.");

        var isPickup = parcel.Status == ParcelStatus.Approved;

        var delivery = new Delivery
        {
            Id = Guid.NewGuid(),
            ParcelId = parcel.Id,
            DriverId = driverId,
            Status = DeliveryStatus.Assigned,
            DispatchedAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        if (!isPickup)
        {
            parcel.Status = ParcelStatus.OutForDelivery;

            // Release the parcel from its warehouse bin — it's leaving the building
            var assignment = await _uow.Query<ParcelSortingAssignment>()
                .Query()
                .FirstOrDefaultAsync(a => a.ParcelId == parcel.Id && a.ConfirmedBinId != null, ct);

            if (assignment?.ConfirmedBinId is not null)
            {
                var bin = await _uow.Query<SortingBin>().GetByIdAsync(assignment.ConfirmedBinId.Value, ct);
                if (bin is not null && bin.CurrentCount > 0)
                {
                    bin.CurrentCount -= 1;
                    bin.UpdatedAt = DateTime.UtcNow;
                }

                assignment.ReleasedAt = DateTime.UtcNow;
                assignment.UpdatedAt = DateTime.UtcNow;
            }
        }

        parcel.UpdatedAt = DateTime.UtcNow;

        // FIX: Update driver status using EF Tracking instead of ExecuteUpdateAsync
        // which was causing the Map synchronization lock-up
        driver.Status = DriverStatus.OnDelivery;
        driver.UpdatedAt = DateTime.UtcNow;

        await _uow.Deliveries.AddAsync(delivery, ct);

        var trackingEvent = new TrackingEvent
        {
            Id = Guid.NewGuid(),
            ParcelId = parcel.Id,
            EventType = TrackingEventType.OutForDelivery,
            Description = isPickup
                ? $"Dispatched to driver {driver.User?.FullName ?? driverId.ToString()} for pickup"
                : $"Dispatched to driver {driver.User?.FullName ?? driverId.ToString()} for delivery",
            OccurredAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        await _uow.TrackingEvents.AddAsync(trackingEvent, ct);

        try
        {
            await _uow.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException ex)
        {
            var failedTypes = ex.Entries.Select(e => e.Entity.GetType().Name).Distinct();
            var failedEntitiesStr = string.Join(", ", failedTypes);
            throw new BadRequestException(
                $"The {failedEntitiesStr} was updated by another process. Please refresh and try again.");
        }

        await _audit.LogAsync("PARCEL_DISPATCHED", "Parcel", parcelId,
            null, new { Status = parcel.Status.ToString(), driverId }, dispatcherId, null, ct);

        await _hubService.NotifyParcelStatusChangedAsync(parcel.TrackingNumber, parcel.Status.ToString(), ct: ct);
    }


    // ── Dispatch Route (multi-parcel, single zone) ──────────────────────────────
    public async Task<RouteSummaryDto> DispatchRouteAsync(
        CreateRouteDto dto, Guid dispatcherId, CancellationToken ct = default)
    {
        if (dto.ParcelIds is null || dto.ParcelIds.Count == 0)
            throw new BadRequestException("At least one parcel must be selected.");

        var parcels = await _uow.Query<Parcel>()
            .Query()
            .Include(p => p.DeliveryAddress)
            .Where(p => dto.ParcelIds.Contains(p.Id))
            .ToListAsync(ct);

        if (parcels.Count != dto.ParcelIds.Count)
            throw new NotFoundException("One or more parcels not found.");

        foreach (var p in parcels)
        {
            // CHANGED: InWarehouse → CheckedOut, matching DispatchAsync's delivery-leg gate
            if (p.Status != ParcelStatus.CheckedOut)
                throw new BadRequestException(
                    $"Parcel {p.TrackingNumber} is not CheckedOut (status: {p.Status}).");
        }

        var zones = parcels.Select(p => p.Zone).Distinct().ToList();
        if (zones.Count != 1 || zones[0] is null)
            throw new BadRequestException("All parcels in a route must share the same zone.");

        var zone = zones[0]!.Value;

        var driver = await _uow.Query<DriverProfile>().GetByIdAsync(dto.DriverId, ct)
            ?? throw new NotFoundException("Driver not found.");

        if (driver.Status is DriverStatus.OffDuty or DriverStatus.Suspended)
            throw new BadRequestException("Driver is off duty or suspended and cannot be dispatched.");

        var route = new DeliveryRoute
        {
            Id = Guid.NewGuid(),
            DriverId = driver.Id,
            Zone = zone,
            Status = RouteStatus.InProgress,
            DispatchedAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        await _uow.Query<DeliveryRoute>().AddAsync(route, ct);

        var stops = new List<RouteStopDto>();

        foreach (var parcel in parcels)
        {
            var delivery = new Delivery
            {
                Id = Guid.NewGuid(),
                ParcelId = parcel.Id,
                DriverId = driver.Id,
                RouteId = route.Id,
                Status = DeliveryStatus.Assigned,
                DispatchedAt = DateTime.UtcNow,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            await _uow.Deliveries.AddAsync(delivery, ct);

            parcel.Status = ParcelStatus.OutForDelivery;
            parcel.UpdatedAt = DateTime.UtcNow;

            // Release the parcel's warehouse bin — identical to DispatchAsync's non-pickup branch
            var assignment = await _uow.Query<ParcelSortingAssignment>()
                .Query()
                .FirstOrDefaultAsync(a => a.ParcelId == parcel.Id && a.ConfirmedBinId != null, ct);

            if (assignment?.ConfirmedBinId is not null)
            {
                var bin = await _uow.Query<SortingBin>().GetByIdAsync(assignment.ConfirmedBinId.Value, ct);
                if (bin is not null && bin.CurrentCount > 0)
                {
                    bin.CurrentCount -= 1;
                    bin.UpdatedAt = DateTime.UtcNow;
                }
                assignment.ReleasedAt = DateTime.UtcNow;
                assignment.UpdatedAt = DateTime.UtcNow;
            }

            var trackingEvent = new TrackingEvent
            {
                Id = Guid.NewGuid(),
                ParcelId = parcel.Id,
                EventType = TrackingEventType.OutForDelivery,
                Description = $"Dispatched to driver {driver.User?.FullName ?? driver.Id.ToString()} " +
                              $"as part of a {parcels.Count}-stop {zone} zone route",
                OccurredAt = DateTime.UtcNow,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            await _uow.TrackingEvents.AddAsync(trackingEvent, ct);

            stops.Add(new RouteStopDto(
                delivery.Id, parcel.Id, parcel.TrackingNumber, delivery.Status.ToString(),
                parcel.DeliveryAddress?.RecipientName ?? "—",
                $"{parcel.DeliveryAddress?.StreetAddress}, {parcel.DeliveryAddress?.Suburb}".Trim(',', ' '),
                parcel.DeliveryAddress?.City ?? "—"
            ));
        }

        driver.Status = DriverStatus.OnDelivery;
        driver.UpdatedAt = DateTime.UtcNow;

        try
        {
            await _uow.SaveChangesAsync(ct);
        }
        catch (DbUpdateConcurrencyException ex)
        {
            var failedTypes = ex.Entries.Select(e => e.Entity.GetType().Name).Distinct();
            throw new BadRequestException(
                $"The {string.Join(", ", failedTypes)} was updated by another process. Please refresh and try again.");
        }

        await _audit.LogAsync("ROUTE_DISPATCHED", "DeliveryRoute", route.Id,
            null, new { ParcelCount = parcels.Count, Zone = zone.ToString(), DriverId = driver.Id },
            dispatcherId, null, ct);

        foreach (var parcel in parcels)
        {
            await _hubService.NotifyParcelStatusChangedAsync(parcel.TrackingNumber, "OutForDelivery", ct: ct);
        }

        return new RouteSummaryDto(route.Id, zone.ToString(), route.Status.ToString(), route.DispatchedAt, stops);
    }
    // ── Mark Delivered ────────────────────────────────────────────────────────
    public async Task MarkDeliveredAsync(
     Guid deliveryId, ProofOfDeliveryDto pod,
     Guid driverUserId, CancellationToken ct = default)
    {
        var driverProfile = await _uow.Query<DriverProfile>()
            .FirstOrDefaultAsync(d => d.UserId == driverUserId, ct)
            ?? throw new NotFoundException("Driver profile not found.");

        var delivery = await _uow.Deliveries.GetByIdAsync(deliveryId, ct)
            ?? throw new NotFoundException("Delivery not found.");

        if (delivery.DriverId != driverProfile.Id)
            throw new ForbiddenException("You are not assigned to this delivery.");

        var parcel = await _uow.Parcels.GetWithFullDetailsAsync(delivery.ParcelId, ct)
            ?? throw new NotFoundException($"Parcel {delivery.ParcelId} not found.");

        var isPickup = parcel.Status == ParcelStatus.Approved;

        delivery.Status = DeliveryStatus.Delivered;
        delivery.DeliveredAt = DateTime.UtcNow;
        delivery.ProofOfDeliveryImagePath = pod.ImagePath;
        delivery.RecipientSignaturePath = pod.SignaturePath;
        delivery.AttemptNotes = pod.Notes;
        delivery.UpdatedAt = DateTime.UtcNow;

        if (!isPickup)
        {
            parcel.Status = ParcelStatus.Delivered;
        }
        else
        {
            // FIX: Transition collected parcel to awaiting check-in queue for warehouse
            parcel.Status = ParcelStatus.AwaitingCheckIn;
        }

        parcel.UpdatedAt = DateTime.UtcNow;

        var hasOtherActiveDeliveries = await _uow.Deliveries
            .Query()
            .AnyAsync(d => d.DriverId == driverProfile.Id &&
                           d.Id != delivery.Id &&
                           (d.Status == DeliveryStatus.Assigned || d.Status == DeliveryStatus.InProgress),
                      ct);

        if (!hasOtherActiveDeliveries)
        {
            // FIX: Removed EF raw SQL execution logic
            driverProfile.Status = DriverStatus.Available;
            driverProfile.UpdatedAt = DateTime.UtcNow;
        }

        var trackingEvent = new TrackingEvent
        {
            Id = Guid.NewGuid(),
            ParcelId = parcel.Id,
            EventType = TrackingEventType.Delivered,
            Description = isPickup
                ? "Parcel collected from sender and dropped off at warehouse. Awaiting check-in."
                : "Parcel delivered successfully",
            OccurredAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        await _uow.TrackingEvents.AddAsync(trackingEvent, ct);

        await CheckRouteCompletionAsync(delivery.RouteId, ct);

        // EF Core will now properly persist the driver status alongside the parcel/delivery update
        await _uow.SaveChangesAsync(ct);

        if (!isPickup)
        {
            try
            {
                await _notificationService.SendDeliveredAsync(
                    parcel.Customer!.UserId, parcel.TrackingNumber, ct);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[NOTIFY] Delivered notification failed: {ex.Message}");
            }
        }

        try
        {
            await _audit.LogAsync(isPickup ? "PICKUP_COMPLETED" : "PARCEL_DELIVERED", "Parcel", parcel.Id,
                null, new { Status = parcel.Status.ToString() }, driverUserId, null, ct);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[AUDIT] Log failed for {parcel.TrackingNumber}: {ex.Message}");
        }

        try
        {
            await _hubService.NotifyParcelStatusChangedAsync(parcel.TrackingNumber, parcel.Status.ToString(), ct: ct);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[HUB] SignalR notify failed for {parcel.TrackingNumber}: {ex.Message}");
        }
    }

    // ── Mark Failed ───────────────────────────────────────────────────────────
    public async Task MarkFailedAsync(
    Guid deliveryId, FailedDeliveryDto dto,
    Guid driverUserId, CancellationToken ct = default)
    {
        var driverProfile = await _uow.Query<DriverProfile>()
            .FirstOrDefaultAsync(d => d.UserId == driverUserId, ct)
            ?? throw new NotFoundException("Driver profile not found.");

        var delivery = await _uow.Deliveries.GetByIdAsync(deliveryId, ct)
            ?? throw new NotFoundException("Delivery not found.");

        if (delivery.DriverId != driverProfile.Id)
            throw new ForbiddenException("You are not assigned to this delivery.");

        var parcel = await _uow.Parcels.GetWithFullDetailsAsync(delivery.ParcelId, ct)
            ?? throw new NotFoundException($"Parcel {delivery.ParcelId} not found.");

        // Determine which leg of the journey failed
        var isPickup = parcel.Status == ParcelStatus.Approved;

        delivery.Status = DeliveryStatus.Failed;
        delivery.FailureReason = dto.Reason;
        delivery.AttemptNotes = dto.Notes;
        delivery.UpdatedAt = DateTime.UtcNow;

        if (!isPickup)
        {
            parcel.Status = ParcelStatus.FailedDelivery;
        }

        parcel.UpdatedAt = DateTime.UtcNow;

        var hasOtherActiveDeliveries = await _uow.Deliveries
            .Query()
            .AnyAsync(d => d.DriverId == driverProfile.Id &&
                           d.Id != delivery.Id &&
                           (d.Status == DeliveryStatus.Assigned || d.Status == DeliveryStatus.InProgress),
                      ct);

        if (!hasOtherActiveDeliveries)
        {
            // FIX: Removed EF raw SQL execution logic
            driverProfile.Status = DriverStatus.Available;
            driverProfile.UpdatedAt = DateTime.UtcNow;
        }

        var trackingEvent = new TrackingEvent
        {
            Id = Guid.NewGuid(),
            ParcelId = parcel.Id,
            EventType = TrackingEventType.DeliveryFailed,
            Description = isPickup ? $"Pickup failed: {dto.Reason}" : $"Delivery failed: {dto.Reason}",
            OccurredAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        await _uow.TrackingEvents.AddAsync(trackingEvent, ct);

        await CheckRouteCompletionAsync(delivery.RouteId, ct);

        await _uow.SaveChangesAsync(ct);

        try
        {
            await _notificationService.SendFailedDeliveryAsync(
                parcel.Customer!.UserId, parcel.TrackingNumber, dto.Reason.ToString(), ct);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[NOTIFY] Failed-delivery notification failed: {ex.Message}");
        }

        try
        {
            await _audit.LogAsync("DELIVERY_FAILED", "Delivery", deliveryId,
                null, new { dto.Reason, dto.Notes }, driverUserId, null, ct);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[AUDIT] Log failed for {parcel.TrackingNumber}: {ex.Message}");
        }

        try
        {
            await _hubService.NotifyParcelStatusChangedAsync(parcel.TrackingNumber,
                isPickup ? "Approved" : "FailedDelivery", ct: ct);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[HUB] SignalR notify failed for {parcel.TrackingNumber}: {ex.Message}");
        }
    }

    // ── Public Tracking (no auth required) ───────────────────────────────────
    public async Task<TrackingResultDto?> TrackAsync(
        string trackingNumber, CancellationToken ct = default)
    {
        var parcel = await _uow.Parcels.GetByTrackingNumberAsync(trackingNumber, ct);
        if (parcel is null) return null;

        return new TrackingResultDto(
            TrackingNumber: parcel.TrackingNumber,
            Status: parcel.Status.ToString(),
            ServiceType: parcel.ServiceType.ToString(),
            Destination: $"{parcel.DeliveryAddress!.City}, {parcel.DeliveryAddress.Province}",
            EstimatedDelivery: parcel.EstimatedDeliveryDate,
            Events: parcel.TrackingEvents
                .OrderByDescending(e => e.OccurredAt)
                .Select(e => new TrackingEventDto(
                    e.EventType.ToString(), e.Location, e.Description, e.OccurredAt, e.Latitude, e.Longitude))
                .ToList()
        );
    }

    // ── Private Tracking (authenticated, richer detail) ────────────────────────
    public async Task<ParcelDetailDto?> GetPrivateTrackingAsync(
        string trackingNumber, Guid requestingUserId, CancellationToken ct = default)
    {
        var parcel = await _uow.Parcels.GetByTrackingNumberAsync(trackingNumber, ct);
        if (parcel is null) return null;

        var full = await _uow.Parcels.GetWithFullDetailsAsync(parcel.Id, ct);
        if (full is null) return null;

        var requestingUser = await _uow.Users.GetByIdAsync(requestingUserId, ct);
        var isStaff = requestingUser?.Role is UserRole.Dispatcher
    or UserRole.Administrator
    or UserRole.WarehouseStaff;

        if (!isStaff && full.Customer?.UserId != requestingUserId)
            return null;

        var detail = MapToDetail(full);

        DeliveryDto? enrichedDelivery = detail.ActiveDelivery;
        if (full.ActiveDelivery is not null)
        {
            var driver = await _uow.Query<DriverProfile>()
                .Query()
                .Include(d => d.User)
                .FirstOrDefaultAsync(d => d.Id == full.ActiveDelivery.DriverId, ct);

            if (driver?.User is not null)
            {
                enrichedDelivery = detail.ActiveDelivery with
                {
                    DriverName = driver.User.FullName,
                    DriverPhone = driver.User.PhoneNumber
                };
            }
        }

        var claim = await _uow.Query<InsuranceClaim>()
            .Query()
            .Where(c => c.ParcelId == full.Id)
            .OrderByDescending(c => c.CreatedAt)
            .FirstOrDefaultAsync(ct);

        return detail with
        {
            ActiveDelivery = enrichedDelivery,
            PaymentMethod = full.PaymentMethod.ToString(),
            IsPaid = full.IsPaid,
            PaidAt = full.PaidAt,
            ClaimStatus = claim?.Status.ToString()
        };
    }

    // ── Get Detail ────────────────────────────────────────────────────────────
    public async Task<ParcelDetailDto?> GetDetailAsync(
        Guid id, CancellationToken ct = default)
    {
        var p = await _uow.Parcels.GetWithFullDetailsAsync(id, ct);
        return p is null ? null : MapToDetail(p);
    }

    // ── Paged List (Customer-Scoped) ──────────────────────────────────────────
    public async Task<PagedResult<ParcelSummaryDto>> GetPagedAsync(
        ParcelFilterDto filter, Guid customerId, CancellationToken ct = default)
    {
        // 1. Fetch customer profile
        var customer = await _uow.Query<CustomerProfile>()
            .Query()
            .FirstOrDefaultAsync(c => c.UserId == customerId, ct);

        // 🔴 Fallback: If user is Admin/Staff (no CustomerProfile), return the full queue
        if (customer is null)
        {
            return await GetQueueAsync(filter, ct);
        }

        // 2. Query parcels owned by this customer
        var query = _uow.Query<Parcel>()
            .Query()
            .AsNoTracking()
            .Include(p => p.DeliveryAddress)
            .Where(p => p.CustomerId == customer.Id);

        // 3. Apply status filter if provided
        if (!string.IsNullOrWhiteSpace(filter.Status) &&
            Enum.TryParse<ParcelStatus>(filter.Status, true, out var statusEnum))
        {
            query = query.Where(p => p.Status == statusEnum);
        }

        // 4. Apply search filter if provided
        if (!string.IsNullOrWhiteSpace(filter.Search))
        {
            var search = filter.Search.Trim().ToLower();
            query = query.Where(p =>
                p.TrackingNumber.ToLower().Contains(search) ||
                (p.DeliveryAddress != null && p.DeliveryAddress.City.ToLower().Contains(search)));
        }

        var count = await query.CountAsync(ct);

        var page = filter.Page <= 0 ? 1 : filter.Page;
        var pageSize = filter.PageSize <= 0 ? 10 : filter.PageSize;

        var parcels = await query
            .OrderByDescending(p => p.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        return new PagedResult<ParcelSummaryDto>(
            Items: parcels.Select(p => MapToSummary(p)).ToList(),
            TotalCount: count,
            Page: page,
            PageSize: pageSize
        );
    }

    // ── Paged Queue (Dispatcher/Admin/Staff) ───────────────────────────────────
    public async Task<PagedResult<ParcelSummaryDto>> GetQueueAsync(
        ParcelFilterDto filter, CancellationToken ct = default)
    {
        var query = _uow.Query<Parcel>()
            .Query()
            .AsNoTracking()
            .Include(p => p.DeliveryAddress)
            .Include(p => p.PickupAddress)
            .AsQueryable();

        // 1. Apply status filter if provided
        if (!string.IsNullOrWhiteSpace(filter.Status) &&
            Enum.TryParse<ParcelStatus>(filter.Status, true, out var statusEnum))
        {
            query = query.Where(p => p.Status == statusEnum);
        }

        // 2. Apply search filter if provided
        if (!string.IsNullOrWhiteSpace(filter.Search))
        {
            var search = filter.Search.Trim().ToLower();
            query = query.Where(p =>
                p.TrackingNumber.ToLower().Contains(search) ||
                (p.DeliveryAddress != null && p.DeliveryAddress.City.ToLower().Contains(search)));
        }

        query = query.OrderByDescending(p => p.CreatedAt);

        var count = await query.CountAsync(ct);

        var page = filter.Page <= 0 ? 1 : filter.Page;
        var pageSize = filter.PageSize <= 0 ? 20 : filter.PageSize;

        var parcels = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(ct);

        Dictionary<Guid, string> binCodesByParcelId = new();
        if ((string.Equals(filter.Status, "InWarehouse", StringComparison.OrdinalIgnoreCase) ||
             string.Equals(filter.Status, "CheckedOut", StringComparison.OrdinalIgnoreCase))
            && parcels.Count > 0)
        {
            var parcelIds = parcels.Select(p => p.Id).ToList();

            binCodesByParcelId = await _uow.Query<ParcelSortingAssignment>()
                .Query()
                .AsNoTracking()
                .Where(a => parcelIds.Contains(a.ParcelId) &&
                            a.ConfirmedBinId != null &&
                            a.ReleasedAt == null)
                .Join(_uow.Query<SortingBin>().Query().AsNoTracking(),
                      a => a.ConfirmedBinId,
                      b => b.Id,
                      (a, b) => new { a.ParcelId, b.BinCode })
                .ToDictionaryAsync(x => x.ParcelId, x => x.BinCode, ct);
        }

        return new PagedResult<ParcelSummaryDto>(
            Items: parcels.Select(p => MapToSummary(
                       p, binCodesByParcelId.GetValueOrDefault(p.Id))).ToList(),
            TotalCount: count,
            Page: page,
            PageSize: pageSize
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
            Id = Guid.NewGuid(),
            UserId = customer.UserId,
            Type = WalletTransactionType.Debit,
            AmountZAR = amount,
            BalanceAfterZAR = customer.WalletBalanceZAR,
            ReferenceId = parcel.Id,
            ReferenceType = "Parcel",
            Description = $"Payment for parcel {parcel.TrackingNumber}",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        }, ct);
    }

    private static ParcelAddress MapAddress(CreateAddressDto dto) => new()
    {
        Id = Guid.NewGuid(),
        RecipientName = dto.RecipientName,
        RecipientPhone = dto.RecipientPhone,
        RecipientEmail = dto.RecipientEmail,
        StreetAddress = dto.StreetAddress,
        Suburb = dto.Suburb,
        City = dto.City,
        Province = dto.Province,
        PostalCode = dto.PostalCode,
        Country = dto.Country ?? "South Africa",
        SpecialInstructions = dto.SpecialInstructions,
        CreatedAt = DateTime.UtcNow,
        UpdatedAt = DateTime.UtcNow
    };





    private static ParcelSummaryDto MapToSummary(Parcel p, string? binCode = null) => new(
      p.Id, p.TrackingNumber, p.Status.ToString(), p.ServiceType.ToString(),
      p.DeliveryAddress?.City ?? "—", p.DeliveryAddress?.Province.ToString() ?? "—",
      p.WeightKg, p.QuoteAmountZAR, p.CreatedAt, p.EstimatedDeliveryDate,
      binCode, p.Zone?.ToString());   // ← added p.Zone?.ToString()




    private static ParcelDetailDto MapToDetail(Parcel p)
    {
        bool isPickup = p.Status == ParcelStatus.Approved;
        var targetAddress = isPickup ? p.PickupAddress : p.DeliveryAddress;

        return new(
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
                targetAddress?.RecipientName ?? "—",
                targetAddress?.RecipientPhone ?? "—",
                $"{targetAddress?.StreetAddress}, {targetAddress?.Suburb}".Trim(',', ' '),
                targetAddress?.City ?? "—",
                p.SpecialInstructions,
                p.IsFragile,
                p.ActiveDelivery.DispatchedAt,
                isPickup // <--- Added IsPickup mapping
            ));
    }

    private static ParcelAddressDto? MapAddress(ParcelAddress? addr) => addr is null ? null : new(
        addr.RecipientName, addr.RecipientPhone, addr.RecipientEmail,
        addr.StreetAddress, addr.Suburb, addr.City, addr.Province.ToString(), addr.PostalCode
    );

    // ── Driver deliveries (Fixes map routing for pickups vs deliveries) ──────
    public async Task<IEnumerable<DeliveryDto>> GetDriverDeliveriesAsync(
        Guid driverId, CancellationToken ct = default)
    {
        var profile = await _uow.Query<DriverProfile>()
            .FirstOrDefaultAsync(d => d.UserId == driverId, ct)
            ?? throw new NotFoundException("Driver profile not found.");

        var deliveries = await _uow.Deliveries
            .Query()
            .AsNoTracking()
            .Where(d => d.DriverId == profile.Id &&
                        (d.Status == DeliveryStatus.Assigned || d.Status == DeliveryStatus.InProgress))
            .Include(d => d.Parcel)
                .ThenInclude(p => p!.DeliveryAddress)
            .Include(d => d.Parcel)
                .ThenInclude(p => p!.PickupAddress)
            .ToListAsync(ct);

        return deliveries.Select(d => {
            var isPickup = d.Parcel?.Status == ParcelStatus.Approved;
            var targetAddress = isPickup ? d.Parcel?.PickupAddress : d.Parcel?.DeliveryAddress;

            return new DeliveryDto(
                Id: d.Id,
                ParcelId: d.ParcelId,
                TrackingNumber: d.Parcel?.TrackingNumber ?? "—",
                Status: d.Status.ToString(),
                RecipientName: targetAddress?.RecipientName ?? "—",
                RecipientPhone: targetAddress?.RecipientPhone ?? "—",
                DeliveryAddress: $"{targetAddress?.StreetAddress}, {targetAddress?.Suburb}".Trim(',', ' '),
                City: targetAddress?.City ?? "—",
                SpecialInstructions: d.Parcel?.SpecialInstructions,
                IsFragile: d.Parcel?.IsFragile ?? false,
                DispatchedAt: d.DispatchedAt,
                IsPickup: isPickup,
                RouteId: d.RouteId
            );
        });
    }

    // ── Update driver GPS location ────────────────────────────────────────────
    public async Task UpdateDriverLocationAsync(
        Guid driverId, decimal lat, decimal lng, CancellationToken ct = default)
    {
        var profile = await _uow.Query<DriverProfile>()
            .FirstOrDefaultAsync(d => d.UserId == driverId, ct);

        if (profile is null) return;

        profile.CurrentLatitude = lat;
        profile.CurrentLongitude = lng;
        profile.UpdatedAt = DateTime.UtcNow;

        // --- Self-healing state mechanism ---
        // If the DB thinks they are on delivery, verify they actually have active tasks
        if (profile.Status == DriverStatus.OnDelivery)
        {
            var hasActiveDeliveries = await _uow.Deliveries.Query()
                .AnyAsync(d => d.DriverId == profile.Id &&
                              (d.Status == DeliveryStatus.Assigned || d.Status == DeliveryStatus.InProgress), ct);

            if (!hasActiveDeliveries)
            {
                profile.Status = DriverStatus.Available;
            }
        }
        // -------------------------------------------

        await _uow.SaveChangesAsync(ct);
    }

    private async Task CheckRouteCompletionAsync(Guid? routeId, CancellationToken ct)
    {
        if (routeId is null) return;

        var route = await _uow.Query<DeliveryRoute>().GetByIdAsync(routeId.Value, ct);
        if (route is null || route.Status == RouteStatus.Completed) return;

        var allTerminal = await _uow.Deliveries.Query()
            .Where(d => d.RouteId == routeId.Value)
            .AllAsync(d => d.Status == DeliveryStatus.Delivered || d.Status == DeliveryStatus.Failed, ct);

        if (allTerminal)
        {
            route.Status = RouteStatus.Completed;
            route.CompletedAt = DateTime.UtcNow;
            route.UpdatedAt = DateTime.UtcNow;
        }
    }
}