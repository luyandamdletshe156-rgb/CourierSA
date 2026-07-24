using CourierSA.Infrastructure.Data;
using CourierSA.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CourierSA.API.Middleware;
using CourierSA.Domain.Exceptions;
using CourierSA.Application.Interfaces.Services;

namespace CourierSA.API.Controllers;

/// <summary>
/// POST /api/bulk-upload/preview  — parse + validate, return per-row errors without booking
/// POST /api/bulk-upload          — parse + validate + book all valid rows (207 on partial failure)
/// GET  /api/bulk-upload/template — download the 3-row sample CSV template
/// GET  /api/bulk-upload/history  — last 20 uploads for this user (persisted to DB)
/// GET  /api/bulk-upload/history/{uploadId} — full row-level results for a past upload
/// </summary>
[Route("api/bulk-upload")]
[Authorize(Policy = "CustomerOrBiz")]
public class BulkUploadController : CourierSABaseController
{
    private readonly IBulkCsvService _bulkCsvService;
    private readonly ApplicationDbContext _db;
    private readonly ILogger<BulkUploadController> _logger;

    public BulkUploadController(
        IBulkCsvService bulkCsvService,
        ApplicationDbContext db,
        ILogger<BulkUploadController> logger)
    {
        _bulkCsvService = bulkCsvService;
        _db             = db;
        _logger         = logger;
    }

    /// <summary>
    /// POST /api/bulk-upload/preview
    /// Validates the CSV without booking anything.
    /// Returns per-row validation results so the UI can show errors before committing.
    /// </summary>
    [HttpPost("preview")]
    [RequestSizeLimit(10 * 1024 * 1024)]
    public async Task<IActionResult> Preview(
        IFormFile file, CancellationToken ct)
    {
        ValidateFile(file);

        await using var stream = file.OpenReadStream();
        var parsed = await _bulkCsvService.ParseAndValidateAsync(stream, ct);

        var rows = parsed.Select((p, i) => new
        {
            rowNumber       = p.RowNum,
            clientReference = p.Row.ClientReference,
            recipientName   = p.Row.DeliveryName,
            destinationCity = p.Row.DeliveryCity,
            serviceType     = p.Row.ServiceType,
            weightKg        = p.Row.WeightKg,
            valid           = p.Errors.Count == 0,
            errors          = p.Errors,
        }).ToList();

        return Ok(new
        {
            totalRows  = parsed.Count,
            validRows  = rows.Count(r => r.valid),
            invalidRows= rows.Count(r => !r.valid),
            rows,
        }, "Preview complete — review errors before submitting");
    }

    /// <summary>
    /// POST /api/bulk-upload
    /// Validates + books all valid rows. Invalid rows are reported but don't abort the batch.
    /// </summary>
    [HttpPost]
    [RequestSizeLimit(10 * 1024 * 1024)]
    public async Task<IActionResult> Upload(
        IFormFile file, CancellationToken ct)
    {
        ValidateFile(file);

        _logger.LogInformation(
            "Bulk upload started by user {UserId}, file: {Name} ({Size} bytes)",
            CurrentUserId, file.FileName, file.Length);

        await using var stream = file.OpenReadStream();
        var result = await _bulkCsvService.ProcessAsync(stream, CurrentUserId, file.FileName, ct);

        _logger.LogInformation(
            "Bulk upload {UploadId} complete: {Ok} ok, {Fail} failed",
            result.UploadId, result.Successful, result.Failed);

        var message = result.Failed == 0
            ? $"All {result.Successful} parcels booked successfully."
            : $"{result.Successful} parcels booked, {result.Failed} rows had errors.";

        return result.Failed == 0 ? Ok(result, message) : StatusCode(207, new
        {
            success    = false,
            statusCode = 207,
            message,
            data       = result,
        });
    }

    /// <summary>GET /api/bulk-upload/template — returns a ready-to-use CSV file</summary>
    [HttpGet("template")]
    [AllowAnonymous]  // allow downloading without login so prospects can see the format
    public IActionResult DownloadTemplate()
    {
        var bytes = _bulkCsvService.GenerateTemplateBytes();
        return File(bytes, "text/csv", "CourierSA_BulkUpload_Template.csv");
    }

    /// <summary>GET /api/bulk-upload/history — last 20 uploads for this user (from DB)</summary>
    [HttpGet("history")]
    public async Task<IActionResult> GetHistory(CancellationToken ct)
    {
        var history = await _db.BulkUploadHistories
            .AsNoTracking()
            .Where(h => h.UserId == CurrentUserId)
            .OrderByDescending(h => h.ProcessedAt)
            .Take(20)
            .Select(h => new
            {
                h.UploadId,
                h.FileName,
                h.TotalRows,
                h.Successful,
                h.Failed,
                h.Skipped,
                uploadedAt = h.ProcessedAt,
            })
            .ToListAsync(ct);

        return Ok(history);
    }

    /// <summary>
    /// GET /api/bulk-upload/history/{uploadId}
    /// Returns full per-row results for a specific past upload.
    /// Useful for re-downloading error reports.
    /// </summary>
    [HttpGet("history/{uploadId}")]
    public async Task<IActionResult> GetHistoryDetail(string uploadId, CancellationToken ct)
    {
        var entry = await _db.BulkUploadHistories
            .AsNoTracking()
            .FirstOrDefaultAsync(h => h.UserId == CurrentUserId && h.UploadId == uploadId, ct);

        if (entry is null)
            throw new NotFoundException($"Upload '{uploadId}' not found.");

        // Deserialise the stored row results
        object? rowResults = null;
        if (!string.IsNullOrEmpty(entry.RowResultsJson))
        {
            try
            {
                rowResults = System.Text.Json.JsonSerializer.Deserialize<object>(entry.RowResultsJson);
            }
            catch { /* return null rows if JSON is malformed */ }
        }

        return Ok(new
        {
            entry.UploadId,
            entry.FileName,
            entry.TotalRows,
            entry.Successful,
            entry.Failed,
            entry.Skipped,
            uploadedAt = entry.ProcessedAt,
            rows       = rowResults,
        });
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    private static void ValidateFile(IFormFile? file)
    {
        if (file is null || file.Length == 0)
            throw new BadRequestException("No file provided.");

        if (!file.FileName.EndsWith(".csv", StringComparison.OrdinalIgnoreCase))
            throw new BadRequestException("Only .csv files are accepted.");

        if (file.Length > 10 * 1024 * 1024)
            throw new BadRequestException("File too large. Maximum size is 10 MB.");
    }
}
