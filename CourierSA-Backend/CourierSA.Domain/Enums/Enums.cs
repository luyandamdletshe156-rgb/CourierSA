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
    Draft,
    PendingApproval,
    Approved,
    InWarehouse,
    AwaitingCheckIn,
    OutForDelivery,
    Delivered,
    FailedDelivery,
    Cancelled,
    Returned
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
    Booked,
    Approved,
    Rejected,
    ReceivedAtWarehouse,
    OutForDelivery,
    DeliveryAttempted,
    Delivered,
    DeliveryFailed,
    ReturnInitiated,
    Returned,
    Cancelled,
    AddressCorrected,
    ExceptionRaised
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
    RecipientAbsent,
    AddressNotFound,
    AccessDenied,
    ParcelDamaged,
    RefusedDelivery,
    InsufficientPayment,
    Other
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
