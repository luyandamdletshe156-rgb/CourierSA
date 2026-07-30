using CourierSA.Application.DTOs.Vehicles;
using CourierSA.Domain.Enums;
using CourierSA.Domain.Exceptions;
using CourierSA.Infrastructure.Data;
using CourierSA.API.Middleware;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CourierSA.API.Controllers;

[Route("api/dispatcher")]
[Authorize(Policy = "DispatcherOrAdmin")]
public class DispatcherController : CourierSABaseController
{
    private readonly ApplicationDbContext _db;

    public DispatcherController(ApplicationDbContext db) => _db = db;

    // ══════════════════════════════════════════════════════════════════════════════
    // FLEET REASSIGNMENT (Dispatcher View)
    // ══════════════════════════════════════════════════════════════════════════════

    [HttpGet("vehicles")]
    public async Task<IActionResult> GetDispatcherFleet(CancellationToken ct)
    {
        var vehicles = await _db.Vehicles
            .AsNoTracking()
            .Where(v => !v.IsDeleted)
            .OrderBy(v => v.RegistrationNumber)
            .Select(v => new DispatcherVehicleDto(
                v.Id,
                v.RegistrationNumber,
                v.Make,
                v.Model,
                v.Status.ToString(),
                v.AssignedDriverId,

                // Subquery to get the currently assigned driver's name
                _db.DriverProfiles
                    .Where(d => d.Id == v.AssignedDriverId)
                    .Select(d => new DispatcherDriverDto(d.Id, d.User!.FirstName, d.User.LastName))
                    .FirstOrDefault(),

                // Subquery to get the result of the latest inspection
                v.Inspections
                    .OrderByDescending(i => i.CreatedAt)
                    .Select(i => new LastInspectionDto(i.Result.ToString(), i.CreatedAt))
                    .FirstOrDefault()
            ))
            .ToListAsync(ct);

        return Ok(vehicles);
    }

    [HttpPut("vehicles/{id:guid}/reassign")]
    public async Task<IActionResult> ReassignDriver(Guid id, [FromBody] AssignDriverDto dto, CancellationToken ct)
    {
        var vehicle = await _db.Vehicles.FindAsync(new object[] { id }, ct)
            ?? throw new NotFoundException("Vehicle not found.");

        if (dto.DriverId.HasValue)
        {
            // Verify driver isn't already driving another vehicle
            var existingAssigned = await _db.Vehicles
                .FirstOrDefaultAsync(v => v.AssignedDriverId == dto.DriverId.Value && v.Id != id && !v.IsDeleted, ct);

            if (existingAssigned != null)
                throw new BadRequestException("Driver is already assigned to another vehicle.");

            vehicle.AssignedDriverId = dto.DriverId.Value;

            // Business Rule: Dispatcher assigns a new driver, so clear 'InMaintenance' back to 'Active'
            if (vehicle.Status == VehicleStatus.InMaintenance)
                vehicle.Status = VehicleStatus.Active;
        }
        else
        {
            vehicle.AssignedDriverId = null;
        }

        vehicle.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);

        return NoContent();
    }
}
