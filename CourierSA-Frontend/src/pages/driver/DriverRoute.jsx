import { useQuery } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { StatusPill, TrackingBadge, PageLoader, EmptyState } from '@/components/ui'
import { deliveryApi } from '@/api'
import { Navigation, MapPin, Phone, ExternalLink, Route as RouteIcon, CheckCircle2 } from 'lucide-react'

export function DriverRoute() {
  const { data, isLoading } = useQuery({
    queryKey: ['driver-deliveries'],
    queryFn:  deliveryApi.myDeliveries,
    refetchInterval: 30000,
  })

  const deliveries = data?.data ?? []
  const activeStops = deliveries.filter(d => d.status !== 'Delivered' && d.status !== 'Failed')

  return (
    <AppShell title="Delivery Route">
      <div className="page-header mb-4">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <RouteIcon size={24} className="text-brand-500" />
            Optimized Route Sequence
          </h1>
          <p className="page-subtitle">{activeStops.length} delivery stops remaining</p>
        </div>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : activeStops.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={CheckCircle2}
            title="Route completed!"
            description="You have completed all delivery stops on your route."
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Stops Sequence Timeline */}
          <div className="lg:col-span-2 space-y-4">
            {activeStops.map((stop, index) => (
              <div key={stop.id} className="card relative pl-12 border-l-4 border-l-brand-500">
                {/* Stop Sequence Number Badge */}
                <div className="absolute -left-3 top-4 w-7 h-7 rounded-full bg-brand-500 text-white font-bold text-xs flex items-center justify-center border-2 border-white shadow">
                  {index + 1}
                </div>

                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <TrackingBadge value={stop.trackingNumber} />
                      <StatusPill status={stop.status} />
                    </div>

                    <h3 className="font-semibold text-gray-800 text-base">{stop.recipientName}</h3>
                    <p className="text-sm text-gray-600 flex items-start gap-1">
                      <MapPin size={15} className="text-gray-400 mt-0.5 flex-shrink-0" />
                      <span>{stop.deliveryAddress}, {stop.city}</span>
                    </p>

                    {stop.recipientPhone && (
                      <a href={`tel:${stop.recipientPhone}`} className="inline-flex items-center gap-1 text-xs text-brand-500 hover:underline">
                        <Phone size={12} /> {stop.recipientPhone}
                      </a>
                    )}
                  </div>

                  <a
                    href={`https://maps.google.com/?q=${encodeURIComponent(`${stop.deliveryAddress}, ${stop.city}`)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-primary btn-sm flex-shrink-0"
                  >
                    <Navigation size={13} />
                    Start GPS
                  </a>
                </div>
              </div>
            ))}
          </div>

          {/* Quick Route Summary Card */}
          <div className="space-y-4">
            <div className="card bg-gray-50 border p-4">
              <h3 className="font-bold text-gray-800 text-sm mb-3">Route Summary</h3>
              <div className="space-y-2 text-xs text-gray-600">
                <div className="flex justify-between py-1 border-b">
                  <span>Total Stops:</span>
                  <span className="font-semibold text-gray-800">{activeStops.length}</span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span>Next Destination:</span>
                  <span className="font-semibold text-gray-800 truncate max-w-[150px]">
                    {activeStops[0]?.city || 'N/A'}
                  </span>
                </div>
              </div>

              <a
                href={`https://www.google.com/maps/dir/${activeStops.map(s => encodeURIComponent(`${s.deliveryAddress}, ${s.city}`)).join('/')}`}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary w-full justify-center mt-4 text-xs"
              >
                <ExternalLink size={13} /> Open Entire Multi-Stop Map
              </a>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}