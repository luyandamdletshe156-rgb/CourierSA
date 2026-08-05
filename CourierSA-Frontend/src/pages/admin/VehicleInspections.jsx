import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import {
  EmptyState, PageLoader, Modal, Alert
} from '@/components/ui'
import { adminApi } from '@/api' // Updated from standard 'api' to 'adminApi' domain
import {
  ClipboardCheck, CheckCircle2, AlertTriangle, XCircle,
  Truck, Plus, Gauge, Calendar, ClipboardList
} from 'lucide-react'
import { formatDate } from '@/utils'
import clsx from 'clsx'

const RESULT_STYLES = {
  Pass:                { bg: 'bg-[#ECFDF5]', text: 'text-[#10B981]', border: 'border-[#10B981]/20', icon: CheckCircle2 },
  PassWithMinorIssues: { bg: 'bg-[#FFFBEB]', text: 'text-[#F59E0B]', border: 'border-[#F59E0B]/20', icon: AlertTriangle },
  Fail:                { bg: 'bg-[#FEF2F2]', text: 'text-[#EF4444]', border: 'border-[#EF4444]/20', icon: XCircle },
}

export function VehicleInspectionsPage() {
  const qc = useQueryClient()
  const [newOpen, setNewOpen] = useState(false)

  // Assuming you have these mapped in your adminApi wrapper
  const { data: inspData, isLoading } = useQuery({
    queryKey: ['admin-vehicle-inspections'],
    queryFn:  () => adminApi.getVehicleInspections(), 
  })

  const { data: vehicleData } = useQuery({
    queryKey: ['admin-vehicles-list'],
    queryFn:  () => adminApi.vehicles(),
  })

  const inspections = inspData?.data  ?? []
  const vehicles    = vehicleData?.data ?? []
  
  const passed  = inspections.filter(i => i.result === 'Pass').length
  const failed  = inspections.filter(i => i.result === 'Fail').length
  const pending = inspections.filter(i => i.result === 'PassWithMinorIssues').length

  return (
    <AppShell title="Fleet Inspections">
      <div className="page-header flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="page-title">Fleet Inspections</h1>
          <p className="page-subtitle">Oversight of pre- and post-trip vehicle conditions</p>
        </div>
        <button className="btn-primary shadow-md shadow-[#1E63E9]/20" onClick={() => setNewOpen(true)}>
          <Plus size={16} /> Log Inspection
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Passed', val: passed, col: 'text-[#10B981]', bg: 'bg-[#ECFDF5]', Icon: CheckCircle2 },
          { label: 'Minor Issues', val: pending, col: 'text-[#F59E0B]', bg: 'bg-[#FFFBEB]', Icon: AlertTriangle },
          { label: 'Failed', val: failed, col: 'text-[#EF4444]', bg: 'bg-[#FEF2F2]', Icon: XCircle }
        ].map(s => (
          <div key={s.label} className="card p-5 flex items-center gap-4 border-l-4 border-transparent hover:border-l-current transition-all" style={{ borderLeftColor: 'inherit', color: s.col.replace('text-', '') }}>
            <div className={`p-3 rounded-2xl ${s.bg} ${s.col}`}>
              <s.Icon size={24} />
            </div>
            <div>
              <p className="text-2xl font-bold text-[#172554]">{s.val}</p>
              <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="bg-[#F8FAFC] px-5 py-4 border-b border-[#D8E4F5]">
          <h2 className="text-sm font-bold text-[#172554] flex items-center gap-2">
            <ClipboardList size={16} className="text-[#0A3D91]" /> Recent Logs
          </h2>
        </div>

        {isLoading ? <PageLoader /> : inspections.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="No inspections recorded" description="Start by logging a pre-trip inspection for any fleet vehicle." />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Vehicle Identity</th>
                  <th>Trip Type</th>
                  <th>Inspector / Driver</th>
                  <th>Odometer</th>
                  <th>Result</th>
                  <th>Date Recorded</th>
                </tr>
              </thead>
              <tbody>
                {inspections.map(insp => {
                  const style = RESULT_STYLES[insp.result] ?? RESULT_STYLES.Pass
                  const StatusIcon = style.icon
                  return (
                    <tr key={insp.id} className="hover:bg-[#F6FAFF] transition-colors">
                      <td>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-[#F1F5F9] border border-[#E2E8F0] flex items-center justify-center shrink-0">
                            <Truck size={18} className="text-[#64748B]" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-[#172554] uppercase tracking-wide">
                              {insp.vehicle?.registrationNumber ?? '—'}
                            </p>
                            <p className="text-xs text-[#64748B] font-medium">
                              {insp.vehicle?.make} {insp.vehicle?.model}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="inline-block bg-[#F1F5F9] text-[#475569] px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider">
                          {insp.type?.replace(/([A-Z])/g, ' $1').trim()}
                        </span>
                      </td>
                      <td>
                        <p className="text-sm font-semibold text-[#172554]">{insp.driver?.firstName} {insp.driver?.lastName}</p>
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5 text-xs text-[#64748B] font-mono bg-[#F8FAFC] px-2 py-1 rounded-md w-max border border-[#E2E8F0]">
                          <Gauge size={12} className="text-[#94A3B8]" />
                          {insp.odometerKm ? `${insp.odometerKm.toLocaleString()} km` : '—'}
                        </div>
                      </td>
                      <td>
                        <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${style.bg} ${style.text} ${style.border}`}>
                          <StatusIcon size={12} />
                          {insp.result?.replace(/([A-Z])/g, ' $1').trim()}
                        </div>
                        {insp.notes && <p className="text-[10px] text-[#94A3B8] mt-1 max-w-[150px] truncate">{insp.notes}</p>}
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5 text-xs text-[#64748B] font-mono">
                          <Calendar size={12} className="text-[#94A3B8]" />
                          {formatDate(insp.createdAt, { time: true })}
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

      <NewInspectionModal open={newOpen} vehicles={vehicles} onClose={() => setNewOpen(false)} onSuccess={() => { setNewOpen(false); qc.invalidateQueries({ queryKey: ['admin-vehicle-inspections'] }) }} />
    </AppShell>
  )
}

function NewInspectionModal({ open, vehicles, onClose, onSuccess }) {
  const [form, setForm] = useState({ vehicleId: '', type: 'PreTrip', odometerKm: '', result: 'Pass', notes: '' })
  const [error, setError] = useState('')
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const mutation = useMutation({
    mutationFn: () => adminApi.logVehicleInspection({ // Assuming endpoint exists in adminApi
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
    'First aid kit & Fire Extinguisher', 'Load secured properly'
  ]

  const [checklist, setChecklist] = useState({})
  const toggleCheck = k => setChecklist(prev => ({ ...prev, [k]: !prev[k] }))
  const allChecked = CHECKLIST.every(item => checklist[item])

  return (
    <Modal open={open} onClose={onClose} title="Log Fleet Inspection" size="lg">
      <div className="space-y-6">
        {error && <Alert type="error" message={error} />}

        {/* Vehicle & Trip Info */}
        <div className="bg-[#F8FAFC] p-4 rounded-xl border border-[#E2E8F0] grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-1.5 block">Select Vehicle</label>
            <select className="input bg-white" value={form.vehicleId} onChange={set('vehicleId')}>
              <option value="">Choose vehicle...</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>{v.registrationNumber} — {v.make} {v.model}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-1.5 block">Trip Type</label>
            <select className="input bg-white" value={form.type} onChange={set('type')}>
              <option value="PreTrip">Pre-trip</option>
              <option value="PostTrip">Post-trip</option>
              <option value="Periodic">Periodic</option>
            </select>
          </div>
          <div className="md:col-span-3">
            <label className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-1.5 block">Current Odometer (km)</label>
            <div className="relative">
              <Gauge className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" size={16} />
              <input type="number" className="input bg-white pl-9 font-mono" placeholder="e.g. 45230" value={form.odometerKm} onChange={set('odometerKm')} />
            </div>
          </div>
        </div>

        {/* Digital Checklist */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs font-bold text-[#172554] uppercase tracking-wider">Condition Checklist</label>
            <span className="text-[10px] font-bold text-[#94A3B8] bg-[#F1F5F9] px-2 py-1 rounded-md">
              {Object.keys(checklist).filter(k => checklist[k]).length} / {CHECKLIST.length} Checked
            </span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-56 overflow-y-auto scrollbar-thin pr-2">
            {CHECKLIST.map(item => (
              <div 
                key={item} 
                onClick={() => toggleCheck(item)}
                className={clsx(
                  "flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition-all",
                  checklist[item] ? "bg-[#F6FAFF] border-[#0A3D91]/30" : "bg-white border-[#E2E8F0] hover:border-[#CBD5E1]"
                )}
              >
                <span className={clsx("text-xs font-semibold select-none", checklist[item] ? "text-[#0A3D91]" : "text-[#475569]")}>{item}</span>
                {/* Custom Toggle Switch */}
                <div className={clsx("w-8 h-4.5 rounded-full relative transition-colors duration-300", checklist[item] ? "bg-[#0A3D91]" : "bg-[#CBD5E1]")}>
                  <div className={clsx("absolute top-[2px] w-3.5 h-3.5 bg-white rounded-full transition-transform duration-300", checklist[item] ? "translate-x-[16px]" : "translate-x-[2px]")} />
                </div>
              </div>
            ))}
          </div>
          {!allChecked && <p className="text-[11px] font-semibold text-[#F59E0B] mt-2 flex items-center gap-1"><AlertTriangle size={12}/> Please complete all checklist items before dispatching.</p>}
        </div>

        {/* Result & Notes */}
        <div className="pt-4 border-t border-[#E2E8F0]">
          <label className="text-xs font-bold text-[#172554] uppercase tracking-wider mb-3 block">Final Verdict</label>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { value: 'Pass', label: 'Pass', icon: CheckCircle2, cls: 'border-[#10B981] bg-[#ECFDF5] text-[#10B981]' },
              { value: 'PassWithMinorIssues', label: 'Minor Issues', icon: AlertTriangle, cls: 'border-[#F59E0B] bg-[#FFFBEB] text-[#F59E0B]' },
              { value: 'Fail', label: 'Fail / Grounded', icon: XCircle, cls: 'border-[#EF4444] bg-[#FEF2F2] text-[#EF4444]' },
            ].map(opt => (
              <button
                key={opt.value} type="button" onClick={() => setForm(f => ({ ...f, result: opt.value }))}
                className={clsx(
                  'py-3 rounded-xl border-2 text-xs font-bold flex flex-col items-center gap-1 transition-all',
                  form.result === opt.value ? opt.cls : 'border-[#E2E8F0] bg-white text-[#94A3B8] hover:border-[#CBD5E1]'
                )}
              >
                <opt.icon size={18} /> {opt.label}
              </button>
            ))}
          </div>

          <label className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-1.5 block">Inspector Notes (Required if failed)</label>
          <textarea className="input h-20 resize-none" placeholder="Detail any findings, damages, or replaced parts..." value={form.notes} onChange={set('notes')} />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            disabled={!form.vehicleId || (!allChecked && form.result === 'Pass') || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            <ClipboardCheck size={16} /> Save Inspection Record
          </button>
        </div>
      </div>
    </Modal>
  )
}