namespace CourierSA.Domain.Enums;

public enum UserRole
{
    Customer,
    BusinessClient,
    Driver,
    Dispatcher,
    WarehouseStaff,
    Administrator
}

public enum UserStatus
{
    Active,
    PendingVerification,
    Suspended,
    Deactivated
}

public enum AccountType
{
    Individual,
    Business
}

public enum ParcelStatus
{
    Draft = 0,
    PendingApproval = 1,
    Approved = 2,
    InWarehouse = 3,
    AwaitingCheckIn = 4,
    OutForDelivery = 5,
    Delivered = 6,
    FailedDelivery = 7,
    Cancelled = 8,
    CheckedOut = 10,
    Lost = 11,
    Returned = 12
}

public enum ServiceType
{
    Economy,
    Standard,
    Express,
    Overnight,
    SameDay
}

public enum SaProvince
{
    Gauteng,
    WesternCape,
    EasternCape,
    KwaZuluNatal,
    Limpopo,
    Mpumalanga,
    NorthWest,
    NorthernCape,
    FreeState
}

public enum SortingZone
{
    Local,
    Metro,
    Regional,
    National
}

public enum TrackingEventType
{
    Booked, Approved, Rejected, ReceivedAtWarehouse, OutForDelivery,
    DeliveryAttempted, Delivered, DeliveryFailed, ReturnInitiated,
    Returned, Cancelled, AddressCorrected, ExceptionRaised,
    CheckedOut,
    LostParcelReported,
    LostParcelConfirmed,
    HighValueFlagged,
    OtpVerified,
    CollectionRescheduled,
    ReturnCollectionDispatched,
    ReturnCollected
}
public enum DeliveryStatus
{
    Assigned,
    InProgress,
    Delivered,
    Failed,
    Returned
}

public enum FailureReason
{
    // Legacy generic values — retained for backward compatibility with existing
    // records; new UI no longer offers these directly (see the UC03/UC04-specific
    // values below, which map 1:1 onto the SRS use case descriptions).
    RecipientAbsent,
    AddressNotFound,
    AccessDenied,
    ParcelDamaged,
    RefusedDelivery,
    InsufficientPayment,
    Other,

    // UC03 — Handle Failed Parcel Collection (pickup-side reasons, per SRS flow step 4)
    SenderUnavailable,
    ParcelNotReady,
    IncorrectCollectionAddress,
    ParcelInformationMismatch,

    // UC04 — Resolve Delivery Exception (delivery-side reasons, per SRS flow step 3)
    RecipientUnavailable,
    IncorrectAddress,
    RestrictedAccess,
    RecipientRefusedParcel
}

public enum DriverStatus
{
    Available,
    OnDelivery,
    OffDuty,
    Suspended
}

public enum VehicleType
{
    Motorcycle,
    LightDeliveryVehicle,
    Van,
    Truck,
    HeavyTruck
}

public enum VehicleStatus
{
    Active,
    InMaintenance,
    Retired
}

public enum InspectionType
{
    PreTrip,
    PostTrip,
    Periodic
}

public enum InspectionResult
{
    Pass,
    PassWithMinorIssues,
    Fail
}

public enum ParcelInspectionStage
{
    CheckIn,   // parcel arrives at warehouse — "as received" baseline
    Checkout   // parcel about to leave warehouse — compared against CheckIn
}

public enum ParcelInspectionResult
{
    Pass,
    Damaged,
    Rejected   // e.g. broken seal / tamper evidence
}

public enum QuoteStatus
{
    Pending,
    Accepted,
    Expired,
    Cancelled
}

public enum WalletTransactionType
{
    Credit,
    Debit,
    Refund,
    Adjustment
}

public enum InvoiceStatus
{
    Draft,
    Issued,
    PartiallyPaid,
    Paid,
    Overdue,
    Cancelled,
    Voided
}

public enum ClaimType
{
    Damage,
    Loss,
    Delay,
    WrongDelivery
}

public enum ClaimStatus
{
    Submitted,
    UnderReview,
    Approved,
    PartiallyApproved,
    Rejected,
    Settled
}

public enum CorrectionStatus
{
    Pending,
    Approved,
    Rejected
}

public enum NotificationType
{
    ParcelBooked,
    ParcelApproved,
    ParcelRejected,
    ParcelDispatched,
    ParcelDelivered,
    DeliveryFailed,
    ClaimUpdated,
    WalletTopUp,
    InvoiceIssued,
    SystemAlert
}

public enum NotificationChannel
{
    InApp,
    Email,
    Sms,
    Push
}

public enum PaymentMethod
{
    Wallet,
    Card,
    EFT,
    CashOnCollection
}

public enum RouteStatus
{
    Planned,
    InProgress,
    Completed
}

public enum LostParcelCaseStatus
{
    Reported,
    UnderInvestigation,
    Found,
    ConfirmedLost,
    Closed
}

// ── UC-FRAUD-01 — Detect and Restrict High-Risk Customer Accounts ─────────────
public enum CustomerRiskLevel
{
    Low,
    Medium,
    High
}

public enum LostParcelResolution
{
    Found,
    ConfirmedLost
}

public enum ReturnRequestStatus
{
    Requested,
    Approved,
    Received,
    ReadyForRefund,
    InspectionFailed,
    Refunded,
    Closed,
    Dispatched,   // driver assigned for reverse-leg collection from the customer
    Collected     // driver has picked up the parcel; awaiting warehouse intake
}

public enum ReturnItemCondition
{
    Acceptable,
    Damaged,
    Missing
}

// ══════════════════════════════════════════════════════════════════════════════
// UC02 — Handle Damaged Parcel at Collection
// ══════════════════════════════════════════════════════════════════════════════

/// <summary>Predefined damage categories the driver selects from at collection.</summary>
public enum DamageType
{
    Crushed,
    TornOrPunctured,
    WaterDamage,
    Leaking,
    BrokenOrShattered,
    Other
}

/// <summary>Severity level the driver assigns — drives the system's threshold evaluation.</summary>
public enum DamageSeverity
{
    Minor,
    Moderate,
    Severe
}

/// <summary>The outcome the system (and, for escalations, the dispatcher) resolves the report to.</summary>
public enum CollectionDamageOutcome
{
    Proceed,     // driver may accept custody and continue the collection
    Escalated,   // held pending a dispatcher decision
    Rejected     // collection refused; treated as a failed pickup
}

public enum CollectionDamageReportStatus
{
    PendingDispatcherReview,
    Resolved
}

// ══════════════════════════════════════════════════════════════════════════════
// UC03 / UC04 — Failed Parcel Collection & Delivery Exception next-action engine
// ══════════════════════════════════════════════════════════════════════════════

/// <summary>System-recommended next step, computed from the failure reason (and, for
/// deliveries, the attempt count) — surfaced to the dispatcher's queue.</summary>
public enum ExceptionResolutionAction
{
    NotifyCustomerToReschedule,             // pickup: sender/parcel-side issue, customer follow-up needed
    AutoRescheduleNextAttempt,               // delivery: transient issue, safe to auto re-attempt
    EscalateForAddressCorrection,            // address is wrong — needs dispatcher/customer correction
    EscalateForAccessArrangement,            // restricted access — needs special arrangement
    RouteToReturnToSender,                   // recipient refused — route back through reverse logistics
    RequiresManualReview                     // ambiguous / "Other" — dispatcher must triage manually
}