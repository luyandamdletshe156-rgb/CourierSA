using CourierSA.API.Middleware;
using CourierSA.Application.DTOs.Upgrades;
using CourierSA.Application.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CourierSA.API.Controllers;

// Request Priority Upgrade / Review Priority Upgrade
[Authorize]
public class UpgradeRequestsController : CourierSABaseController
{
    private readonly IPriorityUpgradeService _service;
    public UpgradeRequestsController(IPriorityUpgradeService service) => _service = service;

    /// <summary>POST /api/parcels/{parcelId}/upgrade-requests – customer asks for a faster service level</summary>
    [HttpPost("api/parcels/{parcelId:guid}/upgrade-requests")]
    [Authorize(Policy = "CustomerOrBiz")]
    public async Task<IActionResult> RequestUpgrade(Guid parcelId, [FromBody] CreateUpgradeRequestDto dto, CancellationToken ct)
        => Created(await _service.RequestAsync(parcelId, dto, CurrentUserId, ct), "Upgrade request sent to the dispatcher.");

    /// <summary>GET /api/upgrade-requests/mine – customer's own requests</summary>
    [HttpGet("api/upgrade-requests/mine")]
    [Authorize(Policy = "CustomerOrBiz")]
    public async Task<IActionResult> Mine(CancellationToken ct)
        => Ok(await _service.GetMineAsync(CurrentUserId, ct));

    /// <summary>POST /api/upgrade-requests/{id}/pay – customer pays the approved fee from their wallet</summary>
    [HttpPost("api/upgrade-requests/{id:guid}/pay")]
    [Authorize(Policy = "CustomerOrBiz")]
    public async Task<IActionResult> Pay(Guid id, CancellationToken ct)
        => Ok(await _service.PayAsync(id, CurrentUserId, ct), "Upgrade paid and applied.");

    /// <summary>GET /api/upgrade-requests/pending – dispatcher queue</summary>
    [HttpGet("api/upgrade-requests/pending")]
    [Authorize(Policy = "DispatcherOrAdmin")]
    public async Task<IActionResult> Pending(CancellationToken ct)
        => Ok(await _service.GetPendingAsync(ct));

    /// <summary>PUT /api/upgrade-requests/{id}/review – dispatcher approves or rejects</summary>
    [HttpPut("api/upgrade-requests/{id:guid}/review")]
    [Authorize(Policy = "DispatcherOrAdmin")]
    public async Task<IActionResult> Review(Guid id, [FromBody] ReviewUpgradeRequestDto dto, CancellationToken ct)
        => Ok(await _service.ReviewAsync(id, dto, CurrentUserId, ct));
}
