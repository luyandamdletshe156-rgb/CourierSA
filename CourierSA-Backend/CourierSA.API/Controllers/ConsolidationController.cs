using CourierSA.API.Middleware;
using CourierSA.Application.DTOs.Consolidation;
using CourierSA.Application.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CourierSA.API.Controllers;

// UC10 Request Package Consolidation (customer)
// UC11 Consolidate Warehouse Parcels + UC13 stage master box for dispatch (warehouse)
[Authorize]
[Route("api/consolidations")]
public class ConsolidationController : CourierSABaseController
{
    private readonly IConsolidationService _service;
    public ConsolidationController(IConsolidationService service) => _service = service;

    // ── Customer ──────────────────────────────────────────────────────────

    /// <summary>GET /api/consolidations/eligible – my parcels waiting in the warehouse</summary>
    [HttpGet("eligible")]
    [Authorize(Policy = "CustomerOrBiz")]
    public async Task<IActionResult> Eligible(CancellationToken ct)
        => Ok(await _service.GetEligibleParcelsAsync(CurrentUserId, ct));

    /// <summary>POST /api/consolidations/preview – combined weight and estimated saving</summary>
    [HttpPost("preview")]
    [Authorize(Policy = "CustomerOrBiz")]
    public async Task<IActionResult> Preview([FromBody] ConsolidationRequestDto dto, CancellationToken ct)
        => Ok(await _service.PreviewAsync(dto, CurrentUserId, ct));

    /// <summary>POST /api/consolidations – submit the request; a work order goes to the warehouse queue</summary>
    [HttpPost]
    [Authorize(Policy = "CustomerOrBiz")]
    public async Task<IActionResult> Request([FromBody] ConsolidationRequestDto dto, CancellationToken ct)
        => Created(await _service.RequestAsync(dto, CurrentUserId, ct), "Consolidation requested. The warehouse has been notified.");

    /// <summary>GET /api/consolidations/mine – my consolidation orders</summary>
    [HttpGet("mine")]
    [Authorize(Policy = "CustomerOrBiz")]
    public async Task<IActionResult> Mine(CancellationToken ct)
        => Ok(await _service.GetMineAsync(CurrentUserId, ct));

    /// <summary>PUT /api/consolidations/{id}/cancel – only while the warehouse has not started</summary>
    [HttpPut("{id:guid}/cancel")]
    [Authorize(Policy = "CustomerOrBiz")]
    public async Task<IActionResult> Cancel(Guid id, CancellationToken ct)
        => Ok(await _service.CancelAsync(id, CurrentUserId, ct), "Consolidation cancelled.");

    // ── Warehouse ─────────────────────────────────────────────────────────

    /// <summary>GET /api/consolidations/queue?status= – warehouse task queue</summary>
    [HttpGet("queue")]
    [Authorize(Policy = "WarehouseOrAdmin")]
    public async Task<IActionResult> Queue([FromQuery] string? status, CancellationToken ct)
        => Ok(await _service.GetQueueAsync(status, ct));

    /// <summary>
    /// GET /api/consolidations/history?search= – packed, staged and cancelled orders, newest first,
    /// each with the current status of its master box (OutForDelivery, Delivered, ...).
    /// </summary>
    [HttpGet("history")]
    [Authorize(Policy = "WarehouseOrAdmin")]
    public async Task<IActionResult> History([FromQuery] string? search, CancellationToken ct)
        => Ok(await _service.GetHistoryAsync(search, ct));

    /// <summary>GET /api/consolidations/{id}</summary>
    [HttpGet("{id:guid}")]
    [Authorize(Policy = "WarehouseOrAdmin")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
        => Ok(await _service.GetAsync(id, ct));

    /// <summary>POST /api/consolidations/{id}/scan – scan one parcel barcode against the order</summary>
    [HttpPost("{id:guid}/scan")]
    [Authorize(Policy = "WarehouseOrAdmin")]
    public async Task<IActionResult> Scan(Guid id, [FromBody] ScanConsolidationParcelDto dto, CancellationToken ct)
        => Ok(await _service.ScanAsync(id, dto, CurrentUserId, ct), "Parcel matched.");

    /// <summary>POST /api/consolidations/{id}/pack – final box size and weight; generates the master label</summary>
    [HttpPost("{id:guid}/pack")]
    [Authorize(Policy = "WarehouseOrAdmin")]
    public async Task<IActionResult> Pack(Guid id, [FromBody] PackConsolidationDto dto, CancellationToken ct)
    {
        var result = await _service.PackAsync(id, dto, CurrentUserId, ct);
        return Ok(result, $"Master label {result.MasterTrackingId} generated.");
    }

    /// <summary>POST /api/consolidations/{id}/stage – scan master label, pick outbound lane, release to dispatch</summary>
    [HttpPost("{id:guid}/stage")]
    [Authorize(Policy = "WarehouseOrAdmin")]
    public async Task<IActionResult> Stage(Guid id, [FromBody] StageConsolidationDto dto, CancellationToken ct)
        => Ok(await _service.StageAsync(id, dto, CurrentUserId, ct), "Staged for dispatch. The dispatcher can now plan the route.");
}