using CourierSA.Application.DTOs.Shifts;
using CourierSA.Application.Interfaces.Services;
using CourierSA.Domain.Entities;
using CourierSA.Domain.Enums;
using CourierSA.Domain.Exceptions;
using CourierSA.Infrastructure.Data;
using CourierSA.Infrastructure.Data.Repositories;
using CourierSA.Infrastructure.Services;
using FluentAssertions;
using Microsoft.EntityFrameworkCore;
using Moq;
using Xunit;

namespace CourierSA.Tests.Services;

// ══════════════════════════════════════════════════════════════════════════════
// Roster, leave and shift swap tests.
// ══════════════════════════════════════════════════════════════════════════════
public class ShiftServiceTests
{
    private static DateTime Today => DateTime.UtcNow.AddHours(2).Date;

    private static (ShiftService sut, ApplicationDbContext db) Build()
    {
        var db = new ApplicationDbContext(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);
        var sut = new ShiftService(new UnitOfWork(db), new Mock<INotificationService>().Object,
            new Mock<IAuditService>().Object);
        return (sut, db);
    }

    private static async Task<DriverProfile> SeedDriverAsync(ApplicationDbContext db, string name = "Driver")
    {
        var user = new User { Id = Guid.NewGuid(), Email = $"{Guid.NewGuid()}@t.com", FirstName = name, LastName = "X",
            PhoneNumber = "+27000000000", PasswordHash = "x", Role = UserRole.Driver, Status = UserStatus.Active };
        var driver = new DriverProfile { Id = Guid.NewGuid(), UserId = user.Id, LicenseNumber = "L",
            LicenseExpiry = DateTime.UtcNow.AddYears(1), Status = DriverStatus.Available };
        db.Users.Add(user); db.DriverProfiles.Add(driver);
        await db.SaveChangesAsync();
        return driver;
    }

    private static async Task<DriverShift> SeedShiftAsync(ApplicationDbContext db, Guid driverId, int daysAhead,
        ShiftType type = ShiftType.Morning, bool published = true)
    {
        var s = new DriverShift { Id = Guid.NewGuid(), Date = Today.AddDays(daysAhead), ShiftType = type,
            DriverId = driverId, Status = ShiftStatus.Scheduled, IsPublished = published };
        db.DriverShifts.Add(s); await db.SaveChangesAsync();
        return s;
    }

    private static CreateLeaveRequestDto Leave(int fromDays, int toDays, LeaveType t = LeaveType.Annual)
        => new(t, Today.AddDays(fromDays), Today.AddDays(toDays), null);

    // ── Schedule Driver Roster ───────────────────────────────────────────────

    [Fact]
    public async Task Schedule_ValidShift_IsCreatedAsDraftUntilPublished()
    {
        var (sut, db) = Build(); var d = await SeedDriverAsync(db);

        var result = (await sut.ScheduleRosterAsync(new ScheduleRosterDto(
            [new ScheduleShiftItemDto(d.Id, Today.AddDays(3), ShiftType.Morning)], false), Guid.NewGuid())).ToList();

        result.Should().ContainSingle();
        result[0].IsPublished.Should().BeFalse();
        result[0].StartTime.Should().Be("07:30");
    }

    [Fact]
    public async Task Schedule_SecondShiftOnTheSameDay_ThrowsConflict()
    {
        var (sut, db) = Build(); var d = await SeedDriverAsync(db);
        await SeedShiftAsync(db, d.Id, 3);

        Func<Task> act = () => sut.ScheduleRosterAsync(new ScheduleRosterDto(
            [new ScheduleShiftItemDto(d.Id, Today.AddDays(3), ShiftType.Afternoon)], false), Guid.NewGuid());

        await act.Should().ThrowAsync<ConflictException>();
    }

    [Fact]
    public async Task Schedule_ShiftInThePast_ThrowsBadRequest()
    {
        var (sut, db) = Build(); var d = await SeedDriverAsync(db);

        Func<Task> act = () => sut.ScheduleRosterAsync(new ScheduleRosterDto(
            [new ScheduleShiftItemDto(d.Id, Today.AddDays(-1), ShiftType.Morning)], false), Guid.NewGuid());

        await act.Should().ThrowAsync<BadRequestException>();
    }

    [Fact]
    public async Task Publish_MakesDraftShiftsVisibleToTheDriver()
    {
        var (sut, db) = Build(); var d = await SeedDriverAsync(db);
        await SeedShiftAsync(db, d.Id, 3, published: false);
        (await sut.GetMyShiftsAsync(Today, Today.AddDays(10), d.UserId)).Should().BeEmpty();

        var count = await sut.PublishRosterAsync(new PublishRosterDto(Today, Today.AddDays(10)), Guid.NewGuid());

        count.Should().Be(1);
        (await sut.GetMyShiftsAsync(Today, Today.AddDays(10), d.UserId)).Should().ContainSingle();
    }

    // ── Request Driver Leave ─────────────────────────────────────────────────

    [Fact]
    public async Task RequestLeave_Valid_IsPendingAndCountsAffectedShifts()
    {
        var (sut, db) = Build(); var d = await SeedDriverAsync(db);
        await SeedShiftAsync(db, d.Id, 3);

        var result = await sut.RequestLeaveAsync(Leave(2, 4), d.UserId);

        result.Status.Should().Be(nameof(LeaveRequestStatus.Pending));
        result.AffectedShifts.Should().Be(1);
    }

    [Fact]
    public async Task RequestLeave_StartingInThePast_ThrowsBadRequest()
    {
        var (sut, db) = Build(); var d = await SeedDriverAsync(db);

        Func<Task> act = () => sut.RequestLeaveAsync(Leave(-2, 1), d.UserId);

        await act.Should().ThrowAsync<BadRequestException>();
    }

    [Fact]
    public async Task RequestLeave_EndBeforeStart_ThrowsBadRequest()
    {
        var (sut, db) = Build(); var d = await SeedDriverAsync(db);

        Func<Task> act = () => sut.RequestLeaveAsync(Leave(5, 3), d.UserId);

        await act.Should().ThrowAsync<BadRequestException>();
    }

    [Fact]
    public async Task RequestLeave_OverlappingAnotherRequest_ThrowsConflict()
    {
        var (sut, db) = Build(); var d = await SeedDriverAsync(db);
        await sut.RequestLeaveAsync(Leave(2, 5), d.UserId);

        Func<Task> act = () => sut.RequestLeaveAsync(Leave(4, 7), d.UserId);

        await act.Should().ThrowAsync<ConflictException>();
    }

    [Fact]
    public async Task CancelLeave_Pending_Works_ButApprovedCannotBeCancelled()
    {
        var (sut, db) = Build(); var d = await SeedDriverAsync(db);
        var first = await sut.RequestLeaveAsync(Leave(2, 3), d.UserId);
        await sut.CancelLeaveAsync(first.Id, d.UserId);
        (await db.LeaveRequests.FindAsync(first.Id))!.Status.Should().Be(LeaveRequestStatus.Cancelled);

        var second = await sut.RequestLeaveAsync(Leave(2, 3), d.UserId);
        await sut.ReviewLeaveAsync(second.Id, new ReviewLeaveDto(true, null), Guid.NewGuid());
        Func<Task> act = () => sut.CancelLeaveAsync(second.Id, d.UserId);

        await act.Should().ThrowAsync<BadRequestException>();
    }

    // ── Approve Leave & Reassign Shifts ──────────────────────────────────────

    [Fact]
    public async Task ApproveLeave_ReassignsTheShiftToAnAvailableDriver()
    {
        var (sut, db) = Build();
        var leaving = await SeedDriverAsync(db, "Leaving"); var cover = await SeedDriverAsync(db, "Cover");
        var shift = await SeedShiftAsync(db, leaving.Id, 3);
        var req = await sut.RequestLeaveAsync(Leave(3, 3), leaving.UserId);

        var result = await sut.ReviewLeaveAsync(req.Id, new ReviewLeaveDto(true, null), Guid.NewGuid());

        result.ReassignedShifts.Should().Be(1);
        result.OpenShifts.Should().Be(0);
        var updated = await db.DriverShifts.FindAsync(shift.Id);
        updated!.DriverId.Should().Be(cover.Id);
        updated.Status.Should().Be(ShiftStatus.Scheduled);
    }

    [Fact]
    public async Task ApproveLeave_PicksTheDriverWithTheLightestWeek()
    {
        var (sut, db) = Build();
        var leaving = await SeedDriverAsync(db, "Leaving");
        var busy = await SeedDriverAsync(db, "Busy"); var free = await SeedDriverAsync(db, "Free");
        // 'Busy' already works every other day this week; 'Free' works none.
        await SeedShiftAsync(db, busy.Id, 1); await SeedShiftAsync(db, busy.Id, 2);
        var target = await SeedShiftAsync(db, leaving.Id, 3);
        var req = await sut.RequestLeaveAsync(Leave(3, 3), leaving.UserId);

        await sut.ReviewLeaveAsync(req.Id, new ReviewLeaveDto(true, null), Guid.NewGuid());

        (await db.DriverShifts.FindAsync(target.Id))!.DriverId.Should().Be(free.Id);
    }

    [Fact]
    public async Task ApproveLeave_WithNoCover_LeavesTheShiftOpen_WhenOverrideIsGiven()
    {
        var (sut, db) = Build();
        var leaving = await SeedDriverAsync(db);          // the only driver
        var shift = await SeedShiftAsync(db, leaving.Id, 3);
        var req = await sut.RequestLeaveAsync(Leave(3, 3), leaving.UserId);

        var result = await sut.ReviewLeaveAsync(req.Id, new ReviewLeaveDto(true, null, AllowUnderstaffed: true), Guid.NewGuid());

        result.OpenShifts.Should().Be(1);
        var updated = await db.DriverShifts.FindAsync(shift.Id);
        updated!.Status.Should().Be(ShiftStatus.Open);
        updated.DriverId.Should().BeNull();
    }

    [Fact]
    public async Task ApproveLeave_WouldLeaveDepotUnderstaffed_IsBlockedAndNothingChanges()
    {
        var (sut, db) = Build();
        var leaving = await SeedDriverAsync(db);          // the only driver
        var shift = await SeedShiftAsync(db, leaving.Id, 3);
        var req = await sut.RequestLeaveAsync(Leave(3, 3), leaving.UserId);

        Func<Task> act = () => sut.ReviewLeaveAsync(req.Id, new ReviewLeaveDto(true, null), Guid.NewGuid());

        await act.Should().ThrowAsync<BadRequestException>().WithMessage("*understaffed*");
        (await db.LeaveRequests.AsNoTracking().SingleAsync()).Status.Should().Be(LeaveRequestStatus.Pending);
        (await db.DriverShifts.AsNoTracking().SingleAsync(s => s.Id == shift.Id)).DriverId.Should().Be(leaving.Id);
    }

    [Fact]
    public async Task ApproveLeave_DoesNotUseADriverWhoIsAlreadyWorkingThatDay()
    {
        var (sut, db) = Build();
        var leaving = await SeedDriverAsync(db); var working = await SeedDriverAsync(db);
        await SeedShiftAsync(db, working.Id, 3, ShiftType.Afternoon);   // already on shift that day
        var target = await SeedShiftAsync(db, leaving.Id, 3);
        var req = await sut.RequestLeaveAsync(Leave(3, 3), leaving.UserId);

        var result = await sut.ReviewLeaveAsync(req.Id, new ReviewLeaveDto(true, null, true), Guid.NewGuid());

        result.OpenShifts.Should().Be(1);
        (await db.DriverShifts.FindAsync(target.Id))!.DriverId.Should().BeNull();
    }

    [Fact]
    public async Task RejectLeave_WithoutNotes_ThrowsBadRequest()
    {
        var (sut, db) = Build(); var d = await SeedDriverAsync(db);
        var req = await sut.RequestLeaveAsync(Leave(3, 3), d.UserId);

        Func<Task> act = () => sut.ReviewLeaveAsync(req.Id, new ReviewLeaveDto(false, null), Guid.NewGuid());

        await act.Should().ThrowAsync<BadRequestException>();
    }

    [Fact]
    public async Task RejectLeave_KeepsTheDriversShifts()
    {
        var (sut, db) = Build(); var d = await SeedDriverAsync(db);
        var shift = await SeedShiftAsync(db, d.Id, 3);
        var req = await sut.RequestLeaveAsync(Leave(3, 3), d.UserId);

        await sut.ReviewLeaveAsync(req.Id, new ReviewLeaveDto(false, "Too busy that week"), Guid.NewGuid());

        (await db.DriverShifts.FindAsync(shift.Id))!.DriverId.Should().Be(d.Id);
        (await db.LeaveRequests.FindAsync(req.Id))!.Status.Should().Be(LeaveRequestStatus.Rejected);
    }

    [Fact]
    public async Task AssignOpenShift_StaffsTheShift()
    {
        var (sut, db) = Build();
        var leaving = await SeedDriverAsync(db); var other = await SeedDriverAsync(db);
        var shift = await SeedShiftAsync(db, leaving.Id, 3);
        shift.DriverId = null; shift.Status = ShiftStatus.Open; await db.SaveChangesAsync();

        var result = await sut.AssignOpenShiftAsync(shift.Id, new AssignShiftDto(other.Id), Guid.NewGuid());

        result.Status.Should().Be(nameof(ShiftStatus.Scheduled));
        result.DriverId.Should().Be(other.Id);
    }

    // ── Request Shift Swap ───────────────────────────────────────────────────

    [Fact]
    public async Task Swap_FullFlow_PeerAcceptsAdminApproves_ShiftMovesToPeer()
    {
        var (sut, db) = Build();
        var a = await SeedDriverAsync(db, "A"); var b = await SeedDriverAsync(db, "B");
        var shift = await SeedShiftAsync(db, a.Id, 3);

        var req = await sut.RequestSwapAsync(new CreateSwapRequestDto(shift.Id, b.Id, "family event"), a.UserId);
        req.Status.Should().Be(nameof(SwapRequestStatus.AwaitingPeer));

        var accepted = await sut.RespondToSwapAsync(req.Id, new RespondSwapDto(true), b.UserId);
        accepted.Status.Should().Be(nameof(SwapRequestStatus.AwaitingAdmin));

        var approved = await sut.ReviewSwapAsync(req.Id, new ReviewSwapDto(true, null), Guid.NewGuid());
        approved.Status.Should().Be(nameof(SwapRequestStatus.Approved));
        (await db.DriverShifts.FindAsync(shift.Id))!.DriverId.Should().Be(b.Id);
    }

    [Fact]
    public async Task Swap_WithPeerWhoIsWorkingThatDay_ThrowsBadRequest()
    {
        var (sut, db) = Build();
        var a = await SeedDriverAsync(db); var b = await SeedDriverAsync(db);
        var shift = await SeedShiftAsync(db, a.Id, 3);
        await SeedShiftAsync(db, b.Id, 3, ShiftType.Afternoon);

        Func<Task> act = () => sut.RequestSwapAsync(new CreateSwapRequestDto(shift.Id, b.Id, null), a.UserId);

        await act.Should().ThrowAsync<BadRequestException>();
    }

    [Fact]
    public async Task Swap_OfSomeoneElsesShift_ThrowsForbidden()
    {
        var (sut, db) = Build();
        var a = await SeedDriverAsync(db); var b = await SeedDriverAsync(db); var c = await SeedDriverAsync(db);
        var shift = await SeedShiftAsync(db, a.Id, 3);

        Func<Task> act = () => sut.RequestSwapAsync(new CreateSwapRequestDto(shift.Id, c.Id, null), b.UserId);

        await act.Should().ThrowAsync<ForbiddenException>();
    }

    [Fact]
    public async Task Swap_OfAShiftThatStartsToday_ThrowsBadRequest()
    {
        var (sut, db) = Build();
        var a = await SeedDriverAsync(db); var b = await SeedDriverAsync(db);
        var shift = await SeedShiftAsync(db, a.Id, 0);

        Func<Task> act = () => sut.RequestSwapAsync(new CreateSwapRequestDto(shift.Id, b.Id, null), a.UserId);

        await act.Should().ThrowAsync<BadRequestException>();
    }

    [Fact]
    public async Task Swap_WhenPeerDeclines_ShiftStaysWithTheRequester()
    {
        var (sut, db) = Build();
        var a = await SeedDriverAsync(db); var b = await SeedDriverAsync(db);
        var shift = await SeedShiftAsync(db, a.Id, 3);
        var req = await sut.RequestSwapAsync(new CreateSwapRequestDto(shift.Id, b.Id, null), a.UserId);

        var declined = await sut.RespondToSwapAsync(req.Id, new RespondSwapDto(false), b.UserId);

        declined.Status.Should().Be(nameof(SwapRequestStatus.DeclinedByPeer));
        (await db.DriverShifts.FindAsync(shift.Id))!.DriverId.Should().Be(a.Id);
    }

    [Fact]
    public async Task Swap_OnlyThePeerCanRespond()
    {
        var (sut, db) = Build();
        var a = await SeedDriverAsync(db); var b = await SeedDriverAsync(db); var c = await SeedDriverAsync(db);
        var shift = await SeedShiftAsync(db, a.Id, 3);
        var req = await sut.RequestSwapAsync(new CreateSwapRequestDto(shift.Id, b.Id, null), a.UserId);

        Func<Task> act = () => sut.RespondToSwapAsync(req.Id, new RespondSwapDto(true), c.UserId);

        await act.Should().ThrowAsync<ForbiddenException>();
    }

    [Fact]
    public async Task Swap_SecondOpenRequestForTheSameShift_ThrowsConflict()
    {
        var (sut, db) = Build();
        var a = await SeedDriverAsync(db); var b = await SeedDriverAsync(db); var c = await SeedDriverAsync(db);
        var shift = await SeedShiftAsync(db, a.Id, 3);
        await sut.RequestSwapAsync(new CreateSwapRequestDto(shift.Id, b.Id, null), a.UserId);

        Func<Task> act = () => sut.RequestSwapAsync(new CreateSwapRequestDto(shift.Id, c.Id, null), a.UserId);

        await act.Should().ThrowAsync<ConflictException>();
    }

    [Fact]
    public async Task Swap_AdminRejectWithoutNotes_ThrowsBadRequest()
    {
        var (sut, db) = Build();
        var a = await SeedDriverAsync(db); var b = await SeedDriverAsync(db);
        var shift = await SeedShiftAsync(db, a.Id, 3);
        var req = await sut.RequestSwapAsync(new CreateSwapRequestDto(shift.Id, b.Id, null), a.UserId);
        await sut.RespondToSwapAsync(req.Id, new RespondSwapDto(true), b.UserId);

        Func<Task> act = () => sut.ReviewSwapAsync(req.Id, new ReviewSwapDto(false, null), Guid.NewGuid());

        await act.Should().ThrowAsync<BadRequestException>();
    }

    [Fact]
    public async Task SwapPeers_ListsOnlyOffDutyDrivers()
    {
        var (sut, db) = Build();
        var a = await SeedDriverAsync(db); var off = await SeedDriverAsync(db); var working = await SeedDriverAsync(db);
        var shift = await SeedShiftAsync(db, a.Id, 3);
        await SeedShiftAsync(db, working.Id, 3, ShiftType.Afternoon);

        var peers = (await sut.GetSwapPeersAsync(shift.Id, a.UserId)).ToList();

        peers.Should().ContainSingle(p => p.DriverId == off.Id);
        peers.Should().NotContain(p => p.DriverId == working.Id);
    }
}
