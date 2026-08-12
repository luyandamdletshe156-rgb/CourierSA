using CourierSA.Application.DTOs.Parcels;
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
public record UpdateDriverStatusDto(DriverStatus Status);

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
         bool IsEmergency = false,
        DateTime? ScheduledPickupDate = null,
         string? CardToken = null
    );

    // ── Batch booking (multi-parcel cart checkout) ──────────────────────────
    // One entry per parcel in the customer's cart. PaymentMethod and CardToken
    // are NOT repeated per item — they're shared for the whole batch, matching
    // how the frontend cart checkout works (one payment covers the batch).
    public record CreateParcelBatchItemDto(
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
        bool IsEmergency = false,
        DateTime? ScheduledPickupDate = null
    );

    public record CreateParcelBatchDto(
        List<CreateParcelBatchItemDto> Parcels,
        PaymentMethod PaymentMethod,
        string? CardToken = null
    );

    public record ParcelBatchResultDto(
        List<ParcelDetailDto> Parcels,
        decimal TotalAmountZAR
    );

    public record CreateAddressDto(
    string RecipientName,
    string RecipientPhone,
    string? RecipientEmail,
    string StreetAddress,
    string? Suburb,
    string City,
    SaProvince Province,
    string PostalCode,
    string? Country,
    string? SpecialInstructions
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
    Guid Id,
    string TrackingNumber,
    string Status,
    string ServiceType,
    string DestinationCity,
    string DestinationProvince,
    decimal WeightKg,
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
    bool IsEmergency,
        DateTime? ScheduledPickupDate,
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
    string TrackingNumber,
    string Status,
    string ServiceType,
    string Destination,
    DateTime? EstimatedDelivery,
    List<TrackingEventDto> Events
);

public record TrackingEventDto(
    string EventType,
    string? Location,
    string? Description,
    DateTime OccurredAt,
    decimal? Latitude,
    decimal? Longitude
);

public record ParcelFilterDto(
    int Page = 1,
    int PageSize = 10,
    string? Status = null,
    string? Search = null
);

public record PagedResult<T>(
    List<T> Items,
    int TotalCount,
    int Page,
    int PageSize
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
    string? Notes
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
    DateTime? DispatchedAt,
    bool IsPickup,
    string? DriverName = null,
    string? DriverPhone = null,
    Guid? RouteId = null,
    bool RequiresOtpVerification = false,   // ← ADD
    bool OtpVerified = false                // ← ADD
);
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


public record CancelParcelQuoteDto(
    Guid ParcelId,
    string TrackingNumber,
    string CurrentStatus,
    bool IsEligible,
    bool IsFeeApplicable,
    bool RequiresCancellationOtp, // 👈 True if parcel is in warehouse
    decimal CancellationFeeZAR,
    decimal QuoteAmountZAR,
    decimal EstimatedRefundZAR,
    string Reason
);

public record CancelParcelDto(
    string Reason,
    string? Otp // 👈 Required ONLY when RequiresCancellationOtp is true
);

public record CancelParcelResultDto(
    Guid ParcelId,
    string TrackingNumber,
    decimal RefundAmountZAR,
    decimal CancellationFeeZAR,
    string ChargeMethod,
    string Message
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


namespace CourierSA.Application.DTOs.LostParcel
{

    public record ReportLostParcelDto(string TrackingNumber, string? CustomerNotes);

    public record InvestigateLostParcelCaseDto(string Notes);

    public record ResolveLostParcelCaseDto(LostParcelResolution Outcome, string? Notes);

    public record SubmitInsuranceClaimDto(decimal? ClaimAmountOverrideZAR, string? Notes);

    public record UpdateClaimStatusDto(ClaimStatus Status, decimal? ApprovedAmountZAR, string? Notes);

    public record LostParcelCaseDto(
        Guid Id, string CaseNumber, Guid ParcelId, string TrackingNumber,
        string Status, string? CustomerNotes, string? InvestigationNotes,
        DateTime ReportedAt, DateTime? ResolvedAt, DateTime? ClosedAt,
        Guid? InsuranceClaimId, string? ClaimNumber, string? ClaimStatus);

    public record InsuranceClaimDto(
        Guid Id, string ClaimNumber, Guid ParcelId, string TrackingNumber,
        string Type, string Status, decimal ClaimedAmountZAR, decimal? ApprovedAmountZAR,
        string? Description, string? ResolutionNotes, DateTime CreatedAt);
}


namespace CourierSA.Application.DTOs.Returns
{

    public record RequestReturnDto(string TrackingNumber, string Reason, CreateAddressDto CollectionAddress);

    public record InspectReturnDto(ReturnItemCondition Result, string? Notes);

    public record ReleaseRefundDto(string? Notes);

    public record DispatchReturnCollectionDto(Guid DriverId);

    public record ReturnRequestDto(
        Guid Id, string RaNumber, Guid ParcelId, string TrackingNumber, string Status,
        string Reason, ParcelAddressDto? CollectionAddress,
        DateTime RequestedAt, DateTime? ApprovedAt, DateTime? ReceivedAt,
        string? InspectionResult, string? InspectionNotes,
        decimal? RefundAmountZAR, DateTime? RefundedAt,
        decimal? OriginalAmountZAR, decimal? HandlingFeeZAR, decimal? ExpectedRefundAmountZAR,
        Guid? AssignedDriverId, string? AssignedDriverName, DateTime? DispatchedAt, DateTime? CollectedAt);


}


namespace CourierSA.Application.DTOs.SecureDelivery
{

    public record FlagHighValueResultDto(
        Guid ParcelId, string TrackingNumber, bool RequiresOtpVerification,
        string? Otp,   // plaintext, demo-only — see note in service comments
        DateTime? OtpGeneratedAt);

    public record VerifyOtpDto(string Otp);

    public record VerifyOtpResultDto(Guid ParcelId, string TrackingNumber, bool Verified, DateTime? OtpVerifiedAt);

}

namespace CourierSA.Application.DTOs.Rescheduling
{

    public record RescheduleQuoteDto(
        DateTime CurrentScheduledPickupDate, DateTime ProposedScheduledPickupDate,
        bool IsFeeApplicable, decimal FeeZAR, string Reason);

    public record RescheduleCollectionDto(DateTime NewScheduledPickupDate);

    public record RescheduleResultDto(
        Guid ParcelId, string TrackingNumber, DateTime NewScheduledPickupDate,
        bool FeeCharged, decimal FeeZAR, string ChargeMethod);
}