using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using CourierSA.Infrastructure.Data;
using System.Security.Claims;

namespace CourierSA.API.Hubs;

/// <summary>
/// Real-time hub for:
/// - Parcel status updates pushed to customer groups
/// - Driver GPS location streamed to dispatchers
/// - Dispatcher broadcast of new parcels to available drivers
/// - Admin dashboard live stats updates
/// 
/// Client URL: /hubs/tracking  (pass ?access_token=... for auth)
/// </summary>
[Authorize]
public class TrackingHub : Hub
{
    private readonly ILogger<TrackingHub> _logger;
    private readonly ApplicationDbContext _db;

    public TrackingHub(ILogger<TrackingHub> logger, ApplicationDbContext db)
    {
        _logger = logger;
        _db     = db;
    }

    // ── Connection ────────────────────────────────────────────────────────────
    public override async Task OnConnectedAsync()
    {
        var userId = Context.UserIdentifier;
        var role   = Context.User?.FindFirstValue(ClaimTypes.Role);

        _logger.LogInformation(
            "User {UserId} ({Role}) connected to TrackingHub [{ConnectionId}]",
            userId, role, Context.ConnectionId);

        // Add to role-based group for targeted broadcasts
        if (!string.IsNullOrEmpty(role))
            await Groups.AddToGroupAsync(Context.ConnectionId, $"role:{role}");

        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var role = Context.User?.FindFirstValue(ClaimTypes.Role);
        if (!string.IsNullOrEmpty(role))
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"role:{role}");

        await base.OnDisconnectedAsync(exception);
    }

    // ── Customer: subscribe to a specific parcel ──────────────────────────────
    /// <summary>
    /// Customer calls this to receive real-time updates for a specific parcel.
    /// Server pushes "ParcelStatusChanged" and "LocationUpdate" to this group.
    /// </summary>
    public async Task SubscribeToParcel(string trackingNumber)
    {
        await Groups.AddToGroupAsync(
            Context.ConnectionId, $"parcel:{trackingNumber}");

        _logger.LogInformation(
            "Connection {Id} subscribed to parcel {TN}",
            Context.ConnectionId, trackingNumber);
    }

    public async Task UnsubscribeFromParcel(string trackingNumber)
    {
        await Groups.RemoveFromGroupAsync(
            Context.ConnectionId, $"parcel:{trackingNumber}");
    }

    // ── Driver: broadcast GPS location ────────────────────────────────────────
    /// <summary>
    /// Driver app calls this every ~15 seconds while on delivery.
    /// Dispatcher dashboard receives "DriverLocationUpdated".
    /// </summary>
    [Authorize(Roles = "Driver")]
    public async Task UpdateLocation(
        string trackingNumber,
        double latitude,
        double longitude,
        double? headingDegrees = null,
        double? speedKmh = null)
    {
        var driverId = Context.UserIdentifier;

        var payload = new
        {
            DriverId        = driverId,
            TrackingNumber  = trackingNumber,
            Latitude        = latitude,
            Longitude       = longitude,
            Heading         = headingDegrees,
            Speed           = speedKmh,
            Timestamp       = DateTime.UtcNow
        };

        // Push to: the parcel's subscriber group + dispatchers
        await Clients.Group($"parcel:{trackingNumber}")
            .SendAsync("LocationUpdate", payload);

        await Clients.Group("role:Dispatcher")
            .SendAsync("DriverLocationUpdated", payload);

        // Persist to DB so GET /api/drivers/locations always has current position
        if (Guid.TryParse(driverId, out var driverGuid))
        {
            var profile = await _db.DriverProfiles.FindAsync(driverGuid);
            if (profile is not null)
            {
                profile.CurrentLatitude  = (decimal)latitude;
                profile.CurrentLongitude = (decimal)longitude;
                profile.UpdatedAt        = DateTime.UtcNow;
                await _db.SaveChangesAsync();
            }
        }
    }

    // ── Dispatcher: ping all drivers ──────────────────────────────────────────
    [Authorize(Roles = "Dispatcher,Administrator")]
    public async Task RequestAllDriverLocations()
    {
        await Clients.Group("role:Driver")
            .SendAsync("LocationRequested", new { RequestedAt = DateTime.UtcNow });
    }
}

/// <summary>
/// Helper service injected into application services to push events to SignalR groups
/// without the Hub having direct business logic dependencies.
/// </summary>
public interface ITrackingHubService
{
    Task NotifyParcelStatusChangedAsync(
        string trackingNumber, string newStatus,
        string? location = null, CancellationToken ct = default);

    Task NotifyAdminDashboardAsync(
        object stats, CancellationToken ct = default);

    Task NotifyDriverNewAssignmentAsync(
        Guid driverId, object deliveryDetails, CancellationToken ct = default);
}

public class TrackingHubService : ITrackingHubService
{
    private readonly IHubContext<TrackingHub> _hub;

    public TrackingHubService(IHubContext<TrackingHub> hub) => _hub = hub;

    public async Task NotifyParcelStatusChangedAsync(
        string trackingNumber, string newStatus,
        string? location = null, CancellationToken ct = default)
    {
        var payload = new
        {
            TrackingNumber = trackingNumber,
            NewStatus      = newStatus,
            Location       = location,
            UpdatedAt      = DateTime.UtcNow
        };

        // Notify the parcel's subscriber group (customer watching their parcel)
        await _hub.Clients.Group($"parcel:{trackingNumber}")
            .SendAsync("ParcelStatusChanged", payload, ct);

        // Also notify dispatchers
        await _hub.Clients.Group("role:Dispatcher")
            .SendAsync("ParcelStatusChanged", payload, ct);
    }

    public async Task NotifyAdminDashboardAsync(
        object stats, CancellationToken ct = default)
    {
        await _hub.Clients.Group("role:Administrator")
            .SendAsync("DashboardStatsUpdated", stats, ct);
    }

    public async Task NotifyDriverNewAssignmentAsync(
        Guid driverId, object deliveryDetails, CancellationToken ct = default)
    {
        await _hub.Clients.User(driverId.ToString())
            .SendAsync("NewDeliveryAssigned", deliveryDetails, ct);
    }
}
