using CourierSA.Application.DTOs.Parcels; // Needed for DriverLocationDto
using CourierSA.Application.DTOs.Vehicles; // Needed for DriverDirectoryItemDto
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
    // NEW: DRIVER DIRECTORY (For Fleet Assignment Dropdowns)
    // ══════════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Full driver directory (including License Numbers) 
    /// Used by Admin and Dispatcher Fleet pages to populate vehicle assignment dropdowns.
    /// </summary>
    [HttpGet]
    public async Task<IActionResult> GetAll(CancellationToken ct)
    {
        var drivers = await _db.DriverProfiles
            .AsNoTracking()
            .Include(d => d.User)
            .Where(d => !d.IsDeleted)
            .OrderBy(d => d.User!.FirstName) // Sorted alphabetically for UI dropdowns
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
    // EXISTING: LIVE MAP & DISPATCH ENDPOINTS
    // ══════════════════════════════════════════════════════════════════════════════

    /// <summary>
    /// Full fleet snapshot for the live map initial load.
    /// Returns every driver regardless of status so the map shows offline
    /// drivers as greyed-out pins (useful for shift planning).
    /// </summary>
    [HttpGet("locations")]
    public async Task<IActionResult> GetLocations(CancellationToken ct)
    {
        var drivers = await _db.DriverProfiles
            .AsNoTracking()
            .Include(d => d.User)
            .Include(d => d.Deliveries
                .Where(del => del.Status != DeliveryStatus.Delivered &&
                              del.Status != DeliveryStatus.Failed)
                .OrderByDescending(del => del.CreatedAt)
                .Take(1))
                .ThenInclude(del => del.Parcel)
                    .ThenInclude(p => p!.DeliveryAddress)
            .ToListAsync(ct);

        var result = drivers.Select(d =>
        {
            var activeDelivery = d.Deliveries.FirstOrDefault();
            return new
            {
                driverId = d.Id,
                userId = d.UserId,
                firstName = d.User?.FirstName ?? "—",
                lastName = d.User?.LastName ?? "—",
                phone = d.User?.PhoneNumber,
                status = d.Status.ToString(),
                latitude = d.CurrentLatitude,
                longitude = d.CurrentLongitude,
                lastUpdatedAt = d.UpdatedAt,
                activeDelivery = activeDelivery is null ? null : new
                {
                    deliveryId = activeDelivery.Id,
                    parcelId = activeDelivery.ParcelId,
                    trackingNumber = activeDelivery.Parcel?.TrackingNumber,
                    recipientName = activeDelivery.Parcel?.DeliveryAddress?.RecipientName,
                    recipientPhone = activeDelivery.Parcel?.DeliveryAddress?.RecipientPhone,
                    deliveryCity = activeDelivery.Parcel?.DeliveryAddress?.City,
                    deliveryAddress = activeDelivery.Parcel?.DeliveryAddress?.StreetAddress,
                    deliveryLat = activeDelivery.Parcel?.DeliveryAddress?.Latitude,
                    deliveryLng = activeDelivery.Parcel?.DeliveryAddress?.Longitude,
                    status = activeDelivery.Status.ToString(),
                    dispatchedAt = activeDelivery.DispatchedAt,
                },
                totalDeliveries = d.TotalDeliveries,
                successfulDeliveries = d.SuccessfulDeliveries,
            };
        });

        return Ok(result);
    }

    /// <summary>
    /// Available drivers only — used by the dispatch assignment dropdown.
    /// Replaces the "paste UUID" workaround in DispatchQueue.
    /// </summary>
    [HttpGet("available")]
    public async Task<IActionResult> GetAvailable(CancellationToken ct)
    {
        var available = await _db.DriverProfiles
            .AsNoTracking()
            .Where(d => d.Status == DriverStatus.Available)
            .Include(d => d.User)
            .Select(d => new
            {
                driverId = d.Id,
                firstName = d.User!.FirstName,
                lastName = d.User.LastName,
                phone = d.User.PhoneNumber,
                status = d.Status.ToString(),
            })
            .ToListAsync(ct);

        return Ok(available);
    }

    /// <summary>
    /// Updates a driver's stored location from a REST call (alternative to SignalR).
    /// The driver app can call this if SignalR is unavailable (offline/fallback).
    /// </summary>
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