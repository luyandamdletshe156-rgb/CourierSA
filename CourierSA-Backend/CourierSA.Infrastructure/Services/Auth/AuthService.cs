using CourierSA.Application.DTOs.Auth;
using CourierSA.Application.Interfaces.Services;
using CourierSA.Domain.Entities;
using CourierSA.Domain.Enums;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using CourierSA.Application.Interfaces.Repositories;
using CourierSA.Domain.Exceptions;

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

    public AuthService(
        IUnitOfWork      uow,
        ITokenService    tokenService,
        IPasswordService passwordService,
        IAuditService    audit)
    {
        _uow             = uow;
        _tokenService    = tokenService;
        _passwordService = passwordService;
        _audit           = audit;
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
        await _uow.SaveChangesAsync(ct);

        var accessToken  = _tokenService.GenerateAccessToken(user);
        var refreshToken = _tokenService.GenerateRefreshToken();

        user.RefreshToken           = refreshToken;
        user.RefreshTokenExpiryTime = _tokenService.GetRefreshTokenExpiry();
        await _uow.SaveChangesAsync(ct);

        await _audit.LogAsync("REGISTER", "User", user.Id, null, null, user.Id, ipAddress, ct);

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

    private static AuthResponseDto MapToResponse(
        User user, string accessToken, string refreshToken, DateTime refreshExpiry)
        => new(
            AccessToken:        accessToken,
            RefreshToken:       refreshToken,
            RefreshTokenExpiry: refreshExpiry,
            UserId:             user.Id,
            Email:              user.Email,
            FirstName:          user.FirstName,
            LastName:           user.LastName,
            Role:               user.Role.ToString()
        );
}
