import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import AppShell from '@/components/layout/AppShell'
import { StatCard, EmptyState, PageLoader, Modal, Alert, Avatar } from '@/components/ui'
import { adminApi } from '@/api'
import { 
  Package, 
  Truck, 
  CheckCircle, 
  AlertTriangle, 
  Users, 
  UserPlus, 
  UserCheck, 
  UserX, 
  RotateCcw, 
  Check, 
  Clock 
} from 'lucide-react'
import { formatDate } from '@/utils'
import { useTracking } from '@/context/TrackingContext'

export function AdminDashboard() {
  const { dashboardStats } = useTracking() ?? {}

  const { data, isLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: adminApi.dashboardStats,
    refetchInterval: 60000,
  })

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
            <StatCard label="Total parcels" value={stats.totalParcels} icon={Package} color="bg-[#0A3D91]" />
            <StatCard label="Pending approval" value={stats.pendingApproval} icon={AlertTriangle} color="bg-[#F59E0B]" />
            <StatCard label="In transit" value={stats.inTransit} icon={Truck} color="bg-[#1E63E9]" />
            <StatCard label="Delivered" value={stats.delivered} icon={CheckCircle} color="bg-[#10B981]" />
          </div>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <StatCard label="Registered users" value={stats.totalUsers} icon={Users} color="bg-[#172554]" />
            <Link to="/admin/vehicles" className="block group hover:-translate-y-1 transition-transform duration-300">
              <StatCard label="Active Fleet Size" value={fleetCount} icon={Truck} color="bg-[#0A3D91]" />
            </Link>
          </div>
        </>
      )}

      {/* ✅ NEW SECTION: Pending Return Authorizations Queue */}
      <div className="mb-6">
        <AdminReturnApprovalsSection />
      </div>

      {/* Existing Users Management Section */}
      <AdminUsersSection />
    </AppShell>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// ➕ NEW COMPONENT: PENDING RETURN AUTHORIZATIONS QUEUE
// ══════════════════════════════════════════════════════════════════════════════
function AdminReturnApprovalsSection() {
  const qc = useQueryClient()
  const [confirmTarget, setConfirmTarget] = useState(null)

  // Fetch returns currently in the "Requested" status waiting for admin approval
  const { data, isLoading } = useQuery({
    queryKey: ['admin-pending-returns'],
    queryFn: async () => {
      // Calls GET /api/return-requests?status=Requested
      const res = await adminApi.returnRequests?.('Requested') ?? 
                  await fetch('/api/return-requests?status=Requested', {
                    headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
                  }).then(r => r.json())
      return Array.isArray(res) ? res : res?.data || []
    },
    refetchInterval: 30000,
  })

  const pendingReturns = Array.isArray(data) ? data : []

  // Mutation to approve the return request: PUT /api/return-requests/{id}/approve
  const approveMutation = useMutation({
    mutationFn: async (returnId) => {
      if (adminApi.approveReturn) {
        return adminApi.approveReturn(returnId)
      }
      const res = await fetch(`/api/return-requests/${returnId}/approve`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}` 
        }
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.message || 'Failed to approve return request.')
      }
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-pending-returns'] })
      qc.invalidateQueries({ queryKey: ['admin-stats'] })
      setConfirmTarget(null)
    },
  })

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="text-sm font-bold text-[#172554] flex items-center gap-2">
          <RotateCcw size={16} className="text-[#F59E0B]" /> Pending Return Requests
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#F59E0B]/10 text-[#F59E0B]">
            {pendingReturns.length}
          </span>
        </h2>
        <p className="text-xs text-[#64748B]">Review customer return requests before sending to dispatch</p>
      </div>

      {isLoading ? (
        <PageLoader />
      ) : pendingReturns.length === 0 ? (
        <EmptyState 
          icon={CheckCircle} 
          title="All caught up!" 
          description="There are no pending return requests awaiting approval." 
        />
      ) : (
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>RA Number</th>
                <th>Tracking #</th>
                <th>Reason</th>
                <th>Collection City</th>
                <th>Requested At</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {pendingReturns.map(r => (
                <tr key={r.id}>
                  <td className="font-mono text-xs font-bold text-[#0A3D91]">{r.raNumber}</td>
                  <td className="font-mono text-xs text-[#172554]">{r.trackingNumber}</td>
                  <td className="text-xs text-[#475569] max-w-xs truncate" title={r.reason}>
                    {r.reason || 'No reason provided'}
                  </td>
                  <td className="text-xs text-[#64748B]">{r.collectionAddress?.city || '—'}</td>
                  <td className="text-xs text-[#94A3B8] font-mono">{formatDate(r.requestedAt)}</td>
                  <td>
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#F59E0B]/10 text-[#F59E0B] border border-[#F59E0B]/20">
                      <Clock size={11} /> Requested
                    </span>
                  </td>
                  <td>
                    <button 
                      className="btn-primary btn-sm flex items-center gap-1.5"
                      onClick={() => setConfirmTarget(r)}
                    >
                      <Check size={14} /> Approve Return
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirmation Modal */}
      <Modal 
        open={!!confirmTarget} 
        onClose={() => setConfirmTarget(null)} 
        title="Approve Return Request?" 
        size="sm"
      >
        <p className="text-sm text-[#64748B] leading-relaxed mb-3">
          Are you sure you want to approve return <strong className="text-[#172554] font-mono">{confirmTarget?.raNumber}</strong> for parcel <strong className="text-[#172554] font-mono">{confirmTarget?.trackingNumber}</strong>?
        </p>
        <p className="text-xs text-[#94A3B8] mb-4">
          Approving this request will immediately forward the parcel to the Dispatcher queue for collection driver assignment.
        </p>

        {approveMutation.error && (
          <Alert type="error" message={approveMutation.error.message} className="mt-3 mb-3" />
        )}

        <div className="flex justify-end gap-3 mt-6">
          <button className="btn-secondary" onClick={() => setConfirmTarget(null)}>Cancel</button>
          <button 
            className="btn-primary flex items-center gap-1.5" 
            disabled={approveMutation.isPending} 
            onClick={() => approveMutation.mutate(confirmTarget.id)}
          >
            {approveMutation.isPending ? 'Approving...' : 'Confirm Approval'}
          </button>
        </div>
      </Modal>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// USER MANAGEMENT SECTION
// ══════════════════════════════════════════════════════════════════════════════
function AdminUsersSection() {
  const qc = useQueryClient()
  const [roleFilter, setRoleFilter] = useState('All')
  const [confirmTarget, setConfirmTarget] = useState(null)

  const { data, isLoading } = useQuery({ queryKey: ['admin-users'], queryFn: adminApi.users })
  const users = data?.data ?? []

  const suspendMutation = useMutation({
    mutationFn: id => adminApi.suspendUser(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); setConfirmTarget(null) },
  })

  const reactivateMutation = useMutation({
    mutationFn: id => adminApi.reactivateUser(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); setConfirmTarget(null) },
  })

  const activeMutation = confirmTarget?.status === 'Active' ? suspendMutation : reactivateMutation

  const ROLE_COLORS = {
    Administrator: 'bg-[#172554]/10 text-[#172554] border-[#172554]/20',
    Dispatcher: 'bg-[#1E63E9]/10 text-[#1E63E9] border-[#1E63E9]/20',
    WarehouseStaff: 'bg-[#0A3D91]/10 text-[#0A3D91] border-[#0A3D91]/20',
    Driver: 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20',
    BusinessClient: 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20',
    Customer: 'bg-[#64748B]/10 text-[#64748B] border-[#64748B]/20',
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
        <Link to="/admin/staff/new" className="btn-primary btn-sm"><UserPlus size={14} /> Add staff</Link>
      </div>

      <div className="flex gap-2 flex-wrap mb-5">
        {ROLE_FILTERS.map(r => (
          <button key={r} onClick={() => setRoleFilter(r)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              roleFilter === r ? 'bg-[#0A3D91] text-white border-[#0A3D91]' : 'bg-white text-[#64748B] border-[#D8E4F5] hover:border-[#1E63E9]/50'
            }`}>
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
              <tr><th>User</th><th>Role</th><th>Status</th><th>Last login</th><th>Registered</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {filteredUsers.map(u => (
                <tr key={u.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <Avatar name={`${u.firstName} ${u.lastName}`} size="sm" />
                      <div>
                        <p className="text-sm font-semibold text-[#172554]">{u.firstName} {u.lastName}</p>
                        <p className="text-xs text-[#64748B]">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td><span className={`text-[10px] font-bold px-2.5 py-1 rounded-md border tracking-wider uppercase ${ROLE_COLORS[u.role] ?? 'bg-[#F6FAFF]'}`}>{u.role}</span></td>
                  <td><span className={`text-xs font-bold ${u.status === 'Active' ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>{u.status}</span></td>
                  <td className="text-xs text-[#94A3B8] font-mono">{u.lastLoginAt ? formatDate(u.lastLoginAt) : 'Never'}</td>
                  <td className="text-xs text-[#94A3B8] font-mono">{formatDate(u.createdAt)}</td>
                  <td>
                    {u.role === 'Administrator' ? (
                      <span className="text-[11px] text-[#94A3B8] italic">Protected</span>
                    ) : u.status === 'Active' ? (
                      <button className="btn-danger btn-sm" onClick={() => setConfirmTarget(u)}><UserX size={14} /> Suspend</button>
                    ) : (
                      <button className="btn-secondary btn-sm" onClick={() => setConfirmTarget(u)}><UserCheck size={14} /> Reactivate</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!confirmTarget} onClose={() => setConfirmTarget(null)} title={confirmTarget?.status === 'Active' ? 'Suspend user?' : 'Reactivate user?'} size="sm">
        <p className="text-sm text-[#64748B] leading-relaxed mb-2">
          <strong className="text-[#172554]">{confirmTarget?.firstName} {confirmTarget?.lastName}</strong>{' '}
          {confirmTarget?.status === 'Active' ? 'will immediately lose access.' : 'will regain access.'}
        </p>
        {activeMutation.error && <Alert type="error" message={activeMutation.error.message} className="mt-3" />}
        <div className="flex justify-end gap-3 mt-6">
          <button className="btn-secondary" onClick={() => setConfirmTarget(null)}>Cancel</button>
          <button className={confirmTarget?.status === 'Active' ? 'btn-danger' : 'btn-primary'} disabled={activeMutation.isPending} onClick={() => activeMutation.mutate(confirmTarget.id)}>
            {confirmTarget?.status === 'Active' ? 'Confirm suspend' : 'Confirm reactivate'}
          </button>
        </div>
      </Modal>
    </div>
  )
}