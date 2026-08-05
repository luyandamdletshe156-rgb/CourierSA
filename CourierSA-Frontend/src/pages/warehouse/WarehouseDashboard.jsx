import { useQuery } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { StatCard, PageLoader } from '@/components/ui'
import { parcelApi } from '@/api'
import { PackagePlus, Warehouse } from 'lucide-react'

export function WarehouseDashboard() {
  const { data: checkinData, isLoading: loading1 } = useQuery({
    queryKey: ['queue-checkin-count'],
    queryFn: () => parcelApi.queue({ status: 'AwaitingCheckIn', pageSize: 1 })
  })

  const { data: checkoutData, isLoading: loading2 } = useQuery({
    queryKey: ['queue-checkout-count'],
    queryFn: () => parcelApi.queue({ status: 'InWarehouse', pageSize: 1 })
  })

  if (loading1 || loading2) return <AppShell title="Dashboard"><PageLoader /></AppShell>

  return (
    <AppShell title="Warehouse Dashboard">
      <div className="page-header">
        <div>
          <h1 className="page-title">Warehouse Dashboard</h1>
          <p className="page-subtitle">Overview of current warehouse queue</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Awaiting Check-in" value={checkinData?.data?.totalCount ?? 0} icon={PackagePlus} color="bg-[#1E63E9]" />
        <StatCard label="In Warehouse (Awaiting Checkout)" value={checkoutData?.data?.totalCount ?? 0} icon={Warehouse} color="bg-[#0A3D91]" />
      </div>
    </AppShell>
  )
}