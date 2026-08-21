import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { StatCard, StatusPill, TrackingBadge, EmptyState, PageLoader, Modal, Alert } from '@/components/ui'
import api, { parcelApi, driverApi, deliveryApi } from '@/api'
import { AlertTriangle, RotateCcw, Truck, XCircle, CheckCircle, ShieldQuestion } from 'lucide-react'
import { formatDate } from '@/utils'
import clsx from 'clsx'

// Reason labels — legacy generic values (kept for old records) plus the
// SRS-aligned UC03 (pickup) / UC04 (delivery) values the driver app now submits.
const FAILURE_LABELS = {
  // Legacy
  RecipientAbsent:    'Recipient absent',
  AddressNotFound:    'Address not found',
  AccessDenied:       'Access denied',
  ParcelDamaged:      'Parcel damaged',
  RefusedDelivery:    'Refused delivery',
  InsufficientPayment:'Insufficient payment',
  Other:              'Other',
  // UC03 — pickup
  SenderUnavailable:          'Sender unavailable',
  ParcelNotReady:             'Parcel not ready',
  IncorrectCollectionAddress: 'Incorrect collection address',
  ParcelInformationMismatch:  'Parcel information mismatch',
  // UC04 — delivery
  RecipientUnavailable:   'Recipient unavailable',
  IncorrectAddress:       'Incorrect address',
  RestrictedAccess:       'Restricted access',
  RecipientRefusedParcel: 'Recipient refused parcel',
}

// System-recommended next action (UC03/UC04 engine), for the dispatcher's queue.
const ACTION_LABELS = {
  NotifyCustomerToReschedule:  'Customer notified to reschedule',
  AutoRescheduleNextAttempt:   'Eligible for auto re-attempt',
  EscalateForAddressCorrection:'Needs address correction',
  EscalateForAccessArrangement:'Needs access arrangement',
  RouteToReturnToSender:       'Route to return-to-sender',
  RequiresManualReview:        'Needs manual triage',
}

export default function FailedDeliveriesPage() {
  const qc = useQueryClient()
  const [reDispatchModal, setReDispatchModal] = useState(null)
  const [returnModal, setReturnModal]         = useState(null)
  const [resolveModal, setResolveModal]       = useState(null)
  const [selectedDriver, setSelectedDriver]   = useState('')
  const [returnNotes, setReturnNotes]         = useState('')
  const [resolutionLabel, setResolutionLabel] = useState('')
  const [resolutionNotes, setResolutionNotes] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['failed-deliveries'],
    queryFn:  () => api.get('/deliveries/failed'),
    refetchInterval: 60000,
  })

  const { data: driversData } = useQuery({
    queryKey: ['available-drivers'],
    queryFn:  () => driverApi.available(),
    staleTime: 30000,
  })

  const failed           = data?.data ?? []
  const availableDrivers = driversData?.data ?? []

  const reDispatchMutation = useMutation({
    mutationFn: ({ parcelId, driverId }) => parcelApi.dispatch(parcelId, driverId),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['failed-deliveries'] })
      qc.invalidateQueries({ queryKey: ['available-drivers'] })
      setReDispatchModal(null)
      setSelectedDriver('')
    },
  })

  const returnMutation = useMutation({
    mutationFn: ({ parcelId }) => api.put(`/parcels/${parcelId}/return`, { notes: returnNotes }),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['failed-deliveries'] })
      setReturnModal(null)
      setReturnNotes('')
    },
  })

  // UC03/UC04 — dispatcher clears a flagged exception once they've acted on it
  // (re-dispatched, corrected the address, arranged access, routed to return).
  const resolveMutation = useMutation({
    mutationFn: () => deliveryApi.resolveEscalation(resolveModal.id, {
      resolution: resolutionLabel || 'Reviewed',
      notes: resolutionNotes,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['failed-deliveries'] })
      setResolveModal(null)
      setResolutionLabel('')
      setResolutionNotes('')
    },
  })

  const openResolveModal = (d) => {
    setResolveModal(d)
    setResolutionLabel(ACTION_LABELS[d.recommendedAction] ?? 'Reviewed')
    setResolutionNotes('')
  }

  const totalFailed   = failed.length
  const escalated     = failed.filter(d => d.requiresDispatcherReview).length
  const reAttemptable = failed.filter(d => d.failureReason !== 'ParcelDamaged').length

  return (
    <AppShell title="Failed Deliveries">
      <div className="page-header">
        <div>
          <h1 className="page-title">Failed Deliveries</h1>
          <p className="page-subtitle">Review failed attempts and decide next action</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Total failed"    value={totalFailed}   icon={AlertTriangle} color="bg-red-500"    />
        <StatCard label="Needs your review" value={escalated}   icon={ShieldQuestion} color="bg-amber-500" />
        <StatCard label="Re-attemptable"  value={reAttemptable} icon={RotateCcw}     color="bg-emerald-500" />
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="text-sm font-semibold text-gray-800">Failed deliveries queue</h2>
        </div>

        {isLoading ? <PageLoader /> : failed.length === 0 ? (
          <EmptyState
            icon={CheckCircle}
            title="No failed deliveries"
            description="All deliveries are on track."
          />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Tracking #</th>
                  <th>Recipient</th>
                  <th>City</th>
                  <th>Driver</th>
                  <th>Failure reason</th>
                  <th>Attempt</th>
                  <th>System recommendation</th>
                  <th>Failed at</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {failed.map(d => (
                  <tr key={d.id}>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <TrackingBadge value={d.parcel?.trackingNumber} />
                        {d.isPickup && (
                          <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-purple-100 text-purple-700 rounded-full">
                            Pickup
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="text-sm text-gray-700">
                      {d.parcel?.deliveryAddress?.recipientName}
                    </td>
                    <td className="text-xs text-gray-500">
                      {d.parcel?.deliveryAddress?.city}
                    </td>
                    <td className="text-xs text-gray-500">
                      {d.driver?.user?.firstName} {d.driver?.user?.lastName}
                    </td>
                    <td>
                      <span className="text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-200">
                        {FAILURE_LABELS[d.failureReason] ?? d.failureReason}
                      </span>
                      {d.attemptNotes && (
                        <p className="text-[11px] text-gray-400 mt-1 max-w-[160px] truncate" title={d.attemptNotes}>
                          {d.attemptNotes}
                        </p>
                      )}
                    </td>
                    <td className="text-xs text-gray-500 text-center">#{d.attemptNumber ?? 1}</td>
                    <td>
                      {d.requiresDispatcherReview ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                          <ShieldQuestion size={11} />
                          {ACTION_LABELS[d.recommendedAction] ?? 'Needs review'}
                        </span>
                      ) : d.recommendedAction ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          <CheckCircle size={11} />
                          {ACTION_LABELS[d.recommendedAction] ?? 'Handled'}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                      {d.dispatcherResolutionNotes && (
                        <p className="text-[11px] text-gray-400 mt-1 max-w-[160px] truncate" title={d.dispatcherResolutionNotes}>
                          Resolved: {d.dispatcherResolutionNotes}
                        </p>
                      )}
                    </td>
                    <td className="text-xs text-gray-400">{formatDate(d.updatedAt, { time: true })}</td>
                    <td>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {d.requiresDispatcherReview && (
                          <button
                            className="btn-secondary btn-sm border-amber-300 text-amber-700 hover:bg-amber-50"
                            onClick={() => openResolveModal(d)}
                            title="Clear this escalation"
                          >
                            <ShieldQuestion size={12} /> Resolve
                          </button>
                        )}
                        <button
                          className="btn-primary btn-sm"
                          onClick={() => setReDispatchModal(d)}
                          title="Re-attempt delivery"
                        >
                          <RotateCcw size={12} /> Re-dispatch
                        </button>
                        <button
                          className="btn-secondary btn-sm"
                          onClick={() => setReturnModal(d)}
                          title="Return to sender"
                        >
                          Return
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Resolve escalation modal — UC03/UC04 */}
      <Modal
        open={!!resolveModal}
        onClose={() => setResolveModal(null)}
        title="Resolve escalation"
        size="sm"
      >
        {resolveModal && (
          <>
            <p className="text-sm text-gray-600 mb-1">
              Clearing the flag on <TrackingBadge value={resolveModal.parcel?.trackingNumber} />
            </p>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-4">
              {ACTION_LABELS[resolveModal.recommendedAction] ?? 'System flagged this for manual review'}
            </p>

            <label className="label">What did you do?</label>
            <input
              className="input mb-3"
              placeholder="e.g. Corrected address, arranged access, re-dispatched…"
              value={resolutionLabel}
              onChange={e => setResolutionLabel(e.target.value)}
            />

            <label className="label">Notes (optional)</label>
            <textarea
              className="input h-16 resize-none"
              placeholder="Any additional context for the record…"
              value={resolutionNotes}
              onChange={e => setResolutionNotes(e.target.value)}
            />

            {resolveMutation.error && (
              <Alert type="error" message={resolveMutation.error.message} className="mt-3" />
            )}

            <div className="flex justify-end gap-2 mt-4">
              <button className="btn-secondary" onClick={() => setResolveModal(null)}>Cancel</button>
              <button
                className="btn-primary"
                disabled={resolveMutation.isPending}
                onClick={() => resolveMutation.mutate()}
              >
                <CheckCircle size={14} /> {resolveMutation.isPending ? 'Saving…' : 'Mark resolved'}
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* Re-dispatch modal */}
      <Modal
        open={!!reDispatchModal}
        onClose={() => setReDispatchModal(null)}
        title="Re-dispatch parcel"
        size="sm"
      >
        <p className="text-sm text-gray-600 mb-1">
          Re-dispatching <TrackingBadge value={reDispatchModal?.parcel?.trackingNumber} />
        </p>
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-4">
          Previous failure: <strong>{FAILURE_LABELS[reDispatchModal?.failureReason] ?? reDispatchModal?.failureReason}</strong>
          {reDispatchModal?.attemptNotes && ` — "${reDispatchModal.attemptNotes}"`}
        </p>

        {availableDrivers.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
            <AlertTriangle size={15} className="flex-shrink-0" />
            No drivers currently available. Check the Live Map.
          </div>
        ) : (
          <>
            <label className="label">Select available driver</label>
            <div className="space-y-2 mb-4 max-h-48 overflow-y-auto scrollbar-thin">
              {availableDrivers.map(d => (
                <button
                  key={d.driverId}
                  type="button"
                  onClick={() => setSelectedDriver(d.driverId)}
                  className={clsx(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-sm text-left transition-all',
                    selectedDriver === d.driverId
                      ? 'border-brand-400 bg-brand-50'
                      : 'border-gray-200 hover:border-gray-300'
                  )}
                >
                  <div className="w-7 h-7 rounded-full bg-brand-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {d.firstName[0]}{d.lastName[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800">{d.firstName} {d.lastName}</p>
                    <p className="text-xs text-emerald-600">● Available</p>
                  </div>
                  {selectedDriver === d.driverId && (
                    <CheckCircle size={15} className="text-brand-500 flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </>
        )}
        {reDispatchMutation.error && (
          <Alert message={reDispatchMutation.error.message} className="mt-3" />
        )}
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-secondary" onClick={() => setReDispatchModal(null)}>Cancel</button>
          <button
            className="btn-primary"
            disabled={!selectedDriver || reDispatchMutation.isPending}
            onClick={() => reDispatchMutation.mutate({
              parcelId: reDispatchModal.parcel.id,
              driverId: selectedDriver,
            })}
          >
            <Truck size={14} /> Re-dispatch
          </button>
        </div>
      </Modal>

      {/* Return to sender modal */}
      <Modal
        open={!!returnModal}
        onClose={() => setReturnModal(null)}
        title="Return to sender"
        size="sm"
      >
        <p className="text-sm text-gray-600 mb-4">
          Initiating return for <TrackingBadge value={returnModal?.parcel?.trackingNumber} />.
          The customer will be notified automatically.
        </p>
        <label className="label">Return notes (optional)</label>
        <textarea
          className="input h-20 resize-none"
          placeholder="Reason for return, special handling notes…"
          value={returnNotes}
          onChange={e => setReturnNotes(e.target.value)}
        />
        {returnMutation.error && <Alert message={returnMutation.error.message} className="mt-3" />}
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-secondary" onClick={() => setReturnModal(null)}>Cancel</button>
          <button
            className="btn-danger"
            disabled={returnMutation.isPending}
            onClick={() => returnMutation.mutate({ parcelId: returnModal.parcel.id })}
          >
            Confirm return to sender
          </button>
        </div>
      </Modal>
    </AppShell>
  )
}