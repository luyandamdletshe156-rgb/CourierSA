import { useQuery } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { StatCard, StatusPill, TrackingBadge, PageLoader } from '@/components/ui'
import { parcelApi } from '@/api'
import { Package, Truck, CheckCircle, TrendingUp, FileText } from 'lucide-react'
import { formatDate, formatZAR } from '@/utils'

export function BusinessDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['biz-parcels', { page: 1, pageSize: 10 }],
    queryFn: () => parcelApi.list({ page: 1, pageSize: 10 }),
  })

  const parcels = data?.data?.items ?? []
  const total = data?.data?.totalCount ?? 0
  const delivered = parcels.filter(p => p.status === 'Delivered').length
  const transit = parcels.filter(p => p.status === 'OutForDelivery').length

  return (
    <AppShell title="Business Dashboard">
      <div className="page-header">
        <div>
          <h1 className="page-title">Business Dashboard</h1>
          <p className="page-subtitle">Manage your company's shipments and billing</p>
        </div>
        <div className="flex gap-3">
          <a href="/business/bulk-upload" className="btn-secondary"><FileText size={16} /> Bulk upload</a>
          <a href="/business/parcels" className="btn-primary"><Package size={16} /> View all parcels</a>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total parcels" value={total} icon={Package} color="bg-[#172554]" />
        <StatCard label="In transit" value={transit} icon={Truck} color="bg-[#1E63E9]" />
        <StatCard label="Delivered" value={delivered} icon={CheckCircle} color="bg-[#10B981]"/>
        <StatCard label="This month" value="—" icon={TrendingUp} color="bg-[#0A3D91]" />
      </div>

      <div className="card">
        <div className="card-header"><h2 className="text-sm font-bold text-[#172554]">Recent shipments</h2></div>
        {isLoading ? <PageLoader /> : (
          <div className="table-container">
            <table className="table">
              <thead><tr><th>Tracking #</th><th>Service</th><th>Destination</th><th>Status</th><th>Amount</th><th>Date</th></tr></thead>
              <tbody>
                {parcels.map(p => (
                  <tr key={p.id}>
                    <td><TrackingBadge value={p.trackingNumber} /></td>
                    <td className="text-xs capitalize font-medium text-[#172554]">{p.serviceType}</td>
                    <td className="text-xs text-[#64748B]">{p.destinationCity}</td>
                    <td><StatusPill status={p.status} /></td>
                    <td className="text-xs font-bold text-[#172554] font-mono">{p.quoteAmountZAR ? formatZAR(p.quoteAmountZAR) : '—'}</td>
                    <td className="text-xs text-[#94A3B8] font-mono">{formatDate(p.createdAt)}</td>
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