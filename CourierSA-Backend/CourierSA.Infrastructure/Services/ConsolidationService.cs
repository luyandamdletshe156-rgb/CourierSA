using CourierSA.Application.DTOs.Consolidation;
using CourierSA.Application.Interfaces.Repositories;
using CourierSA.Application.Interfaces.Services;
using CourierSA.Domain.Entities;
using CourierSA.Domain.Enums;
using CourierSA.Domain.Exceptions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace CourierSA.Infrastructure.Services;

/// <summary>
/// Business process "Package Consolidation &amp; Warehouse Fulfilment".
///   Automatic consolidation: the business, not the customer, groups parcels going to the same address.
///         A sweep (ConsolidationTimeoutWorker) finds compatible groups, waits a hold window only when more
///         parcels for that address are actually on their way, then creates the order. The customer is told
///         when another parcel is coming, can choose Auto / Ask first / Never, and can mark a parcel "Ship now".
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
    private readonly Options _options;

    /// <summary>Business rules, all overridable in appsettings.json under "Consolidation".</summary>
    private sealed record Options(int HoldHours, decimal FragileMaxCompanionKg, decimal MaxDeclaredValueZAR, int MaxParcelsPerBox, int AwaitingArrivalDays);

    public ConsolidationService(
        IUnitOfWork uow,
        INotificationService notifications,
        IAuditService audit,
        IBarcodeService barcode,
        IConfiguration config)
    {
        _uow = uow; _notifications = notifications; _audit = audit; _barcode = barcode;
        _options = new Options(
            Math.Max(0, config.GetValue<int?>("Consolidation:HoldHours") ?? 24),
            config.GetValue<decimal?>("Consolidation:FragileMaxCompanionKg") ?? 10m,
            config.GetValue<decimal?>("Consolidation:MaxDeclaredValueZAR") ?? 50000m,
            Math.Max(2, config.GetValue<int?>("Consolidation:MaxParcelsPerBox") ?? 6),
            Math.Max(1, config.GetValue<int?>("Consolidation:AwaitingArrivalDays") ?? 7));
    }

    // Parcels that have been booked but have not reached the warehouse yet.
    private static readonly ParcelStatus[] IncomingStatuses =
        [ParcelStatus.PendingApproval, ParcelStatus.Approved, ParcelStatus.AwaitingCheckIn];

    // ══════════════════════════════════════════════════════════════════════
    // UC10 – CUSTOMER
    // ══════════════════════════════════════════════════════════════════════

    public async Task<IEnumerable<EligibleParcelDto>> GetEligibleParcelsAsync(Guid customerUserId, CancellationToken ct = default)
    {
        var customer = await GetCustomerAsync(customerUserId, ct);

        // Parcels in the warehouse, plus parcels still on their way (so the customer can commit early).
        var statuses = new[] { ParcelStatus.InWarehouse, ParcelStatus.PendingApproval, ParcelStatus.Approved, ParcelStatus.AwaitingCheckIn };
        var parcels = await _uow.Query<Parcel>().Query()
            .AsNoTracking()
            .Include(p => p.DeliveryAddress)
            .Where(p => p.CustomerId == customer.Id && statuses.Contains(p.Status)
                        && !p.TrackingNumber.StartsWith(MasterPrefix))
            .OrderBy(p => p.CreatedAt)
            .ToListAsync(ct);

        // Parcels already held by a waiting request are not offered again.
        var waiting = await WaitingParcelIdsAsync(ct);
        if (waiting.Count > 0) parcels = parcels.Where(p => !waiting.Contains(p.Id)).ToList();

        var bins = await BinCodesAsync(parcels.Select(p => p.Id).ToList(), ct);

        return parcels.Select(p => new EligibleParcelDto(
            p.Id, p.TrackingNumber,
            p.DeliveryAddress?.RecipientName ?? "—",
            AddressText(p.DeliveryAddress),
            AddressKey(p.DeliveryAddress),
            p.WeightKg,
            bins.GetValueOrDefault(p.Id),
            p.ServiceType.ToString(),
            p.IsFragile,
            p.SkipConsolidation,
            TimeCriticalReason(p),
            p.Status == ParcelStatus.InWarehouse)).ToList();
    }

    public async Task<ConsolidationPreviewDto> PreviewAsync(ConsolidationRequestDto dto, Guid customerUserId, CancellationToken ct = default)
    {
        var (_, parcels) = await LoadAndValidateAsync(dto, (Guid?)customerUserId, ct, allowIncoming: true);
        var incoming = parcels.Count(p => p.Status != ParcelStatus.InWarehouse);
        return BuildPreview(parcels) with { WaitingCount = incoming, WaitingDays = incoming > 0 ? _options.AwaitingArrivalDays : 0 };
    }

    public async Task<ConsolidationOrderDto> RequestAsync(ConsolidationRequestDto dto, Guid customerUserId, CancellationToken ct = default)
    {
        var (customer, parcels) = await LoadAndValidateAsync(dto, customerUserId, ct, allowIncoming: true);

        // Any parcel still on its way means the request waits for it before the warehouse sees it.
        var incoming = parcels.Count(p => p.Status != ParcelStatus.InWarehouse);
        var awaiting = incoming > 0;
        var order = await CreateOrderAsync(customer, parcels, ConsolidationSource.Customer, ct, awaiting);

        await SafeAuditAsync("CONSOLIDATION_REQUESTED", order.Id, null,
            new { order.OrderNumber, order.ParcelCount, Source = order.Source.ToString(), AwaitingArrival = awaiting }, customerUserId, ct);
        if (awaiting)
            await SafeNotifyAsync(customerUserId, "Consolidation request saved",
                $"Order {order.OrderNumber}: we are holding {order.ParcelCount} parcels together. {incoming} still on the way. " +
                $"Once they all reach the warehouse, staff will review the request. If they do not arrive within {_options.AwaitingArrivalDays} days, it is released.", ct);
        else
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
        if (order.Status is not (ConsolidationOrderStatus.Pending or ConsolidationOrderStatus.AwaitingArrival
                                 or ConsolidationOrderStatus.AwaitingApproval))
            throw new BadRequestException(
                $"Only orders the warehouse has not started can be cancelled (currently '{order.Status}').");

        // An order the system or staff created is opted out of: the parcels ship on their own,
        // otherwise the next sweep would simply create the same order again.
        var automatic = order.Source != ConsolidationSource.Customer;

        var parcels = await LoadOrderParcelsAsync(order.Id, ct);
        foreach (var p in parcels)
        {
            if (p.Status == ParcelStatus.ConsolidationRequested) p.Status = ParcelStatus.InWarehouse;   // parcels still on their way keep their status
            if (automatic) p.SkipConsolidation = true;
            p.UpdatedAt = DateTime.UtcNow;
            await AddEventAsync(p, TrackingEventType.ConsolidationRequested,
                automatic
                    ? $"Consolidation order {order.OrderNumber} cancelled by the customer. This parcel will ship on its own."
                    : $"Consolidation order {order.OrderNumber} cancelled by the customer. Parcel stays in the warehouse.", ct);
        }
        order.Status = ConsolidationOrderStatus.Cancelled;
        order.UpdatedAt = DateTime.UtcNow;
        await _uow.SaveChangesAsync(ct);

        await SafeAuditAsync("CONSOLIDATION_CANCELLED", order.Id, null, new { order.OrderNumber }, customerUserId, ct);
        return await MapOneAsync(order, ct);
    }

    // ══════════════════════════════════════════════════════════════════════
    // PRE-ARRIVAL REQUESTS: hold until every parcel arrives, then staff approve or reject
    // ══════════════════════════════════════════════════════════════════════

    /// <summary>Parcels held by a request that is still waiting (AwaitingArrival or AwaitingApproval).</summary>
    private async Task<HashSet<Guid>> WaitingParcelIdsAsync(CancellationToken ct)
    {
        // Two top-level queries merged in memory: correlated subqueries do not translate through the repository wrapper.
        var orderIds = await _uow.Query<ConsolidationOrder>().Query().AsNoTracking()
            .Where(o => o.Status == ConsolidationOrderStatus.AwaitingArrival
                     || o.Status == ConsolidationOrderStatus.AwaitingApproval)
            .Select(o => o.Id).ToListAsync(ct);
        if (orderIds.Count == 0) return new HashSet<Guid>();

        var parcelIds = await _uow.Query<ConsolidationOrderParcel>().Query().AsNoTracking()
            .Where(l => orderIds.Contains(l.OrderId)).Select(l => l.ParcelId).ToListAsync(ct);
        return parcelIds.ToHashSet();
    }

    /// <summary>
    /// Called after a parcel is checked in. If it belongs to a request that is waiting for arrivals, the parcel is
    /// held for that request, and when the last one is here the request moves to AwaitingApproval for staff.
    /// Returns true when the parcel is held by a request (so it is not offered for a new one).
    /// </summary>
    public async Task<bool> OnParcelArrivedAsync(Guid parcelId, CancellationToken ct = default)
    {
        var orderIds = await _uow.Query<ConsolidationOrderParcel>().Query().AsNoTracking()
            .Where(l => l.ParcelId == parcelId).Select(l => l.OrderId).ToListAsync(ct);
        if (orderIds.Count == 0) return false;

        var order = await _uow.Query<ConsolidationOrder>().Query()
            .FirstOrDefaultAsync(o => orderIds.Contains(o.Id) && o.Status == ConsolidationOrderStatus.AwaitingArrival, ct);
        if (order is null) return false;

        var parcels = await LoadOrderParcelsAsync(order.Id, ct);
        var arrived = parcels.FirstOrDefault(p => p.Id == parcelId);
        if (arrived is null) return false;

        // Reserve it so it cannot be dispatched on its own while the request is waiting.
        arrived.Status = ParcelStatus.ConsolidationRequested;
        arrived.UpdatedAt = DateTime.UtcNow;
        await AddEventAsync(arrived, TrackingEventType.ConsolidationRequested,
            $"Received at the warehouse and held for consolidation request {order.OrderNumber}.", ct);

        var complete = parcels.All(p => p.Status == ParcelStatus.ConsolidationRequested);
        if (complete)
        {
            order.Status = ConsolidationOrderStatus.AwaitingApproval;
            order.UpdatedAt = DateTime.UtcNow;
        }
        await _uow.SaveChangesAsync(ct);

        if (complete)
        {
            var userId = await CustomerUserIdAsync(order.CustomerId, ct);
            if (userId is not null)
            {
                await SafeAuditAsync("CONSOLIDATION_ALL_ARRIVED", order.Id, null, new { order.OrderNumber }, userId.Value, ct);
                await SafeNotifyAsync(userId.Value, "All your parcels have arrived",
                    $"Order {order.OrderNumber}: every parcel is now in the warehouse. Staff are reviewing the request and will pack it next.", ct);
            }
        }
        return true;
    }

    public async Task<ConsolidationOrderDto> ApproveAsync(Guid orderId, Guid staffUserId, CancellationToken ct = default)
    {
        var order = await GetOrderOrThrowAsync(orderId, ct);
        if (order.Status != ConsolidationOrderStatus.AwaitingApproval)
            throw new BadRequestException(
                $"Only a request whose parcels have all arrived can be approved (currently '{order.Status}').");

        var parcels = await LoadOrderParcelsAsync(order.Id, ct);
        var missing = parcels.Where(p => p.Status != ParcelStatus.ConsolidationRequested).ToList();
        if (missing.Count > 0)
            throw new BadRequestException(
                $"{missing.Count} parcel(s) are not held in the warehouse: {string.Join(", ", missing.Select(p => p.TrackingNumber))}.");

        // Re-check the box rules on the parcels as they actually arrived.
        var problem = GroupProblem(parcels, await MaxPayloadAsync(ct));
        if (problem is not null)
            throw new BadRequestException($"This group can no longer be packed together. {problem} Reject the request and give the customer the reason.");

        var preview = BuildPreview(parcels);
        order.ParcelCount = preview.ParcelCount;
        order.CombinedWeightKg = preview.CombinedWeightKg;
        order.SeparateShippingZAR = preview.SeparateShippingZAR;
        order.ConsolidatedShippingZAR = preview.ConsolidatedShippingZAR;
        order.SavingZAR = preview.SavingZAR;
        order.Status = ConsolidationOrderStatus.Pending;
        order.ApprovedAt = DateTime.UtcNow;
        order.ApprovedByStaffId = staffUserId;
        order.ExpiresAt = null;
        order.UpdatedAt = DateTime.UtcNow;

        foreach (var p in parcels)
            await AddEventAsync(p, TrackingEventType.ConsolidationRequested,
                $"Consolidation request {order.OrderNumber} approved by warehouse staff. Queued for packing.", ct);
        await _uow.SaveChangesAsync(ct);

        await SafeAuditAsync("CONSOLIDATION_APPROVED", order.Id, null, new { order.OrderNumber, order.ParcelCount }, staffUserId, ct);
        var customerUserId = await CustomerUserIdAsync(order.CustomerId, ct);
        if (customerUserId is not null)
            await SafeNotifyAsync(customerUserId.Value, "Consolidation approved",
                $"Order {order.OrderNumber} was approved. Your {order.ParcelCount} parcels are now being packed into one shipment.", ct);

        return await MapOneAsync(order, ct);
    }

    public async Task<ConsolidationOrderDto> RejectAsync(Guid orderId, RejectConsolidationDto dto, Guid staffUserId, CancellationToken ct = default)
    {
        var reason = (dto.Reason ?? string.Empty).Trim();
        if (reason.Length < 5)
            throw new BadRequestException("Give the customer a reason for rejecting this request (at least 5 characters).");

        var order = await GetOrderOrThrowAsync(orderId, ct);
        if (order.Status != ConsolidationOrderStatus.AwaitingApproval)
            throw new BadRequestException(
                $"Only a request whose parcels have all arrived can be rejected (currently '{order.Status}').");

        var parcels = await LoadOrderParcelsAsync(order.Id, ct);
        await CloseWaitingOrderAsync(order, parcels, reason, shipSeparately: true,
            $"Consolidation request {order.OrderNumber} was rejected by the warehouse: {reason} This parcel will ship on its own.", ct);
        await _uow.SaveChangesAsync(ct);

        await SafeAuditAsync("CONSOLIDATION_REJECTED", order.Id, null, new { order.OrderNumber, Reason = reason }, staffUserId, ct);
        var customerUserId = await CustomerUserIdAsync(order.CustomerId, ct);
        if (customerUserId is not null)
            await SafeNotifyAsync(customerUserId.Value, "Consolidation request rejected",
                $"Order {order.OrderNumber} could not be combined: {reason} Your parcels will ship separately. You can send a new request.", ct);

        return await MapOneAsync(order, ct);
    }

    /// <summary>
    /// Housekeeping for waiting requests: closes any whose waiting period ran out, whose parcel was cancelled,
    /// lost or returned, or that staff never reviewed within <paramref name="approvalMaxAge"/>. Frees the parcels.
    /// </summary>
    public async Task<int> ReleaseWaitingOrdersAsync(TimeSpan approvalMaxAge, CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;
        var open = await _uow.Query<ConsolidationOrder>().Query()
            .Where(o => o.Status == ConsolidationOrderStatus.AwaitingArrival
                     || o.Status == ConsolidationOrderStatus.AwaitingApproval)
            .ToListAsync(ct);
        if (open.Count == 0) return 0;

        var closed = new List<(ConsolidationOrder Order, string Reason)>();
        foreach (var order in open)
        {
            var parcels = await LoadOrderParcelsAsync(order.Id, ct);
            var dead = parcels.FirstOrDefault(p => p.Status is ParcelStatus.Cancelled or ParcelStatus.Lost or ParcelStatus.Returned);

            string? reason = null;
            if (dead is not null)
                reason = $"Parcel {dead.TrackingNumber} was cancelled, lost or returned, so the group can no longer be combined.";
            else if (order.Status == ConsolidationOrderStatus.AwaitingArrival && order.ExpiresAt is { } expires && expires < now)
                reason = $"Not every parcel reached the warehouse within {_options.AwaitingArrivalDays} days.";
            else if (order.Status == ConsolidationOrderStatus.AwaitingApproval && order.UpdatedAt < now - approvalMaxAge)
                reason = "The warehouse did not review the request in time.";
            if (reason is null) continue;

            await CloseWaitingOrderAsync(order, parcels, reason, shipSeparately: false,
                $"Consolidation request {order.OrderNumber} was closed: {reason} This parcel ships on its own unless you request again.", ct);
            closed.Add((order, reason));
        }
        if (closed.Count == 0) return 0;
        await _uow.SaveChangesAsync(ct);

        foreach (var (order, reason) in closed)
        {
            var customerUserId = await CustomerUserIdAsync(order.CustomerId, ct);
            if (customerUserId is null) continue;
            await SafeAuditAsync("CONSOLIDATION_RELEASED", order.Id, null, new { order.OrderNumber, Reason = reason }, customerUserId.Value, ct);
            await SafeNotifyAsync(customerUserId.Value, "Consolidation request closed",
                $"Order {order.OrderNumber} was closed: {reason} Your parcels will ship separately. You can send a new request.", ct);
        }
        return closed.Count;
    }

    /// <summary>Cancels a waiting order and frees every parcel it was holding (parcels still on their way keep their status).</summary>
    private async Task CloseWaitingOrderAsync(
        ConsolidationOrder order, List<Parcel> parcels, string reason, bool shipSeparately, string eventText, CancellationToken ct)
    {
        foreach (var p in parcels)
        {
            if (p.Status is ParcelStatus.Cancelled or ParcelStatus.Lost or ParcelStatus.Returned) continue;
            if (p.Status == ParcelStatus.ConsolidationRequested) p.Status = ParcelStatus.InWarehouse;
            if (shipSeparately) p.SkipConsolidation = true;
            p.UpdatedAt = DateTime.UtcNow;
            await AddEventAsync(p, TrackingEventType.ConsolidationRequested, eventText, ct);
        }
        order.Status = ConsolidationOrderStatus.Cancelled;
        order.ClosedReason = reason;
        order.UpdatedAt = DateTime.UtcNow;
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
            .Where(o => o.Status == ConsolidationOrderStatus.Pending && o.CreatedAt < cutoff
                         && o.Source == ConsolidationSource.Customer)
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
                                  || o.Status == ConsolidationOrderStatus.AwaitingApproval
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
    // AUTOMATIC CONSOLIDATION – the business groups parcels, the customer is informed and can opt out
    // ══════════════════════════════════════════════════════════════════════
    /// <summary>
    /// One sweep. For every customer and destination address:
    ///  1. Tells the customer when another parcel for that address is still on its way (once per parcel).
    ///  2. Looks at the compatible parcels already in the warehouse. If nothing more is coming, or the hold window
    ///     (HoldHours after the first one arrived) has passed, then by preference:
    ///       Auto     -> creates the consolidation order and notifies the customer,
    ///       AskFirst -> notifies the customer once; they confirm on the Consolidation page,
    ///       Never    -> does nothing.
    /// Express, Overnight and Same-day parcels and parcels marked "Ship separately" are never touched.
    /// </summary>
    public async Task<AutoConsolidationResult> RunAutomationAsync(CancellationToken ct = default)
    {
        var now = DateTime.UtcNow;
        var parcels = await LoadActiveParcelsAsync(null, track: true, ct);
        if (parcels.Count == 0) return new AutoConsolidationResult(0, 0, 0);

        var arrivals = await ArrivalTimesAsync(parcels.Where(p => p.Status == ParcelStatus.InWarehouse).Select(p => p.Id).ToList(), ct);
        var maxPayload = await MaxPayloadAsync(ct);

        var customerIds = parcels.Select(p => p.CustomerId).Distinct().ToList();
        var customers = await _uow.Query<CustomerProfile>().Query().AsNoTracking()
            .Where(c => customerIds.Contains(c.Id)).ToDictionaryAsync(c => c.Id, ct);

        int created = 0, hints = 0, readyNotices = 0;

        foreach (var dest in parcels.GroupBy(p => (p.CustomerId, Key: AddressKey(p.DeliveryAddress))))
        {
            if (!customers.TryGetValue(dest.Key.CustomerId, out var customer)) continue;
            var pref = customer.ConsolidationPreference;
            if (pref == ConsolidationPreference.Never) continue;

            var eligible = dest.Where(IsEligible).ToList();
            if (eligible.Count < 2) continue;

            var inWh = eligible.Where(p => p.Status == ParcelStatus.InWarehouse).OrderBy(p => ArrivedAt(p, arrivals)).ToList();
            var incoming = eligible.Where(p => IncomingStatuses.Contains(p.Status)).ToList();
            var address = AddressText(dest.First().DeliveryAddress);

            try
            {
                // 1. Another parcel is on its way: tell the customer once.
                if (incoming.Count > 0 && eligible.Any(p => p.ConsolidationHintSentAt == null))
                {
                    var all = BuildPreview(eligible);
                    var follow = pref == ConsolidationPreference.Auto
                        ? $"We will wait up to {_options.HoldHours} hours for the rest, then combine them automatically."
                        : "Open the Consolidation page to confirm once they have all arrived.";
                    await SafeNotifyAsync(customer.UserId, "Another parcel is on its way to the same address",
                        $"You have {eligible.Count} parcels going to {address}: {inWh.Count} in our warehouse and {incoming.Count} still on the way. " +
                        $"Combining them would save you about R{all.SavingZAR:0.00} ({all.SavingPercent}%). {follow} " +
                        "You can change this or choose \"Ship separately\" on the Consolidation page.", ct);
                    foreach (var p in eligible) { p.ConsolidationHintSentAt = now; p.UpdatedAt = now; }
                    hints++;
                }

                // 2. Parcels in the warehouse: ready once nothing more is coming, or the hold window has passed.
                if (inWh.Count < 2) continue;
                var holdUntil = inWh.Min(p => ArrivedAt(p, arrivals)).AddHours(_options.HoldHours);
                if (incoming.Count > 0 && now < holdUntil) continue;

                foreach (var group in Partition(inWh, maxPayload).Where(g => g.Count >= 2))
                {
                    var preview = BuildPreview(group);

                    if (pref == ConsolidationPreference.Auto)
                    {
                        var order = await CreateOrderAsync(customer, group, ConsolidationSource.System, ct);
                        await SafeAuditAsync("CONSOLIDATION_AUTO_CREATED", order.Id, null,
                            new { order.OrderNumber, order.ParcelCount, Source = "System" }, customer.UserId, ct);
                        await SafeNotifyAsync(customer.UserId, "We are combining your parcels",
                            $"{order.ParcelCount} parcels going to {address} are being packed into one shipment ({order.OrderNumber}). " +
                            $"You will save about R{preview.SavingZAR:0.00}. Not what you want? Cancel before the warehouse starts, from the Consolidation page.", ct);
                        created++;
                    }
                    else if (group.Any(p => p.ConsolidationReadySentAt == null))
                    {
                        await SafeNotifyAsync(customer.UserId, "Your parcels are ready to combine",
                            $"{group.Count} parcels going to {address} are in our warehouse. Confirm on the Consolidation page " +
                            $"to combine them into one shipment and save about R{preview.SavingZAR:0.00}.", ct);
                        foreach (var p in group) { p.ConsolidationReadySentAt = now; p.UpdatedAt = now; }
                        readyNotices++;
                    }
                }
            }
            catch (Exception ex)
            {
                // One bad group must not stop the sweep for everybody else.
                Console.WriteLine($"[CONSOLIDATION] Sweep failed for {address}: {ex.Message}");
            }
        }

        await _uow.SaveChangesAsync(ct);
        return new AutoConsolidationResult(created, hints, readyNotices);
    }

    /// <summary>What the customer sees: per destination, parcels here, parcels still coming, saving and what happens next.</summary>
    public async Task<IEnumerable<ConsolidationOutlookGroupDto>> GetOutlookAsync(Guid customerUserId, CancellationToken ct = default)
    {
        var customer = await GetCustomerAsync(customerUserId, ct);
        var parcels = await LoadActiveParcelsAsync(customer.Id, track: false, ct);
        var arrivals = await ArrivalTimesAsync(parcels.Where(p => p.Status == ParcelStatus.InWarehouse).Select(p => p.Id).ToList(), ct);
        var maxPayload = await MaxPayloadAsync(ct);
        var pref = customer.ConsolidationPreference;
        var now = DateTime.UtcNow;

        var result = new List<ConsolidationOutlookGroupDto>();
        foreach (var g in parcels.GroupBy(p => AddressKey(p.DeliveryAddress)))
        {
            var all = g.ToList();
            if (all.Count < 2) continue;

            var eligible = all.Where(IsEligible).ToList();
            var inWh = eligible.Where(p => p.Status == ParcelStatus.InWarehouse).OrderBy(p => ArrivedAt(p, arrivals)).ToList();
            var incoming = eligible.Where(p => IncomingStatuses.Contains(p.Status)).ToList();
            DateTime? holdUntil = inWh.Count > 0 ? inWh.Min(p => ArrivedAt(p, arrivals)).AddHours(_options.HoldHours) : null;

            string state, message;
            ConsolidationPreviewDto? preview = null;

            if (eligible.Count < 2)
            {
                state = "ShippingSeparately";
                message = all.Any(p => IsTimeCritical(p.ServiceType))
                    ? "Express, Overnight and Same-day parcels ship on their own, so these will not be combined."
                    : "You chose to ship these parcels separately. Tap \"Combine again\" if you change your mind.";
            }
            else if (inWh.Count < 2 || (incoming.Count > 0 && now < holdUntil))
            {
                preview = BuildPreview(eligible);
                var saving = $"about R{preview.SavingZAR:0.00} ({preview.SavingPercent}%)";
                if (pref == ConsolidationPreference.Never)
                {
                    state = "Paused";
                    message = "Automatic consolidation is off for your account. Once two parcels are in the warehouse you can still combine them yourself.";
                }
                else
                {
                    state = "Waiting";
                    message = inWh.Count == 0
                        ? $"{incoming.Count} parcels are on their way to this address. Once two reach our warehouse we will combine them and you save {saving}."
                        : $"{inWh.Count} in our warehouse, {incoming.Count} still on the way. We are holding them for the rest so you get the bigger saving ({saving}), " +
                          (pref == ConsolidationPreference.Auto ? "then we combine them automatically." : "then you confirm.");
                }
            }
            else if (Partition(inWh, maxPayload).All(x => x.Count < 2))
            {
                state = "Blocked";
                message = GroupProblem(inWh, maxPayload) ?? "These parcels cannot be packed together.";
            }
            else
            {
                preview = BuildPreview(inWh);
                var saving = $"about R{preview.SavingZAR:0.00} ({preview.SavingPercent}%)";
                (state, message) = pref switch
                {
                    ConsolidationPreference.Auto => ("Combining", $"These {inWh.Count} parcels are ready. We will combine them automatically shortly. You save {saving}."),
                    ConsolidationPreference.AskFirst => ("ReadyToConfirm", $"These {inWh.Count} parcels are ready to combine. Confirm to save {saving}."),
                    _ => ("Paused", $"These {inWh.Count} parcels can be combined (save {saving}). Automatic consolidation is off, so tap \"Combine now\" if you want it.")
                };
            }

            result.Add(new ConsolidationOutlookGroupDto(
                g.Key, AddressText(all[0].DeliveryAddress), state, message, holdUntil,
                inWh.Count, incoming.Count, preview,
                all.Select(p => new OutlookParcelDto(
                    p.Id, p.TrackingNumber, p.Status.ToString(), p.Status == ParcelStatus.InWarehouse, p.WeightKg,
                    p.ServiceType.ToString(), p.IsFragile, p.SkipConsolidation,
                    p.Status == ParcelStatus.InWarehouse ? ArrivedAt(p, arrivals) : null,
                    TimeCriticalReason(p))).ToList()));
        }

        static int Rank(string s) => s switch { "ReadyToConfirm" => 0, "Combining" => 1, "Waiting" => 2, "Paused" => 3, "Blocked" => 4, _ => 5 };
        return result.OrderBy(r => Rank(r.State)).ToList();
    }

    public async Task<ConsolidationPreferenceDto> GetPreferenceAsync(Guid customerUserId, CancellationToken ct = default)
    {
        var customer = await GetCustomerAsync(customerUserId, ct);
        return new ConsolidationPreferenceDto(customer.ConsolidationPreference.ToString(), _options.HoldHours);
    }

    public async Task<ConsolidationPreferenceDto> SetPreferenceAsync(Guid customerUserId, SetConsolidationPreferenceDto dto, CancellationToken ct = default)
    {
        if (!Enum.TryParse<ConsolidationPreference>(dto.Preference, true, out var pref))
            throw new BadRequestException("Choose Auto, AskFirst or Never.");

        var customer = await _uow.Query<CustomerProfile>().Query().FirstOrDefaultAsync(c => c.UserId == customerUserId, ct)
                       ?? throw new NotFoundException("Customer profile not found.");
        customer.ConsolidationPreference = pref;
        customer.UpdatedAt = DateTime.UtcNow;
        await _uow.SaveChangesAsync(ct);
        return new ConsolidationPreferenceDto(pref.ToString(), _options.HoldHours);
    }

    /// <summary>"Ship now": this parcel is never combined. Turning it off lets the sweep include it again.</summary>
    public async Task SetShipAloneAsync(Guid parcelId, bool shipAlone, Guid customerUserId, CancellationToken ct = default)
    {
        var customer = await GetCustomerAsync(customerUserId, ct);
        var parcel = await _uow.Query<Parcel>().Query().FirstOrDefaultAsync(p => p.Id == parcelId, ct)
                     ?? throw new NotFoundException("Parcel not found.");
        if (parcel.CustomerId != customer.Id)
            throw new ForbiddenException("You can only change your own parcels.");
        if (parcel.Status != ParcelStatus.InWarehouse && !IncomingStatuses.Contains(parcel.Status))
            throw new BadRequestException($"{parcel.TrackingNumber} is already part of a shipment or has left the warehouse.");

        parcel.SkipConsolidation = shipAlone;
        if (!shipAlone) parcel.ConsolidationReadySentAt = null;
        parcel.UpdatedAt = DateTime.UtcNow;
        await _uow.SaveChangesAsync(ct);
    }

    /// <summary>Groups the warehouse could combine right now, with the reason the system has not done it yet.</summary>
    public async Task<IEnumerable<ConsolidationSuggestionDto>> GetSuggestionsAsync(CancellationToken ct = default)
    {
        var parcels = await LoadActiveParcelsAsync(null, track: false, ct);
        var arrivals = await ArrivalTimesAsync(parcels.Where(p => p.Status == ParcelStatus.InWarehouse).Select(p => p.Id).ToList(), ct);
        var maxPayload = await MaxPayloadAsync(ct);
        var now = DateTime.UtcNow;

        var ids = parcels.Select(p => p.CustomerId).Distinct().ToList();
        var customers = await _uow.Query<CustomerProfile>().Query().AsNoTracking().Include(c => c.User)
            .Where(c => ids.Contains(c.Id)).ToDictionaryAsync(c => c.Id, ct);
        var bins = await BinCodesAsync(parcels.Where(p => p.Status == ParcelStatus.InWarehouse).Select(p => p.Id).ToList(), ct);

        var result = new List<ConsolidationSuggestionDto>();
        foreach (var dest in parcels.GroupBy(p => (p.CustomerId, Key: AddressKey(p.DeliveryAddress))))
        {
            if (!customers.TryGetValue(dest.Key.CustomerId, out var c)) continue;

            var eligible = dest.Where(IsEligible).ToList();
            var inWh = eligible.Where(p => p.Status == ParcelStatus.InWarehouse).OrderBy(p => ArrivedAt(p, arrivals)).ToList();
            if (inWh.Count < 2) continue;
            var incoming = eligible.Count(p => IncomingStatuses.Contains(p.Status));
            var holdUntil = inWh.Min(p => ArrivedAt(p, arrivals)).AddHours(_options.HoldHours);
            var holding = incoming > 0 && now < holdUntil;
            var name = !string.IsNullOrWhiteSpace(c.CompanyName) ? c.CompanyName! : $"{c.User?.FirstName} {c.User?.LastName}".Trim();

            foreach (var group in Partition(inWh, maxPayload).Where(g => g.Count >= 2))
            {
                var preview = BuildPreview(group);
                var (state, reason) = c.ConsolidationPreference == ConsolidationPreference.Never
                    ? ("OptedOut", "The customer switched automatic consolidation off.")
                    : holding
                        ? ("Holding", $"Holding for {incoming} more parcel(s) that are still on the way.")
                        : c.ConsolidationPreference == ConsolidationPreference.AskFirst
                            ? ("AwaitingCustomer", "The customer chose to confirm first.")
                            : ("NextSweep", "Ready. The automatic sweep will create this order on its next run.");

                result.Add(new ConsolidationSuggestionDto(
                    c.Id, name, c.ConsolidationPreference.ToString(),
                    AddressText(group[0].DeliveryAddress), group[0].DeliveryAddress?.City ?? "—",
                    group.Count, incoming, preview.CombinedWeightKg, preview.SavingZAR,
                    holdUntil, state, reason,
                    group.Select(p => new ConsolidationParcelDto(p.Id, p.TrackingNumber, p.WeightKg, bins.GetValueOrDefault(p.Id), false)).ToList()));
            }
        }
        return result.OrderBy(r => r.State == "Holding" ? 1 : 0).ThenBy(r => r.CustomerName).ToList();
    }

    /// <summary>Warehouse staff do not wait for the sweep: consolidate this group now.</summary>
    public async Task<ConsolidationOrderDto> ConsolidateNowAsync(ConsolidationRequestDto dto, Guid staffUserId, CancellationToken ct = default)
    {
        var (customer, parcels) = await LoadAndValidateAsync(dto, null, ct);

        var alone = parcels.FirstOrDefault(p => p.SkipConsolidation);
        if (alone is not null)
            throw new BadRequestException($"The customer asked for {alone.TrackingNumber} to ship on its own.");

        var order = await CreateOrderAsync(customer, parcels, ConsolidationSource.Staff, ct);

        await SafeAuditAsync("CONSOLIDATION_STAFF_CREATED", order.Id, null,
            new { order.OrderNumber, order.ParcelCount, Source = "Staff" }, staffUserId, ct);
        await SafeNotifyAsync(customer.UserId, "We are combining your parcels",
            $"Our warehouse team grouped {order.ParcelCount} parcels going to {order.DestinationSummary} into one shipment ({order.OrderNumber}). " +
            $"You will save about R{order.SavingZAR:0.00}.", ct);

        return await MapOneAsync(order, ct);
    }

    /// <summary>Creates the order, links the parcels and moves them to ConsolidationRequested. Saves.</summary>
    private async Task<ConsolidationOrder> CreateOrderAsync(
        CustomerProfile customer, List<Parcel> parcels, ConsolidationSource source, CancellationToken ct,
        bool awaitingArrival = false)
    {
        var preview = BuildPreview(parcels);
        var address = parcels[0].DeliveryAddress;

        var order = new ConsolidationOrder
        {
            Id = Guid.NewGuid(),
            OrderNumber = await NextOrderNumberAsync(ct),
            CustomerId = customer.Id,
            Status = awaitingArrival ? ConsolidationOrderStatus.AwaitingArrival : ConsolidationOrderStatus.Pending,
            ExpiresAt = awaitingArrival ? DateTime.UtcNow.AddDays(_options.AwaitingArrivalDays) : null,
            Source = source,
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

        var why = awaitingArrival
            ? $"Customer requested consolidation ({order.OrderNumber}). Held until the other parcel(s) arrive, then reviewed by warehouse staff."
            : source switch
        {
            ConsolidationSource.System => $"Grouped automatically with {parcels.Count - 1} other parcel(s) going to the same address. Work order {order.OrderNumber} sent to the warehouse.",
            ConsolidationSource.Staff => $"Warehouse staff grouped this parcel with {parcels.Count - 1} other parcel(s). Work order {order.OrderNumber} sent to the warehouse.",
            _ => $"Customer requested consolidation. Work order {order.OrderNumber} sent to the warehouse."
        };

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

            var onItsWay = awaitingArrival && p.Status != ParcelStatus.InWarehouse;
            if (!onItsWay) p.Status = ParcelStatus.ConsolidationRequested;   // a parcel still on its way keeps its status so check-in works
            if (source == ConsolidationSource.Customer) p.SkipConsolidation = false;   // asking to combine = opting back in
            p.UpdatedAt = DateTime.UtcNow;
            await AddEventAsync(p, TrackingEventType.ConsolidationRequested,
                onItsWay ? $"Included in consolidation request {order.OrderNumber}. It will be held with the other parcels once it reaches the warehouse." : why, ct);
        }

        await _uow.SaveChangesAsync(ct);
        return order;
    }

    private async Task<List<Parcel>> LoadActiveParcelsAsync(Guid? customerId, bool track, CancellationToken ct)
    {
        var statuses = new[] { ParcelStatus.InWarehouse, ParcelStatus.PendingApproval, ParcelStatus.Approved, ParcelStatus.AwaitingCheckIn };
        IQueryable<Parcel> q = _uow.Query<Parcel>().Query().Include(p => p.DeliveryAddress);
        if (!track) q = q.AsNoTracking();
        q = q.Where(p => statuses.Contains(p.Status) && !p.TrackingNumber.StartsWith(MasterPrefix));
        if (customerId.HasValue) q = q.Where(p => p.CustomerId == customerId.Value);
        var list = await q.OrderBy(p => p.CreatedAt).ToListAsync(ct);

        // Parcels held by a waiting pre-arrival request are handled by that request, not the automatic sweep.
        var waiting = await WaitingParcelIdsAsync(ct);
        return waiting.Count == 0 ? list : list.Where(p => !waiting.Contains(p.Id)).ToList();
    }

    /// <summary>When each parcel last reached the warehouse (the start of its hold window).</summary>
    private async Task<Dictionary<Guid, DateTime>> ArrivalTimesAsync(List<Guid> parcelIds, CancellationToken ct)
    {
        if (parcelIds.Count == 0) return [];
        var rows = await _uow.Query<TrackingEvent>().Query().AsNoTracking()
            .Where(e => parcelIds.Contains(e.ParcelId) && e.EventType == TrackingEventType.ReceivedAtWarehouse)
            .GroupBy(e => e.ParcelId)
            .Select(g => new { ParcelId = g.Key, At = g.Max(e => e.OccurredAt) })
            .ToListAsync(ct);
        return rows.ToDictionary(r => r.ParcelId, r => r.At);
    }

    private static DateTime ArrivedAt(Parcel p, Dictionary<Guid, DateTime> arrivals)
        => arrivals.TryGetValue(p.Id, out var t) ? t : p.UpdatedAt;

    // ══════════════════════════════════════════════════════════════════════
    // HELPERS
    // ══════════════════════════════════════════════════════════════════════

    /// <param name="customerUserId">The customer's user id, or null when warehouse staff act for any customer.</param>
    private async Task<(CustomerProfile customer, List<Parcel> parcels)> LoadAndValidateAsync(
        ConsolidationRequestDto dto, Guid? customerUserId, CancellationToken ct, bool allowIncoming = false)
    {
        var ids = (dto.ParcelIds ?? []).Distinct().ToList();
        if (ids.Count < 2)
            throw new BadRequestException("Select at least two parcels to consolidate.");

        var parcels = await _uow.Query<Parcel>().Query()
            .Include(p => p.DeliveryAddress)
            .Where(p => ids.Contains(p.Id))
            .ToListAsync(ct);

        if (parcels.Count != ids.Count)
            throw new NotFoundException("One or more selected parcels were not found.");

        CustomerProfile customer;
        if (customerUserId.HasValue)
        {
            customer = await GetCustomerAsync(customerUserId.Value, ct);
            if (parcels.Any(p => p.CustomerId != customer.Id))
                throw new ForbiddenException("You can only consolidate your own parcels.");
        }
        else
        {
            var owners = parcels.Select(p => p.CustomerId).Distinct().ToList();
            if (owners.Count > 1)
                throw new BadRequestException("All parcels must belong to the same customer.");
            customer = await _uow.Query<CustomerProfile>().Query().AsNoTracking().FirstOrDefaultAsync(c => c.Id == owners[0], ct)
                       ?? throw new NotFoundException("Customer profile not found.");
        }

        var held = await WaitingParcelIdsAsync(ct);
        var already = parcels.FirstOrDefault(p => held.Contains(p.Id));
        if (already is not null)
            throw new BadRequestException($"Parcel {already.TrackingNumber} is already part of a waiting consolidation request.");

        foreach (var p in parcels)
        {
            var allowed = p.Status == ParcelStatus.InWarehouse || (allowIncoming && IncomingStatuses.Contains(p.Status));
            if (!allowed)
                throw new BadRequestException(allowIncoming
                    ? $"Parcel {p.TrackingNumber} cannot be consolidated right now (status: {p.Status})."
                    : $"Parcel {p.TrackingNumber} is not awaiting dispatch in the warehouse (status: {p.Status}).");
        }

        if (parcels.Select(p => AddressKey(p.DeliveryAddress)).Distinct().Count() > 1)
            throw new BadRequestException("All selected parcels must be going to the same destination address.");

        // The same rules the automatic sweep applies.
        var problem = GroupProblem(parcels, await MaxPayloadAsync(ct));
        if (problem is not null) throw new BadRequestException(problem);

        return (customer, parcels);
    }

    // ══════════════════════════════════════════════════════════════════════
    // CONSOLIDATION RULES (shared by customer requests, staff and the automatic sweep)
    // ══════════════════════════════════════════════════════════════════════

    internal static bool IsTimeCritical(ServiceType t) => t is ServiceType.Express or ServiceType.Overnight or ServiceType.SameDay;

    private static string? TimeCriticalReason(Parcel p)
        => IsTimeCritical(p.ServiceType)
            ? $"{p.ServiceType} parcels always ship on their own so they are never delayed."
            : null;

    private static bool IsEligible(Parcel p) => !p.SkipConsolidation && !IsTimeCritical(p.ServiceType);

    private async Task<decimal?> MaxPayloadAsync(CancellationToken ct)
        => await _uow.Query<Vehicle>().Query().AsNoTracking()
            .Where(v => v.Status == VehicleStatus.Active)
            .Select(v => (decimal?)v.PayloadCapacityKg)
            .MaxAsync(ct);

    /// <summary>
    /// Returns why these parcels cannot share one master box, or null when they can.
    /// Rules: time-critical services never combine, at most N parcels per box, the box must fit on our
    /// largest vehicle, the combined declared value must stay inside the cover limit, and fragile items
    /// are not packed with heavy parcels.
    /// </summary>
    private string? GroupProblem(IReadOnlyList<Parcel> group, decimal? maxPayload)
    {
        var critical = group.FirstOrDefault(p => IsTimeCritical(p.ServiceType));
        if (critical is not null)
            return $"{critical.TrackingNumber} is a {critical.ServiceType} parcel. {TimeCriticalReason(critical)}";

        if (group.Count > _options.MaxParcelsPerBox)
            return $"One master box holds at most {_options.MaxParcelsPerBox} parcels. Select fewer parcels.";

        var weight = group.Sum(p => p.WeightKg);
        if (maxPayload.HasValue && weight > maxPayload.Value)
            return $"These parcels weigh {weight:0.##} kg together, which is more than our largest vehicle can carry " +
                   $"({maxPayload.Value:0.##} kg). Select fewer parcels.";

        var value = group.Sum(p => p.DeclaredValueZAR ?? 0m);
        if (value > _options.MaxDeclaredValueZAR)
            return $"Their combined declared value (R{value:N0}) is above the R{_options.MaxDeclaredValueZAR:N0} cover limit for one box.";

        if (group.Any(p => p.IsFragile))
        {
            var heavy = group.FirstOrDefault(p => !p.IsFragile && p.WeightKg > _options.FragileMaxCompanionKg);
            if (heavy is not null)
                return $"{heavy.TrackingNumber} ({heavy.WeightKg:0.#} kg) is too heavy to be packed with fragile items " +
                       $"(limit {_options.FragileMaxCompanionKg:0.#} kg).";
        }
        return null;
    }

    /// <summary>First-fit grouping: each parcel joins the first group it is compatible with, otherwise starts a new one.</summary>
    private List<List<Parcel>> Partition(IEnumerable<Parcel> ordered, decimal? maxPayload)
    {
        var groups = new List<List<Parcel>>();
        foreach (var p in ordered)
        {
            var target = groups.FirstOrDefault(g => GroupProblem([.. g, p], maxPayload) is null);
            if (target is not null) target.Add(p); else groups.Add([p]);
        }
        return groups;
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
                 .ToList(),
            o.Source.ToString(), o.ExpiresAt, o.ClosedReason)).ToList();
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