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

/// <summary>
/// Provides dispatcher and admin endpoints for fleet visibility.
///
/// GET /api/drivers             — full directory for Admin/Dispatcher vehicle assignment
/// GET /api/drivers/locations  — snapshot of every driver's last known position
/// GET /api/drivers/available  — drivers with status=Available
/// </summary>
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
            .Where(d => !d.IsDeleted)
            .OrderBy(d => d.User!.FirstName)
            .Select(d => new DriverDirectoryItemDto(
                d.Id,
                d.User != null ? d.User.FirstName : string.Empty,
                d.User != null ? d.User.LastName : string.Empty,
                d.Status.ToString(),
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
            // Self-healing filter: Include drivers explicitly marked Available,
            // OR drivers marked OnDelivery in DB who have 0 active deliveries left.
            .Where(d => d.Status == DriverStatus.Available ||
                       (d.Status == DriverStatus.OnDelivery &&
                        !d.Deliveries.Any(del => del.Status != DeliveryStatus.Delivered &&
                                                 del.Status != DeliveryStatus.Failed)))
            .Select(d => new
            {
                driverId = d.Id,
                firstName = d.User!.FirstName,
                lastName = d.User.LastName,
                phone = d.User.PhoneNumber,
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
}