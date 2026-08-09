using System.Security.Cryptography;
using System.Text;
using CourierSA.Application.DTOs.SecureDelivery;
using CourierSA.Application.Interfaces.Repositories;
using CourierSA.Application.Interfaces.Services;
using CourierSA.Domain.Entities;
using CourierSA.Domain.Enums;
using CourierSA.Domain.Exceptions;

namespace CourierSA.Infrastructure.Services;

public class SecureDeliveryService : ISecureDeliveryService
{
    // SRS specifies a threshold check without a number — reusing the same R2000
    // figure ParcelService already applies for mandatory insurance at booking,
    // so "high-value" means the same thing everywhere in the system.
    private const decimal HighValueThresholdZAR = 2000m;

    private readonly IUnitOfWork _uow;
    private readonly IAuditService _audit;

    public SecureDeliveryService(IUnitOfWork uow, IAuditService audit)
    {
        _uow = uow;
        _audit = audit;
    }

    public async Task<FlagHighValueResultDto> FlagAndGenerateOtpAsync(
        Guid parcelId, Guid dispatcherUserId, CancellationToken ct = default)
    {
        var parcel = await _uow.Parcels.GetByIdAsync(parcelId, ct)
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

        // NOTE: real email/SMS dispatch to the recipient is not wired here — see
        // conversation notes. The OTP is returned to the caller (dispatcher UI) for
        // demo purposes only, and logged to audit for traceability instead of a
        // notification channel this service doesn't have a confirmed contract for.
        await _audit.LogAsync("PARCEL_HIGH_VALUE_FLAGGED", "Parcel", parcel.Id,
            null, new { parcel.TrackingNumber, parcel.DeclaredValueZAR }, dispatcherUserId, null, ct);

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

    private static string Hash(string value)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(value));
        return Convert.ToHexString(bytes);
    }
}