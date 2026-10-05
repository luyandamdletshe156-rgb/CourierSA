import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import AppShell from '@/components/layout/AppShell'
import {
  StatCard, StatusPill, TrackingBadge, EmptyState,
  PageLoader, Pagination, Alert
} from '@/components/ui'
import { parcelApi } from '@/api'
import { Package, Clock, CheckCircle, Truck, Plus, Search } from 'lucide-react'
import { formatDate, formatZAR } from '@/utils'
import clsx from 'clsx'

// How many parcels the dashboard loads to build its counts and the recent list.
const DASHBOARD_PAGE_SIZE = 50

// ── Customer Dashboard ────────────────────────────────────────────────────────
export function CustomerDashboard() {
  // One request feeds both the counts and the "Recent parcels" table (newest first).
  const { data, isLoading, error } = useQuery({
    queryKey: ['parcels', { page: 1, pageSize: DASHBOARD_PAGE_SIZE }],
    queryFn: () => parcelApi.list({ page: 1, pageSize: DASHBOARD_PAGE_SIZE }),
  })

  const parcels = data?.data?.items ?? []
  const total = data?.data?.totalCount ?? 0
  const recent = parcels.slice(0, 5)

  // Counts cover every parcel loaded (up to DASHBOARD_PAGE_SIZE), not just the five shown below.
  // Once an account has more parcels than that, a backend stats endpoint would be needed for exact numbers.
  const stats = {
    total,
    pending: parcels.filter(p => p.status === 'PendingApproval').length,
    transit: parcels.filter(p => p.status === 'OutForDelivery').length,
    delivered: parcels.filter(p => p.status === 'Delivered').length,
  }
  const countsAreCapped = total > parcels.length

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

      {error && <Alert type="error" message={error.message} className="mb-4" />}

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-2">
        <StatCard label="Total parcels" value={stats.total} icon={Package} color="bg-[#0A3D91]" />
        <StatCard label="Awaiting approval" value={stats.pending} icon={Clock} color="bg-[#F59E0B]" />
        <StatCard label="Out for delivery" value={stats.transit} icon={Truck} color="bg-[#1E63E9]" />
        <StatCard label="Delivered" value={stats.delivered} icon={CheckCircle} color="bg-[#10B981]" />
      </div>
      <p className="text-xs text-[#94A3B8] mb-6 min-h-[1rem]">
        {countsAreCapped && `The status counts cover your latest ${parcels.length} parcels.`}
      </p>

      {/* Recent parcels */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-sm font-semibold text-[#172554]">Recent parcels</h2>
          <Link to="/customer/parcels" className="text-xs text-[#0A3D91] hover:text-[#1E63E9] font-medium transition-colors">
            View all
          </Link>
        </div>

        {isLoading ? <PageLoader /> : recent.length === 0 ? (
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
                {recent.map(p => (
                  <tr key={p.id}>
                    <td>
                      <Link to={`/customer/parcels/${p.id}`} className="hover:text-[#1E63E9] transition-colors">
                        <TrackingBadge value={p.trackingNumber} />
                      </Link>
                    </td>
                    <td className="text-[#64748B]">{[p.destinationCity, p.destinationProvince].filter(Boolean).join(', ') || '—'}</td>
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
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const pageSize = 10

  // Delay the search by 500ms so we don't hit the API on every single keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1) // Always reset to page 1 when doing a new search
    }, 500)
    return () => clearTimeout(timer)
  }, [search])

  const { data, isLoading, error, isPlaceholderData, isPreviousData } = useQuery({
    // Include debouncedSearch in the queryKey so it refetches when search changes
    queryKey: ['parcels', { page, pageSize, search: debouncedSearch }],
    queryFn: () => parcelApi.list({ page, pageSize, search: debouncedSearch }),
    // Keep the old rows on screen while the next page or search loads, so the table doesn't
    // flash to a spinner. `keepPreviousData` is the React Query v4 way, `placeholderData` the v5 way.
    keepPreviousData: true,
    placeholderData: prev => prev,
  })
  const refreshing = !!(isPlaceholderData || isPreviousData)

  const parcels = data?.data?.items ?? []
  const total = data?.data?.totalCount ?? 0

  // The From column is only useful when the API actually returns an origin city.
  const getOrigin = p => p.originCity ?? p.pickupCity ?? null
  const showFrom = parcels.some(p => getOrigin(p))

  return (
    <AppShell title="My Parcels">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Parcels</h1>
          <p className="page-subtitle">
            {debouncedSearch
              ? `${total} parcel${total === 1 ? '' : 's'} match "${debouncedSearch}"`
              : `${total} parcel${total === 1 ? '' : 's'} total`}
          </p>
        </div>
        <Link to="/customer/book" className="btn-primary">
          <Plus size={16} /> Book parcel
        </Link>
      </div>

      {/* One card: search on top, results below */}
      <div className="card">
        <div className="p-4 border-b border-[#E2E8F0]">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
            <input
              className="input pl-9"
              aria-label="Search parcels"
              placeholder="Search by tracking number, city, or status…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {error && <div className="p-4"><Alert type="error" message={error.message} /></div>}

        {isLoading ? <PageLoader /> : parcels.length === 0 ? (
          <EmptyState
            title={debouncedSearch ? 'No matching parcels' : 'No parcels found'}
            description={debouncedSearch ? 'Try a different search term.' : 'Your booked parcels will appear here.'}
            action={debouncedSearch ? (
              <button className="btn-secondary btn-sm" onClick={() => { setSearch(''); setDebouncedSearch('') }}>
                Clear search
              </button>
            ) : undefined}
          />
        ) : (
          <>
            <div className={clsx('table-container transition-opacity', refreshing && 'opacity-60')}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Tracking #</th>
                    <th>Service</th>
                    {showFrom && <th>From</th>}
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
                      {showFrom && <td className="text-[#64748B] text-xs">{getOrigin(p) ?? '—'}</td>}
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