import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import SummaryLine from '@/components/roster/SummaryLine'
import { EmptyState, PageLoader, Alert } from '@/components/ui'
import { shiftApi } from '@/api'
import { unwrap, unwrapObj, dayKey, daysFromToday, inclusiveDays, formatDate, shortDate } from '@/utils/roster'
import clsx from 'clsx'
import { Search, Inbox, CheckCircle2, ArrowLeft, Plane, AlertTriangle, Stethoscope, HeartPulse, Calendar } from 'lucide-react'

// ── Drill-down Detail Component ──────────────────────────────────────────────

function RequestDetail({ r, onDone, onBack }) {
  const qc = useQueryClient()
  const [notes, setNotes] = useState('')
  const [override, setOverride] = useState(false)
  const [standbyId, setStandbyId] = useState('')

  const { data: impactRes, isLoading } = useQuery({ queryKey: ['leave-impact', r.id], queryFn: () => shiftApi.leaveImpact(r.id) })
  const impact = unwrapObj(impactRes)
  const rows = impact?.rows ?? []
  const short = impact?.shortSlots ?? 0
  const days = inclusiveDays(r.startDate, r.endDate)

  const review = useMutation({
    mutationFn: approve => shiftApi.reviewLeave(r.id, { approve, notes, allowUnderstaffed: override, standbyDriverId: standbyId || null }),
    onSuccess: (res, approve) => {
      ;['pending-leave', 'open-shifts', 'roster'].forEach(k => qc.invalidateQueries({ queryKey: [k] }))
      onDone(approve ? `Approved leave for ${r.driverName}. Shifts reassigned.` : `Rejected leave for ${r.driverName}.`)
    },
  })

  return (
    <div className="animate-in fade-in max-w-4xl mx-auto space-y-6">
      <button onClick={onBack} className="flex items-center gap-2 text-slate-500 hover:text-blue-700 font-bold mb-2 transition">
        <ArrowLeft size={18} /> Back to Leave Queue
      </button>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Header Block */}
        <div className="p-8 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-3 mb-2">
            <span className="px-3 py-1 bg-blue-100 text-blue-800 text-xs font-bold uppercase tracking-wider rounded-full">{r.leaveType} Leave</span>
            {daysFromToday(dayKey(r.startDate)) <= 3 && <span className="px-3 py-1 bg-red-100 text-red-800 text-xs font-bold uppercase tracking-wider rounded-full">Urgent</span>}
          </div>
          <h2 className="text-3xl font-bold text-slate-900 mb-2">{r.driverName}</h2>
          <p className="text-lg text-slate-500 flex items-center gap-2">
            <Plane size={18} /> {formatDate(r.startDate)} – {formatDate(r.endDate)} ({days} days)
          </p>
          {r.reason && <div className="mt-6 p-4 bg-white border border-slate-200 rounded-lg text-slate-700 italic">"{r.reason}"</div>}
        </div>

        <div className="p-8 space-y-8">
          {/* Coverage Impact Section */}
          <section>
            <h3 className="text-xl font-bold text-slate-800 mb-4">Effect on Depot Coverage</h3>
            {isLoading ? <PageLoader /> : rows.length === 0 ? (
              <div className="p-6 text-center bg-slate-50 border border-slate-200 rounded-xl text-slate-500">No scheduled shifts fall in this period. Cover is not affected.</div>
            ) : (
              <div className="space-y-4">
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs tracking-wider">
                      <tr>
                        <th className="px-4 py-3">Date</th>
                        <th className="px-4 py-3">Shift</th>
                        <th className="px-4 py-3 text-center">Scheduled</th>
                        <th className="px-4 py-3 text-center">After Leave</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map(row => (
                        <tr key={`${row.date}-${row.shiftType}`}>
                          <td className="px-4 py-3 font-semibold text-slate-700">{formatDate(row.date)}</td>
                          <td className="px-4 py-3 text-slate-600">{row.shiftType}</td>
                          <td className="px-4 py-3 text-center">{row.scheduled}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={clsx('font-bold px-3 py-1 rounded-full', row.belowMinimum ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700')}>
                              {row.afterLeave} {row.belowMinimum ? '(Under Minimum)' : '(OK)'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {short > 0 ? (
                  <Alert type="error" message={`Warning: Coverage drops below the minimum on ${short} shift(s).`} />
                ) : <Alert type="success" message="All affected shifts remain at or above the minimum required drivers." />}
              </div>
            )}
          </section>

          {/* Standby Reassignment Section */}
          {rows.length > 0 && (
            <section className="bg-blue-50 p-6 rounded-xl border border-blue-100">
              <h3 className="font-bold text-blue-900 mb-2">Automated Reassignment</h3>
              <p className="text-sm text-blue-700 mb-4">Select who should cover the shifts dropped by this leave.</p>
              <select className="input w-full md:w-1/2 bg-white" value={standbyId} onChange={e => setStandbyId(e.target.value)}>
                <option value="">System Default (Least-loaded available driver)</option>
                {impact?.standbyPool?.map(d => <option key={d.driverId} value={d.driverId}>{d.name} (Available for {d.canCover} shifts)</option>)}
              </select>
            </section>
          )}

          {/* Action / Decision Section */}
          <section className="border-t border-slate-200 pt-8">
            <h3 className="text-xl font-bold text-slate-800 mb-4">Final Decision</h3>
            <textarea 
              className="input w-full p-4 bg-slate-50 border-slate-200 rounded-xl mb-4" 
              rows={2} 
              placeholder="Add administrative notes (Required if rejecting)..." 
              value={notes} 
              onChange={e => setNotes(e.target.value)} 
            />
            {short > 0 && (
              <label className="flex items-center gap-3 p-4 border border-amber-200 bg-amber-50 rounded-xl mb-6 cursor-pointer">
                <input type="checkbox" className="w-5 h-5 text-amber-600 rounded" checked={override} onChange={e => setOverride(e.target.checked)} /> 
                <span className="font-bold text-amber-800">I acknowledge the depot will be understaffed and approve anyway.</span>
              </label>
            )}
            <div className="flex flex-col sm:flex-row gap-3">
              <button 
                className="btn-primary flex-1 py-4 text-lg justify-center shadow-md" 
                disabled={review.isPending || (short > 0 && !override)} 
                onClick={() => review.mutate(true)}
              >
                <CheckCircle2 size={20} className="mr-2" /> Approve Leave
              </button>
              <button 
                className="btn-secondary flex-1 py-4 text-lg justify-center bg-white border-red-200 text-red-600 hover:bg-red-50" 
                disabled={review.isPending || !notes.trim()} 
                onClick={() => review.mutate(false)}
              >
                Reject Leave
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

// ── Dashboard Categories ─────────────────────────────────────────────────────

const LEAVE_CATEGORIES = [
  { key: 'Emergency', title: 'Emergency Leave', icon: HeartPulse, color: 'text-red-600' },
  { key: 'Sick', title: 'Sick Leave', icon: Stethoscope, color: 'text-amber-600' },
  { key: 'Annual', title: 'Annual Leave', icon: Calendar, color: 'text-blue-600' },
  { key: 'Other', title: 'Other Requests', icon: Inbox, color: 'text-slate-600' }
]

// ── Page Entry Point ─────────────────────────────────────────────────────────

export default function LeaveRequestsPage() {
  const [selectedId, setSelectedId] = useState(null)
  const [search, setSearch] = useState('')
  const [flash, setFlash] = useState('')

  const { data: leaveData, isLoading } = useQuery({ queryKey: ['pending-leave'], queryFn: () => shiftApi.pendingLeave(), refetchInterval: 30000 })
  const all = unwrap(leaveData) ?? []
  
  const shown = useMemo(() => all.filter(r => r.driverName.toLowerCase().includes(search.toLowerCase())), [all, search])
  const soon = all.filter(r => daysFromToday(dayKey(r.startDate)) <= 7).length

  return (
    <AppShell title="Leave Requests">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Leave Requests</h1>
        <p className="text-slate-500 mt-2 text-lg">Review staff leave requests, analyze depot impact, and approve absence.</p>
      </div>

      {flash && <div className="mb-6"><Alert type="success" message={flash} /></div>}

      {isLoading ? <PageLoader /> : all.length === 0 ? (
        <EmptyState icon={Inbox} title="Queue is empty" description="No drivers have requested leave." />
      ) : selectedId ? (
        <RequestDetail r={all.find(r => r.id === selectedId)} onBack={() => setSelectedId(null)} onDone={msg => { setFlash(msg); setSelectedId(null); }} />
      ) : (
        <div className="space-y-8 animate-in fade-in">
          <SummaryLine items={[
            { value: all.length, label: 'Pending Requests' },
            { value: soon, label: 'Start Within 7 Days', tone: soon ? 'warn' : undefined },
          ]} />

          <div className="relative max-w-md">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-10 w-full bg-white shadow-sm border-slate-200" placeholder="Search driver name..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          <div className="space-y-10">
            {LEAVE_CATEGORIES.map(cat => {
              const categoryRequests = shown.filter(r => 
                cat.key === 'Other' 
                  ? !['Emergency', 'Sick', 'Annual'].includes(r.leaveType) 
                  : r.leaveType === cat.key
              )

              if (categoryRequests.length === 0) return null

              const Icon = cat.icon

              return (
                <div key={cat.key} className="space-y-4">
                  <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                    <Icon size={20} className={cat.color} />
                    <h3 className="text-xl font-bold text-slate-800">{cat.title}</h3>
                    <span className="bg-slate-100 text-slate-600 text-sm font-bold px-2.5 py-0.5 rounded-full ml-2">
                      {categoryRequests.length}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                    {categoryRequests.map(r => {
                      const days = inclusiveDays(r.startDate, r.endDate)
                      const urgent = daysFromToday(dayKey(r.startDate)) <= 3
                      return (
                        <button key={r.id} onClick={() => setSelectedId(r.id)} className="text-left bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-400 transition group flex flex-col h-full">
                          <div className="flex justify-between items-start mb-4">
                            <span className="text-slate-500 font-medium text-sm">{shortDate(dayKey(r.startDate))} – {shortDate(dayKey(r.endDate))}</span>
                            {urgent && <span className="flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-md"><AlertTriangle size={14}/> Urgent</span>}
                          </div>
                          <h3 className="text-xl font-bold text-slate-900">{r.driverName}</h3>
                          {r.reason && <p className="text-slate-500 mt-2 text-sm line-clamp-2 italic">"{r.reason}"</p>}
                          
                          <div className="mt-auto pt-6 flex justify-between items-center text-sm font-bold text-blue-600 group-hover:text-blue-700">
                            <span>Review Request ({days} days)</span> <ArrowLeft className="rotate-180" size={18} />
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            
            {shown.length === 0 && <p className="text-slate-500 italic py-8 text-center">No requests match your search.</p>}
          </div>
        </div>
      )}
    </AppShell>
  )
}