using CourierSA.API.Middleware;
using CourierSA.Application.DTOs.Auth;
using CourierSA.Application.DTOs.CollectionDamage;
using CourierSA.Application.DTOs.LostParcel;
using CourierSA.Application.DTOs.Parcels;
using CourierSA.Application.DTOs.Rescheduling;
using CourierSA.Application.DTOs.Returns;
using CourierSA.Application.DTOs.Routing;
using CourierSA.Application.DTOs.SecureDelivery;
using CourierSA.Application.DTOs.Sorting;
using CourierSA.Application.Interfaces.Repositories;
using CourierSA.Application.Interfaces.Services;
using CourierSA.Domain.Entities;
using CourierSA.Domain.Enums;
using CourierSA.Domain.Exceptions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;

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
        var result = await _authService.LoginAsync(dto, ipAddress, ct);
        return Ok(result, "Login successful");
    }

    /// <summary>POST /api/auth/register</summary>
    [HttpPost("register")]
    [AllowAnonymous]
    public async Task<IActionResult> Register(
        [FromBody] RegisterDto dto, CancellationToken ct)
    {
        var ipAddress = HttpContext.Connection.RemoteIpAddress?.ToString() ?? "unknown";
        var result = await _authService.RegisterAsync(dto, ipAddress, ct);
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
            UserId = CurrentUserId,
            Role = CurrentUserRole,
            Email = User.FindFirstValue(ClaimTypes.Email),
            FirstName = User.FindFirstValue("firstName"),
            LastName = User.FindFirstValue("lastName")
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

    /// <summary>GET /api/parcels – Customer's own parcels, or full queue for Staff/Admin</summary>
    [HttpGet]
    [Authorize(Roles = "Customer, BusinessClient, Dispatcher, WarehouseStaff, Administrator")]
    public async Task<IActionResult> GetMyParcels(
        [FromQuery] ParcelFilterDto filter, CancellationToken ct)
    {
        if (User.IsInRole("Administrator") ||
            User.IsInRole("Dispatcher") ||
            User.IsInRole("WarehouseStaff"))
        {
            var queueResult = await _parcelService.GetQueueAsync(filter, ct);
            return Ok(queueResult);
        }

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

    /// <summary>POST /api/parcels/batch – Book multiple parcels from the customer's cart in one transaction</summary>
    [HttpPost("batch")]
    [Authorize(Roles = "Customer, BusinessClient, Dispatcher, Administrator")]
    public async Task<IActionResult> BookBatch(
        [FromBody] CreateParcelBatchDto dto, CancellationToken ct)
    {
        var result = await _parcelService.BookBatchAsync(dto, CurrentUserId, ct);
        return Created(result, $"{result.Parcels.Count} parcel(s) booked.");
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
        await _parcelService.CheckInAsync(id, dto.SortingBinId, CurrentUserId, ct);
        return NoContent("Parcel checked in to warehouse");
    }

    /// <summary>GET /api/parcels/{id}/sorting-suggestion – Suggested bin + all active bins for check-in modal</summary>
    [HttpGet("{id:guid}/sorting-suggestion")]
    [Authorize(Policy = "WarehouseOrAdmin")]
    public async Task<IActionResult> GetSortingSuggestion(Guid id, CancellationToken ct)
    {
        var result = await _parcelService.GetSortingSuggestionAsync(id, ct);
        return Ok(result);
    }

    /// <summary>PUT /api/parcels/{id}/checkout – Warehouse staff checks parcel out, ready for dispatch</summary>
    [HttpPut("{id:guid}/checkout")]
    [Authorize(Policy = "WarehouseOrAdmin")]
    public async Task<IActionResult> Checkout(Guid id, CancellationToken ct)
    {
        await _parcelService.CheckoutAsync(id, CurrentUserId, ct);
        return NoContent("Parcel checked out — ready for dispatch");
    }

    /// <summary>POST /api/parcels/{id}/inspections – Log a check-in or checkout condition inspection</summary>
    [HttpPost("{id:guid}/inspections")]
    [Authorize(Policy = "WarehouseOrAdmin")]
    public async Task<IActionResult> LogInspection(
        Guid id, [FromBody] LogParcelInspectionDto dto, CancellationToken ct)
    {
        var result = await _parcelService.LogInspectionAsync(id, dto, CurrentUserId, ct);
        return Created(result, $"{dto.Stage} inspection logged: {dto.Result}");
    }

    /// <summary>GET /api/parcels/inspections – All parcel inspections (Inspections page)</summary>
    [HttpGet("inspections")]
    [Authorize(Policy = "WarehouseOrAdmin")]
    public async Task<IActionResult> GetInspections(CancellationToken ct)
    {
        var result = await _parcelService.GetInspectionsAsync(ct);
        return Ok(result);
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

    /// <summary>GET /api/parcels/queue – Unscoped parcel queue for staff</summary>
    [HttpGet("queue")]
    [Authorize(Roles = "Dispatcher, WarehouseStaff, Administrator")]
    public async Task<IActionResult> GetQueue(
        [FromQuery] ParcelFilterDto filter, CancellationToken ct)
    {
        var result = await _parcelService.GetQueueAsync(filter, ct);
        return Ok(result);
    }

    /// <summary>POST /api/parcels/dispatch-route – Dispatcher assigns multiple same-zone parcels to one driver</summary>
    [HttpPost("dispatch-route")]
    [Authorize(Policy = "DispatcherOrAdmin")]
    public async Task<IActionResult> DispatchRoute(
        [FromBody] CreateRouteDto dto, CancellationToken ct)
    {
        var result = await _parcelService.DispatchRouteAsync(dto, CurrentUserId, ct);
        return Created(result, $"Route dispatched with {result.Stops.Count} stop(s).");
    }

    // ══════════════════════════════════════════════════════════════════════════════
    // ➕ CUSTOMER CANCELLATION ENDPOINTS
    // ══════════════════════════════════════════════════════════════════════════════

    /// <summary>GET /api/parcels/{id}/cancel-quote – Customer previews cancellation fee & OTP rules</summary>
    [HttpGet("{id:guid}/cancel-quote")]
    [Authorize(Policy = "CustomerOrBiz")]
    public async Task<IActionResult> PreviewCancelFee(Guid id, CancellationToken ct)
    {
        var result = await _parcelService.PreviewCancelFeeAsync(id, CurrentUserId, ct);
        return Ok(result);
    }

    /// <summary>PUT /api/parcels/{id}/request-cancel-otp – Send 4-digit OTP for warehouse cancellation</summary>
    [HttpPut("{id:guid}/request-cancel-otp")]
    [Authorize(Policy = "CustomerOrBiz")]
    public async Task<IActionResult> RequestCancelOtp(Guid id, CancellationToken ct)
    {
        await _parcelService.SendCancellationOtpAsync(id, CurrentUserId, ct);
        return Ok(new { message = "Cancellation verification OTP code sent to your registered email." });
    }

    /// <summary>PUT /api/parcels/{id}/cancel – Customer confirms parcel cancellation (OTP required if in warehouse)</summary>
    [HttpPut("{id:guid}/cancel")]
    [Authorize(Policy = "CustomerOrBiz")]
    public async Task<IActionResult> CancelParcel(
        Guid id, [FromBody] CancelParcelDto dto, CancellationToken ct)
    {
        var result = await _parcelService.CancelByCustomerAsync(id, dto, CurrentUserId, ct);
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

    /// <summary>GET /api/tracking/private/{trackingNumber} – Authenticated, richer detail, ownership-checked</summary>
    [HttpGet("private/{trackingNumber}")]
    [Authorize]
    public async Task<IActionResult> TrackPrivate(
        string trackingNumber, CancellationToken ct)
    {
        var result = await _parcelService.GetPrivateTrackingAsync(trackingNumber, CurrentUserId, ct);
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
    private readonly IUnitOfWork _uow;

    public DeliveriesController(IParcelService parcelService, IUnitOfWork uow)
    {
        _parcelService = parcelService;
        _uow = uow;
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
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 15,
        CancellationToken ct = default)
    {
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
            .Include(d => d.Parcel)
                .ThenInclude(p => p!.PickupAddress)
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

                isPickup = d.Parcel != null &&
                           _uow.Deliveries.Query()
                               .Where(del => del.ParcelId == d.ParcelId)
                               .OrderBy(del => del.CreatedAt)
                               .Select(del => del.Id)
                               .FirstOrDefault() == d.Id,

                recipientName = d.Parcel!.DeliveryAddress != null
                    ? d.Parcel.DeliveryAddress.RecipientName : "—",
                city = d.Parcel!.DeliveryAddress != null
                    ? d.Parcel.DeliveryAddress.City : "—",

                pickupName = d.Parcel!.PickupAddress != null
                    ? d.Parcel.PickupAddress.RecipientName : "—",
                pickupCity = d.Parcel!.PickupAddress != null
                    ? d.Parcel.PickupAddress.City : "—",
                deliveryName = d.Parcel!.DeliveryAddress != null
                    ? d.Parcel.DeliveryAddress.RecipientName : "—",
                deliveryCity = d.Parcel!.DeliveryAddress != null
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
            d.AttemptNumber,
            recommendedAction = d.RecommendedAction != null ? d.RecommendedAction.Value.ToString() : null,
            d.RequiresDispatcherReview,
            d.DispatcherResolutionNotes,

            isPickup = d.Parcel != null && d.Parcel.Status == ParcelStatus.Approved,

            parcel = d.Parcel == null ? null : new
            {
                d.Parcel.Id,
                d.Parcel.TrackingNumber,
                d.Parcel.Status,
                pickupAddress = d.Parcel.PickupAddress == null ? null : new
                {
                    d.Parcel.PickupAddress.RecipientName,
                    d.Parcel.PickupAddress.RecipientPhone,
                    d.Parcel.PickupAddress.StreetAddress,
                    d.Parcel.PickupAddress.City,
                },
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

    /// <summary>PUT /api/deliveries/{id}/failed — UC03 (pickup) / UC04 (delivery): driver
    /// reports a failed attempt; system determines and returns the recommended next action.</summary>
    [HttpPut("{id:guid}/failed")]
    public async Task<IActionResult> MarkFailed(
        Guid id, [FromBody] FailedDeliveryDto dto, CancellationToken ct)
    {
        var result = await _parcelService.MarkFailedAsync(id, dto, CurrentUserId, ct);
        return Ok(result, result.RequiresDispatcherReview
            ? $"Reported. {result.RecommendedActionExplanation}"
            : $"Reported. {result.RecommendedActionExplanation}");
    }

    /// <summary>PUT /api/deliveries/{id}/location – Driver GPS update</summary>
    [HttpPut("{id:guid}/location")]
    public async Task<IActionResult> UpdateLocation(
        Guid id, [FromBody] DriverLocationDto dto, CancellationToken ct)
    {
        await _parcelService.UpdateDriverLocationAsync(CurrentUserId, dto.Latitude, dto.Longitude, ct);
        return NoContent("Location updated");
    }

    /// <summary>PUT /api/deliveries/{id}/resolve-escalation — UC03/UC04: dispatcher
    /// clears a flagged exception once they've acted on it (re-dispatched, corrected the
    /// address, arranged access, or routed the parcel to return-to-sender).</summary>
    [HttpPut("{id:guid}/resolve-escalation")]
    [Authorize(Policy = "DispatcherOrAdmin")]
    public async Task<IActionResult> ResolveEscalation(
        Guid id, [FromBody] ResolveDeliveryEscalationDto dto, CancellationToken ct)
    {
        var delivery = await _uow.Deliveries.GetByIdAsync(id, ct)
            ?? throw new NotFoundException("Delivery not found.");
        delivery.RequiresDispatcherReview = false;
        delivery.DispatcherResolutionNotes = $"{dto.Resolution}" + (string.IsNullOrWhiteSpace(dto.Notes) ? "" : $" — {dto.Notes}");
        delivery.EscalationResolvedAt = DateTime.UtcNow;
        delivery.UpdatedAt = DateTime.UtcNow;
        await _uow.SaveChangesAsync(ct);
        return NoContent("Escalation resolved");
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

// ══════════════════════════════════════════════════════════════════════════════
// RETURN REQUESTS CONTROLLER — UC7 Request Return Authorization / UC8 Process
// Return Intake / UC9 Initiate Customer Refund
// ══════════════════════════════════════════════════════════════════════════════
[Route("api/return-requests")]
[Authorize]
public class ReturnRequestsController : CourierSABaseController
{
    private readonly IReturnService _returnService;
    private readonly IUnitOfWork _uow;

    public ReturnRequestsController(IReturnService returnService, IUnitOfWork uow)
    {
        _returnService = returnService;
        _uow = uow;
    }

    [HttpPost]
    [Authorize(Policy = "CustomerOrBiz")]
    public async Task<IActionResult> Request(
        [FromBody] RequestReturnDto dto, CancellationToken ct)
    {
        var result = await _returnService.RequestReturnAsync(dto, CurrentUserId, ct);
        return Created(result, $"Return authorized. RA: {result.RaNumber}");
    }

    [HttpGet("mine")]
    [Authorize(Policy = "CustomerOrBiz")]
    public async Task<IActionResult> GetMine(CancellationToken ct)
    {
        var result = await _returnService.GetMyReturnsAsync(CurrentUserId, ct);
        return Ok(result);
    }

    [HttpGet]
    [Authorize(Policy = "WarehouseOrAdmin")]
    public async Task<IActionResult> GetQueue([FromQuery] string? status, CancellationToken ct)
    {
        var result = await _returnService.GetQueueAsync(status, ct);
        return Ok(result);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct)
    {
        var isStaff = User.IsInRole("Administrator") || User.IsInRole("WarehouseStaff") || User.IsInRole("Dispatcher");

        if (!isStaff)
        {
            var returnRequest = await _uow.Query<ReturnRequest>().GetByIdAsync(id, ct)
                ?? throw new NotFoundException($"Return {id} not found.");
            var customer = await _uow.Query<CustomerProfile>().Query()
                .FirstOrDefaultAsync(c => c.UserId == CurrentUserId, ct);
            if (customer is null || returnRequest.CustomerId != customer.Id)
                throw new ForbiddenException("You can only view your own return requests.");
        }

        var result = await _returnService.GetDetailAsync(id, ct)
            ?? throw new NotFoundException($"Return {id} not found.");
        return Ok(result);
    }

    [HttpPut("{id:guid}/dispatch-collection")]
    [Authorize(Policy = "DispatcherOrAdmin")]
    public async Task<IActionResult> DispatchCollection(
        Guid id, [FromBody] DispatchReturnCollectionDto dto, CancellationToken ct)
    {
        var result = await _returnService.DispatchCollectionAsync(id, dto, CurrentUserId, ct);
        return Ok(result, "Driver dispatched for return collection");
    }

    [HttpPut("{id:guid}/mark-collected")]
    [Authorize(Policy = "DriverOnly")]
    public async Task<IActionResult> MarkCollected(Guid id, CancellationToken ct)
    {
        var result = await _returnService.MarkCollectedAsync(id, CurrentUserId, ct);
        return Ok(result, "Return collection confirmed");
    }

    [HttpGet("my-collections")]
    [Authorize(Policy = "DriverOnly")]
    public async Task<IActionResult> GetMyCollections(CancellationToken ct)
    {
        var result = await _returnService.GetMyCollectionsAsync(CurrentUserId, ct);
        return Ok(result);
    }

    [HttpPut("{id:guid}/receive")]
    [Authorize(Policy = "WarehouseOrAdmin")]
    public async Task<IActionResult> Receive(Guid id, CancellationToken ct)
    {
        var result = await _returnService.ReceiveAsync(id, CurrentUserId, ct);
        return Ok(result, "Return received at warehouse");
    }

    [HttpPut("{id:guid}/inspect")]
    [Authorize(Policy = "WarehouseOrAdmin")]
    public async Task<IActionResult> Inspect(
        Guid id, [FromBody] InspectReturnDto dto, CancellationToken ct)
    {
        var result = await _returnService.InspectAsync(id, dto, CurrentUserId, ct);
        return Ok(result, $"Inspection logged: {dto.Result}");
    }

    [HttpPut("{id:guid}/release-refund")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> ReleaseRefund(
        Guid id, [FromBody] ReleaseRefundDto dto, CancellationToken ct)
    {
        var result = await _returnService.ReleaseRefundAsync(id, dto, CurrentUserId, ct);
        return Ok(result, $"Refund of R{result.RefundAmountZAR:0.00} released.");
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// SECURE DELIVERY CONTROLLER — UC3 Flag High-Value Parcel + Generate OTP /
// UC4 Verify Recipient Identity
// ══════════════════════════════════════════════════════════════════════════════
[Route("api/parcels")]
[Authorize]
public class SecureDeliveryController : CourierSABaseController
{
    private readonly ISecureDeliveryService _secureDeliveryService;
    private readonly IParcelService _parcelService;

    public SecureDeliveryController(ISecureDeliveryService secureDeliveryService, IParcelService parcelService)
    {
        _secureDeliveryService = secureDeliveryService;
        _parcelService = parcelService;
    }

    [HttpPut("{id:guid}/flag-high-value")]
    [Authorize(Policy = "DispatcherOrAdmin")]
    public async Task<IActionResult> FlagHighValue(Guid id, CancellationToken ct)
    {
        var result = await _secureDeliveryService.FlagAndGenerateOtpAsync(id, CurrentUserId, ct);
        return Ok(result, "Parcel flagged as high-value. OTP generated.");
    }

    [HttpPut("{id:guid}/verify-otp")]
    [Authorize(Policy = "DriverOnly")]
    public async Task<IActionResult> VerifyOtp(
        Guid id, [FromBody] VerifyOtpDto dto, CancellationToken ct)
    {
        var result = await _secureDeliveryService.VerifyOtpAsync(id, dto, CurrentUserId, ct);
        return Ok(result, "Recipient identity verified.");
    }

    [HttpPut("{id:guid}/resend-otp")]
    [Authorize(Policy = "DispatcherOrAdmin")]
    public async Task<IActionResult> ResendOtp(Guid id, CancellationToken ct)
    {
        await _secureDeliveryService.ResendOtpAsync(id, ct);
        return Ok(new { message = "OTP generated and sent successfully." });
    }

    [HttpGet("otp-pending")]
    [Authorize(Policy = "DispatcherOrAdmin")]
    public async Task<IActionResult> GetOtpPending(CancellationToken ct)
    {
        var parcels = await _parcelService.GetOtpPendingParcelsAsync(ct);
        return Ok(parcels);
    }

    [HttpGet("high-value-eligible")]
    [Authorize(Policy = "DispatcherOrAdmin")]
    public async Task<IActionResult> GetHighValueEligible(CancellationToken ct)
    {
        var parcels = await _parcelService.GetHighValueEligibleParcelsAsync(ct);
        return Ok(parcels);
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// RESCHEDULING CONTROLLER — UC1 Reschedule Parcel Collection / UC2 Calculate Fee
// ══════════════════════════════════════════════════════════════════════════════
[Route("api/parcels")]
[Authorize]
public class ReschedulingController : CourierSABaseController
{
    private readonly IReschedulingService _reschedulingService;

    public ReschedulingController(IReschedulingService reschedulingService)
        => _reschedulingService = reschedulingService;

    [HttpGet("{id:guid}/reschedule-quote")]
    [Authorize(Policy = "CustomerOrBiz")]
    public async Task<IActionResult> PreviewFee(
        Guid id, [FromQuery] DateTime proposedDate, CancellationToken ct)
    {
        var result = await _reschedulingService.PreviewFeeAsync(id, proposedDate, CurrentUserId, ct);
        return Ok(result);
    }

    [HttpPut("{id:guid}/reschedule")]
    [Authorize(Policy = "CustomerOrBiz")]
    public async Task<IActionResult> Reschedule(
        Guid id, [FromBody] RescheduleCollectionDto dto, CancellationToken ct)
    {
        var result = await _reschedulingService.RescheduleAsync(id, dto, CurrentUserId, ct);
        return Ok(result, result.FeeCharged
            ? $"Collection rescheduled. Fee of R{result.FeeZAR:0.00} applied via {result.ChargeMethod}."
            : "Collection rescheduled — no fee applied.");
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// LOST PARCELS CONTROLLER — UC5 Report Lost Parcel / UC6 Insurance Claim
// ══════════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════
// LOST PARCELS CONTROLLER — UC5 Report Lost Parcel / UC6 Insurance Claim
// ══════════════════════════════════════════════════════════════════════════════
[Route("api/lost-parcels")]
[Authorize]
public class LostParcelsController : CourierSABaseController
{
    private readonly ILostParcelService _lostParcelService;
    private readonly IUnitOfWork _uow;

    public LostParcelsController(ILostParcelService lostParcelService, IUnitOfWork uow)
    {
        _lostParcelService = lostParcelService;
        _uow = uow;
    }

    /// <summary>POST /api/lost-parcels – Customer reports a parcel as lost</summary>
    [HttpPost]
    [Authorize(Policy = "CustomerOrBiz")]
    public async Task<IActionResult> ReportLost(
        [FromBody] ReportLostParcelDto dto, CancellationToken ct)
    {
        var result = await _lostParcelService.ReportAsync(dto, CurrentUserId, ct);
        return Created(result, $"Lost parcel report submitted. Case: {result.CaseNumber}");
    }

    /// <summary>GET /api/lost-parcels/mine – Customer views their own reported cases</summary>
    [HttpGet("mine")]
    [Authorize(Policy = "CustomerOrBiz")]
    public async Task<IActionResult> GetMyCases(CancellationToken ct)
    {
        var results = await _lostParcelService.GetMyCasesAsync(CurrentUserId, ct);
        return Ok(results);
    }

    /// <summary>GET /api/lost-parcels/queue – Staff queue for investigating reported cases</summary>
    [HttpGet("queue")]
    [Authorize(Roles = "Dispatcher, Administrator, CustomerSupport")]
    public async Task<IActionResult> GetQueue([FromQuery] string? status, CancellationToken ct)
    {
        var results = await _lostParcelService.GetQueueAsync(status, ct);
        return Ok(results);
    }

    /// <summary>GET /api/lost-parcels/{id} – View case detail with ownership verification</summary>
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetCaseDetail(Guid id, CancellationToken ct)
    {
        var result = await _lostParcelService.GetCaseDetailAsync(id, ct)
            ?? throw new NotFoundException($"Lost parcel case {id} not found.");

        var isStaff = User.IsInRole("Administrator") ||
                      User.IsInRole("Dispatcher") ||
                      User.IsInRole("CustomerSupport");

        // FIX: Verify ownership if caller is not staff
        if (!isStaff)
        {
            var customer = await _uow.Query<CustomerProfile>().Query()
                .AsNoTracking()
                .FirstOrDefaultAsync(c => c.UserId == CurrentUserId, ct);

            var lostCase = await _uow.Query<LostParcelCase>().GetByIdAsync(id, ct);

            if (customer is null || lostCase?.CustomerId != customer.Id)
                throw new ForbiddenException("You can only view details of your own reported lost parcel cases.");
        }

        return Ok(result);
    }

    /// <summary>PUT /api/lost-parcels/{id}/investigate – Staff begins investigation</summary>
    [HttpPut("{id:guid}/investigate")]
    [Authorize(Roles = "Dispatcher, Administrator, CustomerSupport")]
    public async Task<IActionResult> Investigate(
        Guid id, [FromBody] InvestigateLostParcelCaseDto dto, CancellationToken ct)
    {
        var result = await _lostParcelService.InvestigateAsync(id, dto, CurrentUserId, ct);
        return Ok(result, $"Investigation started for case {result.CaseNumber}.");
    }

    /// <summary>PUT /api/lost-parcels/{id}/resolve – Staff resolves investigation (Found or Confirmed Lost)</summary>
    [HttpPut("{id:guid}/resolve")]
    [Authorize(Roles = "Dispatcher, Administrator, CustomerSupport")]
    public async Task<IActionResult> Resolve(
        Guid id, [FromBody] ResolveLostParcelCaseDto dto, CancellationToken ct)
    {
        var result = await _lostParcelService.ResolveAsync(id, dto, CurrentUserId, ct);
        return Ok(result, $"Case {result.CaseNumber} resolved as {result.Status}.");
    }

    /// <summary>POST /api/lost-parcels/{id}/insurance-claim – Admin files insurance claim</summary>
    [HttpPost("{id:guid}/insurance-claim")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> SubmitClaim(
        Guid id, [FromBody] SubmitInsuranceClaimDto dto, CancellationToken ct)
    {
        var result = await _lostParcelService.SubmitInsuranceClaimAsync(id, dto, CurrentUserId, ct);
        return Created(result, $"Insurance claim {result.ClaimNumber} submitted.");
    }

    /// <summary>PUT /api/lost-parcels/claims/{claimId}/status – Admin updates claim approval/payout</summary>
    [HttpPut("claims/{claimId:guid}/status")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> UpdateClaimStatus(
        Guid claimId, [FromBody] UpdateClaimStatusDto dto, CancellationToken ct)
    {
        var result = await _lostParcelService.UpdateClaimStatusAsync(claimId, dto, CurrentUserId, ct);
        return Ok(result, $"Insurance claim status updated to {result.Status}.");
    }
}

