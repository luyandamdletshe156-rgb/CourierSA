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


    public record LogParcelInspectionDto(
    ParcelInspectionStage Stage,
    bool PackagingIntact,
    bool NoMoistureDamage,
    bool WeightMatchesDeclared,
    bool? FragileHandlingOk,
    bool SealIntact,
    ParcelInspectionResult Result,
    string? Notes
);

    public record ParcelInspectionDto(
        Guid Id, Guid ParcelId, string TrackingNumber,
        string Stage, string Result,
        bool PackagingIntact, bool NoMoistureDamage, bool WeightMatchesDeclared,
        bool? FragileHandlingOk, bool SealIntact,
        string? Notes, DateTime CreatedAt
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
    DateTime? EstimatedDeliveryDate,
   string? BinCode = null,
    string? Zone = null
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
    DeliveryDto? ActiveDelivery,
    string? PaymentMethod = null,
    bool IsPaid = false,
    DateTime? PaidAt = null,
    string? ClaimStatus = null
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
public record CheckInDto(Guid SortingBinId); public record DispatchParcelDto(Guid DriverId);
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
    Guid Id,
    Guid ParcelId,
    string TrackingNumber,
    string Status,
    string RecipientName,
    string RecipientPhone,
    string DeliveryAddress,
    string City,
    string? SpecialInstructions,
    bool IsFragile,
    DateTime? DispatchedAt,    // Changed to DateTime? to fix the CS1503 errors
    bool IsPickup,             // The new flag we added for the frontend
    string? DriverName = null, // Restored to fix the CS0117 errors
    string? DriverPhone = null, // Restored to fix the CS0117 errors
    Guid? RouteId = null
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

namespace CourierSA.Application.DTOs.Vehicles
{
    // ── Requests ─────────────────────────────────────────────────────────────

    public record CreateVehicleDto(
        string RegistrationNumber,
        string? Make,
        string? Model,
        int Year,
        VehicleType VehicleType,
        decimal PayloadCapacityKg
    );

    public record UpdateVehicleDto(
        string RegistrationNumber,
        string? Make,
        string? Model,
        int Year,
        VehicleType VehicleType,
        decimal PayloadCapacityKg
    );

    public record AssignDriverDto(
        Guid? DriverId
    );

    // ── Responses ────────────────────────────────────────────────────────────

    // For the GET /api/drivers directory
    public record DriverDirectoryItemDto(
        Guid Id,
        string FirstName,
        string LastName,
        string Status,
        string LicenseNumber
    );

    // For the GET /api/admin/vehicles list
    public record VehicleBaseDto(
        Guid Id,
        string RegistrationNumber,
        string? Make,
        string? Model,
        int Year,
        string VehicleType,
        string Status,
        decimal PayloadCapacityKg,
        Guid? AssignedDriverId
    );

    // For the GET /api/dispatcher/vehicles list
    public record DispatcherVehicleDto(
        Guid Id,
        string RegistrationNumber,
        string? Make,
        string? Model,
        string Status,
        Guid? AssignedDriverId,
        DispatcherDriverDto? AssignedDriver,
        LastInspectionDto? LastInspection
    );

    // Sub-records for the Dispatcher view
    public record DispatcherDriverDto(
        Guid Id,
        string FirstName,
        string LastName
    );

    public record LastInspectionDto(
        string Result,
        DateTime CreatedAt
    );

   
    public record CreateInspectionDto(
        Guid VehicleId,
        InspectionType Type,
        InspectionResult Result,
        int? OdometerKm,
        string? Notes,
        string? PhotoPaths
    );




}

namespace CourierSA.Application.DTOs.Sorting
{
    public record SortingBinDto(
        Guid Id,
        string BinCode,
        string Zone,
        int Capacity,
        int CurrentCount
    );

    public record SortingSuggestionDto(
        Guid ParcelId,
        string? ParcelZone,
        Guid? SuggestedBinId,
        List<SortingBinDto> Bins
    );
}
// ─────────────────────────────────────────────────────────────────────────────
// Add this at the bottom of your DTO file
namespace CourierSA.Application.DTOs.Invoices
{
    public record InvoiceDashboardDto(
        int TotalInvoices,
        decimal AmountDue,
        int OverdueCount,
        List<InvoiceSummaryDto> Invoices
    );

    public record InvoiceSummaryDto(
        Guid Id,
        string InvoiceNumber,
        DateTime CreatedAt,
        DateTime DueDate,
        decimal TotalAmount,
        string Status
    );
}

namespace CourierSA.Application.DTOs.Routing
{
    public record CreateRouteDto(List<Guid> ParcelIds, Guid DriverId);

    public record RouteStopDto(
        Guid DeliveryId,
        Guid ParcelId,
        string TrackingNumber,
        string Status,
        string RecipientName,
        string DeliveryAddress,
        string City
    );

    public record RouteSummaryDto(
        Guid RouteId,
        string Zone,
        string Status,
        DateTime? DispatchedAt,
        List<RouteStopDto> Stops
    );
}
