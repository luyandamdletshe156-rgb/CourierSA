using CourierSA.Application.DTOs.Quotes;
using CourierSA.Application.DTOs.Upgrades;
using CourierSA.Application.Interfaces.Repositories;
using CourierSA.Application.Interfaces.Services;
using CourierSA.Domain.Entities;
using CourierSA.Domain.Enums;
using CourierSA.Domain.Exceptions;
using Microsoft.EntityFrameworkCore;

namespace CourierSA.Infrastructure.Services;

/// <summary>
/// Request Priority Upgrade / Review Priority Upgrade.
/// Priority is the service level chosen at booking (Parcel.ServiceType). It only
/// changes here: the customer requests a faster level with a reason, the
/// dispatcher approves or rejects it, and on approval the customer pays the
/// fee difference from their wallet, after which the parcel is upgraded.
/// </summary>
public class PriorityUpgradeService : IPriorityUpgradeService
{
    // Statuses in which the service level can still change (before the parcel leaves the depot).
    private static readonly ParcelStatus[] UpgradableStatuses =
    [
        ParcelStatus.PendingApproval, ParcelStatus.Approved, ParcelStatus.InWarehouse,
        ParcelStatus.AwaitingCheckIn, ParcelStatus.CheckedOut
    ];

    private readonly IUnitOfWork _uow;
    private readonly IQuoteService _quotes;
    private readonly INotificationService _notifications;
    private readonly IAuditService _audit;

    public PriorityUpgradeService(
        IUnitOfWork uow, IQuoteService quotes, INotificationService notifications, IAuditService audit)
    {
        _uow = uow; _quotes = quotes; _notifications = notifications; _audit = audit;
    }

    public async Task<UpgradeRequestDto> RequestAsync(
        Guid parcelId, CreateUpgradeRequestDto dto, Guid customerUserId, CancellationToken ct = default)
    {
        var customer = await GetCustomerAsync(customerUserId, ct);
        var parcel = await _uow.Query<Parcel>().Query()
            .Include(p => p.PickupAddress).Include(p => p.DeliveryAddress)
            .FirstOrDefaultAsync(p => p.Id == parcelId, ct)
            ?? throw new NotFoundException("Parcel not found.");

        if (parcel.CustomerId != customer.Id)
            throw new ForbiddenException("You can only request an upgrade for your own parcels.");
        if (!UpgradableStatuses.Contains(parcel.Status))
            throw new BadRequestException($"A parcel with status {parcel.Status} can no longer be upgraded.");
        if (dto.RequestedServiceType <= parcel.ServiceType)
            throw new BadRequestException("The requested service level must be faster than the current one.");
        if (string.IsNullOrWhiteSpace(dto.Reason))
            throw new BadRequestException("Please give a reason for the upgrade.");

        var hasOpen = await _uow.Query<PriorityUpgradeRequest>().Query()
            .AnyAsync(r => r.ParcelId == parcelId &&
                (r.Status == UpgradeRequestStatus.Pending || r.Status == UpgradeRequestStatus.Approved), ct);
        if (hasOpen)
            throw new ConflictException("This parcel already has an open upgrade request.");

        var fee = await CalculateFeeAsync(parcel, dto.RequestedServiceType, ct);

        var request = new PriorityUpgradeRequest
        {
            Id = Guid.NewGuid(),
            ParcelId = parcel.Id,
            CustomerId = customer.Id,
            CurrentServiceType = parcel.ServiceType,
            RequestedServiceType = dto.RequestedServiceType,
            Reason = dto.Reason.Trim(),
            FeeZAR = fee,
            Status = UpgradeRequestStatus.Pending,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        await _uow.Query<PriorityUpgradeRequest>().AddAsync(request, ct);
        await _uow.SaveChangesAsync(ct);

        await _audit.LogAsync("UPGRADE_REQUESTED", "PriorityUpgradeRequest", request.Id,
            null, new { parcel.TrackingNumber, From = parcel.ServiceType.ToString(), To = dto.RequestedServiceType.ToString(), fee },
            customerUserId, null, ct);

        return ToDto(request, parcel);
    }

    public async Task<IEnumerable<UpgradeRequestDto>> GetMineAsync(Guid customerUserId, CancellationToken ct = default)
    {
        var customer = await GetCustomerAsync(customerUserId, ct);
        var items = await _uow.Query<PriorityUpgradeRequest>().Query().AsNoTracking()
            .Include(r => r.Parcel).ThenInclude(p => p!.DeliveryAddress)
            .Where(r => r.CustomerId == customer.Id)
            .OrderByDescending(r => r.CreatedAt).ToListAsync(ct);
        return items.Select(r => ToDto(r, r.Parcel!));
    }

    public async Task<IEnumerable<UpgradeRequestDto>> GetPendingAsync(CancellationToken ct = default)
    {
        var items = await _uow.Query<PriorityUpgradeRequest>().Query().AsNoTracking()
            .Include(r => r.Parcel).ThenInclude(p => p!.DeliveryAddress)
            .Where(r => r.Status == UpgradeRequestStatus.Pending)
            .OrderBy(r => r.CreatedAt).ToListAsync(ct);
        return items.Select(r => ToDto(r, r.Parcel!));
    }

    public async Task<UpgradeRequestDto> ReviewAsync(
        Guid requestId, ReviewUpgradeRequestDto dto, Guid dispatcherUserId, CancellationToken ct = default)
    {
        var request = await LoadAsync(requestId, ct);
        if (request.Status != UpgradeRequestStatus.Pending)
            throw new BadRequestException($"This request has already been {request.Status.ToString().ToLower()}.");
        if (!dto.Approve && string.IsNullOrWhiteSpace(dto.Notes))
            throw new BadRequestException("Please give a reason when rejecting an upgrade.");

        var parcel = request.Parcel!;
        if (dto.Approve && !UpgradableStatuses.Contains(parcel.Status))
            throw new BadRequestException($"Parcel is now {parcel.Status} and can no longer be upgraded.");

        request.Status = dto.Approve ? UpgradeRequestStatus.Approved : UpgradeRequestStatus.Rejected;
        request.DispatcherNotes = dto.Notes;
        request.ReviewedAt = DateTime.UtcNow;
        request.ReviewedByUserId = dispatcherUserId;
        request.UpdatedAt = DateTime.UtcNow;
        await _uow.SaveChangesAsync(ct);

        await _audit.LogAsync(dto.Approve ? "UPGRADE_APPROVED" : "UPGRADE_REJECTED", "PriorityUpgradeRequest", request.Id,
            null, new { parcel.TrackingNumber, request.FeeZAR, dto.Notes }, dispatcherUserId, null, ct);

        var customer = await _uow.Query<CustomerProfile>().GetByIdAsync(request.CustomerId, ct);
        if (customer is not null)
        {
            try
            {
                await _notifications.SendSystemAlertAsync(customer.UserId,
                    dto.Approve ? "Upgrade approved" : "Upgrade declined",
                    dto.Approve
                        ? $"Your upgrade to {request.RequestedServiceType} for {parcel.TrackingNumber} was approved. Pay R{request.FeeZAR:0.00} to confirm it."
                        : $"Your upgrade request for {parcel.TrackingNumber} was declined. Your parcel stays on {request.CurrentServiceType}. {dto.Notes}",
                    ct);
            }
            catch (Exception ex) { Console.WriteLine($"[NOTIFY] Upgrade notification failed: {ex.Message}"); }
        }
        return ToDto(request, parcel);
    }

    public async Task<UpgradeRequestDto> PayAsync(Guid requestId, Guid customerUserId, CancellationToken ct = default)
    {
        var customer = await GetCustomerAsync(customerUserId, ct);
        var request = await LoadAsync(requestId, ct);
        if (request.CustomerId != customer.Id)
            throw new ForbiddenException("This upgrade request belongs to another customer.");
        if (request.Status != UpgradeRequestStatus.Approved)
            throw new BadRequestException("Only an approved upgrade can be paid.");

        var parcel = request.Parcel!;
        if (!UpgradableStatuses.Contains(parcel.Status))
            throw new BadRequestException($"Parcel is now {parcel.Status} and can no longer be upgraded.");
        if (customer.WalletBalanceZAR < request.FeeZAR)
            throw new BadRequestException(
                $"Insufficient wallet balance. The upgrade costs R{request.FeeZAR:0.00}; your balance is R{customer.WalletBalanceZAR:0.00}.");

        customer.WalletBalanceZAR -= request.FeeZAR;
        customer.UpdatedAt = DateTime.UtcNow;
        await _uow.Query<WalletTransaction>().AddAsync(new WalletTransaction
        {
            Id = Guid.NewGuid(),
            UserId = customer.UserId,
            Type = WalletTransactionType.Debit,
            AmountZAR = request.FeeZAR,
            BalanceAfterZAR = customer.WalletBalanceZAR,
            ReferenceId = parcel.Id,
            ReferenceType = "PriorityUpgrade",
            Description = $"Upgrade of {parcel.TrackingNumber} from {request.CurrentServiceType} to {request.RequestedServiceType}",
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        }, ct);

        // The service level is the parcel's priority. Route planning orders by it.
        parcel.ServiceType = request.RequestedServiceType;
        parcel.QuoteAmountZAR = (parcel.QuoteAmountZAR ?? 0m) + request.FeeZAR;
        parcel.UpdatedAt = DateTime.UtcNow;

        request.Status = UpgradeRequestStatus.Paid;
        request.PaidAt = DateTime.UtcNow;
        request.UpdatedAt = DateTime.UtcNow;
        await _uow.SaveChangesAsync(ct);

        await _audit.LogAsync("UPGRADE_PAID", "PriorityUpgradeRequest", request.Id,
            new { From = request.CurrentServiceType.ToString() },
            new { To = request.RequestedServiceType.ToString(), request.FeeZAR }, customerUserId, null, ct);

        return ToDto(request, parcel);
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private async Task<CustomerProfile> GetCustomerAsync(Guid userId, CancellationToken ct)
        => await _uow.Query<CustomerProfile>().FirstOrDefaultAsync(c => c.UserId == userId, ct)
           ?? throw new NotFoundException("Customer profile not found.");

    private async Task<PriorityUpgradeRequest> LoadAsync(Guid id, CancellationToken ct)
        => await _uow.Query<PriorityUpgradeRequest>().Query()
               .Include(r => r.Parcel).ThenInclude(p => p!.DeliveryAddress)
               .FirstOrDefaultAsync(r => r.Id == id, ct)
           ?? throw new NotFoundException("Upgrade request not found.");

    /// <summary>Fee = quote at the new service level minus quote at the current level (never negative).</summary>
    private async Task<decimal> CalculateFeeAsync(Parcel parcel, ServiceType target, CancellationToken ct)
    {
        QuoteRequestDto Build(ServiceType t) => new(
            parcel.PickupAddress?.Province ?? default,
            parcel.DeliveryAddress?.Province ?? default,
            parcel.WeightKg, t, parcel.DeclaredValueZAR, parcel.InsuranceRequired,
            parcel.Dimensions is null ? null
                : new DimensionsDto(parcel.Dimensions.LengthCm, parcel.Dimensions.WidthCm, parcel.Dimensions.HeightCm));

        var current = await _quotes.CalculateAsync(Build(parcel.ServiceType), null, ct);
        var upgraded = await _quotes.CalculateAsync(Build(target), null, ct);
        return Math.Max(0m, Math.Round(upgraded.TotalAmountZAR - current.TotalAmountZAR, 2));
    }

    private static UpgradeRequestDto ToDto(PriorityUpgradeRequest r, Parcel p) => new(
        r.Id, r.ParcelId, p.TrackingNumber, r.Status.ToString(),
        r.CurrentServiceType.ToString(), r.RequestedServiceType.ToString(), r.Reason,
        r.FeeZAR, r.DispatcherNotes, p.DeliveryAddress?.City ?? "—", r.CreatedAt, r.ReviewedAt);
}
