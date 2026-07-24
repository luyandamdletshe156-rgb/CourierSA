namespace CourierSA.Domain.Entities;

/// <summary>
/// Persists a summary of each bulk CSV upload so users can review their
/// upload history across sessions.
///
/// Replaces the previous static in-memory Dictionary in BulkUploadController.
/// </summary>
public class BulkUploadHistory : BaseEntity
{
    public Guid    UserId      { get; set; }
    public string  UploadId    { get; set; } = string.Empty;  // short human-readable ID e.g. "A3B9FF2C1D0E"
    public string  FileName    { get; set; } = string.Empty;
    public int     TotalRows   { get; set; }
    public int     Successful  { get; set; }
    public int     Failed      { get; set; }
    public int     Skipped     { get; set; }
    public DateTime ProcessedAt { get; set; }

    // JSON snapshot of per-row results (stored for audit/re-download)
    public string? RowResultsJson { get; set; }

    // Navigation
    public User? User { get; set; }
}
