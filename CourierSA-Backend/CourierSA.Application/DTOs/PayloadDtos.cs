namespace CourierSA.Application.DTOs.Payload;

// ── UC14 Validate and Adjust Vehicle Payload / UC15 Split Overloaded Routes ──

public record RunParcelDto(
    Guid ParcelId, string TrackingNumber, decimal WeightKg, string Recipient, string City, bool IsPickup);

/// <summary>One vehicle run: its load against the vehicle maximum, plus its manifest.</summary>
public record PayloadRunDto(
    Guid RouteId, string? RunLabel, string Status, bool IsEditable,
    Guid DriverId, string DriverName, Guid? VehicleId, string? VehicleRegistration,
    decimal LoadKg, decimal MaxKg, decimal OverageKg, decimal UtilizationPercent,
    bool SignedOff, DateTime? SignedOffAt, List<RunParcelDto> Parcels);

/// <summary>Overview panel: every run for the day with load against maximum.</summary>
public record PayloadOverviewDto(DateTime Date, List<PayloadRunDto> Runs);

/// <summary>TargetRouteId = another run to take the parcels (e.g. Run B); null returns them to the dispatch queue.</summary>
public record ReallocateDto(List<Guid> ParcelIds, Guid? TargetRouteId, string? Notes);

public record ReallocateResultDto(
    int ReturnedToQueue, int MovedToTarget, string SourceStatus, string? TargetStatus);

public record SignOffDto(string? Notes);

// ── UC15 ──────────────────────────────────────────────────────────────────────
public record StandbyDriverDto(Guid DriverId, string Name);
public record StandbyVehicleDto(Guid VehicleId, string Registration, decimal CapacityKg);
public record SplitOptionsDto(List<StandbyDriverDto> Drivers, List<StandbyVehicleDto> Vehicles);

public record SplitRequestDto(Guid StandbyDriverId, Guid StandbyVehicleId, string? Notes);

/// <summary>Both manifests. Confirmed = false for a preview (nothing saved).</summary>
public record SplitResultDto(PayloadRunDto Original, PayloadRunDto Standby, bool Confirmed);
