import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import AppShell from '@/components/layout/AppShell'
import {
  StatCard, TrackingBadge, EmptyState, PageLoader, Modal, Alert
} from '@/components/ui'
import { parcelApi, driverApi } from '@/api'
import {
  ClipboardCheck, CheckCircle2, XCircle, Truck, MapPin,
  Clock, UserCheck, Send, RefreshCw, AlertTriangle, Package
} from 'lucide-react'
import { formatDate, formatZAR } from '@/utils'
import clsx from 'clsx'

// Wait-time triage: dispatchers should see the oldest bookings first without
// having to eyeball timestamps. Thresholds are deliberately generous —
// most bookings should clear well before "Aging" ever shows.
function getWaitState(createdAt) {
  const hours = (Date.now() - new Date(createdAt).getTime()) / 36e5
  if (hours >= 4) return { label: 'Urgent', dot: 'bg-[#DC2626]', text: 'text-[#DC2626]', bg: 'bg-[#FEF2F2]', border: 'border-l-[#DC2626]' }
  if (hours >= 2) return { label: 'Aging', dot: 'bg-[#D97706]', text: 'text-[#D97706]', bg: 'bg-[#FFFBEB]', border: 'border-l-[#D97706]' }
  return null
}

export function DispatcherDashboard() {
  const qc = useQueryClient()
  const [rejectModal, setRejectModal] = useState(null)
  const [rejectReason, setRejectReason] = useState('')

  const { data: pendingData, isLoading: pendingLoading } = useQuery({
    queryKey: ['dispatcher-pending'],
    queryFn: () => parcelApi.queue({ status: 'PendingApproval', pageSize: 50 }),
    refetchInterval: 15000,
  })

  // Dashboard needs the FULL driver directory (not just Available) so the
  // "Active Drivers" count includes drivers currently OnDelivery too.
  const { data: driversData } = useQuery({
    queryKey: ['dispatcher-drivers'],
    queryFn: async () => {
      const res = await driverApi.all()
      return Array.isArray(res) ? res : res?.data || []
    },
    refetchInterval: 30000,
  })

  const { data: outForDeliveryData } = useQuery({
    queryKey: ['dispatcher-out-for-delivery'],
    queryFn: () => parcelApi.queue({ status: 'OutForDelivery', pageSize: 1 }),
    refetchInterval: 30000,
  })

  const pending = pendingData?.data?.items ?? pendingData?.items ?? pendingData?.data ?? []
  const drivers = driversData ?? []
  const activeDrivers = drivers.filter(d => d.status === 'OnDelivery' || d.status === 'Available').length
  const outForDeliveryCount = outForDeliveryData?.data?.totalCount ?? outForDeliveryData?.totalCount ?? 0
  const urgentCount = pending.filter(p => getWaitState(p.createdAt)?.label === 'Urgent').length

  const approveMutation = useMutation({
    mutationFn: (id) => parcelApi.approve(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dispatcher-pending'] })
      qc.invalidateQueries({ queryKey: ['admin-stats'] })
      qc.invalidateQueries({ queryKey: ['dispatcher-ready-queue'] }) // Refresh the queue on next page
    },
  })

  const rejectMutation = useMutation({
    mutationFn: () => parcelApi.reject(rejectModal.id, rejectReason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dispatcher-pending'] })
      setRejectModal(null)
      setRejectReason('')
    },
  })

  return (
    <AppShell title="Dispatcher Dashboard">
      <div className="page-header flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Dispatcher Dashboard</h1>
          <p className="page-subtitle">Review incoming customer bookings & verify pickup details</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-[#ECFDF5] border border-[#10B981]/20 rounded-full text-xs font-semibold text-[#10B981]">
          <span className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
          {activeDrivers} Driver{activeDrivers !== 1 ? 's' : ''} Active
        </div>
      </div>

      {/* Hero Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Awaiting Approval"
          value={pendingData?.data?.totalCount ?? pending.length}
          icon={Clock}
          color={urgentCount > 0 ? 'bg-[#DC2626]' : 'bg-[#F59E0B]'}
        />
        <StatCard label="Active Drivers" value={activeDrivers} icon={Truck} color="bg-[#1E63E9]" />
        <StatCard label="Out For Delivery" value={outForDeliveryCount} icon={MapPin} color="bg-[#0A3D91]" />

        {/* Clickable Maintenance Swaps Card */}
        <Link to="/dispatcher/swaps" className="block hover:-translate-y-0.5 transition-transform duration-200 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A3D91] focus-visible:ring-offset-2">
          <StatCard label="Maintenance Swaps" value="0" icon={RefreshCw} color="bg-[#64748B]" />
        </Link>
      </div>

      {approveMutation.error && (
        <Alert type="error" message={approveMutation.error.message} className="mb-4" />
      )}

      {urgentCount > 0 && (
        <div className="flex items-center gap-2 mb-4 px-4 py-2.5 bg-[#FEF2F2] border border-[#DC2626]/20 rounded-xl text-xs font-semibold text-[#DC2626]">
          <AlertTriangle size={14} />
          {urgentCount} booking{urgentCount !== 1 ? 's have' : ' has'} been waiting over 4 hours — review these first.
        </div>
      )}

      {/* Queue Table */}
      <div className="card overflow-hidden">
        <div className="bg-[#F8FAFC] px-5 py-4 border-b border-[#D8E4F5] flex items-center justify-between">
          <h2 className="text-sm font-bold text-[#172554] flex items-center gap-2">
            <ClipboardCheck size={18} className="text-[#0A3D91]" /> Pending Approval Queue
            <span className="text-xs font-normal text-[#94A3B8]">({pending.length})</span>
          </h2>
        </div>

        {pendingLoading ? <PageLoader /> : pending.length === 0 ? (
          <EmptyState icon={CheckCircle2} title="Queue is clear" description="No customer bookings are currently waiting for approval." />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Tracking #</th>
                  <th>Service & Zone</th>
                  <th>Destination</th>
                  <th>Weight & Price</th>
                  <th>Booked Date</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {pending.map(p => {
                  const wait = getWaitState(p.createdAt)
                  return (
                    <tr
                      key={p.id}
                      className={clsx(
                        "transition-colors duration-150 border-l-4",
                        wait ? clsx(wait.bg, wait.border) : "border-l-transparent hover:bg-[#F6FAFF]"
                      )}
                    >
                      <td>
                        <div className="flex items-center gap-2 flex-wrap">
                          <TrackingBadge value={p.trackingNumber} />
                          {p.isFragile && <span className="text-[10px] font-bold bg-[#FEF3C7] text-[#D97706] px-1.5 py-0.5 rounded">Fragile</span>}
                          {wait && (
                            <span className={clsx("flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded", wait.text)}>
                              <span className={clsx("w-1.5 h-1.5 rounded-full", wait.dot)} />
                              {wait.label}
                            </span>
                          )}
                        </div>
                      </td>
                      <td>
                        <p className="text-sm font-semibold text-[#172554] capitalize">{p.serviceType}</p>
                        <p className="text-xs text-[#64748B]">{p.zone ? `Zone: ${p.zone}` : 'Unassigned Zone'}</p>
                      </td>
                      <td className="text-xs text-[#64748B] font-medium">{p.destinationCity}</td>
                      <td>
                        <p className="text-xs text-[#172554] font-mono font-semibold">{p.weightKg} kg</p>
                        <p className="text-xs text-[#10B981] font-mono">{p.quoteAmountZAR ? formatZAR(p.quoteAmountZAR) : '—'}</p>
                      </td>
                      <td className="text-xs text-[#94A3B8] font-mono">{formatDate(p.createdAt, { time: true })}</td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            className="btn-danger btn-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] focus-visible:ring-offset-1"
                            onClick={() => setRejectModal(p)}
                          >
                            <XCircle size={14} /> Reject
                          </button>
                          <button
                            className="btn-primary btn-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A3D91] focus-visible:ring-offset-1"
                            disabled={approveMutation.isPending}
                            onClick={() => approveMutation.mutate(p.id)}
                          >
                            <CheckCircle2 size={14} /> Approve
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={!!rejectModal} onClose={() => setRejectModal(null)} title="Reject Booking Request" size="sm">
        <p className="text-sm text-[#64748B] mb-3">
          Rejecting <TrackingBadge value={rejectModal?.trackingNumber} /> will cancel this parcel booking.
        </p>
        <label className="label">Rejection Reason</label>
        <textarea
          className="input h-24 resize-none mb-4"
          placeholder="e.g. Prohibited items, invalid address..."
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
        />
        {rejectMutation.error && <Alert type="error" message={rejectMutation.error.message} className="mb-4" />}
        <div className="flex justify-end gap-3">
          <button className="btn-secondary" onClick={() => setRejectModal(null)}>Cancel</button>
          <button
            className="btn-danger"
            disabled={!rejectReason.trim() || rejectMutation.isPending}
            onClick={() => rejectMutation.mutate()}
          >
            Confirm Rejection
          </button>
        </div>
      </Modal>
    </AppShell>
  )
}

export function DispatchQueue() {
  const qc = useQueryClient()
  const [selectedDriverId, setSelectedDriverId] = useState('')
  const [selectedParcelIds, setSelectedParcelIds] = useState([])

  // 1. Fetch Deliveries (Leaving the warehouse)
  const { data: checkedOutData, isLoading: checkedOutLoading } = useQuery({
    queryKey: ['dispatcher-ready-queue', 'CheckedOut'],
    queryFn: () => parcelApi.queue({ status: 'CheckedOut', pageSize: 50 }),
    refetchInterval: 15000,
  })

  // 2. Fetch Pickups (Freshly approved bookings that need to be collected)
  const { data: approvedData, isLoading: approvedLoading } = useQuery({
    queryKey: ['dispatcher-ready-queue', 'Approved'],
    queryFn: () => parcelApi.queue({ status: 'Approved', pageSize: 50 }),
    refetchInterval: 15000,
  })

  // Helper to safely extract items from API response
  const extractItems = (data) => Array.isArray(data) ? data : data?.data?.items ?? data?.items ?? data?.data ?? []

  const deliveries = extractItems(checkedOutData)
  const pickups = extractItems(approvedData)
  
  // Combine both into one queue
  const parcels = [...pickups, ...deliveries]
  const parcelsLoading = checkedOutLoading || approvedLoading

  const { data: driversData, isLoading: driversLoading } = useQuery({
    queryKey: ['dispatcher-available-drivers'],
    queryFn: async () => {
      const res = await driverApi.available()
      return Array.isArray(res) ? res : res?.data || []
    },
    refetchInterval: 15000,
  })

  const drivers = driversData ?? []
  const selectedParcels = parcels.filter(p => selectedParcelIds.includes(p.id))

  // Proximity Lock: Lock selection to the city of the FIRST selected item
  const activeCity = selectedParcels.length > 0 
    ? (selectedParcels[0].city || selectedParcels[0].destinationCity) 
    : null

  const handleToggleParcel = (id) => {
    setSelectedParcelIds(prev => {
      const next = prev.includes(id) ? prev.filter(pId => pId !== id) : [...prev, id]
      if (next.length === 0) setSelectedDriverId('')
      return next
    })
  }

  const dispatchMutation = useMutation({
    mutationFn: () => {
      if (selectedParcelIds.length === 1) {
        return parcelApi.dispatch(selectedParcelIds[0], selectedDriverId)
      }
      return parcelApi.dispatchRoute({
        parcelIds: selectedParcelIds,
        driverId: selectedDriverId
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dispatcher-ready-queue'] })
      qc.invalidateQueries({ queryKey: ['dispatcher-available-drivers'] })
      setSelectedParcelIds([])
      setSelectedDriverId('')
    },
  })

  return (
    <AppShell title="Dispatch Queue">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dispatch Queue</h1>
          <p className="page-subtitle">Assign drivers to collect new bookings (Pickups) and dispatch warehouse parcels (Deliveries)</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card overflow-hidden">
          <div className="bg-[#F8FAFC] px-5 py-4 border-b border-[#D8E4F5] flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#172554] flex items-center gap-2">
              <Truck size={18} className="text-[#0A3D91]" /> Ready for Dispatch
            </h2>
            <span className="text-xs font-semibold text-[#0A3D91] bg-[#DCEEFF] px-2.5 py-1 rounded-full">{parcels.length} Tasks</span>
          </div>

          {parcelsLoading ? <PageLoader /> : parcels.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Queue is clear" description="No parcels are currently waiting for pickup or delivery." />
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th className="w-8"></th>
                    <th>Tracking #</th>
                    <th>Task Type</th>
                    <th>City</th>
                    <th>Bin Code</th>
                  </tr>
                </thead>
                <tbody>
                  {parcels.map(p => {
                    const isPickup = p.status === 'Approved'
                    const isSelected = selectedParcelIds.includes(p.id)
                    const taskCity = p.city || p.destinationCity || ''
                    
                    // Disable checkbox if task is outside the currently active city selection
                    const isOutOfArea = activeCity && taskCity !== activeCity

                    return (
                      <tr
                        key={p.id}
                        onClick={() => {
                          if (!isOutOfArea || isSelected) handleToggleParcel(p.id)
                        }}
                        className={clsx(
                          "transition-colors duration-150",
                          isOutOfArea && !isSelected ? "opacity-40 bg-[#F8FAFC] cursor-not-allowed" : "cursor-pointer hover:bg-[#F6FAFF]",
                          isSelected ? "bg-[#DCEEFF]/50 font-semibold" : ""
                        )}
                      >
                        <td className="w-8 text-center" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            disabled={isOutOfArea && !isSelected}
                            onChange={() => handleToggleParcel(p.id)}
                            className="w-4 h-4 text-[#0A3D91] rounded border-[#D8E4F5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A3D91] disabled:cursor-not-allowed"
                            title={isOutOfArea ? "Cannot batch tasks from different cities" : ""}
                          />
                        </td>
                        <td><TrackingBadge value={p.trackingNumber} /></td>
                        <td>
                          {isPickup ? (
                             <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 bg-[#E0E7FF] text-[#4338CA] rounded-full uppercase tracking-wide">
                               <Package size={10} /> Pickup
                             </span>
                          ) : (
                             <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 bg-[#ECFDF5] text-[#059669] rounded-full uppercase tracking-wide">
                               <MapPin size={10} /> Delivery
                             </span>
                          )}
                        </td>
                        <td className="text-xs text-[#64748B]">{taskCity || '—'}</td>
                        <td className="text-xs font-bold text-[#172554]">{p.binCode ?? '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card p-5 h-max space-y-5 lg:sticky lg:top-6">
          <h2 className="text-base font-bold text-[#172554] flex items-center gap-2 border-b border-[#E2E8F0] pb-3">
            <Send size={18} className="text-[#0A3D91]" /> Dispatch Assignment
          </h2>

          {selectedParcels.length === 0 ? (
            <Alert type="warning" message="Select one or more tasks from the list on the left to assign a driver." />
          ) : (
            <div className="bg-[#F8FAFC] p-3.5 rounded-xl border border-[#E2E8F0] space-y-3 animate-[fadeIn_0.15s_ease-in]">
              <div className="flex justify-between items-center">
                <p className="text-[#94A3B8] uppercase font-bold text-[10px] tracking-wide">
                  Selected Tasks ({selectedParcels.length})
                </p>
                <span className="text-xs font-semibold text-[#0A3D91] flex items-center gap-1">
                  <MapPin size={12} /> {activeCity}
                </span>
              </div>

              <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                {selectedParcels.map(p => (
                  <div key={p.id} className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-[#D8E4F5]">
                    <TrackingBadge value={p.trackingNumber} />
                    <span className={clsx(
                      "text-[10px] font-bold px-1.5 py-0.5 rounded uppercase",
                      p.status === 'Approved' ? "bg-purple-100 text-purple-700" : "bg-green-100 text-green-700"
                    )}>
                      {p.status === 'Approved' ? 'Pickup' : 'Delivery'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="label">Select Available Driver</label>
            {driversLoading ? (
              <p className="text-xs text-[#94A3B8]">Loading drivers...</p>
            ) : drivers.length === 0 ? (
              <div className="flex items-start gap-2 px-3 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-xs text-[#64748B]">
                <UserCheck size={14} className="text-[#94A3B8] mt-0.5 flex-shrink-0" />
                No drivers currently available — all active drivers are mid-route.
              </div>
            ) : (
              <select
                className="input bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A3D91]"
                value={selectedDriverId}
                onChange={(e) => setSelectedDriverId(e.target.value)}
                disabled={selectedParcelIds.length === 0}
              >
                <option value="">Choose Driver...</option>
                {drivers.map((d, index) => {
                  const actualId = d?.id || d?.driverId || d?.userId;
                  const actualName = d?.user?.fullName || d?.fullName || d?.name || d?.driverName || `Driver #${actualId ? String(actualId).substring(0,6) : index}`;
                  
                  return (
                    <option key={actualId || index} value={actualId || ''}>
                      {actualName}
                    </option>
                  );
                })}
              </select>
            )}
          </div>

          {dispatchMutation.error && (
            <Alert type="error" message={dispatchMutation.error.message} />
          )}

          <button
            className="btn-primary w-full py-3 justify-center text-sm shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A3D91] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={selectedParcelIds.length === 0 || !selectedDriverId || dispatchMutation.isPending}
            onClick={() => dispatchMutation.mutate()}
          >
            <Send size={16} /> 
            {dispatchMutation.isPending 
              ? 'Assigning...' 
              : selectedParcelIds.length > 1 
                ? `Dispatch ${selectedParcelIds.length} Tasks` 
                : 'Assign & Dispatch Driver'}
          </button>
        </div>
      </div>
    </AppShell>
  )
}