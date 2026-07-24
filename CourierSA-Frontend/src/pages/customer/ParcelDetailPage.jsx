import { useQuery } from '@tanstack/react-query'
import { useParams, Link } from 'react-router-dom'
import AppShell from '@/components/layout/AppShell'
import { StatusPill, Alert, PageLoader } from '@/components/ui'
import { parcelApi } from '@/api'
import { formatDate, formatZAR } from '@/utils'
import {
  ArrowLeft, Truck, MapPin, Package, CheckCircle,
  XCircle, Clock, Shield, AlertTriangle
} from 'lucide-react'

// ── Event icon map ────────────────────────────────────────────────────────────
const EVENT_ICONS = {
  Booked:              { Icon: Package,     bg: 'bg-[#94A3B8]' },
  Approved:            { Icon: CheckCircle, bg: 'bg-[#1E63E9]' },
  ReceivedAtWarehouse: { Icon: Package,     bg: 'bg-[#0A3D91]' },
  OutForDelivery:      { Icon: Truck,       bg: 'bg-[#1E63E9]' },
  Delivered:           { Icon: CheckCircle, bg: 'bg-[#10B981]' },
  DeliveryFailed:      { Icon: XCircle,     bg: 'bg-[#EF4444]' },
  Cancelled:           { Icon: XCircle,     bg: 'bg-[#94A3B8]' },
  InWarehouse:         { Icon: Package,     bg: 'bg-[#0A3D91]' },
}

function Row({ label, value }) {
  if (!value) return null
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-[#64748B] flex-shrink-0">{label}</span>
      <span className="font-semibold text-[#172554] text-right">{value}</span>
    </div>
  )
}

function AddressBlock({ title, address }) {
  if (!address) return null
  return (
    <div>
      <h4 className="text-xs font-bold text-[#0A3D91] uppercase tracking-wider mb-2.5">{title}</h4>
      <div className="bg-[#F6FAFF] border border-[#D8E4F5] rounded-xl px-4 py-3 space-y-2">
        <Row label="Name"    value={address.recipientName} />
        <Row label="Phone"   value={address.recipientPhone} />
        <Row label="Address" value={
          `${address.streetAddress}${address.suburb ? ', ' + address.suburb : ''}, ${address.city}`
        } />
        <Row label="Province" value={address.province} />
        <Row label="Postal code" value={address.postalCode} />
      </div>
    </div>
  )
}

export default function ParcelDetailPage() {
  const { id } = useParams()

  const { data, isLoading, error } = useQuery({
    queryKey: ['parcel', id],
    queryFn:  () => parcelApi.get(id),
  })

  const parcel = data?.data

  return (
    <AppShell title="Parcel details">
      <div className="max-w-2xl mx-auto">
        <Link
          to="/customer/parcels"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-[#64748B] hover:text-[#0A3D91] transition-colors mb-5"
        >
          <ArrowLeft size={14} /> Back to parcels
        </Link>

        {isLoading && <PageLoader />}

        {error && (
          <Alert
            type="error"
            message={
              error.status === 404
                ? 'This parcel could not be found, or does not belong to your account.'
                : error.message
            }
          />
        )}

        {parcel && (
          <div className="space-y-5">
            {/* Header */}
            <div className="card">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <span className="tracking-number text-lg px-3 py-1.5">{parcel.trackingNumber}</span>
                  <div className="mt-3">
                    <StatusPill status={parcel.status?.replace(/\s/g, '')} />
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-bold text-[#94A3B8] uppercase tracking-wider mb-1">Service</p>
                  <p className="text-sm font-bold text-[#172554] capitalize">{parcel.serviceType}</p>
                  {parcel.estimatedDeliveryDate && (
                    <>
                      <p className="text-xs font-bold text-[#94A3B8] uppercase tracking-wider mt-3 mb-1">Est. delivery</p>
                      <p className="text-sm font-bold text-[#172554]">
                        {formatDate(parcel.estimatedDeliveryDate)}
                      </p>
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-5 border-t border-[#D8E4F5]">
                <Row label="Weight"   value={`${parcel.weightKg} kg`} />
                <Row label="Contents" value={parcel.description} />
                <Row label="Declared value" value={
                  parcel.declaredValueZAR ? formatZAR(parcel.declaredValueZAR) : null
                } />
                <Row label="Quote amount" value={
                  parcel.quoteAmountZAR ? formatZAR(parcel.quoteAmountZAR) : null
                } />
              </div>

              {(parcel.isFragile || parcel.requiresSignature || parcel.insuranceRequired) && (
                <div className="flex flex-wrap gap-3 mt-5 pt-4 border-t border-dashed border-[#D8E4F5]">
                  {parcel.isFragile && (
                    <span className="flex items-center gap-1.5 text-xs font-bold text-[#F59E0B]">
                      <AlertTriangle size={13} /> Fragile
                    </span>
                  )}
                  {parcel.requiresSignature && (
                    <span className="flex items-center gap-1.5 text-xs font-bold text-[#1E63E9]">
                      <CheckCircle size={13} /> Signature required
                    </span>
                  )}
                  {parcel.insuranceRequired && (
                    <span className="flex items-center gap-1.5 text-xs font-bold text-[#10B981]">
                      <Shield size={13} /> Insured
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Addresses */}
            <div className="card space-y-6">
              <AddressBlock title="Pickup"   address={parcel.pickupAddress} />
              <AddressBlock title="Delivery" address={parcel.deliveryAddress} />
            </div>

            {/* Tracking history */}
            <div className="card">
              <h3 className="text-xs font-bold text-[#0A3D91] uppercase tracking-wider mb-5">
                Tracking history
              </h3>
              <div className="space-y-0">
                {parcel.trackingEvents?.length
                  ? parcel.trackingEvents.map((event, i) => {
                      const { Icon, bg } = EVENT_ICONS[event.eventType] ?? { Icon: Clock, bg: 'bg-[#94A3B8]' }
                      return (
                        <div key={i} className="timeline-item">
                          <div className={`timeline-dot ${bg} !border-[#F6FAFF]`}>
                            <Icon size={12} className="text-white" />
                          </div>
                          <div className="pl-2">
                            <p className="text-sm font-bold text-[#172554]">{event.description}</p>
                            {event.location && (
                              <p className="text-xs font-medium text-[#64748B] mt-1 flex items-center gap-1.5">
                                <MapPin size={12} className="text-[#94A3B8]" /> {event.location}
                              </p>
                            )}
                            <p className="text-[11px] font-medium text-[#94A3B8] mt-1">
                              {formatDate(event.occurredAt, { time: true })}
                            </p>
                          </div>
                        </div>
                      )
                    })
                  : <p className="text-sm font-medium text-[#94A3B8]">No tracking events yet.</p>
                }
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  )
}