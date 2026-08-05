import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import AppShell from '@/components/layout/AppShell'
import {
  StatCard, TrackingBadge, EmptyState, PageLoader, Modal, Alert
} from '@/components/ui'
import { parcelApi, adminApi } from '@/api'
import {
  ClipboardCheck, CheckCircle2, XCircle, Truck, MapPin,
  Clock, UserCheck, Send, RefreshCw
} from 'lucide-react'
import { formatDate, formatZAR } from '@/utils'
import clsx from 'clsx'

export function DispatcherDashboard() {
  const qc = useQueryClient()
  const [rejectModal, setRejectModal] = useState(null)
  const [rejectReason, setRejectReason] = useState('')

  const { data: pendingData, isLoading: pendingLoading } = useQuery({
    queryKey: ['dispatcher-pending'],
    queryFn: () => parcelApi.queue({ status: 'PendingApproval', pageSize: 50 }),
    refetchInterval: 15000,
  })

  const { data: driversData } = useQuery({
    queryKey: ['dispatcher-drivers'],
    queryFn: async () => {
      const res = await adminApi.drivers()
      return Array.isArray(res) ? res : res?.data || []
    },
    refetchInterval: 30000,
  })

  const { data: outForDeliveryData } = useQuery({
    queryKey: ['dispatcher-out-for-delivery'],
    queryFn: () => parcelApi.queue({ status: 'OutForDelivery', pageSize: 1 }),
    refetchInterval: 30000,
  })

  const pending = pendingData?.data?.items ?? []
  const drivers = driversData ?? []
  const activeDrivers = drivers.filter(d => d.status === 'OnDelivery' || d.status === 'Available').length
  const outForDeliveryCount = outForDeliveryData?.data?.totalCount ?? 0

  const approveMutation = useMutation({
    mutationFn: (id) => parcelApi.approve(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dispatcher-pending'] })
      qc.invalidateQueries({ queryKey: ['admin-stats'] })
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
        <StatCard label="Awaiting Approval" value={pendingData?.data?.totalCount ?? pending.length} icon={Clock} color="bg-[#F59E0B]" />
        <StatCard label="Active Drivers" value={activeDrivers} icon={Truck} color="bg-[#1E63E9]" />
        <StatCard label="Out For Delivery" value={outForDeliveryCount} icon={MapPin} color="bg-[#0A3D91]" />
        
        {/* Clickable Maintenance Swaps Card */}
        <Link to="/dispatcher/swaps" className="block hover:-translate-y-0.5 transition-transform">
          <StatCard label="Maintenance Swaps" value="0" icon={RefreshCw} color="bg-[#64748B]" />
        </Link>
      </div>

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
                {pending.map(p => (
                  <tr key={p.id} className="hover:bg-[#F6FAFF] transition-colors">
                    <td>
                      <div className="flex items-center gap-2">
                        <TrackingBadge value={p.trackingNumber} />
                        {p.isFragile && <span className="text-[10px] font-bold bg-[#FEF3C7] text-[#D97706] px-1.5 py-0.5 rounded">Fragile</span>}
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
                        <button className="btn-danger btn-sm" onClick={() => setRejectModal(p)}>
                          <XCircle size={14} /> Reject
                        </button>
                        <button
                          className="btn-primary btn-sm"
                          disabled={approveMutation.isPending}
                          onClick={() => approveMutation.mutate(p.id)}
                        >
                          <CheckCircle2 size={14} /> Approve
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
  const [selectedParcelId, setSelectedParcelId] = useState('')

  const { data: parcelsData, isLoading: parcelsLoading } = useQuery({
    queryKey: ['dispatcher-ready-queue'],
    queryFn: () => parcelApi.queue({ status: 'CheckedOut', pageSize: 50 }),
    refetchInterval: 15000,
  })

  const { data: driversData, isLoading: driversLoading } = useQuery({
    queryKey: ['dispatcher-[#available-drivers]'],
    queryFn: async () => {
      const res = await adminApi.drivers()
      const list = Array.isArray(res) ? res : res?.data || []
      return list.filter(d => d.status === 'Available' || d.status === 'OnDelivery')
    },
    refetchInterval: 15000,
  })

  const parcels = parcelsData?.data?.items ?? []
  const drivers = driversData ?? []

  const dispatchMutation = useMutation({
    mutationFn: () => parcelApi.dispatch({ parcelId: selectedParcelId, driverId: selectedDriverId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dispatcher-ready-queue'] })
      qc.invalidateQueries({ queryKey: ['dispatcher-drivers'] })
      setSelectedParcelId('')
      setSelectedDriverId('')
    },
  })

  return (
    <AppShell title="Dispatch Queue">
      <div className="page-header">
        <div>
          <h1 className="page-title">Dispatch Queue</h1>
          <p className="page-subtitle">Assign checked-out warehouse parcels to active drivers</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card overflow-hidden">
          <div className="bg-[#F8FAFC] px-5 py-4 border-b border-[#D8E4F5] flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#172554] flex items-center gap-2">
              <Truck size={18} className="text-[#0A3D91]" /> Ready for Dispatch
            </h2>
            <span className="text-xs font-semibold text-[#0A3D91] bg-[#DCEEFF] px-2.5 py-1 rounded-full">{parcels.length} Parcels</span>
          </div>

          {parcelsLoading ? <PageLoader /> : parcels.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="No parcels ready" description="Check-out parcels at the warehouse first to prepare them for dispatch." />
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Tracking #</th>
                    <th>Destination</th>
                    <th>Bin Code</th>
                    <th>Zone</th>
                  </tr>
                </thead>
                <tbody>
                  {parcels.map(p => (
                    <tr
                      key={p.id}
                      onClick={() => setSelectedParcelId(p.id)}
                      className={clsx(
                        "cursor-pointer transition-colors",
                        selectedParcelId === p.id ? "bg-[#DCEEFF]/50 font-semibold" : "hover:bg-[#F6FAFF]"
                      )}
                    >
                      <td className="w-8 text-center">
                        <input
                          type="radio"
                          name="selectedParcel"
                          checked={selectedParcelId === p.id}
                          onChange={() => setSelectedParcelId(p.id)}
                          className="w-4 h-4 text-[#0A3D91]"
                        />
                      </td>
                      <td><TrackingBadge value={p.trackingNumber} /></td>
                      <td className="text-xs text-[#64748B]">{p.destinationCity}</td>
                      <td className="text-xs font-bold text-[#172554]">{p.binCode ?? '—'}</td>
                      <td><span className="text-xs font-semibold px-2 py-0.5 bg-[#F1F5F9] rounded text-[#475569]">{p.zone ?? 'Default'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card p-5 h-max space-y-5">
          <h2 className="text-base font-bold text-[#172554] flex items-center gap-2 border-b border-[#E2E8F0] pb-3">
            <Send size={18} className="text-[#0A3D91]" /> Dispatch Assignment
          </h2>

          {!selectedParcelId ? (
            <Alert type="warning" message="Select a parcel from the list on the left to assign a driver." />
          ) : (
            <div className="bg-[#F8FAFC] p-3 rounded-xl border border-[#E2E8F0] text-xs space-y-1">
              <p className="text-[#94A3B8] uppercase font-bold text-[10px]">Selected Parcel</p>
              <p className="font-mono font-bold text-[#172554]">ID: {selectedParcelId}</p>
            </div>
          )}

          <div>
            <label className="label">Select Available Driver</label>
            {driversLoading ? (
              <p className="text-xs text-[#94A3B8]">Loading drivers...</p>
            ) : (
              <select
                className="input bg-white"
                value={selectedDriverId}
                onChange={(e) => setSelectedDriverId(e.target.value)}
                disabled={!selectedParcelId}
              >
                <option value="">Choose Driver...</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.user?.fullName ?? `Driver #${d.id.substring(0,6)}`} ({d.status})
                  </option>
                ))}
              </select>
            )}
          </div>

          {dispatchMutation.error && (
            <Alert type="error" message={dispatchMutation.error.message} />
          )}

          <button
            className="btn-primary w-full py-3 justify-center text-sm shadow-md"
            disabled={!selectedParcelId || !selectedDriverId || dispatchMutation.isPending}
            onClick={() => dispatchMutation.mutate()}
          >
            <Send size={16} /> Assign & Dispatch Driver
          </button>
        </div>
      </div>
    </AppShell>
  )
}