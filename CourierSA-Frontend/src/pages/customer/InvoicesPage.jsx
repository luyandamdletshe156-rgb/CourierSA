import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { StatCard, EmptyState, PageLoader, Modal, Pagination } from '@/components/ui'
import api from '@/api'
import { FileText, Clock, AlertTriangle, Download, Eye } from 'lucide-react'
import { formatDate, formatZAR } from '@/utils'
import clsx from 'clsx'

const STATUS_STYLES = {
  Draft:          { cls: 'status-draft',     label: 'Draft'           },
  Issued:         { cls: 'status-pending',   label: 'Issued'          },
  PartiallyPaid:  { cls: 'status-transit',   label: 'Partially paid'  },
  Paid:           { cls: 'status-delivered', label: 'Paid'            },
  Overdue:        { cls: 'status-failed',    label: 'Overdue'         },
  Cancelled:      { cls: 'status-cancelled', label: 'Cancelled'       },
}

export default function InvoicesPage() {
  const [page, setPage]   = useState(1)
  const [detail, setDetail] = useState(null)
  const pageSize = 10

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', page],
    queryFn:  () => api.get('/invoices', { params: { page, pageSize } }),
    keepPreviousData: true,
  })

  const invoices = data?.data?.items  ?? []
  const total    = data?.data?.totalCount ?? 0

  const unpaidTotal = invoices
    .filter(i => i.status === 'Issued' || i.status === 'PartiallyPaid')
    .reduce((s, i) => s + (i.totalZAR - i.paidAmountZAR), 0)

  const overdueCount = invoices.filter(i => i.status === 'Overdue').length

  return (
    <AppShell title="Invoices">
      <div className="page-header">
        <div>
          <h1 className="page-title">Invoices</h1>
          <p className="page-subtitle">View and download your billing history</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Total invoices" value={total}          icon={FileText}     color="bg-[#0A3D91]" />
        <StatCard label="Amount due"     value={formatZAR(unpaidTotal)} icon={Clock} color="bg-[#F59E0B]" />
        <StatCard label="Overdue"        value={overdueCount}   icon={AlertTriangle} color="bg-[#EF4444]"   />
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="text-sm font-bold text-[#172554]">All invoices</h2>
        </div>

        {isLoading ? <PageLoader /> : invoices.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No invoices yet"
            description="Invoices are generated automatically for your parcel bookings."
          />
        ) : (
          <>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Subtotal</th>
                    <th>VAT</th>
                    <th>Total</th>
                    <th>Paid</th>
                    <th>Status</th>
                    <th>Due date</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(inv => {
                    const style = STATUS_STYLES[inv.status] ?? STATUS_STYLES.Draft
                    const balance = inv.totalZAR - inv.paidAmountZAR
                    return (
                      <tr key={inv.id}>
                        <td>
                          <span className="font-mono text-xs font-semibold text-[#172554] bg-[#F6FAFF] border border-[#D8E4F5] px-2 py-0.5 rounded">
                            {inv.invoiceNumber}
                          </span>
                        </td>
                        <td className="text-sm font-semibold font-mono text-[#334155]">{formatZAR(inv.subtotalZAR)}</td>
                        <td className="text-sm font-medium font-mono text-[#94A3B8]">{formatZAR(inv.vatZAR)}</td>
                        <td className="text-sm font-bold font-mono text-[#172554]">{formatZAR(inv.totalZAR)}</td>
                        <td className="text-sm font-semibold font-mono">
                          {inv.paidAmountZAR > 0
                            ? <span className="text-[#10B981]">{formatZAR(inv.paidAmountZAR)}</span>
                            : <span className="text-[#94A3B8]">—</span>}
                        </td>
                        <td><span className={style.cls}>{style.label}</span></td>
                        <td className={clsx(
                          'text-xs font-semibold font-mono',
                          inv.status === 'Overdue' ? 'text-[#EF4444]' : 'text-[#94A3B8]'
                        )}>
                          {formatDate(inv.dueDate)}
                        </td>
                        <td>
                          <div className="flex items-center gap-1">
                            <button
                              className="btn-ghost btn-sm"
                              onClick={() => setDetail(inv)}
                              title="View details"
                            >
                              <Eye size={13} />
                            </button>
                            {inv.pdfPath && (
                              <a
                                href={`/api/invoices/${inv.id}/pdf`}
                                target="_blank"
                                rel="noreferrer"
                                className="btn-ghost btn-sm"
                                title="Download PDF"
                              >
                                <Download size={13} />
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} />
          </>
        )}
      </div>

      <InvoiceDetailModal invoice={detail} onClose={() => setDetail(null)} />
    </AppShell>
  )
}

// ── Invoice Detail Modal ──────────────────────────────────────────────────────
function InvoiceDetailModal({ invoice: inv, onClose }) {
  if (!inv) return null
  const style   = STATUS_STYLES[inv.status] ?? STATUS_STYLES.Draft
  const balance = inv.totalZAR - inv.paidAmountZAR

  return (
    <Modal open={!!inv} onClose={onClose} title={`Invoice ${inv.invoiceNumber}`} size="md">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-bold text-[#94A3B8] uppercase tracking-wider mb-1">Status</p>
            <span className={style.cls}>{style.label}</span>
          </div>
          <div className="text-right">
            <p className="text-2xl font-extrabold text-[#172554] font-mono">{formatZAR(inv.totalZAR)}</p>
            <p className="text-xs font-medium text-[#94A3B8] mt-0.5">Due {formatDate(inv.dueDate)}</p>
          </div>
        </div>

        {/* Line items */}
        {inv.lineItems?.length > 0 && (
          <div>
            <p className="text-xs font-bold text-[#0A3D91] uppercase tracking-wider mb-2.5">Line items</p>
            <div className="divide-y divide-[#D8E4F5] border border-[#D8E4F5] rounded-xl overflow-hidden bg-white">
              {inv.lineItems.map((li, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-2.5 text-sm">
                  <span className="font-semibold text-[#334155]">{li.description}</span>
                  <div className="flex items-center gap-6 text-[#64748B]">
                    <span className="text-xs font-bold text-[#94A3B8]">×{li.quantity}</span>
                    <span className="font-medium font-mono">{formatZAR(li.unitPrice)}</span>
                    <span className="font-bold text-[#172554] font-mono">{formatZAR(li.totalPrice)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Totals */}
        <div className="space-y-2 text-sm border-t border-[#D8E4F5] pt-4">
          {[
            { label: 'Subtotal',  value: inv.subtotalZAR },
            { label: 'VAT (15%)', value: inv.vatZAR },
          ].map(row => (
            <div key={row.label} className="flex justify-between text-[#64748B] font-medium">
              <span>{row.label}</span>
              <span className="font-semibold text-[#172554] font-mono">{formatZAR(row.value)}</span>
            </div>
          ))}
          <div className="flex justify-between font-bold text-[#172554] text-base pt-2.5 border-t border-[#D8E4F5]">
            <span>Total</span>
            <span className="font-extrabold font-mono">{formatZAR(inv.totalZAR)}</span>
          </div>
          {inv.paidAmountZAR > 0 && (
            <>
              <div className="flex justify-between font-semibold text-[#10B981]">
                <span>Paid</span>
                <span className="font-bold font-mono">−{formatZAR(inv.paidAmountZAR)}</span>
              </div>
              <div className="flex justify-between font-bold text-[#172554] pt-1.5 border-t border-dashed border-[#D8E4F5]">
                <span>Balance due</span>
                <span className={clsx('font-extrabold font-mono', balance > 0 ? 'text-[#EF4444]' : 'text-[#10B981]')}>
                  {formatZAR(balance)}
                </span>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2">
          {inv.pdfPath && (
            <a
              href={`/api/invoices/${inv.id}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="btn-secondary"
            >
              <Download size={14} /> Download PDF
            </a>
          )}
          <button className="btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </Modal>
  )
}