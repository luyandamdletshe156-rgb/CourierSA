namespace CourierSA.Infrastructure.Services.Email;

public class BrevoEmailSettings
{
    public string Host { get; set; } = "smtp-relay.brevo.com";
    public int Port { get; set; } = 587;
    public string Login { get; set; } = string.Empty; // SMTP login, e.g. b41e33001@smtp-brevo.com
    public string Key { get; set; } = string.Empty; // SMTP key (the generated password)
    public string FromEmail { get; set; } = string.Empty; // verified sender, e.g. luyandamdletshe156@gmail.com
    public string FromName { get; set; } = "CourierSA";
}