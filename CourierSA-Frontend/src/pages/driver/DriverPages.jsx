import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import {
  StatCard, StatusPill, TrackingBadge,
  EmptyState, PageLoader, Modal, Alert
} from '@/components/ui'
import { deliveryApi } from '@/api'
import { 
  Truck, CheckCircle, XCircle, Navigation, Phone, 
  MapPin, Info, Calendar, X, AlertCircle 
} from 'lucide-react'

export function DriverDeliveries() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['driver-deliveries'],
    queryFn:  deliveryApi.myDeliveries,
    refetchInterval: 60000,
  })

  const deliveries = data?.data ?? []

  // Active Tab State: 'active' | 'completed' | 'failed'
  const [activeTab, setActiveTab]           = useState('active')

  // Modal States
  const [deliveredModal, setDeliveredModal] = useState(null)
  const [failedModal, setFailedModal]       = useState(null)
  const [detailModal, setDetailModal]       = useState(null)

  // Form States
  const [podNotes, setPodNotes]             = useState('')
  const [failReason, setFailReason]         = useState('RecipientAbsent')
  const [failNotes, setFailNotes]           = useState('')

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

  return (
    <AppShell title="My Deliveries">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Tasks</h1>
          <p className="page-subtitle">{active.length} active · {completed.length} completed today</p>
        </div>
      </div>

      {/* Interactive Stat Cards / Quick Filter */}
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

      {/* Tab Navigation Buttons */}
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

      {/* Deliveries List */}
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
        <div className="space-y-3">
          {currentList.map(d => (
            <div key={d.id} className="card hover:border-gray-300 transition-all">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <button
                      onClick={() => setDetailModal(d)}
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
                    <StatusPill status={d.status} />
                    <button
                      onClick={() => setDetailModal(d)}
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
                        onClick={() => setDeliveredModal(d)}
                      >
                        <CheckCircle size={13} />
                        {d.isPickup ? 'Collected' : 'Delivered'}
                      </button>
                      <button
                        className="btn-danger btn-sm"
                        onClick={() => setFailedModal(d)}
                      >
                        <XCircle size={13} />
                        Failed
                      </button>
                    </>
                  )}

                  {activeTab !== 'active' && (
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => setDetailModal(d)}
                    >
                      <Info size={13} />
                      View Details
                    </button>
                  )}
                </div>
              </div>
            </div>
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
                disabled={deliveredMutation.isPending}
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