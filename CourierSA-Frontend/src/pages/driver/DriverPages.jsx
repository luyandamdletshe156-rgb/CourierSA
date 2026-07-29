import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import {
  StatCard, StatusPill, TrackingBadge,
  EmptyState, PageLoader, Modal, Alert
} from '@/components/ui'
import { deliveryApi } from '@/api'
import { Truck, CheckCircle, XCircle, Navigation, Phone, MapPin } from 'lucide-react'

export function DriverDeliveries() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['driver-deliveries'],
    queryFn:  deliveryApi.myDeliveries,
    refetchInterval: 60000,
  })

  const deliveries = data?.data ?? []

  const [deliveredModal, setDeliveredModal] = useState(null)
  const [failedModal, setFailedModal]       = useState(null)
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

  return (
    <AppShell title="My Deliveries">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Deliveries</h1>
          <p className="page-subtitle">{active.length} active · {completed.length} completed today</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Active"    value={active.length}    icon={Truck}        color="bg-brand-500" />
        <StatCard label="Delivered" value={completed.length} icon={CheckCircle}  color="bg-emerald-500" />
        <StatCard label="Failed"    value={deliveries.filter(d => d.status === 'Failed').length}
                  icon={XCircle} color="bg-red-500" />
      </div>

      {/* Active deliveries */}
      {isLoading ? <PageLoader /> : active.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={Truck}
            title="No active deliveries"
            description="Your dispatcher will assign parcels to you shortly."
          />
        </div>
      ) : (
        <div className="space-y-3">
          {active.map(d => (
            <div key={d.id} className="card">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <TrackingBadge value={d.trackingNumber} />
                    <StatusPill status={d.status} />
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
                  <a
                    href={`https://maps.google.com/?q=${d.deliveryAddress}, ${d.city}`}
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
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

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