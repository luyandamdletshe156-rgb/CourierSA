using CourierSA.Domain.Entities;
using CourierSA.Domain.Enums;
using CourierSA.Infrastructure.Data;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using CourierSA.API.Middleware;
using CourierSA.Domain.Exceptions;
using CourierSA.Application.Interfaces.Services;

namespace CourierSA.API.Controllers;

// ══════════════════════════════════════════════════════════════════════════════
// CLAIMS CONTROLLER
// GET    /api/claims                  – customer's own claims
// POST   /api/claims                  – submit new claim
// GET    /api/claims/{id}             – single claim detail
// PUT    /api/claims/{id}/review      – admin/dispatcher update status
// ══════════════════════════════════════════════════════════════════════════════
[Route("api/claims")]
[Authorize]
public class ClaimsController : CourierSABaseController
{
    private readonly ApplicationDbContext _db;
    private readonly IAuditService _audit;

    public ClaimsController(ApplicationDbContext db, IAuditService audit)
    {
        _db    = db;
        _audit = audit;
    }

    [HttpGet]
    [Authorize(Policy = "CustomerOrBiz")]
    public async Task<IActionResult> GetMyClaims(CancellationToken ct)
    {
        var customer = await _db.CustomerProfiles
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.UserId == CurrentUserId, ct)
            ?? throw new NotFoundException("Customer profile not found.");

        var claims = await _db.InsuranceClaims
            .AsNoTracking()
            .Where(c => c.CustomerId == customer.Id)
            .Include(c => c.Parcel)
            .OrderByDescending(c => c.CreatedAt)
            .Select(c => new
            {
                c.Id,
                c.ClaimNumber,
                c.Type,
                c.Status,
                c.ClaimedAmountZAR,
                c.ApprovedAmountZAR,
                c.Description,
                c.ResolutionNotes,
                c.CreatedAt,
                c.UpdatedAt,
                trackingNumber = c.Parcel != null ? c.Parcel.TrackingNumber : null,
                parcelId       = c.ParcelId,
            })
            .ToListAsync(ct);

        return Ok(claims);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct)
    {
        var claim = await _db.InsuranceClaims
            .AsNoTracking()
            .Include(c => c.Parcel)
            .FirstOrDefaultAsync(c => c.Id == id, ct)
            ?? throw new NotFoundException("Claim not found.");

        return Ok(claim);
    }

    [HttpPost]
    [Authorize(Policy = "CustomerOrBiz")]
    public async Task<IActionResult> Submit(
        [FromBody] SubmitClaimDto dto, CancellationToken ct)
    {
        if (dto.ClaimedAmountZAR <= 0)
            throw new BadRequestException("Claimed amount must be greater than zero.");

        if (string.IsNullOrWhiteSpace(dto.Description) || dto.Description.Length < 10)
            throw new BadRequestException("Please provide a description of at least 10 characters.");

        var customer = await _db.CustomerProfiles
            .FirstOrDefaultAsync(c => c.UserId == CurrentUserId, ct)
            ?? throw new NotFoundException("Customer profile not found.");

        // Find parcel by tracking number
        var parcel = await _db.Parcels
            .FirstOrDefaultAsync(p => p.TrackingNumber == dto.TrackingNumber.ToUpper().Trim(), ct)
            ?? throw new NotFoundException($"Parcel '{dto.TrackingNumber}' not found.");

        if (parcel.CustomerId != customer.Id)
            throw new ForbiddenException("You can only file claims for your own parcels.");

        // Generate claim number: CLM-YYYYMMDD-XXXX
        var prefix    = $"CLM-{DateTime.UtcNow:yyyyMMdd}-";
        var lastNum   = await _db.InsuranceClaims
            .Where(c => c.ClaimNumber.StartsWith(prefix))
            .OrderByDescending(c => c.ClaimNumber)
            .Select(c => c.ClaimNumber)
            .FirstOrDefaultAsync(ct);
        int seq = 1;
        if (lastNum is not null && int.TryParse(lastNum[prefix.Length..], out int prev))
            seq = prev + 1;
        var claimNumber = $"{prefix}{seq:D4}";

        var claim = new InsuranceClaim
        {
            Id                = Guid.NewGuid(),
            ParcelId          = parcel.Id,
            CustomerId        = customer.Id,
            ClaimNumber       = claimNumber,
            Type              = dto.Type,
            Status            = ClaimStatus.Submitted,
            ClaimedAmountZAR  = dto.ClaimedAmountZAR,
            Description       = dto.Description.Trim(),
            CreatedAt         = DateTime.UtcNow,
            UpdatedAt         = DateTime.UtcNow,
        };

        _db.InsuranceClaims.Add(claim);
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("CLAIM_SUBMITTED", "InsuranceClaim", claim.Id,
            null, new { claim.ClaimNumber, claim.Type }, CurrentUserId, null, ct);

        return Created(new { claim.Id, claim.ClaimNumber, claim.Status },
            $"Claim {claimNumber} submitted successfully.");
    }

    [HttpPut("{id:guid}/review")]
    [Authorize(Policy = "DispatcherOrAdmin")]
    public async Task<IActionResult> Review(
        Guid id, [FromBody] ReviewClaimDto dto, CancellationToken ct)
    {
        var claim = await _db.InsuranceClaims.FindAsync([id], ct)
            ?? throw new NotFoundException("Claim not found.");

        var old = new { claim.Status, claim.ApprovedAmountZAR };

        claim.Status             = dto.Status;
        claim.ApprovedAmountZAR  = dto.ApprovedAmountZAR;
        claim.ResolutionNotes    = dto.Notes;
        claim.UpdatedAt          = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("CLAIM_REVIEWED", "InsuranceClaim", id,
            old, new { dto.Status, dto.ApprovedAmountZAR }, CurrentUserId, null, ct);

        return NoContent("Claim updated");
    }
}

public record SubmitClaimDto(
    string     TrackingNumber,
    ClaimType  Type,
    decimal    ClaimedAmountZAR,
    string     Description
);

public record ReviewClaimDto(
    ClaimStatus Status,
    decimal?    ApprovedAmountZAR,
    string?     Notes
);


// ══════════════════════════════════════════════════════════════════════════════
// INVOICES CONTROLLER
// GET /api/invoices          – customer's invoices (paged)
// GET /api/invoices/{id}     – invoice detail with line items
// GET /api/invoices/{id}/pdf – download PDF (served from storage)
// POST /api/invoices/generate/{parcelId} – admin: generate invoice for a parcel
// ══════════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════
// INVOICES CONTROLLER
// ══════════════════════════════════════════════════════════════════════════════
[Route("api/invoices")]
[Authorize]
public class InvoicesController : CourierSABaseController
{
    private readonly ApplicationDbContext _db;
    private readonly IAuditService _audit;

    public InvoicesController(ApplicationDbContext db, IAuditService audit)
    {
        _db = db;
        _audit = audit;
    }

    [HttpGet]
    [Authorize(Policy = "CustomerOrBiz")]
    public async Task<IActionResult> GetMyInvoices(
        [FromQuery] int page = 1, [FromQuery] int pageSize = 10,
        CancellationToken ct = default)
    {
        var customer = await _db.CustomerProfiles
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.UserId == CurrentUserId, ct)
            ?? throw new NotFoundException("Customer profile not found.");

        var query = _db.Invoices
            .AsNoTracking()
            .Where(i => i.CustomerId == customer.Id);

        var total = await query.CountAsync(ct);
        var now = DateTime.UtcNow;

        var invoices = await query
            .OrderByDescending(i => i.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(i => new
            {
                i.Id,
                i.InvoiceNumber,
                // Automatically flags as "Overdue" for React if past due date
                status = (i.Status == InvoiceStatus.Issued && i.DueDate < now)
                    ? "Overdue"
                    : i.Status.ToString(),
                i.SubtotalZAR,
                i.VatZAR,
                i.TotalZAR,
                i.PaidAmountZAR,
                i.DueDate,
                i.PaidAt,
                i.CreatedAt,
                pdfPath = i.PdfPath, // Matches `inv.pdfPath` in React
                lineItems = i.LineItems.Select(li => new
                {
                    li.Description,
                    li.Quantity,
                    li.UnitPrice,
                    totalPrice = li.Quantity * li.UnitPrice
                }).ToList() // Included so your Modal displays line items!
            })
            .ToListAsync(ct);

        return Ok(new
        {
            items = invoices,
            totalCount = total,
            page,
            pageSize
        });
    }

    [HttpGet("{id:guid}")]
    [Authorize(Policy = "CustomerOrBiz")]
    public async Task<IActionResult> GetById(Guid id, CancellationToken ct)
    {
        var customer = await _db.CustomerProfiles
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.UserId == CurrentUserId, ct)
            ?? throw new NotFoundException("Customer profile not found.");

        var invoice = await _db.Invoices
            .AsNoTracking()
            .Include(i => i.LineItems)
            .FirstOrDefaultAsync(i => i.Id == id && i.CustomerId == customer.Id, ct)
            ?? throw new NotFoundException("Invoice not found.");

        return Ok(invoice);
    }

    [HttpGet("{id:guid}/pdf")]
    [Authorize(Policy = "CustomerOrBiz")]
    public async Task<IActionResult> DownloadPdf(Guid id, CancellationToken ct)
    {
        var customer = await _db.CustomerProfiles
            .AsNoTracking()
            .FirstOrDefaultAsync(c => c.UserId == CurrentUserId, ct)
            ?? throw new NotFoundException("Customer profile not found.");

        var invoice = await _db.Invoices
            .AsNoTracking()
            .FirstOrDefaultAsync(i => i.Id == id && i.CustomerId == customer.Id, ct)
            ?? throw new NotFoundException("Invoice not found.");

        if (invoice.PdfPath is null)
            throw new NotFoundException("PDF not yet generated for this invoice.");

        var fullPath = Path.Combine(
            Directory.GetCurrentDirectory(), "wwwroot", invoice.PdfPath.TrimStart('/'));

        if (!System.IO.File.Exists(fullPath))
            throw new NotFoundException("PDF file not found on disk.");

        var bytes = await System.IO.File.ReadAllBytesAsync(fullPath, ct);
        return File(bytes, "application/pdf", $"{invoice.InvoiceNumber}.pdf");
    }

    /// <summary>
    /// Admin: manually generate an invoice for a delivered parcel.
    /// </summary>
    [HttpPost("generate/{parcelId:guid}")]
    [Authorize(Policy = "AdminOnly")]
    public async Task<IActionResult> Generate(Guid parcelId, CancellationToken ct)
    {
        var parcel = await _db.Parcels
            .Include(p => p.Customer)
            .FirstOrDefaultAsync(p => p.Id == parcelId, ct)
            ?? throw new NotFoundException("Parcel not found.");

        if (parcel.Status != ParcelStatus.Delivered)
            throw new BadRequestException("Can only generate invoices for delivered parcels.");

        if (parcel.Customer is null)
            throw new BadRequestException("Parcel has no customer profile.");

        var exists = await _db.Invoices
            .AnyAsync(i => i.LineItems.Any(li => li.Description.Contains(parcel.TrackingNumber)), ct);
        if (exists)
            throw new ConflictException("Invoice already exists for this parcel.");

        var prefix = $"INV-{DateTime.UtcNow:yyyyMM}-";
        var lastInv = await _db.Invoices
            .Where(i => i.InvoiceNumber.StartsWith(prefix))
            .OrderByDescending(i => i.InvoiceNumber)
            .Select(i => i.InvoiceNumber)
            .FirstOrDefaultAsync(ct);
        int seq = 1;
        if (lastInv is not null && int.TryParse(lastInv[prefix.Length..], out int prev))
            seq = prev + 1;

        var subtotal = parcel.QuoteAmountZAR ?? 0m;
        var netAmount = Math.Round(subtotal / 1.15m, 2);
        var vatAmount = subtotal - netAmount;

        var invoice = new Invoice
        {
            Id = Guid.NewGuid(),
            CustomerId = parcel.Customer.Id,
            InvoiceNumber = $"{prefix}{seq:D4}",
            Status = InvoiceStatus.Issued,
            SubtotalZAR = netAmount,
            VatZAR = vatAmount,
            TotalZAR = subtotal,
            PaidAmountZAR = 0,
            DueDate = DateTime.UtcNow.AddDays(30),
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        };

        invoice.LineItems.Add(new InvoiceLineItem
        {
            Id = Guid.NewGuid(),
            Description = $"Delivery service – {parcel.TrackingNumber}",
            Quantity = 1,
            UnitPrice = netAmount,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow,
        });

        _db.Invoices.Add(invoice);
        await _db.SaveChangesAsync(ct);
        await _audit.LogAsync("INVOICE_GENERATED", "Invoice", invoice.Id,
            null, new { invoice.InvoiceNumber }, CurrentUserId, null, ct);

        return Created(new { invoice.Id, invoice.InvoiceNumber }, "Invoice generated.");
    }
}
