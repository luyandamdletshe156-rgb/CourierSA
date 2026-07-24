using CsvHelper;
using CsvHelper.Configuration;
using CourierSA.Application.DTOs.Parcels;
using CourierSA.Application.Interfaces.Services;
using CourierSA.Domain.Enums;
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;
using CourierSA.Application.DTOs.Bulk;
using Microsoft.Extensions.Logging;
using CourierSA.Infrastructure.Data;

namespace CourierSA.Infrastructure.Services;

// ── Bulk CSV Service ──────────────────────────────────────────────────────────
public class BulkCsvService : IBulkCsvService
{
    private readonly IParcelService _parcelService;
    private readonly ILogger<BulkCsvService> _logger;
    private readonly ApplicationDbContext _db;

    // Valid province name variations → canonical enum value
    private static readonly Dictionary<string, string> ProvinceAliases =
        new(StringComparer.OrdinalIgnoreCase)
        {
            ["gauteng"]             = "Gauteng",
            ["gp"]                  = "Gauteng",
            ["western cape"]        = "WesternCape",
            ["western_cape"]        = "WesternCape",
            ["wc"]                  = "WesternCape",
            ["eastern cape"]        = "EasternCape",
            ["eastern_cape"]        = "EasternCape",
            ["ec"]                  = "EasternCape",
            ["kwazulu-natal"]       = "KwaZuluNatal",
            ["kwazulu natal"]       = "KwaZuluNatal",
            ["kzn"]                 = "KwaZuluNatal",
            ["limpopo"]             = "Limpopo",
            ["lp"]                  = "Limpopo",
            ["mpumalanga"]          = "Mpumalanga",
            ["mp"]                  = "Mpumalanga",
            ["north west"]          = "NorthWest",
            ["north_west"]          = "NorthWest",
            ["nw"]                  = "NorthWest",
            ["northern cape"]       = "NorthernCape",
            ["northern_cape"]       = "NorthernCape",
            ["nc"]                  = "NorthernCape",
            ["free state"]          = "FreeState",
            ["free_state"]          = "FreeState",
            ["fs"]                  = "FreeState",
        };

    private static readonly HashSet<string> ValidServiceTypes =
        new(StringComparer.OrdinalIgnoreCase)
        { "Economy", "Standard", "Express", "Overnight", "SameDay", "Same Day" };

    private static readonly Regex SaPhoneRegex =
        new(@"^(\+27|0)[6-8][0-9]{8}$", RegexOptions.Compiled);

    private static readonly Regex PostalCodeRegex =
        new(@"^\d{4}$", RegexOptions.Compiled);

    public BulkCsvService(
        IParcelService parcelService,
        ILogger<BulkCsvService> logger,
        ApplicationDbContext db)
    {
        _parcelService = parcelService;
        _logger        = logger;
        _db            = db;
    }

    // ── Parse & validate (no DB writes) ──────────────────────────────────────
    public async Task<List<(BulkParcelCsvRow Row, int RowNum, List<string> Errors)>>
        ParseAndValidateAsync(Stream csvStream, CancellationToken ct = default)
    {
        var results = new List<(BulkParcelCsvRow, int, List<string>)>();

        var config = new CsvConfiguration(CultureInfo.InvariantCulture)
        {
            HasHeaderRecord    = true,
            TrimOptions        = TrimOptions.Trim,
            MissingFieldFound  = null,
            BadDataFound       = null,
            IgnoreBlankLines   = true,
        };

        using var reader    = new StreamReader(csvStream, Encoding.UTF8, detectEncodingFromByteOrderMarks: true);
        using var csvReader = new CsvReader(reader, config);

        await csvReader.ReadAsync();
        csvReader.ReadHeader();

        var rowNum = 1; // 1-based (header is row 0)
        while (await csvReader.ReadAsync())
        {
            ct.ThrowIfCancellationRequested();
            rowNum++;

            BulkParcelCsvRow row;
            try
            {
                row = csvReader.GetRecord<BulkParcelCsvRow>()
                      ?? new BulkParcelCsvRow();
            }
            catch (Exception ex)
            {
                results.Add((new BulkParcelCsvRow(), rowNum, [$"Row could not be parsed: {ex.Message}"]));
                continue;
            }

            // Skip entirely empty rows
            if (IsBlankRow(row)) continue;

            var errors = ValidateRow(row);
            results.Add((row, rowNum, errors));
        }

        return results;
    }

    // ── Process: validate + book each valid row ───────────────────────────────
    public async Task<BulkUploadResultDto> ProcessAsync(
        Stream csvStream, Guid uploadedByUserId,
        string? fileName = null, CancellationToken ct = default)
    {
        var uploadId    = Guid.NewGuid().ToString("N")[..12].ToUpper();
        var parsedRows  = await ParseAndValidateAsync(csvStream, ct);
        var rowResults  = new List<BulkRowResultDto>();
        int successful  = 0, failed = 0, skipped = 0;

        foreach (var (row, rowNum, errors) in parsedRows)
        {
            if (errors.Count > 0)
            {
                failed++;
                rowResults.Add(new BulkRowResultDto(
                    RowNumber:      rowNum,
                    Success:        false,
                    TrackingNumber: null,
                    ClientReference:row.ClientReference,
                    RecipientName:  row.DeliveryName,
                    DestinationCity:row.DeliveryCity,
                    Errors:         errors
                ));
                continue;
            }

            try
            {
                var dto    = MapToCreateParcelDto(row);
                var result = await _parcelService.BookAsync(dto, uploadedByUserId, ct);

                successful++;
                rowResults.Add(new BulkRowResultDto(
                    RowNumber:      rowNum,
                    Success:        true,
                    TrackingNumber: result.TrackingNumber,
                    ClientReference:row.ClientReference,
                    RecipientName:  row.DeliveryName,
                    DestinationCity:row.DeliveryCity,
                    Errors:         []
                ));
            }
            catch (Exception ex)
            {
                failed++;
                _logger.LogWarning(ex, "Bulk upload row {Row} failed for user {User}", rowNum, uploadedByUserId);
                rowResults.Add(new BulkRowResultDto(
                    RowNumber:      rowNum,
                    Success:        false,
                    TrackingNumber: null,
                    ClientReference:row.ClientReference,
                    RecipientName:  row.DeliveryName,
                    DestinationCity:row.DeliveryCity,
                    Errors:         [ex.Message]
                ));
            }
        }

        var processedAt = DateTime.UtcNow;
        var uploadResult = new BulkUploadResultDto(
            TotalRows:   parsedRows.Count,
            Successful:  successful,
            Failed:      failed,
            Skipped:     skipped,
            UploadId:    uploadId,
            ProcessedAt: processedAt,
            Rows:        rowResults
        );

        // ── Persist history to DB ─────────────────────────────────────────────
        try
        {
            var historyEntry = new CourierSA.Domain.Entities.BulkUploadHistory
            {
                Id             = Guid.NewGuid(),
                UserId         = uploadedByUserId,
                UploadId       = uploadId,
                FileName       = fileName ?? "upload.csv",
                TotalRows      = parsedRows.Count,
                Successful     = successful,
                Failed         = failed,
                Skipped        = skipped,
                ProcessedAt    = processedAt,
                RowResultsJson = System.Text.Json.JsonSerializer.Serialize(rowResults),
                CreatedAt      = processedAt,
                UpdatedAt      = processedAt,
            };
            _db.BulkUploadHistories.Add(historyEntry);
            await _db.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            // History persistence failure must NOT fail the upload itself
            _logger.LogWarning(ex, "Failed to persist bulk upload history for {UploadId}", uploadId);
        }

        return uploadResult;
    }

    // ── Template CSV bytes (downloadable by users) ────────────────────────────
    public byte[] GenerateTemplateBytes()
    {
        var headers = new[]
        {
            "PickupName","PickupPhone","PickupEmail","PickupStreet","PickupSuburb",
            "PickupCity","PickupProvince","PickupPostalCode",
            "DeliveryName","DeliveryPhone","DeliveryEmail","DeliveryStreet","DeliverySuburb",
            "DeliveryCity","DeliveryProvince","DeliveryPostalCode",
            "ServiceType","WeightKg","Description","DeclaredValue",
            "IsFragile","RequiresSignature","InsuranceRequired","SpecialInstructions",
            "LengthCm","WidthCm","HeightCm","ClientReference"
        };

        // Three rows — Express+fragile (JHB→DBN), Standard (CPT→PTA), Economy docs (GPT→EC)
        string[][] rows =
  [
      [
        "TechCorp SA","+27110001111","dispatch@techcorp.co.za",
        "123 Sandton Drive","Sandhurst","Johannesburg","Gauteng","2196",
        "Zanele Nkosi","+27797654321","zanele@gmail.com",
        "78 Victoria Embankment","Durban Central","Durban","KwaZuluNatal","4001",
        "Express","2.5","Electronic components — laptop","1500",
        "true","true","true","Ring bell at gate",
        "30","20","15","ORD-20240615-001"
    ],
    [
        "TechCorp SA","+27110001111","dispatch@techcorp.co.za",
        "123 Sandton Drive","Sandhurst","Johannesburg","Gauteng","2196",
        "Sipho Dlamini","+27821112233","sipho@example.co.za",
        "45 Long Street","Cape Town City Bowl","Cape Town","WesternCape","8001",
        "Standard","5.0","Clothing and accessories","800",
        "false","false","false","Leave with security if absent",
        "","","","ORD-20240615-002"
    ],
    [
        "TechCorp SA","+27110001111","",
        "123 Sandton Drive","","Johannesburg","Gauteng","2196",
        "Nomsa Khumalo","+27739876543","",
        "12 Fleet Street","","East London","EasternCape","5201",
        "Economy","0.5","Legal documents","0",
        "false","true","false","",
        "","","","ORD-20240615-003"
    ],
];

        var sb = new StringBuilder();
        sb.AppendLine(string.Join(",", headers));
        foreach (var row in rows)
            sb.AppendLine(string.Join(",", row.Select(v => v.Contains(',') ? $"\"{v}\"" : v)));

        return Encoding.UTF8.GetBytes(sb.ToString());
    }

    // ── Row validation ────────────────────────────────────────────────────────
    private static List<string> ValidateRow(BulkParcelCsvRow row)
    {
        var errors = new List<string>();

        // Pickup
        if (string.IsNullOrWhiteSpace(row.PickupName))    errors.Add("PickupName is required");
        if (!SaPhoneRegex.IsMatch(row.PickupPhone ?? "")) errors.Add("PickupPhone: invalid SA number (e.g. +27821234567)");
        if (string.IsNullOrWhiteSpace(row.PickupStreet))  errors.Add("PickupStreet is required");
        if (string.IsNullOrWhiteSpace(row.PickupCity))    errors.Add("PickupCity is required");
        if (!IsValidProvince(row.PickupProvince))          errors.Add($"PickupProvince '{row.PickupProvince}' is not a valid SA province");
        if (!PostalCodeRegex.IsMatch(row.PickupPostalCode ?? "")) errors.Add("PickupPostalCode must be 4 digits");

        // Delivery
        if (string.IsNullOrWhiteSpace(row.DeliveryName))    errors.Add("DeliveryName is required");
        if (!SaPhoneRegex.IsMatch(row.DeliveryPhone ?? "")) errors.Add("DeliveryPhone: invalid SA number");
        if (string.IsNullOrWhiteSpace(row.DeliveryStreet))  errors.Add("DeliveryStreet is required");
        if (string.IsNullOrWhiteSpace(row.DeliveryCity))    errors.Add("DeliveryCity is required");
        if (!IsValidProvince(row.DeliveryProvince))          errors.Add($"DeliveryProvince '{row.DeliveryProvince}' is not a valid SA province");
        if (!PostalCodeRegex.IsMatch(row.DeliveryPostalCode ?? "")) errors.Add("DeliveryPostalCode must be 4 digits");

        // Parcel
        if (!IsValidServiceType(row.ServiceType))
            errors.Add($"ServiceType '{row.ServiceType}' must be one of: Economy, Standard, Express, Overnight, SameDay");

        if (!decimal.TryParse(row.WeightKg, NumberStyles.Any, CultureInfo.InvariantCulture, out var weight)
            || weight < 0.1m || weight > 999m)
            errors.Add("WeightKg must be a number between 0.1 and 999");

        if (string.IsNullOrWhiteSpace(row.Description))
            errors.Add("Description is required");

        if (!string.IsNullOrWhiteSpace(row.DeclaredValue) &&
            !decimal.TryParse(row.DeclaredValue, NumberStyles.Any, CultureInfo.InvariantCulture, out _))
            errors.Add("DeclaredValue must be a number (e.g. 1500)");

        // Optional dimensions — all three must be provided if any are
        var hasL = !string.IsNullOrWhiteSpace(row.LengthCm);
        var hasW = !string.IsNullOrWhiteSpace(row.WidthCm);
        var hasH = !string.IsNullOrWhiteSpace(row.HeightCm);
        if ((hasL || hasW || hasH) && !(hasL && hasW && hasH))
            errors.Add("Dimensions: LengthCm, WidthCm and HeightCm must all be provided together");

        return errors;
    }

    private static bool IsValidProvince(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return false;
        return ProvinceAliases.ContainsKey(value.Trim()) ||
               Enum.TryParse<SaProvince>(value.Trim(), true, out _);
    }

    private static bool IsValidServiceType(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return false;
        return ValidServiceTypes.Contains(value.Trim());
    }

    private static bool IsBlankRow(BulkParcelCsvRow row)
        => string.IsNullOrWhiteSpace(row.PickupName) &&
           string.IsNullOrWhiteSpace(row.DeliveryName) &&
           string.IsNullOrWhiteSpace(row.ServiceType) &&
           string.IsNullOrWhiteSpace(row.WeightKg);

    // ── Map CSV row → CreateParcelDto ─────────────────────────────────────────
    private static CreateParcelDto MapToCreateParcelDto(BulkParcelCsvRow row)
    {
        var serviceTypeStr = row.ServiceType.Replace(" ", "");
        Enum.TryParse<ServiceType>(serviceTypeStr, true, out var serviceType);

        NormaliseProvince(row.PickupProvince,   out var pickupProv);
        NormaliseProvince(row.DeliveryProvince, out var deliveryProv);

        decimal.TryParse(row.WeightKg,     NumberStyles.Any, CultureInfo.InvariantCulture, out var weight);
        decimal.TryParse(row.DeclaredValue,NumberStyles.Any, CultureInfo.InvariantCulture, out var declared);

        ParcelDimensionsDto? dims = null;
        if (!string.IsNullOrWhiteSpace(row.LengthCm))
        {
            decimal.TryParse(row.LengthCm, NumberStyles.Any, CultureInfo.InvariantCulture, out var l);
            decimal.TryParse(row.WidthCm,  NumberStyles.Any, CultureInfo.InvariantCulture, out var w);
            decimal.TryParse(row.HeightCm, NumberStyles.Any, CultureInfo.InvariantCulture, out var h);
            dims = new ParcelDimensionsDto(l, w, h);
        }

        return new CreateParcelDto(
            PickupAddress: new CreateAddressDto(
                RecipientName:        row.PickupName.Trim(),
                RecipientPhone:       row.PickupPhone.Trim(),
                RecipientEmail:       row.PickupEmail,
                StreetAddress:        row.PickupStreet.Trim(),
                Suburb:               row.PickupSuburb,
                City:                 row.PickupCity.Trim(),
                Province:             pickupProv,
                PostalCode:           row.PickupPostalCode.Trim(),
                Country:              "South Africa",
                SpecialInstructions:  null
            ),
            DeliveryAddress: new CreateAddressDto(
                RecipientName:        row.DeliveryName.Trim(),
                RecipientPhone:       row.DeliveryPhone.Trim(),
                RecipientEmail:       row.DeliveryEmail,
                StreetAddress:        row.DeliveryStreet.Trim(),
                Suburb:               row.DeliverySuburb,
                City:                 row.DeliveryCity.Trim(),
                Province:             deliveryProv,
                PostalCode:           row.DeliveryPostalCode.Trim(),
                Country:              "South Africa",
                SpecialInstructions:  row.SpecialInstructions
            ),
            ServiceType:          serviceType,
            WeightKg:             weight,
            Description:          row.Description.Trim(),
            DeclaredValueZAR:     declared > 0 ? declared : null,
            IsFragile:            IsTruthy(row.IsFragile),
            RequiresSignature:    IsTruthy(row.RequiresSignature),
            InsuranceRequired:    IsTruthy(row.InsuranceRequired),
            Dimensions:           dims,
            QuoteId:              null,
            PayFromWallet:        false,
            SpecialInstructions:  row.SpecialInstructions,
            ClientReference:      row.ClientReference
        );
    }

    private static void NormaliseProvince(string raw, out SaProvince province)
    {
        var trimmed = raw?.Trim() ?? "";
        if (ProvinceAliases.TryGetValue(trimmed, out var canonical))
            trimmed = canonical;
        Enum.TryParse(trimmed, true, out province);
    }

    private static bool IsTruthy(string? value)
        => value?.Trim().ToLowerInvariant() is "true" or "yes" or "1" or "y";
}
