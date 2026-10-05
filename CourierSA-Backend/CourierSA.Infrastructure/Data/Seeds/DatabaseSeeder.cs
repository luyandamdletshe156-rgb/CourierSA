using System.Text.Json;
using CourierSA.Domain.Entities;
using CourierSA.Domain.Enums;
using CourierSA.Infrastructure.Services.Auth;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace CourierSA.Infrastructure.Data.Seeds;

/// <summary>
/// Seeds the database with demo data for every role and every feature built so far.
/// Runs automatically in Development (see Program.cs) and is safe to run repeatedly:
///   1. Core data (users, one driver, zone rules, sorting bins, a sample parcel) is created only on an empty database.
///   2. Extra demo drivers + vehicles are added by e-mail / registration number if they are missing.
///   3. Demo parcels (pending approval, pickups, an overweight held route, warehouse deliveries,
///      a priority-upgrade request) are added once, recognised by the "CSA-DEMO-" tracking prefix.
///   4. A 7-day driver roster with open shifts, a pending leave request and a pending shift swap is added once.
/// Demo password for every account: Demo@1234
/// </summary>
public static class DatabaseSeeder
{
    private const string DemoPassword = "Demo@1234";
    private const string DemoPrefix = "CSA-DEMO-";

    private const string SiphoEmail = "sipho.driver@couriersa.co.za";
    private const string ThembaEmail = "themba.driver@couriersa.co.za";
    private const string AyandaEmail = "ayanda.driver@couriersa.co.za";
    private const string NokuthulaEmail = "nokuthula.driver@couriersa.co.za";

    public static async Task SeedAsync(
        ApplicationDbContext context,
        ILogger logger,
        CancellationToken ct = default)
    {
        await context.Database.MigrateAsync(ct);

        var now = DateTime.UtcNow;
        var passwordService = new PasswordService();

        if (!await context.Users.AnyAsync(ct))
            await SeedCoreAsync(context, logger, passwordService, now, ct);
        else
            logger.LogInformation("Core demo data already present — checking for extras.");

        await SeedDemoDriversAsync(context, logger, passwordService, now, ct);
        await SeedDemoParcelsAsync(context, logger, now, ct);
        await SeedDemoConsolidationParcelsAsync(context, logger, now, ct);
        await SeedDemoRosterAsync(context, logger, now, ct);

        logger.LogInformation(
            "✅ Seeding complete. Demo credentials (all passwords: {Password}):\n" +
            "  Admin:      admin@couriersa.co.za\n" +
            "  Customer:   thabo@gmail.com\n" +
            "  Business:   lindiwe@techcorp.co.za\n" +
            "  Dispatcher: nomvula.dispatch@couriersa.co.za\n" +
            "  Warehouse:  trevor.wh@couriersa.co.za\n" +
            "  Drivers:    {Sipho}, {Themba}, {Ayanda}, {Nokuthula}",
            DemoPassword, SiphoEmail, ThembaEmail, AyandaEmail, NokuthulaEmail);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 1. Core data — only on an empty database
    // ═════════════════════════════════════════════════════════════════════════
    private static async Task SeedCoreAsync(
        ApplicationDbContext context, ILogger logger, PasswordService passwordService, DateTime now, CancellationToken ct)
    {
        logger.LogInformation("Seeding CourierSA core data...");

        var adminId = Guid.NewGuid();
        var customerId = Guid.NewGuid();
        var driverId = Guid.NewGuid();
        var dispatcherId = Guid.NewGuid();
        var warehouseId = Guid.NewGuid();
        var bizClientId = Guid.NewGuid();

        var users = new List<User>
        {
            CreateUser(adminId,      "Admin",   "User",     "admin@couriersa.co.za",
                       "+27110001111", UserRole.Administrator,  passwordService, now),
            CreateUser(customerId,   "Thabo",   "Mokoena",  "thabo@gmail.com",
                       "+27821234567", UserRole.Customer,       passwordService, now),
            CreateUser(driverId,     "Sipho",   "Dlamini",  SiphoEmail,
                       "+27831234567", UserRole.Driver,         passwordService, now),
            CreateUser(dispatcherId, "Nomvula", "Khumalo",  "nomvula.dispatch@couriersa.co.za",
                       "+27841234567", UserRole.Dispatcher,     passwordService, now),
            CreateUser(warehouseId,  "Trevor",  "Williams", "trevor.wh@couriersa.co.za",
                       "+27851234567", UserRole.WarehouseStaff, passwordService, now),
            CreateUser(bizClientId,  "Lindiwe", "Zulu",     "lindiwe@techcorp.co.za",
                       "+27791234567", UserRole.BusinessClient, passwordService, now),
        };
        await context.Users.AddRangeAsync(users, ct);

        var customerProfileId = Guid.NewGuid();
        var bizProfileId = Guid.NewGuid();
        await context.CustomerProfiles.AddRangeAsync(new List<CustomerProfile>
        {
            new()
            {
                Id = customerProfileId, UserId = customerId, AccountType = AccountType.Individual,
                WalletBalanceZAR = 500.00m, CreatedAt = now, UpdatedAt = now
            },
            new()
            {
                Id = bizProfileId, UserId = bizClientId, AccountType = AccountType.Business,
                CompanyName = "TechCorp SA", VatNumber = "4830265748", WalletBalanceZAR = 5000.00m,
                DefaultPickupAddress = "123 Sandton Drive, Sandton, Johannesburg, 2196",
                CreatedAt = now, UpdatedAt = now
            }
        }, ct);

        var driverProfile = new DriverProfile
        {
            Id = Guid.NewGuid(),
            UserId = driverId,
            LicenseNumber = "GP123456789",
            LicenseExpiry = new DateTime(2027, 6, 30),
            Status = DriverStatus.Available,
            CurrentLatitude = -29.8587m,
            CurrentLongitude = 31.0218m,   // Durban
            CreatedAt = now,
            UpdatedAt = now
        };
        await context.DriverProfiles.AddAsync(driverProfile, ct);

        await context.Vehicles.AddAsync(new Vehicle
        {
            Id = Guid.NewGuid(),
            RegistrationNumber = "GP 123 456",
            Make = "Toyota",
            Model = "Hilux",
            Year = 2022,
            VehicleType = VehicleType.LightDeliveryVehicle,
            Status = VehicleStatus.Active,
            PayloadCapacityKg = 1000m,
            AssignedDriverId = driverProfile.Id,
            CreatedAt = now,
            UpdatedAt = now
        }, ct);

        var pickupAddr = Addr("Thabo Mokoena", "+27821234567", "thabo@gmail.com", "456 Commissioner St",
            "Marshalltown", "Johannesburg", SaProvince.Gauteng, "2107", -26.2041m, 28.0473m, now);
        var deliveryAddr = Addr("Zanele Nkosi", "+27797654321", "zanele@outlook.com", "78 Victoria Embankment",
            "Durban Central", "Durban", SaProvince.KwaZuluNatal, "4001", -29.8587m, 31.0218m, now);
        await context.ParcelAddresses.AddRangeAsync([pickupAddr, deliveryAddr], ct);

        await context.PostalCodeZoneRules.AddRangeAsync(new List<PostalCodeZoneRule>
        {
            new() { Id = Guid.NewGuid(), PostalCodeFrom = 4000, PostalCodeTo = 4099, Zone = SortingZone.Local,    Description = "Durban CBD & surrounds",       CreatedAt = now, UpdatedAt = now },
            new() { Id = Guid.NewGuid(), PostalCodeFrom = 4100, PostalCodeTo = 4399, Zone = SortingZone.Metro,    Description = "Greater eThekwini metro",       CreatedAt = now, UpdatedAt = now },
            new() { Id = Guid.NewGuid(), PostalCodeFrom = 3600, PostalCodeTo = 3999, Zone = SortingZone.Regional, Description = "Northern KZN region",          CreatedAt = now, UpdatedAt = now },
            new() { Id = Guid.NewGuid(), PostalCodeFrom = 4400, PostalCodeTo = 4730, Zone = SortingZone.Regional, Description = "South Coast / Midlands KZN",   CreatedAt = now, UpdatedAt = now },
            new() { Id = Guid.NewGuid(), PostalCodeFrom = 1,    PostalCodeTo = 3599, Zone = SortingZone.National, Description = "Rest of South Africa (north)", CreatedAt = now, UpdatedAt = now },
            new() { Id = Guid.NewGuid(), PostalCodeFrom = 4731, PostalCodeTo = 9999, Zone = SortingZone.National, Description = "Rest of South Africa (south)", CreatedAt = now, UpdatedAt = now },
        }, ct);

        await context.SortingBins.AddRangeAsync(new List<SortingBin>
        {
            new() { Id = Guid.NewGuid(), BinCode = "Bay L1, Shelf 1", Zone = SortingZone.Local,    Capacity = 50, IsActive = true, CreatedAt = now, UpdatedAt = now },
            new() { Id = Guid.NewGuid(), BinCode = "Bay L2, Shelf 1", Zone = SortingZone.Local,    Capacity = 50, IsActive = true, CreatedAt = now, UpdatedAt = now },
            new() { Id = Guid.NewGuid(), BinCode = "Bay M1, Shelf 1", Zone = SortingZone.Metro,    Capacity = 40, IsActive = true, CreatedAt = now, UpdatedAt = now },
            new() { Id = Guid.NewGuid(), BinCode = "Bay M2, Shelf 1", Zone = SortingZone.Metro,    Capacity = 40, IsActive = true, CreatedAt = now, UpdatedAt = now },
            new() { Id = Guid.NewGuid(), BinCode = "Bay R1, Shelf 1", Zone = SortingZone.Regional, Capacity = 30, IsActive = true, CreatedAt = now, UpdatedAt = now },
            new() { Id = Guid.NewGuid(), BinCode = "Bay N1, Shelf 1", Zone = SortingZone.National, Capacity = 60, IsActive = true, CreatedAt = now, UpdatedAt = now },
            new() { Id = Guid.NewGuid(), BinCode = "Bay N2, Shelf 1", Zone = SortingZone.National, Capacity = 60, IsActive = true, CreatedAt = now, UpdatedAt = now },
        }, ct);

        var sample = new Parcel
        {
            Id = Guid.NewGuid(),
            TrackingNumber = $"CSA-{now:yyyyMMdd}-00001",
            CustomerId = customerProfileId,
            Status = ParcelStatus.PendingApproval,
            ServiceType = ServiceType.Express,
            WeightKg = 2.5m,
            Dimensions = new ParcelDimensions { LengthCm = 30, WidthCm = 20, HeightCm = 15 },
            DeclaredValueZAR = 1500m,
            Description = "Electronic components",
            IsFragile = true,
            RequiresSignature = true,
            InsuranceRequired = true,
            PickupAddressId = pickupAddr.Id,
            DeliveryAddressId = deliveryAddr.Id,
            QuoteAmountZAR = 285.00m,
            Zone = SortingZone.Local,
            EstimatedDeliveryDate = now.AddDays(2),
            CreatedAt = now,
            UpdatedAt = now
        };
        sample.TrackingEvents.Add(Evt(sample.Id, TrackingEventType.Booked, "Parcel booking confirmed", "Johannesburg", now));
        await context.Parcels.AddAsync(sample, ct);

        await context.SaveChangesAsync(ct);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 2. Extra drivers + vehicles (different payload capacities for UC14/UC15)
    // ═════════════════════════════════════════════════════════════════════════
    private static async Task SeedDemoDriversAsync(
        ApplicationDbContext context, ILogger logger, PasswordService passwordService, DateTime now, CancellationToken ct)
    {
        var specs = new[]
        {
            (First: "Themba",    Last: "Ndlovu", Email: ThembaEmail,    Phone: "+27721110001", License: "KZN234567890",
             Reg: "ND 456 789", Make: "Ford",  Model: "Transit Custom", Year: 2021, Type: VehicleType.Van,                  Payload: 1200m, Lat: -29.8450m, Lng: 31.0100m),
            (First: "Ayanda",    Last: "Cele",   Email: AyandaEmail,    Phone: "+27721110002", License: "KZN345678901",
             Reg: "ND 112 233", Make: "Honda", Model: "CB125F",         Year: 2023, Type: VehicleType.Motorcycle,           Payload: 40m,   Lat: -29.8700m, Lng: 31.0300m),
            (First: "Nokuthula", Last: "Mbatha", Email: NokuthulaEmail, Phone: "+27721110003", License: "KZN456789012",
             Reg: "ND 778 899", Make: "Isuzu", Model: "D-Max",          Year: 2022, Type: VehicleType.LightDeliveryVehicle, Payload: 800m,  Lat: -29.8300m, Lng: 30.9900m),
        };

        foreach (var s in specs)
        {
            if (await context.Users.AnyAsync(u => u.Email == s.Email, ct)) continue;

            var userId = Guid.NewGuid();
            var profileId = Guid.NewGuid();

            await context.Users.AddAsync(CreateUser(userId, s.First, s.Last, s.Email, s.Phone,
                UserRole.Driver, passwordService, now), ct);

            await context.DriverProfiles.AddAsync(new DriverProfile
            {
                Id = profileId,
                UserId = userId,
                LicenseNumber = s.License,
                LicenseExpiry = new DateTime(2028, 3, 31),
                Status = DriverStatus.Available,
                CurrentLatitude = s.Lat,
                CurrentLongitude = s.Lng,
                CreatedAt = now,
                UpdatedAt = now
            }, ct);

            if (!await context.Vehicles.AnyAsync(v => v.RegistrationNumber == s.Reg, ct))
            {
                await context.Vehicles.AddAsync(new Vehicle
                {
                    Id = Guid.NewGuid(),
                    RegistrationNumber = s.Reg,
                    Make = s.Make,
                    Model = s.Model,
                    Year = s.Year,
                    VehicleType = s.Type,
                    Status = VehicleStatus.Active,
                    PayloadCapacityKg = s.Payload,
                    AssignedDriverId = profileId,
                    CreatedAt = now,
                    UpdatedAt = now
                }, ct);
            }
            logger.LogInformation("Seeded demo driver {Email}", s.Email);
        }

        // An unassigned heavy vehicle: the standby vehicle option when splitting an overloaded run (UC15).
        if (!await context.Vehicles.AnyAsync(v => v.RegistrationNumber == "ND 900 100", ct))
        {
            await context.Vehicles.AddAsync(new Vehicle
            {
                Id = Guid.NewGuid(),
                RegistrationNumber = "ND 900 100",
                Make = "Isuzu",
                Model = "NPR 400",
                Year = 2020,
                VehicleType = VehicleType.Truck,
                Status = VehicleStatus.Active,
                PayloadCapacityKg = 4000m,
                AssignedDriverId = null,
                CreatedAt = now,
                UpdatedAt = now
            }, ct);
        }

        await context.SaveChangesAsync(ct);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 3. Demo parcels: approval queue, pickups, overweight route, warehouse deliveries, upgrade request
    // ═════════════════════════════════════════════════════════════════════════
    private static async Task SeedDemoParcelsAsync(
        ApplicationDbContext context, ILogger logger, DateTime now, CancellationToken ct)
    {
        if (await context.Parcels.AnyAsync(p => p.TrackingNumber.StartsWith(DemoPrefix), ct))
        {
            logger.LogInformation("Demo parcels already seeded — skipping.");
            return;
        }

        var thabo = await context.CustomerProfiles.Include(c => c.User)
            .FirstOrDefaultAsync(c => c.User!.Email == "thabo@gmail.com", ct);
        var lindiwe = await context.CustomerProfiles.Include(c => c.User)
            .FirstOrDefaultAsync(c => c.User!.Email == "lindiwe@techcorp.co.za", ct);
        if (thabo is null || lindiwe is null)
        {
            logger.LogWarning("Demo customers not found — skipping demo parcels.");
            return;
        }

        var ayanda = await context.DriverProfiles.Include(d => d.User)
            .FirstOrDefaultAsync(d => d.User!.Email == AyandaEmail, ct);
        var ayandaVehicle = await context.Vehicles.FirstOrDefaultAsync(v => v.RegistrationNumber == "ND 112 233", ct);

        var addresses = new List<ParcelAddress>();
        var parcels = new List<Parcel>();
        var counter = 0;

        Parcel Add(CustomerProfile customer, ParcelStatus status, ServiceType service, decimal kg, string description,
                   SortingZone zone, ParcelAddress pickup, ParcelAddress delivery, double hoursAgo,
                   bool fragile = false, decimal? declared = null)
        {
            addresses.Add(pickup);
            addresses.Add(delivery);

            var created = now.AddHours(-hoursAgo);
            var insured = fragile || (declared ?? 0m) >= 2000m;
            var serviceFee = service switch
            {
                ServiceType.SameDay => 140m,
                ServiceType.Overnight => 90m,
                ServiceType.Express => 60m,
                ServiceType.Standard => 25m,
                _ => 0m
            };

            var parcel = new Parcel
            {
                Id = Guid.NewGuid(),
                TrackingNumber = $"{DemoPrefix}{++counter:D4}",
                CustomerId = customer.Id,
                Status = status,
                ServiceType = service,
                WeightKg = kg,
                DeclaredValueZAR = declared,
                Description = description,
                IsFragile = fragile,
                InsuranceRequired = insured,
                RequiresSignature = insured,
                PickupAddressId = pickup.Id,
                DeliveryAddressId = delivery.Id,
                QuoteAmountZAR = Math.Round(55m + kg * 8m + serviceFee, 2),
                Zone = zone,
                EstimatedDeliveryDate = created.AddDays(service == ServiceType.SameDay ? 0 : 3),
                PaymentMethod = PaymentMethod.CashOnCollection,
                IsPaid = false,
                CreatedAt = created,
                UpdatedAt = created
            };

            parcel.TrackingEvents.Add(Evt(parcel.Id, TrackingEventType.Booked, "Parcel booking confirmed", pickup.City, created));
            if (status is ParcelStatus.Approved or ParcelStatus.CheckedOut)
                parcel.TrackingEvents.Add(Evt(parcel.Id, TrackingEventType.Approved, "Booking approved by dispatcher", null, created.AddMinutes(20)));
            if (status == ParcelStatus.CheckedOut)
            {
                parcel.TrackingEvents.Add(Evt(parcel.Id, TrackingEventType.ReceivedAtWarehouse, "Parcel received at warehouse", "Durban warehouse", created.AddHours(1)));
                parcel.TrackingEvents.Add(Evt(parcel.Id, TrackingEventType.CheckedOut, "Parcel checked out — ready for dispatch", null, created.AddHours(2)));
            }

            parcels.Add(parcel);
            return parcel;
        }

        // Pickup (sender) addresses are all in Durban so pickups can be batched into one route.
        ParcelAddress DurbanPickup(string name, string phone, string street, string suburb, string postal, decimal lat, decimal lng)
            => Addr(name, phone, null, street, suburb, "Durban", SaProvince.KwaZuluNatal, postal, lat, lng, now);

        // ── Awaiting approval: one fresh, one "Aging" (2h+), one "Urgent" (4h+) on the dispatcher dashboard ──
        Add(thabo, ParcelStatus.PendingApproval, ServiceType.Standard, 4.0m, "Textbooks", SortingZone.National,
            DurbanPickup("Thabo Mokoena", "+27821234567", "14 Essenwood Rd", "Berea", "4001", -29.8420m, 31.0070m),
            Addr("Lerato Pillay", "+27830000001", null, "22 Kloof St", "Gardens", "Cape Town", SaProvince.WesternCape, "8001", -33.9300m, 18.4100m, now), 0.5);
        Add(lindiwe, ParcelStatus.PendingApproval, ServiceType.Economy, 12.0m, "Office stationery", SortingZone.National,
            DurbanPickup("TechCorp SA", "+27791234567", "9 Ridge Rd", "Umhlanga", "4319", -29.7280m, 31.0840m),
            Addr("Kabelo Sithole", "+27830000002", null, "5 Rivonia Rd", "Sandton", "Johannesburg", SaProvince.Gauteng, "2196", -26.1070m, 28.0560m, now), 3);
        Add(thabo, ParcelStatus.PendingApproval, ServiceType.SameDay, 1.2m, "Legal documents", SortingZone.National,
            DurbanPickup("Thabo Mokoena", "+27821234567", "30 Musgrave Rd", "Musgrave", "4001", -29.8390m, 31.0000m),
            Addr("Adv. N. Govender", "+27830000003", null, "88 Church St", "Pietermaritzburg Central", "Pietermaritzburg", SaProvince.KwaZuluNatal, "3201", -29.6010m, 30.3790m, now), 5);

        // ── Approved pickups, ready for the dispatcher to plan a route (all in Durban) ──
        var upgradeTarget = Add(thabo, ParcelStatus.Approved, ServiceType.Standard, 18.0m, "Sound equipment", SortingZone.National,
            DurbanPickup("Thabo Mokoena", "+27821234567", "75 Berea Rd", "Berea", "4001", -29.8470m, 31.0100m),
            Addr("Sibusiso Radebe", "+27830000004", null, "12 Jan Smuts Ave", "Parkwood", "Johannesburg", SaProvince.Gauteng, "2196", -26.1400m, 28.0300m, now), 6);
        Add(lindiwe, ParcelStatus.Approved, ServiceType.Express, 15.0m, "Printer and toner", SortingZone.National,
            DurbanPickup("TechCorp SA", "+27791234567", "3 Morningside Dr", "Morningside", "4001", -29.8330m, 31.0170m),
            Addr("Naledi Botha", "+27830000005", null, "40 Long St", "City Bowl", "Cape Town", SaProvince.WesternCape, "8001", -33.9250m, 18.4170m, now), 5);
        Add(thabo, ParcelStatus.Approved, ServiceType.Economy, 12.0m, "Winter clothing", SortingZone.National,
            DurbanPickup("Thabo Mokoena", "+27821234567", "21 Bulwer Rd", "Glenwood", "4001", -29.8760m, 31.0000m),
            Addr("Palesa Mokoena", "+27830000006", null, "7 Nelson Mandela Dr", "Westdene", "Bloemfontein", SaProvince.FreeState, "9301", -29.1200m, 26.2100m, now), 4);
        Add(lindiwe, ParcelStatus.Approved, ServiceType.Overnight, 6.0m, "Sample products", SortingZone.National,
            DurbanPickup("TechCorp SA", "+27791234567", "55 Marine Dr", "Bluff", "4052", -29.9300m, 31.0000m),
            Addr("Zinhle Maseko", "+27830000007", null, "18 Govan Mbeki Ave", "Central", "Gqeberha", SaProvince.EasternCape, "6001", -33.9600m, 25.6100m, now), 3);

        // ── Three Durban pickups that are already on an OVERWEIGHT route (45 kg on a 40 kg motorcycle) ──
        // Demonstrates UC14 Validate and Adjust Vehicle Payload and UC15 Split Overloaded Routes.
        var held1 = Add(lindiwe, ParcelStatus.Approved, ServiceType.Standard, 20.0m, "Hardware parts", SortingZone.Local,
            DurbanPickup("TechCorp SA", "+27791234567", "12 Lighthouse Rd", "Umhlanga", "4319", -29.7260m, 31.0870m),
            Addr("Mpho Sibiya", "+27830000008", null, "3 Old Main Rd", "Hillcrest", "Durban", SaProvince.KwaZuluNatal, "3610", -29.7800m, 30.7600m, now), 7);
        var held2 = Add(thabo, ParcelStatus.Approved, ServiceType.Express, 15.0m, "Camera gear", SortingZone.Local,
            DurbanPickup("Thabo Mokoena", "+27821234567", "9 Kearsney Rd", "Berea", "4001", -29.8500m, 31.0090m),
            Addr("Refilwe Dube", "+27830000009", null, "27 Florida Rd", "Morningside", "Durban", SaProvince.KwaZuluNatal, "4001", -29.8310m, 31.0190m, now), 7,
            fragile: true, declared: 3500m);
        var held3 = Add(lindiwe, ParcelStatus.Approved, ServiceType.Economy, 10.0m, "Promo material", SortingZone.Local,
            DurbanPickup("TechCorp SA", "+27791234567", "4 Jan Hofmeyr Rd", "Westville", "3629", -29.8300m, 30.9300m),
            Addr("Thando Zungu", "+27830000010", null, "61 Windermere Rd", "Morningside", "Durban", SaProvince.KwaZuluNatal, "4001", -29.8340m, 31.0200m, now), 7);

        // ── Checked-out deliveries (already at the warehouse, same Local zone) ──
        Add(thabo, ParcelStatus.CheckedOut, ServiceType.Standard, 8.0m, "Laptop bags", SortingZone.Local,
            Addr("Thabo Mokoena", "+27821234567", null, "456 Commissioner St", "Marshalltown", "Johannesburg", SaProvince.Gauteng, "2107", -26.2041m, 28.0473m, now),
            Addr("Ayesha Naidoo", "+27830000011", null, "15 Musgrave Rd", "Musgrave", "Durban", SaProvince.KwaZuluNatal, "4001", -29.8380m, 31.0010m, now), 26);
        Add(lindiwe, ParcelStatus.CheckedOut, ServiceType.Express, 5.0m, "Printer cartridges", SortingZone.Local,
            Addr("TechCorp SA", "+27791234567", null, "123 Sandton Drive", "Sandton", "Johannesburg", SaProvince.Gauteng, "2196", -26.1070m, 28.0560m, now),
            Addr("Bongani Hlatshwayo", "+27830000012", null, "33 Bulwer Rd", "Glenwood", "Durban", SaProvince.KwaZuluNatal, "4001", -29.8750m, 30.9990m, now), 26);
        Add(thabo, ParcelStatus.CheckedOut, ServiceType.Economy, 3.5m, "Books", SortingZone.Local,
            Addr("Thabo Mokoena", "+27821234567", null, "456 Commissioner St", "Marshalltown", "Johannesburg", SaProvince.Gauteng, "2107", -26.2041m, 28.0473m, now),
            Addr("Nomsa Khoza", "+27830000013", null, "8 Innes Rd", "Morningside", "Durban", SaProvince.KwaZuluNatal, "4001", -29.8320m, 31.0180m, now), 26);

        await context.ParcelAddresses.AddRangeAsync(addresses, ct);
        await context.Parcels.AddRangeAsync(parcels, ct);

        // ── Priority upgrade request waiting for the dispatcher (Standard → Express) ──
        await context.Set<PriorityUpgradeRequest>().AddAsync(new PriorityUpgradeRequest
        {
            Id = Guid.NewGuid(),
            ParcelId = upgradeTarget.Id,
            CustomerId = thabo.Id,
            CurrentServiceType = ServiceType.Standard,
            RequestedServiceType = ServiceType.Express,
            Reason = "Needed for an event on Friday.",
            FeeZAR = 95.00m,
            Status = UpgradeRequestStatus.Pending,
            CreatedAt = now,
            UpdatedAt = now
        }, ct);

        // ── The overweight route held for payload review ──
        if (ayanda is not null && ayandaVehicle is not null)
        {
            var total = held1.WeightKg + held2.WeightKg + held3.WeightKg;   // 45 kg
            await context.Set<DeliveryRoute>().AddAsync(new DeliveryRoute
            {
                Id = Guid.NewGuid(),
                DriverId = ayanda.Id,
                VehicleId = ayandaVehicle.Id,
                Zone = SortingZone.Local,
                Status = RouteStatus.PendingPayloadReview,
                TotalWeightKg = total,
                PayloadCapacityKg = ayandaVehicle.PayloadCapacityKg,
                PayloadOverageKg = Math.Max(0m, total - ayandaVehicle.PayloadCapacityKg),
                HeldParcelIdsJson = JsonSerializer.Serialize(new[] { held1.Id, held2.Id, held3.Id }),
                CreatedAt = now,
                UpdatedAt = now
            }, ct);
        }
        else
        {
            logger.LogWarning("Driver Ayanda or her vehicle is missing — the overweight demo route was not created.");
        }

        await context.SaveChangesAsync(ct);
        logger.LogInformation("Seeded {Count} demo parcels.", parcels.Count);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 3b. Two parcels waiting in the warehouse for the same address, so the customer
    //     Consolidate page (UC10) has something to show. Own guard so it also works on
    //     databases that were seeded before this was added.
    // ═════════════════════════════════════════════════════════════════════════
    private static async Task SeedDemoConsolidationParcelsAsync(
        ApplicationDbContext context, ILogger logger, DateTime now, CancellationToken ct)
    {
        const string prefix = DemoPrefix + "W";
        if (await context.Parcels.AnyAsync(p => p.TrackingNumber.StartsWith(prefix), ct))
            return;

        var thabo = await context.CustomerProfiles.Include(c => c.User)
            .FirstOrDefaultAsync(c => c.User!.Email == "thabo@gmail.com", ct);
        if (thabo is null) return;

        var delivery1 = Addr("Nomsa Khoza", "+27830000013", null, "8 Innes Rd", "Morningside", "Durban",
            SaProvince.KwaZuluNatal, "4001", -29.8320m, 31.0180m, now);
        var delivery2 = Addr("Nomsa Khoza", "+27830000013", null, "8 Innes Rd", "Morningside", "Durban",
            SaProvince.KwaZuluNatal, "4001", -29.8320m, 31.0180m, now);
        var pickup1 = Addr("Thabo Mokoena", "+27821234567", null, "14 Essenwood Rd", "Berea", "Durban",
            SaProvince.KwaZuluNatal, "4001", -29.8420m, 31.0070m, now);
        var pickup2 = Addr("Thabo Mokoena", "+27821234567", null, "14 Essenwood Rd", "Berea", "Durban",
            SaProvince.KwaZuluNatal, "4001", -29.8420m, 31.0070m, now);

        var specs = new[]
        {
            (Num: "W001", Kg: 6.0m, Desc: "Kitchen appliances", Pickup: pickup1, Delivery: delivery1),
            (Num: "W002", Kg: 3.5m, Desc: "Cookbooks",          Pickup: pickup2, Delivery: delivery2),
        };

        var parcels = new List<Parcel>();
        foreach (var sp in specs)
        {
            var created = now.AddHours(-30);
            var parcel = new Parcel
            {
                Id = Guid.NewGuid(),
                TrackingNumber = $"{DemoPrefix}{sp.Num}",
                CustomerId = thabo.Id,
                Status = ParcelStatus.InWarehouse,
                ServiceType = ServiceType.Standard,
                WeightKg = sp.Kg,
                Description = sp.Desc,
                PickupAddressId = sp.Pickup.Id,
                DeliveryAddressId = sp.Delivery.Id,
                QuoteAmountZAR = Math.Round(55m + sp.Kg * 8m + 25m, 2),
                Zone = SortingZone.Local,
                EstimatedDeliveryDate = created.AddDays(3),
                PaymentMethod = PaymentMethod.CashOnCollection,
                IsPaid = false,
                CreatedAt = created,
                UpdatedAt = created
            };
            parcel.TrackingEvents.Add(Evt(parcel.Id, TrackingEventType.Booked, "Parcel booking confirmed", "Durban", created));
            parcel.TrackingEvents.Add(Evt(parcel.Id, TrackingEventType.Approved, "Booking approved by dispatcher", null, created.AddMinutes(20)));
            parcel.TrackingEvents.Add(Evt(parcel.Id, TrackingEventType.ReceivedAtWarehouse, "Parcel received at warehouse", "Durban warehouse", created.AddHours(1)));
            parcels.Add(parcel);
        }

        await context.ParcelAddresses.AddRangeAsync(new[] { pickup1, pickup2, delivery1, delivery2 }, ct);
        await context.Parcels.AddRangeAsync(parcels, ct);
        await context.SaveChangesAsync(ct);
        logger.LogInformation("Seeded {Count} warehouse parcels for the consolidation demo.", parcels.Count);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // 4. Driver roster: 7 days of shifts, open shifts, one leave request, one shift swap
    // ═════════════════════════════════════════════════════════════════════════
    private static async Task SeedDemoRosterAsync(
        ApplicationDbContext context, ILogger logger, DateTime now, CancellationToken ct)
    {
        if (await context.Set<DriverShift>().AnyAsync(ct))
        {
            logger.LogInformation("Roster already seeded — skipping.");
            return;
        }

        var emails = new[] { SiphoEmail, ThembaEmail, AyandaEmail, NokuthulaEmail };
        var found = await context.DriverProfiles.Include(d => d.User)
            .Where(d => emails.Contains(d.User!.Email)).ToListAsync(ct);
        var drivers = emails.Select(e => found.FirstOrDefault(d => d.User!.Email == e))
            .Where(d => d is not null).Select(d => d!).ToList();
        if (drivers.Count < 3)
        {
            logger.LogWarning("Fewer than three demo drivers found — skipping the roster.");
            return;
        }

        var n = drivers.Count;
        var today = now.Date;
        var shifts = new List<DriverShift>();
        DriverShift? swapShift = null;

        for (var d = 0; d < 7; d++)
        {
            var date = today.AddDays(d);

            shifts.Add(new DriverShift
            {
                Id = Guid.NewGuid(),
                Date = date,
                ShiftType = ShiftType.Morning,
                DriverId = drivers[d % n].Id,
                Status = ShiftStatus.Scheduled,
                IsPublished = true,
                CreatedAt = now,
                UpdatedAt = now
            });

            // Two afternoons are left unstaffed so the "open shifts" screen has something to assign.
            var open = d is 2 or 4;
            var afternoon = new DriverShift
            {
                Id = Guid.NewGuid(),
                Date = date,
                ShiftType = ShiftType.Afternoon,
                DriverId = open ? null : drivers[(d + 1) % n].Id,
                Status = open ? ShiftStatus.Open : ShiftStatus.Scheduled,
                IsPublished = true,
                Note = open ? "Cover needed" : null,
                CreatedAt = now,
                UpdatedAt = now
            };
            shifts.Add(afternoon);
            if (d == 1) swapShift = afternoon;
        }
        await context.Set<DriverShift>().AddRangeAsync(shifts, ct);

        // A pending annual-leave request for the second driver (admin approves or rejects it).
        await context.Set<LeaveRequest>().AddAsync(new LeaveRequest
        {
            Id = Guid.NewGuid(),
            DriverId = drivers[1].Id,
            LeaveType = LeaveType.Annual,
            StartDate = today.AddDays(5),
            EndDate = today.AddDays(6),
            Reason = "Family event in Pietermaritzburg.",
            Status = LeaveRequestStatus.Pending,
            CreatedAt = now,
            UpdatedAt = now
        }, ct);

        // A shift swap waiting for the off-duty peer to accept.
        if (swapShift?.DriverId is Guid requesterId)
        {
            var peer = drivers[(1 + 2) % n];
            if (peer.Id != requesterId)
            {
                await context.Set<ShiftSwapRequest>().AddAsync(new ShiftSwapRequest
                {
                    Id = Guid.NewGuid(),
                    ShiftId = swapShift.Id,
                    RequesterDriverId = requesterId,
                    PeerDriverId = peer.Id,
                    Reason = "Family commitment that afternoon.",
                    Status = SwapRequestStatus.AwaitingPeer,
                    CreatedAt = now,
                    UpdatedAt = now
                }, ct);
            }
        }

        await context.SaveChangesAsync(ct);
        logger.LogInformation("Seeded the 7-day driver roster.");
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private static TrackingEvent Evt(Guid parcelId, TrackingEventType type, string description, string? location, DateTime at) => new()
    {
        Id = Guid.NewGuid(),
        ParcelId = parcelId,
        EventType = type,
        Description = description,
        Location = location,
        OccurredAt = at,
        CreatedAt = at,
        UpdatedAt = at
    };

    private static ParcelAddress Addr(
        string name, string phone, string? email, string street, string suburb, string city,
        SaProvince province, string postalCode, decimal lat, decimal lng, DateTime now) => new()
        {
            Id = Guid.NewGuid(),
            RecipientName = name,
            RecipientPhone = phone,
            RecipientEmail = email,
            StreetAddress = street,
            Suburb = suburb,
            City = city,
            Province = province,
            PostalCode = postalCode,
            Country = "South Africa",
            Latitude = lat,
            Longitude = lng,
            CreatedAt = now,
            UpdatedAt = now
        };

    private static User CreateUser(
        Guid id, string first, string last, string email,
        string phone, UserRole role, PasswordService pwd, DateTime now) => new()
        {
            Id = id,
            FirstName = first,
            LastName = last,
            Email = email,
            PhoneNumber = phone,
            PasswordHash = pwd.Hash(DemoPassword),
            Role = role,
            Status = UserStatus.Active,
            CreatedAt = now,
            UpdatedAt = now
        };
}