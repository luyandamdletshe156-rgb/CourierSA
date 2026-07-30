using CourierSA.Application.DTOs.Auth;
using CourierSA.Application.Interfaces.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using CourierSA.API.Middleware;
using CourierSA.Domain.Exceptions;
using CourierSA.Application.Interfaces.Repositories;
using CourierSA.Application.DTOs.Parcels;
using CourierSA.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using CourierSA.Domain.Entities;

namespace CourierSA.API.Controllers;

// ── Auth Controller ───────────────────────────────────────────────────────────
[Route("api/auth")]
public class AuthController : CourierSABaseController
{
    private readonly IAuthService _authService;

    public AuthController(IAuthService authService)
        => _authService = authService;

    /// <summary>POST /api/auth/login</summary>
    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<IActionResult> Login(
        [FromBody] LoginDto dto, CancellationToken ct)
    {
        var ipAddress = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        var result    = await _authService.LoginAsync(dto, ipAddress, ct);
        return Ok(result, "Login successful");
    }

    /// <summary>POST /api/auth/register</summary>
    [HttpPost("register")]
    [AllowAnonymous]
    public async Task<IActionResult> Register(
        [FromBody] RegisterDto dto, CancellationToken ct)
    {
        var ipAddress = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        var result    = await _authService.RegisterAsync(dto, ipAddress, ct);
        return Created(result, "Registration successful");
    }

    /// <summary>POST /api/auth/refresh</summary>
    [HttpPost("refresh")]
    [AllowAnonymous]
    public async Task<IActionResult> Refresh(
        [FromBody] RefreshTokenDto dto, CancellationToken ct)
    {
        var result = await _authService.RefreshTokenAsync(dto.RefreshToken, ct);
        return Ok(result, "Token refreshed");
    }

    /// <summary>POST /api/auth/revoke</summary>
    [HttpPost("revoke")]
    [Authorize]
    public async Task<IActionResult> Revoke(CancellationToken ct)
    {
        await _authService.RevokeTokenAsync(CurrentUserId, ct);
        return NoContent("Logged out successfully");
    }

    /// <summary>GET /api/auth/me</summary>
    [HttpGet("me")]
    [Authorize]
    public IActionResult Me()
    {
        return Ok(new
        {
            UserId    = CurrentUserId,
            Role      = CurrentUserRole,
            Email     = User.FindFirstValue(ClaimTypes.Email),
            FirstName = User.FindFirstValue("firstName"),
            LastName  = User.FindFirstValue("lastName")
        });
    }

    /// <summary>POST /api/auth/forgot-password</summary>
    [HttpPost("forgot-password")]
    [AllowAnonymous]
    public async Task<IActionResult> ForgotPassword(
        [FromBody] ForgotPasswordDto dto, CancellationToken ct)
    {
        await _authService.ForgotPasswordAsync(dto.Email, ct);
        return Ok(new { }, "If an account exists for that email, a reset link has been sent.");
    }

    /// <summary>POST /api/auth/reset-password</summary>
    [HttpPost("reset-password")]
    [AllowAnonymous]
    public async Task<IActionResult> ResetPassword(
        [FromBody] ResetPasswordDto dto, CancellationToken ct)
    {
        await _authService.ResetPasswordAsync(dto, ct);
        return NoContent("Password reset successful. Please sign in with your new password.");
    }
    /// <summary>POST /api/auth/change-password</summary>
    [HttpPost("change-password")]
    [Authorize]
    public async Task<IActionResult> ChangePassword(
        [FromBody] ChangePasswordDto dto, CancellationToken ct)
    {
        await _authService.ChangePasswordAsync(CurrentUserId, dto, ct);
        return NoContent("Password changed successfully");
    }

}

// ── Parcels Controller ────────────────────────────────────────────────────────
[Route("api/parcels")]
[Authorize]
public class ParcelsController : CourierSABaseController
{
    private readonly IParcelService _parcelService;
    private readonly IBulkCsvService _bulkCsvService;

    public ParcelsController(IParcelService parcelService, IBulkCsvService bulkCsvService)
    {
        _parcelService = parcelService;
        _bulkCsvService = bulkCsvService;
    }
    /// <summary>GET /api/parcels – Customer's own parcels (paged)</summary>
    [HttpGet]
    [HttpGet]
    [Authorize(Roles = "Customer, BusinessClient, Dispatcher, Administrator")]
    public async Task<IActionResult> GetMyParcels(
        [FromQuery] ParcelFilterDto filter, CancellationToken ct)
    {
        var result = await _parcelService.GetPagedAsync(filter, CurrentUserId, ct);
        return Ok(result);
    }

    /// <summary>GET /api/parcels/{id}</summary>
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct)
    {
        var parcel = await _parcelService.GetDetailAsync(id, ct)
            ?? throw new NotFoundException($"Parcel {id} not found.");
        return Ok(parcel);
    }

    /// <summary>POST /api/parcels – Book a new parcel</summary>
    [HttpPost]
[Authorize(Roles = "Customer, BusinessClient, Dispatcher, Administrator")]
    public async Task<IActionResult> Book(
        [FromBody] CreateParcelDto dto, CancellationToken ct)
    {
        var result = await _parcelService.BookAsync(dto, CurrentUserId, ct);
        return Created(result, $"Parcel booked. Tracking: {result.TrackingNumber}");
    }

    /// <summary>PUT /api/parcels/{id}/approve – Dispatcher approves a booking</summary>
    [HttpPut("{id:guid}/approve")]
    [Authorize(Policy = "DispatcherOrAdmin")]
    public async Task<IActionResult> Approve(Guid id, CancellationToken ct)
    {
        await _parcelService.ApproveAsync(id, CurrentUserId, ct);
        return NoContent("Parcel approved");
    }

    /// <summary>PUT /api/parcels/{id}/reject – Dispatcher rejects a booking</summary>
    [HttpPut("{id:guid}/reject")]
    [Authorize(Policy = "DispatcherOrAdmin")]
    public async Task<IActionResult> Reject(
        Guid id, [FromBody] RejectParcelDto dto, CancellationToken ct)
    {
        await _parcelService.RejectAsync(id, dto.Reason, CurrentUserId, ct);
        return NoContent("Parcel rejected");
    }

    /// <summary>PUT /api/parcels/{id}/checkin – Warehouse staff checks in parcel</summary>
    [HttpPut("{id:guid}/checkin")]
    [Authorize(Policy = "WarehouseOrAdmin")]
    public async Task<IActionResult> CheckIn(
        Guid id, [FromBody] CheckInDto dto, CancellationToken ct)
    {
        await _parcelService.CheckInAsync(id, dto.WarehouseLocation, CurrentUserId, ct);
        return NoContent("Parcel checked in to warehouse");
    }

    /// <summary>PUT /api/parcels/{id}/dispatch – Dispatcher assigns driver</summary>
    [HttpPut("{id:guid}/dispatch")]
    [Authorize(Policy = "DispatcherOrAdmin")]
    public async Task<IActionResult> Dispatch(
        Guid id, [FromBody] DispatchParcelDto dto, CancellationToken ct)
    {
        await _parcelService.DispatchAsync(id, dto.DriverId, CurrentUserId, ct);
        return NoContent("Parcel dispatched to driver");
    }

    /// <summary>PUT /api/parcels/{id}/return – Dispatcher initiates return to sender</summary>
    [HttpPut("{id:guid}/return")]
    [Authorize(Policy = "DispatcherOrAdmin")]
    public async Task<IActionResult> ReturnToSender(
        Guid id, [FromBody] ReturnParcelDto dto, CancellationToken ct)
    {
        var parcel = await _parcelService.GetDetailAsync(id, ct)
            ?? throw new NotFoundException($"Parcel {id} not found.");

        if (parcel.Status != "FailedDelivery")
            throw new BadRequestException("Only parcels with status 'FailedDelivery' can be returned.");

        // Reuse the RejectAsync flow — marks status Cancelled with a return note
        await _parcelService.RejectAsync(id, $"Return to sender: {dto.Notes ?? "No notes"}", CurrentUserId, ct);
        return NoContent("Return to sender initiated");
    }

    /// <summary>POST /api/parcels/bulk-upload – CSV bulk import (BusinessClient/Admin)</summary>
    [HttpPost("bulk-upload")]
    [Authorize(Policy = "CustomerOrBiz")]
    [RequestSizeLimit(10 * 1024 * 1024)] // 10 MB
    public async Task<IActionResult> BulkUpload(
        IFormFile file, CancellationToken ct)
    {
        if (file is null || file.Length == 0)
            throw new BadRequestException("No file provided.");
        if (!file.FileName.EndsWith(".csv", StringComparison.OrdinalIgnoreCase))
            throw new BadRequestException("Only CSV files are accepted.");

        await using var stream = file.OpenReadStream();
        var result = await _bulkCsvService.ProcessAsync(stream, CurrentUserId, file.FileName, ct);
        return Ok(result, $"Bulk upload complete: {result.Successful} succeeded, {result.Failed} failed.");
    }

    /// <summary>GET /api/parcels/queue – Dispatcher/Admin: unscoped parcel queue (not customer-scoped)</summary>
    [HttpGet("queue")]
    [Authorize(Policy = "DispatcherOrAdmin")]
    public async Task<IActionResult> GetQueue(
        [FromQuery] ParcelFilterDto filter, CancellationToken ct)
    {
        var result = await _parcelService.GetQueueAsync(filter, ct);
        return Ok(result);
    }
}

// ── Tracking Controller (public) ──────────────────────────────────────────────
[Route("api/tracking")]
public class TrackingController : CourierSABaseController
{
    private readonly IParcelService _parcelService;

    public TrackingController(IParcelService parcelService)
        => _parcelService = parcelService;

    /// <summary>GET /api/tracking/{trackingNumber} – Public tracking (no auth)</summary>
    [HttpGet("{trackingNumber}")]
    [AllowAnonymous]
    public async Task<IActionResult> Track(
        string trackingNumber, CancellationToken ct)
    {
        var result = await _parcelService.TrackAsync(trackingNumber, ct);
        if (result is null)
            throw new NotFoundException($"No parcel found with tracking number '{trackingNumber}'.");
        return Ok(result);
    }
}

// ── Deliveries Controller (Driver) ────────────────────────────────────────────
[Route("api/deliveries")]
[Authorize]
public class DeliveriesController : CourierSABaseController
{
    private readonly IParcelService _parcelService;
    private readonly IUnitOfWork    _uow;

    public DeliveriesController(IParcelService parcelService, IUnitOfWork uow)
    {
        _parcelService = parcelService;
        _uow           = uow;
    }

    /// <summary>GET /api/deliveries/my – Driver's active deliveries</summary>
    [HttpGet("my")]
        [Authorize(Policy = "DriverOnly")]
    public async Task<IActionResult> GetMyDeliveries(CancellationToken ct)
    {
        var result = await _parcelService.GetDriverDeliveriesAsync(CurrentUserId, ct);
        return Ok(result);
    }

    /// <summary>
    /// GET /api/deliveries/history?page=1&pageSize=15
    /// Driver's completed and failed deliveries — for the History page.
    /// </summary>
    [HttpGet("history")]
    [Authorize(Policy = "DriverOnly")]
    public async Task<IActionResult> GetMyHistory(
        [FromQuery] int page     = 1,
        [FromQuery] int pageSize = 15,
        CancellationToken ct = default)
    {
        // Resolve driver profile from the authenticated user ID
        var driverProfile = await _uow.Query<DriverProfile>()
            .FirstOrDefaultAsync(d => d.UserId == CurrentUserId, ct)
            ?? throw new NotFoundException("Driver profile not found.");

        var query = _uow.Deliveries
            .Query()
            .AsNoTracking()
            .Where(d => d.DriverId == driverProfile.Id &&
                        (d.Status == DeliveryStatus.Delivered ||
                         d.Status == DeliveryStatus.Failed))
            .Include(d => d.Parcel)
                .ThenInclude(p => p!.DeliveryAddress)
            .OrderByDescending(d => d.UpdatedAt);

        var total = await query.CountAsync(ct);

        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(d => new
            {
                d.Id,
                d.Status,
                d.FailureReason,
                d.AttemptNotes,
                d.DeliveredAt,
                d.UpdatedAt,
                trackingNumber = d.Parcel != null ? d.Parcel.TrackingNumber : "—",
                recipientName  = d.Parcel!.DeliveryAddress != null
                    ? d.Parcel.DeliveryAddress.RecipientName : "—",
                city = d.Parcel!.DeliveryAddress != null
                    ? d.Parcel.DeliveryAddress.City : "—",
            })
            .ToListAsync(ct);

        return Ok(new { items, totalCount = total, page, pageSize });
    }

    /// <summary>GET /api/deliveries/failed – Dispatcher: all failed deliveries</summary>
    [HttpGet("failed")]
    [Authorize(Policy = "DispatcherOrAdmin")]
    public async Task<IActionResult> GetFailed(CancellationToken ct)
    {
        var deliveries = await _uow.Deliveries.GetFailedDeliveriesAsync(ct);
        var result = deliveries.Select(d => new
        {
            d.Id,
            d.ParcelId,
            d.DriverId,
            d.Status,
            d.FailureReason,
            d.AttemptNotes,
            d.UpdatedAt,
            parcel = d.Parcel == null ? null : new
            {
                d.Parcel.Id,
                d.Parcel.TrackingNumber,
                d.Parcel.Status,
                deliveryAddress = d.Parcel.DeliveryAddress == null ? null : new
                {
                    d.Parcel.DeliveryAddress.RecipientName,
                    d.Parcel.DeliveryAddress.RecipientPhone,
                    d.Parcel.DeliveryAddress.StreetAddress,
                    d.Parcel.DeliveryAddress.City,
                },
            },
            driver = d.Driver?.User == null ? null : new
            {
                d.Driver.User.FirstName,
                d.Driver.User.LastName,
                d.Driver.User.PhoneNumber,
            },
        });
        return Ok(result);
    }

    /// <summary>PUT /api/deliveries/{id}/delivered</summary>
    [HttpPut("{id:guid}/delivered")]
    public async Task<IActionResult> MarkDelivered(
        Guid id, [FromBody] ProofOfDeliveryDto dto, CancellationToken ct)
    {
        await _parcelService.MarkDeliveredAsync(id, dto, CurrentUserId, ct);
        return NoContent("Delivery marked as successful");
    }

    /// <summary>PUT /api/deliveries/{id}/failed</summary>
    [HttpPut("{id:guid}/failed")]
    public async Task<IActionResult> MarkFailed(
        Guid id, [FromBody] FailedDeliveryDto dto, CancellationToken ct)
    {
        await _parcelService.MarkFailedAsync(id, dto, CurrentUserId, ct);
        return NoContent("Delivery marked as failed");
    }

    /// <summary>PUT /api/deliveries/{id}/location – Driver GPS update</summary>
    [HttpPut("{id:guid}/location")]
    public async Task<IActionResult> UpdateLocation(
        Guid id, [FromBody] DriverLocationDto dto, CancellationToken ct)
    {
        await _parcelService.UpdateDriverLocationAsync(CurrentUserId, dto.Latitude, dto.Longitude, ct);
        return NoContent("Location updated");
    }
}

// ── Notifications Controller ──────────────────────────────────────────────────
[Route("api/notifications")]
[Authorize]
public class NotificationsController : CourierSABaseController
{
    private readonly INotificationService _notificationService;

    public NotificationsController(INotificationService notificationService)
        => _notificationService = notificationService;

    [HttpGet]
    public async Task<IActionResult> GetUnread(CancellationToken ct)
    {
        var result = await _notificationService.GetUnreadAsync(CurrentUserId, ct);
        return Ok(result);
    }

    [HttpPut("{id:guid}/read")]
    public async Task<IActionResult> MarkRead(Guid id, CancellationToken ct)
    {
        await _notificationService.MarkReadAsync(id, ct);
        return NoContent("Notification marked as read");
    }

    [HttpPut("read-all")]
    public async Task<IActionResult> MarkAllRead(CancellationToken ct)
    {
        await _notificationService.MarkAllReadAsync(CurrentUserId, ct);
        return NoContent("All notifications marked as read");
    }
}



// ── Admin Controller ──────────────────────────────────────────────────────────
[Route("api/admin")]
[Authorize(Policy = "AdminOnly")]
public class AdminController : CourierSABaseController
{
    private readonly IUnitOfWork  _uow;
    private readonly IAuditService _audit;

    public AdminController(IUnitOfWork uow, IAuditService audit)
    {
        _uow   = uow;
        _audit = audit;
    }

    [HttpGet("users")]
    public async Task<IActionResult> GetUsers(CancellationToken ct)
    {
        var users = await _uow.Users.GetAllAsync(ct);
        return Ok(users.Select(u => new
        {
            u.Id, u.FirstName, u.LastName, u.Email,
            u.Role, u.Status, u.CreatedAt, u.LastLoginAt
        }));
    }

    [HttpPut("users/{id:guid}/suspend")]
    public async Task<IActionResult> SuspendUser(Guid id, CancellationToken ct)
    {
        var user = await _uow.Users.GetByIdAsync(id, ct)
            ?? throw new NotFoundException("User not found.");
        user.Status    = UserStatus.Suspended;
        user.UpdatedAt = DateTime.UtcNow;
        _uow.Users.Update(user);
        await _uow.SaveChangesAsync(ct);
        await _audit.LogAsync("USER_SUSPENDED", "User", id, null, null, CurrentUserId, null, ct);
        return NoContent("User suspended");
    }

    [HttpGet("audit-logs")]
    public async Task<IActionResult> GetAuditLogs(
        [FromQuery] string entityType, [FromQuery] Guid? entityId,
        CancellationToken ct)
    {
        var logs = entityId.HasValue
            ? await _uow.AuditLogs.GetEntityHistoryAsync(entityType, entityId.Value, ct)
            : await _uow.AuditLogs.GetAllAsync(ct);

        return Ok(logs);
    }

    [HttpGet("dashboard/stats")]
    public async Task<IActionResult> DashboardStats(CancellationToken ct)
    {
        var totalParcels    = await _uow.Parcels.CountAsync(ct: ct);
        var pendingApproval = await _uow.Parcels.CountAsync(
            p => p.Status == ParcelStatus.PendingApproval, ct);
        var inTransit       = await _uow.Parcels.CountAsync(
            p => p.Status == ParcelStatus.OutForDelivery, ct);
        var delivered       = await _uow.Parcels.CountAsync(
            p => p.Status == ParcelStatus.Delivered, ct);
        var totalUsers      = await _uow.Users.CountAsync(ct: ct);

        return Ok(new
        {
            totalParcels,
            pendingApproval,
            inTransit,
            delivered,
            totalUsers,
            generatedAt = DateTime.UtcNow
        });
    }

    /// <summary>POST /api/admin/staff</summary>
    [HttpPost("staff")]
    public async Task<IActionResult> CreateStaff(
        [FromBody] CreateStaffUserDto dto, [FromServices] IAuthService authService, CancellationToken ct)
    {
        var user = await authService.CreateStaffUserAsync(dto, CurrentUserId, ct);
        return Created(new { user.Id, user.Email, user.Role }, $"Staff account created for {user.FullName}.");
    }

}
