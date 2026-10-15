using CourierSA.Application.Interfaces.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace CourierSA.Infrastructure.Services;

/// <summary>
/// Periodic consolidation sweep:
///   1. releases customer-requested consolidation orders the warehouse never started, so parcels are not
///      stuck in "Consolidation Requested";
///   2. runs automatic consolidation: the business groups parcels going to the same address, tells the
///      customer when another parcel is on its way, and creates the orders (see ConsolidationService.RunAutomationAsync).
/// Settings (appsettings.json, all optional):
///   "Consolidation": { "StaleOrderHours": 48, "SweepMinutes": 30, "AutoEnabled": true, "HoldHours": 24 }
/// </summary>
public class ConsolidationTimeoutWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<ConsolidationTimeoutWorker> _logger;
    private readonly TimeSpan _maxAge;
    private readonly TimeSpan _interval;
    private readonly bool _autoEnabled;

    public ConsolidationTimeoutWorker(
        IServiceScopeFactory scopes, IConfiguration config, ILogger<ConsolidationTimeoutWorker> logger)
    {
        _scopes = scopes;
        _logger = logger;
        _maxAge = TimeSpan.FromHours(Math.Max(1, config.GetValue<int?>("Consolidation:StaleOrderHours") ?? 48));
        _interval = TimeSpan.FromMinutes(Math.Max(1, config.GetValue<int?>("Consolidation:SweepMinutes") ?? 30));
        _autoEnabled = config.GetValue<bool?>("Consolidation:AutoEnabled") ?? true;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        // Let the app finish starting (and seeding) before the first sweep.
        try { await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken); }
        catch (OperationCanceledException) { return; }

        using var timer = new PeriodicTimer(_interval);
        do
        {
            try
            {
                using var scope = _scopes.CreateScope();
                var service = scope.ServiceProvider.GetRequiredService<IConsolidationService>();
                var released = await service.ReleaseStaleOrdersAsync(_maxAge, stoppingToken);
                if (released > 0)
                    _logger.LogInformation("Released {Count} stale consolidation order(s).", released);

                var waiting = await service.ReleaseWaitingOrdersAsync(_maxAge, stoppingToken);
                if (waiting > 0)
                    _logger.LogInformation("Closed {Count} waiting consolidation request(s).", waiting);

                if (_autoEnabled)
                {
                    var auto = await service.RunAutomationAsync(stoppingToken);
                    if (auto.OrdersCreated + auto.HintsSent + auto.ReadyNotices > 0)
                        _logger.LogInformation(
                            "Automatic consolidation: {Orders} order(s) created, {Hints} heads-up, {Ready} ready notice(s).",
                            auto.OrdersCreated, auto.HintsSent, auto.ReadyNotices);
                }
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Consolidation timeout sweep failed.");
            }
        }
        while (await WaitAsync(timer, stoppingToken));
    }

    private static async Task<bool> WaitAsync(PeriodicTimer timer, CancellationToken ct)
    {
        try { return await timer.WaitForNextTickAsync(ct); }
        catch (OperationCanceledException) { return false; }
    }
}