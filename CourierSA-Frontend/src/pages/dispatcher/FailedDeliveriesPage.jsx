import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { StatCard, StatusPill, TrackingBadge, EmptyState, PageLoader, Modal, Alert } from '@/components/ui'
import api, { parcelApi, driverApi } from '@/api'
import { AlertTriangle, RotateCcw, Truck, XCircle, CheckCircle } from 'lucide-react'
import { formatDate } from '@/utils'
import clsx from 'clsx'

const FAILURE_LABELS = {
  RecipientAbsent:    'Recipient absent',
  AddressNotFound:    'Address not found',
  AccessDenied:       'Access denied',
  ParcelDamaged:      'Parcel damaged',
  RefusedDelivery:    'Refused delivery',
  Other:              'Other',
}

export default function FailedDeliveriesPage() {
  const qc = useQueryClient()
  const [reDispatchModal, setReDispatchModal] = useState(null)
  const [returnModal, setReturnModal]         = useState(null)
  const [selectedDriver, setSelectedDriver]   = useState('')
  const [returnNotes, setReturnNotes]         = useState('')

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

  const totalFailed   = failed.length
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
        <StatCard label="Re-attemptable"  value={reAttemptable} icon={RotateCcw}     color="bg-amber-500"  />
        <StatCard label="Return to sender"value={totalFailed - reAttemptable} icon={XCircle} color="bg-gray-500" />
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
                  <th>Notes</th>
                  <th>Failed at</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {failed.map(d => (
                  <tr key={d.id}>
                    <td><TrackingBadge value={d.parcel?.trackingNumber} /></td>
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
                    </td>
                    <td className="text-xs text-gray-500 max-w-[160px] truncate" title={d.attemptNotes}>
                      {d.attemptNotes || '—'}
                    </td>
                    <td className="text-xs text-gray-400">{formatDate(d.updatedAt, { time: true })}</td>
                    <td>
                      <div className="flex items-center gap-1.5">
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
