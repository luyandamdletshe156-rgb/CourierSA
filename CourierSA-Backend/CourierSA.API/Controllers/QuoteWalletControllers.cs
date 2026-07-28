using CourierSA.Application.DTOs.Quotes;
using CourierSA.Application.Interfaces.Services;
using CourierSA.Domain.Enums;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;
using CourierSA.API.Middleware;
using CourierSA.Domain.Exceptions;
using CourierSA.Application.Interfaces.Repositories;
using CourierSA.Domain.Entities;
using Microsoft.EntityFrameworkCore;

namespace CourierSA.API.Controllers;

// ── Quotes Controller ─────────────────────────────────────────────────────────
[Route("api/quotes")]
public class QuotesController : CourierSABaseController
{
    private readonly IQuoteService _quoteService;

    public QuotesController(IQuoteService quoteService)
        => _quoteService = quoteService;

    /// <summary>
    /// POST /api/quotes/calculate
    /// Can be called anonymously (no quote saved) or authenticated (quote persisted for 30min).
    /// </summary>
    [HttpPost("calculate")]
    [AllowAnonymous]
    public async Task<IActionResult> Calculate(
        [FromBody] QuoteRequestDto dto, CancellationToken ct)
    {
        // Validation
        if (dto.WeightKg <= 0 || dto.WeightKg > 999)
            throw new BadRequestException("Weight must be between 0.1 kg and 999 kg.");

        if (!Enum.IsDefined(dto.ServiceType))
            throw new BadRequestException("Invalid service type.");

        if (!Enum.IsDefined(dto.OriginProvince) || !Enum.IsDefined(dto.DestinationProvince))
            throw new BadRequestException("Invalid province value.");

        // Pass the user ID if authenticated (saves the quote for later booking)
        Guid? userId = null;
        var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!string.IsNullOrEmpty(userIdClaim) && Guid.TryParse(userIdClaim, out var id))
            userId = id;

        var result = await _quoteService.CalculateAsync(dto, userId, ct);
        return Ok(result, "Quote calculated successfully");
    }

    /// <summary>GET /api/quotes/{id} — retrieve a saved quote</summary>
    [HttpGet("{id:guid}")]
    [Authorize]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        var quote = await _quoteService.GetAsync(id, ct)
            ?? throw new NotFoundException($"Quote {id} not found or has expired.");

        if (quote.Status == QuoteStatus.Expired || quote.ExpiresAt < DateTime.UtcNow)
            throw new BadRequestException("This quote has expired. Please request a new quote.");

        return Ok(quote);
    }
}

// ── Wallet Controller ─────────────────────────────────────────────────────────
[Route("api/wallet")]
[Authorize]
public class WalletController : CourierSABaseController
{
    private readonly IUnitOfWork _uow;

    public WalletController(IUnitOfWork uow) => _uow = uow;

    /// <summary>GET /api/wallet/balance</summary>
    [HttpGet("balance")]
    [Authorize(Policy = "CustomerOrBiz")]
    public async Task<IActionResult> GetBalance(CancellationToken ct)
    {
        var customer = await _uow.Query<CustomerProfile>()
            .FirstOrDefaultAsync(c => c.UserId == CurrentUserId, ct)
            ?? throw new NotFoundException("Customer profile not found.");

        return Ok(new
        {
            balanceZAR     = customer.WalletBalanceZAR,
            accountType    = customer.AccountType.ToString(),
            lastUpdated    = customer.UpdatedAt
        });
    }

    /// <summary>GET /api/wallet/transactions?page=1&pageSize=20</summary>
    [HttpGet("transactions")]
    [Authorize(Policy = "CustomerOrBiz")]
    public async Task<IActionResult> GetTransactions(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
    {
        var transactions = await _uow.WalletTransactions
            .Query()
            .Where(t => t.UserId == CurrentUserId)
            .OrderByDescending(t => t.CreatedAt)
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(t => new
            {
                t.Id,
                t.Type,
                t.AmountZAR,
                t.BalanceAfterZAR,
                t.Description,
                t.ReferenceType,
                t.ExternalPaymentRef,
                t.CreatedAt
            })
            .ToListAsync(ct);

        var total = await _uow.WalletTransactions.CountAsync(
            t => t.UserId == CurrentUserId, ct);

        return Ok(new { items = transactions, totalCount = total, page, pageSize });
    }

    /// <summary>
    /// POST /api/wallet/topup — Admin/demo: credit wallet
    /// In production this would be called by a payment gateway webhook.
    /// </summary>
    [HttpPost("topup")]
    public async Task<IActionResult> TopUp(
        [FromBody] TopUpDto dto, CancellationToken ct)
    {
        if (dto.Amount <= 0)
            throw new BadRequestException("Top-up amount must be greater than zero.");
        var customer = await _uow.Query<CustomerProfile>()
            .Query()
            .FirstOrDefaultAsync(c => c.UserId == dto.UserId, ct)
            ?? throw new NotFoundException("Customer not found.");

        customer.WalletBalanceZAR += dto.Amount;
        customer.UpdatedAt         = DateTime.UtcNow;

        await _uow.WalletTransactions.AddAsync(new WalletTransaction
        {
            Id              = Guid.NewGuid(),
            UserId          = dto.UserId,
            Type            = WalletTransactionType.Credit,
            AmountZAR       = dto.Amount,
            BalanceAfterZAR = customer.WalletBalanceZAR,
            Description     = dto.Description ?? "Admin top-up",
            CreatedAt       = DateTime.UtcNow,
            UpdatedAt       = DateTime.UtcNow,
        }, ct);

        await _uow.SaveChangesAsync(ct);
        return Ok(new { newBalance = customer.WalletBalanceZAR }, "Wallet credited");
    }
}

public record TopUpDto(Guid UserId, decimal Amount, string? Description);
