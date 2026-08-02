namespace CourierSA.Infrastructure.Services.Email;

/// <summary>
/// Wraps email body content in a consistent, branded CourierSA HTML shell.
/// Keeps individual email bodies (in AuthService, etc.) focused on content only.
/// </summary>
public static class EmailTemplateBuilder
{
    private const string NavyDark = "#0B1B33";
    private const string OrangeAccent = "#F97316";
    private const string TextGray = "#4B5563";
    private const string BorderGray = "#E5E7EB";

    public static string Build(string previewText, string bodyHtml)
    {
        return $$"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        </head>
        <body style="margin:0; padding:0; background-color:#F3F4F6; font-family:Segoe UI, Arial, sans-serif;">
            <!-- Preheader (hidden preview text in inbox list) -->
            <div style="display:none; max-height:0; overflow:hidden;">{{previewText}}</div>

            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#F3F4F6; padding:32px 0;">
                <tr>
                    <td align="center">
                        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#FFFFFF; border-radius:8px; overflow:hidden; box-shadow:0 1px 3px rgba(0,0,0,0.08);">

                            <!-- Header -->
                            <tr>
                                <td style="background-color:{{NavyDark}}; padding:24px 32px;">
                                    <table role="presentation" cellpadding="0" cellspacing="0">
                                        <tr>
                                            <td style="background-color:{{OrangeAccent}}; width:32px; height:32px; border-radius:6px; text-align:center; vertical-align:middle;">
                                                <span style="color:#FFFFFF; font-size:16px; font-weight:bold; line-height:32px;">C</span>
                                            </td>
                                            <td style="padding-left:10px;">
                                                <span style="color:#FFFFFF; font-size:18px; font-weight:600;">CourierSA</span>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>

                            <!-- Body -->
                            <tr>
                                <td style="padding:32px; color:{{TextGray}}; font-size:15px; line-height:1.6;">
                                    {{bodyHtml}}
                                </td>
                            </tr>

                            <!-- Footer -->
                            <tr>
                                <td style="padding:20px 32px; border-top:1px solid {{BorderGray}};">
                                    <p style="margin:0; color:#9CA3AF; font-size:12px; line-height:1.5;">
                                        This is an automated message from CourierSA. Please do not reply directly to this email.<br/>
                                        &copy; {{DateTime.UtcNow.Year}} CourierSA &mdash; Durban University of Technology, ADPB301 Group 8.
                                    </p>
                                </td>
                            </tr>

                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
        """;
    }

    /// <summary>Shared style for the primary call-to-action button used across templates.</summary>
    public static string Button(string url, string label)
    {
        return $"""
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
            <tr>
                <td style="background-color:{OrangeAccent}; border-radius:6px;">
                    <a href="{url}" target="_blank"
                       style="display:inline-block; padding:12px 28px; color:#FFFFFF; font-size:15px; font-weight:600; text-decoration:none;">
                        {label}
                    </a>
                </td>
            </tr>
        </table>
        """;
    }

    

}