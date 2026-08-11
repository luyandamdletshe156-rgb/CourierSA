import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, Link } from 'react-router-dom'
import AppShell from '@/components/layout/AppShell'
import { StatusPill, Alert, PageLoader } from '@/components/ui'
import CancelParcelModal from '@/components/modals/CancelParcelModal' // ➕ IMPORTED CANCELLATION MODAL
import { parcelApi, reschedulingApi } from '@/api'
import { formatDate, formatZAR } from '@/utils'
import {
  ArrowLeft, Truck, MapPin, Package, CheckCircle,
  XCircle, Clock, Shield, AlertTriangle, CalendarClock, CheckCircle2, Ban
} from 'lucide-react'

// ── Event icon map ────────────────────────────────────────────────────────────
const EVENT_ICONS = {
  Booked:                { Icon: Package,       bg: 'bg-[#94A3B8]' },
  Approved:              { Icon: CheckCircle,   bg: 'bg-[#1E63E9]' },
  ReceivedAtWarehouse:   { Icon: Package,       bg: 'bg-[#0A3D91]' },
  OutForDelivery:        { Icon: Truck,         bg: 'bg-[#1E63E9]' },
  Delivered:             { Icon: CheckCircle,   bg: 'bg-[#10B981]' },
  DeliveryFailed:        { Icon: XCircle,       bg: 'bg-[#EF4444]' },
  Cancelled:             { Icon: Ban,           bg: 'bg-[#EF4444]' }, // ➕ Red icon for cancellation
  InWarehouse:           { Icon: Package,       bg: 'bg-[#0A3D91]' },
  CollectionRescheduled: { Icon: CalendarClock, bg: 'bg-[#1E63E9]' },
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

// ── Reschedule collection panel ────────────────────────────────────────────────
function RescheduleCollectionPanel({ parcel, onRescheduled }) {
  const [open, setOpen] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [quote, setQuote] = useState(null)
  const [quoteError, setQuoteError] = useState('')
  const [confirmError, setConfirmError] = useState('')
  const [result, setResult] = useState(null)

  const previewMutation = useMutation({
    mutationFn: () => reschedulingApi.previewFee(parcel.id, new Date(newDate).toISOString()),
    onSuccess: res => { setQuote(res.data); setQuoteError('') },
    onError: err => { setQuote(null); setQuoteError(err?.message || 'Failed to calculate fee.') },
  })

  const confirmMutation = useMutation({
    mutationFn: () => reschedulingApi.reschedule(parcel.id, new Date(newDate).toISOString()),
    onSuccess: res => { setResult(res.data); setConfirmError(''); onRescheduled?.() },
    onError: err => setConfirmError(err?.message || 'Failed to reschedule.'),
  })

  const isEligible = ['PendingApproval', 'Approved'].includes(parcel.status)
  if (!isEligible) return null

  return (
    <div className="card">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white bg-[#1E63E9]">
            <CalendarClock size={15} />
          </div>
          <h3 className="text-sm font-bold text-[#172554]">Reschedule collection</h3>
        </div>
        <span className="text-xs font-bold text-[#0A3D91]">{open ? 'Hide' : result ? 'View' : 'Change'}</span>
      </button>

      {open && (
        <div className="mt-4 pt-4 border-t border-[#D8E4F5] space-y-4">
          {result ? (
            <div className="p-4 bg-[#10B981]/10 border border-[#10B981]/20 rounded-xl">
              <div className="flex items-center gap-2 text-[#047857] font-bold text-sm mb-2">
                <CheckCircle2 size={16} /> Collection rescheduled
              </div>
              <p className="text-sm text-[#64748B]">
                New collection time: <strong className="text-[#172554]">
                  {new Date(result.newScheduledPickupDate).toLocaleString('en-ZA')}
                </strong>
              </p>
              {result.feeCharged && (
                <p className="text-sm text-[#64748B] mt-1">
                  Fee of {formatZAR(result.feeZAR)} was applied via {result.chargeMethod === 'Wallet' ? 'your wallet' : 'a new invoice'}.
                </p>
              )}
            </div>
          ) : (
            <>
              <Row
                label="Current scheduled collection"
                value={parcel.scheduledPickupDate ? formatDate(parcel.scheduledPickupDate, { time: true }) : 'Not yet scheduled'}
              />

              <div>
                <label className="label">New collection date & time</label>
                <input
                  type="datetime-local" className="input"
                  value={newDate}
                  min={new Date().toISOString().slice(0, 16)}
                  onChange={e => { setNewDate(e.target.value); setQuote(null) }}
                />
              </div>

              {quoteError && <Alert type="error" message={quoteError} />}

              {!quote && (
                <button
                  onClick={() => previewMutation.mutate()}
                  disabled={!newDate || previewMutation.isPending}
                  className="btn-secondary w-full"
                >
                  {previewMutation.isPending ? 'Checking…' : 'Check for rescheduling fee'}
                </button>
              )}

              {quote && (
                <>
                  <div className={`p-3 rounded-xl text-sm ${quote.isFeeApplicable ? 'bg-[#F59E0B]/10 text-[#B45309] border border-[#F59E0B]/20' : 'bg-[#10B981]/10 text-[#047857] border border-[#10B981]/20'}`}>
                    {quote.isFeeApplicable
                      ? <>A fee of <strong>{formatZAR(quote.feeZAR)}</strong> applies. {quote.reason}</>
                      : <>No fee applies. {quote.reason}</>}
                  </div>
                  {confirmError && <Alert type="error" message={confirmError} />}
                  <button
                    onClick={() => confirmMutation.mutate()}
                    disabled={confirmMutation.isPending}
                    className="btn-primary w-full"
                  >
                    {confirmMutation.isPending ? 'Confirming…' : 'Confirm reschedule'}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function ParcelDetailPage() {
  const { id } = useParams()
  const qc = useQueryClient()
  const [cancelModalOpen, setCancelModalOpen] = useState(false) // ➕ CANCELLATION MODAL STATE

  const { data, isLoading, error } = useQuery({
    queryKey: ['parcel', id],
    queryFn:  () => parcelApi.get(id),
  })

  const parcel = data?.data

  // ➕ Check if parcel status allows cancellation
  const canCancel = ['PendingApproval', 'Approved', 'AwaitingCheckIn', 'InWarehouse', 'CheckedOut'].includes(parcel?.status)

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
                  
                  {/* Status & Cancel Action */}
                  <div className="mt-3 flex items-center gap-3 flex-wrap">
                    <StatusPill status={parcel.status?.replace(/\s/g, '')} />
                    
                    {/* ➕ CANCEL PARCEL BUTTON */}
                    {canCancel && (
                      <button
                        onClick={() => setCancelModalOpen(true)}
                        className="btn-danger btn-sm"
                      >
                        Cancel parcel
                      </button>
                    )}
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
                {parcel.scheduledPickupDate && (
                  <Row label="Scheduled collection" value={formatDate(parcel.scheduledPickupDate, { time: true })} />
                )}
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

            {/* Reschedule collection — UC1/UC2 */}
            <RescheduleCollectionPanel
              parcel={parcel}
              onRescheduled={() => qc.invalidateQueries({ queryKey: ['parcel', id] })}
            />

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

        {/* ➕ CANCELLATION MODAL */}
        <CancelParcelModal
          open={cancelModalOpen}
          onClose={() => setCancelModalOpen(false)}
          parcel={parcel}
        />
      </div>
    </AppShell>
  )
}