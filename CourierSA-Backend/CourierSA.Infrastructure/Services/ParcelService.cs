using CourierSA.Application.DTOs.Parcels;
using CourierSA.Application.DTOs.Quotes;
using CourierSA.Application.DTOs.Routing;
using CourierSA.Application.DTOs.SecureDelivery;
using CourierSA.Application.DTOs.Sorting;
using CourierSA.Application.Interfaces.Repositories;
using CourierSA.Application.Interfaces.Services;
using CourierSA.Domain.Entities;
using CourierSA.Domain.Enums;
using CourierSA.Domain.Exceptions;
using CourierSA.Infrastructure.Data.Repositories;
using Microsoft.EntityFrameworkCore;
using static System.Net.Mime.MediaTypeNames;


namespace CourierSA.Infrastructure.Services;

public class ParcelService : IParcelService
{
    private readonly IUnitOfWork _uow;
    private readonly IQuoteService _quoteService;
    private readonly IBarcodeService _barcodeService;
    private readonly INotificationService _notificationService;
    private readonly IAuditService _audit;
    private readonly ITrackingHubService _hubService;
    private readonly ISecureDeliveryService _secureDelivery;
    private IQuoteService object1;
    private IBarcodeService object2;
    private INotificationService object3;
    private IAuditService object4;
    private ITrackingHubService object5;

    public ParcelService(
        IUnitOfWork uow,
        IQuoteService quoteService,
        IBarcodeService barcodeService,
        INotificationService notificationService,
        IAuditService audit,
        ITrackingHubService hubService,
        ISecureDeliveryService secureDelivery)
    {
        _uow = uow;
        _quoteService = quoteService;
        _barcodeService = barcodeService;
        _notificationService = notificationService;
        _audit = audit;
        _hubService = hubService;
        _secureDelivery = secureDelivery;
    }

    public ParcelService(UnitOfWork uow, IQuoteService object1, IBarcodeService object2, INotificationService object3, IAuditService object4, ITrackingHubService object5)
    {
        _uow = uow;
        this.object1 = object1;
        this.object2 = object2;
        this.object3 = object3;
        this.object4 = object4;
        this.object5 = object5;
    }

    public async Task<ParcelDetailDto> BookAsync(CreateParcelDto dto, Guid customerId, CancellationToken ct = default)
    {
        var customer = await GetCustomerProfileOrThrowAsync(customerId, ct);
        var parcel = await BuildAndAddParcelAsync(dto, customer, ct);

        await _uow.SaveChangesAsync(ct);

        var delivery = await _uow.Query<ParcelAddress>().GetByIdAsync(parcel.DeliveryAddressId, ct);

        try { await _notificationService.SendParcelBookedAsync(customer.UserId, parcel.TrackingNumber, serviceType: parcel.ServiceType.ToString(), destinationCity: delivery?.City, amountZAR: parcel.QuoteAmountZAR, ct: ct); }
        catch (Exception ex) { Console.WriteLine($"[NOTIFY] BookAsync notification failed: {ex.Message}"); }

        try { await _audit.LogAsync("PARCEL_BOOKED", "Parcel", parcel.Id, null, new { parcel.TrackingNumber, parcel.Status }, customerId, null, ct); }
        catch (Exception ex) { Console.WriteLine($"[AUDIT] BookAsync log failed: {ex.Message}"); }

        return await GetDetailAsync(parcel.Id, ct)
               ?? throw new InvalidOperationException("Failed to retrieve parcel after booking.");
    }

    public async Task<ParcelBatchResultDto> BookBatchAsync(CreateParcelBatchDto dto, Guid customerId, CancellationToken ct = default)
    {
        if (dto.Parcels is null || dto.Parcels.Count == 0)
            throw new BadRequestException("Batch must contain at least one parcel.");

        var customer = await GetCustomerProfileOrThrowAsync(customerId, ct);
        var bookedParcels = new List<Parcel>();

        await _uow.ExecuteInTransactionAsync(async innerCt =>
        {
            foreach (var item in dto.Parcels)
            {
                var itemDto = new CreateParcelDto(
                    item.PickupAddress, item.DeliveryAddress, item.ServiceType,
                    item.WeightKg, item.Dimensions, item.DeclaredValueZAR,
                    item.Description, item.SpecialInstructions, item.IsFragile,
                    item.RequiresSignature, item.InsuranceRequired, item.QuoteId,
                    dto.PaymentMethod, ClientReference: null,
                    IsEmergency: item.IsEmergency, ScheduledPickupDate: item.ScheduledPickupDate,
                    CardToken: dto.CardToken
                );

                var parcel = await BuildAndAddParcelAsync(itemDto, customer, innerCt);
                bookedParcels.Add(parcel);
                await _uow.SaveChangesRawAsync(innerCt);
            }
        }, ct);

        var results = new List<ParcelDetailDto>();
        decimal total = 0;
        foreach (var parcel in bookedParcels)
        {
            var delivery = await _uow.Query<ParcelAddress>().GetByIdAsync(parcel.DeliveryAddressId, ct);

            try { await _notificationService.SendParcelBookedAsync(customer.UserId, parcel.TrackingNumber, serviceType: parcel.ServiceType.ToString(), destinationCity: delivery?.City, amountZAR: parcel.QuoteAmountZAR, ct: ct); }
            catch (Exception ex) { Console.WriteLine($"[NOTIFY] BookBatchAsync notification failed: {ex.Message}"); }

            try { await _audit.LogAsync("PARCEL_BOOKED", "Parcel", parcel.Id, null, new { parcel.TrackingNumber, parcel.Status }, customerId, null, ct); }
            catch (Exception ex) { Console.WriteLine($"[AUDIT] BookBatchAsync log failed: {ex.Message}"); }

            total += parcel.QuoteAmountZAR ?? 0;
            var detail = await GetDetailAsync(parcel.Id, ct)
                ?? throw new InvalidOperationException("Failed to retrieve parcel after batch booking.");
            results.Add(detail);
        }

        return new ParcelBatchResultDto(results, total);
    }

    private async Task<CustomerProfile> GetCustomerProfileOrThrowAsync(Guid customerId, CancellationToken ct)
    {
        return await _uow.Query<CustomerProfile>()
            .Query()
            .FirstOrDefaultAsync(c => c.UserId == customerId, ct)
            ?? throw new NotFoundException("Customer profile not found.");
    }

    private async Task<Parcel> BuildAndAddParcelAsync(
        CreateParcelDto dto, CustomerProfile customer, CancellationToken ct)
    {
        bool isHighRisk = dto.IsFragile || (dto.DeclaredValueZAR >= 2000);
        if (isHighRisk && !dto.InsuranceRequired)
        {
            throw new BadRequestException("Security Check Failed: Insurance is legally mandatory for fragile or high-value (≥ R2000) parcels.");
        }

        var finalServiceType = dto.ServiceType;
        if (dto.IsEmergency)
        {
            finalServiceType = ServiceType.SameDay;
        }

        Quote? quote = null;
        decimal finalQuoteAmount = 0;

        if (dto.QuoteId.HasValue)
        {
            quote = await _uow.Quotes.GetByIdAsync(dto.QuoteId.Value, ct);

            if (quote is null || quote.Status != QuoteStatus.Pending)
                throw new BadRequestException("Quote is invalid or has already been used.");
            if (quote.ExpiresAt < DateTime.UtcNow)
                throw new BadRequestException("Quote has expired. Please request a new quote.");
            if (quote.ServiceType != finalServiceType || quote.InsuranceRequired != dto.InsuranceRequired)
                throw new BadRequestException("Quote no longer matches this booking's service type or insurance selection. Please request a new quote.");

            finalQuoteAmount = quote.TotalAmountZAR;
        }
        else
        {
            var quoteRequest = new QuoteRequestDto(
                dto.PickupAddress.Province, dto.DeliveryAddress.Province,
                dto.WeightKg, finalServiceType, dto.DeclaredValueZAR, dto.InsuranceRequired,
                dto.Dimensions is null ? null : new DimensionsDto(dto.Dimensions.LengthCm, dto.Dimensions.WidthCm, dto.Dimensions.HeightCm)
            );

            var calculatedQuote = await _quoteService.CalculateAsync(quoteRequest, customer.UserId, ct);
            finalQuoteAmount = calculatedQuote.TotalAmountZAR;

            if (calculatedQuote.QuoteId.HasValue)
            {
                quote = await _uow.Quotes.GetByIdAsync(calculatedQuote.QuoteId.Value, ct);
            }
        }

        var trackingNumber = await _uow.Parcels.GenerateTrackingNumberAsync();

        var pickup = MapAddress(dto.PickupAddress);
        var delivery = MapAddress(dto.DeliveryAddress);

        await _uow.Query<ParcelAddress>().AddAsync(pickup, ct);
        await _uow.Query<ParcelAddress>().AddAsync(delivery, ct);

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

        var parcel = new Parcel
        {
            Id = Guid.NewGuid(),
            TrackingNumber = trackingNumber,
            CustomerId = customer.Id,
            Status = ParcelStatus.PendingApproval,
            ServiceType = finalServiceType,
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
            IsEmergency = dto.IsEmergency,
            ScheduledPickupDate = dto.ScheduledPickupDate,
            PickupAddressId = pickup.Id,
            DeliveryAddressId = delivery.Id,
            QuoteAmountZAR = finalQuoteAmount,
            Zone = zone,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        parcel.BarcodeImagePath = await _barcodeService.GenerateAsync(trackingNumber, ct);
        await _uow.Parcels.AddAsync(parcel, ct);

        if (quote is not null)
        {
            quote.Status = QuoteStatus.Accepted;
            quote.ParcelId = parcel.Id;
        }

        parcel.PaymentMethod = dto.PaymentMethod;

        switch (dto.PaymentMethod)
        {
            case PaymentMethod.Wallet:
                if (parcel.QuoteAmountZAR is null) throw new BadRequestException("No quote amount provided.");
                if (customer.WalletBalanceZAR < parcel.QuoteAmountZAR) throw new BadRequestException("Insufficient wallet balance.");
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

        decimal vatZar = Math.Round(finalQuoteAmount - (finalQuoteAmount / 1.15m), 2);
        decimal subtotalZar = finalQuoteAmount - vatZar;

        var invoice = new Invoice
        {
            Id = Guid.NewGuid(),
            CustomerId = customer.Id,
            ParcelId = parcel.Id,
            InvoiceNumber = $"INV-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString()[..6].ToUpper()}",
            Status = parcel.IsPaid ? InvoiceStatus.Paid : InvoiceStatus.Issued,
            SubtotalZAR = subtotalZar,
            VatZAR = vatZar,
            TotalZAR = finalQuoteAmount,
            PaidAmountZAR = parcel.IsPaid ? finalQuoteAmount : 0,
            DueDate = parcel.IsPaid ? DateTime.UtcNow : DateTime.UtcNow.AddDays(7),
            PaidAt = parcel.IsPaid ? DateTime.UtcNow : null,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        await _uow.Query<Invoice>().AddAsync(invoice, ct);

        AddTrackingEvent(parcel, TrackingEventType.Booked, "Parcel booking confirmed", pickup.City);

        if (parcel.IsEmergency)
        {
            AddTrackingEvent(parcel, TrackingEventType.ExceptionRaised,
                "EMERGENCY ESCALATION: Parcel prioritized for Same-Day dispatch");
        }

        return parcel;
    }

    public async Task ApproveAsync(Guid parcelId, Guid staffId, CancellationToken ct = default)
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

    public async Task RejectAsync(Guid parcelId, string reason, Guid staffId, CancellationToken ct = default)
    {
        var parcel = await GetOrThrowAsync(parcelId, ct);
        EnsureStatus(parcel, ParcelStatus.PendingApproval);
        var previousStatus = parcel.Status;
        parcel.Status = ParcelStatus.Cancelled;
        parcel.UpdatedAt = DateTime.UtcNow;

        if (parcel.IsPaid)
        {
            if (parcel.PaymentMethod == PaymentMethod.Wallet) await RefundWalletAsync(parcel, ct);
            else await FlagInvoiceForManualRefundAsync(parcel, reason, staffId, ct);
            parcel.IsPaid = false;
        }
        else
        {
            await VoidInvoiceAsync(parcel, ct);
        }

        var trackingEvent = AddTrackingEvent(parcel, TrackingEventType.Cancelled, $"Booking rejected: {reason}");
        await _uow.TrackingEvents.AddAsync(trackingEvent, ct);
        await _uow.SaveChangesAsync(ct);
        await _audit.LogAsync("PARCEL_REJECTED", "Parcel", parcel.Id, new { Status = previousStatus.ToString() }, new { Status = parcel.Status.ToString(), reason }, staffId, null, ct);
        await _hubService.NotifyParcelStatusChangedAsync(parcel.TrackingNumber, "Cancelled", ct: ct);
    }

    // ✅ FIX: NEW DEDICATED METHOD FOR "RETURN TO SENDER"
    public async Task ReturnToSenderAsync(Guid parcelId, string notes, Guid staffId, CancellationToken ct = default)
    {
        var parcel = await GetOrThrowAsync(parcelId, ct);

        // Ensure this is only triggered from a failed delivery state
        EnsureStatus(parcel, ParcelStatus.FailedDelivery);

        var previousStatus = parcel.Status;

        parcel.Status = ParcelStatus.Returned;
        parcel.UpdatedAt = DateTime.UtcNow;

        var trackingEvent = AddTrackingEvent(
            parcel,
            TrackingEventType.ExceptionRaised,
            $"Return to sender initiated by dispatcher. Notes: {notes}"
        );

        await _uow.TrackingEvents.AddAsync(trackingEvent, ct);
        await _uow.SaveChangesAsync(ct);

        await _audit.LogAsync("PARCEL_RETURNED_TO_SENDER", "Parcel", parcel.Id,
            new { Status = previousStatus.ToString() },
            new { Status = parcel.Status.ToString(), notes },
            staffId, null, ct);

        await _hubService.NotifyParcelStatusChangedAsync(parcel.TrackingNumber, parcel.Status.ToString(), ct: ct);
    }

    public async Task CheckInAsync(Guid parcelId, Guid sortingBinId, Guid staffId, CancellationToken ct = default)
    {
        var parcel = await GetOrThrowAsync(parcelId, ct);
        EnsureStatus(parcel, ParcelStatus.AwaitingCheckIn);

        var hasInspection = await _uow.Query<ParcelInspection>().Query().AnyAsync(i => i.ParcelId == parcel.Id && i.Stage == ParcelInspectionStage.CheckIn, ct);
        if (!hasInspection) throw new BadRequestException("A check-in inspection must be logged before checking in this parcel.");

        var bin = await _uow.Query<SortingBin>().GetByIdAsync(sortingBinId, ct) ?? throw new NotFoundException("Sorting bin not found.");
        if (!bin.IsActive) throw new BadRequestException("This sorting bin is inactive and cannot be used.");

        var assignment = await _uow.Query<ParcelSortingAssignment>().Query().FirstOrDefaultAsync(a => a.ParcelId == parcel.Id, ct);
        if (assignment is null)
        {
            assignment = new ParcelSortingAssignment { Id = Guid.NewGuid(), ParcelId = parcel.Id, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
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

        var trackingEvent = AddTrackingEvent(parcel, TrackingEventType.ReceivedAtWarehouse, "Parcel received at warehouse", bin.BinCode);
        await _uow.TrackingEvents.AddAsync(trackingEvent, ct);
        await _uow.SaveChangesAsync(ct);
        await _hubService.NotifyParcelStatusChangedAsync(parcel.TrackingNumber, "InWarehouse", bin.BinCode, ct);
    }

    public async Task CheckoutAsync(Guid parcelId, Guid staffId, CancellationToken ct = default)
    {
        var parcel = await GetOrThrowAsync(parcelId, ct);
        EnsureStatus(parcel, ParcelStatus.InWarehouse);
        var hasInspection = await _uow.Query<ParcelInspection>().Query().AnyAsync(i => i.ParcelId == parcel.Id && i.Stage == ParcelInspectionStage.Checkout, ct);
        if (!hasInspection) throw new BadRequestException("A checkout inspection must be logged before releasing this parcel for dispatch.");

        parcel.Status = ParcelStatus.CheckedOut;
        parcel.UpdatedAt = DateTime.UtcNow;

        var trackingEvent = AddTrackingEvent(parcel, TrackingEventType.CheckedOut, "Parcel checked out — ready for dispatch");
        await _uow.TrackingEvents.AddAsync(trackingEvent, ct);
        await _uow.SaveChangesAsync(ct);
        await _audit.LogAsync("PARCEL_CHECKED_OUT", "Parcel", parcelId, null, new { parcel.Status }, staffId, null, ct);
        await _hubService.NotifyParcelStatusChangedAsync(parcel.TrackingNumber, "CheckedOut", ct: ct);
    }

    public async Task<ParcelInspectionDto> LogInspectionAsync(Guid parcelId, LogParcelInspectionDto dto, Guid staffId, CancellationToken ct = default)
    {
        var parcel = await _uow.Parcels.GetWithFullDetailsAsync(parcelId, ct) ?? throw new NotFoundException($"Parcel {parcelId} not found.");
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

        if (dto.Result != ParcelInspectionResult.Pass)
        {
            var trackingEvent = AddTrackingEvent(parcel, TrackingEventType.ExceptionRaised, $"{dto.Stage} inspection flagged: {dto.Result}" + (string.IsNullOrWhiteSpace(dto.Notes) ? "" : $" — {dto.Notes}"));
            await _uow.TrackingEvents.AddAsync(trackingEvent, ct);
            await _uow.SaveChangesAsync(ct);
            if (parcel.Customer is not null)
            {
                try { await _notificationService.SendParcelDamagedAsync(parcel.Customer.UserId, parcel.TrackingNumber, dto.Stage.ToString(), ct); }
                catch (Exception ex) { Console.WriteLine($"[NOTIFY] Damaged notification failed: {ex.Message}"); }
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
                    Description = $"Auto-logged from {dto.Stage} inspection." + (string.IsNullOrWhiteSpace(dto.Notes) ? "" : $" {dto.Notes}"),
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };
                await _uow.Query<InsuranceClaim>().AddAsync(claim, ct);
                await _uow.SaveChangesAsync(ct);
            }
        }
        await _audit.LogAsync("PARCEL_INSPECTED", "Parcel", parcel.Id, null, new { dto.Stage, dto.Result }, staffId, null, ct);
        return new ParcelInspectionDto(inspection.Id, parcel.Id, parcel.TrackingNumber, inspection.Stage.ToString(), inspection.Result.ToString(), inspection.PackagingIntact, inspection.NoMoistureDamage, inspection.WeightMatchesDeclared, inspection.FragileHandlingOk, inspection.SealIntact, inspection.Notes, inspection.CreatedAt);
    }

    public async Task<IEnumerable<ParcelInspectionDto>> GetInspectionsAsync(CancellationToken ct = default)
    {
        var inspections = await _uow.Query<ParcelInspection>().Query().AsNoTracking().Include(i => i.Parcel).OrderByDescending(i => i.CreatedAt).Take(200).ToListAsync(ct);
        return inspections.Select(i => new ParcelInspectionDto(i.Id, i.ParcelId, i.Parcel?.TrackingNumber ?? "—", i.Stage.ToString(), i.Result.ToString(), i.PackagingIntact, i.NoMoistureDamage, i.WeightMatchesDeclared, i.FragileHandlingOk, i.SealIntact, i.Notes, i.CreatedAt));
    }

    public async Task<SortingSuggestionDto> GetSortingSuggestionAsync(Guid parcelId, CancellationToken ct = default)
    {
        var parcel = await GetOrThrowAsync(parcelId, ct);
        var assignment = await _uow.Query<ParcelSortingAssignment>().Query().FirstOrDefaultAsync(a => a.ParcelId == parcel.Id, ct);

        if (assignment is null)
        {
            SortingBin? bestBin = null;
            if (parcel.Zone.HasValue)
            {
                bestBin = await _uow.Query<SortingBin>().Query().Where(b => b.IsActive && b.Zone == parcel.Zone.Value && b.CurrentCount < b.Capacity).OrderBy(b => b.CurrentCount).FirstOrDefaultAsync(ct);
            }
            assignment = new ParcelSortingAssignment { Id = Guid.NewGuid(), ParcelId = parcel.Id, SuggestedBinId = bestBin?.Id, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
            await _uow.Query<ParcelSortingAssignment>().AddAsync(assignment, ct);
            await _uow.SaveChangesAsync(ct);
        }
        var allBins = await _uow.Query<SortingBin>().Query().AsNoTracking().Where(b => b.IsActive).OrderBy(b => b.Zone).ThenBy(b => b.BinCode).Select(b => new SortingBinDto(b.Id, b.BinCode, b.Zone.ToString(), b.Capacity, b.CurrentCount)).ToListAsync(ct);
        return new SortingSuggestionDto(parcel.Id, parcel.Zone?.ToString(), assignment.SuggestedBinId, allBins);
    }

    public async Task DispatchAsync(Guid parcelId, Guid driverId, Guid dispatcherId, CancellationToken ct = default)
    {
        var parcel = await _uow.Parcels.GetWithFullDetailsAsync(parcelId, ct) ?? throw new NotFoundException($"Parcel {parcelId} not found.");

        // ✅ FIX: Allow dispatching parcels that are currently in FailedDelivery status
        if (parcel.Status != ParcelStatus.CheckedOut && parcel.Status != ParcelStatus.Approved && parcel.Status != ParcelStatus.FailedDelivery)
            throw new BadRequestException($"Cannot dispatch parcel in status '{parcel.Status}'.");

        if (parcel.Customer is null) throw new InvalidOperationException($"Parcel {parcel.TrackingNumber} has no linked customer profile.");

        var driver = await _uow.Query<DriverProfile>().GetByIdAsync(driverId, ct) ?? throw new NotFoundException("Driver not found.");
        if (driver.Status is DriverStatus.OffDuty or DriverStatus.Suspended) throw new BadRequestException("Driver is off duty or suspended and cannot be dispatched.");

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
            var assignment = await _uow.Query<ParcelSortingAssignment>().Query().FirstOrDefaultAsync(a => a.ParcelId == parcel.Id && a.ConfirmedBinId != null, ct);
            if (assignment?.ConfirmedBinId is not null)
            {
                var bin = await _uow.Query<SortingBin>().GetByIdAsync(assignment.ConfirmedBinId.Value, ct);
                if (bin is not null && bin.CurrentCount > 0) { bin.CurrentCount -= 1; bin.UpdatedAt = DateTime.UtcNow; }
                assignment.ReleasedAt = DateTime.UtcNow; assignment.UpdatedAt = DateTime.UtcNow;
            }
        }

        parcel.UpdatedAt = DateTime.UtcNow;
        driver.Status = DriverStatus.OnDelivery; driver.UpdatedAt = DateTime.UtcNow;
        await _uow.Deliveries.AddAsync(delivery, ct);

        var trackingEvent = new TrackingEvent
        {
            Id = Guid.NewGuid(),
            ParcelId = parcel.Id,
            EventType = TrackingEventType.OutForDelivery,
            Description = isPickup ? $"Dispatched to driver {driver.User?.FullName ?? driverId.ToString()} for pickup" : $"Dispatched to driver {driver.User?.FullName ?? driverId.ToString()} for delivery",
            OccurredAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        await _uow.TrackingEvents.AddAsync(trackingEvent, ct);

        FlagHighValueResultDto? otpFlagResult = null;
        if (!isPickup)
        {
            try { otpFlagResult = await _secureDelivery.AutoFlagOnDispatchAsync(parcel); }
            catch (Exception ex) { Console.WriteLine($"[SECURE-DELIVERY] Auto-flag failed for {parcel.TrackingNumber}: {ex.Message}"); }
        }

        try { await _uow.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException ex) { var failedTypes = ex.Entries.Select(e => e.Entity.GetType().Name).Distinct(); throw new BadRequestException($"The {string.Join(", ", failedTypes)} was updated by another process. Please refresh and try again."); }

        await _audit.LogAsync("PARCEL_DISPATCHED", "Parcel", parcelId, null, new { Status = parcel.Status.ToString(), driverId }, dispatcherId, null, ct);
        await _hubService.NotifyParcelStatusChangedAsync(parcel.TrackingNumber, parcel.Status.ToString(), ct: ct);

        try { await _notificationService.SendRouteAssignedAsync(driver.UserId, parcel.TrackingNumber, stopCount: 1, ct); }
        catch (Exception ex) { Console.WriteLine($"[NOTIFY] Driver assignment notification failed for {parcel.TrackingNumber}: {ex.Message}"); }

        if (otpFlagResult is { Otp: not null })
        {
            try { await _secureDelivery.SendOtpEmailForParcelAsync(parcel, otpFlagResult.Otp); }
            catch (Exception ex) { Console.WriteLine($"[SECURE-DELIVERY] OTP email failed for {parcel.TrackingNumber}: {ex.Message}"); }
        }
    }

    public async Task<RouteSummaryDto> DispatchRouteAsync(
        CreateRouteDto dto, Guid dispatcherId, CancellationToken ct = default)
    {
        if (dto.ParcelIds is null || dto.ParcelIds.Count == 0)
            throw new BadRequestException("At least one parcel must be selected.");

        var parcels = await _uow.Query<Parcel>()
            .Query()
            .Include(p => p.DeliveryAddress)
            .Include(p => p.PickupAddress)
            .Where(p => dto.ParcelIds.Contains(p.Id))
            .ToListAsync(ct);

        if (parcels.Count != dto.ParcelIds.Count)
            throw new NotFoundException("One or more parcels not found.");

        foreach (var p in parcels)
        {
            // ✅ FIX: Allow route dispatching parcels that are currently in FailedDelivery status
            if (p.Status != ParcelStatus.CheckedOut && p.Status != ParcelStatus.Approved && p.Status != ParcelStatus.FailedDelivery)
                throw new BadRequestException(
                    $"Parcel {p.TrackingNumber} is not ready for dispatch (status: {p.Status}).");
        }

        var routingAreas = parcels.Select(p =>
            p.Status == ParcelStatus.Approved ? p.PickupAddress?.City : p.Zone?.ToString()
        ).Distinct().ToList();

        if (routingAreas.Count > 1)
            throw new BadRequestException("Geographic mismatch: All tasks in a single route must share the same Pickup City or Delivery Zone to ensure they are reachable.");

        var primaryZone = parcels.FirstOrDefault(p => p.Zone != null)?.Zone;

        var driver = await _uow.Query<DriverProfile>().GetByIdAsync(dto.DriverId, ct)
            ?? throw new NotFoundException("Driver not found.");

        if (driver.Status is DriverStatus.OffDuty or DriverStatus.Suspended)
            throw new BadRequestException("Driver is off duty or suspended and cannot be dispatched.");

        var route = new DeliveryRoute
        {
            Id = Guid.NewGuid(),
            DriverId = driver.Id,
            Zone = primaryZone ?? SortingZone.Local,
            Status = RouteStatus.InProgress,
            DispatchedAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        await _uow.Query<DeliveryRoute>().AddAsync(route, ct);

        var stops = new List<RouteStopDto>();
        var otpFlagResults = new List<(Parcel Parcel, FlagHighValueResultDto FlagResult)>();

        foreach (var parcel in parcels)
        {
            var isPickup = parcel.Status == ParcelStatus.Approved;
            var targetAddress = isPickup ? parcel.PickupAddress : parcel.DeliveryAddress;

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

            if (!isPickup)
            {
                parcel.Status = ParcelStatus.OutForDelivery;
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

            var trackingEvent = new TrackingEvent
            {
                Id = Guid.NewGuid(),
                ParcelId = parcel.Id,
                EventType = TrackingEventType.OutForDelivery,
                Description = isPickup
                    ? $"Dispatched to driver {driver.User?.FullName ?? driver.Id.ToString()} for pickup route"
                    : $"Dispatched to driver {driver.User?.FullName ?? driver.Id.ToString()} as part of a {parcels.Count}-stop route",
                OccurredAt = DateTime.UtcNow,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            await _uow.TrackingEvents.AddAsync(trackingEvent, ct);

            if (!isPickup)
            {
                try
                {
                    var flagResult = await _secureDelivery.AutoFlagOnDispatchAsync(parcel);
                    if (flagResult is { Otp: not null }) otpFlagResults.Add((parcel, flagResult));
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[SECURE-DELIVERY] Auto-flag failed for {parcel.TrackingNumber}: {ex.Message}");
                }
            }

            stops.Add(new RouteStopDto(
                delivery.Id, parcel.Id, parcel.TrackingNumber, delivery.Status.ToString(),
                targetAddress?.RecipientName ?? "—",
                $"{targetAddress?.StreetAddress}, {targetAddress?.Suburb}".Trim(',', ' '),
                targetAddress?.City ?? "—"
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
            null, new { ParcelCount = parcels.Count, Zone = primaryZone?.ToString(), DriverId = driver.Id },
            dispatcherId, null, ct);

        try
        {
            var routeSummary = primaryZone?.ToString() ?? $"{parcels.Count}-stop route";
            await _notificationService.SendRouteAssignedAsync(driver.UserId, routeSummary, stops.Count, ct);
        }
        catch (Exception ex) { Console.WriteLine($"[NOTIFY] Driver route assignment notification failed for route {route.Id}: {ex.Message}"); }

        foreach (var parcel in parcels)
        {
            await _hubService.NotifyParcelStatusChangedAsync(parcel.TrackingNumber, parcel.Status.ToString(), ct: ct);
        }

        foreach (var item in otpFlagResults)
        {
            try { await _secureDelivery.SendOtpEmailForParcelAsync(item.Parcel, item.FlagResult.Otp!); }
            catch (Exception ex) { Console.WriteLine($"[SECURE-DELIVERY] OTP email failed for {item.Parcel.TrackingNumber}: {ex.Message}"); }
        }

        return new RouteSummaryDto(route.Id, primaryZone?.ToString() ?? "Mixed Route", route.Status.ToString(), route.DispatchedAt, stops);
    }

    public async Task MarkDeliveredAsync(Guid deliveryId, ProofOfDeliveryDto pod, Guid driverUserId, CancellationToken ct = default)
    {
        var driverProfile = await _uow.Query<DriverProfile>().FirstOrDefaultAsync(d => d.UserId == driverUserId, ct) ?? throw new NotFoundException("Driver profile not found.");
        var delivery = await _uow.Deliveries.GetByIdAsync(deliveryId, ct) ?? throw new NotFoundException("Delivery not found.");
        if (delivery.DriverId != driverProfile.Id) throw new ForbiddenException("You are not assigned to this delivery.");
        var parcel = await _uow.Parcels.GetWithFullDetailsAsync(delivery.ParcelId, ct) ?? throw new NotFoundException($"Parcel {delivery.ParcelId} not found.");

        var isPickup = parcel.Status == ParcelStatus.Approved;

        if (!isPickup && parcel.RequiresOtpVerification && parcel.OtpVerifiedAt is null)
            throw new BadRequestException("This is a high-value parcel. OTP verification is required before delivery can be completed.");

        delivery.Status = DeliveryStatus.Delivered; delivery.DeliveredAt = DateTime.UtcNow; delivery.ProofOfDeliveryImagePath = pod.ImagePath; delivery.RecipientSignaturePath = pod.SignaturePath; delivery.AttemptNotes = pod.Notes; delivery.UpdatedAt = DateTime.UtcNow;
        if (!isPickup) parcel.Status = ParcelStatus.Delivered; else parcel.Status = ParcelStatus.AwaitingCheckIn;
        parcel.UpdatedAt = DateTime.UtcNow;

        var hasOtherActiveDeliveries = await _uow.Deliveries.Query().AnyAsync(d => d.DriverId == driverProfile.Id && d.Id != delivery.Id && (d.Status == DeliveryStatus.Assigned || d.Status == DeliveryStatus.InProgress), ct);
        if (!hasOtherActiveDeliveries) { driverProfile.Status = DriverStatus.Available; driverProfile.UpdatedAt = DateTime.UtcNow; }

        var trackingEvent = new TrackingEvent
        {
            Id = Guid.NewGuid(),
            ParcelId = parcel.Id,
            EventType = TrackingEventType.Delivered,
            Description = isPickup ? "Parcel collected from sender and dropped off at warehouse. Awaiting check-in." : "Parcel delivered successfully",
            OccurredAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        await _uow.TrackingEvents.AddAsync(trackingEvent, ct);
        await _uow.SaveChangesAsync(ct);
        await CheckRouteCompletionAsync(delivery.RouteId, ct);

        if (!isPickup) { try { await _notificationService.SendDeliveredAsync(parcel.Customer!.UserId, parcel.TrackingNumber, ct); } catch (Exception ex) { Console.WriteLine($"[NOTIFY] Delivered notification failed: {ex.Message}"); } }
        try { await _audit.LogAsync(isPickup ? "PICKUP_COMPLETED" : "PARCEL_DELIVERED", "Parcel", parcel.Id, null, new { Status = parcel.Status.ToString() }, driverUserId, null, ct); } catch (Exception ex) { Console.WriteLine($"[AUDIT] Log failed for {parcel.TrackingNumber}: {ex.Message}"); }
        try { await _hubService.NotifyParcelStatusChangedAsync(parcel.TrackingNumber, parcel.Status.ToString(), ct: ct); } catch (Exception ex) { Console.WriteLine($"[HUB] SignalR notify failed for {parcel.TrackingNumber}: {ex.Message}"); }
    }

    private const int MaxAutoReattempts = 2;

    private static (ExceptionResolutionAction Action, string Explanation) DetermineNextAction(
        bool isPickup, FailureReason reason, int attemptNumber)
    {
        if (isPickup)
        {
            return reason switch
            {
                FailureReason.SenderUnavailable or FailureReason.ParcelNotReady =>
                    (ExceptionResolutionAction.NotifyCustomerToReschedule,
                     "Sender-side issue — the customer has been notified to reschedule the collection."),
                FailureReason.IncorrectCollectionAddress =>
                    (ExceptionResolutionAction.EscalateForAddressCorrection,
                     "The collection address appears incorrect — a dispatcher must confirm the correct address before re-attempting."),
                FailureReason.ParcelInformationMismatch =>
                    (ExceptionResolutionAction.RequiresManualReview,
                     "Parcel details didn't match what was expected at collection — flagged for manual review."),
                _ => (ExceptionResolutionAction.RequiresManualReview, "Unclassified pickup failure — flagged for dispatcher triage.")
            };
        }

        return reason switch
        {
            FailureReason.RecipientUnavailable => attemptNumber <= MaxAutoReattempts
                ? (ExceptionResolutionAction.AutoRescheduleNextAttempt,
                   $"Recipient unavailable on attempt {attemptNumber} — eligible for an automatic re-attempt.")
                : (ExceptionResolutionAction.EscalateForAddressCorrection,
                   $"Recipient unavailable for {attemptNumber} consecutive attempts — escalated to a dispatcher."),
            FailureReason.IncorrectAddress =>
                (ExceptionResolutionAction.EscalateForAddressCorrection,
                 "The delivery address appears incorrect — needs dispatcher/customer correction before re-attempting."),
            FailureReason.RestrictedAccess =>
                (ExceptionResolutionAction.EscalateForAccessArrangement,
                 "Access to the delivery location is restricted — needs a special access arrangement."),
            FailureReason.RecipientRefusedParcel =>
                (ExceptionResolutionAction.RouteToReturnToSender,
                 "The recipient refused the parcel — routed for return-to-sender processing."),
            _ => (ExceptionResolutionAction.RequiresManualReview, "Unclassified delivery exception — flagged for dispatcher triage.")
        };
    }

    public async Task<FailedDeliveryResultDto> MarkFailedAsync(Guid deliveryId, FailedDeliveryDto dto, Guid driverUserId, CancellationToken ct = default)
    {
        var driverProfile = await _uow.Query<DriverProfile>().FirstOrDefaultAsync(d => d.UserId == driverUserId, ct) ?? throw new NotFoundException("Driver profile not found.");
        var delivery = await _uow.Deliveries.GetByIdAsync(deliveryId, ct) ?? throw new NotFoundException("Delivery not found.");
        if (delivery.DriverId != driverProfile.Id) throw new ForbiddenException("You are not assigned to this delivery.");
        var parcel = await _uow.Parcels.GetWithFullDetailsAsync(delivery.ParcelId, ct) ?? throw new NotFoundException($"Parcel {delivery.ParcelId} not found.");

        var isPickup = parcel.Status == ParcelStatus.Approved;
        var attemptNumber = await _uow.Deliveries.Query().CountAsync(d => d.ParcelId == parcel.Id, ct);
        var (action, explanation) = DetermineNextAction(isPickup, dto.Reason, attemptNumber);
        var requiresDispatcherReview = action is ExceptionResolutionAction.EscalateForAddressCorrection
            or ExceptionResolutionAction.EscalateForAccessArrangement
            or ExceptionResolutionAction.RouteToReturnToSender
            or ExceptionResolutionAction.RequiresManualReview;

        delivery.Status = DeliveryStatus.Failed;
        delivery.FailureReason = dto.Reason;
        delivery.AttemptNotes = dto.Notes;
        delivery.AttemptNumber = attemptNumber;
        delivery.RecommendedAction = action;
        delivery.RequiresDispatcherReview = requiresDispatcherReview;
        delivery.UpdatedAt = DateTime.UtcNow;
        if (!isPickup) parcel.Status = ParcelStatus.FailedDelivery;
        parcel.UpdatedAt = DateTime.UtcNow;

        var hasOtherActiveDeliveries = await _uow.Deliveries.Query().AnyAsync(d => d.DriverId == driverProfile.Id && d.Id != delivery.Id && (d.Status == DeliveryStatus.Assigned || d.Status == DeliveryStatus.InProgress), ct);
        if (!hasOtherActiveDeliveries) { driverProfile.Status = DriverStatus.Available; driverProfile.UpdatedAt = DateTime.UtcNow; }

        var trackingEvent = new TrackingEvent
        {
            Id = Guid.NewGuid(),
            ParcelId = parcel.Id,
            EventType = TrackingEventType.DeliveryFailed,
            Description = (isPickup ? $"Pickup failed: {dto.Reason}" : $"Delivery failed: {dto.Reason}") + $" — {explanation}",
            OccurredAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        await _uow.TrackingEvents.AddAsync(trackingEvent, ct);
        await _uow.SaveChangesAsync(ct);
        await CheckRouteCompletionAsync(delivery.RouteId, ct);
        try { await _notificationService.SendFailedDeliveryAsync(parcel.Customer!.UserId, parcel.TrackingNumber, dto.Reason.ToString(), ct); } catch (Exception ex) { Console.WriteLine($"[NOTIFY] Failed-delivery notification failed: {ex.Message}"); }
        try { await _audit.LogAsync("DELIVERY_FAILED", "Delivery", deliveryId, null, new { dto.Reason, dto.Notes, AttemptNumber = attemptNumber, RecommendedAction = action.ToString(), requiresDispatcherReview }, driverUserId, null, ct); } catch (Exception ex) { Console.WriteLine($"[AUDIT] Log failed for {parcel.TrackingNumber}: {ex.Message}"); }
        try { await _hubService.NotifyParcelStatusChangedAsync(parcel.TrackingNumber, isPickup ? "Approved" : "FailedDelivery", ct: ct); } catch (Exception ex) { Console.WriteLine($"[HUB] SignalR notify failed for {parcel.TrackingNumber}: {ex.Message}"); }

        if (requiresDispatcherReview)
        {
            try
            {
                var dispatcherIds = await _uow.Users.Query()
                    .Where(u => u.Role == UserRole.Dispatcher && !u.IsDeleted)
                    .Select(u => u.Id)
                    .ToListAsync(ct);
                foreach (var dispatcherId in dispatcherIds)
                {
                    await _notificationService.SendSystemAlertAsync(
                        dispatcherId,
                        $"{(isPickup ? "Pickup" : "Delivery")} exception needs review",
                        $"{parcel.TrackingNumber}: {explanation}",
                        ct);
                }
            }
            catch (Exception ex) { Console.WriteLine($"[NOTIFY] Dispatcher escalation alert failed: {ex.Message}"); }
        }

        return new FailedDeliveryResultDto(
            delivery.Id, delivery.Status.ToString(), dto.Reason.ToString(), attemptNumber,
            action.ToString(), explanation, requiresDispatcherReview);
    }

    public async Task<TrackingResultDto?> TrackAsync(string trackingNumber, CancellationToken ct = default)
    {
        var parcel = await _uow.Parcels.GetByTrackingNumberAsync(trackingNumber, ct);
        if (parcel is null) return null;
        return new TrackingResultDto(parcel.TrackingNumber, parcel.Status.ToString(), parcel.ServiceType.ToString(), $"{parcel.DeliveryAddress!.City}, {parcel.DeliveryAddress.Province}", parcel.EstimatedDeliveryDate, parcel.TrackingEvents.OrderByDescending(e => e.OccurredAt).Select(e => new TrackingEventDto(e.EventType.ToString(), e.Location, e.Description, e.OccurredAt, e.Latitude, e.Longitude)).ToList());
    }

    public async Task<ParcelDetailDto?> GetPrivateTrackingAsync(string trackingNumber, Guid requestingUserId, CancellationToken ct = default)
    {
        var parcel = await _uow.Parcels.GetByTrackingNumberAsync(trackingNumber, ct);
        if (parcel is null) return null;
        var full = await _uow.Parcels.GetWithFullDetailsAsync(parcel.Id, ct);
        if (full is null) return null;

        var requestingUser = await _uow.Users.GetByIdAsync(requestingUserId, ct);
        var isStaff = requestingUser?.Role is UserRole.Dispatcher or UserRole.Administrator or UserRole.WarehouseStaff;
        if (!isStaff && full.Customer?.UserId != requestingUserId) return null;

        var detail = MapToDetail(full);
        DeliveryDto? enrichedDelivery = detail.ActiveDelivery;
        if (full.ActiveDelivery is not null)
        {
            var driver = await _uow.Query<DriverProfile>().Query().Include(d => d.User).FirstOrDefaultAsync(d => d.Id == full.ActiveDelivery.DriverId, ct);
            if (driver?.User is not null) enrichedDelivery = detail.ActiveDelivery with { DriverName = driver.User.FullName, DriverPhone = driver.User.PhoneNumber };
        }
        var claim = await _uow.Query<InsuranceClaim>().Query().Where(c => c.ParcelId == full.Id).OrderByDescending(c => c.CreatedAt).FirstOrDefaultAsync(ct);
        return detail with { ActiveDelivery = enrichedDelivery, PaymentMethod = full.PaymentMethod.ToString(), IsPaid = full.IsPaid, PaidAt = full.PaidAt, ClaimStatus = claim?.Status.ToString() };
    }

    public async Task<ParcelDetailDto?> GetDetailAsync(Guid id, CancellationToken ct = default)
    {
        var p = await _uow.Parcels.GetWithFullDetailsAsync(id, ct);
        return p is null ? null : MapToDetail(p);
    }

    public async Task<PagedResult<ParcelSummaryDto>> GetPagedAsync(ParcelFilterDto filter, Guid customerId, CancellationToken ct = default)
    {
        var customer = await _uow.Query<CustomerProfile>().Query().FirstOrDefaultAsync(c => c.UserId == customerId, ct);
        if (customer is null) return await GetQueueAsync(filter, ct);

        var query = _uow.Query<Parcel>().Query().AsNoTracking().Include(p => p.DeliveryAddress).Where(p => p.CustomerId == customer.Id);
        if (!string.IsNullOrWhiteSpace(filter.Status) && Enum.TryParse<ParcelStatus>(filter.Status, true, out var statusEnum)) query = query.Where(p => p.Status == statusEnum);
        if (!string.IsNullOrWhiteSpace(filter.Search)) { var search = filter.Search.Trim().ToLower(); query = query.Where(p => p.TrackingNumber.ToLower().Contains(search) || (p.DeliveryAddress != null && p.DeliveryAddress.City.ToLower().Contains(search))); }

        var count = await query.CountAsync(ct);
        var page = filter.Page <= 0 ? 1 : filter.Page; var pageSize = filter.PageSize <= 0 ? 10 : filter.PageSize;
        var parcels = await query.OrderByDescending(p => p.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);
        return new PagedResult<ParcelSummaryDto>(parcels.Select(p => MapToSummary(p)).ToList(), count, page, pageSize);
    }

    public async Task<PagedResult<ParcelSummaryDto>> GetQueueAsync(ParcelFilterDto filter, CancellationToken ct = default)
    {
        var query = _uow.Query<Parcel>().Query().AsNoTracking().Include(p => p.DeliveryAddress).Include(p => p.PickupAddress).AsQueryable();
        if (!string.IsNullOrWhiteSpace(filter.Status) && Enum.TryParse<ParcelStatus>(filter.Status, true, out var statusEnum)) query = query.Where(p => p.Status == statusEnum);
        if (!string.IsNullOrWhiteSpace(filter.Search)) { var search = filter.Search.Trim().ToLower(); query = query.Where(p => p.TrackingNumber.ToLower().Contains(search) || (p.DeliveryAddress != null && p.DeliveryAddress.City.ToLower().Contains(search))); }

        query = query.OrderByDescending(p => p.CreatedAt);
        var count = await query.CountAsync(ct);
        var page = filter.Page <= 0 ? 1 : filter.Page; var pageSize = filter.PageSize <= 0 ? 20 : filter.PageSize;
        var parcels = await query.Skip((page - 1) * pageSize).Take(pageSize).ToListAsync(ct);

        Dictionary<Guid, string> binCodesByParcelId = new();
        if ((string.Equals(filter.Status, "InWarehouse", StringComparison.OrdinalIgnoreCase) || string.Equals(filter.Status, "CheckedOut", StringComparison.OrdinalIgnoreCase)) && parcels.Count > 0)
        {
            var parcelIds = parcels.Select(p => p.Id).ToList();
            binCodesByParcelId = await _uow.Query<ParcelSortingAssignment>().Query().AsNoTracking().Where(a => parcelIds.Contains(a.ParcelId) && a.ConfirmedBinId != null && a.ReleasedAt == null).Join(_uow.Query<SortingBin>().Query().AsNoTracking(), a => a.ConfirmedBinId, b => b.Id, (a, b) => new { a.ParcelId, b.BinCode }).ToDictionaryAsync(x => x.ParcelId, x => x.BinCode, ct);
        }
        return new PagedResult<ParcelSummaryDto>(parcels.Select(p => MapToSummary(p, binCodesByParcelId.GetValueOrDefault(p.Id))).ToList(), count, page, pageSize);
    }

    public async Task<IEnumerable<ParcelSummaryDto>> GetOtpPendingParcelsAsync(CancellationToken ct = default)
    {
        var parcels = await _uow.Query<Parcel>().Query()
            .AsNoTracking()
            .Include(p => p.DeliveryAddress)
            .Where(p => p.RequiresOtpVerification && p.OtpVerifiedAt == null && p.Status == ParcelStatus.OutForDelivery)
            .OrderByDescending(p => p.UpdatedAt)
            .ToListAsync(ct);

        return parcels.Select(p => MapToSummary(p)).ToList();
    }

    public async Task<IEnumerable<ParcelSummaryDto>> GetHighValueEligibleParcelsAsync(CancellationToken ct = default)
    {
        var parcels = await _uow.Query<Parcel>().Query()
            .AsNoTracking()
            .Include(p => p.DeliveryAddress)
            .Where(p => !p.RequiresOtpVerification
                        && (p.Status == ParcelStatus.Approved || p.Status == ParcelStatus.CheckedOut)
                        && p.DeclaredValueZAR >= 2000m)
            .OrderByDescending(p => p.CreatedAt)
            .ToListAsync(ct);

        return parcels.Select(p => MapToSummary(p)).ToList();
    }

    private async Task RefundWalletAsync(Parcel parcel, CancellationToken ct)
    {
        var customer = await _uow.Query<CustomerProfile>().GetByIdAsync(parcel.CustomerId, ct) ?? throw new NotFoundException("Customer profile not found for refund.");
        var refundAmount = parcel.QuoteAmountZAR ?? 0;
        customer.WalletBalanceZAR += refundAmount;
        customer.UpdatedAt = DateTime.UtcNow;

        var walletTx = new WalletTransaction { Id = Guid.NewGuid(), UserId = customer.UserId, Type = WalletTransactionType.Refund, AmountZAR = refundAmount, BalanceAfterZAR = customer.WalletBalanceZAR, ReferenceId = parcel.Id, ReferenceType = "Parcel", Description = $"Refund for rejected parcel {parcel.TrackingNumber}", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
        await _uow.Query<WalletTransaction>().AddAsync(walletTx, ct);
        await VoidInvoiceAsync(parcel, ct);
    }

    private async Task FlagInvoiceForManualRefundAsync(Parcel parcel, string reason, Guid staffId, CancellationToken ct)
    {
        await VoidInvoiceAsync(parcel, ct);
        await _audit.LogAsync("MANUAL_REFUND_REQUIRED", "Parcel", parcel.Id, null, new { parcel.TrackingNumber, Amount = parcel.QuoteAmountZAR, parcel.PaymentMethod, reason }, staffId, null, ct);
    }

    private async Task VoidInvoiceAsync(Parcel parcel, CancellationToken ct)
    {
        var invoice = await _uow.Query<Invoice>().Query().FirstOrDefaultAsync(i => i.ParcelId == parcel.Id, ct);
        if (invoice is not null) { invoice.Status = InvoiceStatus.Voided; invoice.UpdatedAt = DateTime.UtcNow; }
    }

    private async Task<Parcel> GetOrThrowAsync(Guid id, CancellationToken ct)
        => await _uow.Parcels.GetByIdAsync(id, ct) ?? throw new NotFoundException($"Parcel {id} not found.");

    private static void EnsureStatus(Parcel parcel, ParcelStatus expected)
    {
        if (parcel.Status != expected) throw new BadRequestException($"Expected status '{expected}' but parcel is '{parcel.Status}'.");
    }

    private static TrackingEvent AddTrackingEvent(
    Parcel parcel, TrackingEventType type, string description, string? location = null)
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

        parcel.TrackingEvents ??= new List<TrackingEvent>();
        parcel.TrackingEvents.Add(trackingEvent);

        return trackingEvent;
    }

    private async Task DebitWalletAsync(CustomerProfile customer, Parcel parcel, CancellationToken ct)
    {
        var amount = parcel.QuoteAmountZAR ?? 0;
        customer.WalletBalanceZAR -= amount;
        await _uow.WalletTransactions.AddAsync(new WalletTransaction { Id = Guid.NewGuid(), UserId = customer.UserId, Type = WalletTransactionType.Debit, AmountZAR = amount, BalanceAfterZAR = customer.WalletBalanceZAR, ReferenceId = parcel.Id, ReferenceType = "Parcel", Description = $"Payment for parcel {parcel.TrackingNumber}", CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow }, ct);
    }

    private static ParcelAddress MapAddress(CreateAddressDto dto) => new() { Id = Guid.NewGuid(), RecipientName = dto.RecipientName, RecipientPhone = dto.RecipientPhone, RecipientEmail = dto.RecipientEmail, StreetAddress = dto.StreetAddress, Suburb = dto.Suburb, City = dto.City, Province = dto.Province, PostalCode = dto.PostalCode, Country = dto.Country ?? "South Africa", SpecialInstructions = dto.SpecialInstructions, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow };
    private static ParcelSummaryDto MapToSummary(Parcel p, string? binCode = null) => new(p.Id, p.TrackingNumber, p.Status.ToString(), p.ServiceType.ToString(), p.DeliveryAddress?.City ?? "—", p.DeliveryAddress?.Province.ToString() ?? "—", p.WeightKg, p.QuoteAmountZAR, p.CreatedAt, p.EstimatedDeliveryDate, binCode, p.Zone?.ToString());

    private static ParcelDetailDto MapToDetail(Parcel p)
    {
        bool isPickup = p.Status == ParcelStatus.Approved;
        var targetAddress = isPickup ? p.PickupAddress : p.DeliveryAddress;
        return new(
            p.Id, p.TrackingNumber, p.Status.ToString(), p.ServiceType.ToString(), p.WeightKg, p.Dimensions, p.DeclaredValueZAR, p.Description, p.SpecialInstructions, p.IsFragile, p.RequiresSignature, p.InsuranceRequired, p.IsEmergency, p.ScheduledPickupDate, p.QuoteAmountZAR, p.BarcodeImagePath, p.CreatedAt, p.EstimatedDeliveryDate, MapAddress(p.PickupAddress), MapAddress(p.DeliveryAddress),
            p.TrackingEvents.OrderByDescending(t => t.OccurredAt).Select(t => new TrackingEventDto(t.EventType.ToString(), t.Location, t.Description, t.OccurredAt, t.Latitude, t.Longitude)).ToList(),
           p.ActiveDelivery is null ? null : new DeliveryDto(p.ActiveDelivery.Id, p.Id, p.TrackingNumber, p.ActiveDelivery.Status.ToString(), targetAddress?.RecipientName ?? "—", targetAddress?.RecipientPhone ?? "—", $"{targetAddress?.StreetAddress}, {targetAddress?.Suburb}".Trim(',', ' '), targetAddress?.City ?? "—", p.SpecialInstructions, p.IsFragile, p.ActiveDelivery.DispatchedAt, isPickup, RequiresOtpVerification: p.RequiresOtpVerification, OtpVerified: p.OtpVerifiedAt is not null)
        );
    }

    private static ParcelAddressDto? MapAddress(ParcelAddress? addr) => addr is null ? null : new(addr.RecipientName, addr.RecipientPhone, addr.RecipientEmail, addr.StreetAddress, addr.Suburb, addr.City, addr.Province.ToString(), addr.PostalCode);

    public async Task<IEnumerable<DeliveryDto>> GetDriverDeliveriesAsync(Guid driverId, CancellationToken ct = default)
    {
        var profile = await _uow.Query<DriverProfile>().FirstOrDefaultAsync(d => d.UserId == driverId, ct) ?? throw new NotFoundException("Driver profile not found.");
        var deliveries = await _uow.Deliveries.Query().AsNoTracking().Where(d => d.DriverId == profile.Id && (d.Status == DeliveryStatus.Assigned || d.Status == DeliveryStatus.InProgress)).Include(d => d.Parcel).ThenInclude(p => p!.DeliveryAddress).Include(d => d.Parcel).ThenInclude(p => p!.PickupAddress).ToListAsync(ct);

        return deliveries.Select(d => {
            var isPickup = d.Parcel?.Status == ParcelStatus.Approved;
            var targetAddress = isPickup ? d.Parcel?.PickupAddress : d.Parcel?.DeliveryAddress;
            return new DeliveryDto(Id: d.Id, ParcelId: d.ParcelId, TrackingNumber: d.Parcel?.TrackingNumber ?? "—", Status: d.Status.ToString(), RecipientName: targetAddress?.RecipientName ?? "—", RecipientPhone: targetAddress?.RecipientPhone ?? "—", DeliveryAddress: $"{targetAddress?.StreetAddress}, {targetAddress?.Suburb}".Trim(',', ' '), City: targetAddress?.City ?? "—", SpecialInstructions: d.Parcel?.SpecialInstructions, IsFragile: d.Parcel?.IsFragile ?? false, DispatchedAt: d.DispatchedAt, IsPickup: isPickup, RouteId: d.RouteId, RequiresOtpVerification: d.Parcel?.RequiresOtpVerification ?? false, OtpVerified: d.Parcel?.OtpVerifiedAt is not null);
        });
    }

    public async Task<Guid?> UpdateDriverLocationAsync(Guid userId, decimal lat, decimal lng, CancellationToken ct = default)
    {
        var profile = await _uow.Query<DriverProfile>().FirstOrDefaultAsync(d => d.UserId == userId, ct);
        if (profile is null) return null;
        profile.CurrentLatitude = lat; profile.CurrentLongitude = lng; profile.UpdatedAt = DateTime.UtcNow;
        if (profile.Status == DriverStatus.OnDelivery)
        {
            var hasActiveDeliveries = await _uow.Deliveries.Query().AnyAsync(d => d.DriverId == profile.Id && (d.Status == DeliveryStatus.Assigned || d.Status == DeliveryStatus.InProgress), ct);
            if (!hasActiveDeliveries) profile.Status = DriverStatus.Available;
        }
        await _uow.SaveChangesAsync(ct);
        return profile.Id;
    }

    private async Task CheckRouteCompletionAsync(Guid? routeId, CancellationToken ct)
    {
        if (routeId is null) return;
        var route = await _uow.Query<DeliveryRoute>().GetByIdAsync(routeId.Value, ct);
        if (route is null || route.Status == RouteStatus.Completed) return;
        var allTerminal = await _uow.Deliveries.Query().Where(d => d.RouteId == routeId.Value).AllAsync(d => d.Status == DeliveryStatus.Delivered || d.Status == DeliveryStatus.Failed, ct);
        if (allTerminal) { route.Status = RouteStatus.Completed; route.CompletedAt = DateTime.UtcNow; route.UpdatedAt = DateTime.UtcNow; }
    }


    private const decimal WarehouseCancellationFeeZAR = 50.00m;

    public async Task<CancelParcelQuoteDto> PreviewCancelFeeAsync(
        Guid parcelId, Guid customerUserId, CancellationToken ct = default)
    {
        var customer = await GetCustomerProfileOrThrowAsync(customerUserId, ct);
        var parcel = await GetOrThrowAsync(parcelId, ct);

        if (parcel.CustomerId != customer.Id)
            throw new ForbiddenException("This parcel does not belong to you.");

        if (parcel.Status is ParcelStatus.OutForDelivery or ParcelStatus.Delivered or ParcelStatus.FailedDelivery or ParcelStatus.Cancelled or ParcelStatus.Lost or ParcelStatus.Returned)
        {
            return new CancelParcelQuoteDto(
                parcel.Id, parcel.TrackingNumber, parcel.Status.ToString(),
                IsEligible: false, IsFeeApplicable: false, RequiresCancellationOtp: false, CancellationFeeZAR: 0m,
                QuoteAmountZAR: parcel.QuoteAmountZAR ?? 0m, EstimatedRefundZAR: 0m,
                Reason: parcel.Status == ParcelStatus.OutForDelivery
                    ? "Parcels mid-route (Out for Delivery) cannot be cancelled."
                    : $"Parcels with status '{parcel.Status}' cannot be cancelled."
            );
        }

        bool isWarehouseStatus = parcel.Status is ParcelStatus.AwaitingCheckIn or ParcelStatus.InWarehouse or ParcelStatus.CheckedOut;
        decimal fee = isWarehouseStatus ? WarehouseCancellationFeeZAR : 0m;
        decimal quoteAmount = parcel.QuoteAmountZAR ?? 0m;
        decimal estimatedRefund = Math.Max(0m, quoteAmount - fee);

        string explanation = isWarehouseStatus
            ? $"Parcel is at the warehouse. Security OTP verification & handling fee of R{fee:0.00} are required to cancel."
            : "Free cancellation — parcel has not yet been collected or checked into warehouse (No OTP required).";

        return new CancelParcelQuoteDto(
            parcel.Id, parcel.TrackingNumber, parcel.Status.ToString(),
            IsEligible: true, IsFeeApplicable: isWarehouseStatus, RequiresCancellationOtp: isWarehouseStatus, CancellationFeeZAR: fee,
            QuoteAmountZAR: quoteAmount, EstimatedRefundZAR: estimatedRefund,
            Reason: explanation
        );
    }

    public async Task SendCancellationOtpAsync(Guid parcelId, Guid customerUserId, CancellationToken ct = default)
    {
        var customer = await GetCustomerProfileOrThrowAsync(customerUserId, ct);
        var parcel = await GetOrThrowAsync(parcelId, ct);

        if (parcel.CustomerId != customer.Id)
            throw new ForbiddenException("This parcel does not belong to you.");

        bool isWarehouseStatus = parcel.Status is ParcelStatus.AwaitingCheckIn or ParcelStatus.InWarehouse or ParcelStatus.CheckedOut;
        if (!isWarehouseStatus)
            throw new BadRequestException("OTP verification is only required for parcels currently at the warehouse.");

        var random = new Random();
        var otp = random.Next(1000, 9999).ToString("D4");

        parcel.CancellationOtp = otp;
        parcel.CancellationOtpExpiresAt = DateTime.UtcNow.AddMinutes(10);
        parcel.UpdatedAt = DateTime.UtcNow;

        await _uow.SaveChangesAsync(ct);

        try
        {
            await _notificationService.SendCancellationOtpAsync(customer.UserId, parcel.TrackingNumber, otp, ct);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[NOTIFY] SendCancellationOtpAsync failed: {ex.Message}");
        }
    }

    public async Task<CancelParcelResultDto> CancelByCustomerAsync(
        Guid parcelId, CancelParcelDto dto, Guid customerUserId, CancellationToken ct = default)
    {
        var customer = await GetCustomerProfileOrThrowAsync(customerUserId, ct);
        var parcel = await GetOrThrowAsync(parcelId, ct);

        if (parcel.CustomerId != customer.Id)
            throw new ForbiddenException("This parcel does not belong to you.");

        if (parcel.Status is ParcelStatus.OutForDelivery or ParcelStatus.Delivered or ParcelStatus.FailedDelivery or ParcelStatus.Cancelled or ParcelStatus.Lost or ParcelStatus.Returned)
            throw new BadRequestException($"Cannot cancel parcel in status '{parcel.Status}'.");

        bool isWarehouseStatus = parcel.Status is ParcelStatus.AwaitingCheckIn or ParcelStatus.InWarehouse or ParcelStatus.CheckedOut;

        if (isWarehouseStatus)
        {
            if (string.IsNullOrWhiteSpace(dto.Otp))
                throw new BadRequestException("Verification OTP is required to cancel a parcel that is at the warehouse.");

            if (parcel.CancellationOtp == null || parcel.CancellationOtpExpiresAt == null || parcel.CancellationOtpExpiresAt < DateTime.UtcNow)
                throw new BadRequestException("Verification OTP has expired or was not requested. Please click 'Send Verification Code'.");

            if (parcel.CancellationOtp.Trim() != dto.Otp.Trim())
                throw new BadRequestException("Invalid cancellation verification OTP code.");

            parcel.CancellationOtp = null;
            parcel.CancellationOtpExpiresAt = null;
        }

        decimal cancellationFee = isWarehouseStatus ? WarehouseCancellationFeeZAR : 0m;
        decimal totalQuote = parcel.QuoteAmountZAR ?? 0m;
        decimal netRefundAmount = Math.Max(0m, totalQuote - cancellationFee);

        var previousStatus = parcel.Status;
        parcel.Status = ParcelStatus.Cancelled;
        parcel.UpdatedAt = DateTime.UtcNow;

        string chargeMethod = "None";

        var assignment = await _uow.Query<ParcelSortingAssignment>().Query()
            .FirstOrDefaultAsync(a => a.ParcelId == parcel.Id && a.ConfirmedBinId != null && a.ReleasedAt == null, ct);
        if (assignment?.ConfirmedBinId != null)
        {
            var bin = await _uow.Query<SortingBin>().GetByIdAsync(assignment.ConfirmedBinId.Value, ct);
            if (bin != null && bin.CurrentCount > 0)
            {
                bin.CurrentCount -= 1;
                bin.UpdatedAt = DateTime.UtcNow;
            }
            assignment.ReleasedAt = DateTime.UtcNow;
            assignment.UpdatedAt = DateTime.UtcNow;
        }

        if (parcel.IsPaid)
        {
            if (parcel.PaymentMethod == PaymentMethod.Wallet)
            {
                customer.WalletBalanceZAR += netRefundAmount;
                customer.UpdatedAt = DateTime.UtcNow;

                var walletTx = new WalletTransaction
                {
                    Id = Guid.NewGuid(),
                    UserId = customer.UserId,
                    Type = WalletTransactionType.Refund,
                    AmountZAR = netRefundAmount,
                    BalanceAfterZAR = customer.WalletBalanceZAR,
                    ReferenceId = parcel.Id,
                    ReferenceType = "ParcelCancellation",
                    Description = isWarehouseStatus
                        ? $"Refund for cancelled warehouse parcel {parcel.TrackingNumber} (R{cancellationFee:0.00} handling fee deducted)"
                        : $"Full refund for cancelled uncollected parcel {parcel.TrackingNumber}",
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };
                await _uow.Query<WalletTransaction>().AddAsync(walletTx, ct);
                chargeMethod = "Wallet";
            }
            else
            {
                await FlagInvoiceForManualRefundAsync(parcel, $"Customer cancelled parcel. Reason: {dto.Reason}", customerUserId, ct);
                chargeMethod = "ManualRefundPending";
            }
            parcel.IsPaid = false;
        }
        else
        {
            await VoidInvoiceAsync(parcel, ct);
        }

        var trackingEvent = AddTrackingEvent(
            parcel,
            TrackingEventType.Cancelled,
            isWarehouseStatus
                ? $"Warehouse parcel cancelled by customer following OTP verification. Handling fee of R{cancellationFee:0.00} applied."
                : $"Uncollected parcel cancelled by customer. Reason: {dto.Reason}."
        );
        await _uow.TrackingEvents.AddAsync(trackingEvent, ct);

        await _uow.SaveChangesAsync(ct);

        await _audit.LogAsync("PARCEL_CANCELLED_BY_CUSTOMER", "Parcel", parcel.Id,
            new { PreviousStatus = previousStatus.ToString() },
            new { Reason = dto.Reason, CancellationFee = cancellationFee, NetRefund = netRefundAmount, UsedOtp = isWarehouseStatus },
            customerUserId, null, ct);

        await _hubService.NotifyParcelStatusChangedAsync(parcel.TrackingNumber, "Cancelled", ct: ct);

        return new CancelParcelResultDto(
            parcel.Id,
            parcel.TrackingNumber,
            netRefundAmount,
            cancellationFee,
            chargeMethod,
            isWarehouseStatus
                ? $"Parcel cancelled. Refund of R{netRefundAmount:0.00} issued (R{cancellationFee:0.00} warehouse fee deducted)."
                : "Parcel cancelled successfully. Full refund issued."
        );
    }
}