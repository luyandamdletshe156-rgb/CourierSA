using CourierSA.API.Hubs;
using CourierSA.API.Middleware;
using CourierSA.Infrastructure;
using CourierSA.Infrastructure.Data;
using Microsoft.OpenApi.Models;
using Microsoft.EntityFrameworkCore;
using CourierSA.Infrastructure.Data.Seeds;

var builder = WebApplication.CreateBuilder(args);

// ── Services ──────────────────────────────────────────────────────────────────
builder.Services.AddControllers()
    .AddJsonOptions(opts =>
    {
        opts.JsonSerializerOptions.PropertyNamingPolicy = 
            System.Text.Json.JsonNamingPolicy.CamelCase;
        opts.JsonSerializerOptions.DefaultIgnoreCondition =
            System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull;
        // Serialize enums as strings in API responses
        opts.JsonSerializerOptions.Converters.Add(
            new System.Text.Json.Serialization.JsonStringEnumConverter());
        opts.JsonSerializerOptions.ReferenceHandler =
    System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles;
    });

// Infrastructure (DB, Auth, Services, SignalR, CORS)
builder.Services.AddInfrastructure(builder.Configuration);

// Hub service for pushing real-time events from application services
builder.Services.AddScoped<ITrackingHubService, TrackingHubService>();

// Health checks
builder.Services.AddHealthChecks()
    .AddDbContextCheck<ApplicationDbContext>("database");

// Swagger
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo
    {
        Title       = "CourierSA API",
        Version     = "v1",
        Description = "Logistics & courier management platform – University Software Engineering Project",
        Contact     = new OpenApiContact { Name = "CourierSA Team" }
    });

    // Bearer token support in Swagger UI
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name         = "Authorization",
        Type         = SecuritySchemeType.Http,
        Scheme       = "Bearer",
        BearerFormat = "JWT",
        In           = ParameterLocation.Header,
        Description  = "Enter: Bearer {your JWT token}"
    });

    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id   = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });
});

// ── Build ──────────────────────────────────────────────────────────────────────
var app = builder.Build();

// ── Middleware Pipeline ───────────────────────────────────────────────────────
app.UseMiddleware<GlobalExceptionMiddleware>();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI(c =>
    {
        c.SwaggerEndpoint("/swagger/v1/swagger.json", "CourierSA API v1");
        c.RoutePrefix = "swagger";
    });
}

app.UseHttpsRedirection();
app.UseStaticFiles(); // serves wwwroot/uploads (barcodes, POD photos)

app.UseCors("CourierSACors");

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

// SignalR hub
app.MapHub<TrackingHub>("/hubs/tracking");

// Health check endpoint
app.MapHealthChecks("/health");

if (app.Environment.IsDevelopment())
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    await CourierSA.Infrastructure.Data.Seeds.DatabaseSeeder.SeedAsync(db, logger);
}

app.Run();
