using CourierSA.Domain.Enums;
using System.ComponentModel.DataAnnotations.Schema;

namespace CourierSA.Domain.Entities;

// ── Base Entity ───────────────────────────────────────────────────────────────
public abstract class BaseEntity
{
    public Guid     Id         { get; set; } = Guid.NewGuid();
    public DateTime CreatedAt  { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt  { get; set; } = DateTime.UtcNow;
    public bool     IsDeleted  { get; set; } = false;
    public DateTime? DeletedAt { get; set; }
}

// ── User ──────────────────────────────────────────────────────────────────────
public class User : BaseEntity
{
    public string    FirstName            { get; set; } = string.Empty;
    public string    LastName             { get; set; } = string.Empty;
    public string    Email                { get; set; } = string.Empty;
    public string    PhoneNumber          { get; set; } = string.Empty;
    public string    PasswordHash         { get; set; } = string.Empty;
    public UserRole  Role                 { get; set; }
    public UserStatus Status              { get; set; } = UserStatus.Active;
    public int       FailedLoginAttempts  { get; set; }
    public DateTime? LastLoginAt          { get; set; }
    public string?   RefreshToken         { get; set; }
    public DateTime? RefreshTokenExpiryTime { get; set; }

    public string? PasswordResetToken { get; set; }
    public DateTime? PasswordResetTokenExpiry { get; set; }
    public bool MustChangePassword { get; set; } = false;

    public string FullName => $"{FirstName} {LastName}";

    // Nav
    public CustomerProfile? CustomerProfile { get; set; }
    public DriverProfile?   DriverProfile   { get; set; }
    public ICollection<Notification>    Notifications    { get; set; } = [];
    public ICollection<AuditLog>        AuditLogs        { get; set; } = [];
    public ICollection<WalletTransaction> WalletTransactions { get; set; } = [];
}

// ── Customer Profile ──────────────────────────────────────────────────────────
public class CustomerProfile : BaseEntity
{
    public Guid        UserId              { get; set; }
    public AccountType AccountType         { get; set; }
    public string?     CompanyName         { get; set; }
    public string?     VatNumber           { get; set; }
    public string?     DefaultPickupAddress { get; set; }
    public decimal     WalletBalanceZAR    { get; set; }

    public User?               User     { get; set; }
    public ICollection<Parcel> Parcels  { get; set; } = [];
    public ICollection<Quote>  Quotes   { get; set; } = [];
    public ICollection<Invoice> Invoices { get; set; } = [];
}

// ── Driver Profile ────────────────────────────────────────────────────────────
public class DriverProfile : BaseEntity
{
    public Guid         UserId             { get; set; }
    public string       LicenseNumber      { get; set; } = string.Empty;
    public DateTime     LicenseExpiry      { get; set; }
    public DriverStatus Status             { get; set; } = DriverStatus.Available;
    public decimal?     CurrentLatitude    { get; set; }
    public decimal?     CurrentLongitude   { get; set; }
    public int          TotalDeliveries    { get; set; }
    public int          SuccessfulDeliveries { get; set; }

    public User?                       User               { get; set; }
    public ICollection<Delivery>       Deliveries         { get; set; } = [];
    public ICollection<VehicleInspection> VehicleInspections { get; set; } = [];
}

// ── Parcel ────────────────────────────────────────────────────────────────────
public class Parcel : BaseEntity
{
    public string       TrackingNumber      { get; set; } = string.Empty;
    public Guid         CustomerId          { get; set; }
    public ParcelStatus Status              { get; set; } = ParcelStatus.PendingApproval;
    public ServiceType  ServiceType         { get; set; }
    public decimal      WeightKg            { get; set; }
    public ParcelDimensions? Dimensions     { get; set; }
    public decimal?     DeclaredValueZAR    { get; set; }
    public string?      Description         { get; set; }
    public string?      SpecialInstructions { get; set; }
    public bool         IsFragile           { get; set; }
    public bool IsEmergency { get; set; } = false;
    public DateTime? ScheduledPickupDate { get; set; }
    public bool         RequiresSignature   { get; set; }
    public bool         InsuranceRequired   { get; set; }
    public Guid         PickupAddressId     { get; set; }
    public Guid         DeliveryAddressId   { get; set; }
    public decimal?     QuoteAmountZAR      { get; set; }
    public string?      BarcodeImagePath    { get; set; }
    public DateTime?    EstimatedDeliveryDate { get; set; }
    public SortingZone? Zone { get; set; }

    public CustomerProfile? Customer        { get; set; }
    public ParcelAddress?   PickupAddress   { get; set; }
    public ParcelAddress?   DeliveryAddress { get; set; }
    public ICollection<Delivery> Deliveries { get; set; } = [];

    // Most recent delivery leg — replaces the old one-to-one ActiveDelivery.
    // Not mapped to the DB; computed from Deliveries once loaded via .Include().
    [NotMapped]
    public Delivery? ActiveDelivery =>
        Deliveries.OrderByDescending(d => d.CreatedAt).FirstOrDefault();

    public ICollection<TrackingEvent> TrackingEvents { get; set; } = [];
    public ICollection<ParcelInspection> Inspections { get; set; } = [];   // NEW

    public PaymentMethod PaymentMethod { get; set; } = PaymentMethod.CashOnCollection;   // ← add
    public bool IsPaid { get; set; }                                     // ← add
    public DateTime? PaidAt { get; set; }                                     // ← add
}

public class ParcelDimensions
{
    public decimal LengthCm { get; set; }
    public decimal WidthCm  { get; set; }
    public decimal HeightCm { get; set; }
}

// ── Parcel Address ────────────────────────────────────────────────────────────
public class ParcelAddress : BaseEntity
{
    public string     RecipientName       { get; set; } = string.Empty;
    public string     RecipientPhone      { get; set; } = string.Empty;
    public string?    RecipientEmail      { get; set; }
    public string     StreetAddress       { get; set; } = string.Empty;
    public string?    Suburb              { get; set; }
    public string     City                { get; set; } = string.Empty;
    public SaProvince Province            { get; set; }
    public string     PostalCode          { get; set; } = string.Empty;
    public string     Country             { get; set; } = "South Africa";
    public string?    SpecialInstructions { get; set; }
    public decimal?   Latitude            { get; set; }
    public decimal?   Longitude           { get; set; }
}

// ── Tracking Event ────────────────────────────────────────────────────────────
public class TrackingEvent : BaseEntity
{
    public Guid              ParcelId          { get; set; }
    public TrackingEventType EventType         { get; set; }
    public string?           Location          { get; set; }
    public string?           Description       { get; set; }
    public decimal?          Latitude          { get; set; }
    public decimal?          Longitude         { get; set; }
    public DateTime          OccurredAt        { get; set; } = DateTime.UtcNow;
    public Guid?             RecordedByStaffId { get; set; }

    public Parcel? Parcel { get; set; }
}

// ── Delivery ──────────────────────────────────────────────────────────────────
public class Delivery : BaseEntity
{
    public Guid           ParcelId                 { get; set; }
    public Guid           DriverId                 { get; set; }
    public DeliveryStatus Status                   { get; set; } = DeliveryStatus.Assigned;
    public FailureReason? FailureReason            { get; set; }
    public string?        AttemptNotes             { get; set; }
    public string?        ProofOfDeliveryImagePath { get; set; }
    public string?        RecipientSignaturePath   { get; set; }
    public DateTime?      DispatchedAt             { get; set; }
    public DateTime?      DeliveredAt              { get; set; }

    public Parcel?       Parcel { get; set; }
    public DriverProfile? Driver { get; set; }

    public Guid? RouteId { get; set; }
    public DeliveryRoute? Route { get; set; }
}

// ── Quote ─────────────────────────────────────────────────────────────────────
public class Quote : BaseEntity
{
    public Guid        CustomerId          { get; set; }
    public Guid?       ParcelId            { get; set; }
    public QuoteStatus Status              { get; set; } = QuoteStatus.Pending;
    public ServiceType ServiceType         { get; set; }
    public SaProvince  OriginProvince      { get; set; }
    public SaProvince  DestinationProvince { get; set; }
    public decimal     WeightKg            { get; set; }
    public decimal     BaseAmountZAR       { get; set; }
    public decimal?    SurchargeZAR        { get; set; }
    public decimal?    InsurancePremiumZAR { get; set; }
    public decimal     TotalAmountZAR      { get; set; }
    public decimal     VatAmountZAR        { get; set; }
    public DateTime    ExpiresAt           { get; set; }

    public CustomerProfile? Customer { get; set; }
    public bool InsuranceRequired { get; set; }
}

// ── Vehicle ───────────────────────────────────────────────────────────────────
public class Vehicle : BaseEntity
{
    public string        RegistrationNumber  { get; set; } = string.Empty;
    public string?       Make                { get; set; }
    public string?       Model               { get; set; }
    public int           Year                { get; set; }
    public VehicleType   VehicleType         { get; set; }
    public VehicleStatus Status              { get; set; }
    public decimal       PayloadCapacityKg   { get; set; }
    public Guid?         AssignedDriverId    { get; set; }

    public ICollection<VehicleInspection> Inspections { get; set; } = [];
}

// ── Vehicle Inspection ────────────────────────────────────────────────────────
public class VehicleInspection : BaseEntity
{
    public Guid             VehicleId  { get; set; }
    public Guid             DriverId   { get; set; }
    public InspectionType   Type       { get; set; }
    public InspectionResult Result     { get; set; }
    public int?             OdometerKm { get; set; }
    public string?          Notes      { get; set; }
    public string?          PhotoPaths { get; set; }

    public Vehicle?      Vehicle { get; set; }
    public DriverProfile? Driver  { get; set; }
}

// ── Wallet Transaction ────────────────────────────────────────────────────────
public class WalletTransaction : BaseEntity
{
    public Guid                  UserId              { get; set; }
    public WalletTransactionType Type                { get; set; }
    public decimal               AmountZAR           { get; set; }
    public decimal               BalanceAfterZAR     { get; set; }
    public Guid?                 ReferenceId         { get; set; }
    public string?               ReferenceType       { get; set; }
    public string?               Description         { get; set; }
    public string?               ExternalPaymentRef  { get; set; }

    public User? User { get; set; }
}

// ── Invoice ───────────────────────────────────────────────────────────────────
public class Invoice : BaseEntity
{
    public Guid          CustomerId    { get; set; }
    public Guid ParcelId { get; set; }
    public string        InvoiceNumber { get; set; } = string.Empty;
    public InvoiceStatus Status        { get; set; }
    public decimal       SubtotalZAR   { get; set; }
    public decimal       VatZAR        { get; set; }
    public decimal       TotalZAR      { get; set; }
    public decimal       PaidAmountZAR { get; set; }
    public DateTime      DueDate       { get; set; }
    public DateTime?     PaidAt        { get; set; }
    public string?       PdfPath       { get; set; }

    public CustomerProfile?          Customer  { get; set; }
    public ICollection<InvoiceLineItem> LineItems { get; set; } = [];
}

public class InvoiceLineItem : BaseEntity
{
    public string  Description { get; set; } = string.Empty;
    public int     Quantity    { get; set; } = 1;
    public decimal UnitPrice   { get; set; }
    public decimal TotalPrice  => Quantity * UnitPrice;
}

// ── Insurance Claim ───────────────────────────────────────────────────────────
public class InsuranceClaim : BaseEntity
{
    public Guid        ParcelId          { get; set; }
    public Guid        CustomerId        { get; set; }
    public string      ClaimNumber       { get; set; } = string.Empty;
    public ClaimType   Type              { get; set; }
    public ClaimStatus Status            { get; set; } = ClaimStatus.Submitted;
    public decimal     ClaimedAmountZAR  { get; set; }
    public decimal?    ApprovedAmountZAR { get; set; }
    public string?     Description       { get; set; }
    public string?     ResolutionNotes   { get; set; }
    public string?     SupportingDocumentPaths { get; set; }

    public Parcel? Parcel { get; set; }
}

// ── Address Correction ────────────────────────────────────────────────────────
public class AddressCorrectionRequest : BaseEntity
{
    public Guid               ParcelId           { get; set; }
    public Guid               RequestedByUserId  { get; set; }
    public CorrectionStatus   Status             { get; set; }
    public string?            OriginalAddress    { get; set; }
    public string?            CorrectedAddress   { get; set; }
    public string?            Reason             { get; set; }
    public string?            ReviewNotes        { get; set; }
    public Guid?              ReviewedByUserId   { get; set; }
}


// ── Postal Code Zone Rule ─────────────────────────────────────────────────────
public class PostalCodeZoneRule : BaseEntity
{
    public int PostalCodeFrom { get; set; }
    public int PostalCodeTo { get; set; }
    public SortingZone Zone { get; set; }
    public string? Description { get; set; }
}

// ── Sorting Bin ────────────────────────────────────────────────────────────────
public class SortingBin : BaseEntity
{
    public string BinCode { get; set; } = string.Empty;
    public SortingZone Zone { get; set; }
    public int Capacity { get; set; }
    public int CurrentCount { get; set; }
    public bool IsActive { get; set; } = true;

    public ICollection<ParcelSortingAssignment> Assignments { get; set; } = [];
}

// ── Parcel Sorting Assignment ──────────────────────────────────────────────────
public class ParcelSortingAssignment : BaseEntity
{
    public Guid ParcelId { get; set; }
    public Guid? SuggestedBinId { get; set; }
    public Guid? ConfirmedBinId { get; set; }
    public DateTime? ConfirmedAt { get; set; }
    public Guid? ConfirmedByStaffId { get; set; }
    public DateTime? ReleasedAt { get; set; }

    public Parcel? Parcel { get; set; }
    public SortingBin? SuggestedBin { get; set; }
    public SortingBin? ConfirmedBin { get; set; }
}

// ── Notification ──────────────────────────────────────────────────────────────
public class Notification : BaseEntity
{
    public Guid                 UserId        { get; set; }
    public NotificationType     Type          { get; set; }
    public NotificationChannel  Channel       { get; set; }
    public string               Title         { get; set; } = string.Empty;
    public string               Body          { get; set; } = string.Empty;
    public bool                 IsRead        { get; set; }
    public DateTime?            ReadAt        { get; set; }
    public Guid?                ReferenceId   { get; set; }
    public string?              ReferenceType { get; set; }

    public User? User { get; set; }
}

// ── Audit Log ─────────────────────────────────────────────────────────────────
public class AuditLog : BaseEntity
{
    public string  Action     { get; set; } = string.Empty;
    public string  EntityType { get; set; } = string.Empty;
    public Guid?   EntityId   { get; set; }
    public string? OldValues  { get; set; }
    public string? NewValues  { get; set; }
    public Guid?   UserId     { get; set; }
    public string? IpAddress  { get; set; }
    public string? UserAgent  { get; set; }

    public User? User { get; set; }
}

public class DeliveryRoute : BaseEntity
{
    public Guid DriverId { get; set; }
    public SortingZone Zone { get; set; }
    public RouteStatus Status { get; set; } = RouteStatus.Planned;
    public DateTime? DispatchedAt { get; set; }
    public DateTime? CompletedAt { get; set; }

    public DriverProfile? Driver { get; set; }
    public ICollection<Delivery> Deliveries { get; set; } = [];
}

// ── Parcel Inspection ─────────────────────────────────────────────────────────
public class ParcelInspection : BaseEntity
{
    public Guid ParcelId { get; set; }
    public ParcelInspectionStage Stage { get; set; }
    public ParcelInspectionResult Result { get; set; } = ParcelInspectionResult.Pass;
    public Guid StaffId { get; set; }   // User.Id — no nav, mirrors ParcelSortingAssignment.ConfirmedByStaffId

    // Exterior-only checklist — never opens sealed parcels
    public bool PackagingIntact { get; set; }
    public bool NoMoistureDamage { get; set; }
    public bool WeightMatchesDeclared { get; set; }
    public bool? FragileHandlingOk { get; set; }   // null = not fragile, N/A
    public bool SealIntact { get; set; }

    public string? Notes { get; set; }
    public string? PhotoPaths { get; set; }

    public Parcel? Parcel { get; set; }
}


public class LostParcelCase : BaseEntity
{
    public Guid ParcelId { get; set; }
    public Guid CustomerId { get; set; }   // CustomerProfile.Id — NOT User.Id
    public string CaseNumber { get; set; } = string.Empty;
    public LostParcelCaseStatus Status { get; set; } = LostParcelCaseStatus.Reported;

    public string? CustomerNotes { get; set; }
    public string? InvestigationNotes { get; set; }
    public Guid? InvestigatedByStaffId { get; set; }   // User.Id, no nav — mirrors ParcelInspection.StaffId

    public DateTime ReportedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ResolvedAt { get; set; }
    public DateTime? ClosedAt { get; set; }

    public Guid? InsuranceClaimId { get; set; }

    public Parcel? Parcel { get; set; }
    public InsuranceClaim? InsuranceClaim { get; set; }
}

public class ReturnRequest : BaseEntity
{
    public Guid ParcelId { get; set; }
    public Guid CustomerId { get; set; }   // CustomerProfile.Id — not User.Id
    public string RaNumber { get; set; } = string.Empty;
    public ReturnRequestStatus Status { get; set; } = ReturnRequestStatus.Requested;
    public string Reason { get; set; } = string.Empty;
    public Guid CollectionAddressId { get; set; }

    public DateTime RequestedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ApprovedAt { get; set; }
    public DateTime? ReceivedAt { get; set; }
    public Guid? ReceivedByStaffId { get; set; }

    public ReturnItemCondition? InspectionResult { get; set; }
    public string? InspectionNotes { get; set; }

    public decimal? RefundAmountZAR { get; set; }
    public DateTime? RefundedAt { get; set; }
    public Guid? RefundApprovedByStaffId { get; set; }

    public Parcel? Parcel { get; set; }
    public ParcelAddress? CollectionAddress { get; set; }
}
