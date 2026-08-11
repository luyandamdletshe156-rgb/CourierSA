using CourierSA.Application.DTOs.SecureDelivery;
using CourierSA.Application.Interfaces.Repositories;
using CourierSA.Application.Interfaces.Services;
using CourierSA.Domain.Entities;
using CourierSA.Domain.Enums;
using CourierSA.Domain.Exceptions;
using CourierSA.Infrastructure.Services.Email;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using System.Security.Cryptography;
using System.Text;

namespace CourierSA.Infrastructure.Services;

public class SecureDeliveryService : ISecureDeliveryService
{
    // SRS specifies a threshold check without a number — reusing the same R2000
    // figure ParcelService already applies for mandatory insurance at booking,
    // so "high-value" means the same thing everywhere in the system.
    private const decimal HighValueThresholdZAR = 2000m;

    private readonly IUnitOfWork _uow;
    private readonly IAuditService _audit;
    private readonly IEmailService _emailService;
    private readonly ILogger<SecureDeliveryService> _logger;

    public SecureDeliveryService(
        IUnitOfWork uow,
        IAuditService audit,
        IEmailService emailService,
        ILogger<SecureDeliveryService> logger)
    {
        _uow = uow;
        _audit = audit;
        _emailService = emailService;
        _logger = logger;
    }

    public async Task<FlagHighValueResultDto> FlagAndGenerateOtpAsync(
        Guid parcelId, Guid dispatcherUserId, CancellationToken ct = default)
    {
        // For dispatcher manual flagging, we need the full details to send the email
        var parcel = await _uow.Parcels.Query()
            .Include(p => p.DeliveryAddress)
            .FirstOrDefaultAsync(p => p.Id == parcelId, ct)
            ?? throw new NotFoundException($"Parcel {parcelId} not found.");

        if (parcel.Status != ParcelStatus.CheckedOut && parcel.Status != ParcelStatus.Approved)
            throw new BadRequestException($"Parcel must be ready for dispatch to flag security requirements (current status: '{parcel.Status}').");

        if ((parcel.DeclaredValueZAR ?? 0) < HighValueThresholdZAR)
            throw new BadRequestException($"Parcel declared value does not meet the R{HighValueThresholdZAR:0} high-value threshold.");

        var otp = RandomNumberGenerator.GetInt32(0, 10000).ToString("D4");   // 4-digit, zero-padded
        parcel.RequiresOtpVerification = true;
        parcel.OtpCodeHash = Hash(otp);
        parcel.OtpGeneratedAt = DateTime.UtcNow;
        parcel.OtpVerifiedAt = null;
        parcel.UpdatedAt = DateTime.UtcNow;

        var trackingEvent = new TrackingEvent
        {
            Id = Guid.NewGuid(),
            ParcelId = parcel.Id,
            EventType = TrackingEventType.HighValueFlagged,
            Description = "Parcel flagged as high-value. Recipient OTP verification will be required at delivery.",
            OccurredAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        await _uow.TrackingEvents.AddAsync(trackingEvent, ct);
        await _uow.SaveChangesAsync(ct);

        await _audit.LogAsync("PARCEL_HIGH_VALUE_FLAGGED", "Parcel", parcel.Id,
            null, new { parcel.TrackingNumber, parcel.DeclaredValueZAR }, dispatcherUserId, null, ct);

        // Send the email since we now have an email channel!
        await SendOtpEmailForParcelAsync(parcel, otp);

        return new FlagHighValueResultDto(parcel.Id, parcel.TrackingNumber, true, otp, parcel.OtpGeneratedAt);
    }

    public async Task<VerifyOtpResultDto> VerifyOtpAsync(
        Guid parcelId, VerifyOtpDto dto, Guid driverUserId, CancellationToken ct = default)
    {
        var parcel = await _uow.Parcels.GetByIdAsync(parcelId, ct)
            ?? throw new NotFoundException($"Parcel {parcelId} not found.");

        if (!parcel.RequiresOtpVerification)
            throw new BadRequestException("This parcel does not require OTP verification.");

        if (parcel.OtpVerifiedAt is not null)
            throw new BadRequestException("OTP has already been verified for this parcel.");

        if (string.IsNullOrWhiteSpace(dto.Otp) || Hash(dto.Otp.Trim()) != parcel.OtpCodeHash)
            throw new BadRequestException("Incorrect OTP. Please confirm the code with the recipient and try again.");

        parcel.OtpVerifiedAt = DateTime.UtcNow;
        parcel.UpdatedAt = DateTime.UtcNow;

        var trackingEvent = new TrackingEvent
        {
            Id = Guid.NewGuid(),
            ParcelId = parcel.Id,
            EventType = TrackingEventType.OtpVerified,
            Description = "Recipient identity verified via OTP. Delivery may proceed.",
            OccurredAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        await _uow.TrackingEvents.AddAsync(trackingEvent, ct);
        await _uow.SaveChangesAsync(ct);

        await _audit.LogAsync("PARCEL_OTP_VERIFIED", "Parcel", parcel.Id,
            null, new { parcel.TrackingNumber }, driverUserId, null, ct);

        return new VerifyOtpResultDto(parcel.Id, parcel.TrackingNumber, true, parcel.OtpVerifiedAt);
    }

    // --- NEW METHODS FOR AUTO-FLAGGING & EMAIL RESEND ---

    public async Task<FlagHighValueResultDto> AutoFlagOnDispatchAsync(Parcel parcel)
    {
        var otp = RandomNumberGenerator.GetInt32(0, 10000).ToString("D4"); // 4-digit, zero-padded

        parcel.RequiresOtpVerification = true;
        parcel.OtpCodeHash = Hash(otp);
        parcel.OtpGeneratedAt = DateTime.UtcNow;
        parcel.OtpVerifiedAt = null;
        parcel.UpdatedAt = DateTime.UtcNow;

        var trackingEvent = new TrackingEvent
        {
            Id = Guid.NewGuid(),
            ParcelId = parcel.Id,
            EventType = TrackingEventType.HighValueFlagged,
            Description = "Parcel automatically flagged as high-value on dispatch. Recipient OTP verification required at delivery.",
            OccurredAt = DateTime.UtcNow,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        // Add to context, but do NOT save changes here. 
        // We rely on the caller (ParcelService.DispatchAsync) to persist this atomically.
        await _uow.TrackingEvents.AddAsync(trackingEvent);

        return new FlagHighValueResultDto(parcel.Id, parcel.TrackingNumber, true, otp, parcel.OtpGeneratedAt);
    }

    public async Task SendOtpEmailForParcelAsync(Parcel parcel, string otpCode)
    {
        try
        {
            var recipientEmail = parcel.DeliveryAddress?.RecipientEmail;
            if (string.IsNullOrEmpty(recipientEmail))
            {
                _logger.LogWarning("No recipient email found for Parcel {ParcelId}. Cannot send OTP.", parcel.Id);
                return;
            }

            // Note: Make sure EmailContent helper class is accessible here. 
            // If it's in a different namespace, add the using statement at the top.
            var emailBody = EmailContent.DeliveryOtp(
                parcel.DeliveryAddress?.RecipientName ?? "Customer",
                parcel.TrackingNumber,
                otpCode
            );

            await _emailService.SendAsync(recipientEmail, "Your Secure Delivery OTP", emailBody);
        }
        catch (Exception ex)
        {
            // Log gracefully so a failed email doesn't crash the entire dispatch or flag flow
            _logger.LogError(ex, "Failed to send OTP email for Parcel {ParcelId}", parcel.Id);
        }
    }

    public async Task ResendOtpAsync(Guid parcelId, CancellationToken ct = default)
    {
        var parcel = await _uow.Parcels.Query()
            .Include(p => p.DeliveryAddress)
            .FirstOrDefaultAsync(p => p.Id == parcelId, ct)
            ?? throw new NotFoundException($"Parcel {parcelId} not found.");

        if (!parcel.RequiresOtpVerification)
            throw new BadRequestException("Parcel is not flagged for OTP verification.");

        // We must generate a new one because we can't unhash the old one to resend it
        var flagResult = await AutoFlagOnDispatchAsync(parcel);

        await _uow.SaveChangesAsync(ct);

        await SendOtpEmailForParcelAsync(parcel, flagResult.Otp);
    }

    private static string Hash(string value)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(value));
        return Convert.ToHexString(bytes);
    }
}