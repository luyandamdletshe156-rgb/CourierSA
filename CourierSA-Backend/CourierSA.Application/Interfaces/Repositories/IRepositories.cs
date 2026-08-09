using CourierSA.Domain.Entities;
using CourierSA.Domain.Enums;
using System.Linq.Expressions;

namespace CourierSA.Application.Interfaces.Repositories;

// ── Generic repository ────────────────────────────────────────────────────────
public interface IRepository<T> where T : BaseEntity
{
    Task<T?>              GetByIdAsync(Guid id, CancellationToken ct = default);
    Task<IEnumerable<T>>  GetAllAsync(CancellationToken ct = default);
    Task<IEnumerable<T>>  FindAsync(Expression<Func<T, bool>> predicate, CancellationToken ct = default);
    Task<T?>              FirstOrDefaultAsync(Expression<Func<T, bool>> predicate, CancellationToken ct = default);
    Task<bool>            ExistsAsync(Expression<Func<T, bool>> predicate, CancellationToken ct = default);
    Task<int>             CountAsync(Expression<Func<T, bool>>? predicate = null, CancellationToken ct = default);
    Task                  AddAsync(T entity, CancellationToken ct = default);
    Task                  AddRangeAsync(IEnumerable<T> entities, CancellationToken ct = default);
    void                  Update(T entity);
    void                  Remove(T entity);
    void                  HardDelete(T entity);
    IQueryable<T>         Query();
    IQueryable<T>         QueryNoTracking();
}

// ── Specialised repositories ──────────────────────────────────────────────────
public interface IParcelRepository : IRepository<Parcel>
{
    Task<Parcel?>             GetByTrackingNumberAsync(string trackingNumber, CancellationToken ct = default);
    Task<Parcel?>             GetWithFullDetailsAsync(Guid id, CancellationToken ct = default);
    Task<IEnumerable<Parcel>> GetByCustomerAsync(Guid customerId, int page, int pageSize, CancellationToken ct = default);
    Task<IEnumerable<Parcel>> GetPendingDispatchAsync(CancellationToken ct = default);
    Task<string>              GenerateTrackingNumberAsync();
}

public interface IUserRepository : IRepository<User>
{
    Task<User?> GetByEmailAsync(string email, CancellationToken ct = default);
    Task<User?> GetWithProfileAsync(Guid id, CancellationToken ct = default);
    Task<bool>  EmailExistsAsync(string email, CancellationToken ct = default);
    Task<IEnumerable<User>> GetByRoleAsync(UserRole role, CancellationToken ct = default);
}

public interface IDeliveryRepository : IRepository<Delivery>
{
    Task<IEnumerable<Delivery>> GetDriverActiveDeliveriesAsync(Guid driverId, CancellationToken ct = default);
    Task<IEnumerable<Delivery>> GetFailedDeliveriesAsync(CancellationToken ct = default);
}

public interface IInvoiceRepository : IRepository<Invoice>
{
    Task<Invoice?> GetByInvoiceNumberAsync(string invoiceNumber, CancellationToken ct = default);
    Task<string>   GenerateInvoiceNumberAsync();
}

public interface IAuditLogRepository : IRepository<AuditLog>
{
    Task<IEnumerable<AuditLog>> GetEntityHistoryAsync(string entityType, Guid entityId, CancellationToken ct = default);
}

public interface IBulkUploadHistoryRepository : IRepository<BulkUploadHistory>
{
    Task<IEnumerable<BulkUploadHistory>> GetByUserAsync(Guid userId, int limit = 20, CancellationToken ct = default);
}

// ── Unit of Work ──────────────────────────────────────────────────────────────
public interface IUnitOfWork : IDisposable
{
    IParcelRepository Parcels { get; }
    IUserRepository Users { get; }
    IDeliveryRepository Deliveries { get; }
    IRepository<TrackingEvent> TrackingEvents { get; }
    IRepository<Quote> Quotes { get; }
    IRepository<Vehicle> Vehicles { get; }
    IRepository<VehicleInspection> VehicleInspections { get; }
    IRepository<WalletTransaction> WalletTransactions { get; }
    IInvoiceRepository Invoices { get; }
    IRepository<InsuranceClaim> InsuranceClaims { get; }
    IRepository<Notification> Notifications { get; }
    IAuditLogRepository AuditLogs { get; }
    IBulkUploadHistoryRepository BulkUploadHistories { get; }

    // Generic access for services that need arbitrary entity types
    IRepository<T> Query<T>() where T : BaseEntity;

    Task<int> SaveChangesAsync(CancellationToken ct = default);
    Task BeginTransactionAsync(CancellationToken ct = default);
    Task CommitTransactionAsync(CancellationToken ct = default);
    Task RollbackTransactionAsync(CancellationToken ct = default);
    Task ExecuteInTransactionAsync(Func<CancellationToken, Task> operation, CancellationToken ct = default);
    Task<int> SaveChangesRawAsync(CancellationToken ct = default);
}