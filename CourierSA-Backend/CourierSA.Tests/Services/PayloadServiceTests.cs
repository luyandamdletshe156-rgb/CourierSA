using System.Text.Json;
using CourierSA.Application.DTOs.Payload;
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
// UC14 Validate and Adjust Vehicle Payload / UC15 Split Overloaded Routes.
// Runs are seeded straight into the database, so these tests exercise PayloadService on its own.
// ══════════════════════════════════════════════════════════════════════════════
public class PayloadServiceTests
{
    private static ApplicationDbContext CreateContext()
        => new(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    private static PayloadService BuildSut(ApplicationDbContext db)
    => new(new UnitOfWork(db), new Mock<IAuditService>().Object, new Mock<IParcelService>().Object);


    private static async Task<(DriverProfile Driver, Vehicle Vehicle)> SeedDriverAsync(
        ApplicationDbContext db, decimal capacityKg, DriverStatus status = DriverStatus.Available)
    {
        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = $"{Guid.NewGuid()}@t.com",
            FirstName = "D",
            LastName = "R",
            PhoneNumber = "+27000000000",
            PasswordHash = "x",
            Role = UserRole.Driver,
            Status = UserStatus.Active
        };
        var driver = new DriverProfile
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            LicenseNumber = "L1",
            LicenseExpiry = DateTime.UtcNow.AddYears(1),
            Status = status
        };
        var vehicle = new Vehicle
        {
            Id = Guid.NewGuid(),
            RegistrationNumber = $"KZN{Guid.NewGuid().ToString()[..6]}",
            Status = VehicleStatus.Active,
            PayloadCapacityKg = capacityKg,
            AssignedDriverId = driver.Id
        };
        db.Users.Add(user); db.DriverProfiles.Add(driver); db.Vehicles.Add(vehicle);
        await db.SaveChangesAsync();
        return (driver, vehicle);
    }

    /// <summary>A vehicle that belongs to no driver (a pool vehicle).</summary>
    private static async Task<Vehicle> SeedPoolVehicleAsync(ApplicationDbContext db, decimal capacityKg)
    {
        var vehicle = new Vehicle
        {
            Id = Guid.NewGuid(),
            RegistrationNumber = $"POOL{Guid.NewGuid().ToString()[..6]}",
            Status = VehicleStatus.Active,
            PayloadCapacityKg = capacityKg
        };
        db.Vehicles.Add(vehicle);
        await db.SaveChangesAsync();
        return vehicle;
    }

    private static async Task<List<Parcel>> SeedParcelsAsync(ApplicationDbContext db, params decimal[] weights)
    {
        var address = new ParcelAddress
        {
            Id = Guid.NewGuid(),
            RecipientName = "Rec",
            RecipientPhone = "+27000000001",
            StreetAddress = "1 Test St",
            City = "Durban",
            Province = SaProvince.KwaZuluNatal,
            PostalCode = "4001"
        };
        db.ParcelAddresses.Add(address);

        var parcels = weights.Select(w => new Parcel
        {
            Id = Guid.NewGuid(),
            TrackingNumber = $"CSA-PL-{Guid.NewGuid().ToString()[..8]}",
            CustomerId = Guid.NewGuid(),
            Status = ParcelStatus.CheckedOut,
            ServiceType = ServiceType.Standard,
            WeightKg = w,
            PickupAddressId = address.Id,
            DeliveryAddressId = address.Id
        }).ToList();
        db.Parcels.AddRange(parcels);
        await db.SaveChangesAsync();
        return parcels;
    }

    private static async Task<DeliveryRoute> SeedRunAsync(
        ApplicationDbContext db, DriverProfile driver, Vehicle vehicle, List<Parcel> parcels,
        RouteStatus? status = null, DateTime? createdAt = null)
    {
        var total = parcels.Sum(p => p.WeightKg);
        var over = total > vehicle.PayloadCapacityKg;
        var route = new DeliveryRoute
        {
            Id = Guid.NewGuid(),
            DriverId = driver.Id,
            VehicleId = vehicle.Id,
            Zone = SortingZone.Local,
            Status = status ?? (over ? RouteStatus.PendingPayloadReview : RouteStatus.Planned),
            TotalWeightKg = total,
            PayloadCapacityKg = vehicle.PayloadCapacityKg,
            PayloadOverageKg = over ? total - vehicle.PayloadCapacityKg : 0m,
            HeldParcelIdsJson = JsonSerializer.Serialize(parcels.Select(p => p.Id)),
            CreatedAt = createdAt ?? DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        db.DeliveryRoutes.Add(route);
        await db.SaveChangesAsync();
        return route;
    }

    // ── UC14: overview panel ──────────────────────────────────────────────────

    [Fact]
    public async Task Overview_ListsEveryRunWithLoadAgainstMaximum()
    {
        var db = CreateContext(); var sut = BuildSut(db);
        var today = DateTime.UtcNow.Date;
        var (d1, v1) = await SeedDriverAsync(db, 100m);
        var (d2, v2) = await SeedDriverAsync(db, 100m);
        var (d3, v3) = await SeedDriverAsync(db, 100m);
        await SeedRunAsync(db, d1, v1, await SeedParcelsAsync(db, 60m), createdAt: today.AddHours(1));
        await SeedRunAsync(db, d2, v2, await SeedParcelsAsync(db, 60m, 50m), createdAt: today.AddHours(2));
        await SeedRunAsync(db, d3, v3, await SeedParcelsAsync(db, 10m), status: RouteStatus.Cancelled, createdAt: today.AddHours(3));

        var result = await sut.GetOverviewAsync(null);

        result.Runs.Should().HaveCount(2);   // the cancelled run is left out
        result.Runs[0].RunLabel.Should().Be("Run A");
        result.Runs[0].LoadKg.Should().Be(60m);
        result.Runs[0].MaxKg.Should().Be(100m);
        result.Runs[0].UtilizationPercent.Should().Be(60m);
        result.Runs[0].OverageKg.Should().Be(0m);
        result.Runs[1].RunLabel.Should().Be("Run B");
        result.Runs[1].OverageKg.Should().Be(10m);
        result.Runs[1].Parcels.Should().HaveCount(2);
        result.Runs[1].VehicleRegistration.Should().Be(v2.RegistrationNumber);
    }

    // ── UC14: reallocation ────────────────────────────────────────────────────

    [Fact]
    public async Task Reallocate_ToQueue_RemovesParcelsAndMakesRunCompliant()
    {
        var db = CreateContext(); var sut = BuildSut(db);
        var (driver, vehicle) = await SeedDriverAsync(db, 100m);
        var parcels = await SeedParcelsAsync(db, 60m, 50m);
        var run = await SeedRunAsync(db, driver, vehicle, parcels);

        var result = await sut.ReallocateAsync(run.Id, new ReallocateDto([parcels[1].Id], null, "too heavy"), Guid.NewGuid());

        result.ReturnedToQueue.Should().Be(1);
        result.MovedToTarget.Should().Be(0);
        result.SourceStatus.Should().Be(nameof(RouteStatus.PayloadCompliant));
        var saved = await db.DeliveryRoutes.AsNoTracking().SingleAsync();
        saved.TotalWeightKg.Should().Be(60m);
        saved.PayloadOverageKg.Should().Be(0m);
    }

    [Fact]
    public async Task Reallocate_ToAnotherRun_MovesTheParcelsToThatRun()
    {
        var db = CreateContext(); var sut = BuildSut(db);
        var (d1, v1) = await SeedDriverAsync(db, 100m);
        var (d2, v2) = await SeedDriverAsync(db, 100m);
        var parcelsA = await SeedParcelsAsync(db, 60m, 50m);   // Run A: 110 kg on a 100 kg vehicle
        var parcelsB = await SeedParcelsAsync(db, 30m);        // Run B: 30 kg
        var runA = await SeedRunAsync(db, d1, v1, parcelsA);
        var runB = await SeedRunAsync(db, d2, v2, parcelsB);

        var result = await sut.ReallocateAsync(runA.Id, new ReallocateDto([parcelsA[1].Id], runB.Id, null), Guid.NewGuid());

        result.MovedToTarget.Should().Be(1);
        result.SourceStatus.Should().Be(nameof(RouteStatus.PayloadCompliant));
        var savedA = await db.DeliveryRoutes.AsNoTracking().SingleAsync(r => r.Id == runA.Id);
        var savedB = await db.DeliveryRoutes.AsNoTracking().SingleAsync(r => r.Id == runB.Id);
        savedA.TotalWeightKg.Should().Be(60m);
        savedB.TotalWeightKg.Should().Be(80m);
        JsonSerializer.Deserialize<List<Guid>>(savedB.HeldParcelIdsJson!)!.Should().Contain(parcelsA[1].Id);
    }

    [Fact]
    public async Task Reallocate_ToRunThatWouldBeOverloaded_IsBlockedAndNothingChanges()
    {
        var db = CreateContext(); var sut = BuildSut(db);
        var (d1, v1) = await SeedDriverAsync(db, 100m);
        var (d2, v2) = await SeedDriverAsync(db, 100m);
        var parcelsA = await SeedParcelsAsync(db, 60m, 50m);
        var parcelsB = await SeedParcelsAsync(db, 60m);
        var runA = await SeedRunAsync(db, d1, v1, parcelsA);
        var runB = await SeedRunAsync(db, d2, v2, parcelsB);

        Func<Task> act = () => sut.ReallocateAsync(runA.Id, new ReallocateDto([parcelsA[1].Id], runB.Id, null), Guid.NewGuid());

        await act.Should().ThrowAsync<BadRequestException>().WithMessage("*over its*");
        (await db.DeliveryRoutes.AsNoTracking().SingleAsync(r => r.Id == runA.Id)).TotalWeightKg.Should().Be(110m);
        (await db.DeliveryRoutes.AsNoTracking().SingleAsync(r => r.Id == runB.Id)).TotalWeightKg.Should().Be(60m);
    }

    [Fact]
    public async Task Reallocate_EveryParcel_ThrowsBadRequest()
    {
        var db = CreateContext(); var sut = BuildSut(db);
        var (driver, vehicle) = await SeedDriverAsync(db, 100m);
        var parcels = await SeedParcelsAsync(db, 60m, 50m);
        var run = await SeedRunAsync(db, driver, vehicle, parcels);

        Func<Task> act = () => sut.ReallocateAsync(run.Id, new ReallocateDto(parcels.Select(p => p.Id).ToList(), null, null), Guid.NewGuid());

        await act.Should().ThrowAsync<BadRequestException>();
    }

    [Fact]
    public async Task Reallocate_EveryParcelToAnotherRun_MovesThemAndRetiresTheEmptyRun()
    {
        var db = CreateContext(); var sut = BuildSut(db);
        var (d1, v1) = await SeedDriverAsync(db, 40m);
        var (d2, v2) = await SeedDriverAsync(db, 1000m);
        var heavy = await SeedParcelsAsync(db, 45m);            // one 45 kg parcel on a 40 kg vehicle
        var runA = await SeedRunAsync(db, d1, v1, heavy);
        var runB = await SeedRunAsync(db, d2, v2, await SeedParcelsAsync(db, 5m));

        var result = await sut.ReallocateAsync(runA.Id, new ReallocateDto(heavy.Select(p => p.Id).ToList(), runB.Id, null), Guid.NewGuid());

        result.MovedToTarget.Should().Be(1);
        result.SourceStatus.Should().Be(nameof(RouteStatus.Cancelled));
        var savedA = await db.DeliveryRoutes.AsNoTracking().SingleAsync(r => r.Id == runA.Id);
        var savedB = await db.DeliveryRoutes.AsNoTracking().SingleAsync(r => r.Id == runB.Id);
        savedA.Status.Should().Be(RouteStatus.Cancelled);
        savedA.TotalWeightKg.Should().Be(0m);
        savedB.TotalWeightKg.Should().Be(50m);
        JsonSerializer.Deserialize<List<Guid>>(savedB.HeldParcelIdsJson!)!.Should().Contain(heavy[0].Id);
    }

    [Fact]
    public async Task Reallocate_ParcelNotOnTheRun_ThrowsBadRequest()
    {
        var db = CreateContext(); var sut = BuildSut(db);
        var (driver, vehicle) = await SeedDriverAsync(db, 100m);
        var run = await SeedRunAsync(db, driver, vehicle, await SeedParcelsAsync(db, 60m, 50m));

        Func<Task> act = () => sut.ReallocateAsync(run.Id, new ReallocateDto([Guid.NewGuid()], null, null), Guid.NewGuid());

        await act.Should().ThrowAsync<BadRequestException>();
    }

    [Fact]
    public async Task Reallocate_ToTheSameRun_ThrowsBadRequest()
    {
        var db = CreateContext(); var sut = BuildSut(db);
        var (driver, vehicle) = await SeedDriverAsync(db, 100m);
        var parcels = await SeedParcelsAsync(db, 60m, 50m);
        var run = await SeedRunAsync(db, driver, vehicle, parcels);

        Func<Task> act = () => sut.ReallocateAsync(run.Id, new ReallocateDto([parcels[1].Id], run.Id, null), Guid.NewGuid());

        await act.Should().ThrowAsync<BadRequestException>();
    }

    // ── UC14: sign-off ────────────────────────────────────────────────────────

    [Fact]
    public async Task SignOff_WithinLimit_RecordsWhoAndWhen()
    {
        var db = CreateContext(); var sut = BuildSut(db);
        var (driver, vehicle) = await SeedDriverAsync(db, 100m);
        var run = await SeedRunAsync(db, driver, vehicle, await SeedParcelsAsync(db, 30m, 40m));
        var dispatcher = Guid.NewGuid();

        var result = await sut.SignOffAsync(run.Id, new SignOffDto("checked"), dispatcher);

        result.SignedOff.Should().BeTrue();
        result.Status.Should().Be(nameof(RouteStatus.PayloadCompliant));
        var saved = await db.DeliveryRoutes.AsNoTracking().SingleAsync();
        saved.SignedOffByUserId.Should().Be(dispatcher);
        saved.SignedOffAt.Should().NotBeNull();
    }

    [Fact]
    public async Task SignOff_OverLimit_ThrowsBadRequest()
    {
        var db = CreateContext(); var sut = BuildSut(db);
        var (driver, vehicle) = await SeedDriverAsync(db, 100m);
        var run = await SeedRunAsync(db, driver, vehicle, await SeedParcelsAsync(db, 60m, 50m));

        Func<Task> act = () => sut.SignOffAsync(run.Id, new SignOffDto(null), Guid.NewGuid());

        await act.Should().ThrowAsync<BadRequestException>();
        (await db.DeliveryRoutes.AsNoTracking().SingleAsync()).SignedOffAt.Should().BeNull();
    }

    [Fact]
    public async Task ChangingAManifestAfterSignOff_ClearsTheSignOff()
    {
        var db = CreateContext(); var sut = BuildSut(db);
        var (driver, vehicle) = await SeedDriverAsync(db, 100m);
        var parcels = await SeedParcelsAsync(db, 30m, 40m);
        var run = await SeedRunAsync(db, driver, vehicle, parcels);
        await sut.SignOffAsync(run.Id, new SignOffDto(null), Guid.NewGuid());

        await sut.ReallocateAsync(run.Id, new ReallocateDto([parcels[1].Id], null, null), Guid.NewGuid());

        var saved = await db.DeliveryRoutes.AsNoTracking().SingleAsync();
        saved.SignedOffAt.Should().BeNull();
        saved.SignedOffByUserId.Should().BeNull();
    }

    [Fact]
    public async Task SignOff_OnAReleasedRun_ThrowsBadRequest()
    {
        var db = CreateContext(); var sut = BuildSut(db);
        var (driver, vehicle) = await SeedDriverAsync(db, 100m);
        var run = await SeedRunAsync(db, driver, vehicle, await SeedParcelsAsync(db, 30m), status: RouteStatus.InProgress);

        Func<Task> act = () => sut.SignOffAsync(run.Id, new SignOffDto(null), Guid.NewGuid());

        await act.Should().ThrowAsync<BadRequestException>();
    }

    // ── UC15: split ───────────────────────────────────────────────────────────

    [Fact]
    public async Task SplitOptions_ListFreeAvailableAndOffDutyDrivers_ButNotSuspendedOrBusy()
    {
        var db = CreateContext(); var sut = BuildSut(db);
        var (primary, primaryVehicle) = await SeedDriverAsync(db, 100m);
        var (standby, standbyVehicle) = await SeedDriverAsync(db, 100m);
        var (offDuty, _) = await SeedDriverAsync(db, 100m, DriverStatus.OffDuty);
        var (suspended, _) = await SeedDriverAsync(db, 100m, DriverStatus.Suspended);
        var (busy, busyVehicle) = await SeedDriverAsync(db, 100m);
        var run = await SeedRunAsync(db, primary, primaryVehicle, await SeedParcelsAsync(db, 60m, 50m));
        await SeedRunAsync(db, busy, busyVehicle, await SeedParcelsAsync(db, 20m));   // busy driver is already on a run

        var options = await sut.GetSplitOptionsAsync(run.Id);

        options.Drivers.Select(d => d.DriverId).Should().BeEquivalentTo([standby.Id, offDuty.Id]);
        options.Drivers.Select(d => d.DriverId).Should().NotContain([suspended.Id, busy.Id]);
        options.Vehicles.Select(v => v.VehicleId).Should().Contain(standbyVehicle.Id);
        options.Vehicles.Select(v => v.VehicleId).Should().NotContain([primaryVehicle.Id, busyVehicle.Id]);
    }

    [Fact]
    public async Task SplitPreview_SingleParcelHeavierThanTheVehicle_ExplainsItCannotBeSplit()
    {
        var db = CreateContext(); var sut = BuildSut(db);
        var (primary, primaryVehicle) = await SeedDriverAsync(db, 40m);
        var (standby, standbyVehicle) = await SeedDriverAsync(db, 800m);
        var run = await SeedRunAsync(db, primary, primaryVehicle, await SeedParcelsAsync(db, 45m));

        Func<Task> act = () => sut.PreviewSplitAsync(run.Id, new SplitRequestDto(standby.Id, standbyVehicle.Id, null));

        (await act.Should().ThrowAsync<BadRequestException>()).WithMessage("*cannot be divided*");
    }

    [Fact]
    public async Task SplitPreview_ProposesTwoManifestsAndSavesNothing()
    {
        var db = CreateContext(); var sut = BuildSut(db);
        var (primary, primaryVehicle) = await SeedDriverAsync(db, 100m);
        var (standby, standbyVehicle) = await SeedDriverAsync(db, 100m);
        var run = await SeedRunAsync(db, primary, primaryVehicle, await SeedParcelsAsync(db, 60m, 50m, 40m));

        var result = await sut.PreviewSplitAsync(run.Id, new SplitRequestDto(standby.Id, standbyVehicle.Id, null));

        result.Confirmed.Should().BeFalse();
        result.Original.LoadKg.Should().Be(100m);
        result.Standby.LoadKg.Should().Be(50m);
        (await db.DeliveryRoutes.CountAsync()).Should().Be(1);
        var saved = await db.DeliveryRoutes.AsNoTracking().SingleAsync();
        saved.Status.Should().Be(RouteStatus.PendingPayloadReview);
        saved.TotalWeightKg.Should().Be(150m);
    }

    [Fact]
    public async Task SplitConfirm_CreatesTwoSignedOffRunsWithinTheirVehicleLimits()
    {
        var db = CreateContext(); var sut = BuildSut(db);
        var (primary, primaryVehicle) = await SeedDriverAsync(db, 100m);
        var (standby, standbyVehicle) = await SeedDriverAsync(db, 100m);
        var run = await SeedRunAsync(db, primary, primaryVehicle, await SeedParcelsAsync(db, 60m, 50m, 40m));

        var result = await sut.ConfirmSplitAsync(run.Id, new SplitRequestDto(standby.Id, standbyVehicle.Id, "split"), Guid.NewGuid());

        result.Confirmed.Should().BeTrue();
        result.Original.SignedOff.Should().BeTrue();
        result.Standby.SignedOff.Should().BeTrue();
        (result.Original.LoadKg + result.Standby.LoadKg).Should().Be(150m);
        result.Original.LoadKg.Should().BeLessThanOrEqualTo(100m);
        result.Standby.LoadKg.Should().BeLessThanOrEqualTo(100m);

        var routes = await db.DeliveryRoutes.AsNoTracking().ToListAsync();
        routes.Should().HaveCount(2);
        routes.Should().OnlyContain(r => r.Status == RouteStatus.PayloadCompliant && r.SignedOffAt != null);
        var standbyRoute = routes.Single(r => r.ParentRouteId == run.Id);
        standbyRoute.DriverId.Should().Be(standby.Id);
        standbyRoute.VehicleId.Should().Be(standbyVehicle.Id);
    }

    [Fact]
    public async Task SplitConfirm_StandbyVehicleCanBeAPoolVehicleNotAssignedToTheDriver()
    {
        var db = CreateContext(); var sut = BuildSut(db);
        var (primary, primaryVehicle) = await SeedDriverAsync(db, 100m);
        var (standby, _) = await SeedDriverAsync(db, 100m);
        var poolVehicle = await SeedPoolVehicleAsync(db, 100m);
        var run = await SeedRunAsync(db, primary, primaryVehicle, await SeedParcelsAsync(db, 60m, 50m));

        await sut.ConfirmSplitAsync(run.Id, new SplitRequestDto(standby.Id, poolVehicle.Id, null), Guid.NewGuid());

        (await db.DeliveryRoutes.AsNoTracking().SingleAsync(r => r.ParentRouteId == run.Id)).VehicleId.Should().Be(poolVehicle.Id);
    }

    [Fact]
    public async Task Split_StandbyDriverNotAvailable_ThrowsBadRequest()
    {
        var db = CreateContext(); var sut = BuildSut(db);
        var (primary, primaryVehicle) = await SeedDriverAsync(db, 100m);
        var (standby, standbyVehicle) = await SeedDriverAsync(db, 100m, DriverStatus.Suspended);
        var run = await SeedRunAsync(db, primary, primaryVehicle, await SeedParcelsAsync(db, 60m, 50m));

        Func<Task> act = () => sut.ConfirmSplitAsync(run.Id, new SplitRequestDto(standby.Id, standbyVehicle.Id, null), Guid.NewGuid());

        await act.Should().ThrowAsync<BadRequestException>();
        (await db.DeliveryRoutes.CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task Split_StandbyDriverAlreadyOnAnotherRun_ThrowsBadRequest()
    {
        var db = CreateContext(); var sut = BuildSut(db);
        var (primary, primaryVehicle) = await SeedDriverAsync(db, 100m);
        var (standby, standbyVehicle) = await SeedDriverAsync(db, 100m);
        var run = await SeedRunAsync(db, primary, primaryVehicle, await SeedParcelsAsync(db, 60m, 50m));
        await SeedRunAsync(db, standby, standbyVehicle, await SeedParcelsAsync(db, 10m));
        var spare = await SeedPoolVehicleAsync(db, 100m);

        Func<Task> act = () => sut.ConfirmSplitAsync(run.Id, new SplitRequestDto(standby.Id, spare.Id, null), Guid.NewGuid());

        await act.Should().ThrowAsync<BadRequestException>().WithMessage("*already on another run*");
    }

    [Fact]
    public async Task Split_WithTheSameDriver_ThrowsBadRequest()
    {
        var db = CreateContext(); var sut = BuildSut(db);
        var (primary, primaryVehicle) = await SeedDriverAsync(db, 100m);
        var spare = await SeedPoolVehicleAsync(db, 100m);
        var run = await SeedRunAsync(db, primary, primaryVehicle, await SeedParcelsAsync(db, 60m, 50m));

        Func<Task> act = () => sut.PreviewSplitAsync(run.Id, new SplitRequestDto(primary.Id, spare.Id, null));

        await act.Should().ThrowAsync<BadRequestException>();
    }

    [Fact]
    public async Task Split_StandbyVehicleTooSmall_ThrowsBadRequest()
    {
        var db = CreateContext(); var sut = BuildSut(db);
        var (primary, primaryVehicle) = await SeedDriverAsync(db, 100m);
        var (standby, tinyVehicle) = await SeedDriverAsync(db, 20m);
        var run = await SeedRunAsync(db, primary, primaryVehicle, await SeedParcelsAsync(db, 60m, 50m));

        Func<Task> act = () => sut.ConfirmSplitAsync(run.Id, new SplitRequestDto(standby.Id, tinyVehicle.Id, null), Guid.NewGuid());

        await act.Should().ThrowAsync<BadRequestException>().WithMessage("*does not fit*");
        (await db.DeliveryRoutes.CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task Split_RunWithinTheVehicleLimit_ThrowsBadRequest()
    {
        var db = CreateContext(); var sut = BuildSut(db);
        var (primary, primaryVehicle) = await SeedDriverAsync(db, 100m);
        var (standby, standbyVehicle) = await SeedDriverAsync(db, 100m);
        var run = await SeedRunAsync(db, primary, primaryVehicle, await SeedParcelsAsync(db, 30m, 40m));

        Func<Task> act = () => sut.PreviewSplitAsync(run.Id, new SplitRequestDto(standby.Id, standbyVehicle.Id, null));

        await act.Should().ThrowAsync<BadRequestException>();
    }
}