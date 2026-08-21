using CourierSA.API.Middleware;
using CourierSA.Application.DTOs.CollectionDamage;
using CourierSA.Application.Interfaces.Services;
using CourierSA.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CourierSA.API.Controllers;

/// <summary>
/// UC02 — Handle Damaged Parcel at Collection.
///
/// GET  /api/collection-damage/preview           — driver: system's recommended outcome, pre-submit
/// POST /api/collection-damage/{deliveryId}/report — driver: submit the damage report
/// GET  /api/collection-damage/queue              — dispatcher/admin: pending escalations
/// PUT  /api/collection-damage/{reportId}/resolve  — dispatcher/admin: final Proceed/Rejected call
/// </summary>
[Route("api/collection-damage")]
public class CollectionDamageController : CourierSABaseController
{
    private readonly ICollectionDamageService _damageService;

    public CollectionDamageController(ICollectionDamageService damageService) => _damageService = damageService;

    /// <summary>POST /api/collection-damage/{deliveryId}/preview — pure evaluation, nothing
    /// persisted (SRS flow steps 6–7: driver sees the system's recommendation before confirming).
    /// Body only needs Type/Severity — Notes/PhotoDataUrls are ignored here if sent.</summary>
    [HttpPost("{deliveryId:guid}/preview")]
    [Authorize(Policy = "DriverOnly")]
    public async Task<IActionResult> Preview(
        Guid deliveryId, [FromBody] SubmitCollectionDamageReportDto dto, CancellationToken ct)
    {
        var result = await _damageService.PreviewOutcomeAsync(deliveryId, dto.Type, dto.Severity, CurrentUserId, ct);
        return Ok(result);
    }

    /// <summary>POST /api/collection-damage/{deliveryId}/report — driver confirms and submits
    /// (SRS flow steps 8–9).</summary>
    [HttpPost("{deliveryId:guid}/report")]
    [Authorize(Policy = "DriverOnly")]
    public async Task<IActionResult> Report(
        Guid deliveryId, [FromBody] SubmitCollectionDamageReportDto dto, CancellationToken ct)
    {
        var result = await _damageService.ReportAsync(deliveryId, dto, CurrentUserId, ct);
        return Created(result, result.Status == "Resolved"
            ? $"Damage report submitted. Outcome: {result.FinalOutcome}."
            : "Damage report submitted and escalated to a dispatcher for review.");
    }

    /// <summary>GET /api/collection-damage/queue — dispatcher escalation queue.</summary>
    [HttpGet("queue")]
    [Authorize(Policy = "DispatcherOrAdmin")]
    public async Task<IActionResult> GetQueue(CancellationToken ct)
    {
        var result = await _damageService.GetQueueAsync(ct);
        return Ok(result);
    }

    /// <summary>PUT /api/collection-damage/{reportId}/resolve — dispatcher makes the final call
    /// on an escalated report.</summary>
    [HttpPut("{reportId:guid}/resolve")]
    [Authorize(Policy = "DispatcherOrAdmin")]
    public async Task<IActionResult> Resolve(
        Guid reportId, [FromBody] ResolveDamageEscalationDto dto, CancellationToken ct)
    {
        var result = await _damageService.ResolveEscalationAsync(reportId, dto, CurrentUserId, ct);
        return Ok(result, $"Damage report resolved: {result.FinalOutcome}.");
    }
}