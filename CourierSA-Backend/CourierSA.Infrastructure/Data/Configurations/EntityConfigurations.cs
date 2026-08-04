using CourierSA.Domain.Entities;
using CourierSA.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CourierSA.Infrastructure.Data.Configurations;

// ── User ──────────────────────────────────────────────────────────────────────
public class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.ToTable("Users");
        builder.HasKey(u => u.Id);
        builder.Property(u => u.Id).HasColumnType("char(36)");

        builder.Property(u => u.Email)
               .IsRequired().HasMaxLength(256);
        builder.HasIndex(u => u.Email).IsUnique();

        builder.Property(u => u.PhoneNumber)
               .IsRequired().HasMaxLength(20);

        builder.Property(u => u.PasswordHash)
               .IsRequired().HasMaxLength(512);

        builder.Property(u => u.FirstName).IsRequired().HasMaxLength(100);
        builder.Property(u => u.LastName).IsRequired().HasMaxLength(100);

        builder.Property(u => u.Role)
               .HasConversion<string>().HasMaxLength(50);

        builder.Property(u => u.Status)
               .HasConversion<string>().HasMaxLength(50);

        // Relationships
        builder.HasOne(u => u.CustomerProfile)
               .WithOne(c => c.User)
               .HasForeignKey<CustomerProfile>(c => c.UserId)
               .OnDelete(DeleteBehavior.Cascade);

        builder.HasOne(u => u.DriverProfile)
               .WithOne(d => d.User)
               .HasForeignKey<DriverProfile>(d => d.UserId)
               .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(u => u.Notifications)
               .WithOne(n => n.User)
               .HasForeignKey(n => n.UserId)
               .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(u => u.AuditLogs)
               .WithOne(a => a.User)
               .HasForeignKey(a => a.UserId)
               .OnDelete(DeleteBehavior.SetNull);

        builder.HasMany(u => u.WalletTransactions)
               .WithOne(w => w.User)
               .HasForeignKey(w => w.UserId)
               .OnDelete(DeleteBehavior.Restrict);
    }
}

// ── CustomerProfile ───────────────────────────────────────────────────────────
public class CustomerProfileConfiguration : IEntityTypeConfiguration<CustomerProfile>
{
    public void Configure(EntityTypeBuilder<CustomerProfile> builder)
    {
        builder.ToTable("CustomerProfiles");
        builder.HasKey(c => c.Id);
        builder.Property(c => c.Id).HasColumnType("char(36)");
        builder.Property(c => c.UserId).HasColumnType("char(36)");

        builder.Property(c => c.CompanyName).HasMaxLength(200);
        builder.Property(c => c.VatNumber).HasMaxLength(20);
        builder.Property(c => c.DefaultPickupAddress).HasMaxLength(500);
        builder.Property(c => c.AccountType)
               .HasConversion<string>().HasMaxLength(50);

        builder.HasMany(c => c.Parcels)
               .WithOne(p => p.Customer)
               .HasForeignKey(p => p.CustomerId)
               .OnDelete(DeleteBehavior.Restrict);

        builder.HasMany(c => c.Quotes)
               .WithOne(q => q.Customer)
               .HasForeignKey(q => q.CustomerId)
               .OnDelete(DeleteBehavior.Restrict);

        builder.HasMany(c => c.Invoices)
               .WithOne(i => i.Customer)
               .HasForeignKey(i => i.CustomerId)
               .OnDelete(DeleteBehavior.Restrict);
    }
}

// ── DriverProfile ─────────────────────────────────────────────────────────────
public class DriverProfileConfiguration : IEntityTypeConfiguration<DriverProfile>
{
    public void Configure(EntityTypeBuilder<DriverProfile> builder)
    {
        builder.ToTable("DriverProfiles");
        builder.HasKey(d => d.Id);
        builder.Property(d => d.Id).HasColumnType("char(36)");
        builder.Property(d => d.UserId).HasColumnType("char(36)");

        builder.Property(d => d.LicenseNumber).IsRequired().HasMaxLength(50);
        builder.HasIndex(d => d.LicenseNumber).IsUnique();
        builder.Property(d => d.LicenseExpiry);
        builder.Property(d => d.Status).HasConversion<string>().HasMaxLength(50);
        builder.Property(d => d.CurrentLatitude).HasColumnType("decimal(10,7)");
        builder.Property(d => d.CurrentLongitude).HasColumnType("decimal(10,7)");

        builder.HasMany(d => d.Deliveries)
               .WithOne(del => del.Driver)
               .HasForeignKey(del => del.DriverId)
               .OnDelete(DeleteBehavior.Restrict);

        builder.HasMany(d => d.VehicleInspections)
               .WithOne(vi => vi.Driver)
               .HasForeignKey(vi => vi.DriverId)
               .OnDelete(DeleteBehavior.Restrict);
    }
}

// ── Parcel ────────────────────────────────────────────────────────────────────
public class ParcelConfiguration : IEntityTypeConfiguration<Parcel>
{
    public void Configure(EntityTypeBuilder<Parcel> builder)
    {
        builder.ToTable("Parcels");
        builder.HasKey(p => p.Id);
        builder.Property(p => p.Id).HasColumnType("char(36)");
        builder.Property(p => p.CustomerId).HasColumnType("char(36)");

        builder.Property(p => p.TrackingNumber)
               .IsRequired().HasMaxLength(30);
        builder.HasIndex(p => p.TrackingNumber).IsUnique();

        builder.Property(p => p.Status)
               .HasConversion<string>().HasMaxLength(50);

        builder.Property(p => p.ServiceType)
               .HasConversion<string>().HasMaxLength(50);

        builder.Property(p => p.WeightKg).HasColumnType("decimal(8,3)");
        builder.Property(p => p.DeclaredValueZAR);
        builder.Property(p => p.Description).HasMaxLength(500);
        builder.Property(p => p.SpecialInstructions).HasMaxLength(1000);
        builder.Property(p => p.BarcodeImagePath).HasMaxLength(500);

        // Owned: dimensions
        builder.OwnsOne(p => p.Dimensions, d =>
        {
            d.Property(x => x.LengthCm).HasColumnName("DimLengthCm").HasColumnType("decimal(8,2)");
            d.Property(x => x.WidthCm).HasColumnName("DimWidthCm").HasColumnType("decimal(8,2)");
            d.Property(x => x.HeightCm).HasColumnName("DimHeightCm").HasColumnType("decimal(8,2)");
        });

        builder.HasOne(p => p.PickupAddress)
               .WithOne()
               .HasForeignKey<Parcel>(p => p.PickupAddressId)
               .OnDelete(DeleteBehavior.Restrict);

        builder.HasOne(p => p.DeliveryAddress)
               .WithOne()
               .HasForeignKey<Parcel>(p => p.DeliveryAddressId)
               .OnDelete(DeleteBehavior.Restrict);

        builder.HasMany(p => p.TrackingEvents)
               .WithOne(t => t.Parcel)
               .HasForeignKey(t => t.ParcelId)
               .OnDelete(DeleteBehavior.Cascade);

        builder.HasMany(p => p.Deliveries)
        .WithOne(d => d.Parcel)
        .HasForeignKey(d => d.ParcelId)
        .OnDelete(DeleteBehavior.Restrict);
    }
}

// ── ParcelAddress ─────────────────────────────────────────────────────────────
public class ParcelAddressConfiguration : IEntityTypeConfiguration<ParcelAddress>
{
    public void Configure(EntityTypeBuilder<ParcelAddress> builder)
    {
        builder.ToTable("ParcelAddresses");
        builder.HasKey(a => a.Id);
        builder.Property(a => a.Id).HasColumnType("char(36)");

        builder.Property(a => a.RecipientName).IsRequired().HasMaxLength(200);
        builder.Property(a => a.RecipientPhone).IsRequired().HasMaxLength(20);
        builder.Property(a => a.RecipientEmail).HasMaxLength(256);
        builder.Property(a => a.StreetAddress).IsRequired().HasMaxLength(300);
        builder.Property(a => a.Suburb).HasMaxLength(150);
        builder.Property(a => a.City).IsRequired().HasMaxLength(100);
        builder.Property(a => a.Province).HasConversion<string>().HasMaxLength(50);
        builder.Property(a => a.PostalCode).IsRequired().HasMaxLength(10);
        builder.Property(a => a.Country).IsRequired().HasMaxLength(100).HasDefaultValue("South Africa");
        builder.Property(a => a.SpecialInstructions).HasMaxLength(500);
        builder.Property(a => a.Latitude).HasColumnType("decimal(10,7)");
        builder.Property(a => a.Longitude).HasColumnType("decimal(10,7)");
    }
}

// ── TrackingEvent ─────────────────────────────────────────────────────────────
public class TrackingEventConfiguration : IEntityTypeConfiguration<TrackingEvent>
{
    public void Configure(EntityTypeBuilder<TrackingEvent> builder)
    {
        builder.ToTable("TrackingEvents");
        builder.HasKey(t => t.Id);
        builder.Property(t => t.Id).HasColumnType("char(36)");
        builder.Property(t => t.ParcelId).HasColumnType("char(36)");

        builder.Property(t => t.EventType)
               .HasConversion<string>().HasMaxLength(80);
        builder.Property(t => t.Location).HasMaxLength(300);
        builder.Property(t => t.Description).HasMaxLength(500);
        builder.Property(t => t.Latitude).HasColumnType("decimal(10,7)");
        builder.Property(t => t.Longitude).HasColumnType("decimal(10,7)");
        builder.Property(t => t.OccurredAt);
        builder.Property(t => t.RecordedByStaffId).HasColumnType("char(36)");

        builder.HasIndex(t => t.ParcelId);
        builder.HasIndex(t => t.OccurredAt);
    }
}

// ── Delivery ──────────────────────────────────────────────────────────────────
public class DeliveryConfiguration : IEntityTypeConfiguration<Delivery>
{
    public void Configure(EntityTypeBuilder<Delivery> builder)
    {
        builder.ToTable("Deliveries");
        builder.HasKey(d => d.Id);
        builder.Property(d => d.Id).HasColumnType("char(36)");
        builder.Property(d => d.ParcelId).HasColumnType("char(36)");
        builder.Property(d => d.DriverId).HasColumnType("char(36)");

        builder.Property(d => d.Status)
               .HasConversion<string>().HasMaxLength(50);
        builder.Property(d => d.FailureReason)
               .HasConversion<string>().HasMaxLength(80);
        builder.Property(d => d.AttemptNotes).HasMaxLength(500);
        builder.Property(d => d.ProofOfDeliveryImagePath).HasMaxLength(500);
        builder.Property(d => d.RecipientSignaturePath).HasMaxLength(500);

        builder.HasIndex(d => d.ParcelId);
        builder.HasIndex(d => d.DriverId);
        builder.HasIndex(d => d.Status);
    }
}

// ── Quote ─────────────────────────────────────────────────────────────────────
public class QuoteConfiguration : IEntityTypeConfiguration<Quote>
{
    public void Configure(EntityTypeBuilder<Quote> builder)
    {
        builder.ToTable("Quotes");
        builder.HasKey(q => q.Id);
        builder.Property(q => q.Id).HasColumnType("char(36)");
        builder.Property(q => q.CustomerId).HasColumnType("char(36)");

        builder.Property(q => q.Status)
               .HasConversion<string>().HasMaxLength(50);
        builder.Property(q => q.ServiceType)
               .HasConversion<string>().HasMaxLength(50);
        builder.Property(q => q.OriginProvince)
               .HasConversion<string>().HasMaxLength(50);
        builder.Property(q => q.DestinationProvince)
               .HasConversion<string>().HasMaxLength(50);
        builder.Property(q => q.WeightKg).HasColumnType("decimal(8,3)");
        builder.Property(q => q.BaseAmountZAR);
        builder.Property(q => q.SurchargeZAR);
        builder.Property(q => q.InsurancePremiumZAR);
        builder.Property(q => q.TotalAmountZAR);
        builder.Property(q => q.VatAmountZAR);
        builder.Property(q => q.ExpiresAt);
    }
}

// ── Vehicle ───────────────────────────────────────────────────────────────────
public class VehicleConfiguration : IEntityTypeConfiguration<Vehicle>
{
    public void Configure(EntityTypeBuilder<Vehicle> builder)
    {
        builder.ToTable("Vehicles");
        builder.HasKey(v => v.Id);
        builder.Property(v => v.Id).HasColumnType("char(36)");

        builder.Property(v => v.RegistrationNumber)
               .IsRequired().HasMaxLength(20);
        builder.HasIndex(v => v.RegistrationNumber).IsUnique();

        builder.Property(v => v.Make).HasMaxLength(80);
        builder.Property(v => v.Model).HasMaxLength(80);
        builder.Property(v => v.VehicleType)
               .HasConversion<string>().HasMaxLength(50);
        builder.Property(v => v.Status)
               .HasConversion<string>().HasMaxLength(50);
        builder.Property(v => v.PayloadCapacityKg)
               .HasColumnType("decimal(8,2)");

        builder.HasMany(v => v.Inspections)
               .WithOne(i => i.Vehicle)
               .HasForeignKey(i => i.VehicleId)
               .OnDelete(DeleteBehavior.Cascade);
    }
}

// ── VehicleInspection ─────────────────────────────────────────────────────────
public class VehicleInspectionConfiguration : IEntityTypeConfiguration<VehicleInspection>
{
    public void Configure(EntityTypeBuilder<VehicleInspection> builder)
    {
        builder.ToTable("VehicleInspections");
        builder.HasKey(i => i.Id);
        builder.Property(i => i.Id).HasColumnType("char(36)");
        builder.Property(i => i.VehicleId).HasColumnType("char(36)");
        builder.Property(i => i.DriverId).HasColumnType("char(36)");

        builder.Property(i => i.Type)
               .HasConversion<string>().HasMaxLength(50);
        builder.Property(i => i.Result)
               .HasConversion<string>().HasMaxLength(50);
        builder.Property(i => i.OdometerKm);
        builder.Property(i => i.Notes).HasMaxLength(1000);
        builder.Property(i => i.PhotoPaths).HasMaxLength(2000);
    }
}

// ── WalletTransaction ──────────────────────────────────────────────────────────
public class WalletTransactionConfiguration : IEntityTypeConfiguration<WalletTransaction>
{
    public void Configure(EntityTypeBuilder<WalletTransaction> builder)
    {
        builder.ToTable("WalletTransactions");
        builder.HasKey(w => w.Id);
        builder.Property(w => w.Id).HasColumnType("char(36)");
        builder.Property(w => w.UserId).HasColumnType("char(36)");

        builder.Property(w => w.Type)
               .HasConversion<string>().HasMaxLength(50);
        builder.Property(w => w.AmountZAR);
        builder.Property(w => w.BalanceAfterZAR);
        builder.Property(w => w.ReferenceId).HasColumnType("char(36)");
        builder.Property(w => w.ReferenceType).HasMaxLength(80);
        builder.Property(w => w.Description).HasMaxLength(300);
        builder.Property(w => w.ExternalPaymentRef).HasMaxLength(200);

        builder.HasIndex(w => w.UserId);
        builder.HasIndex(w => w.CreatedAt);
    }
}

// ── Invoice ───────────────────────────────────────────────────────────────────
public class InvoiceConfiguration : IEntityTypeConfiguration<Invoice>
{
    public void Configure(EntityTypeBuilder<Invoice> builder)
    {
        builder.ToTable("Invoices");
        builder.HasKey(i => i.Id);
        builder.Property(i => i.Id).HasColumnType("char(36)");
        builder.Property(i => i.CustomerId).HasColumnType("char(36)");

        builder.Property(i => i.InvoiceNumber)
               .IsRequired().HasMaxLength(30);
        builder.HasIndex(i => i.InvoiceNumber).IsUnique();

        builder.Property(i => i.Status)
               .HasConversion<string>().HasMaxLength(50);
        builder.Property(i => i.PdfPath).HasMaxLength(500);
        builder.Property(i => i.SubtotalZAR);
        builder.Property(i => i.VatZAR);
        builder.Property(i => i.TotalZAR);
        builder.Property(i => i.PaidAmountZAR);
        builder.Property(i => i.DueDate);
        builder.Property(i => i.PaidAt);

        builder.HasMany(i => i.LineItems)
               .WithOne()
               .HasForeignKey("InvoiceId")
               .OnDelete(DeleteBehavior.Cascade);
    }
}

// ── InsuranceClaim ────────────────────────────────────────────────────────────
public class InsuranceClaimConfiguration : IEntityTypeConfiguration<InsuranceClaim>
{
    public void Configure(EntityTypeBuilder<InsuranceClaim> builder)
    {
        builder.ToTable("InsuranceClaims");
        builder.HasKey(c => c.Id);
        builder.Property(c => c.Id).HasColumnType("char(36)");
        builder.Property(c => c.ParcelId).HasColumnType("char(36)");
        builder.Property(c => c.CustomerId).HasColumnType("char(36)");

        builder.Property(c => c.ClaimNumber)
               .IsRequired().HasMaxLength(30);
        builder.HasIndex(c => c.ClaimNumber).IsUnique();

        builder.Property(c => c.Type)
               .HasConversion<string>().HasMaxLength(50);
        builder.Property(c => c.Status)
               .HasConversion<string>().HasMaxLength(50);
        builder.Property(c => c.ClaimedAmountZAR);
        builder.Property(c => c.ApprovedAmountZAR);
        builder.Property(c => c.Description).HasMaxLength(2000);
        builder.Property(c => c.ResolutionNotes).HasMaxLength(1000);
        builder.Property(c => c.SupportingDocumentPaths).HasMaxLength(2000);

        builder.HasOne(c => c.Parcel)
               .WithMany()
               .HasForeignKey(c => c.ParcelId)
               .OnDelete(DeleteBehavior.Restrict);
    }
}

// ── AddressCorrectionRequest ──────────────────────────────────────────────────
public class AddressCorrectionConfiguration : IEntityTypeConfiguration<AddressCorrectionRequest>
{
    public void Configure(EntityTypeBuilder<AddressCorrectionRequest> builder)
    {
        builder.ToTable("AddressCorrectionRequests");
        builder.HasKey(a => a.Id);
        builder.Property(a => a.Id).HasColumnType("char(36)");
        builder.Property(a => a.ParcelId).HasColumnType("char(36)");
        builder.Property(a => a.RequestedByUserId).HasColumnType("char(36)");

        builder.Property(a => a.Status)
               .HasConversion<string>().HasMaxLength(50);
        builder.Property(a => a.OriginalAddress).HasMaxLength(500);
        builder.Property(a => a.CorrectedAddress).HasMaxLength(500);
        builder.Property(a => a.Reason).HasMaxLength(500);
        builder.Property(a => a.ReviewNotes).HasMaxLength(500);
        builder.Property(a => a.ReviewedByUserId).HasColumnType("char(36)");
    }
}

// ── Notification ──────────────────────────────────────────────────────────────
public class NotificationConfiguration : IEntityTypeConfiguration<Notification>
{
    public void Configure(EntityTypeBuilder<Notification> builder)
    {
        builder.ToTable("Notifications");
        builder.HasKey(n => n.Id);
        builder.Property(n => n.Id).HasColumnType("char(36)");
        builder.Property(n => n.UserId).HasColumnType("char(36)");

        builder.Property(n => n.Type)
               .HasConversion<string>().HasMaxLength(80);
        builder.Property(n => n.Channel)
               .HasConversion<string>().HasMaxLength(50);
        builder.Property(n => n.Title).IsRequired().HasMaxLength(200);
        builder.Property(n => n.Body).IsRequired().HasMaxLength(1000);
        builder.Property(n => n.ReferenceId).HasColumnType("char(36)");
        builder.Property(n => n.ReferenceType).HasMaxLength(80);

        builder.HasIndex(n => new { n.UserId, n.IsRead });
        builder.HasIndex(n => n.CreatedAt);
    }
}

// ── AuditLog ──────────────────────────────────────────────────────────────────
public class AuditLogConfiguration : IEntityTypeConfiguration<AuditLog>
{
    public void Configure(EntityTypeBuilder<AuditLog> builder)
    {
        builder.ToTable("AuditLogs");
        builder.HasKey(a => a.Id);
        builder.Property(a => a.Id).HasColumnType("char(36)");
        builder.Property(a => a.UserId).HasColumnType("char(36)");

        builder.Property(a => a.Action).IsRequired().HasMaxLength(100);
        builder.Property(a => a.EntityType).IsRequired().HasMaxLength(100);
        builder.Property(a => a.EntityId).HasColumnType("char(36)");
        builder.Property(a => a.OldValues).HasColumnType("json");
        builder.Property(a => a.NewValues).HasColumnType("json");
        builder.Property(a => a.IpAddress).HasMaxLength(50);
        builder.Property(a => a.UserAgent).HasMaxLength(500);

        builder.HasIndex(a => a.EntityType);
        builder.HasIndex(a => a.EntityId);
        builder.HasIndex(a => a.CreatedAt);

        // Audit logs are immutable – no updates allowed
        builder.ToTable(t => t.HasCheckConstraint("chk_audit_immutable", "1=1"));
    }
}
