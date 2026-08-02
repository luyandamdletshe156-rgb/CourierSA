using CourierSA.Application.DTOs.Quotes;
using CourierSA.Application.Interfaces.Repositories;
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
// QuoteService Tests
// Tests the SA-specific pricing engine with representative inputs.
// These are pure unit tests — no DB, no mocks needed for calculation logic.
// ══════════════════════════════════════════════════════════════════════════════
public class QuoteServiceTests
{
    private readonly QuoteService _sut;

    public QuoteServiceTests()
    {
        var uowMock = new Mock<IUnitOfWork>();
        // Return null for customer queries so quotes are calculated without persisting
        uowMock.Setup(u => u.Query<CustomerProfile>()
            .FirstOrDefaultAsync(It.IsAny<System.Linq.Expressions.Expression<Func<CustomerProfile, bool>>>(),
                It.IsAny<CancellationToken>()))
            .ReturnsAsync((CustomerProfile?)null);

        _sut = new QuoteService(uowMock.Object);
    }

    [Fact]
    public async Task Calculate_StandardService_SameProvince_ReturnsNoSurcharge()
    {
        var dto = new QuoteRequestDto(
            OriginProvince:      SaProvince.Gauteng,
            DestinationProvince: SaProvince.Gauteng,
            WeightKg:            1m,
            ServiceType:         ServiceType.Standard,
            DeclaredValueZAR:    null,
            InsuranceRequired:   false,
            Dimensions:          null
        );

        var result = await _sut.CalculateAsync(dto, null);

        result.Should().NotBeNull();
        (result.SurchargeZAR is null or 0).Should().BeTrue();
        result.TotalAmountZAR.Should().BeGreaterThan(0);
        result.VatAmountZAR.Should().BeGreaterThan(0);
        result.EstimatedDeliveryDays.Should().Be(4);
    }

    [Fact]
    public async Task Calculate_ExpressService_InterProvincial_HasSurcharge()
    {
        var dto = new QuoteRequestDto(
            OriginProvince:      SaProvince.Gauteng,
            DestinationProvince: SaProvince.WesternCape,
            WeightKg:            2.5m,
            ServiceType:         ServiceType.Express,
            DeclaredValueZAR:    1500m,
            InsuranceRequired:   false,
            Dimensions:          null
        );

        var result = await _sut.CalculateAsync(dto, null);

        result.SurchargeZAR.Should().BeGreaterThan(0);
        result.EstimatedDeliveryDays.Should().Be(2);
    }

    [Fact]
    public async Task Calculate_WithInsurance_AddsPremium()
    {
        var dto = new QuoteRequestDto(
            OriginProvince:      SaProvince.Gauteng,
            DestinationProvince: SaProvince.KwaZuluNatal,
            WeightKg:            1m,
            ServiceType:         ServiceType.Standard,
            DeclaredValueZAR:    5000m,
            InsuranceRequired:   true,
            Dimensions:          null
        );

        var result = await _sut.CalculateAsync(dto, null);

        result.InsurancePremiumZAR.Should().BeGreaterThanOrEqualTo(15m); // minimum R15
        result.InsurancePremiumZAR.Should().BeApproximately(25m, 1m);    // 0.5% of R5000
    }

    [Fact]
    public async Task Calculate_SmallPackage_EnforcesMinimumCharge()
    {
        var dto = new QuoteRequestDto(
            OriginProvince:      SaProvince.Gauteng,
            DestinationProvince: SaProvince.Gauteng,
            WeightKg:            0.1m,  // tiny weight — would be below minimum
            ServiceType:         ServiceType.Standard,
            DeclaredValueZAR:    null,
            InsuranceRequired:   false,
            Dimensions:          null
        );

        var result = await _sut.CalculateAsync(dto, null);

        // Minimum standard charge is R65 + VAT
        result.TotalAmountZAR.Should().BeGreaterThanOrEqualTo(65m * 1.15m);
    }

    [Fact]
    public async Task Calculate_DimensionalWeight_BillsHigherWhenVolumetricExceedsActual()
    {
        // A large but light box: 50×50×50cm = 125,000cm³ / 5000 = 25kg volumetric
        // Actual weight is only 2kg → should bill at 25kg
        var dto = new QuoteRequestDto(
            OriginProvince:      SaProvince.Gauteng,
            DestinationProvince: SaProvince.Gauteng,
            WeightKg:            2m,
            ServiceType:         ServiceType.Standard,
            DeclaredValueZAR:    null,
            InsuranceRequired:   false,
            Dimensions:          new DimensionsDto(50, 50, 50)
        );

        var lightDto = dto with { Dimensions = null };

        var withDims    = await _sut.CalculateAsync(dto, null);
        var withoutDims = await _sut.CalculateAsync(lightDto, null);

        withDims.VolumetricWeightKg.Should().Be(25m);
        withDims.BillableWeightKg.Should().Be(25m);
        withDims.TotalAmountZAR.Should().BeGreaterThan(withoutDims.TotalAmountZAR);
    }

    [Theory]
    [InlineData(ServiceType.Economy,   0)]  // same province
    [InlineData(ServiceType.Standard,  0)]
    [InlineData(ServiceType.Express,   0)]
    [InlineData(ServiceType.Overnight, 0)]
    [InlineData(ServiceType.SameDay,   0)]
    public async Task Calculate_AllServiceTypes_ReturnPositiveTotals(
        ServiceType service, decimal expectedSurcharge)
    {
        var dto = new QuoteRequestDto(
            OriginProvince:      SaProvince.Gauteng,
            DestinationProvince: SaProvince.Gauteng,
            WeightKg:            1m,
            ServiceType:         service,
            DeclaredValueZAR:    null,
            InsuranceRequired:   false,
            Dimensions:          null
        );

        var result = await _sut.CalculateAsync(dto, null);

        result.TotalAmountZAR.Should().BeGreaterThan(0);
        result.VatAmountZAR.Should().BeGreaterThan(0);
        result.BaseAmountZAR.Should().BeGreaterThan(0);
    }

    [Fact]
    public async Task Calculate_VatIs15Percent_OfSubtotal()
    {
        var dto = new QuoteRequestDto(
            OriginProvince:      SaProvince.Gauteng,
            DestinationProvince: SaProvince.Gauteng,
            WeightKg:            5m,
            ServiceType:         ServiceType.Standard,
            DeclaredValueZAR:    null,
            InsuranceRequired:   false,
            Dimensions:          null
        );

        var result = await _sut.CalculateAsync(dto, null);

        var subtotal = result.BaseAmountZAR + (result.SurchargeZAR ?? 0) + (result.InsurancePremiumZAR ?? 0);
        var expectedVat = Math.Round(subtotal * 0.15m, 2);

        result.VatAmountZAR.Should().BeApproximately(expectedVat, 0.01m);
    }

    [Fact]
    public async Task Calculate_SameDay_ReturnsZeroDeliveryDays()
    {
        var dto = new QuoteRequestDto(
            OriginProvince:      SaProvince.Gauteng,
            DestinationProvince: SaProvince.Gauteng,
            WeightKg:            1m,
            ServiceType:         ServiceType.SameDay,
            DeclaredValueZAR:    null,
            InsuranceRequired:   false,
            Dimensions:          null
        );

        var result = await _sut.CalculateAsync(dto, null);

        result.EstimatedDeliveryDays.Should().Be(0);
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// ParcelService State Machine Tests
// Verifies that illegal status transitions are rejected and legal ones succeed.
// Uses EF Core InMemory provider to avoid a real DB.
// ══════════════════════════════════════════════════════════════════════════════
public class ParcelServiceStateMachineTests
{
    private ApplicationDbContext CreateContext()
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(Guid.NewGuid().ToString())
            .Options;
        return new ApplicationDbContext(options);
    }

    private (ParcelService svc, ApplicationDbContext db) BuildSut()
    {
        var db = CreateContext();
        var uow = new UnitOfWork(db);

        var quoteMock = new Mock<IQuoteService>();
        var barcodeMock = new Mock<IBarcodeService>();
        barcodeMock.Setup(b => b.GenerateAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
                   .ReturnsAsync("/uploads/barcodes/test.png");

        var notifyMock = new Mock<INotificationService>();
        var auditMock = new Mock<IAuditService>();
        var bulkMock = new Mock<IBulkCsvService>();
        var hubMock = new Mock<ITrackingHubService>();

        var svc = new ParcelService(uow, quoteMock.Object, barcodeMock.Object,
                                    notifyMock.Object, auditMock.Object, hubMock.Object);
        return (svc, db);
    }

    private async Task<(Parcel parcel, CustomerProfile customer)> SeedParcelAsync(
        ApplicationDbContext db, ParcelStatus status)
    {
        var user = new User { Id = Guid.NewGuid(), Email = "test@test.com",
            FirstName = "T", LastName = "T", PhoneNumber = "+27000000000",
            PasswordHash = "x", Role = UserRole.Customer, Status = UserStatus.Active };
        var customer = new CustomerProfile { Id = Guid.NewGuid(), UserId = user.Id,
            AccountType = AccountType.Individual };
        var pickup = new ParcelAddress { Id = Guid.NewGuid(), RecipientName = "A",
            RecipientPhone = "+27000000000", StreetAddress = "1 Test St",
            City = "JHB", Province = SaProvince.Gauteng, PostalCode = "2000" };
        var delivery = new ParcelAddress { Id = Guid.NewGuid(), RecipientName = "B",
            RecipientPhone = "+27000000001", StreetAddress = "2 Test St",
            City = "CPT", Province = SaProvince.WesternCape, PostalCode = "8000" };
        var parcel = new Parcel
        {
            Id = Guid.NewGuid(), TrackingNumber = "CSA-TEST-00001",
            CustomerId = customer.Id, Status = status,
            ServiceType = ServiceType.Standard, WeightKg = 1m,
            PickupAddressId = pickup.Id, DeliveryAddressId = delivery.Id,
        };
        db.Users.Add(user); db.CustomerProfiles.Add(customer);
        db.ParcelAddresses.AddRange(pickup, delivery); db.Parcels.Add(parcel);
        await db.SaveChangesAsync();
        return (parcel, customer);
    }

    [Fact]
    public async Task Approve_PendingParcel_ChangesStatusToApproved()
    {
        var (svc, db) = BuildSut();
        var (parcel, _) = await SeedParcelAsync(db, ParcelStatus.PendingApproval);
        var staffId = Guid.NewGuid();

        await svc.ApproveAsync(parcel.Id, staffId);

        var updated = await db.Parcels.FindAsync(parcel.Id);
        updated!.Status.Should().Be(ParcelStatus.Approved);
    }

    [Fact]
    public async Task Approve_AlreadyApprovedParcel_ThrowsBadRequest()
    {
        var (svc, db) = BuildSut();
        var (parcel, _) = await SeedParcelAsync(db, ParcelStatus.Approved);

        Func<Task> act = () => svc.ApproveAsync(parcel.Id, Guid.NewGuid());

        await act.Should().ThrowAsync<BadRequestException>()
            .WithMessage("*Expected status 'PendingApproval'*");
    }

    [Fact]
    public async Task CheckIn_ApprovedParcel_ChangesStatusToInWarehouse()
    {
        var (svc, db) = BuildSut();
        var (parcel, _) = await SeedParcelAsync(db, ParcelStatus.Approved);

        await svc.CheckInAsync(parcel.Id, "Bay A3", Guid.NewGuid());

        var updated = await db.Parcels.FindAsync(parcel.Id);
        updated!.Status.Should().Be(ParcelStatus.InWarehouse);
    }

    [Fact]
    public async Task Reject_PendingParcel_ChangesStatusToCancelled()
    {
        var (svc, db) = BuildSut();
        var (parcel, _) = await SeedParcelAsync(db, ParcelStatus.PendingApproval);

        await svc.RejectAsync(parcel.Id, "Prohibited item", Guid.NewGuid());

        var updated = await db.Parcels.FindAsync(parcel.Id);
        updated!.Status.Should().Be(ParcelStatus.Cancelled);
    }

    [Fact]
    public async Task Reject_DeliveredParcel_ThrowsBadRequest()
    {
        var (svc, db) = BuildSut();
        var (parcel, _) = await SeedParcelAsync(db, ParcelStatus.Delivered);

        Func<Task> act = () => svc.RejectAsync(parcel.Id, "Late rejection", Guid.NewGuid());

        await act.Should().ThrowAsync<BadRequestException>();
    }

    [Fact]
    public async Task Track_ExistingParcel_ReturnsTrackingResult()
    {
        var (svc, db) = BuildSut();
        await SeedParcelAsync(db, ParcelStatus.OutForDelivery);

        var result = await svc.TrackAsync("CSA-TEST-00001");

        result.Should().NotBeNull();
        result!.TrackingNumber.Should().Be("CSA-TEST-00001");
        result.Status.Should().Be("OutForDelivery");
    }

    [Fact]
    public async Task Track_NonExistentParcel_ReturnsNull()
    {
        var (svc, _) = BuildSut();

        var result = await svc.TrackAsync("CSA-DOESNT-EXIST");

        result.Should().BeNull();
    }
}
