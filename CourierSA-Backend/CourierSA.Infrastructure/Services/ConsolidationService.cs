using CourierSA.Application.DTOs.Consolidation;
using CourierSA.Application.Interfaces.Repositories;
using CourierSA.Application.Interfaces.Services;
using CourierSA.Domain.Entities;
using CourierSA.Domain.Enums;
using CourierSA.Domain.Exceptions;
using Microsoft.EntityFrameworkCore;

namespace CourierSA.Infrastructure.Services;

/// <summary>
/// Business process "Package Consolidation &amp; Warehouse Fulfilment".
///   UC10  Customer merges 2+ parcels (same destination, sitting in the warehouse) into one request.
///   UC11  Warehouse staff scan every parcel, pack one master box, a master label (MST-xxxx-CCC) is generated.
///   UC13  Warehouse staff scan the master label, pick an outbound lane and stage it. At this point ONE master
///         Parcel (tracking number = master label, status CheckedOut) is created. It is what the dispatcher sees
///         in the Dispatch Queue and Payload Review (UC12 / UC14). The original parcels stay "Consolidated" and
///         are no longer dispatchable on their own.
/// Original parcel status trail: InWarehouse -> ConsolidationRequested -> Consolidated
///                               (then mirrored from the master: OutForDelivery -> Delivered / FailedDelivery).
/// </summary>
public class ConsolidationService : IConsolidationService
{
    /// <summary>Tiered saving for sending parcels as one shipment: 10% for 2 parcels, 15% for 3 or more.</summary>
    public static decimal DiscountRateFor(int parcelCount) => parcelCount >= 3 ? 0.15m : 0.10m;

    /// <summary>Master boxes are Parcels whose tracking number starts with this prefix.</summary>
    public const string MasterPrefix = "MST-";

    private const string WalletRefType = "Consolidation";

    private readonly IUnitOfWork _uow;
    private readonly INotificationService _notifications;
    private readonly IAuditService _audit;
    private readonly IBarcodeService _barcode;

    public ConsolidationService(
        IUnitOfWork uow,
        INotificationService notifications,
        IAuditService audit,
        IBarcodeService barcode)
    {
        _uow = uow; _notifications = notifications; _audit = audit; _barcode = barcode;
    }

    // ══════════════════════════════════════════════════════════════════════
    // UC10 – CUSTOMER
    // ══════════════════════════════════════════════════════════════════════

    public async Task<IEnumerable<EligibleParcelDto>> GetEligibleParcelsAsync(Guid customerUserId, CancellationToken ct = default)
    {
        var customer = await GetCustomerAsync(customerUserId, ct);

        var parcels = await _uow.Query<Parcel>().Query()
            .AsNoTracking()
            .Include(p => p.DeliveryAddress)
            .Where(p => p.CustomerId == customer.Id && p.Status == ParcelStatus.InWarehouse)
            .OrderBy(p => p.CreatedAt)
            .ToListAsync(ct);

        var bins = await BinCodesAsync(parcels.Select(p => p.Id).ToList(), ct);

        return parcels.Select(p => new EligibleParcelDto(
            p.Id, p.TrackingNumber,
            p.DeliveryAddress?.RecipientName ?? "—",
            AddressText(p.DeliveryAddress),
            AddressKey(p.DeliveryAddress),
            p.WeightKg,
            bins.GetValueOrDefault(p.Id))).ToList();
    }

    public async Task<ConsolidationPreviewDto> PreviewAsync(ConsolidationRequestDto dto, Guid customerUserId, CancellationToken ct = default)
    {
        var (_, parcels) = await LoadAndValidateAsync(dto, customerUserId, ct);
        return BuildPreview(parcels);
    }

    public async Task<ConsolidationOrderDto> RequestAsync(ConsolidationRequestDto dto, Guid customerUserId, CancellationToken ct = default)
    {
        var (customer, parcels) = await LoadAndValidateAsync(dto, customerUserId, ct);
        var preview = BuildPreview(parcels);
        var address = parcels[0].DeliveryAddress;

        var order = new ConsolidationOrder
        {
            Id = Guid.NewGuid(),
            OrderNumber = await NextOrderNumberAsync(ct),
            CustomerId = customer.Id,
            Status = ConsolidationOrderStatus.Pending,
            DestinationKey = AddressKey(address),
            DestinationSummary = AddressText(address),
            DestinationCity = address?.City ?? "—",
            ParcelCount = preview.ParcelCount,
            CombinedWeightKg = preview.CombinedWeightKg,
            SeparateShippingZAR = preview.SeparateShippingZAR,
            ConsolidatedShippingZAR = preview.ConsolidatedShippingZAR,
            SavingZAR = preview.SavingZAR,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        await _uow.Query<ConsolidationOrder>().AddAsync(order, ct);

        foreach (var p in parcels)
        {
            await _uow.Query<ConsolidationOrderParcel>().AddAsync(new ConsolidationOrderParcel
            {
                Id = Guid.NewGuid(),
                OrderId = order.Id,
                ParcelId = p.Id,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            }, ct);

            p.Status = ParcelStatus.ConsolidationRequested;
            p.UpdatedAt = DateTime.UtcNow;
            await AddEventAsync(p, TrackingEventType.ConsolidationRequested,
                $"Customer requested consolidation. Work order {order.OrderNumber} sent to the warehouse.", ct);
        }

        await _uow.SaveChangesAsync(ct);

        await SafeAuditAsync("CONSOLIDATION_REQUESTED", order.Id, null,
            new { order.OrderNumber, order.ParcelCount }, customerUserId, ct);
        await SafeNotifyAsync(customerUserId, "Consolidation requested",
            $"Order {order.OrderNumber}: {order.ParcelCount} parcels will be packed into one shipment.", ct);

        return await MapOneAsync(order, ct);
    }

    public async Task<IEnumerable<ConsolidationOrderDto>> GetMineAsync(Guid customerUserId, CancellationToken ct = default)
    {
        var customer = await GetCustomerAsync(customerUserId, ct);
        var orders = await _uow.Query<ConsolidationOrder>().Query()
            .AsNoTracking()
            .Where(o => o.CustomerId == customer.Id)
            .OrderByDescending(o => o.CreatedAt)
            .Take(100)
            .ToListAsync(ct);
        return await MapManyAsync(orders, ct);
    }

    public async Task<ConsolidationOrderDto> CancelAsync(Guid orderId, Guid customerUserId, CancellationToken ct = default)
    {
        var customer = await GetCustomerAsync(customerUserId, ct);
        var order = await GetOrderOrThrowAsync(orderId, ct);
        if (order.CustomerId != customer.Id)
            throw new ForbiddenException("This consolidation order does not belong to you.");
        if (order.Status != ConsolidationOrderStatus.Pending)
            throw new BadRequestException(
                $"Only orders the warehouse has not started can be cancelled (currently '{order.Status}').");

        var parcels = await LoadOrderParcelsAsync(order.Id, ct);
        foreach (var p in parcels)
        {
            p.Status = ParcelStatus.InWarehouse;
            p.UpdatedAt = DateTime.UtcNow;
            await AddEventAsync(p, TrackingEventType.ConsolidationRequested,
                $"Consolidation order {order.OrderNumber} cancelled by the customer. Parcel stays in the warehouse.", ct);
        }
        order.Status = ConsolidationOrderStatus.Cancelled;
        order.UpdatedAt = DateTime.UtcNow;
        await _uow.SaveChangesAsync(ct);

        await SafeAuditAsync("CONSOLIDATION_CANCELLED", order.Id, null, new { order.OrderNumber }, customerUserId, ct);
        return await MapOneAsync(order, ct);
    }

    /// <summary>
    /// Cancels consolidation orders that have sat in Pending longer than <paramref name="maxAge"/>
    /// (the warehouse never started them) and puts their parcels back to InWarehouse, so a parcel
    /// can never be stuck in ConsolidationRequested. Returns how many orders were released.
    /// </summary>
    public async Task<int> ReleaseStaleOrdersAsync(TimeSpan maxAge, CancellationToken ct = default)
    {
        var cutoff = DateTime.UtcNow - maxAge;
        var stale = await _uow.Query<ConsolidationOrder>().Query()
            .Where(o => o.Status == ConsolidationOrderStatus.Pending && o.CreatedAt < cutoff)
            .ToListAsync(ct);
        if (stale.Count == 0) return 0;

        foreach (var order in stale)
        {
            var parcels = await LoadOrderParcelsAsync(order.Id, ct);
            foreach (var p in parcels.Where(p => p.Status == ParcelStatus.ConsolidationRequested))
            {
                p.Status = ParcelStatus.InWarehouse;
                p.UpdatedAt = DateTime.UtcNow;
                await AddEventAsync(p, TrackingEventType.ConsolidationRequested,
                    $"Consolidation order {order.OrderNumber} expired before the warehouse started it. Parcel stays in the warehouse.", ct);
            }
            order.Status = ConsolidationOrderStatus.Cancelled;
            order.UpdatedAt = DateTime.UtcNow;
        }
        await _uow.SaveChangesAsync(ct);

        foreach (var order in stale)
        {
            var customerUserId = await CustomerUserIdAsync(order.CustomerId, ct);
            if (customerUserId is null) continue;

            await SafeAuditAsync("CONSOLIDATION_EXPIRED", order.Id, null, new { order.OrderNumber }, customerUserId.Value, ct);
            await SafeNotifyAsync(customerUserId.Value, "Consolidation request expired",
                $"Order {order.OrderNumber} was not started in time and has been released. " +
                "Your parcels are still in the warehouse; you can request consolidation again.", ct);
        }
        return stale.Count;
    }

    // ══════════════════════════════════════════════════════════════════════
    // UC11 / UC13 – WAREHOUSE
    // ══════════════════════════════════════════════════════════════════════

    public async Task<IEnumerable<ConsolidationOrderDto>> GetQueueAsync(string? status, CancellationToken ct = default)
    {
        var query = _uow.Query<ConsolidationOrder>().Query().AsNoTracking().AsQueryable();

        if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<ConsolidationOrderStatus>(status, true, out var s))
            query = query.Where(o => o.Status == s);
        else
            query = query.Where(o => o.Status == ConsolidationOrderStatus.Pending
                                  || o.Status == ConsolidationOrderStatus.InProgress
                                  || o.Status == ConsolidationOrderStatus.Consolidated);

        var orders = await query.OrderBy(o => o.CreatedAt).Take(200).ToListAsync(ct);
        return await MapManyAsync(orders, ct);
    }

    /// <summary>
    /// History of consolidated work: packed, staged and cancelled orders, newest first, each with the
    /// current status of its master box (OutForDelivery, Delivered, ...). Optional search on order number,
    /// master label or destination city.
    /// </summary>
    public async Task<IEnumerable<ConsolidationHistoryDto>> GetHistoryAsync(string? search, CancellationToken ct = default)
    {
        var query = _uow.Query<ConsolidationOrder>().Query().AsNoTracking()
            .Where(o => o.Status == ConsolidationOrderStatus.Consolidated
                     || o.Status == ConsolidationOrderStatus.Staged
                     || o.Status == ConsolidationOrderStatus.Cancelled);

        if (!string.IsNullOrWhiteSpace(search))
        {
            var s = search.Trim().ToLower();
            query = query.Where(o => o.OrderNumber.ToLower().Contains(s)
                                  || (o.MasterTrackingId != null && o.MasterTrackingId.ToLower().Contains(s))
                                  || o.DestinationCity.ToLower().Contains(s));
        }

        var orders = await query.OrderByDescending(o => o.UpdatedAt).Take(200).ToListAsync(ct);
        var dtos = await MapManyAsync(orders, ct);

        var masters = orders.Where(o => o.MasterTrackingId != null).Select(o => o.MasterTrackingId!).ToList();
        var statuses = masters.Count == 0
            ? new Dictionary<string, string>()
            : await _uow.Query<Parcel>().Query().AsNoTracking()
                .Where(p => masters.Contains(p.TrackingNumber))
                .ToDictionaryAsync(p => p.TrackingNumber, p => p.Status.ToString(), ct);

        return dtos.Select(d => new ConsolidationHistoryDto(
            d, d.MasterTrackingId is null ? null : statuses.GetValueOrDefault(d.MasterTrackingId))).ToList();
    }

    public async Task<ConsolidationOrderDto> GetAsync(Guid orderId, CancellationToken ct = default)
        => await MapOneAsync(await GetOrderOrThrowAsync(orderId, ct), ct);

    public async Task<ConsolidationOrderDto> ScanAsync(Guid orderId, ScanConsolidationParcelDto dto, Guid staffUserId, CancellationToken ct = default)
    {
        var order = await GetOrderOrThrowAsync(orderId, ct);
        if (order.Status is not (ConsolidationOrderStatus.Pending or ConsolidationOrderStatus.InProgress))
            throw new BadRequestException($"Parcels can only be scanned while the order is Pending or In progress (currently '{order.Status}').");

        var code = (dto.TrackingNumber ?? string.Empty).Trim().ToUpperInvariant();
        if (code.Length == 0) throw new BadRequestException("Scan or type a parcel tracking number.");

        var parcels = await LoadOrderParcelsAsync(order.Id, ct);
        var parcel = parcels.FirstOrDefault(p => p.TrackingNumber.ToUpperInvariant() == code)
            ?? throw new BadRequestException($"{code} is not on consolidation order {order.OrderNumber}. Put it back in its bin.");

        var link = await _uow.Query<ConsolidationOrderParcel>().Query()
            .FirstAsync(l => l.OrderId == order.Id && l.ParcelId == parcel.Id, ct);

        if (link.Scanned)
            throw new BadRequestException($"{parcel.TrackingNumber} has already been scanned for this order.");

        link.Scanned = true;
        link.ScannedAt = DateTime.UtcNow;
        link.ScannedByStaffId = staffUserId;
        link.UpdatedAt = DateTime.UtcNow;

        order.Status = ConsolidationOrderStatus.InProgress;
        order.UpdatedAt = DateTime.UtcNow;
        await _uow.SaveChangesAsync(ct);

        return await MapOneAsync(order, ct);
    }

    public async Task<ConsolidationOrderDto> PackAsync(Guid orderId, PackConsolidationDto dto, Guid staffUserId, CancellationToken ct = default)
    {
        var order = await GetOrderOrThrowAsync(orderId, ct);
        if (order.Status != ConsolidationOrderStatus.InProgress)
            throw new BadRequestException(
                $"Scan the parcels first. Only an order that is In progress can be packed (currently '{order.Status}').");

        if (dto.LengthCm <= 0 || dto.WidthCm <= 0 || dto.HeightCm <= 0)
            throw new BadRequestException("Enter the final box length, width and height (all greater than zero).");
        if (dto.FinalWeightKg <= 0)
            throw new BadRequestException("Enter the final box weight (greater than zero).");

        var links = await _uow.Query<ConsolidationOrderParcel>().Query()
            .Where(l => l.OrderId == order.Id).ToListAsync(ct);
        var unscanned = links.Count(l => !l.Scanned);
        if (unscanned > 0)
            throw new BadRequestException($"{unscanned} parcel(s) have not been scanned yet. Every parcel must be scanned before packing.");

        var seq = order.OrderNumber[(order.OrderNumber.LastIndexOf('-') + 1)..];
        var city3 = new string(order.DestinationCity.Where(char.IsLetter).Take(3).ToArray()).ToUpperInvariant().PadRight(3, 'X');

        // The master label becomes a Parcel tracking number, so it must be unique across all parcels
        // (the order sequence restarts every year).
        var masterId = $"{MasterPrefix}{seq}-{city3}";
        var candidate = masterId;
        var suffix = 1;
        while (await _uow.Query<Parcel>().Query().AsNoTracking().AnyAsync(p => p.TrackingNumber == candidate, ct))
            candidate = $"{masterId}-{++suffix}";

        order.MasterTrackingId = candidate;
        order.LengthCm = dto.LengthCm;
        order.WidthCm = dto.WidthCm;
        order.HeightCm = dto.HeightCm;
        order.FinalWeightKg = dto.FinalWeightKg;
        order.Status = ConsolidationOrderStatus.Consolidated;
        order.ConsolidatedAt = DateTime.UtcNow;
        order.ConsolidatedByStaffId = staffUserId;
        order.UpdatedAt = DateTime.UtcNow;

        var parcels = await LoadOrderParcelsAsync(order.Id, ct);
        foreach (var p in parcels)
        {
            p.Status = ParcelStatus.Consolidated;
            p.UpdatedAt = DateTime.UtcNow;
            await AddEventAsync(p, TrackingEventType.ParcelsConsolidated,
                $"Packed into master box {order.MasterTrackingId} (order {order.OrderNumber}).", ct);
        }

        await _uow.SaveChangesAsync(ct);

        await SafeAuditAsync("CONSOLIDATION_PACKED", order.Id, null,
            new { order.OrderNumber, order.MasterTrackingId, order.FinalWeightKg }, staffUserId, ct);

        var customerUserId = await CustomerUserIdAsync(order.CustomerId, ct);
        if (customerUserId is not null)
            await SafeNotifyAsync(customerUserId.Value, "Parcels consolidated",
                $"Your {order.ParcelCount} parcels are packed into master box {order.MasterTrackingId}.", ct);

        return await MapOneAsync(order, ct);
    }

    public async Task<ConsolidationOrderDto> StageAsync(Guid orderId, StageConsolidationDto dto, Guid staffUserId, CancellationToken ct = default)
    {
        var order = await GetOrderOrThrowAsync(orderId, ct);
        if (order.Status != ConsolidationOrderStatus.Consolidated)
            throw new BadRequestException(
                $"Only a consolidated and labelled master box can be staged (currently '{order.Status}').");

        var scanned = (dto.MasterTrackingId ?? string.Empty).Trim();
        if (!string.Equals(scanned, order.MasterTrackingId, StringComparison.OrdinalIgnoreCase))
            throw new BadRequestException(
                $"Scanned label '{scanned}' does not match this order's master label {order.MasterTrackingId}.");

        var lane = (dto.Lane ?? string.Empty).Trim();
        if (lane.Length == 0) throw new BadRequestException("Choose an outbound bay lane.");
        if (lane.Length > 50) throw new BadRequestException("Lane name is too long.");

        order.Status = ConsolidationOrderStatus.Staged;
        order.Lane = lane;
        order.StagedAt = DateTime.UtcNow;
        order.StagedByStaffId = staffUserId;
        order.UpdatedAt = DateTime.UtcNow;

        // The loose parcels are now inside the master box: they stay "Consolidated" and are NOT dispatchable.
        // One master Parcel (CheckedOut) takes their place in the Dispatch Queue and Payload Review.
        var parcels = await LoadOrderParcelsAsync(order.Id, ct);

        foreach (var p in parcels)
            await AddEventAsync(p, TrackingEventType.StagedForDispatch,
                $"Master box {order.MasterTrackingId} staged in {lane}. Ready for dispatch.", ct);

        await ReleaseBinsAsync(parcels, ct);

        // Idempotent: never create a second master for the same order.
        var alreadyThere = await _uow.Query<Parcel>().Query().AsNoTracking()
            .AnyAsync(p => p.TrackingNumber == order.MasterTrackingId, ct);
        if (!alreadyThere)
        {
            var master = await CreateMasterParcelAsync(order, parcels, ct);
            await AddEventAsync(master, TrackingEventType.StagedForDispatch,
                $"Master box staged in {lane}. Ready for dispatch.", ct);
        }

        var credited = await CreditSavingAsync(order, parcels, ct);

        await _uow.SaveChangesAsync(ct);

        await SafeAuditAsync("CONSOLIDATION_STAGED", order.Id, null,
            new { order.OrderNumber, order.MasterTrackingId, order.Lane, CreditedZAR = credited }, staffUserId, ct);

        if (credited > 0m)
        {
            var customerUserId = await CustomerUserIdAsync(order.CustomerId, ct);
            if (customerUserId is not null)
                await SafeNotifyAsync(customerUserId.Value, "Consolidation saving credited",
                    $"R{credited:0.00} has been credited to your wallet for consolidation order {order.OrderNumber}.", ct);
        }

        return await MapOneAsync(order, ct);
    }

    // ══════════════════════════════════════════════════════════════════════
    // HELPERS
    // ══════════════════════════════════════════════════════════════════════

    private async Task<(CustomerProfile customer, List<Parcel> parcels)> LoadAndValidateAsync(
        ConsolidationRequestDto dto, Guid customerUserId, CancellationToken ct)
    {
        var ids = (dto.ParcelIds ?? []).Distinct().ToList();
        if (ids.Count < 2)
            throw new BadRequestException("Select at least two parcels to consolidate.");

        var customer = await GetCustomerAsync(customerUserId, ct);

        var parcels = await _uow.Query<Parcel>().Query()
            .Include(p => p.DeliveryAddress)
            .Where(p => ids.Contains(p.Id))
            .ToListAsync(ct);

        if (parcels.Count != ids.Count)
            throw new NotFoundException("One or more selected parcels were not found.");
        if (parcels.Any(p => p.CustomerId != customer.Id))
            throw new ForbiddenException("You can only consolidate your own parcels.");

        foreach (var p in parcels)
        {
            if (p.Status != ParcelStatus.InWarehouse)
                throw new BadRequestException(
                    $"Parcel {p.TrackingNumber} is not awaiting dispatch in the warehouse (status: {p.Status}).");
        }

        if (parcels.Select(p => AddressKey(p.DeliveryAddress)).Distinct().Count() > 1)
            throw new BadRequestException("All selected parcels must be going to the same destination address.");

        // The master box must still fit on our largest active vehicle, otherwise it could never be dispatched.
        var maxPayload = await _uow.Query<Vehicle>().Query().AsNoTracking()
            .Where(v => v.Status == VehicleStatus.Active)
            .Select(v => (decimal?)v.PayloadCapacityKg)
            .MaxAsync(ct);
        var combined = parcels.Sum(p => p.WeightKg);
        if (maxPayload.HasValue && combined > maxPayload.Value)
            throw new BadRequestException(
                $"These parcels weigh {combined:0.##} kg together, which is more than our largest vehicle can carry " +
                $"({maxPayload.Value:0.##} kg). Select fewer parcels.");

        return (customer, parcels);
    }

    /// <summary>
    /// Parcels are physically out of their sorting bins once packed into the master box, so free the
    /// bin slots. The master box itself sits in an outbound lane (see <see cref="ConsolidationOrder.Lane"/>).
    /// </summary>
    private async Task ReleaseBinsAsync(List<Parcel> parcels, CancellationToken ct)
    {
        var ids = parcels.Select(p => p.Id).ToList();
        var assignments = await _uow.Query<ParcelSortingAssignment>().Query()
            .Where(a => ids.Contains(a.ParcelId) && a.ConfirmedBinId != null && a.ReleasedAt == null)
            .ToListAsync(ct);

        foreach (var a in assignments)
        {
            var bin = await _uow.Query<SortingBin>().GetByIdAsync(a.ConfirmedBinId!.Value, ct);
            if (bin is not null && bin.CurrentCount > 0)
            {
                bin.CurrentCount -= 1;
                bin.UpdatedAt = DateTime.UtcNow;
            }
            a.ReleasedAt = DateTime.UtcNow;
            a.UpdatedAt = DateTime.UtcNow;
        }
    }

    /// <summary>
    /// Creates the one Parcel that represents the master box. Its tracking number is the master label (MST-…),
    /// its weight and dimensions are what staff measured when packing. Payment stays on the original parcels,
    /// so the master is flagged paid with a zero quote and no driver is ever asked to collect cash for it.
    /// Does not save.
    /// </summary>
    private async Task<Parcel> CreateMasterParcelAsync(ConsolidationOrder order, List<Parcel> children, CancellationToken ct)
    {
        var first = children.OrderBy(p => p.CreatedAt).First();

        var pickupSrc = await _uow.Query<ParcelAddress>().Query().AsNoTracking()
            .FirstAsync(a => a.Id == first.PickupAddressId, ct);
        var deliverySrc = await _uow.Query<ParcelAddress>().Query().AsNoTracking()
            .FirstAsync(a => a.Id == first.DeliveryAddressId, ct);

        // Copies, so the master never shares an address row with the parcels inside it.
        var pickup = CloneAddress(pickupSrc);
        var delivery = CloneAddress(deliverySrc);
        await _uow.Query<ParcelAddress>().AddAsync(pickup, ct);
        await _uow.Query<ParcelAddress>().AddAsync(delivery, ct);

        var trackingNumber = order.MasterTrackingId!;
        string? barcode = null;
        try { barcode = await _barcode.GenerateAsync(trackingNumber, ct); }
        catch (Exception ex) { Console.WriteLine($"[BARCODE] master {trackingNumber} failed: {ex.Message}"); }

        var instructions = string.Join(" | ", children
            .Select(p => p.SpecialInstructions)
            .Where(s => !string.IsNullOrWhiteSpace(s))
            .Distinct());

        var master = new Parcel
        {
            Id = Guid.NewGuid(),
            TrackingNumber = trackingNumber,
            CustomerId = order.CustomerId,
            Status = ParcelStatus.CheckedOut,                       // ready for dispatch
            ServiceType = children.Max(p => p.ServiceType),         // honour the fastest promise inside the box
            WeightKg = order.FinalWeightKg ?? order.CombinedWeightKg,
            Dimensions = new ParcelDimensions
            {
                LengthCm = order.LengthCm ?? 0m,
                WidthCm = order.WidthCm ?? 0m,
                HeightCm = order.HeightCm ?? 0m
            },
            DeclaredValueZAR = children.Sum(p => p.DeclaredValueZAR ?? 0m),
            Description = $"Consolidated master box {order.OrderNumber} ({children.Count} parcels)",
            SpecialInstructions = instructions.Length == 0 ? null : instructions,
            IsFragile = children.Any(p => p.IsFragile),
            RequiresSignature = children.Any(p => p.RequiresSignature),
            InsuranceRequired = children.Any(p => p.InsuranceRequired),
            IsEmergency = children.Any(p => p.IsEmergency),
            PickupAddressId = pickup.Id,
            DeliveryAddressId = delivery.Id,
            Zone = first.Zone,                                      // PlanRoute rejects mixed or missing zones
            EstimatedDeliveryDate = children.Min(p => p.EstimatedDeliveryDate),
            QuoteAmountZAR = 0m,                                    // already paid on the original parcels
            PaymentMethod = first.PaymentMethod,
            IsPaid = true,
            PaidAt = DateTime.UtcNow,
            BarcodeImagePath = barcode,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        await _uow.Query<Parcel>().AddAsync(master, ct);
        return master;
    }

    private static ParcelAddress CloneAddress(ParcelAddress a) => new()
    {
        Id = Guid.NewGuid(),
        RecipientName = a.RecipientName,
        RecipientPhone = a.RecipientPhone,
        RecipientEmail = a.RecipientEmail,
        StreetAddress = a.StreetAddress,
        Suburb = a.Suburb,
        City = a.City,
        Province = a.Province,
        PostalCode = a.PostalCode,
        Country = a.Country,
        SpecialInstructions = a.SpecialInstructions,
        Latitude = a.Latitude,
        Longitude = a.Longitude,
        CreatedAt = DateTime.UtcNow,
        UpdatedAt = DateTime.UtcNow
    };

    /// <summary>
    /// Credits the consolidation saving to the customer's wallet once the master box is staged.
    /// Only parcels that were actually paid for earn a credit (an unpaid or cash-on-collection parcel
    /// has nothing to refund). Idempotent: an order is credited at most once.
    /// </summary>
    private async Task<decimal> CreditSavingAsync(ConsolidationOrder order, List<Parcel> parcels, CancellationToken ct)
    {
        var alreadyCredited = await _uow.Query<WalletTransaction>().Query().AsNoTracking()
            .AnyAsync(t => t.ReferenceId == order.Id && t.ReferenceType == WalletRefType, ct);
        if (alreadyCredited) return 0m;

        var paidQuotes = parcels.Where(p => p.IsPaid).Sum(p => p.QuoteAmountZAR ?? 0m);
        var credit = Math.Round(paidQuotes * DiscountRateFor(parcels.Count), 2);
        if (credit <= 0m) return 0m;

        var customer = await _uow.Query<CustomerProfile>().Query().FirstOrDefaultAsync(c => c.Id == order.CustomerId, ct);
        if (customer is null) return 0m;

        customer.WalletBalanceZAR += credit;
        customer.UpdatedAt = DateTime.UtcNow;

        await _uow.Query<WalletTransaction>().AddAsync(new WalletTransaction
        {
            Id = Guid.NewGuid(),
            UserId = customer.UserId,
            Type = WalletTransactionType.Credit,
            AmountZAR = credit,
            BalanceAfterZAR = customer.WalletBalanceZAR,
            ReferenceId = order.Id,
            ReferenceType = WalletRefType,
            Description = $"Consolidation saving for order {order.OrderNumber}",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        }, ct);

        return credit;
    }

    private static ConsolidationPreviewDto BuildPreview(List<Parcel> parcels)
    {
        var weight = parcels.Sum(p => p.WeightKg);
        var separate = parcels.Sum(p => p.QuoteAmountZAR ?? 0m);
        var consolidated = Math.Round(separate * (1m - DiscountRateFor(parcels.Count)), 2);
        var saving = separate - consolidated;
        var pct = separate > 0 ? Math.Round(saving / separate * 100m, 0) : 0m;
        return new ConsolidationPreviewDto(parcels.Count, weight, separate, consolidated, saving, pct);
    }

    internal static string AddressKey(ParcelAddress? a)
    {
        static string N(string? s) => string.Join(' ', (s ?? string.Empty).Split(' ', StringSplitOptions.RemoveEmptyEntries)).ToLowerInvariant();
        return a is null ? "none" : $"{N(a.StreetAddress)}|{N(a.Suburb)}|{N(a.City)}|{N(a.PostalCode)}";
    }

    private static string AddressText(ParcelAddress? a)
        => a is null ? "—" : string.Join(", ", new[] { a.StreetAddress, a.Suburb, a.City }.Where(x => !string.IsNullOrWhiteSpace(x)));

    private async Task<CustomerProfile> GetCustomerAsync(Guid userId, CancellationToken ct)
        => await _uow.Query<CustomerProfile>().Query().AsNoTracking().FirstOrDefaultAsync(c => c.UserId == userId, ct)
           ?? throw new NotFoundException("Customer profile not found.");

    private async Task<Guid?> CustomerUserIdAsync(Guid customerId, CancellationToken ct)
        => await _uow.Query<CustomerProfile>().Query().AsNoTracking()
            .Where(c => c.Id == customerId).Select(c => (Guid?)c.UserId).FirstOrDefaultAsync(ct);

    private async Task<ConsolidationOrder> GetOrderOrThrowAsync(Guid id, CancellationToken ct)
        => await _uow.Query<ConsolidationOrder>().Query().FirstOrDefaultAsync(o => o.Id == id, ct)
           ?? throw new NotFoundException($"Consolidation order {id} not found.");

    private async Task<List<Parcel>> LoadOrderParcelsAsync(Guid orderId, CancellationToken ct)
    {
        var parcelIds = await _uow.Query<ConsolidationOrderParcel>().Query()
            .Where(l => l.OrderId == orderId).Select(l => l.ParcelId).ToListAsync(ct);
        return await _uow.Query<Parcel>().Query().Where(p => parcelIds.Contains(p.Id)).ToListAsync(ct);
    }

    private async Task<string> NextOrderNumberAsync(CancellationToken ct)
    {
        // CO-2026-0001 – the same sequence number is reused in the master label (MST-0001-BAL)
        var prefix = $"CO-{DateTime.UtcNow:yyyy}-";
        var last = await _uow.Query<ConsolidationOrder>().Query().AsNoTracking()
            .Where(o => o.OrderNumber.StartsWith(prefix))
            .OrderByDescending(o => o.OrderNumber)
            .Select(o => o.OrderNumber)
            .FirstOrDefaultAsync(ct);

        var seq = 1;
        if (last is not null && int.TryParse(last[prefix.Length..], out var prev)) seq = prev + 1;
        return $"{prefix}{seq:D4}";
    }

    private async Task<Dictionary<Guid, string>> BinCodesAsync(List<Guid> parcelIds, CancellationToken ct)
    {
        var result = new Dictionary<Guid, string>();
        if (parcelIds.Count == 0) return result;

        var assignments = await _uow.Query<ParcelSortingAssignment>().Query().AsNoTracking()
            .Where(a => parcelIds.Contains(a.ParcelId) && a.ConfirmedBinId != null)
            .ToListAsync(ct);
        if (assignments.Count == 0) return result;

        var binIds = assignments.Select(a => a.ConfirmedBinId!.Value).Distinct().ToList();
        var bins = await _uow.Query<SortingBin>().Query().AsNoTracking()
            .Where(b => binIds.Contains(b.Id)).ToDictionaryAsync(b => b.Id, b => b.BinCode, ct);

        foreach (var a in assignments.OrderBy(a => a.ConfirmedAt))
            if (bins.TryGetValue(a.ConfirmedBinId!.Value, out var code)) result[a.ParcelId] = code;
        return result;
    }

    private async Task AddEventAsync(Parcel parcel, TrackingEventType type, string description, CancellationToken ct)
        => await _uow.TrackingEvents.AddAsync(new TrackingEvent
        {
            Id = Guid.NewGuid(),
            ParcelId = parcel.Id,
            EventType = type,
            Description = description,
            OccurredAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        }, ct);

    private async Task<ConsolidationOrderDto> MapOneAsync(ConsolidationOrder order, CancellationToken ct)
        => (await MapManyAsync([order], ct)).First();

    private async Task<List<ConsolidationOrderDto>> MapManyAsync(List<ConsolidationOrder> orders, CancellationToken ct)
    {
        if (orders.Count == 0) return [];

        var orderIds = orders.Select(o => o.Id).ToList();
        var links = await _uow.Query<ConsolidationOrderParcel>().Query().AsNoTracking()
            .Where(l => orderIds.Contains(l.OrderId)).ToListAsync(ct);

        var parcelIds = links.Select(l => l.ParcelId).Distinct().ToList();
        var parcels = await _uow.Query<Parcel>().Query().AsNoTracking()
            .Where(p => parcelIds.Contains(p.Id))
            .ToDictionaryAsync(p => p.Id, p => new { p.TrackingNumber, p.WeightKg }, ct);
        var bins = await BinCodesAsync(parcelIds, ct);

        return orders.Select(o => new ConsolidationOrderDto(
            o.Id, o.OrderNumber, o.Status.ToString(), o.MasterTrackingId,
            o.DestinationSummary, o.DestinationCity, o.ParcelCount, o.CombinedWeightKg,
            o.SeparateShippingZAR, o.ConsolidatedShippingZAR, o.SavingZAR,
            o.LengthCm, o.WidthCm, o.HeightCm, o.FinalWeightKg,
            o.Lane, o.CreatedAt, o.ConsolidatedAt, o.StagedAt,
            links.Where(l => l.OrderId == o.Id)
                 .Select(l => new ConsolidationParcelDto(
                     l.ParcelId,
                     parcels.TryGetValue(l.ParcelId, out var p) ? p.TrackingNumber : "—",
                     parcels.TryGetValue(l.ParcelId, out var p2) ? p2.WeightKg : 0m,
                     bins.GetValueOrDefault(l.ParcelId),
                     l.Scanned))
                 .OrderBy(x => x.TrackingNumber)
                 .ToList())).ToList();
    }

    private async Task SafeAuditAsync(string action, Guid entityId, object? oldValues, object? newValues, Guid userId, CancellationToken ct)
    {
        try { await _audit.LogAsync(action, "ConsolidationOrder", entityId, oldValues, newValues, userId, null, ct); }
        catch (Exception ex) { Console.WriteLine($"[AUDIT] {action} log failed: {ex.Message}"); }
    }

    private async Task SafeNotifyAsync(Guid userId, string title, string body, CancellationToken ct)
    {
        try { await _notifications.SendSystemAlertAsync(userId, title, body, ct); }
        catch (Exception ex) { Console.WriteLine($"[NOTIFY] {title} failed: {ex.Message}"); }
    }
}