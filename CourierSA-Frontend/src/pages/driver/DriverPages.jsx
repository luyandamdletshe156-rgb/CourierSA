import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import {
  StatCard, StatusPill, TrackingBadge,
  EmptyState, PageLoader, Modal, Alert
} from '@/components/ui'
import { deliveryApi } from '@/api'
import { Truck, CheckCircle, XCircle, Navigation, Phone, MapPin, Info, Calendar } from 'lucide-react'

export function DriverDeliveries() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['driver-deliveries'],
    queryFn:  deliveryApi.myDeliveries,
    refetchInterval: 60000,
  })

  const deliveries = data?.data ?? []

  // Active Tab State: 'active' | 'delivered' | 'failed'
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

  const currentList = activeTab === 'active' ? active : activeTab === 'delivered' ? completed : failed

  return (
    <AppShell title="My Deliveries">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Deliveries</h1>
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
          onClick={() => setActiveTab('delivered')}
          className={`text-left transition-all ${activeTab === 'delivered' ? 'ring-2 ring-emerald-500 rounded-xl' : 'opacity-80 hover:opacity-100'}`}
        >
          <StatCard label="Delivered" value={completed.length} icon={CheckCircle} color="bg-emerald-500" />
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
          onClick={() => setActiveTab('delivered')}
          className={`py-2 px-4 font-medium text-sm border-b-2 ${
            activeTab === 'delivered'
              ? 'border-emerald-500 text-emerald-600 font-semibold'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Delivered ({completed.length})
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
            icon={activeTab === 'active' ? Truck : activeTab === 'delivered' ? CheckCircle : XCircle}
            title={`No ${activeTab} deliveries`}
            description={
              activeTab === 'active'
                ? "Your dispatcher will assign parcels to you shortly."
                : `Parcels marked as ${activeTab} will appear here.`
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
                    {/* Click tracking number to view full parcel details */}
                    <button
                      onClick={() => setDetailModal(d)}
                      className="hover:scale-105 transition-transform text-left cursor-pointer"
                      title="Click for full details"
                    >
                      <TrackingBadge value={d.trackingNumber} />
                    </button>
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
                        Delivered
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

      {/* PARCEL DETAILS MODAL (Opened by touching tracking number) */}
      <Modal
        open={!!detailModal}
        onClose={() => setDetailModal(null)}
        title="Delivery Details"
        size="md"
      >
        {detailModal && (
          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between pb-3 border-b">
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

            <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded-lg border">
              <div>
                <p className="text-xs text-gray-500 font-semibold uppercase">Recipient</p>
                <p className="font-medium text-gray-800 mt-0.5">{detailModal.recipientName}</p>
                {detailModal.recipientPhone && (
                  <a href={`tel:${detailModal.recipientPhone}`} className="text-xs text-brand-500 hover:underline flex items-center gap-1 mt-1 font-medium">
                    <Phone size={12} /> {detailModal.recipientPhone}
                  </a>
                )}
              </div>

              <div>
                <p className="text-xs text-gray-500 font-semibold uppercase">Destination City</p>
                <p className="font-medium text-gray-800 mt-0.5">{detailModal.city}</p>
              </div>
            </div>

            <div>
              <p className="text-xs text-gray-500 font-semibold uppercase mb-1">Full Delivery Address</p>
              <p className="bg-gray-50 p-2.5 rounded border text-gray-800 font-medium flex items-start gap-2">
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

            <div className="grid grid-cols-2 gap-3 text-xs text-gray-600 border-t pt-3">
              <div>
                <span className="font-semibold text-gray-700">Fragile:</span> {detailModal.isFragile ? 'Yes ⚠' : 'No'}
              </div>
              {detailModal.dispatchedAt && (
                <div className="flex items-center gap-1">
                  <Calendar size={12} />
                  <span>Dispatched: {new Date(detailModal.dispatchedAt).toLocaleString()}</span>
                </div>
              )}
            </div>

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
              <button className="btn-secondary" onClick={() => setDetailModal(null)}>Close</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Mark delivered modal */}
      <Modal
        open={!!deliveredModal}
        onClose={() => setDeliveredModal(null)}
        title="Confirm delivery"
        size="sm"
      >
        <p className="text-sm text-gray-600 mb-4">
          Confirming delivery of{' '}
          <TrackingBadge value={deliveredModal?.trackingNumber} />{' '}
          to <strong>{deliveredModal?.recipientName}</strong>.
        </p>
        <label className="label">Notes (optional)</label>
        <textarea
          className="input h-20 resize-none"
          placeholder="e.g. Left with security, signed by J. Smith…"
          value={podNotes}
          onChange={e => setPodNotes(e.target.value)}
        />
        {deliveredMutation.error && <Alert message={deliveredMutation.error.message} className="mt-3" />}
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-secondary" onClick={() => setDeliveredModal(null)}>Cancel</button>
          <button
            className="btn-primary"
            disabled={deliveredMutation.isPending}
            onClick={() => deliveredMutation.mutate({ id: deliveredModal.id })}
          >
            <CheckCircle size={14} /> Confirm delivered
          </button>
        </div>
      </Modal>

      {/* Mark failed modal */}
      <Modal
        open={!!failedModal}
        onClose={() => setFailedModal(null)}
        title="Report failed delivery"
        size="sm"
      >
        <p className="text-sm text-gray-600 mb-4">
          <TrackingBadge value={failedModal?.trackingNumber} />
        </p>
        <label className="label">Reason</label>
        <select
          className="input mb-3"
          value={failReason}
          onChange={e => setFailReason(e.target.value)}
        >
          <option value="RecipientAbsent">Recipient absent</option>
          <option value="AddressNotFound">Address not found</option>
          <option value="AccessDenied">Access denied</option>
          <option value="ParcelDamaged">Parcel damaged</option>
          <option value="RefusedDelivery">Recipient refused delivery</option>
          <option value="Other">Other</option>
        </select>
        <label className="label">Notes</label>
        <textarea
          className="input h-20 resize-none"
          placeholder="Additional details…"
          value={failNotes}
          onChange={e => setFailNotes(e.target.value)}
        />
        {failedMutation.error && <Alert message={failedMutation.error.message} className="mt-3" />}
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-secondary" onClick={() => setFailedModal(null)}>Cancel</button>
          <button
            className="btn-danger"
            disabled={failedMutation.isPending}
            onClick={() => failedMutation.mutate({ id: failedModal.id })}
          >
            <XCircle size={14} /> Report failed
          </button>
        </div>
      </Modal>
    </AppShell>
  )
}