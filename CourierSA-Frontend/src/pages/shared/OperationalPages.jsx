import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import {
  StatCard, EmptyState, PageLoader, Modal, Alert,
  StatusPill, TrackingBadge, Pagination
} from '@/components/ui'
import api from '@/api'
import {
  ClipboardCheck, CheckCircle, AlertTriangle, XCircle,
  Truck, Plus, Package, BarChart3, TrendingUp, TrendingDown,
  Users, Calendar
} from 'lucide-react'
import { formatDate, formatZAR } from '@/utils'
import clsx from 'clsx'

// ═══════════════════════════════════════════════════════════════════════════
// VEHICLE INSPECTIONS (Warehouse Staff / Admin)
// ═══════════════════════════════════════════════════════════════════════════
const RESULT_STYLES = {
  Pass:                { cls: 'status-delivered', icon: CheckCircle,  color: 'text-[#10B981]' },
  PassWithMinorIssues: { cls: 'status-pending',   icon: AlertTriangle,color: 'text-[#F59E0B]' },
  Fail:                { cls: 'status-failed',    icon: XCircle,      color: 'text-[#EF4444]' },
}

export function VehicleInspectionsPage() {
  const qc = useQueryClient()
  const [newOpen, setNewOpen] = useState(false)

  const { data: inspData, isLoading } = useQuery({
    queryKey: ['vehicle-inspections'],
    queryFn:  () => api.get('/vehicle-inspections'),
  })

  const { data: vehicleData } = useQuery({
    queryKey: ['vehicles-list'],
    queryFn:  () => api.get('/admin/vehicles'),
  })

  const inspections = inspData?.data  ?? []
  const vehicles    = vehicleData?.data ?? []
  const passed  = inspections.filter(i => i.result === 'Pass').length
  const failed  = inspections.filter(i => i.result === 'Fail').length
  const pending = inspections.filter(i => i.result === 'PassWithMinorIssues').length

  return (
    <AppShell title="Vehicle Inspections">
      <div className="page-header">
        <div>
          <h1 className="page-title">Vehicle Inspections</h1>
          <p className="page-subtitle">Pre- and post-trip vehicle checks</p>
        </div>
        <button className="btn-primary" onClick={() => setNewOpen(true)}>
          <Plus size={15} /> New inspection
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Passed"       value={passed}  icon={CheckCircle}   color="bg-[#10B981]" />
        <StatCard label="Minor issues" value={pending} icon={AlertTriangle} color="bg-[#F59E0B]"  />
        <StatCard label="Failed"       value={failed}  icon={XCircle}       color="bg-[#EF4444]"     />
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="text-sm font-semibold text-[#172554]">Recent inspections</h2>
        </div>

        {isLoading ? <PageLoader /> : inspections.length === 0 ? (
          <EmptyState
            icon={ClipboardCheck}
            title="No inspections recorded"
            description="Start by logging a pre-trip inspection for any vehicle."
          />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Vehicle</th>
                  <th>Type</th>
                  <th>Driver</th>
                  <th>Odometer</th>
                  <th>Result</th>
                  <th>Notes</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {inspections.map(insp => {
                  const style = RESULT_STYLES[insp.result] ?? RESULT_STYLES.Pass
                  return (
                    <tr key={insp.id}>
                      <td>
                        <p className="text-sm font-semibold text-[#172554]">
                          {insp.vehicle?.registrationNumber ?? '—'}
                        </p>
                        <p className="text-xs text-[#64748B]">
                          {insp.vehicle?.make} {insp.vehicle?.model}
                        </p>
                      </td>
                      <td className="text-xs text-[#64748B] capitalize">
                        {insp.type?.replace(/([A-Z])/g, ' $1').trim()}
                      </td>
                      <td className="text-xs text-[#64748B]">
                        {insp.driver?.firstName} {insp.driver?.lastName}
                      </td>
                      <td className="text-xs text-[#64748B] font-mono">
                        {insp.odometerKm ? `${insp.odometerKm.toLocaleString()} km` : '—'}
                      </td>
                      <td><span className={style.cls}>{insp.result?.replace(/([A-Z])/g, ' $1').trim()}</span></td>
                      <td className="text-xs text-[#64748B] max-w-[180px] truncate">
                        {insp.notes || '—'}
                      </td>
                      <td className="text-xs text-[#94A3B8] font-mono">{formatDate(insp.createdAt, { time: true })}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <NewInspectionModal
        open={newOpen}
        vehicles={vehicles}
        onClose={() => setNewOpen(false)}
        onSuccess={() => { setNewOpen(false); qc.invalidateQueries({ queryKey: ['vehicle-inspections'] }) }}
      />
    </AppShell>
  )
}

function NewInspectionModal({ open, vehicles, onClose, onSuccess }) {
  const [form, setForm] = useState({
    vehicleId: '', type: 'PreTrip', odometerKm: '', result: 'Pass', notes: ''
  })
  const [error, setError] = useState('')
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const mutation = useMutation({
    mutationFn: () => api.post('/vehicle-inspections', {
      vehicleId:   form.vehicleId,
      type:        form.type,
      odometerKm:  form.odometerKm ? parseInt(form.odometerKm) : null,
      result:      form.result,
      notes:       form.notes.trim() || null,
    }),
    onSuccess,
    onError: err => setError(err.message),
  })

  const CHECKLIST = [
    'Tyres and tyre pressure', 'Brakes functional', 'Lights (head, brake, indicators)',
    'Windscreen clear, wipers working', 'Engine oil and coolant', 'Horn functional',
    'First aid kit present', 'Fire extinguisher present', 'Load secured properly',
  ]

  const [checklist, setChecklist] = useState({})
  const toggleCheck = k => setChecklist(prev => ({ ...prev, [k]: !prev[k] }))
  const allChecked = CHECKLIST.every(item => checklist[item])

  return (
    <Modal open={open} onClose={onClose} title="Log vehicle inspection" size="md">
      <div className="space-y-4">
        <Alert type="error" message={error} />

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Vehicle</label>
            <select className="input" value={form.vehicleId} onChange={set('vehicleId')}>
              <option value="">Select vehicle…</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>
                  {v.registrationNumber} — {v.make} {v.model}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Inspection type</label>
            <select className="input" value={form.type} onChange={set('type')}>
              <option value="PreTrip">Pre-trip</option>
              <option value="PostTrip">Post-trip</option>
              <option value="Periodic">Periodic</option>
            </select>
          </div>
        </div>

        <div>
          <label className="label">Odometer reading (km)</label>
          <input type="number" className="input font-mono" placeholder="e.g. 45230" value={form.odometerKm} onChange={set('odometerKm')} />
        </div>

        <div>
          <label className="label mb-2 block">Pre-trip checklist</label>
          <div className="grid grid-cols-1 gap-2 max-h-44 overflow-y-auto scrollbar-thin pr-2">
            {CHECKLIST.map(item => (
              <label key={item} className="flex items-center gap-3 cursor-pointer px-4 py-2.5 rounded-xl hover:bg-[#F6FAFF] border border-[#D8E4F5] transition-colors">
                <input
                  type="checkbox"
                  checked={!!checklist[item]}
                  onChange={() => toggleCheck(item)}
                  className="w-4 h-4 text-[#0A3D91] rounded border-[#D8E4F5] focus:ring-[#1E63E9]/20"
                />
                <span className="text-sm font-medium text-[#334155]">{item}</span>
              </label>
            ))}
          </div>
          {!allChecked && (
            <p className="text-xs font-medium text-[#F59E0B] mt-2">
              {CHECKLIST.filter(i => !checklist[i]).length} item(s) not checked
            </p>
          )}
        </div>

        <div>
          <label className="label">Overall result</label>
          <div className="grid grid-cols-3 gap-3">
            {[
              { value: 'Pass', label: 'Pass', cls: 'border-[#10B981] bg-[#10B981]/10 text-[#10B981]' },
              { value: 'PassWithMinorIssues', label: 'Minor issues', cls: 'border-[#F59E0B] bg-[#F59E0B]/10 text-[#F59E0B]' },
              { value: 'Fail', label: 'Fail', cls: 'border-[#EF4444] bg-[#EF4444]/10 text-[#EF4444]' },
            ].map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setForm(f => ({ ...f, result: opt.value }))}
                className={clsx(
                  'py-2.5 rounded-xl border-2 text-sm font-bold transition-all',
                  form.result === opt.value ? opt.cls : 'border-[#D8E4F5] bg-white text-[#94A3B8] hover:border-[#1E63E9]/50 hover:text-[#1E63E9]'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Notes</label>
          <textarea className="input h-24 resize-none" placeholder="Describe any issues found…" value={form.notes} onChange={set('notes')} />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            disabled={!form.vehicleId || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            <ClipboardCheck size={16} /> Submit inspection
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// DRIVER DELIVERY HISTORY (Driver role)
// ═══════════════════════════════════════════════════════════════════════════
export function DriverHistoryPage() {
  const [page, setPage] = useState(1)
  const pageSize = 15

  const { data, isLoading } = useQuery({
    queryKey: ['driver-history', page],
    queryFn:  () => api.get('/deliveries/history', { params: { page, pageSize } }),
    keepPreviousData: true,
  })

  const deliveries = data?.data?.items  ?? []
  const total      = data?.data?.totalCount ?? 0
  const delivered  = deliveries.filter(d => d.status === 'Delivered').length
  const failed     = deliveries.filter(d => d.status === 'Failed').length

  return (
    <AppShell title="Delivery History">
      <div className="page-header">
        <div>
          <h1 className="page-title">Task History</h1>
          <p className="page-subtitle">All completed and failed tasks</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Total"     value={total}     icon={Package}     color="bg-[#64748B]"    />
        <StatCard label="Completed" value={delivered} icon={CheckCircle} color="bg-[#10B981]"  />
        <StatCard label="Failed"    value={failed}    icon={XCircle}     color="bg-[#EF4444]"      />
      </div>

      <div className="card">
        {isLoading ? <PageLoader /> : deliveries.length === 0 ? (
          <EmptyState icon={Truck} title="No task history" description="Completed tasks will appear here." />
        ) : (
          <>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tracking #</th>
                    <th>Contact</th>
                    <th>City</th>
                    <th>Status</th>
                    <th>Delivered / Failed at</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.map(d => {
                    const contactName = d.isPickup ? (d.pickupName || d.recipientName) : d.recipientName
                    const locationCity = d.isPickup ? (d.pickupCity || d.city) : d.city

                    return (
                      <tr key={d.id}>
                        <td>
                          <div className="flex items-center gap-2">
                            <TrackingBadge value={d.trackingNumber} />
                            {d.isPickup && (
                              <span className="px-2 py-0.5 text-xs font-semibold bg-purple-100 text-purple-700 rounded-full">
                                Pickup
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="text-sm font-medium text-[#172554]">{contactName}</td>
                        <td className="text-xs text-[#64748B]">{locationCity}</td>
                        <td><StatusPill status={d.status} /></td>
                        <td className="text-xs text-[#94A3B8] font-mono">{formatDate(d.updatedAt, { time: true })}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} />
          </>
        )}
      </div>
    </AppShell>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// WAREHOUSE INVENTORY (Warehouse Staff / Admin)
// ═══════════════════════════════════════════════════════════════════════════
export function WarehouseInventoryPage() {
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState('InWarehouse')
  const pageSize = 15

  const { data, isLoading } = useQuery({
    queryKey: ['warehouse-inventory', page, statusFilter],
    queryFn:  () => api.get('/parcels', { params: { page, pageSize, status: statusFilter } }),
    keepPreviousData: true,
  })

  const parcels = data?.data?.items  ?? []
  const total   = data?.data?.totalCount ?? 0

  const STATUS_FILTERS = [
    { value: 'InWarehouse',     label: 'In warehouse'     },
    { value: 'Approved',        label: 'Awaiting check-in'},
    { value: 'OutForDelivery',  label: 'Out for delivery' },
  ]

  return (
    <AppShell title="Inventory">
      <div className="page-header">
        <div>
          <h1 className="page-title">Warehouse Inventory</h1>
          <p className="page-subtitle">{total} parcels in current view</p>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {STATUS_FILTERS.map(f => (
          <button
            key={f.value}
            onClick={() => { setStatusFilter(f.value); setPage(1) }}
            className={clsx(
              'px-5 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all',
              statusFilter === f.value
                ? 'bg-[#0A3D91] text-white border-[#0A3D91] shadow-md'
                : 'bg-white text-[#64748B] border-[#D8E4F5] hover:border-[#1E63E9]/50 hover:text-[#172554]'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="card">
        {isLoading ? <PageLoader /> : parcels.length === 0 ? (
          <EmptyState icon={Package} title="No parcels in this category" />
        ) : (
          <>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tracking #</th>
                    <th>Service</th>
                    <th>Destination</th>
                    <th>Weight</th>
                    <th>Fragile</th>
                    <th>Status</th>
                    <th>Booked</th>
                  </tr>
                </thead>
                <tbody>
                  {parcels.map(p => (
                    <tr key={p.id}>
                      <td><TrackingBadge value={p.trackingNumber} /></td>
                      <td className="capitalize text-xs font-medium text-[#172554]">{p.serviceType}</td>
                      <td className="text-xs text-[#64748B]">{p.destinationCity}</td>
                      <td className="text-xs text-[#64748B] font-mono">{p.weightKg} kg</td>
                      <td>
                        {p.isFragile
                          ? <span className="text-xs font-bold text-[#F59E0B]">⚠ Fragile</span>
                          : <span className="text-xs text-[#94A3B8]">—</span>}
                      </td>
                      <td><StatusPill status={p.status} /></td>
                      <td className="text-xs text-[#94A3B8] font-mono">{formatDate(p.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} />
          </>
        )}
      </div>
    </AppShell>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN REPORTS (Administrator)
// ═══════════════════════════════════════════════════════════════════════════
export function AdminReportsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn:  () => api.get('/admin/dashboard/stats'),
    refetchInterval: 60000,
  })

  const stats = data?.data ?? {}

  const metrics = [
    { label: 'Total parcels',     value: stats.totalParcels,    icon: Package,       color: 'bg-[#0A3D91]'   },
    { label: 'Delivered',         value: stats.delivered,       icon: CheckCircle,   color: 'bg-[#10B981]' },
    { label: 'In transit',        value: stats.inTransit,       icon: Truck,         color: 'bg-[#1E63E9]'    },
    { label: 'Pending approval',  value: stats.pendingApproval, icon: AlertTriangle, color: 'bg-[#F59E0B]'   },
    { label: 'Registered users',  value: stats.totalUsers,      icon: Users,         color: 'bg-[#6366F1]'  },
  ]

  // Derived completion rate
  const completionRate = stats.totalParcels > 0
    ? Math.round((stats.delivered / stats.totalParcels) * 100)
    : 0

  return (
    <AppShell title="Reports">
      <div className="page-header">
        <div>
          <h1 className="page-title">Platform Reports</h1>
          <p className="page-subtitle">Live system statistics — updates every 60 seconds</p>
        </div>
      </div>

      {isLoading ? <PageLoader /> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
            {metrics.map(m => (
              <StatCard key={m.label} label={m.label} value={m.value ?? '—'} icon={m.icon} color={m.color} />
            ))}
          </div>

          {/* Completion rate card */}
          <div className="card mb-4">
            <div className="card-header">
              <h2 className="text-sm font-bold text-[#172554]">Delivery success rate</h2>
              <span className="text-2xl font-bold text-[#10B981] font-mono">{completionRate}%</span>
            </div>
            <div className="w-full bg-[#F6FAFF] border border-[#D8E4F5] rounded-full h-3.5 overflow-hidden">
              <div
                className="h-3.5 rounded-full bg-gradient-to-r from-[#1E63E9] to-[#10B981] transition-all duration-1000"
                style={{ width: `${completionRate}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] font-semibold text-[#94A3B8] mt-2 uppercase tracking-wide">
              <span>0%</span>
              <span className="text-[#64748B]">Target: 95%</span>
              <span>100%</span>
            </div>
          </div>

          {/* Parcel status breakdown */}
          <div className="card">
            <div className="card-header">
              <h2 className="text-sm font-bold text-[#172554]">Status breakdown</h2>
            </div>
            <div className="space-y-4">
              {[
                { label: 'Delivered',        value: stats.delivered,       max: stats.totalParcels, color: 'bg-[#10B981]' },
                { label: 'In transit',       value: stats.inTransit,       max: stats.totalParcels, color: 'bg-[#1E63E9]'    },
                { label: 'Pending approval', value: stats.pendingApproval, max: stats.totalParcels, color: 'bg-[#F59E0B]'   },
              ].map(row => (
                <div key={row.label}>
                  <div className="flex justify-between text-xs font-semibold text-[#64748B] mb-1.5">
                    <span>{row.label}</span>
                    <span className="font-mono text-[#172554]">{row.value ?? 0}</span>
                  </div>
                  <div className="w-full bg-[#F6FAFF] border border-[#D8E4F5] rounded-full h-2">
                    <div
                      className={clsx('h-2 rounded-full transition-all duration-700', row.color)}
                      style={{ width: row.max > 0 ? `${Math.round(((row.value ?? 0) / row.max) * 100)}%` : '0%' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </AppShell>
  )
}