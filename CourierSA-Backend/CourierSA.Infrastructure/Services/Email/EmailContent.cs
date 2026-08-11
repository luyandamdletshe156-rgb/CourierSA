using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace CourierSA.Infrastructure.Services.Email;

/// <summary>
/// Builds the inner content HTML for each transactional email type.
/// Each method returns content ready to be passed into EmailTemplateBuilder.Build().
/// </summary>
public static class EmailContent
{
    // ── Welcome (on registration) ──────────────────────────────────────────
    public static (string Subject, string Content) Welcome(string firstName, string trackUrl)
    {
        var subject = "Welcome to CourierSA";

        var content = $"""
            <h2 style="margin:0 0 16px 0; color:#0B1B33; font-size:20px;">Welcome aboard, {firstName}! 🎉</h2>
            <p style="margin:0 0 12px 0;">Your CourierSA account has been created successfully. You can now book parcels, track deliveries in real time, and manage everything from your dashboard.</p>
            {EmailTemplateBuilder.Button(trackUrl, "Go to My Dashboard")}
            <p style="margin:16px 0 0 0; font-size:13px; color:#9CA3AF;">Need help getting started? Visit the Support Hub from your dashboard any time.</p>
            """;

        return (subject, content);
    }

    // ── Booking confirmation ───────────────────────────────────────────────
    public static (string Subject, string Content) BookingConfirmed(
        string firstName, string trackingNumber, string serviceType,
        string destinationCity, decimal? amountZAR, string trackUrl)
    {
        var subject = $"Parcel booked — {trackingNumber}";

        var amountRow = amountZAR.HasValue
            ? $"""<p style="margin:0 0 8px 0;"><strong>Amount:</strong> R {amountZAR.Value:N2}</p>"""
            : "";

        var content = $"""
            <h2 style="margin:0 0 16px 0; color:#0B1B33; font-size:20px;">Booking confirmed</h2>
            <p style="margin:0 0 12px 0;">Hi {firstName}, your parcel has been booked successfully and is awaiting approval.</p>
            <table role="presentation" style="width:100%; background-color:#F9FAFB; border-radius:6px; margin:0 0 16px 0;">
                <tr>
                    <td style="padding:16px;">
                        <p style="margin:0 0 8px 0;"><strong>Tracking number:</strong> {trackingNumber}</p>
                        <p style="margin:0 0 8px 0;"><strong>Service:</strong> {serviceType}</p>
                        <p style="margin:0 0 8px 0;"><strong>Destination:</strong> {destinationCity}</p>
                        {amountRow}
                    </td>
                </tr>
            </table>
            {EmailTemplateBuilder.Button(trackUrl, "Track This Parcel")}
            """;

        return (subject, content);
    }

    // ── Generic status update (Dispatched / Delivered / Failed / etc.) ────
    public static (string Subject, string Content) StatusUpdate(
        string firstName, string trackingNumber, string statusLabel,
        string message, string accentColor, string trackUrl)
    {
        var subject = $"Update on {trackingNumber} — {statusLabel}";

        var content = $"""
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0;">
                <tr>
                    <td style="background-color:{accentColor}; color:#FFFFFF; font-size:12px; font-weight:600; padding:4px 12px; border-radius:12px;">
                        {statusLabel.ToUpperInvariant()}
                    </td>
                </tr>
            </table>
            <h2 style="margin:0 0 16px 0; color:#0B1B33; font-size:20px;">{statusLabel}</h2>
            <p style="margin:0 0 12px 0;">Hi {firstName}, {message}</p>
            <p style="margin:0 0 16px 0; font-size:14px; color:#6B7280;"><strong>Tracking number:</strong> {trackingNumber}</p>
            {EmailTemplateBuilder.Button(trackUrl, "View Tracking Details")}
            """;

        return (subject, content);
    }

    // ── Secure Delivery OTP ────────────────────────────────────────────────
    public static string DeliveryOtp(string recipientName, string trackingNumber, string otpCode)
    {
        var previewText = $"Your secure delivery PIN is {otpCode}";

        var content = $"""
            <h2 style="margin:0 0 16px 0; color:#0B1B33; font-size:20px;">Secure Delivery Verification</h2>
            <p style="margin:0 0 12px 0;">Hi {recipientName},</p>
            <p style="margin:0 0 12px 0;">Your parcel (<strong>{trackingNumber}</strong>) has been flagged as high-value and requires a secure PIN for delivery.</p>
            <table role="presentation" style="width:100%; background-color:#F9FAFB; border-radius:6px; margin:16px 0; text-align:center;">
                <tr>
                    <td style="padding:24px;">
                        <p style="margin:0 0 8px 0; font-size:12px; color:#6B7280; text-transform:uppercase; font-weight:600; letter-spacing:1px;">Your Delivery PIN</p>
                        <p style="margin:0; font-size:32px; font-weight:700; color:#0B1B33; letter-spacing:6px; font-family:monospace;">{otpCode}</p>
                    </td>
                </tr>
            </table>
            <p style="margin:0 0 12px 0; font-size:14px; color:#6B7280;">Please provide this PIN to the driver upon arrival. For your security, do not share it with anyone else.</p>
            """;

        // Return the fully built HTML string so SecureDeliveryService can send it immediately
        return EmailTemplateBuilder.Build(previewText, content);
    }

    // ── Colors for common statuses (used with StatusUpdate) ────────────────
    public const string ColorInfo = "#2563EB"; // dispatched / out for delivery
    public const string ColorSuccess = "#16A34A"; // delivered
    public const string ColorDanger = "#DC2626"; // failed delivery
    public const string ColorWarning = "#F97316"; // exceptions / claims
}