using System.Text.Json;
using CourierSA.Application.DTOs.Payload;
using CourierSA.Application.Interfaces.Repositories;
using CourierSA.Application.Interfaces.Services;
using CourierSA.Domain.Entities;
using CourierSA.Domain.Enums;
using CourierSA.Domain.Exceptions;
using Microsoft.EntityFrameworkCore;

namespace CourierSA.Infrastructure.Services;

/// <summary>
/// UC14 Validate and Adjust Vehicle Payload / UC15 Split Overloaded Routes.
///
/// UC14: the dispatcher sees every run for the day with its load against the vehicle maximum,
/// moves excess parcels to another run (or back to the queue), then confirms and signs off the
/// manifest. Warehouse release (ParcelService.ReleaseRouteAsync) is blocked until a run is signed off,
/// and any later change to a manifest clears its sign-off.
///
/// UC15: for an overloaded run the dispatcher picks a standby driver and a standby vehicle,
/// previews the proposed split, then confirms. Confirming finalises (signs off) both manifests.
/// </summary>
public class PayloadService : IPayloadService
{
    private static readonly RouteStatus[] EditableStatuses =
        [RouteStatus.PendingPayloadReview, RouteStatus.Planned, RouteStatus.PayloadCompliant];

    private static readonly ParcelStatus[] DispatchableStatuses =
        [ParcelStatus.CheckedOut, ParcelStatus.Approved, ParcelStatus.FailedDelivery];

    private readonly IUnitOfWork _uow;
    private readonly IAuditService _audit;

    public PayloadService(IUnitOfWork uow, IAuditService audit)
    {
        _uow = uow; _audit = audit;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // UC14 — overview, reallocate, sign off
    // ═════════════════════════════════════════════════════════════════════════

    public async Task<PayloadOverviewDto> GetOverviewAsync(DateTime? date, CancellationToken ct = default)
    {
        var day = (date ?? DateTime.UtcNow).Date;
        var next = day.AddDays(1);

        // Every run created that day, plus any run still waiting for review/sign-off from earlier days.
        var routes = await _uow.Query<DeliveryRoute>().Query().AsNoTracking()
            .Where(r => r.Status != RouteStatus.Cancelled
                     && (EditableStatuses.Contains(r.Status) || (r.CreatedAt >= day && r.CreatedAt < next)))
            .OrderBy(r => r.CreatedAt)
            .ToListAsync(ct);

        var runs = new List<PayloadRunDto>();
        for (var i = 0; i < routes.Count; i++)
            runs.Add(await BuildRunAsync(routes[i], RunLabel(i), ct));

        return new PayloadOverviewDto(day, runs);
    }

    public async Task<ReallocateResultDto> ReallocateAsync(
        Guid routeId, ReallocateDto dto, Guid dispatcherId, CancellationToken ct = default)
    {
        var source = await GetEditableRouteAsync(routeId, ct);

        if (dto.ParcelIds is null || dto.ParcelIds.Count == 0)
            throw new BadRequestException("Select at least one parcel to move.");

        var moving = dto.ParcelIds.Distinct().ToList();
        var sourceIds = ReadIds(source);
        if (moving.Any(id => !sourceIds.Contains(id)))
            throw new BadRequestException("One or more selected parcels are not on this run.");

        var remaining = sourceIds.Where(id => !moving.Contains(id)).ToList();
        if (remaining.Count == 0)
            throw new BadRequestException("A run must keep at least one parcel. Cancel the run plan instead of moving everything.");

        var sourceParcels = await LoadParcelsAsync(sourceIds, validate: false, ct);
        var weightOf = sourceParcels.ToDictionary(p => p.Id, p => p.WeightKg);
        var movedKg = moving.Sum(id => weightOf.GetValueOrDefault(id));
        var remainingKg = remaining.Sum(id => weightOf.GetValueOrDefault(id));

        DeliveryRoute? target = null;
        if (dto.TargetRouteId is Guid targetId)
        {
            if (targetId == routeId)
                throw new BadRequestException("Choose a different run to receive the parcels.");

            target = await GetEditableRouteAsync(targetId, ct);
            var targetIds = ReadIds(target);
            var targetParcels = await LoadParcelsAsync(targetIds, validate: false, ct);
            var newTargetKg = targetParcels.Sum(p => p.WeightKg) + movedKg;

            if (newTargetKg > target.PayloadCapacityKg)
                throw new BadRequestException(
                    $"Moving {movedKg:0.##} kg to the other run would put it at {newTargetKg:0.##} kg, " +
                    $"over its {target.PayloadCapacityKg:0.##} kg vehicle limit. Nothing was changed.");

            targetIds.AddRange(moving);
            ApplyManifest(target, targetIds, newTargetKg, dispatcherId, dto.Notes);
        }

        var before = new { source.TotalWeightKg, ParcelCount = sourceIds.Count };
        ApplyManifest(source, remaining, remainingKg, dispatcherId, dto.Notes);

        await SaveAsync(ct);   // one save: source and target change together or not at all

        await _audit.LogAsync("ROUTE_PAYLOAD_REALLOCATED", "DeliveryRoute", source.Id, before,
            new
            {
                source.TotalWeightKg, ParcelCount = remaining.Count, Moved = moving.Count,
                TargetRouteId = target?.Id, Status = source.Status.ToString()
            },
            dispatcherId, null, ct);

        return new ReallocateResultDto(
            target is null ? moving.Count : 0,
            target is null ? 0 : moving.Count,
            source.Status.ToString(),
            target?.Status.ToString());
    }

    public async Task<PayloadRunDto> SignOffAsync(
        Guid routeId, SignOffDto dto, Guid dispatcherId, CancellationToken ct = default)
    {
        var route = await GetEditableRouteAsync(routeId, ct);

        var ids = ReadIds(route);
        if (ids.Count == 0)
            throw new BadRequestException("This run has no parcels to sign off.");

        // Re-check against live parcel data so a stale total can't be signed off.
        var parcels = await LoadParcelsAsync(ids, validate: true, ct);
        var liveKg = parcels.Sum(p => p.WeightKg);
        if (liveKg > route.PayloadCapacityKg)
            throw new BadRequestException(
                $"This run carries {liveKg:0.##} kg against a {route.PayloadCapacityKg:0.##} kg limit. " +
                "Move parcels to another run, return them to the queue, or split the run before signing off.");

        if (route.VehicleId is Guid vehicleId)
        {
            var vehicle = await _uow.Query<Vehicle>().GetByIdAsync(vehicleId, ct);
            if (vehicle is null || vehicle.Status != VehicleStatus.Active)
                throw new BadRequestException("The vehicle for this run is no longer active.");
        }

        var now = DateTime.UtcNow;
        route.TotalWeightKg = liveKg;
        route.PayloadOverageKg = 0m;
        route.Status = RouteStatus.PayloadCompliant;
        route.SignedOffAt = now;
        route.SignedOffByUserId = dispatcherId;
        route.PayloadReviewNotes = dto.Notes ?? route.PayloadReviewNotes;
        route.PayloadReviewedAt = now;
        route.PayloadReviewedByUserId = dispatcherId;
        route.UpdatedAt = now;
        await SaveAsync(ct);

        await _audit.LogAsync("ROUTE_PAYLOAD_SIGNED_OFF", "DeliveryRoute", route.Id, null,
            new { route.TotalWeightKg, route.PayloadCapacityKg, ParcelCount = ids.Count },
            dispatcherId, null, ct);

        return await BuildRunAsync(route, null, ct);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // UC15 — split an overloaded run
    // ═════════════════════════════════════════════════════════════════════════

    public async Task<SplitOptionsDto> GetSplitOptionsAsync(Guid routeId, CancellationToken ct = default)
    {
        var route = await GetEditableRouteAsync(routeId, ct);
        var (busyDrivers, busyVehicles) = await GetBusyAsync(routeId, ct);

        var drivers = await _uow.Query<DriverProfile>().Query().AsNoTracking()
            .Include(d => d.User)
            .Where(d => d.Status == DriverStatus.Available && d.Id != route.DriverId)
            .ToListAsync(ct);

        var vehicles = await _uow.Query<Vehicle>().Query().AsNoTracking()
            .Where(v => v.Status == VehicleStatus.Active && v.Id != route.VehicleId)
            .ToListAsync(ct);

        return new SplitOptionsDto(
            drivers.Where(d => !busyDrivers.Contains(d.Id))
                   .Select(d => new StandbyDriverDto(d.Id, d.User?.FullName ?? "Driver")).ToList(),
            vehicles.Where(v => !busyVehicles.Contains(v.Id))
                    .Select(v => new StandbyVehicleDto(v.Id, v.RegistrationNumber, v.PayloadCapacityKg)).ToList());
    }

    public async Task<SplitResultDto> PreviewSplitAsync(
        Guid routeId, SplitRequestDto dto, CancellationToken ct = default)
    {
        var plan = await PlanSplitAsync(routeId, dto, ct);

        // Transient copies: nothing here is attached to the context, so nothing is saved.
        var original = new DeliveryRoute
        {
            Id = plan.Route.Id, DriverId = plan.Route.DriverId, VehicleId = plan.Route.VehicleId,
            Zone = plan.Route.Zone, Status = RouteStatus.PayloadCompliant,
            TotalWeightKg = plan.OriginalKg, PayloadCapacityKg = plan.Route.PayloadCapacityKg
        };
        var standby = new DeliveryRoute
        {
            Id = Guid.Empty, DriverId = plan.StandbyDriver.Id, VehicleId = plan.StandbyVehicle.Id,
            Zone = plan.Route.Zone, Status = RouteStatus.PayloadCompliant,
            TotalWeightKg = plan.StandbyKg, PayloadCapacityKg = plan.StandbyVehicle.PayloadCapacityKg
        };

        return new SplitResultDto(
            await ViewAsync(original, "Original run", plan.Original, ct),
            await ViewAsync(standby, "Standby run", plan.Standby, ct),
            Confirmed: false);
    }

    public async Task<SplitResultDto> ConfirmSplitAsync(
        Guid routeId, SplitRequestDto dto, Guid dispatcherId, CancellationToken ct = default)
    {
        var plan = await PlanSplitAsync(routeId, dto, ct);
        var route = plan.Route;
        var now = DateTime.UtcNow;

        // Original run keeps its driver and vehicle but only the parcels that fit.
        ApplyManifest(route, plan.Original.Select(p => p.Id).ToList(), plan.OriginalKg, dispatcherId, dto.Notes);
        route.SignedOffAt = now;
        route.SignedOffByUserId = dispatcherId;

        var standbyRoute = new DeliveryRoute
        {
            Id = Guid.NewGuid(),
            DriverId = plan.StandbyDriver.Id,
            VehicleId = plan.StandbyVehicle.Id,
            Zone = route.Zone,
            Status = RouteStatus.PayloadCompliant,
            TotalWeightKg = plan.StandbyKg,
            PayloadCapacityKg = plan.StandbyVehicle.PayloadCapacityKg,
            HeldParcelIdsJson = JsonSerializer.Serialize(plan.Standby.Select(p => p.Id)),
            ParentRouteId = route.Id,
            PayloadReviewNotes = dto.Notes,
            PayloadReviewedAt = now,
            PayloadReviewedByUserId = dispatcherId,
            SignedOffAt = now,
            SignedOffByUserId = dispatcherId,
            CreatedAt = now,
            UpdatedAt = now
        };
        await _uow.Query<DeliveryRoute>().AddAsync(standbyRoute, ct);
        await SaveAsync(ct);   // one save: both manifests are finalised or neither

        await _audit.LogAsync("ROUTE_SPLIT_CONFIRMED", "DeliveryRoute", route.Id, null,
            new
            {
                OriginalKg = plan.OriginalKg, StandbyKg = plan.StandbyKg,
                StandbyRouteId = standbyRoute.Id, StandbyDriverId = plan.StandbyDriver.Id,
                StandbyVehicleId = plan.StandbyVehicle.Id
            },
            dispatcherId, null, ct);

        return new SplitResultDto(
            await ViewAsync(route, "Original run", plan.Original, ct),
            await ViewAsync(standbyRoute, "Standby run", plan.Standby, ct),
            Confirmed: true);
    }

    private record SplitPlan(
        DeliveryRoute Route, List<Parcel> Original, List<Parcel> Standby,
        DriverProfile StandbyDriver, Vehicle StandbyVehicle, decimal OriginalKg, decimal StandbyKg);

    /// <summary>Validates the dispatcher's choices and computes the split. Saves nothing.</summary>
    private async Task<SplitPlan> PlanSplitAsync(Guid routeId, SplitRequestDto dto, CancellationToken ct)
    {
        var route = await GetEditableRouteAsync(routeId, ct);
        if (route.Status != RouteStatus.PendingPayloadReview || route.TotalWeightKg <= route.PayloadCapacityKg)
            throw new BadRequestException("This run is within the vehicle limit and does not need to be split.");
        if (dto.StandbyDriverId == route.DriverId)
            throw new BadRequestException("Choose a different driver for the standby run.");

        var driver = await _uow.Query<DriverProfile>().Query()
            .Include(d => d.User)
            .FirstOrDefaultAsync(d => d.Id == dto.StandbyDriverId, ct)
            ?? throw new NotFoundException("Standby driver not found.");
        if (driver.Status != DriverStatus.Available)
            throw new BadRequestException("The standby driver must be available.");

        var vehicle = await _uow.Query<Vehicle>().GetByIdAsync(dto.StandbyVehicleId, ct)
            ?? throw new NotFoundException("Standby vehicle not found.");
        if (vehicle.Status != VehicleStatus.Active)
            throw new BadRequestException("The standby vehicle is not active.");
        if (vehicle.Id == route.VehicleId)
            throw new BadRequestException("Choose a different vehicle for the standby run.");

        var (busyDrivers, busyVehicles) = await GetBusyAsync(routeId, ct);
        if (busyDrivers.Contains(driver.Id))
            throw new BadRequestException("The standby driver is already on another run.");
        if (busyVehicles.Contains(vehicle.Id))
            throw new BadRequestException("The standby vehicle is already on another run.");

        var parcels = await LoadParcelsAsync(ReadIds(route), validate: true, ct);

        // First-fit-decreasing: fill the original vehicle, the overflow goes to the standby vehicle.
        var original = new List<Parcel>();
        var standby = new List<Parcel>();
        decimal originalKg = 0m, standbyKg = 0m;
        foreach (var p in parcels.OrderByDescending(p => p.WeightKg).ThenBy(p => p.TrackingNumber))
        {
            if (originalKg + p.WeightKg <= route.PayloadCapacityKg)
            { original.Add(p); originalKg += p.WeightKg; }
            else if (standbyKg + p.WeightKg <= vehicle.PayloadCapacityKg)
            { standby.Add(p); standbyKg += p.WeightKg; }
            else
                throw new BadRequestException(
                    $"Parcel {p.TrackingNumber} ({p.WeightKg:0.##} kg) does not fit on either vehicle. " +
                    "Choose a larger standby vehicle or move the parcel to another run first.");
        }
        if (original.Count == 0 || standby.Count == 0)
            throw new BadRequestException("The split could not produce two valid runs. Move parcels to another run instead.");

        return new SplitPlan(route, original, standby, driver, vehicle, originalKg, standbyKg);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Helpers
    // ═════════════════════════════════════════════════════════════════════════

    private static string RunLabel(int index)
        => index < 26 ? $"Run {(char)('A' + index)}" : $"Run {index + 1}";

    private async Task<DeliveryRoute> GetEditableRouteAsync(Guid routeId, CancellationToken ct)
    {
        var route = await _uow.Query<DeliveryRoute>().GetByIdAsync(routeId, ct)
            ?? throw new NotFoundException("Run not found.");
        if (!EditableStatuses.Contains(route.Status))
            throw new BadRequestException($"This run has already been released or cancelled (status: {route.Status}).");
        return route;
    }

    private static List<Guid> ReadIds(DeliveryRoute route)
        => string.IsNullOrWhiteSpace(route.HeldParcelIdsJson)
            ? []
            : JsonSerializer.Deserialize<List<Guid>>(route.HeldParcelIdsJson) ?? [];

    /// <summary>Applies a new manifest. Any manifest change voids the sign-off.</summary>
    private static void ApplyManifest(DeliveryRoute r, List<Guid> ids, decimal totalKg, Guid userId, string? notes)
    {
        var now = DateTime.UtcNow;
        r.HeldParcelIdsJson = JsonSerializer.Serialize(ids);
        r.TotalWeightKg = totalKg;
        r.PayloadOverageKg = Math.Max(0m, totalKg - r.PayloadCapacityKg);
        r.Status = r.PayloadOverageKg > 0 ? RouteStatus.PendingPayloadReview : RouteStatus.PayloadCompliant;
        r.SignedOffAt = null;
        r.SignedOffByUserId = null;
        r.PayloadReviewNotes = notes ?? r.PayloadReviewNotes;
        r.PayloadReviewedAt = now;
        r.PayloadReviewedByUserId = userId;
        r.UpdatedAt = now;
    }

    private async Task<List<Parcel>> LoadParcelsAsync(List<Guid> ids, bool validate, CancellationToken ct)
    {
        var parcels = await _uow.Query<Parcel>().Query().AsNoTracking()
            .Where(p => ids.Contains(p.Id))
            .ToListAsync(ct);

        if (!validate) return parcels;

        if (parcels.Count != ids.Count)
            throw new NotFoundException("One or more parcels on this run no longer exist.");
        foreach (var p in parcels)
            if (!DispatchableStatuses.Contains(p.Status))
                throw new BadRequestException($"Parcel {p.TrackingNumber} is no longer ready for dispatch (status: {p.Status}).");
        return parcels;
    }

    private async Task<(HashSet<Guid> Drivers, HashSet<Guid> Vehicles)> GetBusyAsync(Guid exceptRouteId, CancellationToken ct)
    {
        var rows = await _uow.Query<DeliveryRoute>().Query().AsNoTracking()
            .Where(r => r.Id != exceptRouteId
                     && (EditableStatuses.Contains(r.Status) || r.Status == RouteStatus.InProgress))
            .Select(r => new { r.DriverId, r.VehicleId })
            .ToListAsync(ct);

        return (rows.Select(r => r.DriverId).ToHashSet(),
                rows.Where(r => r.VehicleId.HasValue).Select(r => r.VehicleId!.Value).ToHashSet());
    }

    private async Task<PayloadRunDto> BuildRunAsync(DeliveryRoute route, string? label, CancellationToken ct)
    {
        var ids = ReadIds(route);
        var parcels = ids.Count == 0 ? [] : await LoadParcelsAsync(ids, validate: false, ct);
        return await ViewAsync(route, label, parcels, ct);
    }

    private async Task<PayloadRunDto> ViewAsync(DeliveryRoute r, string? label, List<Parcel> parcels, CancellationToken ct)
    {
        var driver = await _uow.Query<DriverProfile>().Query().AsNoTracking()
            .Include(d => d.User).FirstOrDefaultAsync(d => d.Id == r.DriverId, ct);
        var reg = r.VehicleId is Guid vid
            ? (await _uow.Query<Vehicle>().GetByIdAsync(vid, ct))?.RegistrationNumber
            : null;

        var addressIds = parcels.Select(p => (Guid?)p.DeliveryAddressId).Distinct().ToList();
        var addresses = addressIds.Count == 0
            ? new Dictionary<Guid, ParcelAddress>()
            : await _uow.Query<ParcelAddress>().Query().AsNoTracking()
                .Where(a => addressIds.Contains(a.Id)).ToDictionaryAsync(a => a.Id, ct);

        var load = r.TotalWeightKg;
        var utilization = r.PayloadCapacityKg > 0 ? Math.Round(load / r.PayloadCapacityKg * 100m, 1) : 0m;

        return new PayloadRunDto(
            r.Id, label, r.Status.ToString(), EditableStatuses.Contains(r.Status),
            r.DriverId, driver?.User?.FullName ?? "Driver", r.VehicleId, reg,
            load, r.PayloadCapacityKg, Math.Max(0m, load - r.PayloadCapacityKg), utilization,
            r.SignedOffAt != null, r.SignedOffAt,
            parcels.Select(p => ToParcelDto(p, addresses)).ToList());
    }

    private static RunParcelDto ToParcelDto(Parcel p, Dictionary<Guid, ParcelAddress> addresses)
    {
        ParcelAddress? address = null;
        if ((Guid?)p.DeliveryAddressId is Guid addressId)
            addresses.TryGetValue(addressId, out address);

        return new RunParcelDto(
            p.Id, p.TrackingNumber, p.WeightKg,
            address?.RecipientName ?? "—", address?.City ?? "—",
            p.Status == ParcelStatus.Approved);   // Approved = pickup task, not yet in the warehouse
    }

    private async Task SaveAsync(CancellationToken ct)
    {
        try { await _uow.SaveChangesAsync(ct); }
        catch (DbUpdateConcurrencyException ex)
        {
            var failedTypes = ex.Entries.Select(e => e.Entity.GetType().Name).Distinct();
            throw new BadRequestException(
                $"The {string.Join(", ", failedTypes)} was updated by another process. Please refresh and try again.");
        }
    }
}
