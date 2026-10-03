using CourierSA.API.Middleware;
using CourierSA.Application.DTOs.Shifts;
using CourierSA.Application.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace CourierSA.API.Controllers;

// Driver roster, leave and shift swaps

[Authorize]
[Route("")]
public class ShiftsController : CourierSABaseController
{
    private readonly IShiftService _service;
    public ShiftsController(IShiftService service) => _service = service;

    // ── Admin: Schedule Driver Roster ─────────────────────────────────────────
    [HttpGet("api/roster/drivers")][Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Drivers(CancellationToken ct) => Ok(await _service.GetDriversAsync(ct));

    [HttpGet("api/roster")][Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Roster([FromQuery] DateTime from, [FromQuery] DateTime to, CancellationToken ct)
        => Ok(await _service.GetRosterAsync(from, to, ct));

    [HttpPost("api/roster")][Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Schedule([FromBody] ScheduleRosterDto dto, CancellationToken ct)
        => Created(await _service.ScheduleRosterAsync(dto, CurrentUserId, ct), "Shifts scheduled.");

    [HttpPost("api/roster/publish")][Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Publish([FromBody] PublishRosterDto dto, CancellationToken ct)
    {
        var count = await _service.PublishRosterAsync(dto, CurrentUserId, ct);
        return Ok(count, $"{count} shift(s) published.");
    }

    [HttpGet("api/roster/open")][Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> OpenShifts(CancellationToken ct) => Ok(await _service.GetOpenShiftsAsync(ct));

    [HttpPut("api/roster/shifts/{id:guid}/assign")][Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Assign(Guid id, [FromBody] AssignShiftDto dto, CancellationToken ct)
        => Ok(await _service.AssignOpenShiftAsync(id, dto, CurrentUserId, ct));

    // ── Admin: Approve Leave & Reassign Shifts ────────────────────────────────
    [HttpGet("api/leave-requests/pending")][Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> PendingLeave(CancellationToken ct) => Ok(await _service.GetPendingLeaveAsync(ct));

    [HttpPut("api/leave-requests/{id:guid}/review")][Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> ReviewLeave(Guid id, [FromBody] ReviewLeaveDto dto, CancellationToken ct)
        => Ok(await _service.ReviewLeaveAsync(id, dto, CurrentUserId, ct));

    [HttpGet("api/shift-swaps/pending")][Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> PendingSwaps(CancellationToken ct) => Ok(await _service.GetPendingSwapsAsync(ct));

    [HttpPut("api/shift-swaps/{id:guid}/review")][Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> ReviewSwap(Guid id, [FromBody] ReviewSwapDto dto, CancellationToken ct)
        => Ok(await _service.ReviewSwapAsync(id, dto, CurrentUserId, ct));

    // ── Driver ────────────────────────────────────────────────────────────────
    [HttpGet("api/driver/shifts")][Authorize(Policy = "DriverOnly")]
    public async Task<IActionResult> MyShifts([FromQuery] DateTime from, [FromQuery] DateTime to, CancellationToken ct)
        => Ok(await _service.GetMyShiftsAsync(from, to, CurrentUserId, ct));

    [HttpGet("api/driver/leave-requests")][Authorize(Policy = "DriverOnly")]
    public async Task<IActionResult> MyLeave(CancellationToken ct) => Ok(await _service.GetMyLeaveAsync(CurrentUserId, ct));

    [HttpPost("api/driver/leave-requests")][Authorize(Policy = "DriverOnly")]
    public async Task<IActionResult> RequestLeave([FromBody] CreateLeaveRequestDto dto, CancellationToken ct)
        => Created(await _service.RequestLeaveAsync(dto, CurrentUserId, ct), "Leave request sent for approval.");

    [HttpDelete("api/driver/leave-requests/{id:guid}")][Authorize(Policy = "DriverOnly")]
    public async Task<IActionResult> CancelLeave(Guid id, CancellationToken ct)
    {
        await _service.CancelLeaveAsync(id, CurrentUserId, ct);
        return NoContent("Leave request cancelled.");
    }

    [HttpGet("api/driver/shifts/{id:guid}/swap-peers")][Authorize(Policy = "DriverOnly")]
    public async Task<IActionResult> SwapPeers(Guid id, CancellationToken ct)
        => Ok(await _service.GetSwapPeersAsync(id, CurrentUserId, ct));

    [HttpGet("api/driver/shift-swaps")][Authorize(Policy = "DriverOnly")]
    public async Task<IActionResult> MySwaps(CancellationToken ct) => Ok(await _service.GetMySwapsAsync(CurrentUserId, ct));

    [HttpPost("api/driver/shift-swaps")][Authorize(Policy = "DriverOnly")]
    public async Task<IActionResult> RequestSwap([FromBody] CreateSwapRequestDto dto, CancellationToken ct)
        => Created(await _service.RequestSwapAsync(dto, CurrentUserId, ct), "Swap request sent to your colleague.");

    [HttpPut("api/driver/shift-swaps/{id:guid}/respond")][Authorize(Policy = "DriverOnly")]
    public async Task<IActionResult> RespondSwap(Guid id, [FromBody] RespondSwapDto dto, CancellationToken ct)
        => Ok(await _service.RespondToSwapAsync(id, dto, CurrentUserId, ct));
}
