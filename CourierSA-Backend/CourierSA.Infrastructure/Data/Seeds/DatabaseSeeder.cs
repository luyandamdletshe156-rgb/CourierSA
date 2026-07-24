using CourierSA.Domain.Entities;
using CourierSA.Domain.Enums;
using CourierSA.Infrastructure.Services.Auth;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace CourierSA.Infrastructure.Data.Seeds;

/// <summary>
/// Seeds the database with demo users for all roles plus sample parcels.
/// Run via: dotnet run --seed  (or automatically in Development)
/// </summary>
public static class DatabaseSeeder
{
    public static async Task SeedAsync(
        ApplicationDbContext context,
        ILogger logger,
        CancellationToken ct = default)
    {
        await context.Database.MigrateAsync(ct);

        if (await context.Users.AnyAsync(ct))
        {
            logger.LogInformation("Database already seeded — skipping.");
            return;
        }

        logger.LogInformation("Seeding CourierSA database...");

        var passwordService = new PasswordService();
        var now             = DateTime.UtcNow;

        // ── Users ─────────────────────────────────────────────────────────────
        var adminId      = Guid.NewGuid();
        var customerId   = Guid.NewGuid();
        var driverId     = Guid.NewGuid();
        var dispatcherId = Guid.NewGuid();
        var warehouseId  = Guid.NewGuid();
        var bizClientId  = Guid.NewGuid();

        var users = new List<User>
        {
            CreateUser(adminId,      "Admin",      "User",     "admin@couriersa.co.za",
                       "+27110001111", UserRole.Administrator,  passwordService, now),
            CreateUser(customerId,   "Thabo",      "Mokoena",  "thabo@gmail.com",
                       "+27821234567", UserRole.Customer,       passwordService, now),
            CreateUser(driverId,     "Sipho",      "Dlamini",  "sipho.driver@couriersa.co.za",
                       "+27831234567", UserRole.Driver,         passwordService, now),
            CreateUser(dispatcherId, "Nomvula",    "Khumalo",  "nomvula.dispatch@couriersa.co.za",
                       "+27841234567", UserRole.Dispatcher,     passwordService, now),
            CreateUser(warehouseId,  "Trevor",     "Williams", "trevor.wh@couriersa.co.za",
                       "+27851234567", UserRole.WarehouseStaff, passwordService, now),
            CreateUser(bizClientId,  "Lindiwe",    "Zulu",     "lindiwe@techcorp.co.za",
                       "+27791234567", UserRole.BusinessClient, passwordService, now),
        };

        await context.Users.AddRangeAsync(users, ct);

        // ── Customer Profiles ─────────────────────────────────────────────────
        var customerProfileId = Guid.NewGuid();
        var bizProfileId      = Guid.NewGuid();

        var customerProfiles = new List<CustomerProfile>
        {
            new()
            {
                Id               = customerProfileId,
                UserId           = customerId,
                AccountType      = AccountType.Individual,
                WalletBalanceZAR = 500.00m,
                CreatedAt        = now, UpdatedAt = now
            },
            new()
            {
                Id               = bizProfileId,
                UserId           = bizClientId,
                AccountType      = AccountType.Business,
                CompanyName      = "TechCorp SA",
                VatNumber        = "4830265748",
                WalletBalanceZAR = 5000.00m,
                DefaultPickupAddress = "123 Sandton Drive, Sandton, Johannesburg, 2196",
                CreatedAt        = now, UpdatedAt = now
            }
        };
        await context.CustomerProfiles.AddRangeAsync(customerProfiles, ct);

        // ── Driver Profile ────────────────────────────────────────────────────
        var driverProfile = new DriverProfile
        {
            Id                 = Guid.NewGuid(),
            UserId             = driverId,
            LicenseNumber      = "GP123456789",
            LicenseExpiry      = new DateTime(2027, 6, 30),
            Status             = DriverStatus.Available,
            CurrentLatitude    = -26.2041m,
            CurrentLongitude   = 28.0473m, // Johannesburg
            TotalDeliveries    = 0,
            SuccessfulDeliveries = 0,
            CreatedAt          = now, UpdatedAt = now
        };
        await context.DriverProfiles.AddAsync(driverProfile, ct);

        // ── Vehicle ───────────────────────────────────────────────────────────
        var vehicle = new Vehicle
        {
            Id                    = Guid.NewGuid(),
            RegistrationNumber    = "GP 123 456",
            Make                  = "Toyota",
            Model                 = "Hilux",
            Year                  = 2022,
            VehicleType           = VehicleType.LightDeliveryVehicle,
            Status                = VehicleStatus.Active,
            PayloadCapacityKg     = 1000m,
            AssignedDriverId      = driverProfile.Id,
            CreatedAt             = now, UpdatedAt = now
        };
        await context.Vehicles.AddAsync(vehicle, ct);

        // ── Sample Addresses ──────────────────────────────────────────────────
        var pickupAddr = new ParcelAddress
        {
            Id               = Guid.NewGuid(),
            RecipientName    = "Thabo Mokoena",
            RecipientPhone   = "+27821234567",
            RecipientEmail   = "thabo@gmail.com",
            StreetAddress    = "456 Commissioner St",
            Suburb           = "Marshalltown",
            City             = "Johannesburg",
            Province         = SaProvince.Gauteng,
            PostalCode       = "2107",
            Country          = "South Africa",
            Latitude         = -26.2041m,
            Longitude        = 28.0473m,
            CreatedAt        = now, UpdatedAt = now
        };
        var deliveryAddr = new ParcelAddress
        {
            Id               = Guid.NewGuid(),
            RecipientName    = "Zanele Nkosi",
            RecipientPhone   = "+27797654321",
            RecipientEmail   = "zanele@outlook.com",
            StreetAddress    = "78 Victoria Embankment",
            Suburb           = "Durban Central",
            City             = "Durban",
            Province         = SaProvince.KwaZuluNatal,
            PostalCode       = "4001",
            Country          = "South Africa",
            Latitude         = -29.8587m,
            Longitude        = 31.0218m,
            CreatedAt        = now, UpdatedAt = now
        };
        await context.ParcelAddresses.AddRangeAsync([pickupAddr, deliveryAddr], ct);

        // ── Sample Parcel (Pending Approval) ──────────────────────────────────
        var parcel = new Parcel
        {
            Id                = Guid.NewGuid(),
            TrackingNumber    = $"CSA-{now:yyyyMMdd}-00001",
            CustomerId        = customerProfileId,
            Status            = ParcelStatus.PendingApproval,
            ServiceType       = ServiceType.Express,
            WeightKg          = 2.5m,
            Dimensions        = new ParcelDimensions
                { LengthCm = 30, WidthCm = 20, HeightCm = 15 },
            DeclaredValueZAR     = 1500m,
            Description          = "Electronic components",
            IsFragile            = true,
            RequiresSignature    = true,
            InsuranceRequired    = true,
            PickupAddressId      = pickupAddr.Id,
            DeliveryAddressId    = deliveryAddr.Id,
            QuoteAmountZAR       = 285.00m,
            EstimatedDeliveryDate = now.AddDays(2),
            BarcodeImagePath     = null,
            CreatedAt            = now, UpdatedAt = now
        };

        parcel.TrackingEvents.Add(new TrackingEvent
        {
            Id          = Guid.NewGuid(),
            ParcelId    = parcel.Id,
            EventType   = TrackingEventType.Booked,
            Description = "Parcel booking confirmed",
            Location    = "Johannesburg",
            OccurredAt  = now,
            CreatedAt   = now, UpdatedAt = now
        });

        await context.Parcels.AddAsync(parcel, ct);
        await context.SaveChangesAsync(ct);

        logger.LogInformation(
            "✅ Seeding complete. Demo credentials (all passwords: Demo@1234):\n" +
            "  Admin:      admin@couriersa.co.za\n" +
            "  Customer:   thabo@gmail.com\n" +
            "  Driver:     sipho.driver@couriersa.co.za\n" +
            "  Dispatcher: nomvula.dispatch@couriersa.co.za\n" +
            "  Warehouse:  trevor.wh@couriersa.co.za\n" +
            "  Business:   lindiwe@techcorp.co.za");
    }

    private static User CreateUser(
        Guid id, string first, string last, string email,
        string phone, UserRole role, PasswordService pwd, DateTime now) => new()
    {
        Id           = id,
        FirstName    = first,
        LastName     = last,
        Email        = email,
        PhoneNumber  = phone,
        PasswordHash = pwd.Hash("Demo@1234"),
        Role         = role,
        Status       = UserStatus.Active,
        CreatedAt    = now,
        UpdatedAt    = now
    };
}
