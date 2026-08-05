import { useQuery } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { StatCard, PageLoader } from '@/components/ui'
import api from '@/api'
import { Package, CheckCircle, Truck, AlertTriangle, Users } from 'lucide-react'
import clsx from 'clsx'

export function AdminReportsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => api.get('/admin/dashboard/stats'),
    refetchInterval: 60000,
  })

  const stats = data?.data ?? {}
  const completionRate = stats.totalParcels > 0 ? Math.round((stats.delivered / stats.totalParcels) * 100) : 0

  const metrics = [
    { label: 'Total parcels', value: stats.totalParcels, icon: Package, color: 'bg-[#0A3D91]' },
    { label: 'Delivered', value: stats.delivered, icon: CheckCircle, color: 'bg-[#10B981]' },
    { label: 'In transit', value: stats.inTransit, icon: Truck, color: 'bg-[#1E63E9]' },
    { label: 'Pending approval', value: stats.pendingApproval, icon: AlertTriangle, color: 'bg-[#F59E0B]' },
    { label: 'Registered users', value: stats.totalUsers, icon: Users, color: 'bg-[#6366F1]' },
  ]

  return (
    <AppShell title="Reports">
      <div className="page-header">
        <div>
          <h1 className="page-title">Platform Reports</h1>
          <p className="page-subtitle">Live system statistics — updates every 60 seconds</p>
        </div>
      </div>

      {isLoading ? <PageLoader /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {metrics.map(m => <StatCard key={m.label} label={m.label} value={m.value ?? '—'} icon={m.icon} color={m.color} />)}
          </div>
          <div className="card mb-4">
            <div className="card-header">
              <h2 className="text-sm font-bold text-[#172554]">Delivery success rate</h2>
              <span className="text-2xl font-bold text-[#10B981] font-mono">{completionRate}%</span>
            </div>
            <div className="w-full bg-[#F6FAFF] border border-[#D8E4F5] rounded-full h-3.5 overflow-hidden">
              <div className="h-3.5 rounded-full bg-gradient-to-r from-[#1E63E9] to-[#10B981] transition-all" style={{ width: `${completionRate}%` }} />
            </div>
          </div>
        </>
      )}
    </AppShell>
  )
}