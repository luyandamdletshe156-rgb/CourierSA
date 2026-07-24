using CourierSA.Application.Interfaces.Services;
using Microsoft.Extensions.Logging;

namespace CourierSA.Infrastructure.Services;

/// <summary>
/// Stub email service for development/testing.
/// Logs what would be sent instead of actually delivering email.
/// Replace with a real SMTP implementation before production deployment.
/// </summary>
public class EmailService : IEmailService
{
    private readonly ILogger<EmailService> _logger;

    public EmailService(ILogger<EmailService> logger)
    {
        _logger = logger;
    }

    public Task SendAsync(string to, string subject, string htmlBody, CancellationToken ct = default)
    {
        _logger.LogInformation(
            "Email (stub - not actually sent) — To: {To}, Subject: {Subject}", to, subject);
        return Task.CompletedTask;
    }
}