using CourierSA.Application.DTOs.Invoices;
using CourierSA.Application.Interfaces.Repositories;
using CourierSA.Application.Interfaces.Services;
using CourierSA.Domain.Entities;
using CourierSA.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace CourierSA.Infrastructure.Services;

public class InvoiceService : IInvoiceService
{
    private readonly IUnitOfWork _uow;
    public InvoiceService(IUnitOfWork uow) => _uow = uow;

    // Fixed method name to match IInvoiceService interface
    public async Task<InvoiceDashboardDto> GetCustomerInvoiceDashboardAsync(Guid userId, CancellationToken ct = default)
    {
        var customer = await _uow.Query<CustomerProfile>().Query()
            .FirstOrDefaultAsync(c => c.UserId == userId, ct);

        if (customer == null)
            return new InvoiceDashboardDto(0, 0, 0, new List<InvoiceSummaryDto>());

        var invoices = await _uow.Query<Invoice>().Query()
            .Where(i => i.CustomerId == customer.Id)
            .OrderByDescending(i => i.CreatedAt)
            .ToListAsync(ct);

        int total = invoices.Count;

        // Replaced InvoiceStatus.Unpaid with InvoiceStatus.Issued
        var overdueCount = invoices.Count(i =>
            (i.Status == InvoiceStatus.Issued && i.DueDate < DateTime.UtcNow) ||
             i.Status == InvoiceStatus.Overdue);

        // Replaced InvoiceStatus.Unpaid with InvoiceStatus.Issued
        decimal amountDue = invoices
            .Where(i => i.Status == InvoiceStatus.Issued || i.Status == InvoiceStatus.Overdue)
            .Sum(i => i.TotalZAR - i.PaidAmountZAR);

        var summaries = invoices.Select(i => new InvoiceSummaryDto(
            i.Id,
            i.InvoiceNumber,
            i.CreatedAt,
            i.DueDate,
            i.TotalZAR,
            // Replaced InvoiceStatus.Unpaid with InvoiceStatus.Issued
            (i.Status == InvoiceStatus.Issued && i.DueDate < DateTime.UtcNow)
                ? "Overdue"
                : i.Status.ToString()
        )).ToList();

        return new InvoiceDashboardDto(total, amountDue, overdueCount, summaries);
    }
}