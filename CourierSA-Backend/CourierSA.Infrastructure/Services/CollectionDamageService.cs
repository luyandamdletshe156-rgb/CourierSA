using CourierSA.Application.DTOs.CollectionDamage;
using CourierSA.Application.Interfaces.Repositories;
using CourierSA.Application.Interfaces.Services;
using CourierSA.Domain.Entities;
using CourierSA.Domain.Enums;
using CourierSA.Domain.Exceptions;
using Microsoft.EntityFrameworkCore;
using System.Text.Json;

namespace CourierSA.Infrastructure.Services;

/// <summary>
/// UC02 — Handle Damaged Parcel at Collection.
/// Driver flags damage before accepting custody of a parcel; the system evaluates a
/// severity-threshold engine to recommend Proceed / Escalated / Rejected, the driver
/// confirms, and — for escalations — a dispatcher makes the final call.
/// </summary>
public class CollectionDamageService : ICollectionDamageService
{
    private readonly IUnitOfWork _uow;
    private readonly INotificationService _notificationService;
    private readonly IAuditService _audit;
    private readonly ITrackingHubService _hubService;

    // Declared value above which even "Minor" damage is escalated rather than auto-proceeded —
    // mirrors the high-value handling already used elsewhere in the system (lost-parcel flow).
    private const decimal HighValueThresholdZAR = 5000m;

    public CollectionDamageService(
        IUnitOfWork uow,
        INotificationService notificationService,
        IAuditService audit,
        ITrackingHubService hubService)
    {
        _uow = uow;
        _notificationService = notificationService;
        _audit = audit;
        _hubService = hubService;
    }

    /// <summary>Severity-threshold engine (SRS flow steps 6–7): Severe always rejects the
    /// collection outright; Moderate always goes to a dispatcher; Minor proceeds unless the
    /// parcel is high-value or insured, in which case it's escalated for a judgment call.</summary>
    private static (CollectionDamageOutcome Outcome, string Explanation) DetermineOutcome(
        DamageSeverity severity, decimal? declaredValueZAR, bool insuranceRequired)
    {
        return severity switch
        {
            DamageSeverity.Severe =>
                (CollectionDamageOutcome.Rejected,
                 "Severe damage — collection is refused outright; the parcel is not accepted into the network."),

            DamageSeverity.Moderate =>
                (CollectionDamageOutcome.Escalated,
                 "Moderate damage — held pending a dispatcher's decision before collection can proceed."),

            DamageSeverity.Minor when insuranceRequired =>
                (CollectionDamageOutcome.Escalated,
                 "Minor damage on an insured parcel — escalated so a dispatcher can confirm before collection, given the insurance implications."),

            DamageSeverity.Minor when declaredValueZAR is > HighValueThresholdZAR =>
                (CollectionDamageOutcome.Escalated,
                 $"Minor damage on a high-value parcel (declared value over R{HighValueThresholdZAR:N0}) — escalated for dispatcher confirmation."),

            DamageSeverity.Minor =>
                (CollectionDamageOutcome.Proceed,
                 "Minor damage, low-value/uninsured parcel — the driver may accept custody and continue the collection."),

            _ => (CollectionDamageOutcome.Escalated, "Unrecognised severity — flagged for dispatcher review.")
        };
    }

    private async Task<(Delivery Delivery, Parcel Parcel, DriverProfile DriverProfile)> LoadAndAuthorizeAsync(
        Guid deliveryId, Guid driverUserId, CancellationToken ct)
    {
        var driverProfile = await _uow.Query<DriverProfile>().Query()
            .Include(d => d.User)
            .FirstOrDefaultAsync(d => d.UserId == driverUserId, ct)
            ?? throw new NotFoundException("Driver profile not found.");

        var delivery = await _uow.Deliveries.GetByIdAsync(deliveryId, ct)
            ?? throw new NotFoundException("Delivery not found.");

        if (delivery.DriverId != driverProfile.Id)
            throw new ForbiddenException("You are not assigned to this delivery.");

        var parcel = await _uow.Parcels.GetWithFullDetailsAsync(delivery.ParcelId, ct)
            ?? throw new NotFoundException($"Parcel {delivery.ParcelId} not found.");

        return (delivery, parcel, driverProfile);
    }

    public async Task<DamageOutcomePreviewDto> PreviewOutcomeAsync(
        Guid deliveryId, DamageType type, DamageSeverity severity, Guid driverUserId, CancellationToken ct = default)
    {
        var (_, parcel, _) = await LoadAndAuthorizeAsync(deliveryId, driverUserId, ct);
        var (outcome, explanation) = DetermineOutcome(severity, parcel.DeclaredValueZAR, parcel.InsuranceRequired);
        return new DamageOutcomePreviewDto(outcome.ToString(), explanation);
    }

    public async Task<CollectionDamageReportDto> ReportAsync(
        Guid deliveryId, SubmitCollectionDamageReportDto dto, Guid driverUserId, CancellationToken ct = default)
    {
        var (delivery, parcel, driverProfile) = await LoadAndAuthorizeAsync(deliveryId, driverUserId, ct);
        var (outcome, explanation) = DetermineOutcome(dto.Severity, parcel.DeclaredValueZAR, parcel.InsuranceRequired);

        var report = new CollectionDamageReport
        {
            Id = Guid.NewGuid(),
            ParcelId = parcel.Id,
            DeliveryId = delivery.Id,
            DriverId = driverProfile.Id,
            Type = dto.Type,
            Severity = dto.Severity,
            Notes = dto.Notes,
            PhotoDataUrls = dto.PhotoDataUrls is { Count: > 0 } ? JsonSerializer.Serialize(dto.PhotoDataUrls) : null,
            SystemRecommendedOutcome = outcome,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        // Proceed and Rejected are resolved immediately by the system's own recommendation —
        // only Escalated waits on a human dispatcher decision (SRS flow steps 8–9).
        if (outcome is CollectionDamageOutcome.Proceed or CollectionDamageOutcome.Rejected)
        {
            report.FinalOutcome = outcome;
            report.Status = CollectionDamageReportStatus.Resolved;
            report.ResolvedAt = DateTime.UtcNow;
        }
        else
        {
            report.Status = CollectionDamageReportStatus.PendingDispatcherReview;
            delivery.RequiresDispatcherReview = true;
        }

        await _uow.Query<CollectionDamageReport>().AddAsync(report, ct);

        if (outcome == CollectionDamageOutcome.Rejected)
        {
            delivery.Status = DeliveryStatus.Failed;
            delivery.FailureReason = FailureReason.ParcelDamaged;
            delivery.AttemptNotes = dto.Notes;
            delivery.UpdatedAt = DateTime.UtcNow;

            var hasOtherActiveDeliveries = await _uow.Deliveries.Query()
                .AnyAsync(d => d.DriverId == driverProfile.Id && d.Id != delivery.Id
                    && (d.Status == DeliveryStatus.Assigned || d.Status == DeliveryStatus.InProgress), ct);
            if (!hasOtherActiveDeliveries)
            {
                driverProfile.Status = DriverStatus.Available;
                driverProfile.UpdatedAt = DateTime.UtcNow;
            }
        }

        var trackingEvent = new TrackingEvent
        {
            Id = Guid.NewGuid(),
            ParcelId = parcel.Id,
            EventType = TrackingEventType.ExceptionRaised,
            Description = $"Damage reported at collection ({dto.Type}, {dto.Severity}) — {explanation}",
            OccurredAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        await _uow.TrackingEvents.AddAsync(trackingEvent, ct);
        await _uow.SaveChangesAsync(ct);

        try
        {
            await _notificationService.SendParcelDamagedAsync(parcel.Customer!.UserId, parcel.TrackingNumber, "collection", ct);
        }
        catch (Exception ex) { Console.WriteLine($"[NOTIFY] Damage notification failed: {ex.Message}"); }

        try
        {
            await _audit.LogAsync("COLLECTION_DAMAGE_REPORTED", "CollectionDamageReport", report.Id, null,
                new { dto.Type, dto.Severity, Outcome = outcome.ToString(), report.Status }, driverUserId, null, ct);
        }
        catch (Exception ex) { Console.WriteLine($"[AUDIT] Log failed for {parcel.TrackingNumber}: {ex.Message}"); }

        try
        {
            await _hubService.NotifyParcelStatusChangedAsync(
                parcel.TrackingNumber, outcome == CollectionDamageOutcome.Rejected ? "Approved" : parcel.Status.ToString(), ct: ct);
        }
        catch (Exception ex) { Console.WriteLine($"[HUB] SignalR notify failed for {parcel.TrackingNumber}: {ex.Message}"); }

        if (outcome == CollectionDamageOutcome.Escalated)
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
                        "Damaged parcel needs a collection decision",
                        $"{parcel.TrackingNumber}: {explanation}",
                        ct);
                }
            }
            catch (Exception ex) { Console.WriteLine($"[NOTIFY] Dispatcher escalation alert failed: {ex.Message}"); }
        }

        return ToDto(report, parcel.TrackingNumber, driverProfile.User?.FullName);
    }

    public async Task<IEnumerable<CollectionDamageReportDto>> GetQueueAsync(CancellationToken ct = default)
    {
        var reports = await _uow.Query<CollectionDamageReport>().Query()
            .AsNoTracking()
            .Where(r => r.Status == CollectionDamageReportStatus.PendingDispatcherReview)
            .Include(r => r.Parcel)
            .Include(r => r.Driver).ThenInclude(d => d!.User)
            .OrderBy(r => r.CreatedAt)
            .ToListAsync(ct);

        return reports.Select(r => ToDto(r, r.Parcel?.TrackingNumber ?? "—", r.Driver?.User?.FullName));
    }

    public async Task<CollectionDamageReportDto> ResolveEscalationAsync(
        Guid reportId, ResolveDamageEscalationDto dto, Guid dispatcherUserId, CancellationToken ct = default)
    {
        var report = await _uow.Query<CollectionDamageReport>().GetByIdAsync(reportId, ct)
            ?? throw new NotFoundException("Damage report not found.");
        if (report.Status != CollectionDamageReportStatus.PendingDispatcherReview)
            throw new ConflictException("This damage report has already been resolved.");
        if (dto.Outcome == CollectionDamageOutcome.Escalated)
            throw new BadRequestException("A dispatcher resolution must be Proceed or Rejected, not Escalated.");

        var delivery = await _uow.Deliveries.GetByIdAsync(report.DeliveryId, ct)
            ?? throw new NotFoundException("Delivery not found.");
        var parcel = await _uow.Parcels.GetWithFullDetailsAsync(report.ParcelId, ct)
            ?? throw new NotFoundException($"Parcel {report.ParcelId} not found.");

        report.FinalOutcome = dto.Outcome;
        report.Status = CollectionDamageReportStatus.Resolved;
        report.DispatcherDecisionNotes = dto.Notes;
        report.ResolvedByDispatcherId = dispatcherUserId;
        report.ResolvedAt = DateTime.UtcNow;
        report.UpdatedAt = DateTime.UtcNow;

        delivery.RequiresDispatcherReview = false;
        delivery.DispatcherResolutionNotes = dto.Notes;
        delivery.EscalationResolvedAt = DateTime.UtcNow;
        delivery.UpdatedAt = DateTime.UtcNow;

        if (dto.Outcome == CollectionDamageOutcome.Rejected)
        {
            delivery.Status = DeliveryStatus.Failed;
            delivery.FailureReason = FailureReason.ParcelDamaged;

            var driverProfile = await _uow.Query<DriverProfile>().GetByIdAsync(delivery.DriverId, ct);
            if (driverProfile is not null)
            {
                var hasOtherActiveDeliveries = await _uow.Deliveries.Query()
                    .AnyAsync(d => d.DriverId == driverProfile.Id && d.Id != delivery.Id
                        && (d.Status == DeliveryStatus.Assigned || d.Status == DeliveryStatus.InProgress), ct);
                if (!hasOtherActiveDeliveries)
                {
                    driverProfile.Status = DriverStatus.Available;
                    driverProfile.UpdatedAt = DateTime.UtcNow;
                }
            }
        }

        var trackingEvent = new TrackingEvent
        {
            Id = Guid.NewGuid(),
            ParcelId = parcel.Id,
            EventType = TrackingEventType.ExceptionRaised,
            Description = $"Dispatcher resolved damage report: {dto.Outcome}" + (string.IsNullOrWhiteSpace(dto.Notes) ? "" : $" — {dto.Notes}"),
            OccurredAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        await _uow.TrackingEvents.AddAsync(trackingEvent, ct);
        await _uow.SaveChangesAsync(ct);

        try
        {
            await _notificationService.SendParcelDamagedAsync(parcel.Customer!.UserId, parcel.TrackingNumber, "collection", ct);
        }
        catch (Exception ex) { Console.WriteLine($"[NOTIFY] Damage resolution notification failed: {ex.Message}"); }

        try
        {
            await _audit.LogAsync("COLLECTION_DAMAGE_RESOLVED", "CollectionDamageReport", report.Id, null,
                new { dto.Outcome, dto.Notes }, dispatcherUserId, null, ct);
        }
        catch (Exception ex) { Console.WriteLine($"[AUDIT] Log failed for {parcel.TrackingNumber}: {ex.Message}"); }

        var driverName = (await _uow.Query<DriverProfile>().Query()
            .Include(d => d.User).AsNoTracking()
            .FirstOrDefaultAsync(d => d.Id == report.DriverId, ct))?.User?.FullName;

        return ToDto(report, parcel.TrackingNumber, driverName);
    }

    private static CollectionDamageReportDto ToDto(CollectionDamageReport r, string trackingNumber, string? driverName)
    {
        var photos = string.IsNullOrWhiteSpace(r.PhotoDataUrls)
            ? new List<string>()
            : JsonSerializer.Deserialize<List<string>>(r.PhotoDataUrls) ?? new List<string>();

        return new CollectionDamageReportDto(
            r.Id, r.ParcelId, trackingNumber, r.DeliveryId,
            r.Type.ToString(), r.Severity.ToString(), r.Notes, photos,
            r.SystemRecommendedOutcome.ToString(), r.FinalOutcome?.ToString(), r.Status.ToString(),
            driverName, r.CreatedAt,
            r.DispatcherDecisionNotes, r.ResolvedAt);
    }
}