import AppShell from '@/components/layout/AppShell'
import { EmptyState, StatCard } from '@/components/ui'
import { RefreshCw, Wrench, ShieldAlert } from 'lucide-react'

export function MaintenanceSwapsPage() {
  return (
    <AppShell title="Maintenance Swaps">
      <div className="page-header">
        <div>
          <h1 className="page-title">Maintenance & Vehicle Swaps</h1>
          <p className="page-subtitle">Manage driver breakdown swaps and active vehicle maintenance requests</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <StatCard label="Active Breakdown Swaps" value="0" icon={RefreshCw} color="bg-[#F59E0B]" />
        <StatCard label="In Maintenance" value="0" icon={Wrench} color="bg-[#64748B]" />
        <StatCard label="Critical Alerts" value="0" icon={ShieldAlert} color="bg-[#EF4444]" />
      </div>

      <div className="card">
        <EmptyState
          icon={RefreshCw}
          title="All vehicles operating normally"
          description="No driver vehicle breakdown swaps or emergency reassignments are active right now."
        />
      </div>
    </AppShell>
  )
}