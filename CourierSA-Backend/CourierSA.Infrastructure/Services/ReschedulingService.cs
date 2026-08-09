using CourierSA.Application.DTOs.Rescheduling;
using CourierSA.Application.Interfaces.Repositories;
using CourierSA.Application.Interfaces.Services;
using CourierSA.Domain.Entities;
using CourierSA.Domain.Enums;
using CourierSA.Domain.Exceptions;
using Microsoft.EntityFrameworkCore;

namespace CourierSA.Infrastructure.Services;

public class ReschedulingService : IReschedulingService
{
    // SRS specifies "short-notice" penalty without numbers — these are documented,
    // trivially adjustable assumptions, not SRS-mandated values.
    private const int FreeWindowHours = 24;
    private const decimal ShortNoticeFeeZAR = 50m;

    private readonly IUnitOfWork _uow;
    private readonly IAuditService _audit;

    public ReschedulingService(IUnitOfWork uow, IAuditService audit)
    {
        _uow = uow;
        _audit = audit;
    }

    public async Task<RescheduleQuoteDto> PreviewFeeAsync(
        Guid parcelId, DateTime proposedDate, Guid customerUserId, CancellationToken ct = default)
    {
        var parcel = await GetOwnedRescheduleEligibleParcelAsync(parcelId, customerUserId, ct);

        var (isFeeApplicable, fee, reason) = EvaluateFee(parcel, proposedDate);

        return new RescheduleQuoteDto(
            parcel.ScheduledPickupDate ?? parcel.CreatedAt, proposedDate, isFeeApplicable, fee, reason);
    }

    public async Task<RescheduleResultDto> RescheduleAsync(
        Guid parcelId, RescheduleCollectionDto dto, Guid customerUserId, CancellationToken ct = default)
    {
        var parcel = await GetOwnedRescheduleEligibleParcelAsync(parcelId, customerUserId, ct);
        var customer = await _uow.Query<CustomerProfile>().GetByIdAsync(parcel.CustomerId, ct)
            ?? throw new NotFoundException("Customer profile not found.");

        var (isFeeApplicable, fee, reason) = EvaluateFee(parcel, dto.NewScheduledPickupDate);

        var previousDate = parcel.ScheduledPickupDate;
        if (parcel.OriginalScheduledPickupDate is null)
            parcel.OriginalScheduledPickupDate = previousDate;

        parcel.ScheduledPickupDate = dto.NewScheduledPickupDate;
        parcel.RescheduleCount += 1;
        parcel.UpdatedAt = DateTime.UtcNow;

        string chargeMethod = "None";

        if (isFeeApplicable)
        {
            parcel.LastRescheduleFeeZAR = fee;

            if (customer.WalletBalanceZAR >= fee)
            {
                customer.WalletBalanceZAR -= fee;
                customer.UpdatedAt = DateTime.UtcNow;

                var walletTx = new WalletTransaction
                {
                    Id = Guid.NewGuid(),
                    UserId = customer.UserId,
                    Type = WalletTransactionType.Debit,
                    AmountZAR = fee,
                    BalanceAfterZAR = customer.WalletBalanceZAR,
                    ReferenceId = parcel.Id,
                    ReferenceType = "Parcel",
                    Description = $"Short-notice rescheduling fee for {parcel.TrackingNumber}",
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };
                await _uow.Query<WalletTransaction>().AddAsync(walletTx, ct);
                chargeMethod = "Wallet";
            }
            else
            {
                var feeInvoice = new Invoice
                {
                    Id = Guid.NewGuid(),
                    CustomerId = customer.Id,
                    ParcelId = parcel.Id,
                    InvoiceNumber = $"INV-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString()[..6].ToUpper()}",
                    Status = InvoiceStatus.Issued,
                    SubtotalZAR = fee,
                    VatZAR = 0,
                    TotalZAR = fee,
                    PaidAmountZAR = 0,
                    DueDate = DateTime.UtcNow.AddDays(7),
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                };
                feeInvoice.LineItems.Add(new InvoiceLineItem
                {
                    Id = Guid.NewGuid(),
                    Description = $"Short-notice rescheduling fee — {parcel.TrackingNumber}",
                    Quantity = 1,
                    UnitPrice = fee,
                    CreatedAt = DateTime.UtcNow,
                    UpdatedAt = DateTime.UtcNow
                });
                await _uow.Query<Invoice>().AddAsync(feeInvoice, ct);
                chargeMethod = "Invoiced";
            }
        }

        var trackingEvent = new TrackingEvent
        {
            Id = Guid.NewGuid(),
            ParcelId = parcel.Id,
            EventType = TrackingEventType.CollectionRescheduled,
            Description = isFeeApplicable
                ? $"Collection rescheduled to {dto.NewScheduledPickupDate:yyyy-MM-dd HH:mm}. Short-notice fee of R{fee:0.00} applied ({chargeMethod})."
                : $"Collection rescheduled to {dto.NewScheduledPickupDate:yyyy-MM-dd HH:mm}. No fee (outside short-notice window).",
            OccurredAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        await _uow.TrackingEvents.AddAsync(trackingEvent, ct);
        await _uow.SaveChangesAsync(ct);

        await _audit.LogAsync("PARCEL_COLLECTION_RESCHEDULED", "Parcel", parcel.Id,
            new { PreviousDate = previousDate }, new { NewDate = dto.NewScheduledPickupDate, isFeeApplicable, fee }, customerUserId, null, ct);

        return new RescheduleResultDto(parcel.Id, parcel.TrackingNumber, dto.NewScheduledPickupDate, isFeeApplicable, fee, chargeMethod);
    }

    private static (bool isFeeApplicable, decimal fee, string reason) EvaluateFee(Parcel parcel, DateTime proposedDate)
    {
        if (proposedDate <= DateTime.UtcNow)
            throw new BadRequestException("The new collection date/time must be in the future.");

        var referenceDate = parcel.ScheduledPickupDate ?? parcel.CreatedAt;
        var hoursUntilOriginalSlot = (referenceDate - DateTime.UtcNow).TotalHours;

        if (hoursUntilOriginalSlot < FreeWindowHours)
            return (true, ShortNoticeFeeZAR, $"Requested less than {FreeWindowHours} hours before the current scheduled slot.");

        return (false, 0m, $"Requested {FreeWindowHours}+ hours ahead of the current scheduled slot — no fee.");
    }

    private async Task<Parcel> GetOwnedRescheduleEligibleParcelAsync(Guid parcelId, Guid customerUserId, CancellationToken ct)
    {
        var customer = await _uow.Query<CustomerProfile>().Query()
            .FirstOrDefaultAsync(c => c.UserId == customerUserId, ct)
            ?? throw new NotFoundException("Customer profile not found.");

        var parcel = await _uow.Parcels.GetByIdAsync(parcelId, ct)
            ?? throw new NotFoundException($"Parcel {parcelId} not found.");

        if (parcel.CustomerId != customer.Id)
            throw new ForbiddenException("This parcel does not belong to you.");

        if (parcel.Status != ParcelStatus.PendingApproval && parcel.Status != ParcelStatus.Approved)
            throw new BadRequestException($"This parcel can no longer be rescheduled (current status: '{parcel.Status}').");

        return parcel;
    }
}
