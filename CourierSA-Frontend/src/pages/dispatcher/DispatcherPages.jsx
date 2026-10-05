import { useState, Fragment } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import AppShell from '@/components/layout/AppShell'
import {
  StatCard, TrackingBadge, EmptyState, PageLoader, Modal, Alert
} from '@/components/ui'
import StatusBadge from '@/components/ui/StatusBadge'
import { parcelApi, driverApi, returnApi, dispatcherApi } from '@/api'
import {
  ClipboardCheck, CheckCircle2, XCircle, Truck, MapPin,
  Clock, UserCheck, Send, RefreshCw, AlertTriangle, Package, RotateCcw, Weight
} from 'lucide-react'
import { formatDate, formatZAR } from '@/utils'
import clsx from 'clsx'

// ── Shared helpers ───────────────────────────────────────────────────────────
// Safely pull the item list out of the different shapes the API returns.
const extractItems = (data) =>
  Array.isArray(data) ? data : data?.data?.items ?? data?.items ?? data?.data ?? []

// Driver display name, tolerant of the different DTO shapes in use.
const getDriverName = (d, index) => {
  const id = d?.id || d?.driverId || d?.userId
  return (d?.firstName && d?.lastName && d.firstName !== '—')
    ? `${d.firstName} ${d.lastName}`
    : (d?.user?.fullName || d?.fullName || d?.name || d?.driverName || `Driver #${id ? String(id).substring(0, 6) : index}`)
}

// Wait-time triage: dispatchers should see the oldest bookings first without
// having to eyeball timestamps. Thresholds are deliberately generous —
// most bookings should clear well before "Aging" ever shows.
function getWaitState(createdAt) {
  const hours = (Date.now() - new Date(createdAt).getTime()) / 36e5
  if (hours >= 4) return { label: 'Urgent', dot: 'bg-[#DC2626]', text: 'text-[#DC2626]', bg: 'bg-[#FEF2F2]', border: 'border-l-[#DC2626]' }
  if (hours >= 2) return { label: 'Aging', dot: 'bg-[#D97706]', text: 'text-[#D97706]', bg: 'bg-[#FFFBEB]', border: 'border-l-[#D97706]' }
  return null
}

// ── Dispatcher Dashboard — approve or reject incoming bookings ───────────────
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

  // Oldest booking first, so the longest-waiting request is always at the top.
  const pending = [...extractItems(pendingData)]
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
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
      closeReject()
    },
  })

  const closeReject = () => {
    setRejectModal(null)
    setRejectReason('')
    rejectMutation.reset()
  }

  return (
    <AppShell title="Dispatcher Dashboard">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dispatcher Dashboard</h1>
          <p className="page-subtitle">Review incoming customer bookings & verify pickup details</p>
        </div>
      </div>

      {/* What needs attention first */}
      {urgentCount > 0 && (
        <div className="flex items-center gap-2 mb-4 px-4 py-2.5 bg-[#FEF2F2] border border-[#DC2626]/20 rounded-xl text-xs font-semibold text-[#DC2626]">
          <AlertTriangle size={14} />
          {urgentCount} booking{urgentCount !== 1 ? 's have' : ' has'} been waiting over 4 hours — review these first.
        </div>
      )}

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

        {/* Clickable Maintenance Swaps card. The count is not wired to data yet, so it shows a dash
            rather than a hardcoded 0 that could be mistaken for a real number. */}
        <Link to="/dispatcher/swaps" className="block hover:-translate-y-0.5 transition-transform duration-200 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A3D91] focus-visible:ring-offset-2">
          <StatCard label="Maintenance Swaps" value="—" icon={RefreshCw} color="bg-[#64748B]" />
        </Link>
      </div>

      {approveMutation.error && (
        <Alert type="error" message={approveMutation.error.message} className="mb-4" />
      )}

      {/* Queue Table */}
      <div className="card overflow-hidden">
        <div className="bg-[#F8FAFC] px-5 py-4 border-b border-[#D8E4F5] space-y-1">
          <h2 className="text-sm font-bold text-[#172554] flex items-center gap-2">
            <ClipboardCheck size={18} className="text-[#0A3D91]" /> Pending Approval Queue
            <span className="text-xs font-normal text-[#94A3B8]">({pending.length})</span>
          </h2>
          <p className="text-xs text-[#64748B]">Oldest bookings first.</p>
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
                  <th>Booked</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {pending.map(p => {
                  const wait = getWaitState(p.createdAt)
                  const approvingThis = approveMutation.isPending && approveMutation.variables === p.id
                  return (
                    <tr
                      key={p.id}
                      className={clsx(
                        'transition-colors duration-150 border-l-4',
                        wait ? clsx(wait.bg, wait.border) : 'border-l-transparent hover:bg-[#F6FAFF]'
                      )}
                    >
                      <td>
                        <div className="flex items-center gap-2 flex-wrap">
                          <TrackingBadge value={p.trackingNumber} />
                          {p.isFragile && <span className="text-[10px] font-bold bg-[#FEF3C7] text-[#D97706] px-1.5 py-0.5 rounded">Fragile</span>}
                          {wait && (
                            <span className={clsx('flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded', wait.text)}>
                              <span className={clsx('w-1.5 h-1.5 rounded-full', wait.dot)} />
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
                            disabled={approveMutation.isPending}
                            onClick={() => setRejectModal(p)}
                          >
                            <XCircle size={14} /> Reject
                          </button>
                          <button
                            className="btn-primary btn-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A3D91] focus-visible:ring-offset-1"
                            disabled={approveMutation.isPending}
                            onClick={() => approveMutation.mutate(p.id)}
                          >
                            <CheckCircle2 size={14} /> {approvingThis ? 'Approving…' : 'Approve'}
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

      <Modal open={!!rejectModal} onClose={closeReject} title="Reject Booking Request" size="sm">
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
          <button className="btn-secondary" onClick={closeReject}>Cancel</button>
          <button
            className="btn-danger"
            disabled={!rejectReason.trim() || rejectMutation.isPending}
            onClick={() => rejectMutation.mutate()}
          >
            {rejectMutation.isPending ? 'Rejecting…' : 'Confirm Rejection'}
          </button>
        </div>
      </Modal>
    </AppShell>
  )
}

// ── Dispatch Queue — plan routes for pickups and deliveries ─────────────────
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

  // 2. Fetch Pickups (Freshly approved bookings that need to be collected).
  //    The API hides pickups that already have an active driver assigned.
  const { data: approvedData, isLoading: approvedLoading } = useQuery({
    queryKey: ['dispatcher-ready-queue', 'Approved'],
    queryFn: () => parcelApi.queue({ status: 'Approved', pageSize: 50 }),
    refetchInterval: 15000,
  })

  const deliveries = extractItems(checkedOutData)
  const pickups = extractItems(approvedData)

  // Plan Route Dispatch: order by the service level chosen at booking
  // (SameDay first ... Economy last), then by booking time within a level.
  const SERVICE_RANK = { SameDay: 4, Overnight: 3, Express: 2, Standard: 1, Economy: 0 }
  const parcels = [...pickups, ...deliveries].sort((a, b) =>
    (SERVICE_RANK[b.serviceType] ?? 1) - (SERVICE_RANK[a.serviceType] ?? 1) ||
    new Date(a.createdAt) - new Date(b.createdAt))
  const parcelsLoading = checkedOutLoading || approvedLoading

  const { data: driversData, isLoading: driversLoading } = useQuery({
    queryKey: ['dispatcher-available-drivers'],
    queryFn: async () => {
      const res = await driverApi.available()
      return Array.isArray(res) ? res : res?.data || []
    },
    refetchInterval: 15000,
  })

  // Validate & Adjust Vehicle Payload — pull vehicle capacity so we can warn
  // before an overweight route is held for review.
  const { data: vehiclesData } = useQuery({
    queryKey: ['dispatcher-vehicles-capacity'],
    queryFn: () => dispatcherApi.vehicles(),
    refetchInterval: 30000,
  })

  const vehicles = Array.isArray(vehiclesData) ? vehiclesData
    : Array.isArray(vehiclesData?.data) ? vehiclesData.data : []

  const vehicleByDriverId = vehicles.reduce((map, v) => {
    if (v.assignedDriverId) map[v.assignedDriverId] = v
    return map
  }, {})

  const drivers = driversData ?? []
  const selectedParcels = parcels.filter(p => selectedParcelIds.includes(p.id))
  const totalWeightKg = selectedParcels.reduce((sum, p) => sum + (p.weightKg ?? 0), 0)
  const selectedVehicle = selectedDriverId ? vehicleByDriverId[selectedDriverId] : null
  const isOverCapacity = !!selectedVehicle && totalWeightKg > selectedVehicle.payloadCapacityKg
  const capacityUtilizationPercent = selectedVehicle?.payloadCapacityKg
    ? Math.round((totalWeightKg / selectedVehicle.payloadCapacityKg) * 1000) / 10
    : null

  // A route made only of pickups goes straight to the driver (no warehouse release step)
  const isPickupOnly = selectedParcels.length > 0 && selectedParcels.every(p => p.status === 'Approved')

  // The city a task is routed by: where it is collected (pickups) or where it is delivered (deliveries)
  const taskCityOf = (p) =>
    (p.status === 'Approved' ? p.pickupCity : (p.city || p.destinationCity)) || ''

  // Proximity Lock: Lock selection to the city of the FIRST selected item
  const activeCity = selectedParcels.length > 0 ? taskCityOf(selectedParcels[0]) : null

  // Pickups are collected from customers and deliveries leave the warehouse, so they can't share a route
  const activeIsPickup = selectedParcels.length > 0 ? selectedParcels[0].status === 'Approved' : null

  const handleToggleParcel = (id) => {
    setSelectedParcelIds(prev => {
      const next = prev.includes(id) ? prev.filter(pId => pId !== id) : [...prev, id]
      if (next.length === 0) setSelectedDriverId('')
      return next
    })
  }

  const [dispatchSuccessMessage, setDispatchSuccessMessage] = useState('')

  const dispatchMutation = useMutation({
    mutationFn: () => {
      // Plan Route Dispatch: the route is planned and validated here. Pickup-only routes
      // within the vehicle limit go straight to the driver; routes with deliveries are
      // released by warehouse staff after they verify the manifest.
      return parcelApi.planRoute({
        parcelIds: selectedParcelIds,
        driverId: selectedDriverId
      })
    },
    onSuccess: (result) => {
      const summary = result?.data ?? result
      if (summary?.status === 'PendingPayloadReview') {
        setDispatchSuccessMessage('Route is over the vehicle limit and was held. Open Payload Review to reallocate or split it.')
      } else if (summary?.status === 'InProgress') {
        setDispatchSuccessMessage('Pickup route sent straight to the driver.')
      } else if (summary?.capacityUtilizationPercent != null) {
        setDispatchSuccessMessage(
          `Route planned — ${summary.capacityUtilizationPercent}% of ${summary.vehicleRegistration ?? 'vehicle'}'s capacity used. Waiting for warehouse release.`
        )
      } else {
        setDispatchSuccessMessage('Route planned. Waiting for warehouse release.')
      }
      qc.invalidateQueries({ queryKey: ['dispatcher-ready-queue'] })
      qc.invalidateQueries({ queryKey: ['dispatcher-available-drivers'] })
      qc.invalidateQueries({ queryKey: ['dispatcher-vehicles-capacity'] })
      setSelectedParcelIds([])
      setSelectedDriverId('')
    },
  })

  // ── Grouping for display ────────────────────────────────────────────────────
  // A route holds one task type from one city, so the list is grouped the same way:
  // type first (pickups, deliveries), then city. Order inside a city keeps the
  // service-level sort above, and cities appear in order of their most urgent task.
  const groupByCity = (items) => {
    const map = new Map()
    items.forEach(p => {
      const city = taskCityOf(p)
      if (!map.has(city)) map.set(city, [])
      map.get(city).push(p)
    })
    return [...map].map(([city, list]) => ({ city, items: list }))
  }
  const sections = [
    { key: 'pickup', title: 'Pickups', note: 'collect from the customer', icon: Package, items: parcels.filter(p => p.status === 'Approved') },
    { key: 'delivery', title: 'Deliveries', note: 'leave the warehouse', icon: MapPin, items: parcels.filter(p => p.status !== 'Approved') },
  ].filter(s => s.items.length > 0).map(s => ({ ...s, cities: groupByCity(s.items) }))

  return (
    <AppShell title="Dispatch Queue">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dispatch Queue</h1>
          <p className="page-subtitle">Assign drivers to collect new bookings (Pickups) and dispatch warehouse parcels (Deliveries)</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: the task list, grouped by type and city */}
        <div className="lg:col-span-2 card overflow-hidden">
          <div className="bg-[#F8FAFC] px-5 py-4 border-b border-[#D8E4F5] space-y-1">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#172554] flex items-center gap-2">
                <Truck size={18} className="text-[#0A3D91]" /> Ready for Dispatch
              </h2>
              <span className="text-xs font-semibold text-[#0A3D91] bg-[#DCEEFF] px-2.5 py-1 rounded-full">{parcels.length} Tasks</span>
            </div>
            <p className="text-xs text-[#64748B]">
              One route holds one task type from one city. Tick a task and the ones that can't join it are greyed out.
            </p>
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
                    <th>Service</th>
                    <th>Weight</th>
                    <th>Bin Code</th>
                  </tr>
                </thead>
                <tbody>
                  {sections.map(section => (
                    <Fragment key={section.key}>
                      <tr className="bg-[#F1F5F9]">
                        <td colSpan={5} className="py-2">
                          <span className="flex items-center gap-2 text-xs font-bold text-[#172554]">
                            <section.icon size={13} /> {section.title} ({section.items.length})
                            <span className="font-normal text-[#64748B]">{section.note}</span>
                          </span>
                        </td>
                      </tr>

                      {section.cities.map(group => (
                        <Fragment key={`${section.key}-${group.city}`}>
                          <tr>
                            <td colSpan={5} className="py-1.5 bg-[#F8FAFC]">
                              <span className="flex items-center gap-1.5 text-xs font-semibold text-[#0A3D91]">
                                <MapPin size={12} /> {group.city || 'No city'} ({group.items.length})
                              </span>
                            </td>
                          </tr>

                          {group.items.map(p => {
                            const isPickup = p.status === 'Approved'
                            const isSelected = selectedParcelIds.includes(p.id)
                            const taskCity = taskCityOf(p)

                            // Disable checkbox if the task is a different type (pickup vs delivery) or outside the active city
                            const isWrongType = activeIsPickup !== null && isPickup !== activeIsPickup
                            const isOutOfArea = isWrongType || (activeCity && taskCity !== activeCity)

                            return (
                              <tr
                                key={p.id}
                                onClick={() => {
                                  if (!isOutOfArea || isSelected) handleToggleParcel(p.id)
                                }}
                                className={clsx(
                                  'transition-colors duration-150',
                                  isOutOfArea && !isSelected ? 'opacity-40 bg-[#F8FAFC] cursor-not-allowed' : 'cursor-pointer hover:bg-[#F6FAFF]',
                                  isSelected ? 'bg-[#DCEEFF]/50 font-semibold' : ''
                                )}
                              >
                                <td className="w-8 text-center" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    disabled={isOutOfArea && !isSelected}
                                    onChange={() => handleToggleParcel(p.id)}
                                    className="w-4 h-4 text-[#0A3D91] rounded border-[#D8E4F5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A3D91] disabled:cursor-not-allowed"
                                    title={isWrongType ? "Pickups and deliveries can't share a route" : isOutOfArea ? 'Cannot batch tasks from different cities' : ''}
                                  />
                                </td>
                                <td><TrackingBadge value={p.trackingNumber} /></td>
                                <td className="text-xs text-[#64748B]">{p.serviceType || '—'}</td>
                                <td className="text-xs text-[#64748B]">{p.weightKg != null ? `${p.weightKg} kg` : '—'}</td>
                                <td className="text-xs font-bold text-[#172554]">{p.binCode ?? '—'}</td>
                              </tr>
                            )
                          })}
                        </Fragment>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right: build the route, in order */}
        <div className="card p-5 h-max space-y-5 lg:sticky lg:top-6">
          <h2 className="text-base font-bold text-[#172554] flex items-center gap-2 border-b border-[#E2E8F0] pb-3">
            <Send size={18} className="text-[#0A3D91]" /> Plan a Route
          </h2>

          {/* Result of the last dispatch stays at the top where it is seen */}
          {dispatchSuccessMessage && <Alert type="success" message={dispatchSuccessMessage} />}
          {dispatchMutation.error && <Alert type="error" message={dispatchMutation.error.message} />}

          {/* 1. Tasks */}
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#172554]">1. Tasks</h3>
              {selectedParcels.length > 0 && (
                <span className="text-xs font-semibold text-[#0A3D91] flex items-center gap-1">
                  <MapPin size={12} /> {activeCity} · {totalWeightKg} kg
                </span>
              )}
            </div>

            {selectedParcels.length === 0 ? (
              <p className="text-xs text-[#64748B] bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3 py-2.5">
                Tick one or more tasks in the list to start a route.
              </p>
            ) : (
              <div className="bg-[#F8FAFC] p-3 rounded-xl border border-[#E2E8F0] space-y-2 animate-[fadeIn_0.15s_ease-in]">
                <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
                  {selectedParcels.map(p => (
                    <div key={p.id} className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-[#D8E4F5]">
                      <TrackingBadge value={p.trackingNumber} />
                      <span className={clsx(
                        'text-[10px] font-bold px-1.5 py-0.5 rounded uppercase',
                        p.status === 'Approved' ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'
                      )}>
                        {p.status === 'Approved' ? 'Pickup' : 'Delivery'}
                      </span>
                    </div>
                  ))}
                </div>
                {isPickupOnly && (
                  <p className="text-[11px] text-[#4338CA] bg-[#E0E7FF] px-2.5 py-1.5 rounded-lg">
                    Pickups are collected from the customer, so this route goes straight to the driver.
                  </p>
                )}
              </div>
            )}
          </section>

          {/* 2. Driver */}
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-[#172554]">2. Driver</h3>
            {driversLoading ? (
              <p className="text-xs text-[#94A3B8]">Loading drivers...</p>
            ) : drivers.length === 0 ? (
              <div className="flex items-start gap-2 px-3 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-xs text-[#64748B]">
                <UserCheck size={14} className="text-[#94A3B8] mt-0.5 flex-shrink-0" />
                No drivers currently available — all active drivers are mid-route.
              </div>
            ) : (
              <>
                <select
                  className="input bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A3D91]"
                  value={selectedDriverId}
                  onChange={(e) => setSelectedDriverId(e.target.value)}
                  disabled={selectedParcelIds.length === 0}
                >
                  <option value="" disabled hidden>Choose available driver...</option>
                  {drivers.map((d, index) => {
                    const actualId = d?.id || d?.driverId || d?.userId
                    return <option key={actualId || index} value={actualId || ''}>{getDriverName(d, index)}</option>
                  })}
                </select>
                {selectedParcelIds.length === 0 && (
                  <p className="text-xs text-[#64748B]">Choose tasks first to enable this.</p>
                )}
              </>
            )}
          </section>

          {/* 3. Capacity check, shown once a driver with a vehicle is chosen */}
          {selectedVehicle && (
            <section className="space-y-2">
              <h3 className="text-sm font-bold text-[#172554]">3. Capacity check</h3>
              <div className={clsx(
                'flex items-start gap-2.5 px-3.5 py-3 rounded-xl border text-xs',
                isOverCapacity
                  ? 'bg-[#FEF2F2] border-[#FCA5A5] text-[#B91C1C]'
                  : 'bg-[#F0FDF4] border-[#BBF7D0] text-[#166534]'
              )}>
                <Weight size={15} className="mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-bold">
                    {totalWeightKg} kg / {selectedVehicle.payloadCapacityKg} kg capacity
                    {capacityUtilizationPercent != null && ` (${capacityUtilizationPercent}%)`}
                  </p>
                  <p className="mt-0.5">
                    {isOverCapacity
                      ? `Exceeds ${selectedVehicle.registrationNumber}'s payload capacity — it will be held for payload review, where you can reallocate parcels or split the route.`
                      : `${selectedVehicle.registrationNumber} has enough capacity for this route.`}
                  </p>
                </div>
              </div>
            </section>
          )}

          <button
            className="btn-primary w-full py-3 justify-center text-sm shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A3D91] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={selectedParcelIds.length === 0 || !selectedDriverId || dispatchMutation.isPending}
            onClick={() => { setDispatchSuccessMessage(''); dispatchMutation.mutate() }}
          >
            <Send size={16} />
            {dispatchMutation.isPending
              ? 'Planning...'
              : isOverCapacity
                ? 'Send for Payload Review'
                : isPickupOnly
                  ? (selectedParcelIds.length > 1
                      ? `Send to Driver (${selectedParcelIds.length} Pickups)`
                      : 'Send to Driver')
                  : selectedParcelIds.length > 1
                    ? `Plan Route (${selectedParcelIds.length} Tasks)`
                    : 'Plan Route'}
          </button>
        </div>
      </div>
    </AppShell>
  )
}

// ── Return Collections — assign a driver to collect an approved return
//    from the customer's address. Deliberately simple: single-select,
//    no batching, reuses the flat 15% handling-fee model (no separate
//    collection quote). ───────────────────────────────────────────────────────
export function ReturnCollectionsQueue() {
  const qc = useQueryClient()
  const [selectedReturnId, setSelectedReturnId] = useState(null)
  const [selectedDriverId, setSelectedDriverId] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const { data: returnsData, isLoading: returnsLoading } = useQuery({
    queryKey: ['return-requests', 'queue', 'Approved'],
    queryFn: () => returnApi.queue('Approved'),
    refetchInterval: 15000,
  })

  const { data: driversData, isLoading: driversLoading } = useQuery({
    queryKey: ['dispatcher-available-drivers'],
    queryFn: async () => {
      const res = await driverApi.available()
      return Array.isArray(res) ? res : res?.data || []
    },
    refetchInterval: 15000,
  })

  const returns = extractItems(returnsData)
  const drivers = driversData ?? []
  const selectedReturn = returns.find(r => r.id === selectedReturnId) ?? null

  const dispatchMutation = useMutation({
    mutationFn: () => returnApi.dispatchCollection(selectedReturnId, selectedDriverId),
    onSuccess: () => {
      setSuccessMessage(`Collection assigned for ${selectedReturn?.raNumber ?? 'the return'}. The driver can see it in their collections.`)
      qc.invalidateQueries({ queryKey: ['return-requests'] })
      qc.invalidateQueries({ queryKey: ['dispatcher-available-drivers'] })
      setSelectedReturnId(null)
      setSelectedDriverId('')
    },
  })

  const selectReturn = (id) => {
    setSuccessMessage('')
    dispatchMutation.reset()
    setSelectedReturnId(id)
  }

  return (
    <AppShell title="Return Collections">
      <div className="page-header">
        <div>
          <h1 className="page-title">Return Collections</h1>
          <p className="page-subtitle">Assign a driver to collect an approved return from the customer's address</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: returns waiting for a driver */}
        <div className="lg:col-span-2 card overflow-hidden">
          <div className="bg-[#F8FAFC] px-5 py-4 border-b border-[#D8E4F5] space-y-1">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-[#172554] flex items-center gap-2">
                <RotateCcw size={18} className="text-[#0A3D91]" /> Awaiting Collection Dispatch
              </h2>
              <span className="text-xs font-semibold text-[#0A3D91] bg-[#DCEEFF] px-2.5 py-1 rounded-full">{returns.length} Returns</span>
            </div>
            <p className="text-xs text-[#64748B]">Click a return to assign a driver. One driver per return.</p>
          </div>

          {returnsLoading ? <PageLoader /> : returns.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Queue is clear" description="No approved returns are currently waiting for a collection driver." />
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>RA Number</th>
                    <th>Tracking #</th>
                    <th>Collection Address</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {returns.map(r => {
                    const isSelected = selectedReturnId === r.id
                    return (
                      <tr
                        key={r.id}
                        onClick={() => selectReturn(r.id)}
                        className={clsx(
                          'cursor-pointer transition-colors duration-150',
                          isSelected ? 'bg-[#DCEEFF]/50 font-semibold' : 'hover:bg-[#F6FAFF]'
                        )}
                      >
                        <td className="text-sm font-bold text-[#172554]">{r.raNumber}</td>
                        <td><TrackingBadge value={r.trackingNumber} /></td>
                        <td className="text-xs text-[#64748B]">
                          {r.collectionAddress
                            ? `${r.collectionAddress.streetAddress}, ${r.collectionAddress.city}`
                            : '—'}
                        </td>
                        <td><StatusBadge status={r.status} /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right: assign a driver, in order */}
        <div className="card p-5 h-max space-y-5 lg:sticky lg:top-6">
          <h2 className="text-base font-bold text-[#172554] flex items-center gap-2 border-b border-[#E2E8F0] pb-3">
            <Send size={18} className="text-[#0A3D91]" /> Assign a Collection
          </h2>

          {/* Result of the last dispatch stays at the top where it is seen */}
          {successMessage && <Alert type="success" message={successMessage} />}
          {dispatchMutation.error && <Alert type="error" message={dispatchMutation.error.message} />}

          {/* 1. Return */}
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-[#172554]">1. Return</h3>
            {!selectedReturn ? (
              <p className="text-xs text-[#64748B] bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3 py-2.5">
                Click a return in the list to start.
              </p>
            ) : (
              <div className="bg-[#F8FAFC] p-3 rounded-xl border border-[#E2E8F0] space-y-2 animate-[fadeIn_0.15s_ease-in]">
                <div className="flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-[#D8E4F5]">
                  <span className="text-sm font-bold text-[#172554]">{selectedReturn.raNumber}</span>
                  <TrackingBadge value={selectedReturn.trackingNumber} />
                </div>
                {selectedReturn.collectionAddress && (
                  <p className="text-xs text-[#64748B] flex items-start gap-1.5">
                    <MapPin size={12} className="mt-0.5 flex-shrink-0" />
                    {selectedReturn.collectionAddress.streetAddress}, {selectedReturn.collectionAddress.city}
                  </p>
                )}
              </div>
            )}
          </section>

          {/* 2. Driver */}
          <section className="space-y-2">
            <h3 className="text-sm font-bold text-[#172554]">2. Driver</h3>
            {driversLoading ? (
              <p className="text-xs text-[#94A3B8]">Loading drivers...</p>
            ) : drivers.length === 0 ? (
              <div className="flex items-start gap-2 px-3 py-2.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl text-xs text-[#64748B]">
                <UserCheck size={14} className="text-[#94A3B8] mt-0.5 flex-shrink-0" />
                No drivers currently available — all active drivers are mid-route.
              </div>
            ) : (
              <>
                <select
                  className="input bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A3D91]"
                  value={selectedDriverId}
                  onChange={(e) => setSelectedDriverId(e.target.value)}
                  disabled={!selectedReturn}
                >
                  <option value="" disabled hidden>Choose available driver...</option>
                  {drivers.map((d, index) => {
                    const actualId = d?.id || d?.driverId || d?.userId
                    return <option key={actualId || index} value={actualId || ''}>{getDriverName(d, index)}</option>
                  })}
                </select>
                {!selectedReturn && <p className="text-xs text-[#64748B]">Choose a return first to enable this.</p>}
              </>
            )}
          </section>

          <button
            className="btn-primary w-full py-3 justify-center text-sm shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A3D91] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!selectedReturn || !selectedDriverId || dispatchMutation.isPending}
            onClick={() => { setSuccessMessage(''); dispatchMutation.mutate() }}
          >
            <Send size={16} />
            {dispatchMutation.isPending ? 'Assigning...' : 'Assign & Dispatch Driver'}
          </button>
        </div>
      </div>
    </AppShell>
  )
}