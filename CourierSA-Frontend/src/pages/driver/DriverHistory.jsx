import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { StatCard, StatusPill, TrackingBadge, EmptyState, PageLoader, Pagination } from '@/components/ui'
import api from '@/api'
import { Package, CheckCircle, XCircle, Truck } from 'lucide-react'
import { formatDate } from '@/utils'

export function DriverHistoryPage() {
  const [page, setPage] = useState(1)
  const pageSize = 15

  const { data, isLoading } = useQuery({
    queryKey: ['driver-history', page],
    queryFn: () => api.get('/deliveries/history', { params: { page, pageSize } }),
    keepPreviousData: true,
  })

  const deliveries = data?.data?.items ?? []
  const total = data?.data?.totalCount ?? 0
  const delivered = deliveries.filter(d => d.status === 'Delivered').length
  const failed = deliveries.filter(d => d.status === 'Failed').length

  return (
    <AppShell title="Delivery History">
      <div className="page-header">
        <div>
          <h1 className="page-title">Task History</h1>
          <p className="page-subtitle">All completed and failed tasks</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Total" value={total} icon={Package} color="bg-[#64748B]" />
        <StatCard label="Completed" value={delivered} icon={CheckCircle} color="bg-[#10B981]" />
        <StatCard label="Failed" value={failed} icon={XCircle} color="bg-[#EF4444]" />
      </div>

      <div className="card">
        {isLoading ? <PageLoader /> : deliveries.length === 0 ? (
          <EmptyState icon={Truck} title="No task history" description="Completed tasks will appear here." />
        ) : (
          <>
            <div className="table-container">
              <table className="table">
                <thead><tr><th>Tracking #</th><th>Contact</th><th>City</th><th>Status</th><th>Time</th></tr></thead>
                <tbody>
                  {deliveries.map(d => (
                    <tr key={d.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <TrackingBadge value={d.trackingNumber} />
                          {d.isPickup && <span className="px-2 py-0.5 text-xs font-semibold bg-purple-100 text-purple-700 rounded-full">Pickup</span>}
                        </div>
                      </td>
                      <td className="text-sm font-medium text-[#172554]">{d.isPickup ? (d.pickupName || d.recipientName) : d.recipientName}</td>
                      <td className="text-xs text-[#64748B]">{d.isPickup ? (d.pickupCity || d.city) : d.city}</td>
                      <td><StatusPill status={d.status} /></td>
                      <td className="text-xs text-[#94A3B8] font-mono">{formatDate(d.updatedAt, { time: true })}</td>
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