using CourierSA.Domain.Entities;
using CourierSA.Domain.Enums;
using CourierSA.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CourierSA.API.Middleware;
using CourierSA.Domain.Exceptions;
using CourierSA.Application.DTOs.Vehicles;

namespace CourierSA.API.Controllers;

/// <summary>
/// Vehicle inspection endpoints — used by WarehouseStaff and Drivers.
///
/// GET    /api/vehicle-inspections              — list all inspections (admin/warehouse)
/// GET    /api/vehicle-inspections/{id}         — single inspection detail
/// POST   /api/vehicle-inspections              — log a new inspection
///
/// GET    /api/admin/vehicles                   — fleet list for the admin panel
///        (also feeds the dropdown in NewInspectionModal)
/// </summary>
[Route("api/vehicle-inspections")]
[Authorize(Policy = "WarehouseOrAdmin")]
public class VehicleInspectionsController : CourierSABaseController
{
    private readonly ApplicationDbContext _db;

    public VehicleInspectionsController(ApplicationDbContext db) => _db = db;

    // ── List ──────────────────────────────────────────────────────────────────
    [HttpGet]
    public async Task<IActionResult> GetAll(
        [FromQuery] int page     = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
    {
        var query = _db.VehicleInspections
            .AsNoTracking()
            .Include(i => i.Vehicle)
            .Include(i => i.Driver).ThenInclude(d => d!.User)
            .OrderByDescending(i => i.CreatedAt);

        var total = await query.CountAsync(ct);

        var items = await query
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(i => new
            {
                i.Id,
                i.Type,
                i.Result,
                i.OdometerKm,
                i.Notes,
                i.CreatedAt,
                vehicle = i.Vehicle == null ? null : new
                {
                    i.Vehicle.Id,
                    i.Vehicle.RegistrationNumber,
                    i.Vehicle.Make,
                    i.Vehicle.Model,
                    i.Vehicle.VehicleType,
                },
                driver = (i.Driver == null || i.Driver.User == null) ? null : new
                {
                    i.Driver.User.FirstName,
                    i.Driver.User.LastName,
                    i.Driver.User.PhoneNumber,
                }
            })
            .ToListAsync(ct);

        return Ok(new { items, totalCount = total, page, pageSize });
    }

    // ── Single ────────────────────────────────────────────────────────────────
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct)
    {
        var inspection = await _db.VehicleInspections
            .AsNoTracking()
            .Include(i => i.Vehicle)
            .Include(i => i.Driver).ThenInclude(d => d!.User)
            .FirstOrDefaultAsync(i => i.Id == id, ct)
            ?? throw new NotFoundException($"Inspection {id} not found.");

        return Ok(new
        {
            inspection.Id,
            inspection.Type,
            inspection.Result,
            inspection.OdometerKm,
            inspection.Notes,
            inspection.PhotoPaths,
            inspection.CreatedAt,
            vehicle = inspection.Vehicle == null ? null : new
            {
                inspection.Vehicle.RegistrationNumber,
                inspection.Vehicle.Make,
                inspection.Vehicle.Model,
            },
            driver = inspection.Driver?.User == null ? null : new
            {
                inspection.Driver.User.FirstName,
                inspection.Driver.User.LastName,
            },
        });
    }

    // ── Create ────────────────────────────────────────────────────────────────
    [HttpPost]
    public async Task<IActionResult> Create(
        [FromBody] CreateInspectionDto dto, CancellationToken ct)
    {
        // Verify vehicle exists
        var vehicle = await _db.Vehicles.FindAsync([dto.VehicleId], ct)
            ?? throw new NotFoundException("Vehicle not found.");

        // Resolve driver profile from the current user
        var driverProfile = await _db.DriverProfiles
            .FirstOrDefaultAsync(d => d.UserId == CurrentUserId, ct);

        // Non-drivers (warehouse staff, admin) can also log inspections
        // driverProfile may be null — that is acceptable

        if (!Enum.IsDefined(dto.Type))
            throw new BadRequestException("Invalid inspection type.");

        if (!Enum.IsDefined(dto.Result))
            throw new BadRequestException("Invalid inspection result.");

        var inspection = new VehicleInspection
        {
            Id          = Guid.NewGuid(),
            VehicleId   = dto.VehicleId,
            DriverId    = driverProfile?.Id ?? Guid.Empty,
            Type        = dto.Type,
            Result      = dto.Result,
            OdometerKm  = dto.OdometerKm,
            Notes       = dto.Notes?.Trim(),
            PhotoPaths  = dto.PhotoPaths,
            CreatedAt   = DateTime.UtcNow,
            UpdatedAt   = DateTime.UtcNow,
        };

        _db.VehicleInspections.Add(inspection);

        // Flag vehicle as needing maintenance if inspection failed
        if (dto.Result == InspectionResult.Fail)
        {
            vehicle.Status    = VehicleStatus.InMaintenance;
            vehicle.UpdatedAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync(ct);

        return Created(new { inspection.Id, inspection.CreatedAt },
            $"Inspection logged. Result: {dto.Result}");
    }
}

