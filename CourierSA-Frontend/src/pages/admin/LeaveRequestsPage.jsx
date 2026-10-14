import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import SummaryLine from '@/components/roster/SummaryLine'
import { EmptyState, PageLoader, Alert } from '@/components/ui'
import { shiftApi } from '@/api'
import { unwrap, unwrapObj, dayKey, daysFromToday, inclusiveDays, relativeDay, shortDate } from '@/utils/roster'
import { formatDate } from '@/utils'
import clsx from 'clsx'
import { Search, Inbox, CheckCircle2 } from 'lucide-react'

// Leave Requests (admin): the queue on the left, the open request on the right.
// The first request is open by default, so there is always something to act on.

const TYPES = ['All types', 'Annual', 'Sick', 'Emergency']
const SORTS = [{ key: 'soonest', label: 'Starts soonest' }, { key: 'shifts', label: 'Most shifts affected' }]

const Section = ({ title, hint, children }) => (
  <section className="space-y-2 border-t border-[#E2E8F0] pt-4">
    <div>
      <h3 className="text-sm font-bold text-[#0F172A]">{title}</h3>
      {hint && <p className="text-xs text-[#64748B]">{hint}</p>}
    </div>
    {children}
  </section>
)

function UrgencyTag({ start }) {
  const n = daysFromToday(dayKey(start))
  if (n > 3) return null
  return <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#FEF2F2] text-[#B91C1C]">{n <= 0 ? 'Started' : n === 1 ? 'Starts tomorrow' : `Starts in ${n} days`}</span>
}

function QueueRow({ r, active, onSelect }) {
  const days = inclusiveDays(r.startDate, r.endDate)
  return (
    <li>
      <button type="button" onClick={() => onSelect(r.id)}
        className={clsx('w-full text-left px-4 py-3 border-l-4 transition space-y-1', active ? 'border-[#0A3D91] bg-[#F6FAFF]' : 'border-transparent hover:bg-[#F8FAFC]')}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-[#0F172A]">{r.driverName}</p>
          <span className="text-[11px] font-semibold text-[#475569] whitespace-nowrap">{r.affectedShifts} shift{r.affectedShifts === 1 ? '' : 's'}</span>
        </div>
        <p className="text-xs text-[#64748B]">{r.leaveType} · {shortDate(dayKey(r.startDate))} – {shortDate(dayKey(r.endDate))} · {days} day{days === 1 ? '' : 's'}</p>
        <UrgencyTag start={r.startDate} />
      </button>
    </li>
  )
}

function RequestDetail({ r, onDone }) {
  const qc = useQueryClient()
  const [notes, setNotes] = useState('')
  const [override, setOverride] = useState(false)
  const [standbyId, setStandbyId] = useState('')

  const { data: impactRes, isLoading, error: impactError } = useQuery({ queryKey: ['leave-impact', r.id], queryFn: () => shiftApi.leaveImpact(r.id) })
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-bold text-[#0F172A]">{r.driverName}</p>
          <p className="text-sm text-[#64748B]">{r.leaveType} leave · {formatDate(r.startDate)} – {formatDate(r.endDate)} · {days} day{days === 1 ? '' : 's'} · {relativeDay(dayKey(r.startDate)).toLowerCase()}</p>
        </div>
        <UrgencyTag start={r.startDate} />
      </div>
      {r.reason && <p className="text-sm bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3 py-2">{r.reason}</p>}
      {review.error && <Alert type="error" message={review.error.message} />}

      <Section title="Effect on depot cover">
        {isLoading && <p className="text-xs text-[#64748B]">Calculating coverage…</p>}
        {impactError && <Alert type="error" message={`Could not load coverage impact: ${impactError.message}`} />}
        {!isLoading && !impactError && rows.length === 0 && <p className="text-xs text-[#64748B]">No scheduled shifts fall in this period, so cover is not affected.</p>}
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
                      <span className={clsx('font-bold px-2 py-0.5 rounded-full', row.belowMinimum ? 'bg-[#FEF2F2] text-[#B91C1C]' : 'bg-[#F0FDF4] text-[#166534]')}>{row.afterLeave} {row.belowMinimum ? '✕' : '✓'}</span>
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
          ? <Alert type="error" message={`Cover drops below the minimum on ${short} shift(s). Pick a standby, or approve anyway and fill the open shifts afterwards.`} />
          : rows.length > 0 && <Alert type="success" message="Every affected shift stays at or above the minimum." />}
      </Section>

      {rows.length > 0 && (
        <Section title="Who covers" hint="Leave on automatic to use the least-loaded driver who is free.">
          <select className="input" value={standbyId} onChange={e => setStandbyId(e.target.value)}>
            <option value="">Automatic (least-loaded available driver)</option>
            {standbyPool.map(d => <option key={d.driverId} value={d.driverId}>{d.name} · can cover {d.canCover} of {rows.length} shift(s)</option>)}
          </select>
          {standbyPool.length === 0 && <p className="text-xs text-[#B91C1C]">No driver is free on any affected day, so shifts will be left open.</p>}
        </Section>
      )}

      <Section title="Decision">
        <textarea className="input" rows={2} placeholder="Notes (required if rejecting)" value={notes} onChange={e => setNotes(e.target.value)} />
        {short > 0 && (
          <label className="flex items-center gap-2 text-xs text-[#475569]">
            <input type="checkbox" checked={override} onChange={e => setOverride(e.target.checked)} /> Approve even though the depot will be understaffed
          </label>
        )}
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary text-sm" disabled={review.isPending || (short > 0 && !override)} onClick={() => review.mutate(true)}>
            <CheckCircle2 size={14} /> Approve &amp; reassign
          </button>
          <button className="btn-danger text-sm" disabled={review.isPending || !notes.trim()} onClick={() => review.mutate(false)}>Reject</button>
        </div>
      </Section>
    </div>
  )
}

export default function LeaveRequestsPage() {
  const [selectedId, setSelectedId] = useState(null)
  const [type, setType] = useState('All types')
  const [sort, setSort] = useState('soonest')
  const [search, setSearch] = useState('')
  const [flash, setFlash] = useState('')

  const leave = useQuery({ queryKey: ['pending-leave'], queryFn: () => shiftApi.pendingLeave(), refetchInterval: 30000 })
  const all = unwrap(leave.data)
  const visible = all
    .filter(r => type === 'All types' || r.leaveType === type)
    .filter(r => r.driverName.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) => sort === 'shifts' ? b.affectedShifts - a.affectedShifts : dayKey(a.startDate).localeCompare(dayKey(b.startDate)))

  const selected = visible.find(r => r.id === selectedId) ?? visible[0]
  const soon = all.filter(r => daysFromToday(dayKey(r.startDate)) <= 7).length
  const totalShifts = all.reduce((s, r) => s + (r.affectedShifts ?? 0), 0)

  return (
    <AppShell title="Leave Requests">
      <div className="page-header">
        <div>
          <h1 className="page-title">Leave Requests</h1>
          <p className="page-subtitle">See what each request does to depot cover, then decide. Approved shifts are reassigned for you.</p>
        </div>
      </div>

      <SummaryLine items={[
        { value: all.length, label: 'pending' },
        { value: soon, label: 'start within 7 days', tone: soon ? 'warn' : undefined },
        { value: totalShifts, label: 'shifts affected' },
      ]} />

      {flash && <div className="mb-4"><Alert type="success" message={flash} /></div>}

      {leave.isLoading ? <PageLoader /> : leave.error ? (
        <Alert type="error" message={`Could not load leave requests: ${leave.error.message}`} />
      ) : all.length === 0 ? (
        <EmptyState icon={Inbox} title="No pending leave requests" description="Driver leave requests appear here for approval." />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[340px_minmax(0,1fr)] gap-6 items-start">
          <div className="space-y-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
              <input className="input pl-9 text-sm" placeholder="Find a driver…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select className="input text-sm" value={type} onChange={e => setType(e.target.value)} aria-label="Leave type">{TYPES.map(t => <option key={t}>{t}</option>)}</select>
              <select className="input text-sm" value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort requests">{SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
            </div>
            <ul className="card p-0 divide-y divide-[#E2E8F0] overflow-hidden">
              {visible.map(r => <QueueRow key={r.id} r={r} active={selected?.id === r.id} onSelect={id => { setSelectedId(id); setFlash('') }} />)}
              {visible.length === 0 && <li className="px-4 py-4 text-xs text-[#64748B]">No requests match your filters.</li>}
            </ul>
          </div>

          <div className="xl:sticky xl:top-4">
            {selected && <RequestDetail key={selected.id} r={selected} onDone={msg => { setFlash(msg); setSelectedId(null) }} />}
          </div>
        </div>
      )}
    </AppShell>
  )
}
