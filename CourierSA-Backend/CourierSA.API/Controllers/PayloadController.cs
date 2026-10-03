using CourierSA.API.Middleware;
using CourierSA.Application.DTOs.Payload;
using CourierSA.Application.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CourierSA.API.Controllers;

// UC14 Validate and Adjust Vehicle Payload / UC15 Split Overloaded Routes
[Authorize(Policy = "DispatcherOrAdmin")]
[Route("")]
public class PayloadController : CourierSABaseController
{
    private readonly IPayloadService _service;
    public PayloadController(IPayloadService service) => _service = service;

    /// <summary>GET /api/payload/overview?date= – all runs for the day with load against vehicle maximum</summary>
    [HttpGet("api/payload/overview")]
    public async Task<IActionResult> Overview([FromQuery] DateTime? date, CancellationToken ct)
        => Ok(await _service.GetOverviewAsync(date, ct));

    /// <summary>PUT /api/payload/runs/{routeId}/reallocate – move parcels to another run, or back to the queue</summary>
    [HttpPut("api/payload/runs/{routeId:guid}/reallocate")]
    public async Task<IActionResult> Reallocate(Guid routeId, [FromBody] ReallocateDto dto, CancellationToken ct)
        => Ok(await _service.ReallocateAsync(routeId, dto, CurrentUserId, ct));

    /// <summary>POST /api/payload/runs/{routeId}/sign-off – confirm the manifest so the warehouse can load it</summary>
    [HttpPost("api/payload/runs/{routeId:guid}/sign-off")]
    public async Task<IActionResult> SignOff(Guid routeId, [FromBody] SignOffDto dto, CancellationToken ct)
        => Ok(await _service.SignOffAsync(routeId, dto, CurrentUserId, ct), "Manifest signed off. It can now be released for loading.");

    /// <summary>GET /api/payload/runs/{routeId}/split/options – available standby drivers and vehicles</summary>
    [HttpGet("api/payload/runs/{routeId:guid}/split/options")]
    public async Task<IActionResult> SplitOptions(Guid routeId, CancellationToken ct)
        => Ok(await _service.GetSplitOptionsAsync(routeId, ct));

    /// <summary>POST /api/payload/runs/{routeId}/split/preview – proposed split, nothing saved</summary>
    [HttpPost("api/payload/runs/{routeId:guid}/split/preview")]
    public async Task<IActionResult> SplitPreview(Guid routeId, [FromBody] SplitRequestDto dto, CancellationToken ct)
        => Ok(await _service.PreviewSplitAsync(routeId, dto, ct));

    /// <summary>POST /api/payload/runs/{routeId}/split/confirm – finalise both manifests</summary>
    [HttpPost("api/payload/runs/{routeId:guid}/split/confirm")]
    public async Task<IActionResult> SplitConfirm(Guid routeId, [FromBody] SplitRequestDto dto, CancellationToken ct)
        => Ok(await _service.ConfirmSplitAsync(routeId, dto, CurrentUserId, ct), "Route split. Both manifests are finalised.");
}
