using CourierSA.Application.DTOs.Shifts;
using CourierSA.Application.Interfaces.Repositories;
using CourierSA.Application.Interfaces.Services;
using CourierSA.Domain.Entities;
using CourierSA.Domain.Enums;
using CourierSA.Domain.Exceptions;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;

namespace CourierSA.Infrastructure.Services;

/// <summary>
/// Driver roster, leave and shift swaps.
///  - Schedule Driver Roster:        admin builds and publishes morning/afternoon shifts.
///  - Request Driver Leave:          driver asks for leave with a type and dates.
///  - Request Shift Swap:            driver offers a published shift to an off-duty peer.
///  - Approve Leave &amp; Reassign Shifts: admin approves/rejects; approved leave frees the
///    driver's shifts, which are reassigned to available drivers so depot coverage holds.
/// Coverage rule: each shift slot needs at least Roster:MinDriversPerShift drivers (default 1).
/// </summary>
public class ShiftService : IShiftService
{
    private readonly IUnitOfWork _uow;
    private readonly INotificationService _notifications;
    private readonly IAuditService _audit;
    private readonly int _minDrivers;

    public ShiftService(IUnitOfWork uow, INotificationService notifications, IAuditService audit,
        IConfiguration? config = null)
    {
        _uow = uow; _notifications = notifications; _audit = audit;
        _minDrivers = int.TryParse(config?["Roster:MinDriversPerShift"], out var n) && n > 0 ? n : 1;
    }

    // South Africa is UTC+2 all year, so "today" for rostering is the SAST date.
    private static DateTime Today => DateTime.UtcNow.AddHours(2).Date;

    private static (string Start, string End) Hours(ShiftType t)
        => t == ShiftType.Morning ? ("07:30", "13:00") : ("13:30", "19:00");

    // ═════════════════════════════════════════════════════════════════════════
    // Schedule Driver Roster (admin)
    // ═════════════════════════════════════════════════════════════════════════

    public async Task<IEnumerable<DriverOptionDto>> GetDriversAsync(CancellationToken ct = default)
    {
        var drivers = await _uow.Query<DriverProfile>().Query().AsNoTracking()
            .Include(d => d.User).Where(d => d.Status != DriverStatus.Suspended).ToListAsync(ct);
        return drivers.Select(d => new DriverOptionDto(d.Id, d.User?.FullName ?? "Driver"))
            .OrderBy(d => d.Name).ToList();
    }

    public async Task<IEnumerable<ShiftDto>> GetRosterAsync(DateTime from, DateTime to, CancellationToken ct = default)
    {
        var shifts = await _uow.Query<DriverShift>().Query().AsNoTracking()
            .Where(s => s.Date >= from.Date && s.Date <= to.Date && s.Status != ShiftStatus.Cancelled)
            .OrderBy(s => s.Date).ThenBy(s => s.ShiftType).ToListAsync(ct);
        return await ToDtosAsync(shifts, ct);
    }

    public async Task<IEnumerable<ShiftDto>> ScheduleRosterAsync(
        ScheduleRosterDto dto, Guid adminUserId, CancellationToken ct = default)
    {
        if (dto.Shifts is null || dto.Shifts.Count == 0)
            throw new BadRequestException("Add at least one shift to the roster.");

        var dup = dto.Shifts.GroupBy(i => (i.DriverId, i.Date.Date)).FirstOrDefault(g => g.Count() > 1);
        if (dup is not null)
            throw new BadRequestException("A driver can only work one shift per day.");

        var created = new List<DriverShift>();
        foreach (var item in dto.Shifts)
        {
            var date = item.Date.Date;
            if (date < Today)
                throw new BadRequestException($"{date:dd MMM yyyy} is in the past.");

            var driver = await _uow.Query<DriverProfile>().GetByIdAsync(item.DriverId, ct)
                ?? throw new NotFoundException("Driver not found.");
            if (driver.Status == DriverStatus.Suspended)
                throw new BadRequestException("A suspended driver cannot be rostered.");

            if (await HasShiftOnAsync(item.DriverId, date, null, ct))
                throw new ConflictException($"The driver already has a shift on {date:dd MMM yyyy}.");
            if (await IsOnApprovedLeaveAsync(item.DriverId, date, ct))
                throw new BadRequestException($"The driver is on approved leave on {date:dd MMM yyyy}.");

            var shift = new DriverShift
            {
                Id = Guid.NewGuid(), Date = date, ShiftType = item.ShiftType, DriverId = item.DriverId,
                Status = ShiftStatus.Scheduled, IsPublished = dto.Publish,
                CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow
            };
            await _uow.Query<DriverShift>().AddAsync(shift, ct);
            created.Add(shift);
        }
        await _uow.SaveChangesAsync(ct);

        await _audit.LogAsync("ROSTER_SCHEDULED", "DriverShift", null, null,
            new { Count = created.Count, dto.Publish }, adminUserId, null, ct);

        if (dto.Publish) await NotifyRosterPublishedAsync(created, ct);
        return await ToDtosAsync(created, ct);
    }

    public async Task<int> PublishRosterAsync(PublishRosterDto dto, Guid adminUserId, CancellationToken ct = default)
    {
        if (dto.To.Date < dto.From.Date)
            throw new BadRequestException("The end date must be on or after the start date.");

        var shifts = await _uow.Query<DriverShift>().Query()
            .Where(s => s.Date >= dto.From.Date && s.Date <= dto.To.Date
                        && s.Status == ShiftStatus.Scheduled && !s.IsPublished)
            .ToListAsync(ct);
        foreach (var s in shifts) { s.IsPublished = true; s.UpdatedAt = DateTime.UtcNow; }
        await _uow.SaveChangesAsync(ct);

        await _audit.LogAsync("ROSTER_PUBLISHED", "DriverShift", null, null,
            new { dto.From, dto.To, Count = shifts.Count }, adminUserId, null, ct);
        await NotifyRosterPublishedAsync(shifts, ct);
        return shifts.Count;
    }

    public async Task<IEnumerable<ShiftDto>> GetOpenShiftsAsync(CancellationToken ct = default)
    {
        var today = Today;
        var shifts = await _uow.Query<DriverShift>().Query().AsNoTracking()
            .Where(s => s.Status == ShiftStatus.Open && s.Date >= today)
            .OrderBy(s => s.Date).ThenBy(s => s.ShiftType).ToListAsync(ct);
        return await ToDtosAsync(shifts, ct);
    }

    public async Task<ShiftDto> AssignOpenShiftAsync(
        Guid shiftId, AssignShiftDto dto, Guid adminUserId, CancellationToken ct = default)
    {
        var shift = await _uow.Query<DriverShift>().GetByIdAsync(shiftId, ct)
            ?? throw new NotFoundException("Shift not found.");
        if (shift.Status != ShiftStatus.Open)
            throw new BadRequestException("This shift is already staffed.");

        var driver = await _uow.Query<DriverProfile>().GetByIdAsync(dto.DriverId, ct)
            ?? throw new NotFoundException("Driver not found.");
        if (driver.Status == DriverStatus.Suspended)
            throw new BadRequestException("A suspended driver cannot be rostered.");
        if (await HasShiftOnAsync(driver.Id, shift.Date, shift.Id, ct))
            throw new ConflictException("That driver already has a shift on this day.");
        if (await IsOnApprovedLeaveAsync(driver.Id, shift.Date, ct))
            throw new BadRequestException("That driver is on approved leave on this day.");

        shift.DriverId = driver.Id;
        shift.Status = ShiftStatus.Scheduled;
        shift.Note = "Assigned to cover an open shift";
        shift.UpdatedAt = DateTime.UtcNow;
        await _uow.SaveChangesAsync(ct);

        await _audit.LogAsync("OPEN_SHIFT_ASSIGNED", "DriverShift", shift.Id, null,
            new { shift.Date, shift.ShiftType, DriverId = driver.Id }, adminUserId, null, ct);
        await NotifyAsync(driver.UserId, "Shift assigned",
            $"You have been assigned the {shift.ShiftType} shift on {shift.Date:dd MMM yyyy}.", ct);

        return (await ToDtosAsync([shift], ct)).First();
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Request Driver Leave (driver)
    // ═════════════════════════════════════════════════════════════════════════

    public async Task<IEnumerable<ShiftDto>> GetMyShiftsAsync(
        DateTime from, DateTime to, Guid driverUserId, CancellationToken ct = default)
    {
        var driver = await GetDriverAsync(driverUserId, ct);
        var shifts = await _uow.Query<DriverShift>().Query().AsNoTracking()
            .Where(s => s.DriverId == driver.Id && s.IsPublished && s.Status == ShiftStatus.Scheduled
                        && s.Date >= from.Date && s.Date <= to.Date)
            .OrderBy(s => s.Date).ThenBy(s => s.ShiftType).ToListAsync(ct);
        return await ToDtosAsync(shifts, ct);
    }

    public async Task<LeaveRequestDto> RequestLeaveAsync(
        CreateLeaveRequestDto dto, Guid driverUserId, CancellationToken ct = default)
    {
        var driver = await GetDriverAsync(driverUserId, ct);
        var start = dto.StartDate.Date; var end = dto.EndDate.Date;

        if (start < Today) throw new BadRequestException("Leave cannot start in the past.");
        if (end < start) throw new BadRequestException("The end date must be on or after the start date.");
        if ((end - start).TotalDays > 60) throw new BadRequestException("Leave requests are limited to 60 days.");

        var overlaps = await _uow.Query<LeaveRequest>().Query().AnyAsync(l =>
            l.DriverId == driver.Id
            && (l.Status == LeaveRequestStatus.Pending || l.Status == LeaveRequestStatus.Approved)
            && l.StartDate <= end && l.EndDate >= start, ct);
        if (overlaps) throw new ConflictException("You already have a leave request covering some of these dates.");

        var request = new LeaveRequest
        {
            Id = Guid.NewGuid(), DriverId = driver.Id, LeaveType = dto.LeaveType,
            StartDate = start, EndDate = end, Reason = dto.Reason?.Trim(),
            Status = LeaveRequestStatus.Pending, CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow
        };
        await _uow.Query<LeaveRequest>().AddAsync(request, ct);
        await _uow.SaveChangesAsync(ct);

        await _audit.LogAsync("LEAVE_REQUESTED", "LeaveRequest", request.Id, null,
            new { dto.LeaveType, start, end }, driverUserId, null, ct);
        return (await ToLeaveDtosAsync([request], ct)).First();
    }

    public async Task<IEnumerable<LeaveRequestDto>> GetMyLeaveAsync(Guid driverUserId, CancellationToken ct = default)
    {
        var driver = await GetDriverAsync(driverUserId, ct);
        var items = await _uow.Query<LeaveRequest>().Query().AsNoTracking()
            .Where(l => l.DriverId == driver.Id).OrderByDescending(l => l.CreatedAt).ToListAsync(ct);
        return await ToLeaveDtosAsync(items, ct);
    }

    public async Task CancelLeaveAsync(Guid requestId, Guid driverUserId, CancellationToken ct = default)
    {
        var driver = await GetDriverAsync(driverUserId, ct);
        var request = await _uow.Query<LeaveRequest>().GetByIdAsync(requestId, ct)
            ?? throw new NotFoundException("Leave request not found.");
        if (request.DriverId != driver.Id) throw new ForbiddenException("This leave request is not yours.");
        if (request.Status != LeaveRequestStatus.Pending)
            throw new BadRequestException("Only a pending request can be cancelled.");

        request.Status = LeaveRequestStatus.Cancelled;
        request.UpdatedAt = DateTime.UtcNow;
        await _uow.SaveChangesAsync(ct);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Approve Leave & Reassign Shifts (admin)
    // ═════════════════════════════════════════════════════════════════════════

    public async Task<IEnumerable<LeaveRequestDto>> GetPendingLeaveAsync(CancellationToken ct = default)
    {
        var items = await _uow.Query<LeaveRequest>().Query().AsNoTracking()
            .Where(l => l.Status == LeaveRequestStatus.Pending).OrderBy(l => l.StartDate).ToListAsync(ct);
        return await ToLeaveDtosAsync(items, ct);
    }

    public async Task<LeaveReviewResultDto> ReviewLeaveAsync(
        Guid requestId, ReviewLeaveDto dto, Guid adminUserId, CancellationToken ct = default)
    {
        var request = await _uow.Query<LeaveRequest>().GetByIdAsync(requestId, ct)
            ?? throw new NotFoundException("Leave request not found.");
        if (request.Status != LeaveRequestStatus.Pending)
            throw new BadRequestException($"This request has already been {request.Status.ToString().ToLower()}.");

        var driver = await _uow.Query<DriverProfile>().GetByIdAsync(request.DriverId, ct)
            ?? throw new NotFoundException("Driver not found.");

        if (!dto.Approve)
        {
            if (string.IsNullOrWhiteSpace(dto.Notes))
                throw new BadRequestException("Please give a reason when rejecting leave.");
            request.Status = LeaveRequestStatus.Rejected;
            request.AdminNotes = dto.Notes; request.ReviewedAt = DateTime.UtcNow; request.ReviewedByUserId = adminUserId;
            request.UpdatedAt = DateTime.UtcNow;
            await _uow.SaveChangesAsync(ct);
            await _audit.LogAsync("LEAVE_REJECTED", "LeaveRequest", request.Id, null, new { dto.Notes }, adminUserId, null, ct);
            await NotifyAsync(driver.UserId, "Leave declined",
                $"Your leave request ({request.StartDate:dd MMM}–{request.EndDate:dd MMM}) was declined. {dto.Notes}", ct);
            return new LeaveReviewResultDto((await ToLeaveDtosAsync([request], ct)).First(), 0, 0);
        }

        // ── Plan the reassignment first, without changing anything ─────────────
        var affected = await _uow.Query<DriverShift>().Query()
            .Where(s => s.DriverId == driver.Id && s.Status == ShiftStatus.Scheduled
                        && s.Date >= request.StartDate && s.Date <= request.EndDate)
            .OrderBy(s => s.Date).ToListAsync(ct);

        var windowFrom = request.StartDate.AddDays(-7);
        var windowTo = request.EndDate.AddDays(7);
        var window = await _uow.Query<DriverShift>().Query().AsNoTracking()
            .Where(s => s.Date >= windowFrom && s.Date <= windowTo && s.Status != ShiftStatus.Cancelled).ToListAsync(ct);
        var leaves = await _uow.Query<LeaveRequest>().Query().AsNoTracking()
            .Where(l => l.Status == LeaveRequestStatus.Approved && l.StartDate <= request.EndDate && l.EndDate >= request.StartDate)
            .ToListAsync(ct);
        var pool = await _uow.Query<DriverProfile>().Query().AsNoTracking()
            .Where(d => d.Status != DriverStatus.Suspended && d.Id != driver.Id).ToListAsync(ct);

        static DateTime WeekStart(DateTime d) => d.Date.AddDays(-(((int)d.DayOfWeek + 6) % 7));
        var load = window.Where(s => s.DriverId != null && s.Status == ShiftStatus.Scheduled)
            .GroupBy(s => (s.DriverId!.Value, WeekStart(s.Date))).ToDictionary(g => g.Key, g => g.Count());
        var busy = window.Where(s => s.DriverId != null).Select(s => (s.DriverId!.Value, s.Date.Date)).ToHashSet();

        var plan = new List<(DriverShift Shift, Guid? NewDriverId)>();
        foreach (var shift in affected)
        {
            var date = shift.Date.Date;
            var pick = pool
                .Where(d => !busy.Contains((d.Id, date))
                            && !leaves.Any(l => l.DriverId == d.Id && l.StartDate <= date && l.EndDate >= date))
                .OrderBy(d => load.GetValueOrDefault((d.Id, WeekStart(date))))
                .ThenBy(d => d.Id)
                .FirstOrDefault();

            if (pick is null) { plan.Add((shift, null)); continue; }
            plan.Add((shift, pick.Id));
            busy.Add((pick.Id, date));
            load[(pick.Id, WeekStart(date))] = load.GetValueOrDefault((pick.Id, WeekStart(date))) + 1;
        }

        // ── Depot coverage check ───────────────────────────────────────────────
        var short_ = new List<string>();
        foreach (var (shift, newDriver) in plan)
        {
            var staffed = window.Count(w => w.Date.Date == shift.Date.Date && w.ShiftType == shift.ShiftType
                                            && w.Status == ShiftStatus.Scheduled && w.DriverId != null
                                            && w.DriverId != driver.Id)
                          + (newDriver is null ? 0 : 1);
            if (staffed < _minDrivers)
                short_.Add($"{shift.Date:dd MMM} {shift.ShiftType} ({staffed} of {_minDrivers} drivers)");
        }
        if (short_.Count > 0 && !dto.AllowUnderstaffed)
            throw new BadRequestException(
                "Approving this leave would leave the depot understaffed: " + string.Join("; ", short_) +
                ". Assign cover first, reject the request, or approve it anyway and fill the open shifts afterwards.");

        // ── Apply ──────────────────────────────────────────────────────────────
        int reassigned = 0, open = 0;
        var driverIds = plan.Where(p => p.NewDriverId != null).Select(p => p.NewDriverId!.Value).Distinct().ToList();
        var coverDrivers = await _uow.Query<DriverProfile>().Query().Where(d => driverIds.Contains(d.Id)).ToListAsync(ct);

        foreach (var (shift, newDriver) in plan)
        {
            if (newDriver is null)
            {
                shift.DriverId = null; shift.Status = ShiftStatus.Open;
                shift.Note = "Open: driver on approved leave and no cover available"; open++;
            }
            else
            {
                shift.DriverId = newDriver;
                shift.Note = "Reassigned to cover approved leave"; reassigned++;
            }
            shift.UpdatedAt = DateTime.UtcNow;
        }

        request.Status = LeaveRequestStatus.Approved;
        request.AdminNotes = dto.Notes; request.ReviewedAt = DateTime.UtcNow; request.ReviewedByUserId = adminUserId;
        request.UpdatedAt = DateTime.UtcNow;
        await _uow.SaveChangesAsync(ct);

        await _audit.LogAsync("LEAVE_APPROVED", "LeaveRequest", request.Id, null,
            new { reassigned, open, dto.AllowUnderstaffed }, adminUserId, null, ct);
        await NotifyAsync(driver.UserId, "Leave approved",
            $"Your leave ({request.StartDate:dd MMM}–{request.EndDate:dd MMM}) was approved.", ct);
        foreach (var (shift, newDriver) in plan.Where(p => p.NewDriverId != null))
        {
            var cover = coverDrivers.FirstOrDefault(d => d.Id == newDriver);
            if (cover is not null)
                await NotifyAsync(cover.UserId, "Shift reassigned to you",
                    $"You are covering the {shift.ShiftType} shift on {shift.Date:dd MMM yyyy}.", ct);
        }

        return new LeaveReviewResultDto((await ToLeaveDtosAsync([request], ct)).First(), reassigned, open);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // Request Shift Swap (driver) and its approval (admin)
    // ═════════════════════════════════════════════════════════════════════════

    public async Task<IEnumerable<DriverOptionDto>> GetSwapPeersAsync(
        Guid shiftId, Guid driverUserId, CancellationToken ct = default)
    {
        var driver = await GetDriverAsync(driverUserId, ct);
        var shift = await _uow.Query<DriverShift>().GetByIdAsync(shiftId, ct)
            ?? throw new NotFoundException("Shift not found.");
        if (shift.DriverId != driver.Id) throw new ForbiddenException("This is not your shift.");

        var candidates = await _uow.Query<DriverProfile>().Query().AsNoTracking()
            .Include(d => d.User)
            .Where(d => d.Id != driver.Id && d.Status != DriverStatus.Suspended).ToListAsync(ct);

        var result = new List<DriverOptionDto>();
        foreach (var c in candidates)
        {
            if (await HasShiftOnAsync(c.Id, shift.Date, null, ct)) continue;
            if (await IsOnApprovedLeaveAsync(c.Id, shift.Date, ct)) continue;
            result.Add(new DriverOptionDto(c.Id, c.User?.FullName ?? "Driver"));
        }
        return result.OrderBy(r => r.Name).ToList();
    }

    public async Task<SwapRequestDto> RequestSwapAsync(
        CreateSwapRequestDto dto, Guid driverUserId, CancellationToken ct = default)
    {
        var driver = await GetDriverAsync(driverUserId, ct);
        var shift = await _uow.Query<DriverShift>().GetByIdAsync(dto.ShiftId, ct)
            ?? throw new NotFoundException("Shift not found.");

        if (shift.DriverId != driver.Id) throw new ForbiddenException("You can only swap your own shifts.");
        if (shift.Status != ShiftStatus.Scheduled || !shift.IsPublished)
            throw new BadRequestException("Only a published, scheduled shift can be swapped.");
        if (shift.Date.Date <= Today) throw new BadRequestException("A shift can only be swapped before the day it starts.");
        if (dto.PeerDriverId == driver.Id) throw new BadRequestException("Choose a different driver.");

        var peer = await _uow.Query<DriverProfile>().GetByIdAsync(dto.PeerDriverId, ct)
            ?? throw new NotFoundException("Driver not found.");
        await EnsurePeerEligibleAsync(peer, shift, ct);

        var open = await _uow.Query<ShiftSwapRequest>().Query().AnyAsync(r => r.ShiftId == shift.Id
            && (r.Status == SwapRequestStatus.AwaitingPeer || r.Status == SwapRequestStatus.AwaitingAdmin), ct);
        if (open) throw new ConflictException("This shift already has an open swap request.");

        var request = new ShiftSwapRequest
        {
            Id = Guid.NewGuid(), ShiftId = shift.Id, RequesterDriverId = driver.Id, PeerDriverId = peer.Id,
            Reason = dto.Reason?.Trim(), Status = SwapRequestStatus.AwaitingPeer,
            CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow
        };
        await _uow.Query<ShiftSwapRequest>().AddAsync(request, ct);
        await _uow.SaveChangesAsync(ct);

        await _audit.LogAsync("SWAP_REQUESTED", "ShiftSwapRequest", request.Id, null,
            new { shift.Date, shift.ShiftType, PeerDriverId = peer.Id }, driverUserId, null, ct);
        await NotifyAsync(peer.UserId, "Shift swap request",
            $"A colleague asked you to take the {shift.ShiftType} shift on {shift.Date:dd MMM yyyy}.", ct);

        return (await ToSwapDtosAsync([request], ct)).First();
    }

    public async Task<IEnumerable<SwapRequestDto>> GetMySwapsAsync(Guid driverUserId, CancellationToken ct = default)
    {
        var driver = await GetDriverAsync(driverUserId, ct);
        var items = await _uow.Query<ShiftSwapRequest>().Query().AsNoTracking()
            .Where(r => r.RequesterDriverId == driver.Id || r.PeerDriverId == driver.Id)
            .OrderByDescending(r => r.CreatedAt).ToListAsync(ct);
        return await ToSwapDtosAsync(items, ct, driver.Id);
    }

    public async Task<SwapRequestDto> RespondToSwapAsync(
        Guid requestId, RespondSwapDto dto, Guid driverUserId, CancellationToken ct = default)
    {
        var driver = await GetDriverAsync(driverUserId, ct);
        var request = await _uow.Query<ShiftSwapRequest>().GetByIdAsync(requestId, ct)
            ?? throw new NotFoundException("Swap request not found.");
        if (request.PeerDriverId != driver.Id) throw new ForbiddenException("This request was not sent to you.");
        if (request.Status != SwapRequestStatus.AwaitingPeer)
            throw new BadRequestException("This request is no longer waiting for your reply.");

        request.Status = dto.Accept ? SwapRequestStatus.AwaitingAdmin : SwapRequestStatus.DeclinedByPeer;
        request.UpdatedAt = DateTime.UtcNow;
        await _uow.SaveChangesAsync(ct);

        var requester = await _uow.Query<DriverProfile>().GetByIdAsync(request.RequesterDriverId, ct);
        if (requester is not null)
            await NotifyAsync(requester.UserId, dto.Accept ? "Swap accepted by your colleague" : "Swap declined",
                dto.Accept ? "It now needs admin approval." : "Your colleague declined the swap.", ct);

        return (await ToSwapDtosAsync([request], ct)).First();
    }

    public async Task<IEnumerable<SwapRequestDto>> GetPendingSwapsAsync(CancellationToken ct = default)
    {
        var items = await _uow.Query<ShiftSwapRequest>().Query().AsNoTracking()
            .Where(r => r.Status == SwapRequestStatus.AwaitingAdmin).OrderBy(r => r.CreatedAt).ToListAsync(ct);
        return await ToSwapDtosAsync(items, ct);
    }

    public async Task<SwapRequestDto> ReviewSwapAsync(
        Guid requestId, ReviewSwapDto dto, Guid adminUserId, CancellationToken ct = default)
    {
        var request = await _uow.Query<ShiftSwapRequest>().GetByIdAsync(requestId, ct)
            ?? throw new NotFoundException("Swap request not found.");
        if (request.Status != SwapRequestStatus.AwaitingAdmin)
            throw new BadRequestException("This request is not waiting for admin approval.");

        var shift = await _uow.Query<DriverShift>().GetByIdAsync(request.ShiftId, ct)
            ?? throw new NotFoundException("Shift not found.");
        var requester = await _uow.Query<DriverProfile>().GetByIdAsync(request.RequesterDriverId, ct);
        var peer = await _uow.Query<DriverProfile>().GetByIdAsync(request.PeerDriverId, ct);

        if (!dto.Approve)
        {
            if (string.IsNullOrWhiteSpace(dto.Notes))
                throw new BadRequestException("Please give a reason when rejecting a swap.");
            request.Status = SwapRequestStatus.Rejected;
        }
        else
        {
            // Re-check, because things can change between the request and the approval.
            if (shift.DriverId != request.RequesterDriverId || shift.Status != ShiftStatus.Scheduled)
                throw new BadRequestException("The shift has changed since this swap was requested.");
            if (shift.Date.Date <= Today) throw new BadRequestException("This shift has already started or passed.");
            if (peer is null) throw new NotFoundException("Driver not found.");
            await EnsurePeerEligibleAsync(peer, shift, ct);

            shift.DriverId = peer.Id;
            shift.Note = "Swapped with a colleague";
            shift.UpdatedAt = DateTime.UtcNow;
            request.Status = SwapRequestStatus.Approved;
        }

        request.AdminNotes = dto.Notes; request.ReviewedAt = DateTime.UtcNow;
        request.ReviewedByUserId = adminUserId; request.UpdatedAt = DateTime.UtcNow;
        await _uow.SaveChangesAsync(ct);

        await _audit.LogAsync(dto.Approve ? "SWAP_APPROVED" : "SWAP_REJECTED", "ShiftSwapRequest", request.Id,
            null, new { shift.Date, shift.ShiftType, dto.Notes }, adminUserId, null, ct);

        var msg = dto.Approve
            ? $"The swap for the {shift.ShiftType} shift on {shift.Date:dd MMM yyyy} was approved."
            : $"The swap for the {shift.ShiftType} shift on {shift.Date:dd MMM yyyy} was declined. {dto.Notes}";
        if (requester is not null) await NotifyAsync(requester.UserId, dto.Approve ? "Swap approved" : "Swap declined", msg, ct);
        if (peer is not null) await NotifyAsync(peer.UserId, dto.Approve ? "Swap approved" : "Swap declined", msg, ct);

        return (await ToSwapDtosAsync([request], ct)).First();
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private async Task<DriverProfile> GetDriverAsync(Guid userId, CancellationToken ct)
        => await _uow.Query<DriverProfile>().FirstOrDefaultAsync(d => d.UserId == userId, ct)
           ?? throw new NotFoundException("Driver profile not found.");

    private async Task<bool> HasShiftOnAsync(Guid driverId, DateTime date, Guid? exceptShiftId, CancellationToken ct)
        => await _uow.Query<DriverShift>().Query().AnyAsync(s => s.DriverId == driverId && s.Date == date.Date
            && s.Status != ShiftStatus.Cancelled && s.Id != exceptShiftId, ct);

    private async Task<bool> IsOnApprovedLeaveAsync(Guid driverId, DateTime date, CancellationToken ct)
        => await _uow.Query<LeaveRequest>().Query().AnyAsync(l => l.DriverId == driverId
            && l.Status == LeaveRequestStatus.Approved && l.StartDate <= date.Date && l.EndDate >= date.Date, ct);

    private async Task EnsurePeerEligibleAsync(DriverProfile peer, DriverShift shift, CancellationToken ct)
    {
        if (peer.Status == DriverStatus.Suspended)
            throw new BadRequestException("That driver cannot take shifts.");
        if (await HasShiftOnAsync(peer.Id, shift.Date, shift.Id, ct))
            throw new BadRequestException("That driver is already working on this day, so they are not off-duty.");
        if (await IsOnApprovedLeaveAsync(peer.Id, shift.Date, ct))
            throw new BadRequestException("That driver is on approved leave on this day.");
    }

    private async Task NotifyRosterPublishedAsync(IEnumerable<DriverShift> shifts, CancellationToken ct)
    {
        var driverIds = shifts.Where(s => s.DriverId != null).Select(s => s.DriverId!.Value).Distinct().ToList();
        if (driverIds.Count == 0) return;
        var drivers = await _uow.Query<DriverProfile>().Query().AsNoTracking()
            .Where(d => driverIds.Contains(d.Id)).ToListAsync(ct);
        foreach (var d in drivers)
            await NotifyAsync(d.UserId, "Roster published", "Your duty roster has been published. Check your schedule.", ct);
    }

    private async Task NotifyAsync(Guid userId, string title, string body, CancellationToken ct)
    {
        try { await _notifications.SendSystemAlertAsync(userId, title, body, ct); }
        catch (Exception ex) { Console.WriteLine($"[NOTIFY] Roster notification failed: {ex.Message}"); }
    }

    private async Task<Dictionary<Guid, string>> NamesAsync(IEnumerable<Guid> driverIds, CancellationToken ct)
    {
        var ids = driverIds.Distinct().ToList();
        var drivers = await _uow.Query<DriverProfile>().Query().AsNoTracking()
            .Include(d => d.User).Where(d => ids.Contains(d.Id)).ToListAsync(ct);
        return drivers.ToDictionary(d => d.Id, d => d.User?.FullName ?? "Driver");
    }

    private async Task<List<ShiftDto>> ToDtosAsync(IEnumerable<DriverShift> shifts, CancellationToken ct)
    {
        var list = shifts.ToList();
        var names = await NamesAsync(list.Where(s => s.DriverId != null).Select(s => s.DriverId!.Value), ct);
        return list.Select(s =>
        {
            var (start, end) = Hours(s.ShiftType);
            return new ShiftDto(s.Id, s.Date, s.ShiftType.ToString(), start, end, s.DriverId,
                s.DriverId is null ? null : names.GetValueOrDefault(s.DriverId.Value),
                s.Status.ToString(), s.IsPublished, s.Note);
        }).ToList();
    }

    private async Task<List<LeaveRequestDto>> ToLeaveDtosAsync(IEnumerable<LeaveRequest> items, CancellationToken ct)
    {
        var list = items.ToList();
        var names = await NamesAsync(list.Select(l => l.DriverId), ct);
        var result = new List<LeaveRequestDto>();
        foreach (var l in list)
        {
            var affected = await _uow.Query<DriverShift>().Query().CountAsync(s => s.DriverId == l.DriverId
                && s.Status == ShiftStatus.Scheduled && s.Date >= l.StartDate && s.Date <= l.EndDate, ct);
            result.Add(new LeaveRequestDto(l.Id, l.DriverId, names.GetValueOrDefault(l.DriverId, "Driver"),
                l.LeaveType.ToString(), l.StartDate, l.EndDate, l.Reason, l.Status.ToString(),
                l.AdminNotes, affected, l.CreatedAt));
        }
        return result;
    }

    private async Task<List<SwapRequestDto>> ToSwapDtosAsync(
        IEnumerable<ShiftSwapRequest> items, CancellationToken ct, Guid? viewerDriverId = null)
    {
        var list = items.ToList();
        var names = await NamesAsync(list.SelectMany(r => new[] { r.RequesterDriverId, r.PeerDriverId }), ct);
        var shiftIds = list.Select(r => r.ShiftId).Distinct().ToList();
        var shifts = await _uow.Query<DriverShift>().Query().AsNoTracking()
            .Where(s => shiftIds.Contains(s.Id)).ToDictionaryAsync(s => s.Id, ct);
        return list.Select(r =>
        {
            shifts.TryGetValue(r.ShiftId, out var s);
            return new SwapRequestDto(r.Id, r.ShiftId, s?.Date ?? default, s?.ShiftType.ToString() ?? "—",
                r.RequesterDriverId, names.GetValueOrDefault(r.RequesterDriverId, "Driver"),
                r.PeerDriverId, names.GetValueOrDefault(r.PeerDriverId, "Driver"),
                r.Status.ToString(), r.Reason, r.AdminNotes, r.CreatedAt,
                AwaitingMyReply: viewerDriverId == r.PeerDriverId && r.Status == SwapRequestStatus.AwaitingPeer);
        }).ToList();
    }
}
