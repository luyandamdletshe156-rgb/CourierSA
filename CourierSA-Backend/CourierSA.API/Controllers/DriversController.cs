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
        // Fetch into memory first to guarantee consistency with the Map logic
        var drivers = await _db.DriverProfiles
            .AsNoTracking()
            .Where(d => !d.IsDeleted)
            .Include(d => d.User)
            .Include(d => d.Deliveries
                .Where(del => del.Status != DeliveryStatus.Delivered &&
                              del.Status != DeliveryStatus.Failed)
                .Take(1))
            .ToListAsync(ct);

        var result = drivers.Select(d =>
        {
            var activeDelivery = d.Deliveries.FirstOrDefault();

            // Unified self-healing logic
            var computedStatus = (d.Status == DriverStatus.OnDelivery && activeDelivery == null)
                ? DriverStatus.Available.ToString()
                : d.Status.ToString();

            return new DriverDirectoryItemDto(
                d.Id,
                d.User != null ? d.User.FirstName : "—",
                d.User != null ? d.User.LastName : "—",
                computedStatus,
                d.LicenseNumber
            );
        })
        .OrderBy(d => d.FirstName)
        .ToList();

        return Ok(result);
    }

    // ══════════════════════════════════════════════════════════════════════════════
    // LIVE MAP & DISPATCH ENDPOINTS
    // ══════════════════════════════════════════════════════════════════════════════

    [HttpGet("locations")]
    public async Task<IActionResult> GetLocations(CancellationToken ct)
    {
        var drivers = await _db.DriverProfiles
            .AsNoTracking()
            .Where(d => !d.IsDeleted)
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

            // Self-healing fallback calculation
            var computedStatus = (d.Status == DriverStatus.OnDelivery && activeDelivery == null)
                ? DriverStatus.Available.ToString()
                : d.Status.ToString();

            bool isPickup = activeDelivery?.Parcel?.Status == ParcelStatus.Approved;
            var targetAddress = isPickup ? activeDelivery?.Parcel?.PickupAddress : activeDelivery?.Parcel?.DeliveryAddress;

            return new
            {
                driverId = d.Id,
                userId = d.UserId,
                firstName = d.User?.FirstName ?? "—",
                lastName = d.User?.LastName ?? "—",
                phone = d.User?.PhoneNumber,
                status = computedStatus,
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
                    isPickup = isPickup
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
        // FIX: Fetch identical dataset as GetLocations to prevent EF Core SQL translation mismatches
        var drivers = await _db.DriverProfiles
            .AsNoTracking()
            .Where(d => !d.IsDeleted)
            .Include(d => d.User)
            .Include(d => d.Deliveries
                .Where(del => del.Status != DeliveryStatus.Delivered &&
                              del.Status != DeliveryStatus.Failed)
                .Take(1))
            .ToListAsync(ct);

        var available = drivers.Select(d =>
        {
            var activeDelivery = d.Deliveries.FirstOrDefault();

            // Unified self-healing logic ensures if they are available on the map, they are available here.
            var computedStatus = (d.Status == DriverStatus.OnDelivery && activeDelivery == null)
                ? DriverStatus.Available.ToString()
                : d.Status.ToString();

            return new
            {
                driverId = d.Id,
                userId = d.UserId,
                firstName = d.User != null ? d.User.FirstName : "—",
                lastName = d.User != null ? d.User.LastName : "—",
                phone = d.User != null ? d.User.PhoneNumber : null,
                status = computedStatus,
            };
        })
        .Where(d => d.status == DriverStatus.Available.ToString()) // Filter strictly in memory
        .ToList();

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