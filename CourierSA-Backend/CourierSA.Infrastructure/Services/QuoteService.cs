using CourierSA.Application.DTOs.Quotes;
using CourierSA.Application.Interfaces.Services;
using CourierSA.Domain.Entities;
using CourierSA.Domain.Enums;
using CourierSA.Application.Interfaces.Repositories;
using CourierSA.Domain.Exceptions;

namespace CourierSA.Infrastructure.Services;

/// <summary>
/// Calculates courier quotes using a realistic South African rate structure:
///   Base rate (weight-tier × service multiplier)
/// + Dimensional weight surcharge (when volumetric weight > actual)
/// + Inter-provincial surcharge (cross-province adds distance band fee)
/// + Insurance premium (0.5% of declared value, min R15)
/// + VAT at 15%
/// 
/// Rates are intentionally simple for the project demo but structured so
/// a real rate card can be swapped in without changing the interface.
/// </summary>
public class QuoteService : IQuoteService
{
    private readonly IUnitOfWork _uow;

    public QuoteService(IUnitOfWork uow) => _uow = uow;

    // ── Rate tables ───────────────────────────────────────────────────────────

    // Base rates per kg bracket (max weight kg → rate per kg in ZAR)
    private static readonly (decimal MaxKg, decimal RatePerKg)[] WeightBrackets =
    [
        (0.5m,   28.00m),   // <500g
        (1m,     24.00m),   // 500g–1kg
        (2m,     20.00m),   // 1–2kg
        (5m,     16.50m),   // 2–5kg
        (10m,    14.00m),   // 5–10kg
        (20m,    12.50m),   // 10–20kg
        (50m,    11.00m),   // 20–50kg
        (999m,    9.50m),   // >50kg
    ];

    // Service multipliers on the base rate
    private static readonly Dictionary<ServiceType, decimal> ServiceMultipliers = new()
    {
        { ServiceType.Economy,   0.75m },
        { ServiceType.Standard,  1.00m },
        { ServiceType.Express,   1.60m },
        { ServiceType.Overnight, 2.20m },
        { ServiceType.SameDay,   3.00m },
    };

    // Estimated transit days
    private static readonly Dictionary<ServiceType, int> TransitDays = new()
    {
        { ServiceType.Economy,   6 },
        { ServiceType.Standard,  4 },
        { ServiceType.Express,   2 },
        { ServiceType.Overnight, 1 },
        { ServiceType.SameDay,   0 },
    };

    // Minimum charges per service
    private static readonly Dictionary<ServiceType, decimal> MinimumCharges = new()
    {
        { ServiceType.Economy,   45.00m  },
        { ServiceType.Standard,  65.00m  },
        { ServiceType.Express,   120.00m },
        { ServiceType.Overnight, 180.00m },
        { ServiceType.SameDay,   250.00m },
    };

    // Inter-provincial surcharge bands (applied when origin ≠ destination)
    // Provinces grouped by distance band from Gauteng hub
    private static readonly Dictionary<SaProvince, int> DistanceBand = new()
    {
        { SaProvince.Gauteng,      0 },
        { SaProvince.Mpumalanga,   1 },
        { SaProvince.Limpopo,      1 },
        { SaProvince.NorthWest,    1 },
        { SaProvince.FreeState,    2 },
        { SaProvince.KwaZuluNatal, 2 },
        { SaProvince.EasternCape,  3 },
        { SaProvince.WesternCape,  3 },
        { SaProvince.NorthernCape, 3 },
    };

    // Surcharge per band difference × service multiplier
    private static readonly decimal[] BandSurcharges = [0m, 18m, 35m, 55m, 75m];

    private const decimal VatRate               = 0.15m;
    private const decimal InsuranceRate         = 0.005m; // 0.5% of declared value
    private const decimal InsuranceMinimum      = 15.00m;
    private const decimal DimWeightDivisor      = 5000m;  // cm³ / 5000 = volumetric kg

    // ── Public API ────────────────────────────────────────────────────────────

    public async Task<QuoteResponseDto> CalculateAsync(
        QuoteRequestDto dto, Guid? customerId, CancellationToken ct = default)
    {
        // 1. Determine billable weight (greater of actual vs volumetric)
        var volumetricKg = CalculateVolumetricWeight(dto.Dimensions);
        var billableKg   = Math.Max(dto.WeightKg, volumetricKg ?? 0);

        // 2. Base rate from weight bracket × service multiplier
        var ratePerKg    = GetRatePerKg(billableKg);
        var serviceMulti = ServiceMultipliers.GetValueOrDefault(dto.ServiceType, 1m);
        var baseAmount   = Math.Round(billableKg * ratePerKg * serviceMulti, 2);

        // Enforce minimum charge
        var minimum      = MinimumCharges.GetValueOrDefault(dto.ServiceType, 65m);
        baseAmount       = Math.Max(baseAmount, minimum);

        // 3. Inter-provincial surcharge
        var surcharge    = CalculateRouteSurcharge(
            dto.OriginProvince, dto.DestinationProvince, dto.ServiceType);

        // 4. Dimensional weight surcharge (when volumetric > actual)
        var dimSurcharge = 0m;
        if (volumetricKg.HasValue && volumetricKg > dto.WeightKg)
        {
            var dimDiff  = volumetricKg.Value - dto.WeightKg;
            dimSurcharge = Math.Round(dimDiff * ratePerKg * serviceMulti * 0.5m, 2);
            surcharge   += dimSurcharge;
        }

        // 5. Insurance
        var insurancePremium = 0m;
        if (dto.InsuranceRequired && dto.DeclaredValueZAR.HasValue && dto.DeclaredValueZAR > 0)
        {
            insurancePremium = Math.Max(
                Math.Round(dto.DeclaredValueZAR.Value * InsuranceRate, 2),
                InsuranceMinimum);
        }

        // 6. VAT
        var subtotal = baseAmount + surcharge + insurancePremium;
        var vat      = Math.Round(subtotal * VatRate, 2);
        var total    = Math.Round(subtotal + vat, 2);

        // 7. Estimated delivery date (skip weekends)
        var days     = TransitDays.GetValueOrDefault(dto.ServiceType, 4);
        var estDate  = AddBusinessDays(DateTime.UtcNow, days);

        // 8. Persist quote if customer is logged in
        Quote? savedQuote = null;
        if (customerId.HasValue)
        {
            var customer = await _uow.Query<CustomerProfile>()
                .FirstOrDefaultAsync(c => c.UserId == customerId.Value, ct);

            if (customer is not null)
            {
                savedQuote = new Quote
                {
                    Id                   = Guid.NewGuid(),
                    CustomerId           = customer.Id,
                    Status               = QuoteStatus.Pending,
                    ServiceType          = dto.ServiceType,
                    OriginProvince       = dto.OriginProvince,
                    DestinationProvince  = dto.DestinationProvince,
                    WeightKg             = dto.WeightKg,
                    BaseAmountZAR        = baseAmount,
                    SurchargeZAR         = surcharge > 0 ? surcharge : null,
                    InsurancePremiumZAR  = insurancePremium > 0 ? insurancePremium : null,
                    TotalAmountZAR       = total,
                    VatAmountZAR         = vat,
                    ExpiresAt            = DateTime.UtcNow.AddMinutes(30),
                    CreatedAt            = DateTime.UtcNow,
                    UpdatedAt            = DateTime.UtcNow,
                };
                await _uow.Quotes.AddAsync(savedQuote, ct);
                await _uow.SaveChangesAsync(ct);
            }
        }

        return new QuoteResponseDto(
            QuoteId:              savedQuote?.Id,
            ServiceType:          dto.ServiceType.ToString(),
            OriginProvince:       dto.OriginProvince.ToString(),
            DestinationProvince:  dto.DestinationProvince.ToString(),
            ActualWeightKg:       dto.WeightKg,
            VolumetricWeightKg:   volumetricKg,
            BillableWeightKg:     billableKg,
            BaseAmountZAR:        baseAmount,
            SurchargeZAR:         surcharge > 0 ? surcharge : null,
            InsurancePremiumZAR:  insurancePremium > 0 ? insurancePremium : null,
            VatAmountZAR:         vat,
            TotalAmountZAR:       total,
            EstimatedDeliveryDays:days,
            EstimatedDeliveryDate:estDate,
            ExpiresAt:            savedQuote?.ExpiresAt ?? DateTime.UtcNow.AddMinutes(30),
            Breakdown:            BuildBreakdown(baseAmount, surcharge, dimSurcharge,
                                                 insurancePremium, vat, total)
        );
    }

    public async Task<Quote?> GetAsync(Guid quoteId, CancellationToken ct = default)
        => await _uow.Quotes.GetByIdAsync(quoteId, ct);

    // ── Private helpers ───────────────────────────────────────────────────────

    private static decimal GetRatePerKg(decimal weightKg)
    {
        foreach (var (maxKg, rate) in WeightBrackets)
            if (weightKg <= maxKg) return rate;
        return WeightBrackets[^1].RatePerKg;
    }

    private static decimal? CalculateVolumetricWeight(DimensionsDto? dims)
    {
        if (dims is null || dims.LengthCm <= 0 || dims.WidthCm <= 0 || dims.HeightCm <= 0)
            return null;
        return Math.Round((dims.LengthCm * dims.WidthCm * dims.HeightCm) / DimWeightDivisor, 3);
    }

    private static decimal CalculateRouteSurcharge(
        SaProvince origin, SaProvince destination, ServiceType service)
    {
        if (origin == destination) return 0m;

        var originBand      = DistanceBand.GetValueOrDefault(origin, 2);
        var destinationBand = DistanceBand.GetValueOrDefault(destination, 2);
        var bandDiff        = Math.Abs(originBand - destinationBand);

        // Cross-province always attracts at least band-1 surcharge
        bandDiff = Math.Max(bandDiff, 1);
        bandDiff = Math.Min(bandDiff, BandSurcharges.Length - 1);

        var baseSurcharge   = BandSurcharges[bandDiff];
        var serviceMulti    = ServiceMultipliers.GetValueOrDefault(service, 1m);
        return Math.Round(baseSurcharge * serviceMulti, 2);
    }

    private static DateTime AddBusinessDays(DateTime start, int days)
    {
        if (days == 0) return start;
        var date  = start;
        var added = 0;
        while (added < days)
        {
            date = date.AddDays(1);
            if (date.DayOfWeek != DayOfWeek.Saturday &&
                date.DayOfWeek != DayOfWeek.Sunday)
                added++;
        }
        return date;
    }

    private static List<QuoteLineItemDto> BuildBreakdown(
        decimal baseAmount, decimal surcharge, decimal dimSurcharge,
        decimal insurance, decimal vat, decimal total)
    {
        var items = new List<QuoteLineItemDto>
        {
            new("Base rate", baseAmount, "Weight × service multiplier")
        };

        if (surcharge > 0)
        {
            if (dimSurcharge > 0)
                items.Add(new("Dimensional weight", dimSurcharge, "Volumetric weight exceeds actual weight"));
            var routeSurcharge = surcharge - dimSurcharge;
            if (routeSurcharge > 0)
                items.Add(new("Route surcharge", routeSurcharge, "Inter-provincial delivery"));
        }

        if (insurance > 0)
            items.Add(new("Insurance premium", insurance, "0.5% of declared value (min R15)"));

        items.Add(new("VAT (15%)", vat, "Value-added tax"));
        items.Add(new("Total", total, null) { IsTotal = true });

        return items;
    }
}
