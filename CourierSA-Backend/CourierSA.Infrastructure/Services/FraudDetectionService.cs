using System.Text.Json;
using CourierSA.Application.DTOs.Fraud;
using CourierSA.Application.Interfaces.Repositories;
using CourierSA.Application.Interfaces.Services;
using CourierSA.Domain.Entities;
using CourierSA.Domain.Enums;
using CourierSA.Domain.Exceptions;
using Microsoft.EntityFrameworkCore;

namespace CourierSA.Infrastructure.Services;

// ── UC-FRAUD-01 — Detect and Restrict High-Risk Customer Accounts ─────────────
public class FraudDetectionService : IFraudDetectionService
{
    // Weighted scoring — documented, trivially adjustable assumptions, not
    // SRS-mandated values. Score is capped at 100.
    private const int MinParcelsToEvaluate = 3; // skip new accounts to avoid false positives
    private const int MediumRiskThreshold = 30;
    private const int HighRiskThreshold = 60;

    private readonly IUnitOfWork _uow;
    private readonly IAuditService _audit;

    public FraudDetectionService(IUnitOfWork uow, IAuditService audit)
    {
        _uow = uow;
        _audit = audit;
    }

    public async Task<FraudRiskAssessmentDto> EvaluateAsync(Guid customerId, CancellationToken ct = default)
    {
        var customer = await _uow.Query<CustomerProfile>().Query()
            .Include(c => c.User)
            .FirstOrDefaultAsync(c => c.Id == customerId, ct)
            ?? throw new NotFoundException("Customer profile not found.");

        var parcels = await _uow.Query<Parcel>().QueryNoTracking()
            .Where(p => p.CustomerId == customerId)
            .ToListAsync(ct);

        var totalParcels = parcels.Count;
        var riskFactors = new List<string>();
        var score = 0;

        if (totalParcels < MinParcelsToEvaluate)
        {
            customer.RiskLevel = CustomerRiskLevel.Low;
            customer.RiskScore = 0;
            customer.RiskEvaluatedAt = DateTime.UtcNow;
            customer.RiskFactorsJson = JsonSerializer.Serialize(new List<string> { "New account — insufficient history to evaluate." });
            await _uow.SaveChangesAsync(ct);
            return MapToDto(customer);
        }

        // ── Signal 1: cancellation ratio ────────────────────────────────────
        var cancelledCount = parcels.Count(p => p.Status == ParcelStatus.Cancelled);
        var cancellationRatio = (decimal)cancelledCount / totalParcels;
        if (cancellationRatio >= 0.4m)
        {
            score += 25;
            riskFactors.Add($"High cancellation ratio ({cancellationRatio:P0} of {totalParcels} parcels).");
        }
        else if (cancellationRatio >= 0.2m)
        {
            score += 12;
            riskFactors.Add($"Elevated cancellation ratio ({cancellationRatio:P0} of {totalParcels} parcels).");
        }

        // ── Signal 2: failed-delivery ratio ─────────────────────────────────
        var parcelIds = parcels.Select(p => p.Id).ToList();
        var deliveries = await _uow.Query<Delivery>().QueryNoTracking()
            .Where(d => parcelIds.Contains(d.ParcelId))
            .ToListAsync(ct);

        var deliveryAttempts = deliveries.Count;
        var failedDeliveries = deliveries.Count(d => d.Status == DeliveryStatus.Failed);
        if (deliveryAttempts > 0)
        {
            var failureRatio = (decimal)failedDeliveries / deliveryAttempts;
            if (failureRatio >= 0.4m)
            {
                score += 20;
                riskFactors.Add($"High failed-delivery ratio ({failureRatio:P0} of {deliveryAttempts} attempts).");
            }
            else if (failureRatio >= 0.2m)
            {
                score += 10;
                riskFactors.Add($"Elevated failed-delivery ratio ({failureRatio:P0} of {deliveryAttempts} attempts).");
            }
        }

        // ── Signal 3: confirmed-lost parcels ────────────────────────────────
        var confirmedLostCount = await _uow.Query<LostParcelCase>().QueryNoTracking()
            .CountAsync(c => c.CustomerId == customerId && c.Status == LostParcelCaseStatus.ConfirmedLost, ct);
        if (confirmedLostCount >= 2)
        {
            score += 20;
            riskFactors.Add($"{confirmedLostCount} confirmed-lost parcel cases.");
        }
        else if (confirmedLostCount == 1)
        {
            score += 8;
            riskFactors.Add("1 confirmed-lost parcel case.");
        }

        // ── Signal 4: rejected insurance claims (claiming loss/damage that turns out unfounded) ──
        var claims = await _uow.InsuranceClaims.QueryNoTracking()
            .Where(c => parcelIds.Contains(c.ParcelId))
            .ToListAsync(ct);

        var totalClaims = claims.Count;
        var rejectedClaims = claims.Count(c => c.Status == ClaimStatus.Rejected);
        if (totalClaims > 0 && rejectedClaims > 0)
        {
            var rejectionRatio = (decimal)rejectedClaims / totalClaims;
            if (rejectionRatio >= 0.5m)
            {
                score += 20;
                riskFactors.Add($"{rejectedClaims} of {totalClaims} insurance claims rejected.");
            }
            else
            {
                score += 10;
                riskFactors.Add($"{rejectedClaims} of {totalClaims} insurance claims rejected.");
            }
        }

        // ── Signal 5: frequency of high-declared-value parcels (≥ R2000) ───
        var highValueCount = parcels.Count(p => p.DeclaredValueZAR is >= 2000);
        var highValueRatio = (decimal)highValueCount / totalParcels;
        if (highValueRatio >= 0.6m && totalParcels >= 5)
        {
            score += 15;
            riskFactors.Add($"Frequent high-declared-value parcels ({highValueCount} of {totalParcels} ≥ R2000).");
        }

        score = Math.Min(score, 100);

        var previousLevel = customer.RiskLevel;
        var newLevel = score >= HighRiskThreshold ? CustomerRiskLevel.High
                      : score >= MediumRiskThreshold ? CustomerRiskLevel.Medium
                      : CustomerRiskLevel.Low;

        customer.RiskScore = score;
        customer.RiskLevel = newLevel;
        customer.RiskEvaluatedAt = DateTime.UtcNow;
        customer.RiskFactorsJson = JsonSerializer.Serialize(
            riskFactors.Count > 0 ? riskFactors : new List<string> { "No significant risk signals detected." });

        // SRS: system must both detect AND restrict High-risk accounts without waiting on an admin.
        if (newLevel == CustomerRiskLevel.High && !customer.IsRestricted)
        {
            customer.IsRestricted = true;
            customer.RestrictedAt = DateTime.UtcNow;
            customer.RestrictedByUserId = null; // system-initiated, not an admin action
            customer.RestrictionReason = "Auto-restricted: risk score reached the High-risk threshold.";
        }

        await _uow.SaveChangesAsync(ct);

        try
        {
            await _audit.LogAsync(
                "FRAUD_RISK_EVALUATED", "CustomerProfile", customer.Id,
                new { PreviousLevel = previousLevel.ToString() },
                new { NewLevel = newLevel.ToString(), Score = score, AutoRestricted = customer.IsRestricted },
                performedByUserId: null, ipAddress: null, ct);
        }
        catch (Exception ex) { Console.WriteLine($"[AUDIT] Fraud evaluation log failed: {ex.Message}"); }

        return MapToDto(customer);
    }

    public async Task<FraudRiskAssessmentDto> RestrictAsync(
        Guid customerId, RestrictAccountDto dto, Guid adminUserId, CancellationToken ct = default)
    {
        var customer = await _uow.Query<CustomerProfile>().Query()
            .Include(c => c.User)
            .FirstOrDefaultAsync(c => c.Id == customerId, ct)
            ?? throw new NotFoundException("Customer profile not found.");

        customer.IsRestricted = true;
        customer.RestrictedAt = DateTime.UtcNow;
        customer.RestrictedByUserId = adminUserId;
        customer.RestrictionReason = dto.Reason;

        await _uow.SaveChangesAsync(ct);

        try
        {
            await _audit.LogAsync(
                "FRAUD_ACCOUNT_RESTRICTED", "CustomerProfile", customer.Id,
                null, new { dto.Reason }, adminUserId, null, ct);
        }
        catch (Exception ex) { Console.WriteLine($"[AUDIT] Restrict log failed: {ex.Message}"); }

        return MapToDto(customer);
    }

    public async Task<FraudRiskAssessmentDto> LiftRestrictionAsync(
        Guid customerId, Guid adminUserId, CancellationToken ct = default)
    {
        var customer = await _uow.Query<CustomerProfile>().Query()
            .Include(c => c.User)
            .FirstOrDefaultAsync(c => c.Id == customerId, ct)
            ?? throw new NotFoundException("Customer profile not found.");

        customer.IsRestricted = false;
        customer.RestrictedAt = null;
        customer.RestrictedByUserId = null;
        customer.RestrictionReason = null;

        await _uow.SaveChangesAsync(ct);

        try
        {
            await _audit.LogAsync(
                "FRAUD_RESTRICTION_LIFTED", "CustomerProfile", customer.Id,
                null, null, adminUserId, null, ct);
        }
        catch (Exception ex) { Console.WriteLine($"[AUDIT] Lift restriction log failed: {ex.Message}"); }

        return MapToDto(customer);
    }

    public async Task<IEnumerable<FraudRiskAssessmentDto>> GetFlaggedAccountsAsync(CancellationToken ct = default)
    {
        var flagged = await _uow.Query<CustomerProfile>().QueryNoTracking()
            .Include(c => c.User)
            .Where(c => c.IsRestricted || c.RiskLevel == CustomerRiskLevel.Medium || c.RiskLevel == CustomerRiskLevel.High)
            .OrderByDescending(c => c.RiskScore)
            .ToListAsync(ct);

        return flagged.Select(MapToDto);
    }

    public async Task<FraudRiskAssessmentDto?> GetAssessmentAsync(Guid customerId, CancellationToken ct = default)
    {
        var customer = await _uow.Query<CustomerProfile>().QueryNoTracking()
            .Include(c => c.User)
            .FirstOrDefaultAsync(c => c.Id == customerId, ct);

        return customer is null ? null : MapToDto(customer);
    }

    private static FraudRiskAssessmentDto MapToDto(CustomerProfile customer)
    {
        var riskFactors = string.IsNullOrWhiteSpace(customer.RiskFactorsJson)
            ? new List<string>()
            : JsonSerializer.Deserialize<List<string>>(customer.RiskFactorsJson) ?? new List<string>();

        return new FraudRiskAssessmentDto(
            customer.Id,
            customer.UserId,
            customer.User?.FullName ?? "Unknown",
            customer.User?.Email ?? string.Empty,
            customer.RiskLevel.ToString(),
            customer.RiskScore,
            customer.IsRestricted,
            customer.RiskEvaluatedAt,
            customer.RestrictionReason,
            riskFactors);
    }
}