import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import AppShell from '@/components/layout/AppShell'
import { StatCard, EmptyState, PageLoader, Modal, Alert, Avatar } from '@/components/ui'
import { adminApi } from '@/api'
import { Package, Truck, CheckCircle, AlertTriangle, Users, UserPlus, UserCheck, UserX } from 'lucide-react'
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
      <AdminUsersSection />
    </AppShell>
  )
}

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