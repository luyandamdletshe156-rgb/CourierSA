using CourierSA.Application.Interfaces.Services;
using CourierSA.Domain.Entities;
using CourierSA.Domain.Enums;
using System.Text.Json;
using CourierSA.Application.Interfaces.Repositories;
using CourierSA.Domain.Exceptions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.Configuration;
using CourierSA.Infrastructure.Services.Email;

namespace CourierSA.Infrastructure.Services;

// ── Audit Service ─────────────────────────────────────────────────────────────
public class AuditService : IAuditService
{
    private readonly IUnitOfWork _uow;

    public AuditService(IUnitOfWork uow) => _uow = uow;

    public async Task LogAsync(
        string action,
        string entityType,
        Guid?  entityId,
        object? oldValues,
        object? newValues,
        Guid?   performedByUserId,
        string? ipAddress,
        CancellationToken ct = default)
    {
        var entry = new AuditLog
        {
            Id          = Guid.NewGuid(),
            Action      = action,
            EntityType  = entityType,
            EntityId    = entityId,
            OldValues   = oldValues is null ? null : JsonSerializer.Serialize(oldValues),
            NewValues   = newValues is null ? null : JsonSerializer.Serialize(newValues),
            UserId      = performedByUserId,
            IpAddress   = ipAddress,
            CreatedAt   = DateTime.UtcNow,
            UpdatedAt   = DateTime.UtcNow
        };

        await _uow.AuditLogs.AddAsync(entry, ct);
        await _uow.SaveChangesAsync(ct);
    }
}

// ── Notification Service ──────────────────────────────────────────────────────
/// <summary>
/// Persists in-app notifications and triggers email/SMS via injected channel services.
/// Keeps the domain events decoupled from transport layer details.
/// </summary>
// ── Notification Service ──────────────────────────────────────────────────────
/// <summary>
/// Persists in-app notifications and triggers email via IEmailService.
/// Keeps the domain events decoupled from transport layer details.
/// </summary>
public class NotificationService : INotificationService
{
    private readonly IUnitOfWork _uow;
    private readonly IEmailService _emailService;

    private const string TrackBaseUrl =
        "https://couriersa2frontend.z1.web.core.windows.net/track";

    public NotificationService(IUnitOfWork uow, IEmailService emailService)
    {
        _uow = uow;
        _emailService = emailService;
    }

    public async Task SendParcelBookedAsync(
        Guid userId, string trackingNumber,
        string? serviceType = null, string? destinationCity = null, decimal? amountZAR = null,
        CancellationToken ct = default)
    {
        await PersistAsync(userId, NotificationType.ParcelBooked,
            "Booking Confirmed",
            $"Your parcel {trackingNumber} has been booked and is awaiting approval.",
            ct: ct);

        var user = await _uow.Users.GetByIdAsync(userId, ct);
        if (user is null) return;

        var (subject, content) = CourierSA.Infrastructure.Services.Email.EmailContent.BookingConfirmed(
            user.FirstName, trackingNumber,
            serviceType ?? "—", destinationCity ?? "—", amountZAR,
            $"{TrackBaseUrl}/{trackingNumber}");

        var html = CourierSA.Infrastructure.Services.Email.EmailTemplateBuilder.Build(subject, content);
        await _emailService.SendAsync(user.Email, subject, html, ct);
    }

    public async Task SendDispatchedAsync(
        Guid userId, string trackingNumber, CancellationToken ct = default)
    {
        await PersistAsync(userId, NotificationType.ParcelDispatched,
            "Out for Delivery",
            $"Your parcel {trackingNumber} is now out for delivery.",
            ct: ct);

        var user = await _uow.Users.GetByIdAsync(userId, ct);
        if (user is null) return;

        var (subject, content) = CourierSA.Infrastructure.Services.Email.EmailContent.StatusUpdate(
            user.FirstName, trackingNumber, "Out for Delivery",
            "your parcel is on its way and should arrive soon.",
            CourierSA.Infrastructure.Services.Email.EmailContent.ColorInfo,
            $"{TrackBaseUrl}/{trackingNumber}");

        var html = CourierSA.Infrastructure.Services.Email.EmailTemplateBuilder.Build(subject, content);
        await _emailService.SendAsync(user.Email, subject, html, ct);
    }

    public async Task SendDeliveredAsync(
        Guid userId, string trackingNumber, CancellationToken ct = default)
    {
        await PersistAsync(userId, NotificationType.ParcelDelivered,
            "Parcel Delivered",
            $"Your parcel {trackingNumber} has been delivered successfully.",
            ct: ct);

        var user = await _uow.Users.GetByIdAsync(userId, ct);
        if (user is null) return;

        var (subject, content) = CourierSA.Infrastructure.Services.Email.EmailContent.StatusUpdate(
            user.FirstName, trackingNumber, "Delivered",
            "your parcel has been delivered successfully. Thank you for using CourierSA.",
            CourierSA.Infrastructure.Services.Email.EmailContent.ColorSuccess,
            $"{TrackBaseUrl}/{trackingNumber}");

        var html = CourierSA.Infrastructure.Services.Email.EmailTemplateBuilder.Build(subject, content);
        await _emailService.SendAsync(user.Email, subject, html, ct);
    }

    public async Task SendFailedDeliveryAsync(
        Guid userId, string trackingNumber, string reason, CancellationToken ct = default)
    {
        await PersistAsync(userId, NotificationType.DeliveryFailed,
            "Delivery Attempt Failed",
            $"We were unable to deliver parcel {trackingNumber}. Reason: {reason}. " +
            $"Please contact support to reschedule.",
            ct: ct);

        var user = await _uow.Users.GetByIdAsync(userId, ct);
        if (user is null) return;

        var (subject, content) = CourierSA.Infrastructure.Services.Email.EmailContent.StatusUpdate(
            user.FirstName, trackingNumber, "Delivery Failed",
            $"we were unable to deliver your parcel. Reason: {reason}. Please visit the Support Hub to reschedule or update your address.",
            CourierSA.Infrastructure.Services.Email.EmailContent.ColorDanger,
            $"{TrackBaseUrl}/{trackingNumber}");

        var html = CourierSA.Infrastructure.Services.Email.EmailTemplateBuilder.Build(subject, content);
        await _emailService.SendAsync(user.Email, subject, html, ct);
    }

    public async Task SendClaimStatusUpdateAsync(
        Guid userId, string claimNumber, string status, CancellationToken ct = default)
    {
        await PersistAsync(userId, NotificationType.ClaimUpdated,
            "Claim Status Updated",
            $"Your insurance claim {claimNumber} has been updated to: {status}.",
            ct: ct);

        var user = await _uow.Users.GetByIdAsync(userId, ct);
        if (user is null) return;

        var (subject, content) = CourierSA.Infrastructure.Services.Email.EmailContent.StatusUpdate(
            user.FirstName, claimNumber, "Claim Update",
            $"your insurance claim has been updated to: {status}.",
            CourierSA.Infrastructure.Services.Email.EmailContent.ColorWarning,
            "https://couriersa2frontend.z1.web.core.windows.net/customer/claims");

        var html = CourierSA.Infrastructure.Services.Email.EmailTemplateBuilder.Build(subject, content);
        await _emailService.SendAsync(user.Email, subject, html, ct);
    }

    public async Task SendWalletTopUpAsync(
        Guid userId, decimal amount, CancellationToken ct = default)
    {
        await PersistAsync(userId, NotificationType.WalletTopUp,
            "Wallet Credited",
            $"Your wallet has been credited with R{amount:N2}.",
            ct: ct);

        // In-app only — no email for wallet top-ups to avoid noise; extend here if desired.
    }

    public async Task SendSystemAlertAsync(
        Guid userId, string title, string body, CancellationToken ct = default)
    {
        await PersistAsync(userId, NotificationType.SystemAlert, title, body, ct: ct);
    }

    public async Task<IEnumerable<Notification>> GetUnreadAsync(
        Guid userId, CancellationToken ct = default)
        => await _uow.Notifications.FindAsync(
            n => n.UserId == userId && !n.IsRead, ct);

    public async Task MarkReadAsync(
        Guid notificationId, CancellationToken ct = default)
    {
        var n = await _uow.Notifications.GetByIdAsync(notificationId, ct);
        if (n is null) return;
        n.IsRead = true;
        n.ReadAt = DateTime.UtcNow;
        n.UpdatedAt = DateTime.UtcNow;
        _uow.Notifications.Update(n);
        await _uow.SaveChangesAsync(ct);
    }

    public async Task MarkAllReadAsync(Guid userId, CancellationToken ct = default)
    {
        var unread = await _uow.Notifications.FindAsync(
            n => n.UserId == userId && !n.IsRead, ct);
        foreach (var n in unread)
        {
            n.IsRead = true;
            n.ReadAt = DateTime.UtcNow;
            n.UpdatedAt = DateTime.UtcNow;
            _uow.Notifications.Update(n);
        }
        await _uow.SaveChangesAsync(ct);
    }

    // ── Private helpers ───────────────────────────────────────────────────────
    private async Task PersistAsync(
        Guid userId,
        NotificationType type,
        string title,
        string body,
        Guid? referenceId = null,
        string? referenceType = null,
        CancellationToken ct = default)
    {
        var notification = new Notification
        {
            Id = Guid.NewGuid(),
            UserId = userId,
            Type = type,
            Channel = NotificationChannel.InApp,
            Title = title,
            Body = body,
            IsRead = false,
            ReferenceId = referenceId,
            ReferenceType = referenceType,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        await _uow.Notifications.AddAsync(notification, ct);
        await _uow.SaveChangesAsync(ct);
    }

    public async Task SendParcelDamagedAsync(
    Guid userId, string trackingNumber, string stage, CancellationToken ct = default)
    {
        await PersistAsync(userId, NotificationType.SystemAlert,
            "Parcel Condition Flagged",
            $"Your parcel {trackingNumber} was flagged during {stage} inspection. We're reviewing it and will be in touch.",
            ct: ct);

        var user = await _uow.Users.GetByIdAsync(userId, ct);
        if (user is null) return;

        var (subject, content) = CourierSA.Infrastructure.Services.Email.EmailContent.StatusUpdate(
            user.FirstName, trackingNumber, "Condition Flagged",
            $"during {stage.ToLower()} inspection, our warehouse team flagged a condition issue with your parcel. If you have insurance on this shipment, a claim has been opened automatically — visit the Support Hub for details.",
            CourierSA.Infrastructure.Services.Email.EmailContent.ColorWarning,
            $"{TrackBaseUrl}/{trackingNumber}");

        var html = CourierSA.Infrastructure.Services.Email.EmailTemplateBuilder.Build(subject, content);
        await _emailService.SendAsync(user.Email, subject, html, ct);
    }

}

// ── Barcode Service (ZXing.Net) ───────────────────────────────────────────────
public class BarcodeService : IBarcodeService
{
    private readonly IStorageService _storage;

    public BarcodeService(IStorageService storage) => _storage = storage;

    public async Task<string> GenerateAsync(
        string trackingNumber, CancellationToken ct = default)
    {
        // Uses ZXing.Net.Bindings.SkiaSharp – install via NuGet:
        // ZXing.Net.Bindings.SkiaSharp 0.16.x
        var writer = new ZXing.SkiaSharp.BarcodeWriter
        {
            Format  = ZXing.BarcodeFormat.CODE_128,
            Options = new ZXing.Common.EncodingOptions
            {
                Width    = 400,
                Height   = 100,
                Margin   = 10,
                PureBarcode = false
            }
        };

        var bitmap = writer.Write(trackingNumber);
        using var ms = new System.IO.MemoryStream();
        bitmap.Encode(ms, SkiaSharp.SKEncodedImageFormat.Png, 100);
        ms.Seek(0, System.IO.SeekOrigin.Begin);

        var fileName = $"barcodes/{trackingNumber}.png";
        return await _storage.UploadAsync(ms, fileName, "image/png", ct);
    }

    public async Task<byte[]> GetBytesAsync(
        string trackingNumber, CancellationToken ct = default)
    {
        var writer = new ZXing.SkiaSharp.BarcodeWriter
        {
            Format  = ZXing.BarcodeFormat.CODE_128,
            Options = new ZXing.Common.EncodingOptions
                { Width = 400, Height = 100, Margin = 10 }
        };
        var bitmap = writer.Write(trackingNumber);
        using var ms = new System.IO.MemoryStream();
        bitmap.Encode(ms, SkiaSharp.SKEncodedImageFormat.Png, 100);
        return ms.ToArray();
    }
}

// ── Local File Storage Service ────────────────────────────────────────────────
/// <summary>
/// Saves files to local disk under wwwroot/uploads.
/// Swap this for an Azure Blob / S3 implementation without changing callers.
/// </summary>
public class LocalStorageService : IStorageService
{
    private readonly string _basePath;
    private readonly string _baseUrl;

    public LocalStorageService(IWebHostEnvironment env, IConfiguration config)
    {
        var webRoot = env.WebRootPath ?? Path.Combine(env.ContentRootPath, "wwwroot");

        _basePath = Path.Combine(webRoot, "uploads");
        _baseUrl = config["Storage:BaseUrl"] ?? "/uploads";
        Directory.CreateDirectory(_basePath);
    }

    public async Task<string> UploadAsync(
        Stream stream, string fileName,
        string contentType, CancellationToken ct = default)
    {
        var full = Path.Combine(_basePath, fileName);
        Directory.CreateDirectory(Path.GetDirectoryName(full)!);

        await using var fs = File.Create(full);
        await stream.CopyToAsync(fs, ct);

        return $"{_baseUrl}/{fileName}";
    }

    public async Task<Stream> DownloadAsync(
        string filePath, CancellationToken ct = default)
    {
        var full = Path.Combine(_basePath, filePath.TrimStart('/'));
        return await Task.FromResult(File.OpenRead(full));
    }

    public Task DeleteAsync(string filePath, CancellationToken ct = default)
    {
        var full = Path.Combine(_basePath, filePath.TrimStart('/'));
        if (File.Exists(full)) File.Delete(full);
        return Task.CompletedTask;
    }

    public Task<bool> ExistsAsync(string filePath, CancellationToken ct = default)
    {
        var full = Path.Combine(_basePath, filePath.TrimStart('/'));
        return Task.FromResult(File.Exists(full));
    }
}
