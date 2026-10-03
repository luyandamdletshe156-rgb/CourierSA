using CourierSA.Application.DTOs.Payload;
using CourierSA.Application.DTOs.Quotes;
using CourierSA.Application.DTOs.Routing;
using CourierSA.Application.DTOs.Upgrades;
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
// Route workflow tests: Plan Route Dispatch, cancel, and warehouse release.
// UC14 / UC15 (payload validation, sign-off, split) are tested in PayloadServiceTests.cs.
// ══════════════════════════════════════════════════════════════════════════════
public class RouteWorkflowTests
{
    private static ApplicationDbContext CreateContext()
        => new(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    private static ParcelService BuildSut(ApplicationDbContext db)
        => new(new UnitOfWork(db),
               new Mock<IQuoteService>().Object, new Mock<IBarcodeService>().Object,
               new Mock<INotificationService>().Object, new Mock<IAuditService>().Object,
               new Mock<ITrackingHubService>().Object, new Mock<ISecureDeliveryService>().Object);

    private static async Task<DriverProfile> SeedDriverAsync(ApplicationDbContext db, decimal capacityKg)
    {
        var user = new User { Id = Guid.NewGuid(), Email = $"{Guid.NewGuid()}@t.com", FirstName = "D", LastName = "R",
            PhoneNumber = "+27000000000", PasswordHash = "x", Role = UserRole.Driver, Status = UserStatus.Active };
        var driver = new DriverProfile { Id = Guid.NewGuid(), UserId = user.Id, LicenseNumber = "L1",
            LicenseExpiry = DateTime.UtcNow.AddYears(1), Status = DriverStatus.Available };
        var vehicle = new Vehicle { Id = Guid.NewGuid(), RegistrationNumber = $"KZN{Random.Shared.Next(1000, 9999)}",
            Status = VehicleStatus.Active, PayloadCapacityKg = capacityKg, AssignedDriverId = driver.Id };
        db.Users.Add(user); db.DriverProfiles.Add(driver); db.Vehicles.Add(vehicle);
        await db.SaveChangesAsync();
        return driver;
    }

    private static async Task<List<Parcel>> SeedParcelsAsync(ApplicationDbContext db, params decimal[] weights)
    {
        var parcels = weights.Select((w, i) => new Parcel
        {
            Id = Guid.NewGuid(), TrackingNumber = $"CSA-RT-{i + 1:00000}", CustomerId = Guid.NewGuid(),
            Status = ParcelStatus.CheckedOut, ServiceType = ServiceType.Standard, WeightKg = w,
            PickupAddressId = Guid.NewGuid(), DeliveryAddressId = Guid.NewGuid()
        }).ToList();
        db.Parcels.AddRange(parcels);
        await db.SaveChangesAsync();
        return parcels;
    }

    private static PayloadService BuildPayload(ApplicationDbContext db)
        => new(new UnitOfWork(db), new Mock<IAuditService>().Object);

    private static Task SignOffAsync(ApplicationDbContext db, Guid routeId)
        => BuildPayload(db).SignOffAsync(routeId, new SignOffDto(null), Guid.NewGuid());

    [Fact]
    public async Task PlanRoute_WithinLimit_IsPlannedAndParcelsAreNotDispatched()
    {
        var db = CreateContext(); var sut = BuildSut(db);
        var driver = await SeedDriverAsync(db, 100m);
        var parcels = await SeedParcelsAsync(db, 30m, 40m);

        var result = await sut.PlanRouteAsync(new CreateRouteDto(parcels.Select(p => p.Id).ToList(), driver.Id), Guid.NewGuid());

        result.Status.Should().Be(nameof(RouteStatus.Planned));
        result.Stops.Should().BeEmpty();
        (await db.Parcels.AsNoTracking().ToListAsync()).Should().OnlyContain(p => p.Status == ParcelStatus.CheckedOut);
        (await db.Deliveries.CountAsync()).Should().Be(0);
    }

    [Fact]
    public async Task PlanRoute_OverLimit_IsHeldForReviewInsteadOfRejected()
    {
        var db = CreateContext(); var sut = BuildSut(db);
        var driver = await SeedDriverAsync(db, 100m);
        var parcels = await SeedParcelsAsync(db, 60m, 50m);

        var result = await sut.PlanRouteAsync(new CreateRouteDto(parcels.Select(p => p.Id).ToList(), driver.Id), Guid.NewGuid());

        result.Status.Should().Be(nameof(RouteStatus.PendingPayloadReview));
        var route = await db.DeliveryRoutes.SingleAsync();
        route.PayloadOverageKg.Should().Be(10m);
    }

    [Fact]
    public async Task PlanRoute_ParcelAlreadyOnAPlannedRoute_ThrowsBadRequest()
    {
        var db = CreateContext(); var sut = BuildSut(db);
        var driver = await SeedDriverAsync(db, 100m);
        var parcels = await SeedParcelsAsync(db, 30m);
        var dto = new CreateRouteDto(parcels.Select(p => p.Id).ToList(), driver.Id);
        await sut.PlanRouteAsync(dto, Guid.NewGuid());

        Func<Task> act = () => sut.PlanRouteAsync(dto, Guid.NewGuid());

        await act.Should().ThrowAsync<BadRequestException>();
    }

    [Fact]
    public async Task Release_WithMatchingScan_DispatchesTheRoute()
    {
        var db = CreateContext(); var sut = BuildSut(db);
        var driver = await SeedDriverAsync(db, 100m);
        var parcels = await SeedParcelsAsync(db, 30m, 40m);
        await sut.PlanRouteAsync(new CreateRouteDto(parcels.Select(p => p.Id).ToList(), driver.Id), Guid.NewGuid());
        var route = await db.DeliveryRoutes.SingleAsync();
        await SignOffAsync(db, route.Id);

        var result = await sut.ReleaseRouteAsync(route.Id,
            new ReleaseRouteDto(parcels.Select(p => p.TrackingNumber.ToLower()).ToList()), Guid.NewGuid());

        result.Status.Should().Be(nameof(RouteStatus.InProgress));
        result.Stops.Should().HaveCount(2);
        (await db.Parcels.AsNoTracking().ToListAsync()).Should().OnlyContain(p => p.Status == ParcelStatus.OutForDelivery);
        (await db.DriverProfiles.FindAsync(driver.Id))!.Status.Should().Be(DriverStatus.OnDelivery);
    }

    [Fact]
    public async Task Release_WithMissingParcel_IsBlockedAndNothingChanges()
    {
        var db = CreateContext(); var sut = BuildSut(db);
        var driver = await SeedDriverAsync(db, 100m);
        var parcels = await SeedParcelsAsync(db, 30m, 40m);
        await sut.PlanRouteAsync(new CreateRouteDto(parcels.Select(p => p.Id).ToList(), driver.Id), Guid.NewGuid());
        var route = await db.DeliveryRoutes.SingleAsync();
        await SignOffAsync(db, route.Id);

        Func<Task> act = () => sut.ReleaseRouteAsync(route.Id,
            new ReleaseRouteDto([parcels[0].TrackingNumber]), Guid.NewGuid());

        await act.Should().ThrowAsync<BadRequestException>().WithMessage("*Missing*");
        (await db.Parcels.AsNoTracking().ToListAsync()).Should().OnlyContain(p => p.Status == ParcelStatus.CheckedOut);
        (await db.DeliveryRoutes.SingleAsync()).Status.Should().Be(RouteStatus.PayloadCompliant);
    }

    [Fact]
    public async Task Release_WithUnexpectedParcel_IsBlocked()
    {
        var db = CreateContext(); var sut = BuildSut(db);
        var driver = await SeedDriverAsync(db, 100m);
        var parcels = await SeedParcelsAsync(db, 30m);
        await sut.PlanRouteAsync(new CreateRouteDto(parcels.Select(p => p.Id).ToList(), driver.Id), Guid.NewGuid());
        var route = await db.DeliveryRoutes.SingleAsync();
        await SignOffAsync(db, route.Id);

        Func<Task> act = () => sut.ReleaseRouteAsync(route.Id,
            new ReleaseRouteDto([parcels[0].TrackingNumber, "CSA-OTHER-1"]), Guid.NewGuid());

        await act.Should().ThrowAsync<BadRequestException>().WithMessage("*Not on this manifest*");
    }

    [Fact]
    public async Task Release_WithoutDispatcherSignOff_IsBlocked()
    {
        var db = CreateContext(); var sut = BuildSut(db);
        var driver = await SeedDriverAsync(db, 100m);
        var parcels = await SeedParcelsAsync(db, 30m, 40m);
        await sut.PlanRouteAsync(new CreateRouteDto(parcels.Select(p => p.Id).ToList(), driver.Id), Guid.NewGuid());
        var route = await db.DeliveryRoutes.SingleAsync();

        Func<Task> act = () => sut.ReleaseRouteAsync(route.Id,
            new ReleaseRouteDto(parcels.Select(p => p.TrackingNumber).ToList()), Guid.NewGuid());

        await act.Should().ThrowAsync<BadRequestException>().WithMessage("*signed off*");
        (await sut.GetRoutesReadyForReleaseAsync()).Should().BeEmpty();
    }

    [Fact]
    public async Task Release_OverweightRoute_IsBlocked()
    {
        var db = CreateContext(); var sut = BuildSut(db);
        var driver = await SeedDriverAsync(db, 100m);
        var parcels = await SeedParcelsAsync(db, 60m, 50m);
        await sut.PlanRouteAsync(new CreateRouteDto(parcels.Select(p => p.Id).ToList(), driver.Id), Guid.NewGuid());
        var route = await db.DeliveryRoutes.SingleAsync();

        Func<Task> act = () => sut.ReleaseRouteAsync(route.Id,
            new ReleaseRouteDto(parcels.Select(p => p.TrackingNumber).ToList()), Guid.NewGuid());

        await act.Should().ThrowAsync<BadRequestException>();
    }

    [Fact]
    public async Task CancelPlannedRoute_FreesTheParcelsForReplanning()
    {
        var db = CreateContext(); var sut = BuildSut(db);
        var driver = await SeedDriverAsync(db, 100m);
        var parcels = await SeedParcelsAsync(db, 30m);
        var dto = new CreateRouteDto(parcels.Select(p => p.Id).ToList(), driver.Id);
        await sut.PlanRouteAsync(dto, Guid.NewGuid());
        var route = await db.DeliveryRoutes.SingleAsync();

        await sut.CancelPlannedRouteAsync(route.Id, Guid.NewGuid());
        var replanned = await sut.PlanRouteAsync(dto, Guid.NewGuid());

        replanned.Status.Should().Be(nameof(RouteStatus.Planned));
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// Priority upgrade tests: Request Priority Upgrade / Review Priority Upgrade.
// ══════════════════════════════════════════════════════════════════════════════
public class PriorityUpgradeServiceTests
{
    private static ApplicationDbContext CreateContext()
        => new(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    // Standard = R100, Express = R160, Overnight = R220 …
    private static Mock<IQuoteService> QuoteMock()
    {
        var mock = new Mock<IQuoteService>();
        mock.Setup(q => q.CalculateAsync(It.IsAny<QuoteRequestDto>(), It.IsAny<Guid?>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync((QuoteRequestDto d, Guid? _, CancellationToken _) =>
            {
                var total = d.ServiceType switch
                {
                    ServiceType.Economy => 75m, ServiceType.Standard => 100m, ServiceType.Express => 160m,
                    ServiceType.Overnight => 220m, _ => 300m
                };
                return new QuoteResponseDto(null, d.ServiceType.ToString(), "", "", d.WeightKg, null, d.WeightKg,
                    total, null, null, 0m, total, 1, DateTime.UtcNow, DateTime.UtcNow.AddDays(1), new List<QuoteLineItemDto>());
            });
        return mock;
    }

    private static async Task<(PriorityUpgradeService sut, ApplicationDbContext db, Parcel parcel, CustomerProfile customer)>
        BuildAsync(decimal wallet = 500m, ParcelStatus status = ParcelStatus.Approved)
    {
        var db = CreateContext();
        var sut = new PriorityUpgradeService(new UnitOfWork(db), QuoteMock().Object,
            new Mock<INotificationService>().Object, new Mock<IAuditService>().Object);

        var user = new User { Id = Guid.NewGuid(), Email = "c@t.com", FirstName = "C", LastName = "U",
            PhoneNumber = "+27000000000", PasswordHash = "x", Role = UserRole.Customer, Status = UserStatus.Active };
        var customer = new CustomerProfile { Id = Guid.NewGuid(), UserId = user.Id,
            AccountType = AccountType.Individual, WalletBalanceZAR = wallet };
        var pickup = new ParcelAddress { Id = Guid.NewGuid(), RecipientName = "A", RecipientPhone = "+27000000000",
            StreetAddress = "1 St", City = "Durban", Province = SaProvince.KwaZuluNatal, PostalCode = "4001" };
        var delivery = new ParcelAddress { Id = Guid.NewGuid(), RecipientName = "B", RecipientPhone = "+27000000001",
            StreetAddress = "2 St", City = "Cape Town", Province = SaProvince.WesternCape, PostalCode = "8000" };
        var parcel = new Parcel { Id = Guid.NewGuid(), TrackingNumber = "CSA-UP-00001", CustomerId = customer.Id,
            Status = status, ServiceType = ServiceType.Standard, WeightKg = 2m, QuoteAmountZAR = 100m,
            PickupAddressId = pickup.Id, DeliveryAddressId = delivery.Id };
        db.Users.Add(user); db.CustomerProfiles.Add(customer); db.ParcelAddresses.AddRange(pickup, delivery); db.Parcels.Add(parcel);
        await db.SaveChangesAsync();
        return (sut, db, parcel, customer);
    }

    [Fact]
    public async Task Request_FasterService_CreatesPendingRequestWithFeeDifference()
    {
        var (sut, _, parcel, customer) = await BuildAsync();

        var result = await sut.RequestAsync(parcel.Id,
            new CreateUpgradeRequestDto(ServiceType.Express, "Needed for a client meeting"), customer.UserId);

        result.Status.Should().Be(nameof(UpgradeRequestStatus.Pending));
        result.FeeZAR.Should().Be(60m);
    }

    [Theory]
    [InlineData(ServiceType.Standard)]
    [InlineData(ServiceType.Economy)]
    public async Task Request_SameOrSlowerService_ThrowsBadRequest(ServiceType target)
    {
        var (sut, _, parcel, customer) = await BuildAsync();

        Func<Task> act = () => sut.RequestAsync(parcel.Id, new CreateUpgradeRequestDto(target, "reason"), customer.UserId);

        await act.Should().ThrowAsync<BadRequestException>();
    }

    [Fact]
    public async Task Request_WithoutReason_ThrowsBadRequest()
    {
        var (sut, _, parcel, customer) = await BuildAsync();

        Func<Task> act = () => sut.RequestAsync(parcel.Id, new CreateUpgradeRequestDto(ServiceType.Express, "  "), customer.UserId);

        await act.Should().ThrowAsync<BadRequestException>();
    }

    [Fact]
    public async Task Request_ForParcelAlreadyOutForDelivery_ThrowsBadRequest()
    {
        var (sut, _, parcel, customer) = await BuildAsync(status: ParcelStatus.OutForDelivery);

        Func<Task> act = () => sut.RequestAsync(parcel.Id, new CreateUpgradeRequestDto(ServiceType.Express, "urgent"), customer.UserId);

        await act.Should().ThrowAsync<BadRequestException>();
    }

    [Fact]
    public async Task Request_WhenOneIsAlreadyOpen_ThrowsConflict()
    {
        var (sut, _, parcel, customer) = await BuildAsync();
        await sut.RequestAsync(parcel.Id, new CreateUpgradeRequestDto(ServiceType.Express, "urgent"), customer.UserId);

        Func<Task> act = () => sut.RequestAsync(parcel.Id, new CreateUpgradeRequestDto(ServiceType.Overnight, "more urgent"), customer.UserId);

        await act.Should().ThrowAsync<ConflictException>();
    }

    [Fact]
    public async Task Request_ForAnotherCustomersParcel_ThrowsForbidden()
    {
        var (sut, db, parcel, _) = await BuildAsync();
        var otherUser = new User { Id = Guid.NewGuid(), Email = "o@t.com", FirstName = "O", LastName = "T",
            PhoneNumber = "+27000000002", PasswordHash = "x", Role = UserRole.Customer, Status = UserStatus.Active };
        db.Users.Add(otherUser);
        db.CustomerProfiles.Add(new CustomerProfile { Id = Guid.NewGuid(), UserId = otherUser.Id, AccountType = AccountType.Individual });
        await db.SaveChangesAsync();

        Func<Task> act = () => sut.RequestAsync(parcel.Id, new CreateUpgradeRequestDto(ServiceType.Express, "x"), otherUser.Id);

        await act.Should().ThrowAsync<ForbiddenException>();
    }

    [Fact]
    public async Task Review_Reject_WithoutNotes_ThrowsBadRequest()
    {
        var (sut, _, parcel, customer) = await BuildAsync();
        var req = await sut.RequestAsync(parcel.Id, new CreateUpgradeRequestDto(ServiceType.Express, "urgent"), customer.UserId);

        Func<Task> act = () => sut.ReviewAsync(req.Id, new ReviewUpgradeRequestDto(false, null), Guid.NewGuid());

        await act.Should().ThrowAsync<BadRequestException>();
    }

    [Fact]
    public async Task Review_Approve_SetsApprovedAndDoesNotChangeTheParcelYet()
    {
        var (sut, db, parcel, customer) = await BuildAsync();
        var req = await sut.RequestAsync(parcel.Id, new CreateUpgradeRequestDto(ServiceType.Express, "urgent"), customer.UserId);

        var result = await sut.ReviewAsync(req.Id, new ReviewUpgradeRequestDto(true, null), Guid.NewGuid());

        result.Status.Should().Be(nameof(UpgradeRequestStatus.Approved));
        (await db.Parcels.FindAsync(parcel.Id))!.ServiceType.Should().Be(ServiceType.Standard);
    }

    [Fact]
    public async Task Review_AlreadyReviewed_ThrowsBadRequest()
    {
        var (sut, _, parcel, customer) = await BuildAsync();
        var req = await sut.RequestAsync(parcel.Id, new CreateUpgradeRequestDto(ServiceType.Express, "urgent"), customer.UserId);
        await sut.ReviewAsync(req.Id, new ReviewUpgradeRequestDto(true, null), Guid.NewGuid());

        Func<Task> act = () => sut.ReviewAsync(req.Id, new ReviewUpgradeRequestDto(true, null), Guid.NewGuid());

        await act.Should().ThrowAsync<BadRequestException>();
    }

    [Fact]
    public async Task Pay_ApprovedRequest_DebitsWalletAndUpgradesParcel()
    {
        var (sut, db, parcel, customer) = await BuildAsync(wallet: 500m);
        var req = await sut.RequestAsync(parcel.Id, new CreateUpgradeRequestDto(ServiceType.Express, "urgent"), customer.UserId);
        await sut.ReviewAsync(req.Id, new ReviewUpgradeRequestDto(true, null), Guid.NewGuid());

        var result = await sut.PayAsync(req.Id, customer.UserId);

        result.Status.Should().Be(nameof(UpgradeRequestStatus.Paid));
        var updated = await db.Parcels.FindAsync(parcel.Id);
        updated!.ServiceType.Should().Be(ServiceType.Express);
        updated.QuoteAmountZAR.Should().Be(160m);
        (await db.CustomerProfiles.FindAsync(customer.Id))!.WalletBalanceZAR.Should().Be(440m);
        (await db.WalletTransactions.CountAsync()).Should().Be(1);
    }

    [Fact]
    public async Task Pay_InsufficientWallet_ThrowsAndLeavesParcelUnchanged()
    {
        var (sut, db, parcel, customer) = await BuildAsync(wallet: 10m);
        var req = await sut.RequestAsync(parcel.Id, new CreateUpgradeRequestDto(ServiceType.Express, "urgent"), customer.UserId);
        await sut.ReviewAsync(req.Id, new ReviewUpgradeRequestDto(true, null), Guid.NewGuid());

        Func<Task> act = () => sut.PayAsync(req.Id, customer.UserId);

        await act.Should().ThrowAsync<BadRequestException>().WithMessage("*Insufficient*");
        (await db.Parcels.FindAsync(parcel.Id))!.ServiceType.Should().Be(ServiceType.Standard);
    }

    [Fact]
    public async Task Pay_BeforeApproval_ThrowsBadRequest()
    {
        var (sut, _, parcel, customer) = await BuildAsync();
        var req = await sut.RequestAsync(parcel.Id, new CreateUpgradeRequestDto(ServiceType.Express, "urgent"), customer.UserId);

        Func<Task> act = () => sut.PayAsync(req.Id, customer.UserId);

        await act.Should().ThrowAsync<BadRequestException>();
    }
}
