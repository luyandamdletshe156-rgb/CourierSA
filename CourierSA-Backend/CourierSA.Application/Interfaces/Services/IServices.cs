using CourierSA.Application.DTOs.Auth;
using CourierSA.Application.DTOs.Parcels;
using CourierSA.Application.DTOs.Quotes;
using CourierSA.Domain.Entities;
using System.Security.Claims;
using CourierSA.Application.DTOs.Bulk;

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
    string          GenerateAccessToken(User user);
    string          GenerateRefreshToken();
    ClaimsPrincipal? ValidateAccessToken(string token);
    DateTime        GetRefreshTokenExpiry();
}

public interface IPasswordService
{
    string Hash(string password);
    bool   Verify(string password, string storedHash);
}

// ── Parcels ───────────────────────────────────────────────────────────────────
public interface IParcelService
{
    Task<ParcelDetailDto>            BookAsync(CreateParcelDto dto, Guid customerId, CancellationToken ct = default);
    Task                             ApproveAsync(Guid parcelId, Guid staffId, CancellationToken ct = default);
    Task                             RejectAsync(Guid parcelId, string reason, Guid staffId, CancellationToken ct = default);
    Task                             CheckInAsync(Guid parcelId, string warehouseLocation, Guid staffId, CancellationToken ct = default);
    Task                             DispatchAsync(Guid parcelId, Guid driverId, Guid dispatcherId, CancellationToken ct = default);
    Task                             MarkDeliveredAsync(Guid deliveryId, ProofOfDeliveryDto pod, Guid driverId, CancellationToken ct = default);
    Task                             MarkFailedAsync(Guid deliveryId, FailedDeliveryDto dto, Guid driverId, CancellationToken ct = default);
    Task<PagedResult<ParcelSummaryDto>> GetQueueAsync(ParcelFilterDto filter, CancellationToken ct = default); // NEW
    Task<TrackingResultDto?>         TrackAsync(string trackingNumber, CancellationToken ct = default);
    Task<ParcelDetailDto?>           GetDetailAsync(Guid id, CancellationToken ct = default);
    Task<PagedResult<ParcelSummaryDto>> GetPagedAsync(ParcelFilterDto filter, Guid customerId, CancellationToken ct = default);
    Task<IEnumerable<DeliveryDto>>   GetDriverDeliveriesAsync(Guid driverId, CancellationToken ct = default);
    Task                             UpdateDriverLocationAsync(Guid driverId, decimal lat, decimal lng, CancellationToken ct = default);
}



// ── Quotes ────────────────────────────────────────────────────────────────────
public interface IQuoteService
{
    Task<QuoteResponseDto> CalculateAsync(QuoteRequestDto dto, Guid? customerId, CancellationToken ct = default);
    Task<Quote?>           GetAsync(Guid quoteId, CancellationToken ct = default);
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
    Task SendParcelBookedAsync(Guid userId, string trackingNumber, CancellationToken ct = default);
    Task SendDispatchedAsync(Guid userId, string trackingNumber, CancellationToken ct = default);
    Task SendDeliveredAsync(Guid userId, string trackingNumber, CancellationToken ct = default);
    Task SendFailedDeliveryAsync(Guid userId, string trackingNumber, string reason, CancellationToken ct = default);
    Task SendClaimStatusUpdateAsync(Guid userId, string claimNumber, string status, CancellationToken ct = default);
    Task SendWalletTopUpAsync(Guid userId, decimal amount, CancellationToken ct = default);
    Task SendSystemAlertAsync(Guid userId, string title, string body, CancellationToken ct = default);
    Task<IEnumerable<Notification>> GetUnreadAsync(Guid userId, CancellationToken ct = default);
    Task MarkReadAsync(Guid notificationId, CancellationToken ct = default);
    Task MarkAllReadAsync(Guid userId, CancellationToken ct = default);
}

// ── Audit ─────────────────────────────────────────────────────────────────────
public interface IAuditService
{
    Task LogAsync(
        string   action,
        string   entityType,
        Guid?    entityId,
        object?  oldValues,
        object?  newValues,
        Guid?    performedByUserId,
        string?  ipAddress,
        CancellationToken ct = default);
}

// ── Storage ───────────────────────────────────────────────────────────────────
public interface IStorageService
{
    Task<string> UploadAsync(Stream stream, string fileName, string contentType, CancellationToken ct = default);
    Task<Stream> DownloadAsync(string filePath, CancellationToken ct = default);
    Task         DeleteAsync(string filePath, CancellationToken ct = default);
    Task<bool>   ExistsAsync(string filePath, CancellationToken ct = default);
}

// ── Barcode ───────────────────────────────────────────────────────────────────
public interface IBarcodeService
{
    Task<string>  GenerateAsync(string trackingNumber, CancellationToken ct = default);
    Task<byte[]>  GetBytesAsync(string trackingNumber, CancellationToken ct = default);
}

// ── Email ─────────────────────────────────────────────────────────────────────
public interface IEmailService
{
    Task SendAsync(string to, string subject, string htmlBody, CancellationToken ct = default);
}
