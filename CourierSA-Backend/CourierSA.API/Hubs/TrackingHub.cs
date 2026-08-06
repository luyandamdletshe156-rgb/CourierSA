using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using System.Security.Claims;
using CourierSA.Application.Interfaces.Services;

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
    private readonly IParcelService _parcelService;

    public TrackingHub(ILogger<TrackingHub> logger, IParcelService parcelService)
    {
        _logger = logger;
        _parcelService = parcelService;
    }

    // ── Connection ────────────────────────────────────────────────────────────
    public override async Task OnConnectedAsync()
    {
        var userId = Context.UserIdentifier;
        var role = Context.User?.FindFirstValue(ClaimTypes.Role)
                  ?? Context.User?.FindFirstValue("role")
                  ?? Context.User?.FindFirstValue("Role");

        _logger.LogInformation(
            "User {UserId} ({Role}) connected to TrackingHub [{ConnectionId}]",
            userId, role, Context.ConnectionId);

        if (!string.IsNullOrEmpty(role))
            await Groups.AddToGroupAsync(Context.ConnectionId, $"role:{role}");

        await base.OnConnectedAsync();
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var role = Context.User?.FindFirstValue(ClaimTypes.Role)
                  ?? Context.User?.FindFirstValue("role")
                  ?? Context.User?.FindFirstValue("Role");

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
    /// Resolves the caller's UserId → DriverProfile via IParcelService, and
    /// broadcasts DriverProfile.Id — matching the shape of GET /api/drivers/locations
    /// so the frontend's REST snapshot and live SignalR updates key against the same id.
    /// </summary>
    [Authorize(Roles = "Driver")]
    public async Task UpdateLocation(
        string trackingNumber,
        double latitude,
        double longitude,
        double? headingDegrees = null,
        double? speedKmh = null)
    {
        var userIdStr = Context.UserIdentifier;

        if (!Guid.TryParse(userIdStr, out var userId))
        {
            _logger.LogWarning("UpdateLocation: unparseable UserIdentifier {UserId}", userIdStr);
            return;
        }

        var profileId = await _parcelService.UpdateDriverLocationAsync(
            userId, (decimal)latitude, (decimal)longitude);

        if (profileId is null)
        {
            _logger.LogWarning("UpdateLocation: no DriverProfile found for UserId {UserId} — location not persisted or broadcast", userId);
            return;
        }

        var payload = new
        {
            DriverId = profileId.Value,
            TrackingNumber = trackingNumber,
            Latitude = latitude,
            Longitude = longitude,
            Heading = headingDegrees,
            Speed = speedKmh,
            Timestamp = DateTime.UtcNow
        };

        await Clients.Group($"parcel:{trackingNumber}")
            .SendAsync("LocationUpdate", payload);

        await Clients.Group("role:Dispatcher")
            .SendAsync("DriverLocationUpdated", payload);
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
            NewStatus = newStatus,
            Location = location,
            UpdatedAt = DateTime.UtcNow
        };

        await _hub.Clients.Group($"parcel:{trackingNumber}")
            .SendAsync("ParcelStatusChanged", payload, ct);

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