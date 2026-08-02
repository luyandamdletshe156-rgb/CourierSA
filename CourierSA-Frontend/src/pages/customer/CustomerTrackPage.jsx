import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { trackingApi, parcelApi } from '@/api'
import {
  StatusPill, Alert, Spinner, EmptyState, PageLoader, TrackingBadge,
} from '@/components/ui'
import {
  Search, Truck, MapPin, Package, CheckCircle, XCircle,
  AlertTriangle, Clock, Phone,
} from 'lucide-react'
import { formatDate } from '@/utils'
import { useTracking } from '@/context/TrackingContext'
import { useSearchParams } from 'react-router-dom'

// ── Event icon map (matches PublicTrackingPage) ────────────────────────────────
const EVENT_ICONS = {
  Booked:              { Icon: Package,       bg: 'bg-[#94A3B8]' },
  Approved:            { Icon: CheckCircle,   bg: 'bg-[#1E63E9]' },
  ReceivedAtWarehouse: { Icon: Package,       bg: 'bg-[#0A3D91]' },
  OutForDelivery:      { Icon: Truck,         bg: 'bg-[#1E63E9]' },
  Delivered:           { Icon: CheckCircle,   bg: 'bg-[#10B981]' },
  DeliveryFailed:      { Icon: XCircle,       bg: 'bg-[#EF4444]' },
  Cancelled:           { Icon: XCircle,       bg: 'bg-[#94A3B8]' },
  InWarehouse:         { Icon: Package,       bg: 'bg-[#0A3D91]' },
}

export default function CustomerTrackPage() {
  const [searchParams]        = useSearchParams()
  const [query,   setQuery]   = useState(searchParams.get('number') ?? '')
  const [result,  setResult]  = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const tracking = useTracking()

  // Quick-pick list of the customer's own recent parcels
  const { data: myParcels, isLoading: parcelsLoading } = useQuery({
    queryKey: ['my-parcels-quickpick'],
    queryFn:  () => parcelApi.list({ page: 1, pageSize: 5 }),
  })
  const recentParcels = myParcels?.data?.items ?? []

  const runTrack = async trackingNumber => {
    if (!trackingNumber.trim()) return
    setError('')
    setResult(null)
    setLoading(true)
    try {
      const res = await trackingApi.trackPrivate(trackingNumber.trim())
      setResult(res.data)
    } catch (err) {
      setError(err.status === 404
        ? `No parcel found with tracking number "${trackingNumber.trim()}", or it doesn't belong to your account.`
        : err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = e => {
    e.preventDefault()
    runTrack(query)
  }

  // Auto-run if a tracking number arrived via ?number= (e.g. linked from the dashboard)
  useEffect(() => {
    const fromUrl = searchParams.get('number')
    if (fromUrl) runTrack(fromUrl)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Subscribe to live updates for the currently displayed parcel
  useEffect(() => {
    if (!result?.trackingNumber || !tracking) return
    tracking.subscribeToParcel(result.trackingNumber)
    return () => tracking.unsubscribeFromParcel(result.trackingNumber)
  }, [result?.trackingNumber, tracking])

  // Merge live SignalR pushes into the displayed result
  // Hub payload (camelCased): { trackingNumber, newStatus, location, updatedAt }
  const liveEvent = result?.trackingNumber ? tracking?.parcelUpdates?.[result.trackingNumber] : null

  useEffect(() => {
  if (!liveEvent) return
  setResult(prev => prev && ({
    ...prev,
    status: liveEvent.newStatus ?? prev.status,
    trackingEvents: [
      {
        eventType:   liveEvent.newStatus,
        location:    liveEvent.location ?? null,
        description: liveEvent.newStatus,
        occurredAt:  liveEvent.updatedAt ?? new Date().toISOString(),
      },
      ...prev.trackingEvents,
    ],
  }))
}, [liveEvent])

  return (
    <AppShell title="Track">
      <div className="page-header">
        <div>
          <h1 className="page-title">Track a parcel</h1>
          <p className="page-subtitle">Live status, driver contact, and full history for your parcels</p>
        </div>
      </div>

      {/* Search */}
      <div className="card mb-6">
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
            <input
              className="input pl-12 font-mono"
              placeholder="e.g. CSA-20260802-00002"
              value={query}
              onChange={e => setQuery(e.target.value.toUpperCase())}
              autoComplete="off"
            />
          </div>
          <button type="submit" className="btn-primary sm:w-auto w-full" disabled={loading}>
            {loading ? <Spinner size="sm" className="text-white" /> : 'Track'}
          </button>
        </form>

        {/* Quick-pick from own parcels */}
        {!parcelsLoading && recentParcels.length > 0 && (
          <div className="mt-4 pt-4 border-t border-[#D8E4F5]">
            <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-2.5">
              Or pick a recent parcel
            </p>
            <div className="flex flex-wrap gap-2">
              {recentParcels.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setQuery(p.trackingNumber); runTrack(p.trackingNumber) }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#D8E4F5] bg-white hover:border-[#1E63E9]/50 hover:bg-[#F6FAFF] transition-colors text-xs font-mono font-semibold text-[#172554]"
                >
                  {p.trackingNumber}
                  <StatusPill status={p.status} />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {error && <Alert type="error" message={error} className="mb-6" />}

      {loading && !result && <PageLoader />}

      {!loading && !result && !error && (
        <EmptyState
          icon={Package}
          title="Search for a parcel"
          description="Enter a tracking number above, or pick one of your recent parcels."
        />
      )}

      {/* Result */}
      {result && (
        <div className="card animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6 pb-6 border-b border-[#D8E4F5]">
            <div>
              <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider mb-1">Tracking Number</p>
              <TrackingBadge value={result.trackingNumber} />
              <div className="mt-3"><StatusPill status={result.status?.replace(/\s/g, '')} /></div>
            </div>
            <div className="text-left sm:text-right bg-[#F6FAFF] p-3 rounded-xl border border-[#D8E4F5] min-w-[140px]">
              <p className="text-[10px] text-[#64748B] uppercase tracking-wide mb-1">Service Level</p>
              <p className="text-sm font-semibold text-[#172554] capitalize mb-3">{result.serviceType}</p>
              {result.estimatedDeliveryDate && (
                <>
                  <p className="text-[10px] text-[#64748B] uppercase tracking-wide mb-1">Est. Delivery</p>
                  <p className="text-sm font-semibold text-[#1E63E9]">{formatDate(result.estimatedDeliveryDate)}</p>
                </>
              )}
            </div>
          </div>

          {/* Payment / claim status (private-tracking only) */}
          {(result.paymentMethod || result.claimStatus) && (
            <div className="flex flex-wrap gap-3 mb-6">
              {result.paymentMethod && (
                <div className="flex-1 min-w-[140px] px-4 py-3 bg-[#F6FAFF] rounded-xl border border-[#D8E4F5]">
                  <p className="text-[10px] text-[#64748B] uppercase tracking-wide mb-1">Payment</p>
                  <p className="text-sm font-semibold text-[#172554]">
                    {result.paymentMethod} {result.isPaid ? '· Paid' : '· Unpaid'}
                  </p>
                </div>
              )}
              {result.claimStatus && (
                <div className="flex-1 min-w-[140px] px-4 py-3 bg-[#FEF3C7] rounded-xl border border-[#F59E0B]/30">
                  <p className="text-[10px] text-[#92400E] uppercase tracking-wide mb-1">Insurance claim</p>
                  <p className="text-sm font-semibold text-[#92400E]">{result.claimStatus}</p>
                </div>
              )}
            </div>
          )}

          {/* Destination */}
          {result.deliveryAddress && (
            <div className="flex items-center gap-3 text-sm text-[#334155] mb-6 px-4 py-3 bg-[#DCEEFF]/40 rounded-xl border border-[#DCEEFF]">
              <div className="w-8 h-8 rounded-full bg-[#1E63E9]/10 flex items-center justify-center flex-shrink-0">
                <MapPin size={16} className="text-[#1E63E9]" />
              </div>
              <span>
                Delivering to{' '}
                <strong className="text-[#172554]">
                  {result.deliveryAddress.city}, {result.deliveryAddress.province}
                </strong>
              </span>
            </div>
          )}

          {/* Driver contact */}
          {result.activeDelivery && (result.activeDelivery.driverName || result.activeDelivery.driverPhone) && (
            <div className="flex items-center gap-3 text-sm text-[#334155] mb-6 px-4 py-3 bg-[#F6FAFF] rounded-xl border border-[#D8E4F5]">
              <div className="w-8 h-8 rounded-full bg-[#0A3D91]/10 flex items-center justify-center flex-shrink-0">
                <Truck size={16} className="text-[#0A3D91]" />
              </div>
              <span className="flex-1">
                Your driver: <strong className="text-[#172554]">{result.activeDelivery.driverName ?? 'Assigned'}</strong>
              </span>
              {result.activeDelivery.driverPhone && (
                <a
                  href={`tel:${result.activeDelivery.driverPhone}`}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0A3D91] text-white text-xs font-semibold hover:bg-[#082F6D] transition-colors"
                >
                  <Phone size={13} /> Call
                </a>
              )}
            </div>
          )}

          {/* Timeline */}
          <div>
            <h3 className="text-xs font-semibold text-[#0A3D91] uppercase tracking-wider mb-6">
              Tracking History
            </h3>
            <div className="space-y-0">
              {result.trackingEvents?.map((event, i) => {
                const { Icon, bg } = EVENT_ICONS[event.eventType] ?? { Icon: Clock, bg: 'bg-[#94A3B8]' }
                const isLast = i === result.trackingEvents.length - 1

                return (
                  <div key={i} className="relative pl-10 pb-8 last:pb-0 group">
                    {!isLast && (
                      <div className="absolute left-[19px] top-8 bottom-0 w-[2px] bg-[#D8E4F5] group-hover:bg-[#1E63E9]/20 transition-colors" />
                    )}
                    <div className={`absolute left-1.5 top-1 w-8 h-8 rounded-full flex items-center justify-center border-[3px] border-white shadow-sm z-10 ${bg}`}>
                      <Icon size={14} className="text-white" />
                    </div>
                    <div className="pl-2">
                      <p className="text-sm font-semibold text-[#172554]">{event.description}</p>
                      {event.location && (
                        <p className="text-xs font-medium text-[#64748B] mt-1 flex items-center gap-1.5">
                          <MapPin size={12} className="text-[#94A3B8]" /> {event.location}
                        </p>
                      )}
                      <p className="text-xs text-[#94A3B8] mt-1.5 font-mono bg-[#F6FAFF] inline-block px-2 py-0.5 rounded border border-[#D8E4F5]">
                        {formatDate(event.occurredAt, { time: true })}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}