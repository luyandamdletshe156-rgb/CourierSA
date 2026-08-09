using CourierSA.Application.DTOs.Auth;
using CourierSA.Application.DTOs.Bulk;
using CourierSA.Application.DTOs.Invoices;
using CourierSA.Application.DTOs.LostParcel;
using CourierSA.Application.DTOs.Parcels;
using CourierSA.Application.DTOs.Quotes;
using CourierSA.Application.DTOs.Rescheduling;
using CourierSA.Application.DTOs.Returns;
using CourierSA.Application.DTOs.Routing;
using CourierSA.Application.DTOs.SecureDelivery;
using CourierSA.Application.DTOs.Sorting;
using CourierSA.Domain.Entities;
using System.Security.Claims;

namespace CourierSA.Application.Interfaces.Services;

// ── Auth ──────────────────────────────────────────────────────────────────────
public interface IAuthService
{
    Task<AuthResponseDto> LoginAsync(LoginDto dto, string ipAddress, CancellationToken ct = default);
    Task<AuthResponseDto> RegisterAsync(RegisterDto dto, string ipAddress, CancellationToken ct = default);
    Task<AuthResponseDto> RefreshTokenAsync(string refreshToken, CancellationToken ct = default);
    Task RevokeTokenAsync(Guid userId, CancellationToken ct = default);

    Task ForgotPasswordAsync(string email, CancellationToken ct = default);
    Task ResetPasswordAsync(ResetPasswordDto dto, CancellationToken ct = default);
    Task<User> CreateStaffUserAsync(CreateStaffUserDto dto, Guid createdByAdminId, CancellationToken ct = default);  // ← add
    Task ChangePasswordAsync(Guid userId, ChangePasswordDto dto, CancellationToken ct = default);

}

public interface ITokenService
{
    string GenerateAccessToken(User user);
    string GenerateRefreshToken();
    ClaimsPrincipal? ValidateAccessToken(string token);
    DateTime GetRefreshTokenExpiry();
}

public interface IPasswordService
{
    string Hash(string password);
    bool Verify(string password, string storedHash);
}

public interface IParcelService
{
    Task<ParcelDetailDto> BookAsync(CreateParcelDto dto, Guid customerId, CancellationToken ct = default);
    Task<ParcelBatchResultDto> BookBatchAsync(CreateParcelBatchDto dto, Guid customerId, CancellationToken ct = default);
    Task ApproveAsync(Guid parcelId, Guid staffId, CancellationToken ct = default);
    Task RejectAsync(Guid parcelId, string reason, Guid staffId, CancellationToken ct = default);
    Task CheckInAsync(Guid parcelId, Guid sortingBinId, Guid staffId, CancellationToken ct = default);
    Task<SortingSuggestionDto> GetSortingSuggestionAsync(Guid parcelId, CancellationToken ct = default);
    Task DispatchAsync(Guid parcelId, Guid driverId, Guid dispatcherId, CancellationToken ct = default);
    Task MarkDeliveredAsync(Guid deliveryId, ProofOfDeliveryDto pod, Guid driverId, CancellationToken ct = default);
    Task MarkFailedAsync(Guid deliveryId, FailedDeliveryDto dto, Guid driverId, CancellationToken ct = default);
    Task<PagedResult<ParcelSummaryDto>> GetQueueAsync(ParcelFilterDto filter, CancellationToken ct = default);
    Task<TrackingResultDto?> TrackAsync(string trackingNumber, CancellationToken ct = default);
    Task<ParcelDetailDto?> GetDetailAsync(Guid id, CancellationToken ct = default);
    Task<ParcelDetailDto?> GetPrivateTrackingAsync(string trackingNumber, Guid requestingUserId, CancellationToken ct = default); // ← ADD
    Task<PagedResult<ParcelSummaryDto>> GetPagedAsync(ParcelFilterDto filter, Guid customerId, CancellationToken ct = default);
    Task<IEnumerable<DeliveryDto>> GetDriverDeliveriesAsync(Guid driverId, CancellationToken ct = default);
    Task<Guid?> UpdateDriverLocationAsync(Guid userId, decimal lat, decimal lng, CancellationToken ct = default);
    Task<RouteSummaryDto> DispatchRouteAsync(CreateRouteDto dto, Guid dispatcherId, CancellationToken ct = default);
    Task CheckoutAsync(Guid parcelId, Guid staffId, CancellationToken ct = default);
    Task<ParcelInspectionDto> LogInspectionAsync(Guid parcelId, LogParcelInspectionDto dto, Guid staffId, CancellationToken ct = default);
    Task<IEnumerable<ParcelInspectionDto>> GetInspectionsAsync(CancellationToken ct = default);
}


// ── Quotes ────────────────────────────────────────────────────────────────────
public interface IQuoteService
{
    Task<QuoteResponseDto> CalculateAsync(QuoteRequestDto dto, Guid? customerId, CancellationToken ct = default);
    Task<Quote?> GetAsync(Guid quoteId, CancellationToken ct = default);
}

// ── Bulk CSV ──────────────────────────────────────────────────────────────────
public interface IBulkCsvService
{
    Task<List<(BulkParcelCsvRow Row, int RowNum, List<string> Errors)>>
        ParseAndValidateAsync(Stream csvStream, CancellationToken ct = default);

    Task<BulkUploadResultDto> ProcessAsync(
        Stream csvStream, Guid uploadedByUserId,
        string? fileName = null, CancellationToken ct = default);

    byte[] GenerateTemplateBytes();
}

// ── Notifications ─────────────────────────────────────────────────────────────
public interface INotificationService
{
    Task SendParcelBookedAsync(
    Guid userId, string trackingNumber,
    string? serviceType = null, string? destinationCity = null, decimal? amountZAR = null,
    CancellationToken ct = default);
    Task SendDispatchedAsync(Guid userId, string trackingNumber, CancellationToken ct = default);
    Task SendDeliveredAsync(Guid userId, string trackingNumber, CancellationToken ct = default);
    Task SendFailedDeliveryAsync(Guid userId, string trackingNumber, string reason, CancellationToken ct = default);
    Task SendClaimStatusUpdateAsync(Guid userId, string claimNumber, string status, CancellationToken ct = default);
    Task SendWalletTopUpAsync(Guid userId, decimal amount, CancellationToken ct = default);
    Task SendSystemAlertAsync(Guid userId, string title, string body, CancellationToken ct = default);
    Task<IEnumerable<Notification>> GetUnreadAsync(Guid userId, CancellationToken ct = default);
    Task MarkReadAsync(Guid notificationId, CancellationToken ct = default);
    Task MarkAllReadAsync(Guid userId, CancellationToken ct = default);
    Task SendParcelDamagedAsync(Guid userId, string trackingNumber, string stage, CancellationToken ct = default);
}

// ── Audit ─────────────────────────────────────────────────────────────────────
public interface IAuditService
{
    Task LogAsync(
        string action,
        string entityType,
        Guid? entityId,
        object? oldValues,
        object? newValues,
        Guid? performedByUserId,
        string? ipAddress,
        CancellationToken ct = default);
}

// ── Storage ───────────────────────────────────────────────────────────────────
public interface IStorageService
{
    Task<string> UploadAsync(Stream stream, string fileName, string contentType, CancellationToken ct = default);
    Task<Stream> DownloadAsync(string filePath, CancellationToken ct = default);
    Task DeleteAsync(string filePath, CancellationToken ct = default);
    Task<bool> ExistsAsync(string filePath, CancellationToken ct = default);
}

// ── Barcode ───────────────────────────────────────────────────────────────────
public interface IBarcodeService
{
    Task<string> GenerateAsync(string trackingNumber, CancellationToken ct = default);
    Task<byte[]> GetBytesAsync(string trackingNumber, CancellationToken ct = default);
}

// ── Email ─────────────────────────────────────────────────────────────────────
public interface IEmailService
{
    Task SendAsync(string to, string subject, string htmlBody, CancellationToken ct = default);
}

public interface ITrackingHubService
{
    Task NotifyParcelStatusChangedAsync(
        string trackingNumber, string newStatus,
        string? location = null, CancellationToken ct = default);

    Task NotifyAdminDashboardAsync(
        object stats, CancellationToken ct = default);

    Task NotifyDriverNewAssignmentAsync(
        Guid driverId, object deliveryDetails, CancellationToken ct = default);
}
public interface IInvoiceService
{
    Task<InvoiceDashboardDto> GetCustomerInvoiceDashboardAsync(Guid userId, CancellationToken ct = default);
}

public interface ILostParcelService
{
    Task<LostParcelCaseDto> ReportAsync(ReportLostParcelDto dto, Guid customerUserId, CancellationToken ct = default);
    Task<LostParcelCaseDto> InvestigateAsync(Guid caseId, InvestigateLostParcelCaseDto dto, Guid staffUserId, CancellationToken ct = default);
    Task<LostParcelCaseDto> ResolveAsync(Guid caseId, ResolveLostParcelCaseDto dto, Guid staffUserId, CancellationToken ct = default);
    Task<InsuranceClaimDto> SubmitInsuranceClaimAsync(Guid caseId, SubmitInsuranceClaimDto dto, Guid staffUserId, CancellationToken ct = default);
    Task<InsuranceClaimDto> UpdateClaimStatusAsync(Guid claimId, UpdateClaimStatusDto dto, Guid staffUserId, CancellationToken ct = default);
    Task<LostParcelCaseDto?> GetCaseDetailAsync(Guid caseId, CancellationToken ct = default);
    Task<IEnumerable<LostParcelCaseDto>> GetMyCasesAsync(Guid customerUserId, CancellationToken ct = default);
    Task<IEnumerable<LostParcelCaseDto>> GetQueueAsync(string? status, CancellationToken ct = default);
}

public interface IReturnService
{
    Task<ReturnRequestDto> RequestReturnAsync(RequestReturnDto dto, Guid customerUserId, CancellationToken ct = default);
    Task<ReturnRequestDto> ReceiveAsync(Guid returnId, Guid staffUserId, CancellationToken ct = default);
    Task<ReturnRequestDto> InspectAsync(Guid returnId, InspectReturnDto dto, Guid staffUserId, CancellationToken ct = default);
    Task<ReturnRequestDto> ReleaseRefundAsync(Guid returnId, ReleaseRefundDto dto, Guid staffUserId, CancellationToken ct = default);
    Task<ReturnRequestDto?> GetDetailAsync(Guid returnId, CancellationToken ct = default);
    Task<IEnumerable<ReturnRequestDto>> GetMyReturnsAsync(Guid customerUserId, CancellationToken ct = default);
    Task<IEnumerable<ReturnRequestDto>> GetQueueAsync(string? status, CancellationToken ct = default);
}

public interface ISecureDeliveryService
{
    Task<FlagHighValueResultDto> FlagAndGenerateOtpAsync(Guid parcelId, Guid dispatcherUserId, CancellationToken ct = default);
    Task<VerifyOtpResultDto> VerifyOtpAsync(Guid parcelId, VerifyOtpDto dto, Guid driverUserId, CancellationToken ct = default);
}

public interface IReschedulingService
{
    Task<RescheduleQuoteDto> PreviewFeeAsync(Guid parcelId, DateTime proposedDate, Guid customerUserId, CancellationToken ct = default);
    Task<RescheduleResultDto> RescheduleAsync(Guid parcelId, RescheduleCollectionDto dto, Guid customerUserId, CancellationToken ct = default);
}