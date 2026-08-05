import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { PageLoader, EmptyState, Pagination } from '@/components/ui'
import { FileText, Clock, AlertTriangle, Download, Eye, X, CheckCircle2 } from 'lucide-react'
import { formatZAR, formatDate } from '@/utils'
import { apiClient, parcelApi } from '@/api' // ✅ Correct project import pathation
import clsx from 'clsx'

export default function InvoicesPage() {
  const [page, setPage] = useState(1)
  const [selectedInvoice, setSelectedInvoice] = useState(null)
  const pageSize = 10

  // Fetch invoices from /api/invoices
  const { data, isLoading } = useQuery({
    queryKey: ['invoices', { page, pageSize }],
    queryFn: () => apiClient.get(`/api/invoices?page=${page}&pageSize=${pageSize}`).then(res => res.data),
    keepPreviousData: true,
  })

  const invoices     = data?.items ?? []
  const totalCount   = data?.totalCount ?? 0
  const amountDue    = data?.amountDue ?? 0
  const overdueCount = data?.overdueCount ?? 0

  return (
    <AppShell title="Invoices">
      <div className="page-header">
        <div>
          <h1 className="page-title">Invoices</h1>
          <p className="page-subtitle">View and download your billing history</p>
        </div>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : (
        <>
          {/* Top 3 Stat Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {/* Stat 1: Total Invoices */}
            <div className="card flex items-center p-5 gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#0A3D91] flex items-center justify-center text-white shadow-md">
                <FileText size={20} />
              </div>
              <div>
                <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider mb-1">Total Invoices</p>
                <p className="text-2xl font-bold text-[#172554]">{totalCount}</p>
              </div>
            </div>

            {/* Stat 2: Amount Due */}
            <div className="card flex items-center p-5 gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#F59E0B] flex items-center justify-center text-white shadow-md">
                <Clock size={20} />
              </div>
              <div>
                <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider mb-1">Amount Due</p>
                <p className="text-2xl font-bold font-mono text-[#172554]">{formatZAR(amountDue)}</p>
              </div>
            </div>

            {/* Stat 3: Overdue Count */}
            <div className="card flex items-center p-5 gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#EF4444] flex items-center justify-center text-white shadow-md">
                <AlertTriangle size={20} />
              </div>
              <div>
                <p className="text-[11px] font-bold text-[#64748B] uppercase tracking-wider mb-1">Overdue</p>
                <p className="text-2xl font-bold text-[#172554]">{overdueCount}</p>
              </div>
            </div>
          </div>

          {/* Main Invoices Table Card */}
          <div className="card">
            <div className="card-header border-b border-[#D8E4F5] pb-4 mb-0">
              <h2 className="text-sm font-semibold text-[#172554]">All invoices</h2>
            </div>

            {invoices.length === 0 ? (
              <EmptyState 
                icon={FileText}
                title="No invoices yet" 
                description="Invoices are generated automatically for your parcel bookings." 
              />
            ) : (
              <>
                <div className="table-container">
                  <table className="table w-full">
                    <thead>
                      <tr className="text-left text-xs text-[#64748B] uppercase bg-[#F6FAFF] border-b border-[#D8E4F5]">
                        <th className="p-4 font-semibold">Invoice Number</th>
                        <th className="p-4 font-semibold">Date</th>
                        <th className="p-4 font-semibold">Due Date</th>
                        <th className="p-4 font-semibold">Total Amount</th>
                        <th className="p-4 font-semibold">Status</th>
                        <th className="p-4 font-semibold text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((inv) => (
                        <tr key={inv.id} className="border-b border-[#D8E4F5] last:border-0 hover:bg-[#F6FAFF]/50 transition-colors">
                          <td className="p-4 font-mono text-sm font-bold text-[#0A3D91]">
                            {inv.invoiceNumber}
                          </td>
                          <td className="p-4 text-sm text-[#64748B]">{formatDate(inv.createdAt)}</td>
                          <td className="p-4 text-sm text-[#64748B]">{formatDate(inv.dueDate)}</td>
                          <td className="p-4 text-sm font-bold font-mono text-[#172554]">{formatZAR(inv.totalZAR)}</td>
                          <td className="p-4">
                            <span className={clsx(
                              'px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider rounded-md inline-block',
                              inv.status === 'Paid' && 'bg-[#10B981]/10 text-[#10B981]',
                              inv.status === 'Overdue' && 'bg-[#EF4444]/10 text-[#EF4444]',
                              (inv.status === 'Issued' || inv.status === 'PartiallyPaid') && 'bg-[#F59E0B]/10 text-[#F59E0B]',
                              (inv.status === 'Draft' || inv.status === 'Cancelled' || inv.status === 'Voided') && 'bg-[#64748B]/10 text-[#64748B]'
                            )}>
                              {inv.status}
                            </span>
                          </td>
                          <td className="p-4 text-right space-x-2">
                            {/* View Detail Modal Trigger */}
                            <button 
                              onClick={() => setSelectedInvoice(inv)}
                              className="p-1.5 text-[#64748B] hover:text-[#0A3D91] hover:bg-[#F6FAFF] rounded-lg transition-colors inline-flex items-center gap-1 text-xs font-semibold" 
                              title="View Breakdown"
                            >
                              <Eye size={16} /> View
                            </button>

                            {/* Download PDF Button */}
                            {inv.pdfPath && (
                              <a 
                                href={`/api/invoices/${inv.id}/pdf`} 
                                download 
                                className="p-1.5 text-[#64748B] hover:text-[#0A3D91] hover:bg-[#F6FAFF] rounded-lg transition-colors inline-flex items-center gap-1 text-xs font-semibold" 
                                title="Download PDF"
                              >
                                <Download size={16} /> PDF
                              </a>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <Pagination page={page} pageSize={pageSize} total={totalCount} onPage={setPage} />
              </>
            )}
          </div>
        </>
      )}

      {/* Invoice Detail Breakdown Modal */}
      {selectedInvoice && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl relative animate-in fade-in zoom-in-95">
            <button 
              onClick={() => setSelectedInvoice(null)} 
              className="absolute right-4 top-4 text-[#94A3B8] hover:text-[#172554] p-1 rounded-lg hover:bg-[#F6FAFF]"
            >
              <X size={20} />
            </button>

            <div className="flex items-center gap-2 mb-1">
              <FileText size={20} className="text-[#0A3D91]" />
              <h3 className="text-lg font-bold text-[#172554]">Tax Invoice</h3>
            </div>
            <p className="text-xs text-[#64748B] font-mono mb-4">{selectedInvoice.invoiceNumber}</p>

            <div className="space-y-2.5 border-t border-b border-[#D8E4F5] py-4 mb-4 text-sm">
              <div className="flex justify-between">
                <span className="text-[#64748B]">Issue Date:</span> 
                <span className="font-semibold text-[#172554]">{formatDate(selectedInvoice.createdAt)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#64748B]">Due Date:</span> 
                <span className="font-semibold text-[#172554]">{formatDate(selectedInvoice.dueDate)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#64748B]">Status:</span> 
                <span className={clsx(
                  'px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded',
                  selectedInvoice.status === 'Paid' ? 'bg-[#10B981]/10 text-[#10B981]' : 'bg-[#F59E0B]/10 text-[#F59E0B]'
                )}>
                  {selectedInvoice.status}
                </span>
              </div>
            </div>

            {/* Line Items Section */}
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#64748B] mb-2">Line Items</h4>
            <div className="space-y-2 mb-4 bg-[#F6FAFF] p-3 rounded-xl border border-[#D8E4F5] max-h-40 overflow-y-auto">
              {selectedInvoice.lineItems && selectedInvoice.lineItems.length > 0 ? (
                selectedInvoice.lineItems.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-xs font-medium text-[#172554]">
                    <span>{item.description} (x{item.quantity})</span>
                    <span className="font-mono font-bold">{formatZAR(item.totalPrice)}</span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-[#94A3B8] italic">Standard Courier Delivery Service</p>
              )}
            </div>

            {/* Totals Breakdown */}
            <div className="space-y-1.5 text-right text-xs border-t border-[#D8E4F5] pt-3">
              <div className="text-[#64748B]">Subtotal: <span className="font-mono font-semibold text-[#172554]">{formatZAR(selectedInvoice.subtotalZAR)}</span></div>
              <div className="text-[#64748B]">VAT (15%): <span className="font-mono font-semibold text-[#172554]">{formatZAR(selectedInvoice.vatZAR)}</span></div>
              <div className="text-base font-extrabold text-[#0A3D91] pt-1">Total: <span className="font-mono">{formatZAR(selectedInvoice.totalZAR)}</span></div>
            </div>

            <div className="mt-6 flex justify-end">
              <button 
                onClick={() => setSelectedInvoice(null)}
                className="btn-secondary text-xs px-5 py-2"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}