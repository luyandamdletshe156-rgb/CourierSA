import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import AppShell from '@/components/layout/AppShell'
import {
  StatCard, StatusPill, TrackingBadge, EmptyState,
  PageLoader, Pagination, Alert
} from '@/components/ui'
import { parcelApi } from '@/api'
import { Package, Clock, CheckCircle, Plus, Search } from 'lucide-react'
import { formatDate, formatZAR } from '@/utils'

// ── Customer Dashboard ────────────────────────────────────────────────────────
export function CustomerDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['parcels', { page: 1, pageSize: 5 }],
    queryFn:  () => parcelApi.list({ page: 1, pageSize: 5 }),
  })

  const parcels = data?.data?.items ?? []
  const total   = data?.data?.totalCount ?? 0

  // ⚠️ WARNING: These stats only calculate based on the 5 parcels loaded on this page!
  // To get accurate total stats across the user's entire account, you should create 
  // a dedicated endpoint (e.g., parcelApi.getStats()) that does this count on the backend.
  const stats = {
    total:     total,
    pending:   parcels.filter(p => p.status === 'PendingApproval').length,
    transit:   parcels.filter(p => p.status === 'OutForDelivery').length,
    delivered: parcels.filter(p => p.status === 'Delivered').length,
  }

  return (
    <AppShell title="Dashboard">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Dashboard</h1>
          <p className="page-subtitle">Track your parcels and manage bookings</p>
        </div>
        <Link to="/customer/book" className="btn-primary">
          <Plus size={16} />
          Book parcel
        </Link>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total parcels"  value={stats.total}     icon={Package}     color="bg-[#0A3D91]"  />
        <StatCard label="Pending (Recent)" value={stats.pending}   icon={Clock}       color="bg-[#F59E0B]"  />
        <StatCard label="In transit (Recent)" value={stats.transit}   icon={Package}     color="bg-[#1E63E9]"  />
        <StatCard label="Delivered (Recent)" value={stats.delivered} icon={CheckCircle} color="bg-[#10B981]"  />
      </div>

      {/* Recent parcels */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-sm font-semibold text-[#172554]">Recent parcels</h2>
          <Link to="/customer/parcels" className="text-xs text-[#0A3D91] hover:text-[#1E63E9] font-medium transition-colors">
            View all
          </Link>
        </div>

        {isLoading ? <PageLoader /> : parcels.length === 0 ? (
          <EmptyState
            title="No parcels yet"
            description="Book your first parcel to get started."
            action={
              <Link to="/customer/book" className="btn-primary btn-sm">
                <Plus size={14} /> Book parcel
              </Link>
            }
          />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Tracking #</th>
                  <th>Destination</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th>Booked</th>
                </tr>
              </thead>
              <tbody>
                {parcels.map(p => (
                  <tr key={p.id}>
                    <td>
                      <Link to={`/customer/parcels/${p.id}`} className="hover:text-[#1E63E9] transition-colors">
                        <TrackingBadge value={p.trackingNumber} />
                      </Link>
                    </td>
                    <td className="text-[#64748B]">{p.destinationCity}, {p.destinationProvince}</td>
                    <td><StatusPill status={p.status} /></td>
                    <td className="font-medium text-[#172554]">{p.quoteAmountZAR ? formatZAR(p.quoteAmountZAR) : '—'}</td>
                    <td className="text-[#94A3B8] text-xs">{formatDate(p.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  )
}

// ── Customer Parcels List ─────────────────────────────────────────────────────
export function CustomerParcels() {
  const [page, setPage]     = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const pageSize = 10

  // Delay the search by 500ms so we don't hit the API on every single keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1) // Always reset to page 1 when doing a new search!
    }, 500)
    return () => clearTimeout(timer)
  }, [search])

  const { data, isLoading, error } = useQuery({
    // Include debouncedSearch in the queryKey so it refetches when search changes
    queryKey: ['parcels', { page, pageSize, search: debouncedSearch }],
    // Pass the search term to your API
    queryFn:  () => parcelApi.list({ page, pageSize, search: debouncedSearch }),
    keepPreviousData: true, 
  })

  const parcels = data?.data?.items ?? []
  const total   = data?.data?.totalCount ?? 0

  return (
    <AppShell title="My Parcels">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Parcels</h1>
          <p className="page-subtitle">{total} parcels total</p>
        </div>
        <Link to="/customer/book" className="btn-primary">
          <Plus size={16} /> Book parcel
        </Link>
      </div>

      {/* Search */}
      <div className="card mb-4">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
          <input
            className="input pl-9"
            placeholder="Search by tracking number, city, or status…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="card">
        {error && <Alert message={error.message} />}

        {isLoading ? <PageLoader /> : parcels.length === 0 ? (
          <EmptyState
            title={debouncedSearch ? "No matching parcels" : "No parcels found"}
            description={debouncedSearch ? "Try a different search term." : "Your booked parcels will appear here."}
          />
        ) : (
          <>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tracking #</th>
                    <th>Service</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Weight</th>
                    <th>Status</th>
                    <th>Amount</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {parcels.map(p => (
                    <tr key={p.id}>
                      <td>
                        <Link
                          to={`/customer/parcels/${p.id}`}
                          className="hover:text-[#1E63E9] transition-colors"
                        >
                          <TrackingBadge value={p.trackingNumber} />
                        </Link>
                      </td>
                      <td className="text-[#64748B] capitalize text-xs">{p.serviceType}</td>
                      <td className="text-[#64748B] text-xs">{p.originCity ?? '—'}</td>
                      <td className="text-[#64748B] text-xs">{p.destinationCity}</td>
                      <td className="text-[#64748B] text-xs">{p.weightKg} kg</td>
                      <td><StatusPill status={p.status} /></td>
                      <td className="font-medium text-[#172554] text-xs">
                        {p.quoteAmountZAR ? formatZAR(p.quoteAmountZAR) : '—'}
                      </td>
                      <td className="text-[#94A3B8] text-xs">{formatDate(p.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {total > pageSize && (
               <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} />
            )}
          </>
        )}
      </div>
    </AppShell>
  )
}