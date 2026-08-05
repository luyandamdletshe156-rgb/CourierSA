import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import AppShell from '@/components/layout/AppShell'
import {
  StatCard, StatusPill, TrackingBadge, EmptyState,
  PageLoader, Modal, Alert, LiveDot
} from '@/components/ui'
import { parcelApi, driverApi, dispatcherApi } from '@/api' // 👈 Added dispatcherApi
import {
  ClipboardCheck, Truck, AlertTriangle,
  CheckCircle, XCircle, ChevronRight, MapPin, Package
} from 'lucide-react'
import clsx from 'clsx'
import { formatDate, formatZAR } from '@/utils'
import { useTracking } from '@/context/TrackingContext'

export function DispatcherDashboard() {
  const qc = useQueryClient()
  const navigate = useNavigate() // 👈 Added navigation
  const { driverLocations, connected } = useTracking() ?? {}

  // 1. Fetch pending approvals
  const { data: pendingData, isLoading } = useQuery({
    queryKey: ['parcels-pending'],
    queryFn:  () => parcelApi.queue({ status: 'PendingApproval', pageSize: 50 }),
    refetchInterval: 30000,
  })

  // 2. Query dispatcher fleet to compute real-time maintenance alert counts
  const { data: fleetData } = useQuery({
    queryKey: ['dispatcher-fleet'],
    queryFn: async () => {
      const res = await dispatcherApi.vehicles()
      return Array.isArray(res) ? res : res?.data || []
    },
    staleTime: 30000,
  })

  const pendingParcels = pendingData?.data?.items ?? []
  const fleet = fleetData ?? []

  // Count vehicles in maintenance or with failed inspections
  const needingSwapCount = fleet.filter(
    v => v.status === 'InMaintenance' || v.lastInspection?.result === 'Fail'
  ).length

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

      {/* Dynamic Warning Banner for Maintenance Reassignments */}
      {needingSwapCount > 0 && (
        <div className="mb-6 p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-between text-amber-850">
          <div className="flex items-center gap-3">
            <span className="text-xl">⚠️</span>
            <div>
              <span className="font-bold text-sm">
                {needingSwapCount} vehicle(s) require driver reassignments!
              </span>
              <p className="text-xs opacity-90">
                Vehicles in maintenance or with failed inspections should have their drivers swapped.
              </p>
            </div>
          </div>
          <button
            className="btn-sm bg-amber-600 text-white hover:bg-amber-700 font-semibold"
            onClick={() => navigate('/dispatcher/reassign')}
          >
            Manage Swaps
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Awaiting approval" value={pendingParcels.length}
                  icon={ClipboardCheck} color="bg-amber-500" />
        <StatCard label="Active drivers" value={activeDrivers}
                  icon={Truck} color="bg-blue-500" />
        <StatCard label="Out for delivery" value="—"
                  icon={MapPin} color="bg-brand-500" />
        {/* Dynamic stat card linking directly to fleet swaps */}
        <div 
          onClick={() => navigate('/dispatcher/reassign')} 
          className="cursor-pointer group"
        >
          <StatCard 
            label="Maintenance Swaps" 
            value={needingSwapCount}
            icon={AlertTriangle} 
            color={needingSwapCount > 0 ? "bg-amber-600" : "bg-gray-400"} 
          />
        </div>
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
  const [statusFilter, setStatusFilter] = useState('Approved')
  const [dispatchModal, setDispatchModal]   = useState(null)
  const [selectedDriver, setSelectedDriver] = useState('')
  const [scanConfirm, setScanConfirm]       = useState('')

  // ── batch route selection (InWarehouse tab only) ──
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [selectedZone, setSelectedZone] = useState(null)
  const [routeModal, setRouteModal] = useState(false)
  const [routeDriver, setRouteDriver] = useState('')
  const [routeScans, setRouteScans] = useState({}) // { parcelId: scannedValue }

  const STATUS_FILTERS = [
  { value: 'Approved',   label: 'Ready for pickup'   },
  { value: 'CheckedOut', label: 'Ready for delivery' },   // was 'InWarehouse'
]

  const { data, isLoading } = useQuery({
    queryKey: ['parcels-dispatch-queue', statusFilter],
    queryFn:  () => parcelApi.queue({ status: statusFilter, pageSize: 50 }),
    refetchInterval: 30000,
  })

  const { data: driversData } = useQuery({
    queryKey: ['available-drivers'],
    queryFn:  () => driverApi.available(),
    staleTime: 30000,
  })

  const queueItems       = data?.data?.items  ?? []
  const availableDrivers = driversData?.data   ?? []

  const dispatchMutation = useMutation({
    mutationFn: ({ id, driverId }) => parcelApi.dispatch(id, driverId),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['parcels-dispatch-queue'] })
      qc.invalidateQueries({ queryKey: ['available-drivers'] })
      setDispatchModal(null)
      setSelectedDriver('')
      setScanConfirm('')
    },
  })

  const routeMutation = useMutation({
    mutationFn: ({ parcelIds, driverId }) => parcelApi.dispatchRoute(parcelIds, driverId),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['parcels-dispatch-queue'] })
      qc.invalidateQueries({ queryKey: ['available-drivers'] })
      closeRouteModal()
    },
  })

  const closeDispatchModal = () => {
    setDispatchModal(null)
    setSelectedDriver('')
    setScanConfirm('')
  }

  const closeRouteModal = () => {
    setRouteModal(false)
    setRouteDriver('')
    setRouteScans({})
    setSelectedIds(new Set())
    setSelectedZone(null)
  }

  const toggleSelect = (parcel) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(parcel.id)) {
        next.delete(parcel.id)
        if (next.size === 0) setSelectedZone(null)
      } else {
        // Enforce single-zone selection: switching zones clears prior selection
        if (selectedZone && parcel.zone !== selectedZone) {
          next.clear()
        }
        next.add(parcel.id)
        setSelectedZone(parcel.zone)
      }
      return next
    })
  }

  const switchTab = (value) => {
    setStatusFilter(value)
    setSelectedIds(new Set())
    setSelectedZone(null)
  }

  const selectedParcels = queueItems.filter(p => selectedIds.has(p.id))
  const allScansConfirmed = selectedParcels.length > 0 &&
    selectedParcels.every(p => routeScans[p.id] === p.trackingNumber)

 const isDeliveryLeg = statusFilter === 'CheckedOut'   // was 'InWarehouse'
  const scanMismatch   = scanConfirm && scanConfirm !== dispatchModal?.trackingNumber
  const scanConfirmed  = scanConfirm && scanConfirm === dispatchModal?.trackingNumber

  return (
    <AppShell title="Dispatch Queue">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dispatch Queue</h1>
          <p className="page-subtitle">
            Assign parcels to available drivers
            {availableDrivers.length > 0 && (
              <span className="ml-2 text-emerald-600 font-medium">
                · {availableDrivers.length} driver{availableDrivers.length !== 1 ? 's' : ''} available
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {STATUS_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => switchTab(f.value)}
            className={clsx(
              'px-5 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all',
              statusFilter === f.value
                ? 'bg-brand-500 text-white border-brand-500 shadow-md'
                : 'bg-white text-gray-600 border-gray-200 hover:border-brand-300 hover:text-gray-800'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isDeliveryLeg && selectedIds.size > 0 && (
        <div className="mb-4 p-4 rounded-2xl bg-brand-50 border border-brand-200 flex items-center justify-between">
          <div className="text-sm">
            <span className="font-bold text-brand-700">{selectedIds.size} parcel{selectedIds.size !== 1 ? 's' : ''} selected</span>
            {selectedZone && <span className="ml-2 text-brand-600">· {selectedZone} zone</span>}
          </div>
          <button className="btn-primary btn-sm" onClick={() => setRouteModal(true)}>
            <Truck size={14} /> Dispatch route ({selectedIds.size})
          </button>
        </div>
      )}

      <div className="card">
        {isLoading ? <PageLoader /> : queueItems.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No parcels ready to dispatch"
            description={statusFilter === 'Approved'
              ? 'Approved parcels waiting for pickup will appear here.'
              : 'Parcels checked in to the warehouse, ready for delivery, will appear here.'}
          />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  {isDeliveryLeg && <th></th>}
                  <th>Tracking #</th>
                  <th>Service</th>
                  <th>Destination</th>
                  {isDeliveryLeg && <th>Zone</th>}
                  {isDeliveryLeg && <th>Bin</th>}
                  <th>Weight</th>
                  <th>Updated</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {queueItems.map(p => (
                  <tr key={p.id}>
                    {isDeliveryLeg && (
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(p.id)}
                          onChange={() => toggleSelect(p)}
                          disabled={!!selectedZone && selectedZone !== p.zone && !selectedIds.has(p.id)}
                          className="w-4 h-4"
                        />
                      </td>
                    )}
                    <td><TrackingBadge value={p.trackingNumber} /></td>
                    <td className="capitalize text-xs text-gray-600">{p.serviceType}</td>
                    <td className="text-xs text-gray-600">
                      {p.destinationCity}, {p.destinationProvince}
                    </td>
                    {isDeliveryLeg && (
                      <td className="text-xs font-medium text-gray-700">{p.zone ?? '—'}</td>
                    )}
                    {isDeliveryLeg && (
                      <td className="text-xs text-gray-500">{p.binCode ?? '—'}</td>
                    )}
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

      {/* Single-parcel dispatch modal — unchanged from your current flow */}
      <Modal
        open={!!dispatchModal}
        onClose={closeDispatchModal}
        title="Assign driver"
        size="sm"
      >
        <p className="text-sm text-gray-600 mb-4">
          Dispatching <TrackingBadge value={dispatchModal?.trackingNumber} />
        </p>

        {isDeliveryLeg && (
          <>
            <label className="label">Confirm tracking number</label>
            <input
              type="text"
              className="input font-mono mb-4"
              placeholder="Scan or type tracking number…"
              value={scanConfirm}
              onChange={e => setScanConfirm(e.target.value.toUpperCase())}
              autoFocus
            />
            {scanMismatch && (
              <p className="text-xs text-red-500 -mt-3 mb-4">Does not match this parcel.</p>
            )}
            {scanConfirmed && (
              <p className="text-xs text-emerald-600 -mt-3 mb-4 flex items-center gap-1">
                <CheckCircle size={12} /> Parcel confirmed
              </p>
            )}
          </>
        )}

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
          <button className="btn-secondary" onClick={closeDispatchModal}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={
              !selectedDriver ||
              (isDeliveryLeg && scanConfirm !== dispatchModal?.trackingNumber) ||
              dispatchMutation.isPending
            }
            onClick={() => dispatchMutation.mutate({ id: dispatchModal.id, driverId: selectedDriver })}
          >
            <Truck size={14} /> Dispatch
          </button>
        </div>
      </Modal>

      {/* Batch route dispatch modal — requires scanning each selected parcel */}
      <Modal
        open={routeModal}
        onClose={closeRouteModal}
        title="Dispatch route"
        size="md"
      >
        <p className="text-sm text-gray-600 mb-4">
          Assigning <strong>{selectedParcels.length} parcel{selectedParcels.length !== 1 ? 's' : ''}</strong>
          {selectedZone && <> in the <strong>{selectedZone}</strong> zone</>} to one driver.
          Scan or type each tracking number to confirm before dispatching.
        </p>

        <div className="space-y-2 mb-4 max-h-44 overflow-y-auto scrollbar-thin">
          {selectedParcels.map(p => {
            const scanned = routeScans[p.id] || ''
            const matched = scanned === p.trackingNumber
            const mismatch = scanned && !matched
            return (
              <div key={p.id} className="flex items-center gap-2">
                <div className="w-28 flex-shrink-0">
                  <TrackingBadge value={p.trackingNumber} />
                </div>
                <input
                  type="text"
                  className="input font-mono text-xs flex-1"
                  placeholder="Scan or type to confirm…"
                  value={scanned}
                  onChange={e => setRouteScans(prev => ({ ...prev, [p.id]: e.target.value.toUpperCase() }))}
                />
                {matched && <CheckCircle size={16} className="text-emerald-500 flex-shrink-0" />}
                {mismatch && <XCircle size={16} className="text-red-500 flex-shrink-0" />}
              </div>
            )
          })}
        </div>

        {availableDrivers.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
            <AlertTriangle size={15} className="flex-shrink-0" />
            No drivers are currently available.
          </div>
        ) : (
          <>
            <label className="label">Select available driver</label>
            <div className="space-y-2 mb-4 max-h-44 overflow-y-auto scrollbar-thin">
              {availableDrivers.map(d => (
                <button
                  key={d.driverId}
                  type="button"
                  onClick={() => setRouteDriver(d.driverId)}
                  className={clsx(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-sm text-left transition-all',
                    routeDriver === d.driverId
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
                  {routeDriver === d.driverId && (
                    <CheckCircle size={16} className="text-brand-500 flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </>
        )}

        {routeMutation.error && (
          <Alert message={routeMutation.error.message} className="mb-3" />
        )}
        <div className="flex justify-end gap-2">
          <button className="btn-secondary" onClick={closeRouteModal}>
            Cancel
          </button>
          <button
            className="btn-primary"
            disabled={!routeDriver || !allScansConfirmed || routeMutation.isPending}
            onClick={() => routeMutation.mutate({
              parcelIds: Array.from(selectedIds),
              driverId: routeDriver
            })}
          >
            <Truck size={14} /> Dispatch route
          </button>
        </div>
      </Modal>
    </AppShell>
  )
}