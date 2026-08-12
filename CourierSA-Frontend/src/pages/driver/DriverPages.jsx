import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import {
  StatCard, StatusPill, TrackingBadge,
  EmptyState, PageLoader, Modal, Alert
} from '@/components/ui'
import { deliveryApi, secureDeliveryApi, returnApi } from '@/api'
import StatusBadge from '@/components/ui/StatusBadge'
import { 
  Truck, CheckCircle, XCircle, Navigation, Phone, 
  MapPin, Info, Calendar, X, AlertCircle, Route as RouteIcon,
  ShieldCheck, ShieldAlert, Camera, PenTool, Image as ImageIcon, FileSignature,
  RotateCcw, PackageCheck
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
  
  // POD Upload State
  const [podImage, setPodImage]             = useState(null)
  const [podSignature, setPodSignature]     = useState(null)

  // ── OTP verification state (UC3/UC4 — high-value delivery security) ────────
  const [otpInput, setOtpInput]         = useState('')
  const [otpVerified, setOtpVerified]   = useState(false)
  const [otpError, setOtpError]         = useState('')

  const openDeliveredModal = (d) => {
    setDeliveredModal(d)
    setOtpInput('')
    setOtpVerified(false)
    setOtpError('')
    setPodImage(null)
    setPodSignature(null)
    setPodNotes('')
  }

  const openFailedModal = (d) => {
    setFailedModal(d)
    setFailReason('RecipientAbsent')
    setFailNotes('')
  }

  // FIXED: Passed as an object { otp: '1234' } to map properly to C# VerifyOtpDto
  const verifyOtpMutation = useMutation({
    mutationFn: (parcelId) => secureDeliveryApi.verifyOtp(parcelId, { otp: otpInput }),
    onSuccess: () => { setOtpVerified(true); setOtpError('') },
    onError: err => setOtpError(err?.message || 'Incorrect OTP.'),
  })

  const deliveredMutation = useMutation({
    mutationFn: ({ id }) => deliveryApi.markDelivered(id, {
      notes: podNotes,
      imagePath: podImage ? podImage.name : null,
      signaturePath: podSignature ? podSignature.name : null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['driver-deliveries'] })
      setDeliveredModal(null)
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

  // Dynamic failure reasons based on task type
  const failReasonsList = failedModal?.isPickup
    ? [
        { id: 'RecipientAbsent', label: 'Sender absent' },
        { id: 'AddressNotFound', label: 'Address not found' },
        { id: 'AccessDenied', label: 'Access denied' },
        { id: 'ParcelDamaged', label: 'Not ready / Damaged' },
        { id: 'RefusedDelivery', label: 'Refused to hand over' },
        { id: 'Other', label: 'Other' }
      ]
    : [
        { id: 'RecipientAbsent', label: 'Recipient absent' },
        { id: 'AddressNotFound', label: 'Address not found' },
        { id: 'AccessDenied', label: 'Access denied' },
        { id: 'ParcelDamaged', label: 'Parcel damaged' },
        { id: 'RefusedDelivery', label: 'Refused delivery' },
        { id: 'Other', label: 'Other' }
      ];

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
                    onFailed={() => openFailedModal(d)}
                  />
                ))}
              </div>
            </div>
          ))}

          {/* Ungrouped single-dispatch stops */}
          {ungrouped.map(d => (
            <DeliveryCard
              key={d.id}
              d={d}
              activeTab={activeTab}
              onDetail={() => setDetailModal(d)}
              onDelivered={() => openDeliveredModal(d)}
              onFailed={() => openFailedModal(d)}
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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-[#172554]/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="card w-full max-w-lg p-0 overflow-hidden shadow-2xl animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0">
            
            <div className="card-header px-6 pt-6 mb-0 pb-4 border-b border-[#D8E4F5] bg-[#F8FAFC]">
              <div>
                <h3 className="text-xl font-bold text-[#172554] tracking-tight">
                  Confirm {deliveredModal.isPickup ? 'Collection' : 'Delivery'}
                </h3>
                <p className="text-xs text-[#64748B] mt-1 font-mono">{deliveredModal.trackingNumber}</p>
              </div>
              <button 
                onClick={() => setDeliveredModal(null)}
                className="p-2 text-[#94A3B8] hover:text-[#EF4444] hover:bg-[#EF4444]/10 rounded-full transition-colors bg-white border border-[#D8E4F5]"
              >
                <X className="w-5 h-5" strokeWidth={2.5} />
              </button>
            </div>

            <div className="p-6 pt-5 max-h-[70vh] overflow-y-auto">
              {/* Recipient summary */}
              <div className="mb-5 flex items-start gap-3 p-3.5 bg-white border border-[#D8E4F5] rounded-xl shadow-sm">
                <div className="w-10 h-10 rounded-full bg-[#DCEEFF] text-[#0A3D91] flex items-center justify-center flex-shrink-0">
                  {deliveredModal.isPickup ? <Truck size={20} /> : <MapPin size={20} />}
                </div>
                <div>
                  <p className="text-xs text-[#64748B] font-semibold uppercase">{deliveredModal.isPickup ? 'Collecting from' : 'Delivering to'}</p>
                  <p className="font-bold text-[#172554] text-base">{deliveredModal.recipientName}</p>
                  <p className="text-xs text-[#64748B] mt-0.5">{deliveredModal.deliveryAddress}</p>
                </div>
              </div>

              {/* OTP verification gate — UC3/UC4 */}
              {!deliveredModal.isPickup && deliveredModal.requiresOtpVerification && !otpSatisfied && (
                <div className="mb-5 p-4 bg-[#FFFBEB] border border-[#FDE68A] rounded-xl shadow-sm">
                  <div className="flex items-center gap-2 text-[#D97706] font-bold text-sm mb-2">
                    <ShieldAlert size={18} /> High-value parcel security
                  </div>
                  <p className="text-xs text-[#92400E] mb-3 font-medium">
                    Ask the recipient for their 4-digit PIN to verify their identity.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text" 
                      inputMode="numeric"
                      // Visual spacing via letter-spacing (tracking). Actual characters remain just 4 digits.
                      className="input font-mono text-center text-xl tracking-[0.5em] flex-1 border-[#FDE68A] focus:border-[#D97706] focus:ring-[#D97706]/20 bg-white"
                      placeholder="••••"
                      value={otpInput}
                      onChange={e => {
                        // FIX: Safely strip all non-digits, THEN cut to 4 max. 
                        // Prevents pasting errors that previously triggered before replace()
                        const cleanStr = e.target.value.replace(/\D/g, '').slice(0, 4);
                        setOtpInput(cleanStr);
                      }}
                    />
                    <button
                      className="btn bg-[#D97706] text-white hover:bg-[#B45309]"
                      disabled={otpInput.length !== 4 || verifyOtpMutation.isPending}
                      onClick={() => verifyOtpMutation.mutate(deliveredModal.parcelId)}
                    >
                      {verifyOtpMutation.isPending ? 'Verifying…' : 'Verify'}
                    </button>
                  </div>
                  {otpError && <Alert type="error" message={otpError} className="mt-3" />}
                </div>
              )}

              {!deliveredModal.isPickup && deliveredModal.requiresOtpVerification && otpSatisfied && (
                <div className="mb-5 flex items-center gap-2 text-sm text-[#059669] bg-[#ECFDF5] border border-[#A7F3D0] rounded-xl px-4 py-3 font-medium shadow-sm">
                  <ShieldCheck size={18} /> Recipient identity verified
                </div>
              )}

              {/* Proof of Delivery (Photo & Signature) */}
              <div className="mb-5">
                <label className="label mb-2">Proof of {deliveredModal.isPickup ? 'Collection' : 'Delivery'}</label>
                <div className="grid grid-cols-2 gap-3">
                  
                  {/* Photo Upload Zone */}
                  <label className={`relative flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
                    podImage ? 'bg-[#ECFDF5] border-[#10B981] text-[#059669]' : 'bg-[#F8FAFC] border-[#CBD5E1] hover:border-[#0A3D91] hover:bg-[#F6FAFF] text-[#64748B]'
                  }`}>
                    {podImage ? <ImageIcon className="mb-2" size={24} /> : <Camera className="mb-2" size={24} />}
                    <span className={`text-xs font-bold ${podImage ? 'text-[#059669]' : 'text-[#172554]'}`}>
                      {podImage ? 'Photo Saved' : 'Capture Photo'}
                    </span>
                    <span className="text-[10px] mt-1 text-center px-1 truncate w-full">
                      {podImage ? podImage.name : 'Tap to open camera'}
                    </span>
                    <input type="file" className="hidden" accept="image/*" capture="environment" onChange={e => setPodImage(e.target.files[0])} />
                  </label>

                  {/* Signature Upload Zone */}
                  <label className={`relative flex flex-col items-center justify-center p-4 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
                    podSignature ? 'bg-[#ECFDF5] border-[#10B981] text-[#059669]' : 'bg-[#F8FAFC] border-[#CBD5E1] hover:border-[#0A3D91] hover:bg-[#F6FAFF] text-[#64748B]'
                  }`}>
                    {podSignature ? <FileSignature className="mb-2" size={24} /> : <PenTool className="mb-2" size={24} />}
                    <span className={`text-xs font-bold ${podSignature ? 'text-[#059669]' : 'text-[#172554]'}`}>
                      {podSignature ? 'Signature Saved' : 'Get Signature'}
                    </span>
                    <span className="text-[10px] mt-1 text-center px-1 truncate w-full">
                      {podSignature ? podSignature.name : 'Tap to sign pad'}
                    </span>
                    <input type="file" className="hidden" accept="image/*" onChange={e => setPodSignature(e.target.files[0])} />
                  </label>

                </div>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <label htmlFor="notes" className="label">
                  Additional Notes
                </label>
                <textarea 
                  id="notes"
                  className="input min-h-[80px] resize-none"
                  placeholder="e.g. Left with security, left at front door..."
                  value={podNotes}
                  onChange={e => setPodNotes(e.target.value)}
                ></textarea>
              </div>

              {deliveredMutation.error && (
                <Alert type="error" message={deliveredMutation.error.message} className="mt-4" />
              )}
            </div>

            <div className="flex items-center gap-3 px-6 py-4 bg-[#F8FAFC] border-t border-[#D8E4F5]">
              <button 
                onClick={() => setDeliveredModal(null)} 
                className="btn-secondary flex-1 py-3"
                disabled={deliveredMutation.isPending}
              >
                Cancel
              </button>
              <button 
                className={`btn-primary flex-[2] py-3 shadow-lg ${!otpSatisfied ? 'opacity-50' : 'hover:-translate-y-0.5'}`}
                disabled={deliveredMutation.isPending || !otpSatisfied}
                onClick={() => deliveredMutation.mutate({ id: deliveredModal.id })}
              >
                {deliveredMutation.isPending ? (
                  'Saving...'
                ) : (
                  <>
                    <CheckCircle size={18} />
                    Confirm & Complete
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* RE-DESIGNED REPORT FAILED MODAL */}
      {failedModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-[#172554]/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="card w-full max-w-lg p-0 overflow-hidden shadow-2xl animate-in slide-in-from-bottom-8 sm:slide-in-from-bottom-0">
            
            <div className="card-header px-6 pt-6 mb-0 pb-4 border-b border-[#FECACA] bg-[#FEF2F2]">
              <div>
                <h3 className="text-xl font-bold text-[#991B1B] tracking-tight flex items-center gap-2">
                  <AlertCircle className="w-5 h-5" />
                  Report Failed {failedModal.isPickup ? 'Pickup' : 'Delivery'}
                </h3>
                <p className="text-xs text-[#DC2626] mt-1 font-mono ml-7">{failedModal.trackingNumber}</p>
              </div>
              <button 
                onClick={() => setFailedModal(null)}
                className="p-2 text-[#F87171] hover:text-white hover:bg-[#EF4444] rounded-full transition-colors bg-white border border-[#FECACA]"
              >
                <X className="w-5 h-5" strokeWidth={2.5} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              
              {/* Quick-Select Failure Chips */}
              <div>
                <label className="label text-[#7F1D1D] mb-3">What went wrong?</label>
                <div className="flex flex-wrap gap-2">
                  {failReasonsList.map(r => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setFailReason(r.id)}
                      className={`px-3.5 py-2 text-xs font-bold rounded-lg border transition-all active:scale-95 ${
                        failReason === r.id
                          ? 'bg-[#EF4444] text-white border-[#EF4444] shadow-md shadow-[#EF4444]/20'
                          : 'bg-white text-[#475569] border-[#CBD5E1] hover:border-[#94A3B8] hover:bg-[#F8FAFC]'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label text-[#7F1D1D]" htmlFor="failed-notes">Additional details</label>
                <textarea 
                  id="failed-notes"
                  className="input min-h-[100px] resize-none focus:border-[#EF4444] focus:ring-[#EF4444]/20"
                  placeholder={`Describe why the ${failedModal.isPickup ? 'pickup' : 'delivery'} couldn't be completed...`}
                  value={failNotes}
                  onChange={e => setFailNotes(e.target.value)}
                ></textarea>
              </div>

              {failedMutation.error && (
                <Alert type="error" message={failedMutation.error.message} className="mt-2" />
              )}
            </div>

            <div className="flex items-center gap-3 px-6 py-4 bg-[#FEF2F2] border-t border-[#FECACA]">
              <button 
                onClick={() => setFailedModal(null)} 
                className="btn-secondary flex-1 py-3 border-[#FECACA] text-[#991B1B] hover:bg-white"
                disabled={failedMutation.isPending}
              >
                Cancel
              </button>
              <button 
                className="btn-danger flex-[2] py-3 shadow-lg hover:-translate-y-0.5"
                disabled={failedMutation.isPending}
                onClick={() => failedMutation.mutate({ id: failedModal.id })}
              >
                <XCircle size={18} /> 
                {failedMutation.isPending ? 'Reporting...' : 'Confirm Failure'}
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
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
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
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-700 rounded-full">
                Pickup
              </span>
            )}
            {!d.isPickup && d.requiresOtpVerification && (
              <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full flex items-center gap-1 ${
                d.otpVerified ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
              }`}>
                {d.otpVerified ? <ShieldCheck size={11} /> : <ShieldAlert size={11} />}
                {d.otpVerified ? 'OTP verified' : 'OTP required'}
              </span>
            )}
            <StatusPill status={d.status} />
          </div>

          <div className="flex items-start gap-1.5 text-sm text-gray-600 mb-1">
            <MapPin size={14} className="mt-1 text-gray-400 flex-shrink-0" />
            <div>
              <span className="font-bold text-gray-900 text-base">
                {d.recipientName}
              </span>
              <br />
              <span className="text-gray-500">{d.deliveryAddress}, {d.city}</span>
            </div>
          </div>

          {d.recipientPhone && (
            <a
              href={`tel:${d.recipientPhone}`}
              className="inline-flex items-center gap-1.5 text-xs text-brand-600 hover:text-brand-700 font-semibold mt-1 bg-brand-50 px-2 py-1 rounded-md"
            >
              <Phone size={12} />
              {d.recipientPhone}
            </a>
          )}

          {d.specialInstructions && (
            <p className="mt-3 text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200 font-medium">
              ⚠ {d.specialInstructions}
            </p>
          )}
        </div>

        <div className="flex flex-row sm:flex-col gap-2 flex-shrink-0 mt-2 sm:mt-0 w-full sm:w-auto">
          {activeTab === 'active' && (
            <>
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(`${d.deliveryAddress}, ${d.city}`)}`}
                target="_blank"
                rel="noreferrer"
                className="btn-secondary btn-sm flex-1 sm:flex-none"
              >
                <Navigation size={13} />
                Nav
              </a>
              <button
                className="btn-primary btn-sm flex-1 sm:flex-none"
                onClick={onDelivered}
              >
                <CheckCircle size={13} />
                {d.isPickup ? 'Collect' : 'Deliver'}
              </button>
              <button
                className="btn-danger btn-sm flex-1 sm:flex-none"
                onClick={onFailed}
              >
                <XCircle size={13} />
                Fail
              </button>
            </>
          )}

          {activeTab !== 'active' && (
            <button
              className="btn-secondary btn-sm w-full"
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

// ── Return Collections — reverse-leg pickups assigned to this driver.
//    Kept intentionally simple: a flat list, no route grouping, since these
//    are single standalone collections rather than multi-stop routes. ─────────
export function DriverReturnCollections() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['driver-return-collections'],
    queryFn: returnApi.myCollections,
    refetchInterval: 30000,
  })

  const extractItems = (d) => Array.isArray(d) ? d : d?.data?.items ?? d?.items ?? d?.data ?? []
  const collections = extractItems(data)

  const dispatched = collections.filter(r => r.status === 'Dispatched')
  const collected = collections.filter(r => r.status === 'Collected')

  const collectMutation = useMutation({
    mutationFn: (id) => returnApi.markCollected(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['driver-return-collections'] }),
  })

  return (
    <AppShell title="Return Collections">
      <div className="page-header">
        <div>
          <h1 className="page-title">Return Collections</h1>
          <p className="page-subtitle">{dispatched.length} to collect · {collected.length} in transit to warehouse</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <StatCard label="To Collect" value={dispatched.length} icon={RotateCcw} color="bg-brand-500" />
        <StatCard label="In Transit" value={collected.length} icon={PackageCheck} color="bg-emerald-500" />
      </div>

      {collectMutation.error && (
        <Alert type="error" message={collectMutation.error.message} className="mb-4" />
      )}

      {isLoading ? (
        <PageLoader />
      ) : collections.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={RotateCcw}
            title="No return collections"
            description="Your dispatcher will assign return collections to you when a customer return is approved."
          />
        </div>
      ) : (
        <div className="space-y-4">
          {collections.map(r => (
            <div key={r.id} className="card p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-gray-900">{r.raNumber}</span>
                    <TrackingBadge value={r.trackingNumber} />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{r.reason}</p>
                </div>
                <StatusBadge status={r.status} />
              </div>

              {r.collectionAddress && (
                <div className="flex items-start gap-2 text-xs text-gray-600 bg-gray-50 rounded-lg p-3 border border-gray-100">
                  <MapPin size={14} className="text-gray-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-gray-700">{r.collectionAddress.recipientName}</p>
                    <p>{r.collectionAddress.streetAddress}, {r.collectionAddress.suburb}</p>
                    <p>{r.collectionAddress.city}, {r.collectionAddress.postalCode}</p>
                    {r.collectionAddress.recipientPhone && (
                      <p className="flex items-center gap-1 mt-1"><Phone size={11} /> {r.collectionAddress.recipientPhone}</p>
                    )}
                  </div>
                </div>
              )}

              {r.status === 'Dispatched' && (
                <button
                  className="btn-primary btn-sm w-full justify-center"
                  disabled={collectMutation.isPending}
                  onClick={() => collectMutation.mutate(r.id)}
                >
                  <PackageCheck size={14} />
                  {collectMutation.isPending ? 'Confirming...' : 'Confirm Collected'}
                </button>
              )}

              {r.status === 'Collected' && (
                <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2">
                  Collected — deliver to the warehouse for intake.
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </AppShell>
  )
}