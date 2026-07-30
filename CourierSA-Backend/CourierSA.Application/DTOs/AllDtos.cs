using CourierSA.Domain.Entities;
using CourierSA.Domain.Enums;

namespace CourierSA.Application.DTOs.Auth
{

public record LoginDto(string Email, string Password);

public record RegisterDto(
    string FirstName,
    string LastName,
    string Email,
    string Password,
    string PhoneNumber
);

public record RefreshTokenDto(string RefreshToken);

public record AuthResponseDto(
    string AccessToken,
    string RefreshToken,
    DateTime RefreshTokenExpiry,
    Guid UserId,
    string Email,
    string FirstName,
    string LastName,
    string Role,
     bool MustChangePassword

);
    public record ForgotPasswordDto(string Email);
    public record ResetPasswordDto(string Token, string NewPassword);
}

public record CreateStaffUserDto(
    string FirstName,
    string LastName,
    string Email,
    string PhoneNumber,
    UserRole Role,   // restrict to Dispatcher / WarehouseStaff / Driver at the service layer
    string? LicenseNumber = null,     // ← add, required only when Role == Driver
    DateTime? LicenseExpiry = null
);

public record ChangePasswordDto(string CurrentPassword, string NewPassword);


// ─────────────────────────────────────────────────────────────────────────────

namespace CourierSA.Application.DTOs.Parcels
{
    public record CreateParcelDto(
        CreateAddressDto PickupAddress,
        CreateAddressDto DeliveryAddress,
        ServiceType ServiceType,
        decimal WeightKg,
        ParcelDimensionsDto? Dimensions,
        decimal? DeclaredValueZAR,
        string? Description,
        string? SpecialInstructions,
        bool IsFragile,
        bool RequiresSignature,
        bool InsuranceRequired,
        Guid? QuoteId,
        PaymentMethod PaymentMethod,   // ← was: bool PayFromWallet
        string? ClientReference = null,
         string? CardToken = null
    );

    public record CreateAddressDto(
    string     RecipientName,
    string     RecipientPhone,
    string?    RecipientEmail,
    string     StreetAddress,
    string?    Suburb,
    string     City,
    SaProvince Province,
    string     PostalCode,
    string?    Country,
    string?    SpecialInstructions
);
}
public record ParcelDimensionsDto(
    decimal LengthCm,
    decimal WidthCm,
    decimal HeightCm
);

public record ParcelSummaryDto(
    Guid     Id,
    string   TrackingNumber,
    string   Status,
    string   ServiceType,
    string   DestinationCity,
    string   DestinationProvince,
    decimal  WeightKg,
    decimal? QuoteAmountZAR,
    DateTime CreatedAt,
    DateTime? EstimatedDeliveryDate
);

public record ParcelAddressDto(
    string RecipientName,
    string RecipientPhone,
    string? RecipientEmail,
    string StreetAddress,
    string? Suburb,
    string City,
    string Province,
    string PostalCode
);

public record ParcelDetailDto(
    Guid Id,
    string TrackingNumber,
    string Status,
    string ServiceType,
    decimal WeightKg,
    ParcelDimensions? Dimensions,
    decimal? DeclaredValueZAR,
    string? Description,
    string? SpecialInstructions,
    bool IsFragile,
    bool RequiresSignature,
    bool InsuranceRequired,
    decimal? QuoteAmountZAR,
    string? BarcodeImagePath,
    DateTime CreatedAt,
    DateTime? EstimatedDeliveryDate,
    ParcelAddressDto? PickupAddress,
    ParcelAddressDto? DeliveryAddress,
    IList<TrackingEventDto> TrackingEvents,
    DeliveryDto? ActiveDelivery
);
public record TrackingResultDto(
    string   TrackingNumber,
    string   Status,
    string   ServiceType,
    string   Destination,
    DateTime? EstimatedDelivery,
    List<TrackingEventDto> Events
);

public record TrackingEventDto(
    string   EventType,
    string?  Location,
    string?  Description,
    DateTime OccurredAt,
    decimal? Latitude,
    decimal? Longitude
);

public record ParcelFilterDto(
    int    Page     = 1,
    int    PageSize = 10,
    string? Status  = null,
    string? Search  = null
);

public record PagedResult<T>(
    List<T> Items,
    int     TotalCount,
    int     Page,
    int     PageSize
);

public record RejectParcelDto(string Reason);
public record CheckInDto(string WarehouseLocation);
public record DispatchParcelDto(Guid DriverId);
public record ReturnParcelDto(string? Notes);

public record ProofOfDeliveryDto(
    string? ImagePath,
    string? SignaturePath,
    string? Notes
);

public record FailedDeliveryDto(
    FailureReason Reason,
    string?       Notes
);

public record DriverLocationDto(decimal Latitude, decimal Longitude);

public record DeliveryDto(
    Guid     Id,
    Guid     ParcelId,
    string   TrackingNumber,
    string   Status,
    string   RecipientName,
    string   RecipientPhone,
    string   DeliveryAddress,
    string   City,
    string?  SpecialInstructions,
    bool     IsFragile,
    DateTime? DispatchedAt
);

public record BulkUploadResultDto(
    int      TotalRows,
    int      Successful,
    int      Failed,
    int      Skipped,
    string   UploadId,
    DateTime ProcessedAt,
    List<BulkRowResultDto> Rows
);

public record BulkRowResultDto(
    int      RowNumber,
    bool     Success,
    string?  TrackingNumber,
    string?  ClientReference,
    string?  RecipientName,
    string?  DestinationCity,
    List<string> Errors
);

// ─────────────────────────────────────────────────────────────────────────────

namespace CourierSA.Application.DTOs.Quotes
{
    public record QuoteRequestDto(
        SaProvince OriginProvince,
        SaProvince DestinationProvince,
        decimal WeightKg,
        ServiceType ServiceType,
        decimal? DeclaredValueZAR,
        bool InsuranceRequired,
        DimensionsDto? Dimensions
    );

    public record DimensionsDto(
        decimal LengthCm,
        decimal WidthCm,
        decimal HeightCm
    );

    public record QuoteResponseDto(
        Guid? QuoteId,
        string ServiceType,
        string OriginProvince,
        string DestinationProvince,
        decimal ActualWeightKg,
        decimal? VolumetricWeightKg,
        decimal BillableWeightKg,
        decimal BaseAmountZAR,
        decimal? SurchargeZAR,
        decimal? InsurancePremiumZAR,
        decimal VatAmountZAR,
        decimal TotalAmountZAR,
        int EstimatedDeliveryDays,
        DateTime EstimatedDeliveryDate,
        DateTime ExpiresAt,
        List<QuoteLineItemDto> Breakdown
    );

    public record QuoteLineItemDto(string Label, decimal Amount, string? Note)
    {
        public bool IsTotal { get; init; }
    }
}

namespace CourierSA.Application.DTOs.Bulk
{
    // ── CSV row model (exactly matches the downloadable template) ─────────────
    public sealed class BulkParcelCsvRow
    {
        // Pickup
        public string PickupName { get; set; } = "";
        public string PickupPhone { get; set; } = "";
        public string PickupEmail { get; set; } = "";
        public string PickupStreet { get; set; } = "";
        public string PickupSuburb { get; set; } = "";
        public string PickupCity { get; set; } = "";
        public string PickupProvince { get; set; } = "";
        public string PickupPostalCode { get; set; } = "";

        // Delivery
        public string DeliveryName { get; set; } = "";
        public string DeliveryPhone { get; set; } = "";
        public string DeliveryEmail { get; set; } = "";
        public string DeliveryStreet { get; set; } = "";
        public string DeliverySuburb { get; set; } = "";
        public string DeliveryCity { get; set; } = "";
        public string DeliveryProvince { get; set; } = "";
        public string DeliveryPostalCode { get; set; } = "";

        // Parcel
        public string ServiceType { get; set; } = "";
        public string WeightKg { get; set; } = "";
        public string Description { get; set; } = "";
        public string DeclaredValue { get; set; } = "";
        public string IsFragile { get; set; } = "";
        public string RequiresSignature { get; set; } = "";
        public string InsuranceRequired { get; set; } = "";
        public string SpecialInstructions { get; set; } = "";

        // Optional dimensions
        public string LengthCm { get; set; } = "";
        public string WidthCm { get; set; } = "";
        public string HeightCm { get; set; } = "";

        // Optional reference for the client to track their own order IDs
        public string ClientReference { get; set; } = "";
    }

    // ── Result DTOs ─────────────────────────────────────────────────────────
    public record BulkUploadResultDto(
        int TotalRows,
        int Successful,
        int Failed,
        int Skipped,
        string UploadId,
        DateTime ProcessedAt,
        List<BulkRowResultDto> Rows
    );

    public record BulkRowResultDto(
        int RowNumber,
        bool Success,
        string? TrackingNumber,
        string? ClientReference,
        string? RecipientName,
        string? DestinationCity,
        List<string> Errors
    );
}