using CourierSA.Application.Interfaces.Services;
using MailKit.Net.Smtp;
using MailKit.Security;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using MimeKit;
using SmtpClient = MailKit.Net.Smtp.SmtpClient;

namespace CourierSA.Infrastructure.Services.Email;

public class EmailService : IEmailService
{
    private readonly BrevoEmailSettings _settings;
    private readonly ILogger<EmailService> _logger;

    public EmailService(IOptions<BrevoEmailSettings> settings, ILogger<EmailService> logger)
    {
        _settings = settings.Value;
        _logger = logger;
    }

    public async Task SendAsync(
        string to, string subject, string htmlBody, CancellationToken ct = default)
    {
        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(_settings.FromName, _settings.FromEmail));
        message.To.Add(MailboxAddress.Parse(to));
        message.Subject = subject;

        message.Body = new BodyBuilder { HtmlBody = htmlBody }.ToMessageBody();

        using var client = new SmtpClient();

        try
        {
            // Brevo relay: STARTTLS on port 587
            await client.ConnectAsync(
                _settings.Host, _settings.Port, SecureSocketOptions.StartTls, ct);

            await client.AuthenticateAsync(_settings.Login, _settings.Key, ct);

            await client.SendAsync(message, ct);

            _logger.LogInformation("Email sent to {To} with subject '{Subject}'", to, subject);
        }
        catch (Exception ex)
        {
            // Don't let a flaky email provider crash the calling business flow
            // (e.g. registration, password reset) — log it and move on.
            _logger.LogError(ex, "Failed to send email to {To} with subject '{Subject}'", to, subject);
        }
        finally
        {
            if (client.IsConnected)
                await client.DisconnectAsync(true, ct);
        }
    }
}