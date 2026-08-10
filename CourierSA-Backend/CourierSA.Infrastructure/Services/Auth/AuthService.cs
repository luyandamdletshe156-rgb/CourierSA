using CourierSA.Application.DTOs.Auth;
using CourierSA.Application.Interfaces.Repositories;
using CourierSA.Application.Interfaces.Services;
using CourierSA.Domain.Entities;
using CourierSA.Domain.Enums;
using CourierSA.Domain.Exceptions;
using CourierSA.Infrastructure.Services.Email;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using static CourierSA.Infrastructure.Services.Email.EmailTemplateBuilder;

namespace CourierSA.Infrastructure.Services.Auth;

public class JwtSettings
{
    public string SecretKey   { get; set; } = string.Empty;
    public string Issuer      { get; set; } = string.Empty;
    public string Audience    { get; set; } = string.Empty;
    public int    ExpiryHours { get; set; } = 8;
    public int    RefreshTokenExpiryDays { get; set; } = 30;
}

public class JwtTokenService : ITokenService
{
    private readonly JwtSettings _settings;

    public JwtTokenService(IOptions<JwtSettings> options)
        => _settings = options.Value;

    public string GenerateAccessToken(User user)
    {
        var key = new SymmetricSecurityKey(
            Encoding.UTF8.GetBytes(_settings.SecretKey));
        var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = BuildClaims(user);

        var token = new JwtSecurityToken(
            issuer:             _settings.Issuer,
            audience:           _settings.Audience,
            claims:             claims,
            notBefore:          DateTime.UtcNow,
            expires:            DateTime.UtcNow.AddHours(_settings.ExpiryHours),
            signingCredentials: creds);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    public string GenerateRefreshToken()
    {
        var bytes = new byte[64];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(bytes);
        return Convert.ToBase64String(bytes);
    }

    public ClaimsPrincipal? ValidateAccessToken(string token)
    {
        var handler = new JwtSecurityTokenHandler();
        var key = new SymmetricSecurityKey(
            Encoding.UTF8.GetBytes(_settings.SecretKey));

        try
        {
            return handler.ValidateToken(token, new TokenValidationParameters
            {
                ValidateIssuerSigningKey = true,
                IssuerSigningKey        = key,
                ValidateIssuer          = true,
                ValidIssuer             = _settings.Issuer,
                ValidateAudience        = true,
                ValidAudience           = _settings.Audience,
                ValidateLifetime        = true,
                ClockSkew               = TimeSpan.FromMinutes(1)
            }, out _);
        }
        catch
        {
            return null;
        }
    }

    public DateTime GetRefreshTokenExpiry()
        => DateTime.UtcNow.AddDays(_settings.RefreshTokenExpiryDays);

    private static IEnumerable<Claim> BuildClaims(User user) =>
    [
        new(JwtRegisteredClaimNames.Sub,   user.Id.ToString()),
        new(JwtRegisteredClaimNames.Email, user.Email),
        new(JwtRegisteredClaimNames.Jti,   Guid.NewGuid().ToString()),
        new(ClaimTypes.NameIdentifier,     user.Id.ToString()),
        new(ClaimTypes.Email,              user.Email),
        new(ClaimTypes.Role,               user.Role.ToString()),
        new("firstName",                   user.FirstName),
        new("lastName",                    user.LastName),
        new("status",                      user.Status.ToString()),
    ];
}

// ── Password Hashing ──────────────────────────────────────────────────────────
public class PasswordService : IPasswordService
{
    private const int SaltSize  = 16;
    private const int HashSize  = 32;
    private const int Iterations = 100_000;

    public string Hash(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(SaltSize);
        var hash = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(password),
            salt,
            Iterations,
            HashAlgorithmName.SHA256,
            HashSize);

        return $"{Convert.ToBase64String(salt)}.{Convert.ToBase64String(hash)}";
    }

    public bool Verify(string password, string storedHash)
    {
        var parts = storedHash.Split('.');
        if (parts.Length != 2) return false;

        var salt = Convert.FromBase64String(parts[0]);
        var expectedHash = Convert.FromBase64String(parts[1]);

        var actualHash = Rfc2898DeriveBytes.Pbkdf2(
            Encoding.UTF8.GetBytes(password),
            salt,
            Iterations,
            HashAlgorithmName.SHA256,
            HashSize);

        return CryptographicOperations.FixedTimeEquals(actualHash, expectedHash);
    }
}

// ── Authentication Service ────────────────────────────────────────────────────
public class AuthService : IAuthService
{
    private readonly IUnitOfWork      _uow;
    private readonly ITokenService    _tokenService;
    private readonly IPasswordService _passwordService;
    private readonly IAuditService    _audit;
    private readonly IEmailService _emailService;
    // field, near the other private readonly fields
    private readonly ILogger<AuthService> _logger;

    public AuthService(
        IUnitOfWork      uow,
        ITokenService    tokenService,
        IPasswordService passwordService,
        IAuditService    audit,
        IEmailService    emailService,
         ILogger<AuthService> logger)

    {
        _uow             = uow;
        _tokenService    = tokenService;
        _passwordService = passwordService;
        _audit           = audit;
        _emailService    = emailService;
        _logger          = logger;
        _audit           = audit;
        _emailService    = emailService;
    }

    public async Task<AuthResponseDto> LoginAsync(
        LoginDto dto, string ipAddress, CancellationToken ct = default)
    {
        var user = await _uow.Users.GetByEmailAsync(dto.Email, ct)
            ?? throw new UnauthorizedException("Invalid email or password.");

        if (user.Status == UserStatus.Suspended)
            throw new ForbiddenException("Account has been suspended. Contact support.");

        if (user.Status == UserStatus.PendingVerification)
            throw new ForbiddenException("Please verify your email before logging in.");

        if (!_passwordService.Verify(dto.Password, user.PasswordHash))
        {
            user.FailedLoginAttempts++;
            if (user.FailedLoginAttempts >= 5)
            {
                user.Status    = UserStatus.Suspended;
                user.UpdatedAt = DateTime.UtcNow;
            }
            await _uow.SaveChangesAsync(ct);
            throw new UnauthorizedException("Invalid email or password.");
        }

        user.FailedLoginAttempts = 0;
        user.LastLoginAt         = DateTime.UtcNow;
        user.UpdatedAt           = DateTime.UtcNow;

        var accessToken  = _tokenService.GenerateAccessToken(user);
        var refreshToken = _tokenService.GenerateRefreshToken();
        var refreshExpiry = _tokenService.GetRefreshTokenExpiry();

        user.RefreshToken           = refreshToken;
        user.RefreshTokenExpiryTime = refreshExpiry;

        await _uow.SaveChangesAsync(ct);
        await _audit.LogAsync("LOGIN", "User", user.Id, null, null, user.Id, ipAddress, ct);

        return MapToResponse(user, accessToken, refreshToken, refreshExpiry);
    }

    public async Task<AuthResponseDto> RegisterAsync(
        RegisterDto dto, string ipAddress, CancellationToken ct = default)
    {
        if (await _uow.Users.EmailExistsAsync(dto.Email, ct))
            throw new ConflictException("An account with this email already exists.");

        var user = new User
        {
            Id            = Guid.NewGuid(),
            Email         = dto.Email.ToLowerInvariant(),
            PasswordHash  = _passwordService.Hash(dto.Password),
            FirstName     = dto.FirstName.Trim(),
            LastName      = dto.LastName.Trim(),
            PhoneNumber   = dto.PhoneNumber.Trim(),
            Role          = UserRole.Customer,
            Status        = UserStatus.Active,
            CreatedAt     = DateTime.UtcNow,
            UpdatedAt     = DateTime.UtcNow
        };

        var profile = new CustomerProfile
        {
            Id          = Guid.NewGuid(),
            UserId      = user.Id,
            AccountType = AccountType.Individual,
            WalletBalanceZAR = 0,
            CreatedAt   = DateTime.UtcNow,
            UpdatedAt   = DateTime.UtcNow
        };

        await _uow.Users.AddAsync(user, ct);
        await _uow.Query<CustomerProfile>().AddAsync(profile, ct);
        await _uow.SaveChangesAsync(ct);

        var accessToken  = _tokenService.GenerateAccessToken(user);
        var refreshToken = _tokenService.GenerateRefreshToken();

        user.RefreshToken           = refreshToken;
        user.RefreshTokenExpiryTime = _tokenService.GetRefreshTokenExpiry();
        await _uow.SaveChangesAsync(ct);

        await _audit.LogAsync("REGISTER", "User", user.Id, null, null, user.Id, ipAddress, ct);

        await _audit.LogAsync("REGISTER", "User", user.Id, null, null, user.Id, ipAddress, ct);

        var (welcomeSubject, welcomeContent) = EmailContent.Welcome(
            user.FirstName, "https://couriersa2frontend.z1.web.core.windows.net/customer/dashboard");
        var welcomeHtml = EmailTemplateBuilder.Build(welcomeSubject, welcomeContent);
        await _emailService.SendAsync(user.Email, welcomeSubject, welcomeHtml, ct);

        return MapToResponse(user, accessToken, refreshToken, user.RefreshTokenExpiryTime.Value);

    }

    public async Task<AuthResponseDto> RefreshTokenAsync(
        string refreshToken, CancellationToken ct = default)
    {
        var user = await _uow.Users.FirstOrDefaultAsync(
            u => u.RefreshToken == refreshToken, ct)
            ?? throw new UnauthorizedException("Invalid refresh token.");

        if (user.RefreshTokenExpiryTime < DateTime.UtcNow)
            throw new UnauthorizedException("Refresh token has expired. Please log in again.");

        var newAccess  = _tokenService.GenerateAccessToken(user);
        var newRefresh = _tokenService.GenerateRefreshToken();

        user.RefreshToken           = newRefresh;
        user.RefreshTokenExpiryTime = _tokenService.GetRefreshTokenExpiry();
        user.UpdatedAt              = DateTime.UtcNow;

        await _uow.SaveChangesAsync(ct);

        return MapToResponse(user, newAccess, newRefresh, user.RefreshTokenExpiryTime.Value);
    }

    public async Task RevokeTokenAsync(Guid userId, CancellationToken ct = default)
    {
        var user = await _uow.Users.GetByIdAsync(userId, ct)
            ?? throw new NotFoundException("User not found.");

        user.RefreshToken           = null;
        user.RefreshTokenExpiryTime = null;
        user.UpdatedAt              = DateTime.UtcNow;

        await _uow.SaveChangesAsync(ct);
    }


    public async Task ForgotPasswordAsync(string email, CancellationToken ct = default)
    {
        var user = await _uow.Users.GetByEmailAsync(email, ct);

        if (user is null || user.Status != UserStatus.Active)
            return; // don't reveal whether the account exists

        var tokenBytes = RandomNumberGenerator.GetBytes(32);
        var token = Convert.ToBase64String(tokenBytes)
            .Replace("+", "-").Replace("/", "_").Replace("=", "");

        user.PasswordResetToken = token;
        user.PasswordResetTokenExpiry = DateTime.UtcNow.AddMinutes(30);
        user.UpdatedAt = DateTime.UtcNow;
        await _uow.SaveChangesAsync(ct);
        var resetLink = $"https://couriersa2frontend.z1.web.core.windows.net/reset-password?token={token}";
        var subject = "Reset your CourierSA password";

        var content = $"""
    <h2 style="margin:0 0 16px 0; color:#0B1B33; font-size:20px;">Reset your password</h2>
    <p style="margin:0 0 12px 0;">Hi {user.FirstName},</p>
    <p style="margin:0 0 12px 0;">We received a request to reset your CourierSA password. Click the button below to choose a new one — this link expires in 30 minutes.</p>
    {EmailTemplateBuilder.Button(resetLink, "Reset Password")}
    <p style="margin:16px 0 0 0; font-size:13px; color:#9CA3AF;">If you didn't request this, you can safely ignore this email — your password won't be changed.</p>
    """;

        var htmlBody = EmailTemplateBuilder.Build(subject, content);
        await _emailService.SendAsync(user.Email, subject, htmlBody, ct);
    }

    public async Task ResetPasswordAsync(ResetPasswordDto dto, CancellationToken ct = default)
    {
        var user = await _uow.Users.FirstOrDefaultAsync(
            u => u.PasswordResetToken == dto.Token, ct)
            ?? throw new UnauthorizedException("This reset link is invalid or has expired.");

        if (user.PasswordResetTokenExpiry is null || user.PasswordResetTokenExpiry < DateTime.UtcNow)
            throw new UnauthorizedException("This reset link is invalid or has expired.");

        user.PasswordHash = _passwordService.Hash(dto.NewPassword);
        user.PasswordResetToken = null;
        user.PasswordResetTokenExpiry = null;
        user.UpdatedAt = DateTime.UtcNow;
        user.RefreshToken = null;
        user.RefreshTokenExpiryTime = null;

        await _uow.SaveChangesAsync(ct);
        await _audit.LogAsync("PASSWORD_RESET", "User", user.Id, null, null, user.Id, null, ct);
    }

    private static AuthResponseDto MapToResponse(
     User user, string accessToken, string refreshToken, DateTime refreshExpiry)
     => new(
         AccessToken: accessToken,
         RefreshToken: refreshToken,
         RefreshTokenExpiry: refreshExpiry,
         UserId: user.Id,
         Email: user.Email,
         FirstName: user.FirstName,
         LastName: user.LastName,
         Role: user.Role.ToString(),
         MustChangePassword: user.MustChangePassword   // ← add
     );

    private static readonly UserRole[] AllowedStaffRoles =
    { UserRole.Dispatcher, UserRole.WarehouseStaff, UserRole.Driver };

    public async Task<User> CreateStaffUserAsync(
      CreateStaffUserDto dto, Guid createdByAdminId, CancellationToken ct = default)
    {
        if (!AllowedStaffRoles.Contains(dto.Role))
            throw new BadRequestException("Only Dispatcher, WarehouseStaff, or Driver accounts can be created this way.");

        if (dto.Role == UserRole.Driver)
        {
            if (string.IsNullOrWhiteSpace(dto.LicenseNumber))
                throw new BadRequestException("License number is required for driver accounts.");
            if (dto.LicenseExpiry is null || dto.LicenseExpiry <= DateTime.UtcNow)
                throw new BadRequestException("A valid, non-expired license expiry date is required for driver accounts.");
        }

        if (await _uow.Users.EmailExistsAsync(dto.Email, ct))
            throw new ConflictException("An account with this email already exists.");

        var tempPassword = GenerateTempPassword();

        var user = new User
        {
            Id = Guid.NewGuid(),
            Email = dto.Email.ToLowerInvariant(),
            PasswordHash = _passwordService.Hash(tempPassword),
            FirstName = dto.FirstName.Trim(),
            LastName = dto.LastName.Trim(),
            PhoneNumber = dto.PhoneNumber.Trim(),
            Role = dto.Role,
            Status = UserStatus.Active,
            MustChangePassword = true,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        try
        {
            await _uow.ExecuteInTransactionAsync(async ct =>
            {
                await _uow.Users.AddAsync(user, ct);
                await _uow.SaveChangesAsync(ct);

                if (dto.Role == UserRole.Driver)
                {
                    var driverProfile = new DriverProfile
                    {
                        Id = Guid.NewGuid(),
                        UserId = user.Id,
                        LicenseNumber = dto.LicenseNumber,
                        LicenseExpiry = dto.LicenseExpiry!.Value,
                        Status = DriverStatus.OffDuty,
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    };
                    await _uow.Query<DriverProfile>().AddAsync(driverProfile, ct);
                    await _uow.SaveChangesAsync(ct);
                }
            }, ct);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[STAFF_CREATE] Failed creating {Role} account for {Email}", dto.Role, dto.Email);
            throw new BadRequestException($"Could not create the {dto.Role} account. No account was created — please try again.");
        }
        // Email send stays OUTSIDE the transaction — a failed email shouldn't roll back a valid account.
        // If this throws, the account still exists correctly; just log it rather than losing the whole operation.
        try
        {
            var subject = "Your CourierSA staff account";
            var content = $"""
<h2 style="margin:0 0 16px 0; color:#0B1B33; font-size:20px;">Welcome to CourierSA</h2>
<p style="margin:0 0 12px 0;">Hi {user.FirstName},</p>
<p style="margin:0 0 16px 0;">An administrator has created a CourierSA account for you as a <strong>{dto.Role}</strong>.</p>
<table role="presentation" style="width:100%; background-color:#F9FAFB; border-radius:6px; margin:0 0 16px 0;">
    <tr>
        <td style="padding:16px;">
            <p style="margin:0 0 8px 0;"><strong>Email:</strong> {user.Email}</p>
            <p style="margin:0;"><strong>Temporary password:</strong> {tempPassword}</p>
        </td>
    </tr>
</table>
<p style="margin:0; font-size:13px; color:#9CA3AF;">Please sign in and change your password immediately — you'll be prompted automatically on first login.</p>
""";
            var htmlBody = EmailTemplateBuilder.Build(subject, content);
            await _emailService.SendAsync(user.Email, subject, htmlBody, ct);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[STAFF_CREATE] Account created for {user.Email} but email failed to send: {ex}");
            // Don't throw — the account is valid, just tell the caller the email may not have gone out.
        }

        await _audit.LogAsync("STAFF_CREATED", "User", user.Id, null, new { dto.Role }, createdByAdminId, null, ct);

        return user;
    }
    public async Task ChangePasswordAsync(Guid userId, ChangePasswordDto dto, CancellationToken ct = default)
    {
        var user = await _uow.Users.GetByIdAsync(userId, ct)
            ?? throw new NotFoundException("User not found.");

        if (!_passwordService.Verify(dto.CurrentPassword, user.PasswordHash))
            throw new UnauthorizedException("Current password is incorrect.");

        user.PasswordHash = _passwordService.Hash(dto.NewPassword);
        user.MustChangePassword = false;
        user.UpdatedAt = DateTime.UtcNow;
        await _uow.SaveChangesAsync(ct);

        await _audit.LogAsync("PASSWORD_CHANGED", "User", user.Id, null, null, user.Id, null, ct);
    }

    private static string GenerateTempPassword()
    {
        // 12 chars, URL-safe, always includes upper/lower/digit for a decent temp password
        const string chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
        var bytes = RandomNumberGenerator.GetBytes(12);
        return new string(bytes.Select(b => chars[b % chars.Length]).ToArray());
    }

}
