import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import {
  StatCard, EmptyState, PageLoader,
  StatusPill, TrackingBadge, Pagination
} from '@/components/ui'
import { parcelApi } from '@/api'
import {
  Package, Truck, CheckCircle, AlertTriangle, Search
} from 'lucide-react'
import { formatDate, formatZAR } from '@/utils'
import clsx from 'clsx'

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN — ALL PARCELS (platform-wide, not scoped to a customer)
// ═══════════════════════════════════════════════════════════════════════════
const STATUS_FILTERS = [
  { value: '',               label: 'All' },
  { value: 'PendingApproval',label: 'Pending approval' },
  { value: 'Approved',       label: 'Approved' },
  { value: 'InWarehouse',    label: 'In warehouse' },
  { value: 'OutForDelivery', label: 'Out for delivery' },
  { value: 'Delivered',      label: 'Delivered' },
  { value: 'Failed',         label: 'Failed' },
]

export default function AdminParcelsPage() {
  const [page, setPage]               = useState(1)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch]           = useState('')
  const pageSize = 15

  const { data, isLoading } = useQuery({
    queryKey: ['admin-parcels', page, statusFilter, search],
    queryFn: () => parcelApi.list({
      page,
      pageSize,
      status: statusFilter || undefined,
      trackingNumber: search.trim() || undefined,
    }),
    keepPreviousData: true,
  })

  const parcels = data?.data?.items ?? []
  const total   = data?.data?.totalCount ?? 0

  const pendingCount  = parcels.filter(p => p.status === 'PendingApproval').length
  const transitCount  = parcels.filter(p => p.status === 'OutForDelivery').length
  const deliveredCount = parcels.filter(p => p.status === 'Delivered').length

  return (
    <AppShell title="Parcels">
      <div className="page-header">
        <div>
          <h1 className="page-title">All Parcels</h1>
          <p className="page-subtitle">{total} parcels across the platform</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total parcels"    value={total}          icon={Package}       color="bg-[#0A3D91]" />
        <StatCard label="Pending approval" value={pendingCount}   icon={AlertTriangle} color="bg-[#F59E0B]" />
        <StatCard label="Out for delivery" value={transitCount}   icon={Truck}         color="bg-[#1E63E9]" />
        <StatCard label="Delivered"        value={deliveredCount} icon={CheckCircle}   color="bg-[#10B981]" />
      </div>

      <div className="card mb-4">
        <div className="relative">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
          <input
            className="input pl-10"
            placeholder="Search by tracking number…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {STATUS_FILTERS.map(f => (
          <button
            key={f.value || 'all'}
            onClick={() => { setStatusFilter(f.value); setPage(1) }}
            className={clsx(
              'px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-all',
              statusFilter === f.value
                ? 'bg-[#0A3D91] text-white border-[#0A3D91]'
                : 'bg-white text-[#64748B] border-[#D8E4F5] hover:border-[#1E63E9]/50 hover:text-[#172554]'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="card">
        {isLoading ? <PageLoader /> : parcels.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No parcels found"
            description={search ? 'No parcels match that tracking number.' : 'No parcels have been booked yet.'}
          />
        ) : (
          <>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tracking #</th>
                    <th>Service</th>
                    <th>Destination</th>
                    <th>Weight</th>
                    <th>Status</th>
                    <th>Amount</th>
                    <th>Booked</th>
                  </tr>
                </thead>
                <tbody>
                  {parcels.map(p => (
                    <tr key={p.id}>
                      <td><TrackingBadge value={p.trackingNumber} /></td>
                      <td className="capitalize text-xs font-medium text-[#172554]">{p.serviceType}</td>
                      <td className="text-xs text-[#64748B]">{p.destinationCity}</td>
                      <td className="text-xs text-[#64748B] font-mono">{p.weightKg} kg</td>
                      <td><StatusPill status={p.status} /></td>
                      <td className="text-xs font-bold text-[#172554] font-mono">
                        {p.quoteAmountZAR ? formatZAR(p.quoteAmountZAR) : '—'}
                      </td>
                      <td className="text-xs text-[#94A3B8] font-mono">{formatDate(p.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} />
          </>
        )}
      </div>
    </AppShell>
  )
}
