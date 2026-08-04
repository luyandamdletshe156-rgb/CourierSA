using CourierSA.Application.Interfaces.Repositories;
using CourierSA.Domain.Entities;
using CourierSA.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using System.Linq.Expressions;

namespace CourierSA.Infrastructure.Data.Repositories;

// ── Generic Base Repository ───────────────────────────────────────────────────
public class Repository<T> : IRepository<T> where T : BaseEntity
{
    protected readonly ApplicationDbContext _context;
    protected readonly DbSet<T> _dbSet;

    public Repository(ApplicationDbContext context)
    {
        _context = context;
        _dbSet = context.Set<T>();
    }

    public async Task<T?> GetByIdAsync(Guid id, CancellationToken ct = default)
        => await _dbSet.FindAsync(new object[] { id }, ct);

    public async Task<IEnumerable<T>> GetAllAsync(CancellationToken ct = default)
        => await _dbSet.AsNoTracking().ToListAsync(ct);

    public async Task<IEnumerable<T>> FindAsync(
        Expression<Func<T, bool>> predicate, CancellationToken ct = default)
        => await _dbSet.AsNoTracking().Where(predicate).ToListAsync(ct);

    public async Task<T?> FirstOrDefaultAsync(
        Expression<Func<T, bool>> predicate, CancellationToken ct = default)
        => await _dbSet.AsNoTracking().FirstOrDefaultAsync(predicate, ct);

    public async Task<bool> ExistsAsync(
        Expression<Func<T, bool>> predicate, CancellationToken ct = default)
        => await _dbSet.AnyAsync(predicate, ct);

    public async Task<int> CountAsync(
        Expression<Func<T, bool>>? predicate = null, CancellationToken ct = default)
        => predicate is null
            ? await _dbSet.CountAsync(ct)
            : await _dbSet.CountAsync(predicate, ct);

    public async Task AddAsync(T entity, CancellationToken ct = default)
        => await _dbSet.AddAsync(entity, ct);

    public async Task AddRangeAsync(IEnumerable<T> entities, CancellationToken ct = default)
        => await _dbSet.AddRangeAsync(entities, ct);

    public void Update(T entity)
        => _dbSet.Update(entity);

    public void Remove(T entity)
    {
        // Honour soft-delete when entity supports it
        entity.IsDeleted = true;
        entity.DeletedAt = DateTime.UtcNow;
        _dbSet.Update(entity);
    }

    public void HardDelete(T entity)
        => _dbSet.Remove(entity);

    public IQueryable<T> Query()
        => _dbSet.AsQueryable();

    public IQueryable<T> QueryNoTracking()
        => _dbSet.AsNoTracking();
}

// ── Unit Of Work ──────────────────────────────────────────────────────────────
public class UnitOfWork : IUnitOfWork
{
    private readonly ApplicationDbContext _context;

    public UnitOfWork(ApplicationDbContext context)
    {
        _context = context;
        Parcels = new ParcelRepository(context);
        Users = new UserRepository(context);
        Deliveries = new DeliveryRepository(context);
        TrackingEvents = new Repository<TrackingEvent>(context);
        Quotes = new Repository<Quote>(context);
        Vehicles = new Repository<Vehicle>(context);
        VehicleInspections = new Repository<VehicleInspection>(context);
        WalletTransactions = new Repository<WalletTransaction>(context);
        Invoices = new InvoiceRepository(context);
        InsuranceClaims = new Repository<InsuranceClaim>(context);
        Notifications = new Repository<Notification>(context);
        AuditLogs = new AuditLogRepository(context);
        BulkUploadHistories = new BulkUploadHistoryRepository(context);
    }

    public IParcelRepository Parcels { get; }
    public IUserRepository Users { get; }
    public IDeliveryRepository Deliveries { get; }
    public IRepository<TrackingEvent> TrackingEvents { get; }
    public IRepository<Quote> Quotes { get; }
    public IRepository<Vehicle> Vehicles { get; }
    public IRepository<VehicleInspection> VehicleInspections { get; }
    public IRepository<WalletTransaction> WalletTransactions { get; }
    public IInvoiceRepository Invoices { get; }
    public IRepository<InsuranceClaim> InsuranceClaims { get; }
    public IRepository<Notification> Notifications { get; }
    public IAuditLogRepository AuditLogs { get; }
    public IBulkUploadHistoryRepository BulkUploadHistories { get; }

    /// <summary>Generic repository accessor — used by services that need entities
    /// not exposed as dedicated properties (e.g. CustomerProfile, DriverProfile).</summary>
    public IRepository<T> Query<T>() where T : BaseEntity
        => new Repository<T>(_context);

    /// <summary>
    /// Wraps SaveChanges in the DbContext's execution strategy so that EnableRetryOnFailure
    /// (configured for Azure MySQL) retries the whole operation atomically, rather than
    /// potentially re-issuing a command that already succeeded — which was surfacing as
    /// false DbUpdateConcurrencyExceptions ("expected 1 row, affected 0 rows").
    /// </summary>
    public async Task<int> SaveChangesAsync(CancellationToken ct = default)
    {
        var strategy = _context.Database.CreateExecutionStrategy();
        return await strategy.ExecuteAsync(async () => await _context.SaveChangesAsync(ct));
    }

    public async Task BeginTransactionAsync(CancellationToken ct = default)
        => await _context.Database.BeginTransactionAsync(ct);

    public async Task CommitTransactionAsync(CancellationToken ct = default)
        => await _context.Database.CommitTransactionAsync(ct);

    public async Task RollbackTransactionAsync(CancellationToken ct = default)
        => await _context.Database.RollbackTransactionAsync(ct);

    public void Dispose() => _context.Dispose();
}

// ── Parcel Repository ─────────────────────────────────────────────────────────
public class ParcelRepository : Repository<Parcel>, IParcelRepository
{
    public ParcelRepository(ApplicationDbContext context) : base(context) { }

    public async Task<Parcel?> GetByTrackingNumberAsync(
        string trackingNumber, CancellationToken ct = default)
        => await _dbSet
            .Include(p => p.PickupAddress)
            .Include(p => p.DeliveryAddress)
            .Include(p => p.TrackingEvents.OrderByDescending(t => t.OccurredAt))
            .FirstOrDefaultAsync(p => p.TrackingNumber == trackingNumber, ct);

    public async Task<Parcel?> GetWithFullDetailsAsync(
         Guid id, CancellationToken ct = default)
         => await _dbSet
             .Include(p => p.Customer).ThenInclude(c => c!.User)
             .Include(p => p.PickupAddress)
             .Include(p => p.DeliveryAddress)
             .Include(p => p.TrackingEvents.OrderByDescending(t => t.OccurredAt))
             .Include(p => p.Deliveries).ThenInclude(d => d.Driver).ThenInclude(dr => dr!.User)
             .FirstOrDefaultAsync(p => p.Id == id, ct);
    public async Task<IEnumerable<Parcel>> GetByCustomerAsync(
        Guid customerId, int page, int pageSize, CancellationToken ct = default)
        => await _dbSet
            .AsNoTracking()
            .Where(p => p.CustomerId == customerId)
            .OrderByDescending(p => p.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Include(p => p.PickupAddress)
            .Include(p => p.DeliveryAddress)
            .ToListAsync(ct);

    public async Task<IEnumerable<Parcel>> GetPendingDispatchAsync(CancellationToken ct = default)
        => await _dbSet
            .AsNoTracking()
            .Where(p => p.Status == ParcelStatus.Approved)
            .OrderBy(p => p.CreatedAt)
            .Include(p => p.DeliveryAddress)
            .ToListAsync(ct);

    public async Task<string> GenerateTrackingNumberAsync()
    {
        // Format: CSA-YYYYMMDD-XXXXX (e.g. CSA-20240615-00423)
        var prefix = $"CSA-{DateTime.UtcNow:yyyyMMdd}-";
        var lastToday = await _dbSet
            .Where(p => p.TrackingNumber.StartsWith(prefix))
            .OrderByDescending(p => p.TrackingNumber)
            .Select(p => p.TrackingNumber)
            .FirstOrDefaultAsync();

        int seq = 1;
        if (lastToday is not null)
        {
            var seqStr = lastToday[(prefix.Length)..];
            if (int.TryParse(seqStr, out int prev)) seq = prev + 1;
        }
        return $"{prefix}{seq:D5}";
    }
}

// ── User Repository ───────────────────────────────────────────────────────────
public class UserRepository : Repository<User>, IUserRepository
{
    public UserRepository(ApplicationDbContext context) : base(context) { }

    public async Task<User?> GetByEmailAsync(string email, CancellationToken ct = default)
        => await _dbSet.FirstOrDefaultAsync(u => u.Email == email.ToLowerInvariant(), ct);

    public async Task<User?> GetWithProfileAsync(Guid id, CancellationToken ct = default)
        => await _dbSet
            .Include(u => u.CustomerProfile)
            .Include(u => u.DriverProfile)
            .FirstOrDefaultAsync(u => u.Id == id, ct);

    public async Task<bool> EmailExistsAsync(string email, CancellationToken ct = default)
        => await _dbSet.AnyAsync(u => u.Email == email.ToLowerInvariant(), ct);

    public async Task<IEnumerable<User>> GetByRoleAsync(
        UserRole role, CancellationToken ct = default)
        => await _dbSet
            .AsNoTracking()
            .Where(u => u.Role == role)
            .ToListAsync(ct);
}

// ── Delivery Repository ───────────────────────────────────────────────────────
public class DeliveryRepository : Repository<Delivery>, IDeliveryRepository
{
    public DeliveryRepository(ApplicationDbContext context) : base(context) { }

    public async Task<IEnumerable<Delivery>> GetDriverActiveDeliveriesAsync(
        Guid driverId, CancellationToken ct = default)
        => await _dbSet
            .AsNoTracking()
            .Where(d => d.DriverId == driverId &&
                        d.Status != DeliveryStatus.Delivered &&
                        d.Status != DeliveryStatus.Failed)
            .Include(d => d.Parcel)
                .ThenInclude(p => p!.DeliveryAddress)
            .OrderBy(d => d.CreatedAt)
            .ToListAsync(ct);

    public async Task<IEnumerable<Delivery>> GetFailedDeliveriesAsync(
        CancellationToken ct = default)
        => await _dbSet
            .AsNoTracking()
            .Where(d => d.Status == DeliveryStatus.Failed)
            .Include(d => d.Parcel)
            .Include(d => d.Driver).ThenInclude(dr => dr!.User)
            .ToListAsync(ct);
}

// ── Invoice Repository ────────────────────────────────────────────────────────
public class InvoiceRepository : Repository<Invoice>, IInvoiceRepository
{
    public InvoiceRepository(ApplicationDbContext context) : base(context) { }

    public async Task<Invoice?> GetByInvoiceNumberAsync(
        string invoiceNumber, CancellationToken ct = default)
        => await _dbSet
            .Include(i => i.LineItems)
            .FirstOrDefaultAsync(i => i.InvoiceNumber == invoiceNumber, ct);

    public async Task<string> GenerateInvoiceNumberAsync()
    {
        var prefix = $"INV-{DateTime.UtcNow:yyyyMM}-";
        var last = await _dbSet
            .Where(i => i.InvoiceNumber.StartsWith(prefix))
            .OrderByDescending(i => i.InvoiceNumber)
            .Select(i => i.InvoiceNumber)
            .FirstOrDefaultAsync();

        int seq = 1;
        if (last is not null)
        {
            var seqStr = last[(prefix.Length)..];
            if (int.TryParse(seqStr, out int prev)) seq = prev + 1;
        }
        return $"{prefix}{seq:D4}";
    }
}

// ── Audit Log Repository ──────────────────────────────────────────────────────
public class AuditLogRepository : Repository<AuditLog>, IAuditLogRepository
{
    public AuditLogRepository(ApplicationDbContext context) : base(context) { }

    public async Task<IEnumerable<AuditLog>> GetEntityHistoryAsync(
        string entityType, Guid entityId, CancellationToken ct = default)
        => await _dbSet
            .AsNoTracking()
            .Where(a => a.EntityType == entityType && a.EntityId == entityId)
            .OrderByDescending(a => a.CreatedAt)
            .Include(a => a.User)
            .ToListAsync(ct);
}
