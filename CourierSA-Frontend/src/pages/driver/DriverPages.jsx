import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import {
  StatCard, StatusPill, TrackingBadge,
  EmptyState, PageLoader, Modal, Alert
} from '@/components/ui'
import { deliveryApi, secureDeliveryApi } from '@/api'
import { 
  Truck, CheckCircle, XCircle, Navigation, Phone, 
  MapPin, Info, Calendar, X, AlertCircle, Route as RouteIcon,
  ShieldCheck, ShieldAlert
} from 'lucide-react'

// ── Groups a list of deliveries by routeId. Items with no routeId (single
//    dispatches) are returned separately and render flat, unchanged. ──────────
function groupByRoute(list) {
  const groups = new Map()
  const ungrouped = []

  for (const d of list) {
    if (d.routeId) {
      if (!groups.has(d.routeId)) groups.set(d.routeId, [])
      groups.get(d.routeId).push(d)
    } else {
      ungrouped.push(d)
    }
  }

  return { groups, ungrouped }
}

export function DriverDeliveries() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['driver-deliveries'],
    queryFn:  deliveryApi.myDeliveries,
    refetchInterval: 60000,
  })

  const deliveries = data?.data ?? []

  const [activeTab, setActiveTab]           = useState('active')
  const [deliveredModal, setDeliveredModal] = useState(null)
  const [failedModal, setFailedModal]       = useState(null)
  const [detailModal, setDetailModal]       = useState(null)
  const [podNotes, setPodNotes]             = useState('')
  const [failReason, setFailReason]         = useState('RecipientAbsent')
  const [failNotes, setFailNotes]           = useState('')

  // ── OTP verification state (UC3/UC4 — high-value delivery security) ────────
  const [otpInput, setOtpInput]         = useState('')
  const [otpVerified, setOtpVerified]   = useState(false)
  const [otpError, setOtpError]         = useState('')

  const openDeliveredModal = (d) => {
    setDeliveredModal(d)
    setOtpInput('')
    setOtpVerified(false)
    setOtpError('')
  }

  const verifyOtpMutation = useMutation({
    mutationFn: (parcelId) => secureDeliveryApi.verifyOtp(parcelId, otpInput.trim()),
    onSuccess: () => { setOtpVerified(true); setOtpError('') },
    onError: err => setOtpError(err?.message || 'Incorrect OTP.'),
  })

  const deliveredMutation = useMutation({
    mutationFn: ({ id }) => deliveryApi.markDelivered(id, {
      notes: podNotes,
      imagePath: null,
      signaturePath: null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['driver-deliveries'] })
      setDeliveredModal(null)
      setPodNotes('')
    },
  })

  const failedMutation = useMutation({
    mutationFn: ({ id }) => deliveryApi.markFailed(id, {
      reason: failReason,
      notes: failNotes,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['driver-deliveries'] })
      setFailedModal(null)
      setFailNotes('')
    },
  })

  const active    = deliveries.filter(d => d.status !== 'Delivered' && d.status !== 'Failed')
  const completed = deliveries.filter(d => d.status === 'Delivered')
  const failed    = deliveries.filter(d => d.status === 'Failed')

  const currentList = activeTab === 'active' ? active : activeTab === 'completed' ? completed : failed
  const { groups, ungrouped } = groupByRoute(currentList)

  const otpSatisfied = deliveredModal && (
    deliveredModal.isPickup ||
    !deliveredModal.requiresOtpVerification ||
    deliveredModal.otpVerified ||
    otpVerified
  )

  return (
    <AppShell title="My Deliveries">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Tasks</h1>
          <p className="page-subtitle">{active.length} active · {completed.length} completed today</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        <button
          onClick={() => setActiveTab('active')}
          className={`text-left transition-all ${activeTab === 'active' ? 'ring-2 ring-brand-500 rounded-xl' : 'opacity-80 hover:opacity-100'}`}
        >
          <StatCard label="Active" value={active.length} icon={Truck} color="bg-brand-500" />
        </button>

        <button
          onClick={() => setActiveTab('completed')}
          className={`text-left transition-all ${activeTab === 'completed' ? 'ring-2 ring-emerald-500 rounded-xl' : 'opacity-80 hover:opacity-100'}`}
        >
          <StatCard label="Completed" value={completed.length} icon={CheckCircle} color="bg-emerald-500" />
        </button>

        <button
          onClick={() => setActiveTab('failed')}
          className={`text-left transition-all ${activeTab === 'failed' ? 'ring-2 ring-red-500 rounded-xl' : 'opacity-80 hover:opacity-100'}`}
        >
          <StatCard label="Failed" value={failed.length} icon={XCircle} color="bg-red-500" />
        </button>
      </div>

      <div className="flex border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab('active')}
          className={`py-2 px-4 font-medium text-sm border-b-2 ${
            activeTab === 'active'
              ? 'border-brand-500 text-brand-600 font-semibold'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Active ({active.length})
        </button>
        <button
          onClick={() => setActiveTab('completed')}
          className={`py-2 px-4 font-medium text-sm border-b-2 ${
            activeTab === 'completed'
              ? 'border-emerald-500 text-emerald-600 font-semibold'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Completed ({completed.length})
        </button>
        <button
          onClick={() => setActiveTab('failed')}
          className={`py-2 px-4 font-medium text-sm border-b-2 ${
            activeTab === 'failed'
              ? 'border-red-500 text-red-600 font-semibold'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Failed ({failed.length})
        </button>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : currentList.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={activeTab === 'active' ? Truck : activeTab === 'completed' ? CheckCircle : XCircle}
            title={`No ${activeTab} tasks`}
            description={
              activeTab === 'active'
                ? "Your dispatcher will assign tasks to you shortly."
                : `Tasks marked as ${activeTab} will appear here.`
            }
          />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Grouped route stops */}
          {[...groups.entries()].map(([routeId, stops]) => (
            <div key={routeId} className="rounded-2xl border-2 border-brand-200 bg-brand-50/40 p-3">
              <div className="flex items-center gap-2 px-2 py-1.5 mb-2">
                <RouteIcon size={15} className="text-brand-600" />
                <span className="text-xs font-bold text-brand-700 uppercase tracking-wide">
                  Route · {stops.length} stop{stops.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="space-y-3">
                {stops.map((d, i) => (
                  <DeliveryCard
                    key={d.id}
                    d={d}
                    stopNumber={i + 1}
                    activeTab={activeTab}
                    onDetail={() => setDetailModal(d)}
                    onDelivered={() => openDeliveredModal(d)}
                    onFailed={() => setFailedModal(d)}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Ungrouped single-dispatch stops — unchanged flat rendering */}
          {ungrouped.map(d => (
            <DeliveryCard
              key={d.id}
              d={d}
              activeTab={activeTab}
              onDetail={() => setDetailModal(d)}
              onDelivered={() => openDeliveredModal(d)}
              onFailed={() => setFailedModal(d)}
            />
          ))}
        </div>
      )}

      {/* PARCEL DETAILS MODAL */}
      <Modal
        open={!!detailModal}
        onClose={() => setDetailModal(null)}
        title={detailModal?.isPickup ? "Pickup Details" : "Delivery Details"}
        size="md"
      >
        {detailModal && (
          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between pb-3 border-b border-[#D8E4F5]">
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Tracking Number</p>
                <div className="mt-1">
                  <TrackingBadge value={detailModal.trackingNumber} />
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Status</p>
                <StatusPill status={detailModal.status} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded-lg border border-[#D8E4F5]">
              <div>
                <p className="text-xs text-gray-500 font-semibold uppercase">Contact</p>
                <p className="font-medium text-gray-800 mt-0.5">{detailModal.recipientName}</p>
                {detailModal.recipientPhone && (
                  <a href={`tel:${detailModal.recipientPhone}`} className="text-xs text-brand-500 hover:underline flex items-center gap-1 mt-1 font-medium">
                    <Phone size={12} /> {detailModal.recipientPhone}
                  </a>
                )}
              </div>

              <div>
                <p className="text-xs text-gray-500 font-semibold uppercase">{detailModal.isPickup ? 'Pickup City' : 'Destination City'}</p>
                <p className="font-medium text-gray-800 mt-0.5">{detailModal.city}</p>
              </div>
            </div>

            {detailModal.routeId && (
              <div className="flex items-center gap-2 text-xs text-brand-700 bg-brand-50 border border-brand-200 rounded-lg px-3 py-2">
                <RouteIcon size={13} /> Part of a multi-stop route
              </div>
            )}

            {!detailModal.isPickup && detailModal.requiresOtpVerification && (
              <div className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 border ${
                detailModal.otpVerified
                  ? 'text-[#047857] bg-[#10B981]/10 border-[#10B981]/20'
                  : 'text-[#B45309] bg-[#F59E0B]/10 border-[#F59E0B]/20'
              }`}>
                {detailModal.otpVerified ? <ShieldCheck size={13} /> : <ShieldAlert size={13} />}
                {detailModal.otpVerified ? 'Recipient identity verified' : 'High-value — OTP verification required before delivery'}
              </div>
            )}

            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase mb-1">Full {detailModal.isPickup ? 'Pickup' : 'Delivery'} Address</p>
              <p className="bg-gray-50 p-2.5 rounded border border-[#D8E4F5] text-gray-800 font-medium flex items-start gap-2">
                <MapPin size={16} className="text-brand-500 mt-0.5 flex-shrink-0" />
                <span>{detailModal.deliveryAddress}, {detailModal.city}</span>
              </p>
            </div>

            {detailModal.specialInstructions && (
              <div>
                <p className="text-xs text-amber-800 font-semibold uppercase mb-1">Special Instructions</p>
                <p className="bg-amber-50 text-amber-900 p-2.5 rounded border border-amber-200">
                  ⚠ {detailModal.specialInstructions}
                </p>
              </div>
            )}

            <div className="flex justify-between items-center pt-2">
              {/* FIXED: Missing opening <a tag added here */}
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(`${detailModal.deliveryAddress}, ${detailModal.city}`)}`}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary btn-sm"
              >
                <Navigation size={13} />
                Open Navigation
              </a>
              <button className="btn-secondary btn-sm" onClick={() => setDetailModal(null)}>Close</button>
            </div>
          </div>
        )}
      </Modal>

      {/* RE-DESIGNED CONFIRM COMPLETION MODAL */}
      {deliveredModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#172554]/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="card w-full max-w-lg p-0 overflow-hidden shadow-2xl">
            
            <div className="card-header px-6 pt-6 mb-0 pb-4 border-b border-[#D8E4F5]">
              <h3 className="text-xl font-bold text-[#172554] tracking-tight">
                Confirm {deliveredModal.isPickup ? 'pickup' : 'delivery'}
              </h3>
              <button 
                onClick={() => setDeliveredModal(null)}
                className="p-2 text-[#94A3B8] hover:text-[#EF4444] hover:bg-[#EF4444]/10 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" strokeWidth={2.5} />
              </button>
            </div>

            <div className="p-6 pt-5">
              <div className="mb-6 p-4 bg-[#F6FAFF] border border-[#D8E4F5] rounded-xl flex flex-wrap gap-2 items-center">
                <span className="text-sm text-[#64748B]">Confirming {deliveredModal.isPickup ? 'collection' : 'delivery'} of</span>
                <span className="tracking-number">{deliveredModal.trackingNumber}</span>
                <span className="text-sm text-[#64748B]">{deliveredModal.isPickup ? 'from' : 'to'}</span>
                <strong className="text-[#172554] font-bold">{deliveredModal.recipientName}</strong>.
              </div>

              {/* OTP verification gate — UC3/UC4 high-value delivery security */}
              {!deliveredModal.isPickup && deliveredModal.requiresOtpVerification && !otpSatisfied && (
                <div className="mb-5 p-4 bg-[#F59E0B]/10 border border-[#F59E0B]/20 rounded-xl">
                  <div className="flex items-center gap-2 text-[#B45309] font-bold text-sm mb-2">
                    <ShieldAlert size={16} /> High-value parcel — OTP required
                  </div>
                  <p className="text-xs text-[#64748B] mb-3">
                    Ask the recipient for their 4-digit OTP before completing this delivery.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text" maxLength={4} inputMode="numeric"
                      className="input font-mono text-center text-lg tracking-widest flex-1"
                      placeholder="0000"
                      value={otpInput}
                      onChange={e => setOtpInput(e.target.value.replace(/\D/g, ''))}
                    />
                    <button
                      className="btn-secondary"
                      disabled={otpInput.length !== 4 || verifyOtpMutation.isPending}
                      onClick={() => verifyOtpMutation.mutate(deliveredModal.parcelId)}
                    >
                      {verifyOtpMutation.isPending ? 'Verifying…' : 'Verify'}
                    </button>
                  </div>
                  {otpError && <Alert message={otpError} className="mt-2" />}
                </div>
              )}

              {!deliveredModal.isPickup && deliveredModal.requiresOtpVerification && otpSatisfied && (
                <div className="mb-5 flex items-center gap-2 text-sm text-[#047857] bg-[#10B981]/10 border border-[#10B981]/20 rounded-xl px-4 py-2.5">
                  <ShieldCheck size={15} /> Recipient identity verified
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="notes" className="label">
                  Notes (optional)
                </label>
                <textarea 
                  id="notes"
                  className="input min-h-[120px] resize-none"
                  placeholder="e.g. Left with security, signed by J. Smith..."
                  value={podNotes}
                  onChange={e => setPodNotes(e.target.value)}
                ></textarea>
              </div>

              {deliveredMutation.error && (
                <Alert message={deliveredMutation.error.message} className="mt-4" />
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-[#F6FAFF]/50 border-t border-[#D8E4F5]">
              <button 
                onClick={() => setDeliveredModal(null)} 
                className="btn-secondary"
                disabled={deliveredMutation.isPending}
              >
                Cancel
              </button>
              <button 
                className="btn-primary"
                disabled={deliveredMutation.isPending || !otpSatisfied}
                onClick={() => deliveredMutation.mutate({ id: deliveredModal.id })}
              >
                <CheckCircle size={16} />
                {deliveredMutation.isPending ? 'Confirming...' : (deliveredModal.isPickup ? 'Confirm collected' : 'Confirm delivered')}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* RE-DESIGNED REPORT FAILED MODAL */}
      {failedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#172554]/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="card w-full max-w-lg p-0 overflow-hidden shadow-2xl">
            
            <div className="card-header px-6 pt-6 mb-0 pb-4 border-b border-[#EF4444]/20">
              <h3 className="text-xl font-bold text-[#172554] tracking-tight flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-[#EF4444]/10 text-[#EF4444] flex items-center justify-center">
                  <AlertCircle className="w-5 h-5" />
                </span>
                Report failed {failedModal.isPickup ? 'pickup' : 'delivery'}
              </h3>
              <button 
                onClick={() => setFailedModal(null)}
                className="p-2 text-[#94A3B8] hover:text-[#EF4444] hover:bg-[#EF4444]/10 rounded-lg transition-colors"
              >
                <X className="w-5 h-5" strokeWidth={2.5} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-[#172554]">Parcel:</span>
                <span className="tracking-number">{failedModal.trackingNumber}</span>
              </div>

              <div>
                <label className="label" htmlFor="reason">Reason</label>
                <div className="relative">
                  <select 
                    id="reason" 
                    className="input appearance-none pr-10 cursor-pointer"
                    value={failReason}
                    onChange={e => setFailReason(e.target.value)}
                  >
                    <option value="RecipientAbsent">{failedModal.isPickup ? 'Sender absent' : 'Recipient absent'}</option>
                    <option value="AddressNotFound">Address not found</option>
                    <option value="AccessDenied">Access denied</option>
                    <option value="ParcelDamaged">{failedModal.isPickup ? 'Parcel not ready/damaged' : 'Parcel damaged'}</option>
                    <option value="RefusedDelivery">{failedModal.isPickup ? 'Sender refused to hand over' : 'Recipient refused delivery'}</option>
                    <option value="Other">Other</option>
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-[#94A3B8]">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                  </div>
                </div>
              </div>

              <div>
                <label className="label" htmlFor="failed-notes">Notes</label>
                <textarea 
                  id="failed-notes"
                  className="input min-h-[100px] resize-none"
                  placeholder={`Additional details about why the ${failedModal.isPickup ? 'pickup' : 'delivery'} failed...`}
                  value={failNotes}
                  onChange={e => setFailNotes(e.target.value)}
                ></textarea>
              </div>

              {failedMutation.error && (
                <Alert message={failedMutation.error.message} className="mt-2" />
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-[#F6FAFF]/50 border-t border-[#D8E4F5]">
              <button 
                onClick={() => setFailedModal(null)} 
                className="btn-secondary"
                disabled={failedMutation.isPending}
              >
                Cancel
              </button>
              <button 
                className="btn-danger"
                disabled={failedMutation.isPending}
                onClick={() => failedMutation.mutate({ id: failedModal.id })}
              >
                <X className="w-4 h-4" strokeWidth={2.5} /> 
                {failedMutation.isPending ? 'Reporting...' : 'Report failed'}
              </button>
            </div>

          </div>
        </div>
      )}
    </AppShell>
  )
}

// ── Single delivery card — used for both grouped-route stops and ungrouped
//    (single-dispatch) items, so the markup and actions are identical either way.
function DeliveryCard({ d, stopNumber, activeTab, onDetail, onDelivered, onFailed }) {
  return (
    <div className="card hover:border-gray-300 transition-all">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            {stopNumber && (
              <span className="w-5 h-5 rounded-full bg-brand-500 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                {stopNumber}
              </span>
            )}
            <button
              onClick={onDetail}
              className="hover:scale-105 transition-transform text-left cursor-pointer"
              title="Click for full details"
            >
              <TrackingBadge value={d.trackingNumber} />
            </button>
            {d.isPickup && (
              <span className="px-2 py-0.5 text-xs font-semibold bg-purple-100 text-purple-700 rounded-full">
                Pickup
              </span>
            )}
            {!d.isPickup && d.requiresOtpVerification && (
              <span className={`px-2 py-0.5 text-xs font-semibold rounded-full flex items-center gap-1 ${
                d.otpVerified ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {d.otpVerified ? <ShieldCheck size={11} /> : <ShieldAlert size={11} />}
                {d.otpVerified ? 'OTP verified' : 'OTP required'}
              </span>
            )}
            <StatusPill status={d.status} />
            <button
              onClick={onDetail}
              className="text-xs text-brand-500 hover:underline flex items-center gap-1 font-medium ml-1"
            >
              <Info size={13} /> Details
            </button>
          </div>

          <div className="flex items-start gap-1.5 text-sm text-gray-600 mb-1">
            <MapPin size={14} className="mt-0.5 text-gray-400 flex-shrink-0" />
            <div>
              <span className="font-medium text-gray-800">
                {d.recipientName}
              </span>
              <br />
              {d.deliveryAddress}, {d.city}
            </div>
          </div>

          {d.recipientPhone && (
            <a
              href={`tel:${d.recipientPhone}`}
              className="inline-flex items-center gap-1.5 text-xs text-brand-500 hover:text-brand-600 font-medium"
            >
              <Phone size={12} />
              {d.recipientPhone}
            </a>
          )}

          {d.specialInstructions && (
            <p className="mt-2 text-xs text-amber-700 bg-amber-50 px-2.5 py-1.5 rounded border border-amber-200">
              ⚠ {d.specialInstructions}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2 flex-shrink-0">
          {activeTab === 'active' && (
            <>
              {/* FIXED: Missing opening <a tag added here */}
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(`${d.deliveryAddress}, ${d.city}`)}`}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary btn-sm"
              >
                <Navigation size={13} />
                Navigate
              </a>
              <button
                className="btn-primary btn-sm"
                onClick={onDelivered}
              >
                <CheckCircle size={13} />
                {d.isPickup ? 'Collected' : 'Delivered'}
              </button>
              <button
                className="btn-danger btn-sm"
                onClick={onFailed}
              >
                <XCircle size={13} />
                Failed
              </button>
            </>
          )}

          {activeTab !== 'active' && (
            <button
              className="btn-secondary btn-sm"
              onClick={onDetail}
            >
              <Info size={13} />
              View Details
            </button>
          )}
        </div>
      </div>
    </div>
  )
}