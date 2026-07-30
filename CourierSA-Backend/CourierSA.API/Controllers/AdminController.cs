using CourierSA.Application.DTOs.Auth;
using CourierSA.Application.DTOs.Vehicles;
using CourierSA.Application.Interfaces.Services;
using CourierSA.Application.Interfaces.Repositories;
using CourierSA.Domain.Entities;
using CourierSA.Domain.Enums;
using CourierSA.Domain.Exceptions;
using CourierSA.Infrastructure.Data;
using CourierSA.API.Middleware;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace CourierSA.API.Controllers;

[Route("api/admin")]
[Authorize(Policy = "AdminOnly")]
public class AdminController : CourierSABaseController
{
    private readonly IUnitOfWork _uow;
    private readonly IAuditService _audit;
    private readonly ApplicationDbContext _db;

    // Added ApplicationDbContext to support the new vehicle endpoints
    public AdminController(IUnitOfWork uow, IAuditService audit, ApplicationDbContext db)
    {
        _uow = uow;
        _audit = audit;
        _db = db;
    }

    // ══════════════════════════════════════════════════════════════════════════════
    // 1. USERS & STAFF
    // ══════════════════════════════════════════════════════════════════════════════

    [HttpGet("users")]
    public async Task<IActionResult> GetUsers(CancellationToken ct)
    {
        var users = await _uow.Users.GetAllAsync(ct);
        return Ok(users.Select(u => new
        {
            u.Id,
            u.FirstName,
            u.LastName,
            u.Email,
            u.Role,
            u.Status,
            u.CreatedAt,
            u.LastLoginAt
        }));
    }

    [HttpPut("users/{id:guid}/suspend")]
    public async Task<IActionResult> SuspendUser(Guid id, CancellationToken ct)
    {
        var user = await _uow.Users.GetByIdAsync(id, ct)
            ?? throw new NotFoundException("User not found.");

        if (user.Role == UserRole.Administrator)
            throw new BadRequestException("Administrator accounts cannot be suspended.");

        user.Status = UserStatus.Suspended;
        user.UpdatedAt = DateTime.UtcNow;
        _uow.Users.Update(user);
        await _uow.SaveChangesAsync(ct);
        await _audit.LogAsync("USER_SUSPENDED", "User", id, null, null, CurrentUserId, null, ct);
        return NoContent("User suspended");
    }

    [HttpPut("users/{id:guid}/reactivate")]
    public async Task<IActionResult> ReactivateUser(Guid id, CancellationToken ct)
    {
        var user = await _uow.Users.GetByIdAsync(id, ct)
            ?? throw new NotFoundException("User not found.");

        if (user.Status != UserStatus.Suspended)
            throw new BadRequestException("Only suspended accounts can be reactivated.");

        user.Status = UserStatus.Active;
        user.FailedLoginAttempts = 0;
        user.UpdatedAt = DateTime.UtcNow;
        _uow.Users.Update(user);
        await _uow.SaveChangesAsync(ct);
        await _audit.LogAsync("USER_REACTIVATED", "User", id, null, null, CurrentUserId, null, ct);
        return NoContent("User reactivated");
    }

    [HttpPost("staff")]
    public async Task<IActionResult> CreateStaff(
        [FromBody] CreateStaffUserDto dto, [FromServices] IAuthService authService, CancellationToken ct)
    {
        var user = await authService.CreateStaffUserAsync(dto, CurrentUserId, ct);
        return Created(new { user.Id, user.Email, user.Role }, $"Staff account created for {user.FullName}.");
    }

    // ══════════════════════════════════════════════════════════════════════════════
    // 2. DASHBOARD & AUDIT
    // ══════════════════════════════════════════════════════════════════════════════

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
        var totalParcels = await _uow.Parcels.CountAsync(ct: ct);
        var pendingApproval = await _uow.Parcels.CountAsync(
            p => p.Status == ParcelStatus.PendingApproval, ct);
        var inTransit = await _uow.Parcels.CountAsync(
            p => p.Status == ParcelStatus.OutForDelivery, ct);
        var delivered = await _uow.Parcels.CountAsync(
            p => p.Status == ParcelStatus.Delivered, ct);
        var totalUsers = await _uow.Users.CountAsync(ct: ct);

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

    // ══════════════════════════════════════════════════════════════════════════════
    // 3. FLEET MANAGEMENT (Moved here)
    // ══════════════════════════════════════════════════════════════════════════════

    [HttpGet("vehicles")]
    public async Task<IActionResult> GetVehicles(CancellationToken ct)
    {
        var vehicles = await _db.Vehicles
            .AsNoTracking()
            .Where(v => !v.IsDeleted)
            .OrderBy(v => v.RegistrationNumber)
            .Select(v => new VehicleBaseDto(
                v.Id,
                v.RegistrationNumber,
                v.Make,
                v.Model,
                v.Year,
                v.VehicleType.ToString(),
                v.Status.ToString(),
                v.PayloadCapacityKg,
                v.AssignedDriverId
            ))
            .ToListAsync(ct);

        return Ok(vehicles);
    }

    [HttpPost("vehicles")]
    public async Task<IActionResult> CreateVehicle([FromBody] CreateVehicleDto dto, CancellationToken ct)
    {
        var vehicle = new Vehicle
        {
            Id = Guid.NewGuid(),
            RegistrationNumber = dto.RegistrationNumber,
            Make = dto.Make,
            Model = dto.Model,
            Year = dto.Year,
            VehicleType = dto.VehicleType,
            PayloadCapacityKg = dto.PayloadCapacityKg,
            Status = VehicleStatus.Active,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        _db.Vehicles.Add(vehicle);
        await _db.SaveChangesAsync(ct);

        await _audit.LogAsync("VEHICLE_CREATED", "Vehicle", vehicle.Id, null, null, CurrentUserId, null, ct);

        return Created($"/api/admin/vehicles/{vehicle.Id}", new { vehicle.Id });
    }

    [HttpPut("vehicles/{id:guid}")]
    public async Task<IActionResult> UpdateVehicle(Guid id, [FromBody] UpdateVehicleDto dto, CancellationToken ct)
    {
        var vehicle = await _db.Vehicles.FindAsync(new object[] { id }, ct)
            ?? throw new NotFoundException("Vehicle not found.");

        vehicle.RegistrationNumber = dto.RegistrationNumber;
        vehicle.Make = dto.Make;
        vehicle.Model = dto.Model;
        vehicle.Year = dto.Year;
        vehicle.VehicleType = dto.VehicleType;
        vehicle.PayloadCapacityKg = dto.PayloadCapacityKg;
        vehicle.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("VEHICLE_UPDATED", "Vehicle", id, null, null, CurrentUserId, null, ct);

        return NoContent();
    }

    [HttpPut("vehicles/{id:guid}/assign")]
    public async Task<IActionResult> AssignDriver(Guid id, [FromBody] AssignDriverDto dto, CancellationToken ct)
    {
        var vehicle = await _db.Vehicles.FindAsync(new object[] { id }, ct)
            ?? throw new NotFoundException("Vehicle not found.");

        if (dto.DriverId.HasValue)
        {
            var existingAssigned = await _db.Vehicles
                .FirstOrDefaultAsync(v => v.AssignedDriverId == dto.DriverId.Value && v.Id != id && !v.IsDeleted, ct);

            if (existingAssigned != null)
                throw new BadRequestException("This driver is already assigned to another vehicle.");

            vehicle.AssignedDriverId = dto.DriverId.Value;
        }
        else
        {
            vehicle.AssignedDriverId = null;
        }

        vehicle.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("VEHICLE_ASSIGNED_DRIVER", "Vehicle", id, null, null, CurrentUserId, null, ct);

        return NoContent();
    }

    [HttpDelete("vehicles/{id:guid}")]
    public async Task<IActionResult> RetireVehicle(Guid id, CancellationToken ct)
    {
        var vehicle = await _db.Vehicles.FindAsync(new object[] { id }, ct)
            ?? throw new NotFoundException("Vehicle not found.");

        vehicle.Status = VehicleStatus.Retired;
        vehicle.IsDeleted = true;
        vehicle.DeletedAt = DateTime.UtcNow;
        vehicle.AssignedDriverId = null;
        vehicle.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("VEHICLE_RETIRED", "Vehicle", id, null, null, CurrentUserId, null, ct);

        return NoContent();
    }
}