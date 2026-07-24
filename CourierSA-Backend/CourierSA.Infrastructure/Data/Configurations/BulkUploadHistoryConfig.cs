using CourierSA.Application.Interfaces.Repositories;
using CourierSA.Domain.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace CourierSA.Infrastructure.Data.Configurations
{
    public class BulkUploadHistoryConfiguration : IEntityTypeConfiguration<BulkUploadHistory>
    {
        public void Configure(EntityTypeBuilder<BulkUploadHistory> builder)
        {
            builder.ToTable("BulkUploadHistories");
            builder.HasKey(b => b.Id);
            builder.Property(b => b.Id).HasColumnType("char(36)");
            builder.Property(b => b.UserId).HasColumnType("char(36)");

            builder.Property(b => b.UploadId).IsRequired().HasMaxLength(20);
            builder.Property(b => b.FileName).IsRequired().HasMaxLength(260);
            builder.Property(b => b.RowResultsJson).HasColumnType("longtext");

            builder.HasIndex(b => b.UserId);
            builder.HasIndex(b => b.ProcessedAt);

            builder.HasOne(b => b.User)
                   .WithMany()
                   .HasForeignKey(b => b.UserId)
                   .OnDelete(DeleteBehavior.Cascade);
        }
    }
}

namespace CourierSA.Infrastructure.Data.Repositories
{

    public class BulkUploadHistoryRepository
        : Repository<BulkUploadHistory>, IBulkUploadHistoryRepository
    {
        public BulkUploadHistoryRepository(ApplicationDbContext context) : base(context) { }

        public async Task<IEnumerable<BulkUploadHistory>> GetByUserAsync(
            Guid userId, int limit = 20, CancellationToken ct = default)
            => await _dbSet
                .AsNoTracking()
                .Where(b => b.UserId == userId)
                .OrderByDescending(b => b.ProcessedAt)
                .Take(limit)
                .ToListAsync(ct);
    }
}
