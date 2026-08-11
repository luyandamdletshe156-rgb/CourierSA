import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, Link } from 'react-router-dom'
import AppShell from '@/components/layout/AppShell'
import { StatusPill, Alert, PageLoader, TrackingBadge } from '@/components/ui'
import CancelParcelModal from '@/components/modals/CancelParcelModal'
import { parcelApi, reschedulingApi } from '@/api'
import { formatDate, formatZAR } from '@/utils'
import {
  ArrowLeft, Truck, MapPin, Package, CheckCircle,
  XCircle, Clock, Shield, AlertTriangle, CalendarClock, 
  CheckCircle2, Ban, Copy, RefreshCw
} from 'lucide-react'
import clsx from 'clsx'

// ── Event icon map ────────────────────────────────────────────────────────────
const EVENT_ICONS = {
  Booked:                { Icon: Package,       bg: 'bg-[#94A3B8]' },
  Approved:              { Icon: CheckCircle,   bg: 'bg-[#1E63E9]' },
  ReceivedAtWarehouse:   { Icon: Package,       bg: 'bg-[#0A3D91]' },
  OutForDelivery:        { Icon: Truck,         bg: 'bg-[#1E63E9]' },
  Delivered:             { Icon: CheckCircle,   bg: 'bg-[#10B981]' },
  DeliveryFailed:        { Icon: XCircle,       bg: 'bg-[#EF4444]' },
  Cancelled:             { Icon: Ban,           bg: 'bg-[#EF4444]' },
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
    <div className="flex-1">
      <h4 className="text-[11px] font-bold text-[#0A3D91] uppercase tracking-wider mb-2.5">{title}</h4>
      <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-4 py-3 space-y-1.5 text-xs">
        <p className="font-bold text-[#172554]">{address.recipientName}</p>
        <p className="text-[#64748B]">{address.recipientPhone}</p>
        <p className="text-[#64748B] truncate">{address.streetAddress}, {address.suburb}</p>
        <p className="text-[#64748B]">{address.city}, {address.province} ({address.postalCode})</p>
      </div>
    </div>
  )
}

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
    <div className="card bg-white p-5 rounded-2xl border border-[#D8E4F5] shadow-sm">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white bg-[#1E63E9]">
            <CalendarClock size={15} />
          </div>
          <h3 className="text-sm font-bold text-[#172554]">Reschedule collection</h3>
        </div>
        <span className="text-xs font-bold text-[#0A3D91]">{open ? 'Hide' : result ? 'View' : 'Change'}</span>
      </button>

      {open && (
        <div className="mt-4 pt-4 border-t border-[#E2E8F0] space-y-4">
          {result ? (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
              <div className="flex items-center gap-2 text-emerald-800 font-bold text-sm mb-2">
                <CheckCircle2 size={16} /> Collection rescheduled
              </div>
              <p className="text-xs text-emerald-700">
                New time: {new Date(result.newScheduledPickupDate).toLocaleString('en-ZA')}
              </p>
            </div>
          ) : (
            <>
              <div className="text-sm">
                <span className="text-[#64748B]">Current: </span>
                <span className="font-medium">{parcel.scheduledPickupDate ? formatDate(parcel.scheduledPickupDate, { time: true }) : 'ASAP'}</span>
              </div>
              <div>
                <label className="label text-xs">New collection date & time</label>
                <input type="datetime-local" className="input text-xs" value={newDate} min={new Date().toISOString().slice(0, 16)} onChange={e => { setNewDate(e.target.value); setQuote(null) }} />
              </div>
              {!quote && (
                <button onClick={() => previewMutation.mutate()} disabled={!newDate || previewMutation.isPending} className="btn-secondary w-full text-xs">
                  {previewMutation.isPending ? 'Checking…' : 'Check rescheduling fee'}
                </button>
              )}
              {quote && (
                <>
                  <div className={`p-3 rounded-xl text-xs ${quote.isFeeApplicable ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'}`}>
                    {quote.isFeeApplicable ? <>Fee: <strong>{formatZAR(quote.feeZAR)}</strong>. {quote.reason}</> : <>No fee applies.</>}
                  </div>
                  <button onClick={() => confirmMutation.mutate()} disabled={confirmMutation.isPending} className="btn-primary w-full text-xs">
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
  const [cancelModalOpen, setCancelModalOpen] = useState(false)

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['parcel', id],
    queryFn:  () => parcelApi.get(id),
  })

  const parcel = data?.data
  const canCancel = ['PendingApproval', 'Approved', 'AwaitingCheckIn', 'InWarehouse', 'CheckedOut'].includes(parcel?.status)

  const copyTracking = () => navigator.clipboard.writeText(parcel.trackingNumber)

  return (
    <AppShell title="Parcel details">
      <div className="max-w-2xl mx-auto pb-12">
        <Link to="/customer/parcels" className="inline-flex items-center gap-1.5 text-xs font-medium text-[#64748B] hover:text-[#0A3D91] transition-colors mb-5">
          <ArrowLeft size={14} /> Back to parcels
        </Link>

        {isLoading && <PageLoader />}
        {error && <Alert type="error" message={error.status === 404 ? 'Parcel not found.' : error.message} />}

        {parcel && (
          <div className="space-y-5">
            <div className="card bg-white p-6 rounded-2xl border border-[#D8E4F5] shadow-sm">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="tracking-number text-sm px-3 py-1 font-mono font-bold bg-[#F1F5F9] rounded-lg text-[#172554]">
                      {parcel.trackingNumber}
                    </span>
                    <button onClick={copyTracking} className="text-[#94A3B8] hover:text-[#0A3D91]"><Copy size={14}/></button>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <StatusPill status={parcel.status?.replace(/\s/g, '')} />
                    {canCancel && <button onClick={() => setCancelModalOpen(true)} className="btn-danger btn-sm text-[10px]">Cancel</button>}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider mb-0.5">Service</p>
                  <p className="text-sm font-bold text-[#172554] capitalize">{parcel.serviceType}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-5 border-t border-[#D8E4F5]">
                <Row label="Weight" value={`${parcel.weightKg} kg`} />
                <Row label="Contents" value={parcel.description} />
                <Row label="Declared value" value={parcel.declaredValueZAR ? formatZAR(parcel.declaredValueZAR) : null} />
                <Row label="Quote" value={parcel.quoteAmountZAR ? formatZAR(parcel.quoteAmountZAR) : null} />
              </div>
            </div>

            <RescheduleCollectionPanel parcel={parcel} onRescheduled={refetch} />

            <div className="card bg-white p-5 rounded-2xl border border-[#D8E4F5] flex flex-col sm:flex-row gap-6">
              <AddressBlock title="Pickup" address={parcel.pickupAddress} />
              <AddressBlock title="Delivery" address={parcel.deliveryAddress} />
            </div>

            <div className="card bg-white p-5 rounded-2xl border border-[#D8E4F5]">
              <h3 className="text-xs font-bold text-[#0A3D91] uppercase tracking-wider mb-5">Tracking history</h3>
              <div className="space-y-0">
                {parcel.trackingEvents?.length ? parcel.trackingEvents.map((event, i) => {
                  const item = EVENT_ICONS[event.eventType] ?? { Icon: Clock, bg: 'bg-[#94A3B8]' }
                  return (
                    <div key={i} className="flex gap-4 pb-6 last:pb-0 relative">
                      {i < parcel.trackingEvents.length - 1 && <div className="absolute left-[13px] top-[26px] bottom-0 w-0.5 bg-[#E2E8F0]" />}
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center ${item.bg} flex-shrink-0 z-10`}>
                        <item.Icon size={14} className="text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-[#172554]">{event.description}</p>
                        <p className="text-[11px] font-medium text-[#94A3B8] mt-0.5">
                          {formatDate(event.occurredAt, { time: true })}
                        </p>
                      </div>
                    </div>
                  )
                }) : <p className="text-sm text-[#94A3B8]">No history.</p>}
              </div>
            </div>
          </div>
        )}
      </div>
      <CancelParcelModal open={cancelModalOpen} onClose={() => setCancelModalOpen(false)} parcel={parcel} />
    </AppShell>
  )
}