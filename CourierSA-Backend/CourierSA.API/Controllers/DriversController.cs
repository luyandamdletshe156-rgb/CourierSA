using CourierSA.Application.DTOs.Parcels;
using CourierSA.Application.DTOs.Vehicles;
using CourierSA.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CourierSA.API.Middleware;
using CourierSA.Domain.Exceptions;
using CourierSA.Domain.Enums;

namespace CourierSA.API.Controllers;

[Route("api/drivers")]
[Authorize(Policy = "DispatcherOrAdmin")]
public class DriversController : CourierSABaseController
{
    private readonly ApplicationDbContext _db;

    public DriversController(ApplicationDbContext db) => _db = db;

    // ══════════════════════════════════════════════════════════════════════════════
    // DRIVER DIRECTORY (For Fleet Assignment Dropdowns)
    // ══════════════════════════════════════════════════════════════════════════════

    [HttpGet]
    public async Task<IActionResult> GetAll(CancellationToken ct)
    {
        var drivers = await _db.DriverProfiles
            .AsNoTracking()
            .Include(d => d.User)
            .Where(d => !d.IsDeleted) // FIX: Ensure deleted drivers don't show up
            .OrderBy(d => d.User!.FirstName)
            .Select(d => new DriverDirectoryItemDto(
                d.Id,
                d.User != null ? d.User.FirstName : "—",
                d.User != null ? d.User.LastName : "—",
                // FIX: Apply self-healing logic here too so the dispatcher dropdown 
                // accurately reflects "Available" drivers even if they are stuck OnDelivery with 0 tasks.
                (d.Status == DriverStatus.OnDelivery && !d.Deliveries.Any(del => del.Status != DeliveryStatus.Delivered && del.Status != DeliveryStatus.Failed))
                    ? DriverStatus.Available.ToString()
                    : d.Status.ToString(),
                d.LicenseNumber
            ))
            .ToListAsync(ct);

        return Ok(drivers);
    }

    // ══════════════════════════════════════════════════════════════════════════════
    // LIVE MAP & DISPATCH ENDPOINTS
    // ══════════════════════════════════════════════════════════════════════════════

    [HttpGet("locations")]
    public async Task<IActionResult> GetLocations(CancellationToken ct)
    {
        var drivers = await _db.DriverProfiles
            .AsNoTracking()
            .Where(d => !d.IsDeleted) // FIX: Missing check added to prevent ghosts on map
            .Include(d => d.User)
            // Include DeliveryAddress for Final deliveries
            .Include(d => d.Deliveries
                .Where(del => del.Status != DeliveryStatus.Delivered &&
                              del.Status != DeliveryStatus.Failed)
                .OrderByDescending(del => del.CreatedAt)
                .Take(1))
                .ThenInclude(del => del.Parcel)
                    .ThenInclude(p => p!.DeliveryAddress)
            // Include PickupAddress for Collections/Pickups
            .Include(d => d.Deliveries
                .Where(del => del.Status != DeliveryStatus.Delivered &&
                              del.Status != DeliveryStatus.Failed)
                .OrderByDescending(del => del.CreatedAt)
                .Take(1))
                .ThenInclude(del => del.Parcel)
                    .ThenInclude(p => p!.PickupAddress)
            .ToListAsync(ct);

        var result = drivers.Select(d =>
        {
            var activeDelivery = d.Deliveries.FirstOrDefault();

            // FIX: Self-healing fallback calculation. 
            // If the driver record in DB is stuck on OnDelivery but has no active tasks, report as Available.
            var computedStatus = (d.Status == DriverStatus.OnDelivery && activeDelivery == null)
                ? DriverStatus.Available.ToString()
                : d.Status.ToString();

            // Determine if the active task is a pickup or final delivery
            bool isPickup = activeDelivery?.Parcel?.Status == ParcelStatus.Approved;
            var targetAddress = isPickup ? activeDelivery?.Parcel?.PickupAddress : activeDelivery?.Parcel?.DeliveryAddress;

            return new
            {
                driverId = d.Id,
                userId = d.UserId,
                firstName = d.User?.FirstName ?? "—",
                lastName = d.User?.LastName ?? "—",
                phone = d.User?.PhoneNumber,
                status = computedStatus, // <--- Uses calculated status
                latitude = d.CurrentLatitude,
                longitude = d.CurrentLongitude,
                lastUpdatedAt = d.UpdatedAt,
                activeDelivery = activeDelivery is null ? null : new
                {
                    deliveryId = activeDelivery.Id,
                    parcelId = activeDelivery.ParcelId,
                    trackingNumber = activeDelivery.Parcel?.TrackingNumber,
                    recipientName = targetAddress?.RecipientName,
                    recipientPhone = targetAddress?.RecipientPhone,
                    deliveryCity = targetAddress?.City,
                    deliveryAddress = targetAddress?.StreetAddress,
                    deliveryLat = targetAddress?.Latitude,
                    deliveryLng = targetAddress?.Longitude,
                    status = activeDelivery.Status.ToString(),
                    dispatchedAt = activeDelivery.DispatchedAt,
                    isPickup = isPickup // Let frontend know if they are collecting or delivering
                },
                totalDeliveries = d.TotalDeliveries,
                successfulDeliveries = d.SuccessfulDeliveries,
            };
        });

        return Ok(result);
    }

    [HttpGet("available")]
    public async Task<IActionResult> GetAvailable(CancellationToken ct)
    {
        var available = await _db.DriverProfiles
            .AsNoTracking()
            .Include(d => d.User)
            // FIX: Match the IsDeleted and self-healing logic perfectly with the Map endpoint
            .Where(d => !d.IsDeleted &&
                       (d.Status == DriverStatus.Available ||
                       (d.Status == DriverStatus.OnDelivery &&
                        !d.Deliveries.Any(del => del.Status != DeliveryStatus.Delivered &&
                                                 del.Status != DeliveryStatus.Failed))))
            .Select(d => new
            {
                driverId = d.Id,
                userId = d.UserId, // FIX: Included userId so the frontend map doesn't crash
                firstName = d.User != null ? d.User.FirstName : "—", // Null-safe checks
                lastName = d.User != null ? d.User.LastName : "—",
                phone = d.User != null ? d.User.PhoneNumber : null,
                status = DriverStatus.Available.ToString(),
            })
            .ToListAsync(ct);

        return Ok(available);
    }

    [HttpPut("{driverId:guid}/location")]
    [Authorize(Policy = "StaffOnly")]
    public async Task<IActionResult> UpdateLocation(
        Guid driverId,
        [FromBody] DriverLocationDto dto,
        CancellationToken ct)
    {
        var driver = await _db.DriverProfiles.FindAsync([driverId], ct)
            ?? throw new NotFoundException("Driver not found.");

        driver.CurrentLatitude = dto.Latitude;
        driver.CurrentLongitude = dto.Longitude;
        driver.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);
        return NoContent("Location updated");
    }

    // ══════════════════════════════════════════════════════════════════
    // DRIVER SELF-SERVICE (driver's own status — Available / OffDuty)
    // ══════════════════════════════════════════════════════════════════
    [Route("api/driver-portal")]
    [Authorize(Roles = "Driver")]
    public class DriverPortalController : CourierSABaseController
    {
        private readonly ApplicationDbContext _db;
        public DriverPortalController(ApplicationDbContext db) => _db = db;

        [HttpGet("me")]
        public async Task<IActionResult> GetMyStatus(CancellationToken ct)
        {
            var driver = await _db.DriverProfiles
                .FirstOrDefaultAsync(d => d.UserId == CurrentUserId, ct)
                ?? throw new NotFoundException("Driver profile not found.");

            return Ok(new { driverId = driver.Id, status = driver.Status.ToString() });
        }

        [HttpPut("status")]
        public async Task<IActionResult> UpdateMyStatus(
            [FromBody] UpdateDriverStatusDto dto, CancellationToken ct)
        {
            var driver = await _db.DriverProfiles
                .FirstOrDefaultAsync(d => d.UserId == CurrentUserId, ct)
                ?? throw new NotFoundException("Driver profile not found.");

            if (driver.Status == DriverStatus.Suspended)
                throw new BadRequestException("Your account is suspended — contact an administrator.");

            if (driver.Status == DriverStatus.OnDelivery)
                throw new BadRequestException("Cannot change status while a delivery is in progress.");

            if (dto.Status != DriverStatus.Available && dto.Status != DriverStatus.OffDuty)
                throw new BadRequestException("Drivers can only set their own status to Available or Off Duty.");

            driver.Status = dto.Status;
            driver.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(ct);

            return Ok(new { status = driver.Status.ToString() });
        }
    }
}