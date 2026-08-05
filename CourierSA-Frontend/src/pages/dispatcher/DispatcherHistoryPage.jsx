import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { StatCard, StatusPill, TrackingBadge, EmptyState, PageLoader, Pagination } from '@/components/ui'
import { parcelApi } from '@/api'
import { Package, CheckCircle, Truck, History } from 'lucide-react'
import { formatDate } from '@/utils'

export function DispatcherHistoryPage() {
  const [page, setPage] = useState(1)
  const pageSize = 15

  const { data, isLoading } = useQuery({
    queryKey: ['dispatcher-history', page],
    queryFn: () => parcelApi.list({ page, pageSize }),
    keepPreviousData: true,
  })

  const parcels = data?.data?.items ?? []
  const total = data?.data?.totalCount ?? 0

  return (
    <AppShell title="Dispatch History">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dispatch History</h1>
          <p className="page-subtitle">Full log of all historical parcel dispatches</p>
        </div>
      </div>

      <div className="card">
        {isLoading ? <PageLoader /> : parcels.length === 0 ? (
          <EmptyState icon={History} title="No dispatch history" description="Completed dispatches will appear here." />
        ) : (
          <>
            <div className="table-container">
              <table className="table">
                <thead><tr><th>Tracking #</th><th>Destination</th><th>Service</th><th>Status</th><th>Date</th></tr></thead>
                <tbody>
                  {parcels.map(p => (
                    <tr key={p.id}>
                      <td><TrackingBadge value={p.trackingNumber} /></td>
                      <td className="text-xs text-[#64748B] font-medium">{p.destinationCity}</td>
                      <td className="text-xs capitalize text-[#172554] font-semibold">{p.serviceType}</td>
                      <td><StatusPill status={p.status} /></td>
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