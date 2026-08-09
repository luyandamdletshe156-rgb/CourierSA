using CourierSA.Domain.Entities;
using CourierSA.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using System.Reflection;

namespace CourierSA.Infrastructure.Data;

public class ApplicationDbContext : DbContext
{
    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
        : base(options) { }

    // ── Core Identity ──────────────────────────────────────────────────────────
    public DbSet<User>                     Users                    { get; set; }
    public DbSet<CustomerProfile>          CustomerProfiles         { get; set; }
    public DbSet<DriverProfile>            DriverProfiles           { get; set; }

    // ── Parcel Workflow ────────────────────────────────────────────────────────
    public DbSet<Parcel>                   Parcels                  { get; set; }
    public DbSet<ParcelAddress>            ParcelAddresses          { get; set; }
    public DbSet<TrackingEvent>            TrackingEvents           { get; set; }
    public DbSet<Quote>                    Quotes                   { get; set; }
    public DbSet<ParcelInspection>         ParcelInspections        { get; set; }
    public DbSet<Delivery>                 Deliveries               { get; set; }
    public DbSet<LostParcelCase> LostParcelCases { get; set; }
    public DbSet<ReturnRequest> ReturnRequests { get; set; }

    // ── Fleet ──────────────────────────────────────────────────────────────────
    public DbSet<Vehicle>                  Vehicles                 { get; set; }
    public DbSet<VehicleInspection>        VehicleInspections       { get; set; }

    // ── Finance ────────────────────────────────────────────────────────────────
    public DbSet<WalletTransaction>        WalletTransactions       { get; set; }
    public DbSet<Invoice>                  Invoices                 { get; set; }

    // ── Claims & Corrections ───────────────────────────────────────────────────
    public DbSet<InsuranceClaim>           InsuranceClaims          { get; set; }
    public DbSet<AddressCorrectionRequest> AddressCorrectionRequests { get; set; }
    // ── Sorting & Warehouse Zones ──────────────────────────────────────────────
    public DbSet<PostalCodeZoneRule> PostalCodeZoneRules { get; set; }
    public DbSet<SortingBin> SortingBins { get; set; }
    public DbSet<ParcelSortingAssignment> ParcelSortingAssignments { get; set; }

    public DbSet<DeliveryRoute> DeliveryRoutes { get; set; }

    // ── Platform ───────────────────────────────────────────────────────────────

    public DbSet<BulkUploadHistory> BulkUploadHistories { get; set; }
    public DbSet<Notification>Notifications{ get; set; }
    public DbSet<AuditLog>AuditLogs{ get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Apply all IEntityTypeConfiguration<T> from this assembly
        modelBuilder.ApplyConfigurationsFromAssembly(Assembly.GetExecutingAssembly());

        // Explicit config: ParcelSortingAssignment has two FKs into SortingBin
        modelBuilder.Entity<ParcelSortingAssignment>()
            .HasOne(a => a.SuggestedBin)
            .WithMany()
            .HasForeignKey(a => a.SuggestedBinId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<ParcelSortingAssignment>()
            .HasOne(a => a.ConfirmedBin)
            .WithMany(b => b.Assignments)
            .HasForeignKey(a => a.ConfirmedBinId)
            .OnDelete(DeleteBehavior.SetNull);

        modelBuilder.Entity<ParcelSortingAssignment>()
            .HasOne(a => a.Parcel)
            .WithMany()
            .HasForeignKey(a => a.ParcelId)
            .OnDelete(DeleteBehavior.Cascade);

        modelBuilder.Entity<LostParcelCase>()
           .HasOne(c => c.InsuranceClaim)
           .WithMany()
           .HasForeignKey(c => c.InsuranceClaimId)
           .OnDelete(DeleteBehavior.SetNull);


        // Global query filters – soft delete
        modelBuilder.Entity<User>().HasQueryFilter(e => !e.IsDeleted);
        modelBuilder.Entity<Parcel>().HasQueryFilter(e => !e.IsDeleted);
        modelBuilder.Entity<Delivery>().HasQueryFilter(e => !e.IsDeleted);
        modelBuilder.Entity<Vehicle>().HasQueryFilter(e => !e.IsDeleted);
        modelBuilder.Entity<Invoice>().HasQueryFilter(e => !e.IsDeleted);
        modelBuilder.Entity<InsuranceClaim>().HasQueryFilter(e => !e.IsDeleted);
        modelBuilder.Entity<LostParcelCase>().HasQueryFilter(e => !e.IsDeleted);
        modelBuilder.Entity<ReturnRequest>().HasQueryFilter(e => !e.IsDeleted);


       
        // Precision overrides for money columns (MySQL DECIMAL)
        foreach (var property in modelBuilder.Model.GetEntityTypes()
            .SelectMany(t => t.GetProperties())
            .Where(p => p.ClrType == typeof(decimal) || p.ClrType == typeof(decimal?)))
        {
            property.SetColumnType("decimal(18,2)");
        }
    }

    /// <summary>
    /// Override SaveChanges to auto-stamp UpdatedAt on every modified BaseEntity.
    /// </summary>
    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
    {
        var entries = ChangeTracker.Entries<BaseEntity>()
            .Where(e => e.State == EntityState.Modified);

        foreach (var entry in entries)
            entry.Entity.UpdatedAt = DateTime.UtcNow;

        return base.SaveChangesAsync(cancellationToken);
    }
}
