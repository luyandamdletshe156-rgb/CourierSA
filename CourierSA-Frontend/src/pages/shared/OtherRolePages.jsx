import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import {
  StatCard, StatusPill, TrackingBadge,
  EmptyState, PageLoader, Modal, Alert, Avatar
} from '@/components/ui'
import { parcelApi, adminApi } from '@/api'
import {
  Warehouse, Package, CheckCircle, BarChart3,
  Users, ShieldCheck, Truck, AlertTriangle, UserPlus, UserCheck,
  UserX, FileText, TrendingUp
} from 'lucide-react'
import { formatDate, formatZAR } from '@/utils'
import { useTracking } from '@/context/TrackingContext'
import { Link } from 'react-router-dom'

// ════════════════════════════════════════════════════════════════════════════
// WAREHOUSE STAFF
// ════════════════════════════════════════════════════════════════════════════
export function WarehouseDashboard() {
  const qc = useQueryClient()
  const [checkInModal, setCheckInModal] = useState(null)
  const [selectedBinId, setSelectedBinId] = useState('')
  const [scanConfirm, setScanConfirm] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['parcels-awaiting-wh'],
    queryFn:  () => parcelApi.queue({ status: 'AwaitingCheckIn', pageSize: 50 }),
    refetchInterval: 30000,
  })

  const { data: inWhData } = useQuery({
    queryKey: ['parcels-in-warehouse-count'],
    queryFn:  () => parcelApi.queue({ status: 'InWarehouse', pageSize: 1 }),
    refetchInterval: 30000,
  })

  const awaiting = data?.data?.items ?? []
  const awaitingCount = data?.data?.totalCount ?? awaiting.length
  const inWarehouseCount = inWhData?.data?.totalCount ?? '—'

  // Fetch bin suggestion + full bin list whenever the modal opens for a parcel
  const { data: suggestionData, isLoading: suggestionLoading } = useQuery({
    queryKey: ['sorting-suggestion', checkInModal?.id],
    queryFn:  () => parcelApi.sortingSuggestion(checkInModal.id),
    enabled:  !!checkInModal,
  })

  const suggestion = suggestionData?.data
  const bins = suggestion?.bins ?? []
  const parcelZone = suggestion?.parcelZone

  // Pre-select the suggested bin once the suggestion loads
  useEffect(() => {
    if (suggestion?.suggestedBinId) {
      setSelectedBinId(suggestion.suggestedBinId)
    }
  }, [suggestion?.suggestedBinId])

  const selectedBin = bins.find(b => b.id === selectedBinId)
  const zoneMismatch = selectedBin && parcelZone && selectedBin.zone !== parcelZone
  const scanMismatch = scanConfirm && scanConfirm !== checkInModal?.trackingNumber
  const scanConfirmed = scanConfirm && scanConfirm === checkInModal?.trackingNumber

  const checkInMutation = useMutation({
    mutationFn: ({ id }) => parcelApi.checkIn(id, selectedBinId),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['parcels-awaiting-wh'] })
      qc.invalidateQueries({ queryKey: ['parcels-in-warehouse-count'] })
      qc.invalidateQueries({ queryKey: ['warehouse-inventory'] })
      setCheckInModal(null)
      setSelectedBinId('')
      setScanConfirm('')
    },
  })

  const closeModal = () => {
    setCheckInModal(null)
    setSelectedBinId('')
    setScanConfirm('')
  }

  return (
    <AppShell title="Warehouse">
      <div className="page-header">
        <div>
          <h1 className="page-title">Warehouse Dashboard</h1>
          <p className="page-subtitle">Receive and check in incoming parcels</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <StatCard label="Awaiting check-in" value={awaitingCount}
                  icon={Warehouse} color="bg-[#0A3D91]" />
        <StatCard label="In warehouse" value={inWarehouseCount}
                  icon={Package} color="bg-[#1E63E9]" />
        <StatCard label="Checked in today" value="—"
                  icon={CheckCircle} color="bg-[#10B981]" />
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="text-sm font-bold text-[#172554]">Parcels awaiting check-in</h2>
        </div>

        {isLoading ? <PageLoader /> : awaiting.length === 0 ? (
          <EmptyState icon={CheckCircle} title="All clear" description="No parcels waiting to be checked in." />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Tracking #</th>
                  <th>Service</th>
                  <th>Destination</th>
                  <th>Weight</th>
                  <th>Fragile</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {awaiting.map(p => (
                  <tr key={p.id}>
                    <td><TrackingBadge value={p.trackingNumber} /></td>
                    <td className="capitalize text-xs font-medium text-[#172554]">{p.serviceType}</td>
                    <td className="text-xs text-[#64748B]">{p.destinationCity}</td>
                    <td className="text-xs text-[#64748B] font-mono">{p.weightKg} kg</td>
                    <td>
                      {p.isFragile
                        ? <span className="text-xs font-bold text-[#F59E0B]">⚠ Yes</span>
                        : <span className="text-xs text-[#94A3B8]">No</span>}
                    </td>
                    <td>
                      <button
                        className="btn-primary btn-sm"
                        onClick={() => setCheckInModal(p)}
                      >
                        <Warehouse size={14} /> Check in
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={!!checkInModal} onClose={closeModal} title="Check in parcel" size="sm">
        <p className="text-sm text-[#64748B] mb-2 flex items-center gap-2">
          Checking in <TrackingBadge value={checkInModal?.trackingNumber} />
        </p>

        {parcelZone && (
          <p className="text-xs text-[#64748B] mb-4">
            Parcel zone:{' '}
            <span className="font-semibold text-[#0A3D91]">{parcelZone}</span>
          </p>
        )}

        <label className="label">Confirm tracking number</label>
        <input
          type="text"
          className="input font-mono"
          placeholder="Scan or type tracking number…"
          value={scanConfirm}
          onChange={e => setScanConfirm(e.target.value.toUpperCase())}
          autoFocus
        />
        {scanMismatch && (
          <p className="text-xs text-[#EF4444] mt-1">Does not match this parcel.</p>
        )}
        {scanConfirmed && (
          <p className="text-xs text-[#10B981] mt-1 flex items-center gap-1">
            <CheckCircle size={12} /> Parcel confirmed
          </p>
        )}

        <label className="label mt-4">Warehouse bin</label>

        {suggestionLoading ? (
          <p className="text-xs text-[#94A3B8] py-2">Loading available bins…</p>
        ) : (
          <select
            className="input"
            value={selectedBinId}
            onChange={e => setSelectedBinId(e.target.value)}
          >
            <option value="">Select a bin…</option>
            {bins.map(bin => (
              <option key={bin.id} value={bin.id}>
                {bin.binCode} — {bin.zone} ({bin.currentCount}/{bin.capacity})
                {bin.id === suggestion?.suggestedBinId ? ' — Recommended' : ''}
              </option>
            ))}
          </select>
        )}

        {zoneMismatch && (
          <Alert
            type="warning"
            message={`This bin is in the ${selectedBin.zone} zone, but the parcel is ${parcelZone}. You can still proceed, but double-check this is intentional.`}
            className="mt-4"
          />
        )}

        {checkInMutation.error && (
          <Alert type="error" message={checkInMutation.error.message} className="mt-4" />
        )}

        <div className="flex justify-end gap-3 mt-6">
          <button className="btn-secondary" onClick={closeModal}>Cancel</button>
          <button
            className="btn-primary"
            disabled={!selectedBinId || scanConfirm !== checkInModal?.trackingNumber || checkInMutation.isPending}
            onClick={() => checkInMutation.mutate({ id: checkInModal.id })}
          >
            <CheckCircle size={16} /> Confirm check-in
          </button>
        </div>
      </Modal>
    </AppShell>
  )
}
// ════════════════════════════════════════════════════════════════════════════
// ADMINISTRATOR
// ════════════════════════════════════════════════════════════════════════════
export function AdminDashboard() {
  const { dashboardStats } = useTracking() ?? {}

  // 1. Existing Query: General system stats
  const { data, isLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn:  adminApi.dashboardStats,
    refetchInterval: 60000,
  })

  // 2. New Query: Fetch real-time fleet vehicles to display live counts
  const { data: fleetData } = useQuery({
    queryKey: ['admin-vehicles'],
    queryFn: async () => {
      const res = await adminApi.vehicles()
      return Array.isArray(res) ? res : res?.data || []
    },
    staleTime: 60000,
  })

  const stats = dashboardStats ?? data?.data ?? {}
  const fleetCount = fleetData?.length ?? '—'

  return (
    <AppShell title="Admin Dashboard">
      <div className="page-header">
        <div>
          <h1 className="page-title">System Overview</h1>
          <p className="page-subtitle">Platform-wide metrics and operations</p>
        </div>
      </div>

      {isLoading ? <PageLoader /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard label="Total parcels"    value={stats.totalParcels}    icon={Package}       color="bg-[#0A3D91]" />
            <StatCard label="Pending approval" value={stats.pendingApproval} icon={AlertTriangle} color="bg-[#F59E0B]" />
            <StatCard label="In transit"       value={stats.inTransit}       icon={Truck}         color="bg-[#1E63E9]" />
            <StatCard label="Delivered"        value={stats.delivered}       icon={CheckCircle}   color="bg-[#10B981]" />
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <StatCard label="Registered users" value={stats.totalUsers} icon={Users} color="bg-[#172554]" />
            
            {/* Real-time Fleet Card pointing directly to your new Page */}
            <Link 
              to="/admin/vehicles" 
              className="block group hover:-translate-y-1 transition-transform duration-300"
            >
              <StatCard label="Active Fleet Size" value={fleetCount} icon={Truck} color="bg-[#0A3D91]" />
            </Link>
          </div>
        </>
      )}

      <AdminUsersSection />
    </AppShell>
  )
}

function AdminUsersSection() {
  const qc = useQueryClient()
  const [roleFilter, setRoleFilter] = useState('All')
  const [confirmTarget, setConfirmTarget] = useState(null) // user pending suspend confirmation

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn:  adminApi.users,
  })

  const users = data?.data ?? []

  const suspendMutation = useMutation({
    mutationFn: id => adminApi.suspendUser(id),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      setConfirmTarget(null)
    },
  })

  const reactivateMutation = useMutation({
    mutationFn: id => adminApi.reactivateUser(id),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['admin-users'] })
      setConfirmTarget(null)
    },
  })

  const activeMutation = confirmTarget?.status === 'Active' ? suspendMutation : reactivateMutation

  const ROLE_COLORS = {
    Administrator:  'bg-[#172554]/10 text-[#172554] border-[#172554]/20',
    Dispatcher:     'bg-[#1E63E9]/10 text-[#1E63E9] border-[#1E63E9]/20',
    WarehouseStaff: 'bg-[#0A3D91]/10 text-[#0A3D91] border-[#0A3D91]/20',
    Driver:         'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20',
    BusinessClient: 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20',
    Customer:       'bg-[#64748B]/10 text-[#64748B] border-[#64748B]/20',
  }

  const ROLE_FILTERS = ['All', 'Customer', 'BusinessClient', 'Dispatcher', 'WarehouseStaff', 'Driver', 'Administrator']

  const filteredUsers = roleFilter === 'All' ? users : users.filter(u => u.role === roleFilter)

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="text-sm font-bold text-[#172554] flex items-center gap-2">
          <Users size={16} className="text-[#0A3D91]" /> All users
          <span className="text-xs font-normal text-[#94A3B8]">({filteredUsers.length})</span>
        </h2>
        <Link to="/admin/staff/new" className="btn-primary btn-sm">
          <UserPlus size={14} /> Add staff
        </Link>
      </div>

      {/* Role filter chips */}
      <div className="flex gap-2 flex-wrap mb-5">
        {ROLE_FILTERS.map(r => (
          <button
            key={r}
            onClick={() => setRoleFilter(r)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              roleFilter === r
                ? 'bg-[#0A3D91] text-white border-[#0A3D91]'
                : 'bg-white text-[#64748B] border-[#D8E4F5] hover:border-[#1E63E9]/50 hover:text-[#172554]'
            }`}
          >
            {r === 'All' ? 'All' : r.replace(/([A-Z])/g, ' $1').trim()}
          </button>
        ))}
      </div>

      {isLoading ? <PageLoader /> : filteredUsers.length === 0 ? (
        <EmptyState icon={Users} title="No users in this category" />
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last login</th>
                <th>Registered</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(u => (
                <tr key={u.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <Avatar name={`${u.firstName} ${u.lastName}`} size="sm" />
                      <div>
                        <p className="text-sm font-semibold text-[#172554]">
                          {u.firstName} {u.lastName}
                        </p>
                        <p className="text-xs text-[#64748B]">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md border tracking-wider uppercase ${ROLE_COLORS[u.role] ?? 'bg-[#F6FAFF] text-[#64748B] border-[#D8E4F5]'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td>
                    <span className={`text-xs font-bold ${u.status === 'Active' ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                      {u.status}
                    </span>
                  </td>
                  <td className="text-xs text-[#94A3B8] font-mono">
                    {u.lastLoginAt ? formatDate(u.lastLoginAt) : 'Never'}
                  </td>
                  <td className="text-xs text-[#94A3B8] font-mono">{formatDate(u.createdAt)}</td>
                  <td>
                    {u.role === 'Administrator' ? (
                      <span className="text-[11px] text-[#94A3B8] italic">Protected</span>
                    ) : u.status === 'Active' ? (
                      <button className="btn-danger btn-sm" onClick={() => setConfirmTarget(u)}>
                        <UserX size={14} /> Suspend
                      </button>
                    ) : (
                      <button className="btn-secondary btn-sm" onClick={() => setConfirmTarget(u)}>
                        <UserCheck size={14} /> Reactivate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={!!confirmTarget}
        onClose={() => setConfirmTarget(null)}
        title={confirmTarget?.status === 'Active' ? 'Suspend user?' : 'Reactivate user?'}
        size="sm"
      >
        <p className="text-sm text-[#64748B] leading-relaxed mb-2">
          <strong className="text-[#172554]">
            {confirmTarget?.firstName} {confirmTarget?.lastName}
          </strong>{' '}
          {confirmTarget?.status === 'Active'
            ? 'will immediately lose access to their account. You can reactivate them at any time from this page.'
            : 'will regain access to their account with their existing password.'}
        </p>
        {activeMutation.error && (
          <Alert type="error" message={activeMutation.error.message} className="mt-3" />
        )}
        <div className="flex justify-end gap-3 mt-6">
          <button className="btn-secondary" onClick={() => setConfirmTarget(null)}>Cancel</button>
          <button
            className={confirmTarget?.status === 'Active' ? 'btn-danger' : 'btn-primary'}
            disabled={activeMutation.isPending}
            onClick={() => activeMutation.mutate(confirmTarget.id)}
          >
            {confirmTarget?.status === 'Active'
              ? <><UserX size={16} /> Confirm suspend</>
              : <><UserCheck size={16} /> Confirm reactivate</>}
          </button>
        </div>
      </Modal>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// BUSINESS CLIENT
// ════════════════════════════════════════════════════════════════════════════
export function BusinessDashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['biz-parcels', { page: 1, pageSize: 10 }],
    queryFn:  () => parcelApi.list({ page: 1, pageSize: 10 }),
  })

  const parcels = data?.data?.items ?? []
  const total   = data?.data?.totalCount ?? 0

  const delivered = parcels.filter(p => p.status === 'Delivered').length
  const transit   = parcels.filter(p => p.status === 'OutForDelivery').length

  return (
    <AppShell title="Business Dashboard">
      <div className="page-header">
        <div>
          <h1 className="page-title">Business Dashboard</h1>
          <p className="page-subtitle">Manage your company's shipments and billing</p>
        </div>
        <div className="flex gap-3">
          <a href="/business/bulk-upload" className="btn-secondary">
            <FileText size={16} /> Bulk upload
          </a>
          <a href="/business/parcels" className="btn-primary">
            <Package size={16} /> View all parcels
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total parcels"  value={total}     icon={Package}     color="bg-[#172554]" />
        <StatCard label="In transit"     value={transit}   icon={Truck}       color="bg-[#1E63E9]"  />
        <StatCard label="Delivered"      value={delivered} icon={CheckCircle} color="bg-[#10B981]"/>
        <StatCard label="This month"     value="—"         icon={TrendingUp}  color="bg-[#0A3D91]" />
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="text-sm font-bold text-[#172554]">Recent shipments</h2>
        </div>
        {isLoading ? <PageLoader /> : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Tracking #</th>
                  <th>Service</th>
                  <th>Destination</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {parcels.map(p => (
                  <tr key={p.id}>
                    <td><TrackingBadge value={p.trackingNumber} /></td>
                    <td className="text-xs capitalize font-medium text-[#172554]">{p.serviceType}</td>
                    <td className="text-xs text-[#64748B]">{p.destinationCity}</td>
                    <td><StatusPill status={p.status} /></td>
                    <td className="text-xs font-bold text-[#172554] font-mono">
                      {p.quoteAmountZAR ? formatZAR(p.quoteAmountZAR) : '—'}
                    </td>
                    <td className="text-xs text-[#94A3B8] font-mono">{formatDate(p.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  )
}