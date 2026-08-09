using CourierSA.Application.Interfaces.Repositories;
using CourierSA.Application.Interfaces.Services;
using CourierSA.Infrastructure.Data;
using CourierSA.Infrastructure.Data.Repositories;
using CourierSA.Infrastructure.Services;
using CourierSA.Infrastructure.Services.Auth;
using CourierSA.Infrastructure.Services.Email;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.IdentityModel.Tokens;
using System.Text;

namespace CourierSA.Infrastructure;

public static class InfrastructureServiceExtensions
{
    public static IServiceCollection AddInfrastructure(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        // ── Database ──────────────────────────────────────────────────────────
        services.AddDbContext<ApplicationDbContext>(options =>
            options.UseMySql(
                configuration.GetConnectionString("DefaultConnection"),
                ServerVersion.AutoDetect(
                    configuration.GetConnectionString("DefaultConnection")),
                mysql =>
                {
                    mysql.MigrationsAssembly("CourierSA.Infrastructure");
                    mysql.EnableRetryOnFailure(
                        maxRetryCount: 5,
                        maxRetryDelay: TimeSpan.FromSeconds(10),
                        errorNumbersToAdd: null);
                }));

        // ── Unit of Work & Repositories ───────────────────────────────────────
        services.AddScoped<IUnitOfWork, UnitOfWork>();
        services.AddScoped<IParcelRepository, ParcelRepository>();
        services.AddScoped<IUserRepository, UserRepository>();
        services.AddScoped<IDeliveryRepository, DeliveryRepository>();
        services.AddScoped<IInvoiceRepository, InvoiceRepository>();
        services.AddScoped<IAuditLogRepository, AuditLogRepository>();

        // ── JWT Auth ──────────────────────────────────────────────────────────
        var jwtSection = configuration.GetSection("Jwt");
        services.Configure<JwtSettings>(jwtSection);

        var jwtSettings = jwtSection.Get<JwtSettings>()!;
        var key         = Encoding.UTF8.GetBytes(jwtSettings.SecretKey);

        services
            .AddAuthentication(opts =>
            {
                opts.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
                opts.DefaultChallengeScheme    = JwtBearerDefaults.AuthenticationScheme;
            })
            .AddJwtBearer(opts =>
            {
                opts.SaveToken = true;
                opts.TokenValidationParameters = new TokenValidationParameters
                {
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey        = new SymmetricSecurityKey(key),
                    ValidateIssuer          = true,
                    ValidIssuer             = jwtSettings.Issuer,
                    ValidateAudience        = true,
                    ValidAudience           = jwtSettings.Audience,
                    ValidateLifetime        = true,
                    ClockSkew               = TimeSpan.FromMinutes(1)
                };

                // SignalR – read token from query string
                opts.Events = new JwtBearerEvents
                {
                    OnMessageReceived = context =>
                    {
                        var accessToken = context.Request.Query["access_token"];
                        var path = context.HttpContext.Request.Path;
                        if (!string.IsNullOrEmpty(accessToken) &&
                            path.StartsWithSegments("/hubs"))
                        {
                            context.Token = accessToken;
                        }
                        return Task.CompletedTask;
                    }
                };
            });

        // ── Authorization Policies ────────────────────────────────────────────
        services.AddAuthorizationBuilder()
            .AddPolicy("AdminOnly",        p => p.RequireRole("Administrator"))
            .AddPolicy("DispatcherOrAdmin",p => p.RequireRole("Dispatcher", "Administrator"))
            .AddPolicy("DriverOnly",       p => p.RequireRole("Driver"))
            .AddPolicy("WarehouseOrAdmin", p => p.RequireRole("WarehouseStaff", "Administrator"))
            .AddPolicy("CustomerOrBiz",    p => p.RequireRole("Customer", "BusinessClient"))
            .AddPolicy("StaffOnly",        p => p.RequireRole(
                "Dispatcher", "WarehouseStaff", "Administrator", "Driver"));

        // ── Application Services ──────────────────────────────────────────────
        services.AddScoped<ITokenService,        JwtTokenService>();
        services.AddScoped<IPasswordService,     PasswordService>();
        services.AddScoped<IAuthService,         AuthService>();
        services.AddScoped<IParcelService,       ParcelService>();
        services.AddScoped<ILostParcelService, LostParcelService>();
        services.AddScoped<IReturnService, ReturnService>();
        services.AddScoped<IQuoteService,        QuoteService>();
        services.AddScoped<INotificationService, NotificationService>();
        services.AddScoped<IAuditService,        AuditService>();
        services.AddScoped<IBarcodeService,      BarcodeService>();
        services.AddScoped<IStorageService,      LocalStorageService>();
        services.Configure<BrevoEmailSettings>(configuration.GetSection("BrevoEmailSettings"));
        services.AddScoped<IEmailService, EmailService>();
        services.AddScoped<IBulkCsvService, BulkCsvService>();
        services.AddScoped<ISecureDeliveryService, SecureDeliveryService>();
        services.AddScoped<IReschedulingService, ReschedulingService>();


        // ── SignalR ───────────────────────────────────────────────────────────
        services.AddSignalR(opts =>
        {
            opts.EnableDetailedErrors = true; // disable in production
        });

        // ── CORS ──────────────────────────────────────────────────────────────
        // ── CORS ──────────────────────────────────────────────────────────────
        services.AddCors(opts =>
        {
            opts.AddPolicy("CourierSACors", policy =>
                policy
                    .WithOrigins(
                        "http://localhost:5173", // Keep this for local testing
                        "https://couriersa2frontend.z1.web.core.windows.net" // Add your live Azure frontend!
                    )
                    .AllowAnyHeader()
                    .AllowAnyMethod()
                    .AllowCredentials()); // required for SignalR
        });

        return services;
    }
}
