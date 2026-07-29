import { useQuery } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { StatCard, StatusPill, TrackingBadge, PageLoader, EmptyState } from '@/components/ui'
import { deliveryApi } from '@/api'
import { useAuth } from '@/context/AuthContext'
import { Truck, CheckCircle, XCircle, Navigation, MapPin, Phone, Clock, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'

export function DriverDashboard() {
  const { user } = useAuth()
  const { data, isLoading } = useQuery({
    queryKey: ['driver-deliveries'],
    queryFn:  deliveryApi.myDeliveries,
    refetchInterval: 30000,
  })

  const deliveries = data?.data ?? []
  const active    = deliveries.filter(d => d.status !== 'Delivered' && d.status !== 'Failed')
  const completed = deliveries.filter(d => d.status === 'Delivered')
  const failed    = deliveries.filter(d => d.status === 'Failed')

  // Next delivery stop
  const currentStop = active[0]

  return (
    <AppShell title="Driver Dashboard">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-brand-600 to-brand-700 text-white rounded-2xl p-6 mb-6 shadow-md">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider bg-white/20 px-2.5 py-1 rounded-full text-white">
              Driver Portal
            </span>
            <h1 className="text-2xl font-bold mt-2">Welcome back, {user?.firstName || 'Driver'}! 👋</h1>
            <p className="text-brand-100 text-sm mt-1">
              {active.length > 0 
                ? `You have ${active.length} active delivery assigned.` 
                : 'All caught up! Waiting for new dispatches.'}
            </p>
          </div>
          <div className="hidden sm:block text-right">
            <div className="inline-flex items-center gap-2 bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 px-3 py-1.5 rounded-full text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              On Duty
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Active Deliveries" value={active.length} icon={Truck} color="bg-brand-500" />
        <StatCard label="Completed Today" value={completed.length} icon={CheckCircle} color="bg-emerald-500" />
        <StatCard label="Failed Attempts" value={failed.length} icon={XCircle} color="bg-red-500" />
      </div>

      {/* Current Active Assignment Spotlight */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <Clock size={18} className="text-brand-500" />
            Current Priority Stop
          </h2>
          <Link to="/driver/deliveries" className="text-xs text-brand-600 hover:underline flex items-center gap-1 font-medium">
            View all ({deliveries.length}) <ArrowRight size={13} />
          </Link>
        </div>

        {isLoading ? (
          <PageLoader />
        ) : !currentStop ? (
          <div className="card">
            <EmptyState
              icon={Truck}
              title="No active deliveries"
              description="You currently have no assigned packages. Enjoy your break!"
            />
          </div>
        ) : (
          <div className="card border-l-4 border-l-brand-500 shadow-sm bg-white">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <TrackingBadge value={currentStop.trackingNumber} />
                  <StatusPill status={currentStop.status} />
                  <span className="text-xs text-gray-400">· Stop #1</span>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 text-base">{currentStop.recipientName}</h3>
                  <p className="text-sm text-gray-600 flex items-center gap-1 mt-0.5">
                    <MapPin size={14} className="text-brand-500 flex-shrink-0" />
                    {currentStop.deliveryAddress}, {currentStop.city}
                  </p>
                </div>

                {currentStop.recipientPhone && (
                  <a href={`tel:${currentStop.recipientPhone}`} className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline font-medium">
                    <Phone size={12} /> {currentStop.recipientPhone}
                  </a>
                )}
              </div>

              <div className="flex items-center gap-2 pt-2 md:pt-0 border-t md:border-t-0">
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(`${currentStop.deliveryAddress}, ${currentStop.city}`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-primary w-full md:w-auto justify-center"
                >
                  <Navigation size={15} />
                  Navigate Stop
                </a>
                <Link to="/driver/deliveries" className="btn-secondary w-full md:w-auto justify-center">
                  Update Status
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}