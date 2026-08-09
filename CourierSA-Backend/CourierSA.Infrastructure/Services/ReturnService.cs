using CourierSA.Application.DTOs.Parcels;
using CourierSA.Application.DTOs.Returns;
using CourierSA.Application.Interfaces.Repositories;
using CourierSA.Application.Interfaces.Services;
using CourierSA.Domain.Entities;
using CourierSA.Domain.Enums;
using CourierSA.Domain.Exceptions;
using Microsoft.EntityFrameworkCore;

namespace CourierSA.Infrastructure.Services;

public class ReturnService : IReturnService
{
    private const int ReturnWindowDays = 14;   // business rule — SRS specifies "return window policy" without a number

    private readonly IUnitOfWork _uow;
    private readonly IAuditService _audit;

    public ReturnService(IUnitOfWork uow, IAuditService audit)
    {
        _uow = uow;
        _audit = audit;
    }

    public async Task<ReturnRequestDto> RequestReturnAsync(
        RequestReturnDto dto, Guid customerUserId, CancellationToken ct = default)
    {
        var customer = await _uow.Query<CustomerProfile>().Query()
            .FirstOrDefaultAsync(c => c.UserId == customerUserId, ct)
            ?? throw new NotFoundException("Customer profile not found.");

        var parcel = await _uow.Parcels.GetByTrackingNumberAsync(dto.TrackingNumber, ct)
            ?? throw new NotFoundException($"Parcel {dto.TrackingNumber} not found.");

        if (parcel.CustomerId != customer.Id)
            throw new ForbiddenException("This parcel does not belong to you.");

        if (parcel.Status != ParcelStatus.Delivered)
            throw new BadRequestException($"Only delivered parcels can be returned (current status: '{parcel.Status}').");

        var hasOpenReturn = await _uow.Query<ReturnRequest>().Query()
            .AnyAsync(r => r.ParcelId == parcel.Id &&
                           r.Status != ReturnRequestStatus.InspectionFailed &&
                           r.Status != ReturnRequestStatus.Closed, ct);
        if (hasOpenReturn)
            throw new BadRequestException("An active return request already exists for this parcel.");

        var deliveredAt = await _uow.Deliveries.Query()
            .Where(d => d.ParcelId == parcel.Id && d.Status == DeliveryStatus.Delivered && d.DeliveredAt != null)
            .OrderByDescending(d => d.DeliveredAt)
            .Select(d => d.DeliveredAt)
            .FirstOrDefaultAsync(ct);

        if (deliveredAt is null || (DateTime.UtcNow - deliveredAt.Value).TotalDays > ReturnWindowDays)
            throw new BadRequestException(
                $"Return window has expired. Returns must be requested within {ReturnWindowDays} days of delivery.");

        var collectionAddress = MapAddress(dto.CollectionAddress);
        await _uow.Query<ParcelAddress>().AddAsync(collectionAddress, ct);

        var returnRequest = new ReturnRequest
        {
            Id = Guid.NewGuid(),
            ParcelId = parcel.Id,
            CustomerId = customer.Id,
            RaNumber = $"RA-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString()[..6].ToUpper()}",
            Status = ReturnRequestStatus.Approved,
            Reason = dto.Reason,
            CollectionAddressId = collectionAddress.Id,
            RequestedAt = DateTime.UtcNow,
            ApprovedAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        await _uow.Query<ReturnRequest>().AddAsync(returnRequest, ct);

        var trackingEvent = new TrackingEvent
        {
            Id = Guid.NewGuid(),
            ParcelId = parcel.Id,
            EventType = TrackingEventType.ReturnInitiated,
            Description = $"Return authorized. RA: {returnRequest.RaNumber}. Reason: {dto.Reason}",
            OccurredAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        await _uow.TrackingEvents.AddAsync(trackingEvent, ct);
        await _uow.SaveChangesAsync(ct);

        try
        {
            await _audit.LogAsync("RETURN_REQUESTED", "ReturnRequest", returnRequest.Id,
                null, new { returnRequest.RaNumber, parcel.TrackingNumber, dto.Reason }, customerUserId, null, ct);
        }
        catch (Exception ex) { Console.WriteLine($"[AUDIT] RequestReturnAsync log failed: {ex.Message}"); }

        return await MapToDtoAsync(returnRequest, parcel.TrackingNumber, ct);
    }

    public async Task<ReturnRequestDto> ReceiveAsync(Guid returnId, Guid staffUserId, CancellationToken ct = default)
    {
        var returnRequest = await GetOrThrowAsync(returnId, ct);
        if (returnRequest.Status != ReturnRequestStatus.Approved)
            throw new BadRequestException($"Return must be 'Approved' to receive (currently '{returnRequest.Status}').");

        var parcel = await _uow.Parcels.GetByIdAsync(returnRequest.ParcelId, ct)
            ?? throw new NotFoundException("Linked parcel not found.");

        returnRequest.Status = ReturnRequestStatus.Received;
        returnRequest.ReceivedAt = DateTime.UtcNow;
        returnRequest.ReceivedByStaffId = staffUserId;
        returnRequest.UpdatedAt = DateTime.UtcNow;

        var trackingEvent = new TrackingEvent
        {
            Id = Guid.NewGuid(),
            ParcelId = parcel.Id,
            EventType = TrackingEventType.ReceivedAtWarehouse,
            Description = $"Returned parcel scanned in for inspection. RA: {returnRequest.RaNumber}",
            OccurredAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        await _uow.TrackingEvents.AddAsync(trackingEvent, ct);
        await _uow.SaveChangesAsync(ct);

        await _audit.LogAsync("RETURN_RECEIVED", "ReturnRequest", returnRequest.Id,
            null, new { returnRequest.RaNumber }, staffUserId, null, ct);

        return await MapToDtoAsync(returnRequest, parcel.TrackingNumber, ct);
    }

    public async Task<ReturnRequestDto> InspectAsync(
        Guid returnId, InspectReturnDto dto, Guid staffUserId, CancellationToken ct = default)
    {
        var returnRequest = await GetOrThrowAsync(returnId, ct);
        if (returnRequest.Status != ReturnRequestStatus.Received)
            throw new BadRequestException($"Return must be 'Received' before inspection (currently '{returnRequest.Status}').");

        var parcel = await _uow.Parcels.GetByIdAsync(returnRequest.ParcelId, ct)
            ?? throw new NotFoundException("Linked parcel not found.");

        returnRequest.InspectionResult = dto.Result;
        returnRequest.InspectionNotes = dto.Notes;
        returnRequest.UpdatedAt = DateTime.UtcNow;

        if (dto.Result == ReturnItemCondition.Acceptable)
        {
            returnRequest.Status = ReturnRequestStatus.ReadyForRefund;
        }
        else
        {
            returnRequest.Status = ReturnRequestStatus.InspectionFailed;
            var trackingEvent = new TrackingEvent
            {
                Id = Guid.NewGuid(),
                ParcelId = parcel.Id,
                EventType = TrackingEventType.ExceptionRaised,
                Description = $"Return inspection failed ({dto.Result}) for RA {returnRequest.RaNumber}." +
                              (string.IsNullOrWhiteSpace(dto.Notes) ? "" : $" {dto.Notes}"),
                OccurredAt = DateTime.UtcNow,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            await _uow.TrackingEvents.AddAsync(trackingEvent, ct);
        }
        await _uow.SaveChangesAsync(ct);

        await _audit.LogAsync("RETURN_INSPECTED", "ReturnRequest", returnRequest.Id,
            null, new { dto.Result, dto.Notes }, staffUserId, null, ct);

        return await MapToDtoAsync(returnRequest, parcel.TrackingNumber, ct);
    }

    public async Task<ReturnRequestDto> ReleaseRefundAsync(
        Guid returnId, ReleaseRefundDto dto, Guid staffUserId, CancellationToken ct = default)
    {
        var returnRequest = await GetOrThrowAsync(returnId, ct);
        if (returnRequest.Status != ReturnRequestStatus.ReadyForRefund)
            throw new BadRequestException($"Return must be 'ReadyForRefund' to release a refund (currently '{returnRequest.Status}').");

        var parcel = await _uow.Parcels.GetByIdAsync(returnRequest.ParcelId, ct)
            ?? throw new NotFoundException("Linked parcel not found.");

        var customer = await _uow.Query<CustomerProfile>().GetByIdAsync(parcel.CustomerId, ct)
            ?? throw new NotFoundException("Customer profile not found.");

        var refundAmount = parcel.QuoteAmountZAR ?? 0;

        if (parcel.PaymentMethod == PaymentMethod.Wallet)
        {
            customer.WalletBalanceZAR += refundAmount;
            customer.UpdatedAt = DateTime.UtcNow;

            var walletTx = new WalletTransaction
            {
                Id = Guid.NewGuid(),
                UserId = customer.UserId,
                Type = WalletTransactionType.Refund,
                AmountZAR = refundAmount,
                BalanceAfterZAR = customer.WalletBalanceZAR,
                ReferenceId = returnRequest.Id,
                ReferenceType = "ReturnRequest",
                Description = $"Refund for returned parcel {parcel.TrackingNumber} (RA: {returnRequest.RaNumber})",
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            await _uow.Query<WalletTransaction>().AddAsync(walletTx, ct);
            await VoidInvoiceAsync(parcel.Id, ct);
        }
        else
        {
            // No live payment gateway integration exists in this codebase (same constraint RejectAsync
            // operates under) — Card/EFT refunds are flagged for manual processing outside the system.
            await VoidInvoiceAsync(parcel.Id, ct);
            await _audit.LogAsync("MANUAL_REFUND_REQUIRED", "ReturnRequest", returnRequest.Id,
                null, new { parcel.TrackingNumber, Amount = refundAmount, parcel.PaymentMethod }, staffUserId, null, ct);
        }

        returnRequest.Status = ReturnRequestStatus.Refunded;
        returnRequest.RefundAmountZAR = refundAmount;
        returnRequest.RefundedAt = DateTime.UtcNow;
        returnRequest.RefundApprovedByStaffId = staffUserId;
        returnRequest.UpdatedAt = DateTime.UtcNow;

        parcel.Status = ParcelStatus.Returned;
        parcel.UpdatedAt = DateTime.UtcNow;

        var trackingEvent = new TrackingEvent
        {
            Id = Guid.NewGuid(),
            ParcelId = parcel.Id,
            EventType = TrackingEventType.Returned,
            Description = $"Return finalized. Refund of R{refundAmount:0.00} issued for RA {returnRequest.RaNumber}.",
            OccurredAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        await _uow.TrackingEvents.AddAsync(trackingEvent, ct);
        await _uow.SaveChangesAsync(ct);

        await _audit.LogAsync("RETURN_REFUND_RELEASED", "ReturnRequest", returnRequest.Id,
            null, new { returnRequest.RaNumber, refundAmount, parcel.PaymentMethod }, staffUserId, null, ct);

        return await MapToDtoAsync(returnRequest, parcel.TrackingNumber, ct);
    }

    public async Task<ReturnRequestDto?> GetDetailAsync(Guid returnId, CancellationToken ct = default)
    {
        var returnRequest = await _uow.Query<ReturnRequest>().GetByIdAsync(returnId, ct);
        if (returnRequest is null) return null;
        var parcel = await _uow.Parcels.GetByIdAsync(returnRequest.ParcelId, ct);
        return await MapToDtoAsync(returnRequest, parcel?.TrackingNumber ?? "—", ct);
    }

    public async Task<IEnumerable<ReturnRequestDto>> GetMyReturnsAsync(Guid customerUserId, CancellationToken ct = default)
    {
        var customer = await _uow.Query<CustomerProfile>().Query()
            .FirstOrDefaultAsync(c => c.UserId == customerUserId, ct);
        if (customer is null) return [];

        var returns = await _uow.Query<ReturnRequest>().Query()
            .AsNoTracking()
            .Where(r => r.CustomerId == customer.Id)
            .OrderByDescending(r => r.CreatedAt)
            .ToListAsync(ct);

        var results = new List<ReturnRequestDto>();
        foreach (var r in returns)
        {
            var parcel = await _uow.Parcels.GetByIdAsync(r.ParcelId, ct);
            results.Add(await MapToDtoAsync(r, parcel?.TrackingNumber ?? "—", ct));
        }
        return results;
    }

    public async Task<IEnumerable<ReturnRequestDto>> GetQueueAsync(string? status, CancellationToken ct = default)
    {
        var query = _uow.Query<ReturnRequest>().Query().AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<ReturnRequestStatus>(status, true, out var statusEnum))
            query = query.Where(r => r.Status == statusEnum);

        var returns = await query.OrderByDescending(r => r.CreatedAt).Take(200).ToListAsync(ct);

        var results = new List<ReturnRequestDto>();
        foreach (var r in returns)
        {
            var parcel = await _uow.Parcels.GetByIdAsync(r.ParcelId, ct);
            results.Add(await MapToDtoAsync(r, parcel?.TrackingNumber ?? "—", ct));
        }
        return results;
    }

    private async Task VoidInvoiceAsync(Guid parcelId, CancellationToken ct)
    {
        var invoice = await _uow.Query<Invoice>().Query().FirstOrDefaultAsync(i => i.ParcelId == parcelId, ct);
        if (invoice is not null) { invoice.Status = InvoiceStatus.Voided; invoice.UpdatedAt = DateTime.UtcNow; }
    }

    private async Task<ReturnRequest> GetOrThrowAsync(Guid id, CancellationToken ct)
        => await _uow.Query<ReturnRequest>().GetByIdAsync(id, ct)
           ?? throw new NotFoundException($"Return request {id} not found.");

    private async Task<ReturnRequestDto> MapToDtoAsync(ReturnRequest r, string trackingNumber, CancellationToken ct)
    {
        var address = await _uow.Query<ParcelAddress>().GetByIdAsync(r.CollectionAddressId, ct);
        return new ReturnRequestDto(
            r.Id, r.RaNumber, r.ParcelId, trackingNumber, r.Status.ToString(), r.Reason,
            MapAddressDto(address), r.RequestedAt, r.ApprovedAt, r.ReceivedAt,
            r.InspectionResult?.ToString(), r.InspectionNotes, r.RefundAmountZAR, r.RefundedAt);
    }

    private static ParcelAddress MapAddress(CreateAddressDto dto) => new()
    {
        Id = Guid.NewGuid(),
        RecipientName = dto.RecipientName,
        RecipientPhone = dto.RecipientPhone,
        RecipientEmail = dto.RecipientEmail,
        StreetAddress = dto.StreetAddress,
        Suburb = dto.Suburb,
        City = dto.City,
        Province = dto.Province,
        PostalCode = dto.PostalCode,
        Country = dto.Country ?? "South Africa",
        SpecialInstructions = dto.SpecialInstructions,
        CreatedAt = DateTime.UtcNow,
        UpdatedAt = DateTime.UtcNow
    };

    private static ParcelAddressDto? MapAddressDto(ParcelAddress? addr) => addr is null ? null : new(
        addr.RecipientName, addr.RecipientPhone, addr.RecipientEmail, addr.StreetAddress,
        addr.Suburb, addr.City, addr.Province.ToString(), addr.PostalCode);
}