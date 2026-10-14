import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import RosterSubNav from '@/components/roster/RosterSubNav'
import { EmptyState, PageLoader, Alert, StatCard } from '@/components/ui'
import { shiftApi } from '@/api'
import { unwrap, unwrapObj, dayKey, daysFromToday, inclusiveDays, relativeDay, shortDate } from '@/utils/roster'
import { formatDate } from '@/utils'
import clsx from 'clsx'
import { Search, Inbox, CalendarClock, AlertTriangle, CheckCircle2 } from 'lucide-react'

// Approve Leave & Reassign Shifts (admin).
// Left: the queue of pending requests. Right: the selected request, worked through in three steps:
// 1. coverage impact, 2. who covers, 3. decision.

const TYPE_FILTERS = ['All', 'Annual', 'Sick', 'Emergency']
const SORTS = [
  { key: 'soonest', label: 'Starts soonest' },
  { key: 'shifts', label: 'Most shifts affected' },
]

const Step = ({ n, title, hint, children }) => (
  <section className="space-y-2.5 border-t border-[#E2E8F0] pt-4">
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 w-5 h-5 shrink-0 rounded-full bg-[#0A3D91] text-white text-[11px] font-bold flex items-center justify-center">{n}</span>
      <div>
        <h3 className="text-sm font-bold text-[#0F172A]">{title}</h3>
        {hint && <p className="text-xs text-[#64748B]">{hint}</p>}
      </div>
    </div>
    {children}
  </section>
)

function UrgencyTag({ start }) {
  const n = daysFromToday(dayKey(start))
  if (n > 3) return null
  return (
    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#FEF2F2] text-[#B91C1C]">
      {n <= 0 ? 'Started' : n === 1 ? 'Starts tomorrow' : `Starts in ${n} days`}
    </span>
  )
}

function RequestRow({ r, active, onSelect }) {
  const days = inclusiveDays(r.startDate, r.endDate)
  return (
    <button type="button" onClick={() => onSelect(r.id)}
      className={clsx('card w-full p-3 text-left space-y-1.5 transition hover:border-[#1E63E9]', active && 'ring-2 ring-[#0A3D91]')}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-bold text-[#0F172A]">{r.driverName}</p>
        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#EFF6FF] text-[#1D4ED8] whitespace-nowrap">{r.affectedShifts} shift{r.affectedShifts === 1 ? '' : 's'}</span>
      </div>
      <p className="text-xs text-[#64748B]">{r.leaveType} · {shortDate(dayKey(r.startDate))} – {shortDate(dayKey(r.endDate))} · {days} day{days === 1 ? '' : 's'}</p>
      <UrgencyTag start={r.startDate} />
    </button>
  )
}

function RequestDetail({ r, onDone }) {
  const qc = useQueryClient()
  const [notes, setNotes] = useState('')
  const [override, setOverride] = useState(false)
  const [standbyId, setStandbyId] = useState('')

  // Coverage-impact simulation: scheduled vs. remaining drivers per affected shift
  const { data: impactRes, isLoading, error: impactError } = useQuery({
    queryKey: ['leave-impact', r.id],
    queryFn: () => shiftApi.leaveImpact(r.id),
  })
  const impact = unwrapObj(impactRes)
  const rows = impact?.rows ?? []
  const standbyPool = impact?.standbyPool ?? []
  const short = impact?.shortSlots ?? 0
  const days = inclusiveDays(r.startDate, r.endDate)

  const review = useMutation({
    mutationFn: approve => shiftApi.reviewLeave(r.id, { approve, notes, allowUnderstaffed: override, standbyDriverId: standbyId || null }),
    onSuccess: (res, approve) => {
      const out = unwrapObj(res)
      ;['pending-leave', 'open-shifts', 'roster'].forEach(k => qc.invalidateQueries({ queryKey: [k] }))
      onDone(approve
        ? `Approved leave for ${r.driverName}. ${out?.reassignedShifts ?? 0} shift(s) reassigned, ${out?.openShifts ?? 0} left open.`
        : `Rejected leave for ${r.driverName}.`)
    },
  })

  return (
    <div className="card p-5 space-y-4">
      {/* The request */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-base font-bold text-[#0F172A]">{r.driverName}</p>
            <p className="text-xs text-[#64748B]">{r.leaveType} leave · {formatDate(r.startDate)} – {formatDate(r.endDate)} · {days} day{days === 1 ? '' : 's'} ({relativeDay(dayKey(r.startDate)).toLowerCase()})</p>
          </div>
          <UrgencyTag start={r.startDate} />
        </div>
        {r.reason && <p className="text-sm bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3 py-2">{r.reason}</p>}
      </div>

      {review.error && <Alert type="error" message={review.error.message} />}

      <Step n={1} title="Coverage impact" hint="What the depot looks like if this leave is approved.">
        {isLoading && <p className="text-xs text-[#64748B]">Calculating coverage…</p>}
        {impactError && <Alert type="error" message={`Could not load coverage impact: ${impactError.message}`} />}
        {!isLoading && !impactError && rows.length === 0 && (
          <p className="text-xs text-[#64748B]">This driver has no scheduled shifts in the leave period, so depot coverage is not affected.</p>
        )}
        {rows.length > 0 && (
          <div className="border border-[#E2E8F0] rounded-xl overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[#64748B] bg-[#F8FAFC]">
                  <th className="px-3 py-2">Day</th><th className="px-3 py-2">Shift</th><th className="px-3 py-2">Scheduled</th>
                  <th className="px-3 py-2">After leave</th><th className="px-3 py-2">Minimum</th><th className="px-3 py-2">Cover free</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {rows.map(row => (
                  <tr key={`${row.date}-${row.shiftType}`}>
                    <td className="px-3 py-2 font-semibold">{formatDate(row.date)}</td>
                    <td className="px-3 py-2">{row.shiftType}</td>
                    <td className="px-3 py-2">{row.scheduled}</td>
                    <td className="px-3 py-2">
                      <span className={clsx('font-bold px-2 py-0.5 rounded-full', row.belowMinimum ? 'bg-[#FEF2F2] text-[#B91C1C]' : 'bg-[#F0FDF4] text-[#166534]')}>
                        {row.afterLeave} {row.belowMinimum ? '✕' : '✓'}
                      </span>
                    </td>
                    <td className="px-3 py-2">{row.minimum}</td>
                    <td className="px-3 py-2">{row.availableCover}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {short > 0
          ? <Alert type="error" message={`Coverage drops below the minimum on ${short} shift(s). Pick a standby below, or approve anyway and fill the open shifts afterwards.`} />
          : rows.length > 0 && <Alert type="success" message="Every affected shift stays at or above the minimum." />}
      </Step>

      {rows.length > 0 && (
        <Step n={2} title="Who covers" hint="Optional. Leave on automatic to use the least-loaded driver who is free.">
          <select className="input" value={standbyId} onChange={e => setStandbyId(e.target.value)}>
            <option value="">Automatic (least-loaded available driver)</option>
            {standbyPool.map(d => <option key={d.driverId} value={d.driverId}>{d.name} · can cover {d.canCover} of {rows.length} shift(s)</option>)}
          </select>
          {standbyPool.length === 0 && <p className="text-xs text-[#B91C1C]">No driver is free on any affected day, so shifts will be left open.</p>}
        </Step>
      )}

      <Step n={rows.length > 0 ? 3 : 2} title="Decision" hint="Notes are required if you reject.">
        <textarea className="input" rows={2} placeholder="Notes (required if rejecting)" value={notes} onChange={e => setNotes(e.target.value)} />
        {short > 0 && (
          <label className="flex items-center gap-2 text-xs text-[#475569]">
            <input type="checkbox" checked={override} onChange={e => setOverride(e.target.checked)} />
            Approve even though the depot will be understaffed
          </label>
        )}
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary text-sm" disabled={review.isPending || (short > 0 && !override)} onClick={() => review.mutate(true)}>
            <CheckCircle2 size={14} /> Approve &amp; reassign
          </button>
          <button className="btn-danger text-sm" disabled={review.isPending || !notes.trim()} onClick={() => review.mutate(false)}>Reject</button>
        </div>
      </Step>
    </div>
  )
}

export default function LeaveRequestsPage() {
  const [selectedId, setSelectedId] = useState(null)
  const [typeFilter, setTypeFilter] = useState('All')
  const [sort, setSort] = useState('soonest')
  const [search, setSearch] = useState('')
  const [flash, setFlash] = useState('')

  const leave = useQuery({ queryKey: ['pending-leave'], queryFn: () => shiftApi.pendingLeave(), refetchInterval: 30000 })
  const all = unwrap(leave.data)

  const visible = all
    .filter(r => typeFilter === 'All' || r.leaveType === typeFilter)
    .filter(r => r.driverName.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => sort === 'shifts'
      ? b.affectedShifts - a.affectedShifts
      : dayKey(a.startDate).localeCompare(dayKey(b.startDate)))

  const selected = all.find(r => r.id === selectedId)
  const soon = all.filter(r => daysFromToday(dayKey(r.startDate)) <= 7).length
  const totalShifts = all.reduce((s, r) => s + (r.affectedShifts ?? 0), 0)

  return (
    <AppShell title="Leave Requests">
      <div className="page-header">
        <div>
          <h1 className="page-title">Leave Requests</h1>
          <p className="page-subtitle">Review each request, see what it does to depot coverage, and decide. Approved shifts are reassigned for you.</p>
        </div>
      </div>

      <RosterSubNav role="admin" />

      {flash && <div className="mb-5"><Alert type="success" message={flash} /></div>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Pending requests" value={all.length} icon={Inbox} color="bg-[#0A3D91]" sub="Waiting for a decision" />
        <StatCard label="Starting within 7 days" value={soon} icon={CalendarClock} color={soon ? 'bg-[#F59E0B]' : 'bg-[#64748B]'} sub="Review these first" />
        <StatCard label="Shifts affected" value={totalShifts} icon={AlertTriangle} color="bg-[#1E63E9]" sub="Across all pending requests" />
      </div>

      {leave.isLoading ? <PageLoader /> : leave.error ? (
        <Alert type="error" message={`Could not load leave requests: ${leave.error.message}`} />
      ) : all.length === 0 ? (
        <EmptyState icon={Inbox} title="No pending leave requests" description="Driver leave requests appear here for approval." />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-6 items-start">
          {/* Queue */}
          <div className="space-y-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
              <input className="input pl-9 text-sm" placeholder="Find a driver…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-1.5">
              {TYPE_FILTERS.map(t => (
                <button key={t} onClick={() => setTypeFilter(t)}
                  className={clsx('px-3 py-1 rounded-full text-xs font-semibold border',
                    typeFilter === t ? 'bg-[#0A3D91] text-white border-[#0A3D91]' : 'bg-white text-[#334155] border-[#CBD5E1]')}>{t}</button>
              ))}
            </div>
            <select className="input text-sm" value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort requests">
              {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <div className="space-y-2">
              {visible.map(r => <RequestRow key={r.id} r={r} active={selectedId === r.id} onSelect={id => { setSelectedId(id); setFlash('') }} />)}
              {visible.length === 0 && <p className="text-xs text-[#64748B] px-1">No requests match your filters.</p>}
            </div>
          </div>

          {/* Detail */}
          <div className="xl:sticky xl:top-4">
            {selected
              ? <RequestDetail key={selected.id} r={selected} onDone={msg => { setFlash(msg); setSelectedId(null) }} />
              : <div className="card p-8 text-center text-sm text-[#64748B]">Select a request to see its coverage impact and make a decision.</div>}
          </div>
        </div>
      )}
    </AppShell>
  )
}
