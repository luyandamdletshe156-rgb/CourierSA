import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import {
  StatCard, StatusPill, TrackingBadge,
  EmptyState, PageLoader, Modal, Alert, Avatar
} from '@/components/ui'
import { parcelApi, adminApi } from '@/api'
import {
  Warehouse, Package, CheckCircle, BarChart3,
  Users, ShieldCheck, Truck, AlertTriangle,
  UserX, FileText, TrendingUp
} from 'lucide-react'
import { formatDate, formatZAR } from '@/utils'
import { useTracking } from '@/context/TrackingContext'

// ════════════════════════════════════════════════════════════════════════════
// WAREHOUSE STAFF
// ════════════════════════════════════════════════════════════════════════════
export function WarehouseDashboard() {
  const qc = useQueryClient()
  const [checkInModal, setCheckInModal] = useState(null)
  const [location, setLocation]         = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['parcels-approved-wh'],
    queryFn:  () => parcelApi.list({ status: 'Approved', pageSize: 50 }),
    refetchInterval: 30000,
  })

  const approved = data?.data?.items ?? []

  const checkInMutation = useMutation({
    mutationFn: ({ id }) => parcelApi.checkIn(id, location),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['parcels-approved-wh'] })
      setCheckInModal(null)
      setLocation('')
    },
  })

  return (
    <AppShell title="Warehouse">
      <div className="page-header">
        <div>
          <h1 className="page-title">Warehouse Dashboard</h1>
          <p className="page-subtitle">Receive and check in incoming parcels</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <StatCard label="Awaiting check-in" value={approved.length}
                  icon={Warehouse} color="bg-[#0A3D91]" />
        <StatCard label="In warehouse" value="—"
                  icon={Package} color="bg-[#1E63E9]" />
        <StatCard label="Checked in today" value="—"
                  icon={CheckCircle} color="bg-[#10B981]" />
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="text-sm font-bold text-[#172554]">Parcels awaiting check-in</h2>
        </div>

        {isLoading ? <PageLoader /> : approved.length === 0 ? (
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
                {approved.map(p => (
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

      <Modal open={!!checkInModal} onClose={() => setCheckInModal(null)} title="Check in parcel" size="sm">
        <p className="text-sm text-[#64748B] mb-5 flex items-center gap-2">
          Checking in <TrackingBadge value={checkInModal?.trackingNumber} />
        </p>
        <label className="label">Warehouse location / bay</label>
        <input
          className="input"
          placeholder="e.g. Bay A3, Shelf 12"
          value={location}
          onChange={e => setLocation(e.target.value)}
        />
        {checkInMutation.error && <Alert type="error" message={checkInMutation.error.message} className="mt-4" />}
        <div className="flex justify-end gap-3 mt-6">
          <button className="btn-secondary" onClick={() => setCheckInModal(null)}>Cancel</button>
          <button
            className="btn-primary"
            disabled={!location.trim() || checkInMutation.isPending}
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

  const { data, isLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn:  adminApi.dashboardStats,
    refetchInterval: 60000,
  })

  const stats = dashboardStats ?? data?.data ?? {}

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
            <StatCard label="Registered users" value={stats.totalUsers} icon={Users}     color="bg-[#172554]" />
            <StatCard label="Reports generated" value="—"               icon={BarChart3} color="bg-[#64748B]" />
          </div>
        </>
      )}

      <AdminUsersSection />
    </AppShell>
  )
}

function AdminUsersSection() {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn:  adminApi.users,
  })

  const users = data?.data ?? []

  const suspendMutation = useMutation({
    mutationFn: id => adminApi.suspendUser(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['admin-users'] }),
  })

  const ROLE_COLORS = {
    Administrator:  'bg-[#172554]/10 text-[#172554] border-[#172554]/20',
    Dispatcher:     'bg-[#1E63E9]/10 text-[#1E63E9] border-[#1E63E9]/20',
    WarehouseStaff: 'bg-[#0A3D91]/10 text-[#0A3D91] border-[#0A3D91]/20',
    Driver:         'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20',
    BusinessClient: 'bg-[#10B981]/10 text-[#10B981] border-[#10B981]/20',
    Customer:       'bg-[#64748B]/10 text-[#64748B] border-[#64748B]/20',
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="text-sm font-bold text-[#172554] flex items-center gap-2">
          <Users size={16} className="text-[#0A3D91]" /> All users
        </h2>
      </div>

      {isLoading ? <PageLoader /> : (
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
              {users.map(u => (
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
                    {u.status === 'Active' && (
                      <button
                        className="btn-danger btn-sm"
                        disabled={suspendMutation.isPending}
                        onClick={() => suspendMutation.mutate(u.id)}
                      >
                        <UserX size={14} /> Suspend
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
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