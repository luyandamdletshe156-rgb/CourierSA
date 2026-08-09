using CourierSA.Application.DTOs.LostParcel;
using CourierSA.Application.Interfaces.Repositories;
using CourierSA.Application.Interfaces.Services;
using CourierSA.Domain.Entities;
using CourierSA.Domain.Enums;
using CourierSA.Domain.Exceptions;
using Microsoft.EntityFrameworkCore;

namespace CourierSA.Infrastructure.Services;

public class LostParcelService : ILostParcelService
{
    private readonly IUnitOfWork _uow;
    private readonly IAuditService _audit;

    public LostParcelService(IUnitOfWork uow, IAuditService audit)
    {
        _uow = uow;
        _audit = audit;
    }

    public async Task<LostParcelCaseDto> ReportAsync(
        ReportLostParcelDto dto, Guid customerUserId, CancellationToken ct = default)
    {
        var customer = await _uow.Query<CustomerProfile>().Query()
            .FirstOrDefaultAsync(c => c.UserId == customerUserId, ct)
            ?? throw new NotFoundException("Customer profile not found.");

        var parcel = await _uow.Parcels.GetByTrackingNumberAsync(dto.TrackingNumber, ct)
            ?? throw new NotFoundException($"Parcel {dto.TrackingNumber} not found.");

        if (parcel.CustomerId != customer.Id)
            throw new ForbiddenException("This parcel does not belong to you.");

        if (parcel.Status is ParcelStatus.Lost or ParcelStatus.Delivered or ParcelStatus.Cancelled)
            throw new BadRequestException($"Parcel cannot be reported lost while in status '{parcel.Status}'.");

        var alreadyOpen = await _uow.Query<LostParcelCase>().Query()
            .AnyAsync(c => c.ParcelId == parcel.Id && c.Status != LostParcelCaseStatus.Closed, ct);
        if (alreadyOpen)
            throw new BadRequestException("An open lost-parcel case already exists for this parcel.");

        var lostCase = new LostParcelCase
        {
            Id = Guid.NewGuid(),
            ParcelId = parcel.Id,
            CustomerId = customer.Id,
            CaseNumber = $"LPC-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString()[..6].ToUpper()}",
            Status = LostParcelCaseStatus.Reported,
            CustomerNotes = dto.CustomerNotes,
            ReportedAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        await _uow.Query<LostParcelCase>().AddAsync(lostCase, ct);

        var trackingEvent = new TrackingEvent
        {
            Id = Guid.NewGuid(),
            ParcelId = parcel.Id,
            EventType = TrackingEventType.LostParcelReported,
            Description = $"Customer reported parcel as lost. Case {lostCase.CaseNumber} opened.",
            OccurredAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        await _uow.TrackingEvents.AddAsync(trackingEvent, ct);
        await _uow.SaveChangesAsync(ct);

        try
        {
            await _audit.LogAsync("LOST_PARCEL_REPORTED", "LostParcelCase", lostCase.Id,
                null, new { lostCase.CaseNumber, parcel.TrackingNumber }, customerUserId, null, ct);
        }
        catch (Exception ex) { Console.WriteLine($"[AUDIT] ReportAsync log failed: {ex.Message}"); }

        return await MapToDtoAsync(lostCase, parcel.TrackingNumber, ct);
    }

    public async Task<LostParcelCaseDto> InvestigateAsync(
        Guid caseId, InvestigateLostParcelCaseDto dto, Guid staffUserId, CancellationToken ct = default)
    {
        var lostCase = await GetCaseOrThrowAsync(caseId, ct);
        if (lostCase.Status != LostParcelCaseStatus.Reported)
            throw new BadRequestException($"Case must be in 'Reported' status to begin investigation (currently '{lostCase.Status}').");

        lostCase.Status = LostParcelCaseStatus.UnderInvestigation;
        lostCase.InvestigationNotes = dto.Notes;
        lostCase.InvestigatedByStaffId = staffUserId;
        lostCase.UpdatedAt = DateTime.UtcNow;
        await _uow.SaveChangesAsync(ct);

        await _audit.LogAsync("LOST_PARCEL_INVESTIGATING", "LostParcelCase", lostCase.Id,
            null, new { lostCase.Status, dto.Notes }, staffUserId, null, ct);

        var parcel = await _uow.Parcels.GetByIdAsync(lostCase.ParcelId, ct);
        return await MapToDtoAsync(lostCase, parcel?.TrackingNumber ?? "—", ct);
    }

    public async Task<LostParcelCaseDto> ResolveAsync(
        Guid caseId, ResolveLostParcelCaseDto dto, Guid staffUserId, CancellationToken ct = default)
    {
        var lostCase = await GetCaseOrThrowAsync(caseId, ct);
        if (lostCase.Status != LostParcelCaseStatus.UnderInvestigation)
            throw new BadRequestException($"Case must be 'UnderInvestigation' to resolve (currently '{lostCase.Status}').");

        var parcel = await _uow.Parcels.GetByIdAsync(lostCase.ParcelId, ct)
            ?? throw new NotFoundException("Linked parcel not found.");

        lostCase.InvestigationNotes = string.IsNullOrWhiteSpace(dto.Notes)
            ? lostCase.InvestigationNotes
            : $"{lostCase.InvestigationNotes}\n{dto.Notes}";
        lostCase.ResolvedAt = DateTime.UtcNow;
        lostCase.UpdatedAt = DateTime.UtcNow;

        TrackingEvent trackingEvent;
        if (dto.Outcome == LostParcelResolution.Found)
        {
            lostCase.Status = LostParcelCaseStatus.Found;
            lostCase.ClosedAt = DateTime.UtcNow;
            trackingEvent = new TrackingEvent
            {
                Id = Guid.NewGuid(),
                ParcelId = parcel.Id,
                EventType = TrackingEventType.ExceptionRaised,
                Description = $"Parcel located during investigation of case {lostCase.CaseNumber}.",
                OccurredAt = DateTime.UtcNow,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
        }
        else
        {
            lostCase.Status = LostParcelCaseStatus.ConfirmedLost;
            parcel.Status = ParcelStatus.Lost;
            parcel.UpdatedAt = DateTime.UtcNow;
            trackingEvent = new TrackingEvent
            {
                Id = Guid.NewGuid(),
                ParcelId = parcel.Id,
                EventType = TrackingEventType.LostParcelConfirmed,
                Description = $"Parcel confirmed lost following investigation of case {lostCase.CaseNumber}.",
                OccurredAt = DateTime.UtcNow,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
        }
        await _uow.TrackingEvents.AddAsync(trackingEvent, ct);
        await _uow.SaveChangesAsync(ct);

        await _audit.LogAsync("LOST_PARCEL_RESOLVED", "LostParcelCase", lostCase.Id,
            null, new { lostCase.Status, dto.Outcome }, staffUserId, null, ct);

        return await MapToDtoAsync(lostCase, parcel.TrackingNumber, ct);
    }

    public async Task<InsuranceClaimDto> SubmitInsuranceClaimAsync(
        Guid caseId, SubmitInsuranceClaimDto dto, Guid staffUserId, CancellationToken ct = default)
    {
        var lostCase = await GetCaseOrThrowAsync(caseId, ct);
        if (lostCase.Status != LostParcelCaseStatus.ConfirmedLost)
            throw new BadRequestException("Case must be 'ConfirmedLost' before an insurance claim can be submitted.");
        if (lostCase.InsuranceClaimId is not null)
            throw new BadRequestException("An insurance claim has already been submitted for this case.");

        var parcel = await _uow.Parcels.GetByIdAsync(lostCase.ParcelId, ct)
            ?? throw new NotFoundException("Linked parcel not found.");

        var claimAmount = dto.ClaimAmountOverrideZAR ?? parcel.DeclaredValueZAR ?? 0;
        if (claimAmount <= 0)
            throw new BadRequestException("Claim amount must be greater than zero — check the parcel's declared value.");

        var claim = new InsuranceClaim
        {
            Id = Guid.NewGuid(),
            ParcelId = parcel.Id,
            CustomerId = parcel.CustomerId,
            ClaimNumber = $"CLM-{DateTime.UtcNow:yyyyMMdd}-{Guid.NewGuid().ToString()[..6].ToUpper()}",
            Type = ClaimType.Loss,
            Status = ClaimStatus.Submitted,
            ClaimedAmountZAR = claimAmount,
            Description = $"Loss claim for case {lostCase.CaseNumber}. {dto.Notes}".Trim(),
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };
        await _uow.Query<InsuranceClaim>().AddAsync(claim, ct);

        lostCase.InsuranceClaimId = claim.Id;
        lostCase.Status = LostParcelCaseStatus.Closed;
        lostCase.ClosedAt = DateTime.UtcNow;
        lostCase.UpdatedAt = DateTime.UtcNow;

        await _uow.SaveChangesAsync(ct);

        await _audit.LogAsync("INSURANCE_CLAIM_SUBMITTED", "InsuranceClaim", claim.Id,
            null, new { claim.ClaimNumber, claim.ClaimedAmountZAR, lostCase.CaseNumber }, staffUserId, null, ct);

        return MapClaimToDto(claim, parcel.TrackingNumber);
    }

    public async Task<InsuranceClaimDto> UpdateClaimStatusAsync(
        Guid claimId, UpdateClaimStatusDto dto, Guid staffUserId, CancellationToken ct = default)
    {
        var claim = await _uow.Query<InsuranceClaim>().GetByIdAsync(claimId, ct)
            ?? throw new NotFoundException($"Insurance claim {claimId} not found.");

        var previousStatus = claim.Status;
        claim.Status = dto.Status;
        claim.ApprovedAmountZAR = dto.ApprovedAmountZAR ?? claim.ApprovedAmountZAR;
        claim.ResolutionNotes = dto.Notes;
        claim.UpdatedAt = DateTime.UtcNow;
        await _uow.SaveChangesAsync(ct);

        await _audit.LogAsync("INSURANCE_CLAIM_STATUS_CHANGED", "InsuranceClaim", claim.Id,
            new { Status = previousStatus.ToString() }, new { Status = claim.Status.ToString() }, staffUserId, null, ct);

        var parcel = await _uow.Parcels.GetByIdAsync(claim.ParcelId, ct);
        return MapClaimToDto(claim, parcel?.TrackingNumber ?? "—");
    }

    public async Task<LostParcelCaseDto?> GetCaseDetailAsync(Guid caseId, CancellationToken ct = default)
    {
        var lostCase = await _uow.Query<LostParcelCase>().GetByIdAsync(caseId, ct);
        if (lostCase is null) return null;
        var parcel = await _uow.Parcels.GetByIdAsync(lostCase.ParcelId, ct);
        return await MapToDtoAsync(lostCase, parcel?.TrackingNumber ?? "—", ct);
    }

    public async Task<IEnumerable<LostParcelCaseDto>> GetMyCasesAsync(Guid customerUserId, CancellationToken ct = default)
    {
        var customer = await _uow.Query<CustomerProfile>().Query()
            .FirstOrDefaultAsync(c => c.UserId == customerUserId, ct);
        if (customer is null) return [];

        var cases = await _uow.Query<LostParcelCase>().Query()
            .AsNoTracking()
            .Where(c => c.CustomerId == customer.Id)
            .OrderByDescending(c => c.CreatedAt)
            .ToListAsync(ct);

        var results = new List<LostParcelCaseDto>();
        foreach (var c in cases)
        {
            var parcel = await _uow.Parcels.GetByIdAsync(c.ParcelId, ct);
            results.Add(await MapToDtoAsync(c, parcel?.TrackingNumber ?? "—", ct));
        }
        return results;
    }

    public async Task<IEnumerable<LostParcelCaseDto>> GetQueueAsync(string? status, CancellationToken ct = default)
    {
        var query = _uow.Query<LostParcelCase>().Query().AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(status) && Enum.TryParse<LostParcelCaseStatus>(status, true, out var statusEnum))
            query = query.Where(c => c.Status == statusEnum);

        var cases = await query.OrderByDescending(c => c.CreatedAt).Take(200).ToListAsync(ct);

        var results = new List<LostParcelCaseDto>();
        foreach (var c in cases)
        {
            var parcel = await _uow.Parcels.GetByIdAsync(c.ParcelId, ct);
            results.Add(await MapToDtoAsync(c, parcel?.TrackingNumber ?? "—", ct));
        }
        return results;
    }

    private async Task<LostParcelCase> GetCaseOrThrowAsync(Guid id, CancellationToken ct)
        => await _uow.Query<LostParcelCase>().GetByIdAsync(id, ct)
           ?? throw new NotFoundException($"Lost parcel case {id} not found.");

    private async Task<LostParcelCaseDto> MapToDtoAsync(LostParcelCase c, string trackingNumber, CancellationToken ct)
    {
        InsuranceClaim? claim = c.InsuranceClaimId is null
            ? null
            : await _uow.Query<InsuranceClaim>().GetByIdAsync(c.InsuranceClaimId.Value, ct);

        return new LostParcelCaseDto(
            c.Id, c.CaseNumber, c.ParcelId, trackingNumber, c.Status.ToString(),
            c.CustomerNotes, c.InvestigationNotes, c.ReportedAt, c.ResolvedAt, c.ClosedAt,
            c.InsuranceClaimId, claim?.ClaimNumber, claim?.Status.ToString());
    }

    private static InsuranceClaimDto MapClaimToDto(InsuranceClaim c, string trackingNumber)
        => new(c.Id, c.ClaimNumber, c.ParcelId, trackingNumber, c.Type.ToString(), c.Status.ToString(),
               c.ClaimedAmountZAR, c.ApprovedAmountZAR, c.Description, c.ResolutionNotes, c.CreatedAt);
}