using CourierSA.Application.DTOs.Payload;

namespace CourierSA.Application.Interfaces.Services;

// UC14 Validate and Adjust Vehicle Payload / UC15 Split Overloaded Routes
public interface IPayloadService
{
    Task<PayloadOverviewDto> GetOverviewAsync(DateTime? date, CancellationToken ct = default);
    Task<ReallocateResultDto> ReallocateAsync(Guid routeId, ReallocateDto dto, Guid dispatcherId, CancellationToken ct = default);
    Task<PayloadRunDto> SignOffAsync(Guid routeId, SignOffDto dto, Guid dispatcherId, CancellationToken ct = default);

    Task<SplitOptionsDto> GetSplitOptionsAsync(Guid routeId, CancellationToken ct = default);
    Task<SplitResultDto> PreviewSplitAsync(Guid routeId, SplitRequestDto dto, CancellationToken ct = default);
    Task<SplitResultDto> ConfirmSplitAsync(Guid routeId, SplitRequestDto dto, Guid dispatcherId, CancellationToken ct = default);
}
