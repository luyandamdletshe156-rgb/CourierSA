import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import {
  StatCard, StatusPill, TrackingBadge, EmptyState,
  PageLoader, Modal, Alert, LiveDot
} from '@/components/ui'
import { parcelApi, driverApi } from '@/api'
import {
  ClipboardCheck, Truck, AlertTriangle,
  CheckCircle, XCircle, ChevronRight, MapPin, Package
} from 'lucide-react'
import clsx from 'clsx'
import { formatDate, formatZAR } from '@/utils'
import { useTracking } from '@/context/TrackingContext'

export function DispatcherDashboard() {
  const qc = useQueryClient()
  const { driverLocations, connected } = useTracking() ?? {}

  const { data: pendingData, isLoading } = useQuery({
    queryKey: ['parcels-pending'],
    queryFn:  () => parcelApi.list({ status: 'Pending', pageSize: 50 }),
    refetchInterval: 30000,
  })

  const pendingParcels = pendingData?.data?.items ?? []

  const approveMutation = useMutation({
    mutationFn: id => parcelApi.approve(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['parcels-pending'] }),
  })

  const [rejectModal, setRejectModal] = useState(null) // { id, trackingNumber }
  const [rejectReason, setRejectReason] = useState('')

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }) => parcelApi.reject(id, reason),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['parcels-pending'] })
      setRejectModal(null)
      setRejectReason('')
    },
  })

  const activeDrivers = Object.keys(driverLocations ?? {}).length

  return (
    <AppShell title="Dispatcher">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dispatcher Dashboard</h1>
          <p className="page-subtitle">Review bookings and manage dispatch</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <LiveDot active={connected} />
          {activeDrivers} drivers active
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Awaiting approval" value={pendingParcels.length}
                  icon={ClipboardCheck} color="bg-amber-500" />
        <StatCard label="Active drivers" value={activeDrivers}
                  icon={Truck} color="bg-blue-500" />
        <StatCard label="Out for delivery" value="—"
                  icon={MapPin} color="bg-brand-500" />
        <StatCard label="Failed today" value="—"
                  icon={AlertTriangle} color="bg-red-500" />
      </div>

      {/* Pending approval queue */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-sm font-semibold text-gray-800">
            Pending approval
            {pendingParcels.length > 0 && (
              <span className="ml-2 inline-flex items-center justify-center w-5 h-5
                               bg-amber-500 text-white text-xs rounded-full font-bold">
                {pendingParcels.length}
              </span>
            )}
          </h2>
        </div>

        {isLoading ? <PageLoader /> : pendingParcels.length === 0 ? (
          <EmptyState
            icon={CheckCircle}
            title="Queue is clear"
            description="No parcels are waiting for approval right now."
          />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Tracking #</th>
                  <th>Customer</th>
                  <th>Service</th>
                  <th>Destination</th>
                  <th>Weight</th>
                  <th>Value</th>
                  <th>Booked</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingParcels.map(p => (
                  <tr key={p.id}>
                    <td><TrackingBadge value={p.trackingNumber} /></td>
                    <td className="text-xs text-gray-600">{p.customerName ?? '—'}</td>
                    <td>
                      <span className="text-xs font-medium text-gray-700 capitalize">
                        {p.serviceType}
                      </span>
                    </td>
                    <td className="text-xs text-gray-600">
                      {p.destinationCity}, {p.destinationProvince}
                    </td>
                    <td className="text-xs text-gray-600">{p.weightKg} kg</td>
                    <td className="text-xs font-medium">
                      {p.declaredValueZAR ? formatZAR(p.declaredValueZAR) : '—'}
                    </td>
                    <td className="text-xs text-gray-400">{formatDate(p.createdAt)}</td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <button
                          className="btn-primary btn-sm"
                          disabled={approveMutation.isPending}
                          onClick={() => approveMutation.mutate(p.id)}
                        >
                          <CheckCircle size={13} />
                          Approve
                        </button>
                        <button
                          className="btn-danger btn-sm"
                          onClick={() => setRejectModal({ id: p.id, trackingNumber: p.trackingNumber })}
                        >
                          <XCircle size={13} />
                          Reject
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

      {/* Reject modal */}
      <Modal
        open={!!rejectModal}
        onClose={() => setRejectModal(null)}
        title="Reject booking"
        size="sm"
      >
        <p className="text-sm text-gray-600 mb-4">
          Rejecting <TrackingBadge value={rejectModal?.trackingNumber} />.
          Provide a reason for the customer.
        </p>
        <textarea
          className="input h-24 resize-none"
          placeholder="e.g. Incomplete address details, prohibited item…"
          value={rejectReason}
          onChange={e => setRejectReason(e.target.value)}
        />
        {rejectMutation.error && (
          <Alert message={rejectMutation.error.message} className="mt-3" />
        )}
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-secondary" onClick={() => setRejectModal(null)}>Cancel</button>
          <button
            className="btn-danger"
            disabled={!rejectReason.trim() || rejectMutation.isPending}
            onClick={() => rejectMutation.mutate({ id: rejectModal.id, reason: rejectReason })}
          >
            Confirm rejection
          </button>
        </div>
      </Modal>
    </AppShell>
  )
}

// ── Dispatch Queue ─────────────────────────────────────────────────────────────
export function DispatchQueue() {
  const qc = useQueryClient()
  const [dispatchModal, setDispatchModal]   = useState(null)
  const [selectedDriver, setSelectedDriver] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['parcels-approved'],
    queryFn:  () => parcelApi.list({ status: 'Approved', pageSize: 50 }),
    refetchInterval: 30000,
  })

  const { data: driversData } = useQuery({
    queryKey: ['available-drivers'],
    queryFn:  () => driverApi.available(),
    staleTime: 30000,
  })

  const approved         = data?.data?.items  ?? []
  const availableDrivers = driversData?.data   ?? []

  const dispatchMutation = useMutation({
    mutationFn: ({ id, driverId }) => parcelApi.dispatch(id, driverId),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['parcels-approved'] })
      qc.invalidateQueries({ queryKey: ['available-drivers'] })
      setDispatchModal(null)
      setSelectedDriver('')
    },
  })

  return (
    <AppShell title="Dispatch Queue">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dispatch Queue</h1>
          <p className="page-subtitle">
            Assign approved parcels to available drivers
            {availableDrivers.length > 0 && (
              <span className="ml-2 text-emerald-600 font-medium">
                · {availableDrivers.length} driver{availableDrivers.length !== 1 ? 's' : ''} available
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="card">
        {isLoading ? <PageLoader /> : approved.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No parcels ready to dispatch"
            description="Approved parcels waiting for driver assignment will appear here."
          />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Tracking #</th>
                  <th>Service</th>
                  <th>Destination</th>
                  <th>Weight</th>
                  <th>Approved</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {approved.map(p => (
                  <tr key={p.id}>
                    <td><TrackingBadge value={p.trackingNumber} /></td>
                    <td className="capitalize text-xs text-gray-600">{p.serviceType}</td>
                    <td className="text-xs text-gray-600">
                      {p.destinationCity}, {p.destinationProvince}
                    </td>
                    <td className="text-xs text-gray-600">{p.weightKg} kg</td>
                    <td className="text-xs text-gray-400">{formatDate(p.updatedAt)}</td>
                    <td>
                      <button
                        className="btn-primary btn-sm"
                        onClick={() => setDispatchModal(p)}
                        disabled={availableDrivers.length === 0}
                        title={availableDrivers.length === 0 ? 'No drivers available' : 'Assign driver'}
                      >
                        <Truck size={13} /> Dispatch
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={!!dispatchModal}
        onClose={() => { setDispatchModal(null); setSelectedDriver('') }}
        title="Assign driver"
        size="sm"
      >
        <p className="text-sm text-gray-600 mb-4">
          Dispatching <TrackingBadge value={dispatchModal?.trackingNumber} />
        </p>

        {availableDrivers.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
            <AlertTriangle size={15} className="flex-shrink-0" />
            No drivers are currently available. Check the Live Map for driver status.
          </div>
        ) : (
          <>
            <label className="label">Select available driver</label>
            <div className="space-y-2 mb-4 max-h-52 overflow-y-auto scrollbar-thin">
              {availableDrivers.map(d => (
                <button
                  key={d.driverId}
                  type="button"
                  onClick={() => setSelectedDriver(d.driverId)}
                  className={clsx(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-sm text-left transition-all',
                    selectedDriver === d.driverId
                      ? 'border-brand-400 bg-brand-50'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  )}
                >
                  <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {d.firstName[0]}{d.lastName[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800">{d.firstName} {d.lastName}</p>
                    <p className="text-xs text-emerald-600">● Available · {d.phone}</p>
                  </div>
                  {selectedDriver === d.driverId && (
                    <CheckCircle size={16} className="text-brand-500 flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </>
        )}

        {dispatchMutation.error && (
          <Alert message={dispatchMutation.error.message} className="mb-3" />
        )}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={() => { setDispatchModal(null); setSelectedDriver('') }}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={!selectedDriver || dispatchMutation.isPending}
            onClick={() => dispatchMutation.mutate({ id: dispatchModal.id, driverId: selectedDriver })}
          >
            <Truck size={14} /> Dispatch
          </button>
        </div>
      </Modal>
    </AppShell>
  )
}
