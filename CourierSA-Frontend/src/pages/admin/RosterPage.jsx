import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { EmptyState, PageLoader, Alert } from '@/components/ui'
import { shiftApi } from '@/api'
import { formatDate } from '@/utils'
import clsx from 'clsx'
import { ChevronLeft, ChevronRight } from 'lucide-react'

// Schedule Driver Roster, and Approve Leave & Reassign Shifts (admin).
// Local-date formatter (toISOString is UTC and can show yesterday just after midnight in SAST)
const iso = d => {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
const unwrap = d => (Array.isArray(d) ? d : d?.data ?? [])
const mondayOf = (d = new Date()) => {
  const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x
}
const TABS = ['Roster', 'Leave requests', 'Shift swaps', 'Open shifts']

const addDays = (isoStr, n) => {
  const [y, m, d] = isoStr.split('-').map(Number)
  return iso(new Date(y, m - 1, d + n))
}
const parseIso = isoStr => { const [y, m, d] = isoStr.split('-').map(Number); return new Date(y, m - 1, d) }
const dayKey = d => String(d).slice(0, 10)
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const shortDate = isoStr => parseIso(isoStr).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' })
const compactHours = h => (h ?? '').replace(/:00/g, '')

// Schedule Driver Roster: weekly grid. Click a cell to cycle Off -> A -> B -> Off.
function RosterTab() {
  const qc = useQueryClient()
  const [weekStart, setWeekStart] = useState(iso(mondayOf()))
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const weekEnd = days[6]
  const todayIso = iso(new Date())

  const { data: rulesRes } = useQuery({ queryKey: ['roster', 'rules'], queryFn: () => shiftApi.rosterRules() })
  const rules = rulesRes?.data ?? rulesRes
  const minDrivers = rules?.minDriversPerShift ?? 1

  const { data: drivers, error: driversError } = useQuery({
    queryKey: ['roster-drivers'],
    queryFn: () => shiftApi.drivers(),
  })
  const { data, isLoading, error: rosterError } = useQuery({
    queryKey: ['roster', weekStart],
    queryFn: () => shiftApi.roster(weekStart, weekEnd),
  })
  const { data: checkRes } = useQuery({
    queryKey: ['roster', 'validate', weekStart],
    queryFn: () => shiftApi.rosterValidate(weekStart, weekEnd),
  })
  const check = checkRes?.data ?? checkRes
  const violations = check?.violations ?? []
  const warnings = check?.warnings ?? []

  const driverList = unwrap(drivers)
  const shifts = unwrap(data).filter(s => s.driverId && s.status === 'Scheduled')
  const byCell = {}
  shifts.forEach(s => { byCell[`${s.driverId}|${dayKey(s.date)}`] = s })
  const unpublished = shifts.filter(s => !s.isPublished).length

  const refresh = () => qc.invalidateQueries({ queryKey: ['roster'] })

  // Off -> Morning (A) -> Afternoon (B) -> Off
  const cycle = useMutation({
    mutationFn: ({ driverId, date, shift }) => {
      if (!shift) return shiftApi.schedule({ shifts: [{ driverId, date, shiftType: 'Morning' }], publish: false })
      if (shift.shiftType === 'Morning') return shiftApi.changeShift(shift.id, 'Afternoon')
      return shiftApi.removeShift(shift.id)
    },
    onSuccess: refresh,
  })
  const publish = useMutation({
    mutationFn: () => shiftApi.publish({ from: weekStart, to: weekEnd }),
    onSuccess: refresh,
  })

  const count = (date, type) => shifts.filter(s => dayKey(s.date) === date && s.shiftType === type).length
  const applies = date => date >= todayIso && !(parseIso(date).getDay() === 0 && shifts.every(s => dayKey(s.date) !== date))

  const hours = { Morning: compactHours(rules?.morningHours), Afternoon: compactHours(rules?.afternoonHours) }

  return (
    <div className="space-y-5">
      {driversError && <Alert type="error" message={`Could not load drivers: ${driversError.message}`} />}
      {rosterError && <Alert type="error" message={`Could not load roster: ${rosterError.message}`} />}
      {!driversError && drivers && driverList.length === 0 && (
        <Alert type="error" message="No active drivers found. Create a driver account under Users first." />
      )}

      {/* Settings: week, depot, coverage and shift hours */}
      <div className="card p-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Week</label>
            <div className="flex items-center gap-1 mt-1">
              <button className="btn-secondary px-2 py-2" aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft size={16} /></button>
              <input type="date" className="input" value={weekStart}
                onChange={e => e.target.value && setWeekStart(iso(mondayOf(parseIso(e.target.value))))} />
              <button className="btn-secondary px-2 py-2" aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight size={16} /></button>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Depot</label>
            <select className="input mt-1" value={rules?.depot ?? ''} disabled>
              <option value={rules?.depot ?? ''}>{rules?.depot ?? 'Depot'}</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Min. drivers per shift</label>
            <input className="input mt-1" value={`${minDrivers} driver${minDrivers === 1 ? '' : 's'}`} disabled />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Shift A / Shift B</label>
            <input className="input mt-1" value={`${rules?.morningHours ?? ''}  ·  ${rules?.afternoonHours ?? ''}`} disabled />
          </div>
          <button className="btn-primary text-sm" disabled={unpublished === 0 || publish.isPending || violations.length > 0}
            onClick={() => publish.mutate()}>
            {publish.isPending ? 'Publishing…' : `Publish roster (${unpublished} unpublished)`}
          </button>
        </div>
        <p className="text-xs text-[#64748B] mt-3">
          Click a cell to cycle <b>Off → A → B → Off</b>. Dashed cells are drafts that drivers cannot see until you publish.
        </p>
      </div>

      {cycle.error && <Alert type="error" message={cycle.error.message} />}
      {publish.error && <Alert type="error" message={publish.error.message} />}
      {publish.isSuccess && <Alert type="success" message="Roster published. Drivers have been notified." />}

      {/* Weekly grid */}
      {isLoading ? <PageLoader /> : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="text-left text-[#64748B] bg-[#F8FAFC]">
                <th className="px-4 py-2.5 w-48">Driver</th>
                {days.map((d, i) => (
                  <th key={d} className={clsx('px-2 py-2.5 text-center', d === todayIso && 'text-[#0A3D91]')}>
                    <div className="text-xs font-bold uppercase">{DAY_LABELS[i]}</div>
                    <div className="text-[11px] font-normal">{shortDate(d)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {driverList.map(dr => (
                <tr key={dr.driverId}>
                  <td className="px-4 py-2 font-semibold">{dr.name}</td>
                  {days.map(date => {
                    const shift = byCell[`${dr.driverId}|${date}`]
                    const past = date < todayIso
                    const busy = cycle.isPending && cycle.variables?.driverId === dr.driverId && cycle.variables?.date === date
                    const label = !shift ? 'Off' : `${shift.shiftType === 'Morning' ? 'A' : 'B'} ${hours[shift.shiftType]}`
                    return (
                      <td key={date} className="px-1.5 py-1.5 text-center">
                        <button
                          disabled={past || cycle.isPending}
                          onClick={() => cycle.mutate({ driverId: dr.driverId, date, shift })}
                          title={past ? 'Past days cannot be changed' : 'Click to change: Off → A → B → Off'}
                          className={clsx('w-full rounded-full px-2 py-1 text-xs font-bold border transition',
                            !shift && 'bg-[#F1F5F9] text-[#64748B] border-transparent hover:border-[#CBD5E1]',
                            shift?.shiftType === 'Morning' && 'bg-[#DBEAFE] text-[#1D4ED8]',
                            shift?.shiftType === 'Afternoon' && 'bg-[#FFEDD5] text-[#C2410C]',
                            shift && (shift.isPublished ? 'border-transparent' : 'border-dashed border-current'),
                            (past || busy) && 'opacity-50 cursor-not-allowed')}>
                          {busy ? '…' : label}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
              {driverList.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-6 text-center text-[#64748B]">No drivers to roster yet.</td></tr>
              )}
            </tbody>
            <tfoot className="bg-[#F8FAFC] text-xs">
              {[['Morning', 'Shift A on duty'], ['Afternoon', 'Shift B on duty']].map(([type, title]) => (
                <tr key={type} className="border-t border-[#E2E8F0]">
                  <td className="px-4 py-2 font-bold">{title}</td>
                  {days.map(date => {
                    const n = count(date, type)
                    const checked = applies(date)
                    const low = checked && n < minDrivers
                    return (
                      <td key={date} className="px-1.5 py-2 text-center">
                        <span className={clsx('font-bold px-2 py-0.5 rounded-full',
                          !checked ? 'text-[#94A3B8]' : low ? 'bg-[#FEF2F2] text-[#B91C1C]' : 'bg-[#F0FDF4] text-[#166534]')}>
                          {n}{checked ? (low ? ' ✕' : ' ✓') : ''}
                        </span>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tfoot>
          </table>
        </div>
      )}

      {/* Conflict, rest-period and coverage checks */}
      {violations.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm space-y-1">
          <p className="font-bold">Rest-period problems (fix these before publishing)</p>
          {violations.map((v, i) => <p key={i}>• {v.message}</p>)}
        </div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-800 px-4 py-3 text-sm space-y-1">
          <p className="font-bold">Coverage warnings</p>
          {warnings.map((w, i) => <p key={i}>• {w.message}</p>)}
        </div>
      )}
      {check && violations.length === 0 && warnings.length === 0 && (
        <Alert type="success" message="No scheduling conflicts, rest-period violations or coverage gaps detected." />
      )}
    </div>
  )
}

function LeaveCard({ r }) {
  const qc = useQueryClient()
  const [notes, setNotes] = useState('')
  const [override, setOverride] = useState(false)
  const [standbyId, setStandbyId] = useState('')
  const [result, setResult] = useState(null)

  // Coverage-impact simulation: scheduled vs. remaining drivers per affected shift
  const { data: impactRes, isLoading: impactLoading, error: impactError } = useQuery({
    queryKey: ['leave-impact', r.id],
    queryFn: () => shiftApi.leaveImpact(r.id),
  })
  const impact = impactRes?.data ?? impactRes
  const rows = impact?.rows ?? []
  const standbyPool = impact?.standbyPool ?? []
  const short = impact?.shortSlots ?? 0

  const review = useMutation({
    mutationFn: approve => shiftApi.reviewLeave(r.id, {
      approve, notes, allowUnderstaffed: override, standbyDriverId: standbyId || null,
    }),
    onSuccess: res => {
      setResult(res?.data ?? res)
      qc.invalidateQueries({ queryKey: ['pending-leave'] })
      qc.invalidateQueries({ queryKey: ['open-shifts'] })
      qc.invalidateQueries({ queryKey: ['roster'] })
      qc.invalidateQueries({ queryKey: ['leave-impact', r.id] })
    },
  })
  return (
    <div className="card p-5 space-y-3">
      <div className="flex justify-between gap-3">
        <div>
          <p className="font-bold text-sm">{r.driverName}</p>
          <p className="text-xs text-[#64748B]">{r.leaveType} · {formatDate(r.startDate)} – {formatDate(r.endDate)}</p>
        </div>
        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[#EFF6FF] text-[#1D4ED8] h-fit">{r.affectedShifts} shift(s) affected</span>
      </div>
      {r.reason && <p className="text-sm bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3 py-2">{r.reason}</p>}

      {/* Coverage impact simulation */}
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wide text-[#64748B]">Coverage impact</p>
        {impactLoading && <p className="text-xs text-[#64748B]">Calculating coverage…</p>}
        {impactError && <Alert type="error" message={`Could not load coverage impact: ${impactError.message}`} />}
        {!impactLoading && !impactError && rows.length === 0 && (
          <p className="text-xs text-[#64748B]">This driver has no scheduled shifts in the leave period, so depot coverage is not affected.</p>
        )}
        {rows.length > 0 && (
          <div className="border border-[#E2E8F0] rounded-xl overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[#64748B] bg-[#F8FAFC]">
                  <th className="px-3 py-2">Day</th>
                  <th className="px-3 py-2">Shift</th>
                  <th className="px-3 py-2">Scheduled</th>
                  <th className="px-3 py-2">After leave</th>
                  <th className="px-3 py-2">Minimum</th>
                  <th className="px-3 py-2">Cover free</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {rows.map(row => (
                  <tr key={`${row.date}-${row.shiftType}`}>
                    <td className="px-3 py-2 font-semibold">{formatDate(row.date)}</td>
                    <td className="px-3 py-2">{row.shiftType}</td>
                    <td className="px-3 py-2">{row.scheduled}</td>
                    <td className="px-3 py-2">
                      <span className={clsx('font-bold px-2 py-0.5 rounded-full',
                        row.belowMinimum ? 'bg-[#FEF2F2] text-[#B91C1C]' : 'bg-[#F0FDF4] text-[#166534]')}>
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
        {short > 0 && (
          <Alert type="error" message={`Coverage drops below the minimum on ${short} shift(s). Select a standby replacement below, or approve anyway and fill the open shifts afterwards.`} />
        )}
      </div>

      {rows.length > 0 && (
        <div>
          <label className="text-xs font-bold uppercase tracking-wide text-[#64748B]">Standby replacement (available pool)</label>
          <select className="input mt-1" value={standbyId} onChange={e => setStandbyId(e.target.value)}>
            <option value="">Automatic (least-loaded available driver)</option>
            {standbyPool.map(d => (
              <option key={d.driverId} value={d.driverId}>
                {d.name} · can cover {d.canCover} of {rows.length} shift(s)
              </option>
            ))}
          </select>
          {standbyPool.length === 0 && (
            <p className="text-xs text-[#B91C1C] mt-1">No driver is free on any affected day, so shifts will be left open.</p>
          )}
        </div>
      )}

      <textarea className="input" rows={2} placeholder="Notes (required if rejecting)" value={notes} onChange={e => setNotes(e.target.value)} />
      <label className="flex items-center gap-2 text-xs text-[#475569]">
        <input type="checkbox" checked={override} onChange={e => setOverride(e.target.checked)} />
        Approve even if the depot is left understaffed (open shifts are filled afterwards)
      </label>
      {review.error && <Alert type="error" message={review.error.message} />}
      {result && <Alert type="success" message={`Done. ${result.reassignedShifts} shift(s) reassigned, ${result.openShifts} left open.`} />}
      <div className="flex gap-2">
        <button className="btn-primary text-sm" disabled={review.isPending} onClick={() => review.mutate(true)}>Approve &amp; reassign</button>
        <button className="btn-danger text-sm" disabled={review.isPending || !notes.trim()} onClick={() => review.mutate(false)}>Reject</button>
      </div>
    </div>
  )
}

function SwapCard({ r }) {
  const qc = useQueryClient()
  const [notes, setNotes] = useState('')
  const review = useMutation({
    mutationFn: approve => shiftApi.reviewSwap(r.id, { approve, notes }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['pending-swaps'] }); qc.invalidateQueries({ queryKey: ['roster'] }) },
  })
  return (
    <div className="card p-5 space-y-3">
      <p className="font-bold text-sm">{r.shiftType} shift · {formatDate(r.date)}</p>
      <p className="text-sm">{r.requesterName} wants {r.peerName} to take this shift. {r.peerName} has accepted.</p>
      {r.reason && <p className="text-sm bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3 py-2">{r.reason}</p>}
      <textarea className="input" rows={2} placeholder="Notes (required if rejecting)" value={notes} onChange={e => setNotes(e.target.value)} />
      {review.error && <Alert type="error" message={review.error.message} />}
      <div className="flex gap-2">
        <button className="btn-primary text-sm" disabled={review.isPending} onClick={() => review.mutate(true)}>Approve swap</button>
        <button className="btn-danger text-sm" disabled={review.isPending || !notes.trim()} onClick={() => review.mutate(false)}>Reject</button>
      </div>
    </div>
  )
}

function OpenShiftCard({ s, drivers }) {
  const qc = useQueryClient()
  const [driverId, setDriverId] = useState('')
  const assign = useMutation({
    mutationFn: () => shiftApi.assignShift(s.id, driverId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['open-shifts'] }); qc.invalidateQueries({ queryKey: ['roster'] }) },
  })
  return (
    <div className="card p-5 space-y-3">
      <p className="font-bold text-sm">{s.shiftType} · {formatDate(s.date)} <span className="text-[#64748B] font-normal">({s.startTime}–{s.endTime})</span></p>
      {s.note && <p className="text-xs text-[#64748B]">{s.note}</p>}
      <div className="flex gap-2">
        <select className="input" value={driverId} onChange={e => setDriverId(e.target.value)}>
          <option value="">Assign a driver…</option>
          {drivers.map(d => <option key={d.driverId} value={d.driverId}>{d.name}</option>)}
        </select>
        <button className="btn-primary text-sm" disabled={!driverId || assign.isPending} onClick={() => assign.mutate()}>Assign</button>
      </div>
      {assign.error && <Alert type="error" message={assign.error.message} />}
    </div>
  )
}

function List({ query, empty, render }) {
  if (query.isLoading) return <PageLoader />
  if (query.error) return <Alert type="error" message={`Could not load data: ${query.error.message}`} />
  const items = unwrap(query.data)
  if (items.length === 0) return <EmptyState title={empty.title} description={empty.description} />
  return <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">{items.map(render)}</div>
}

export default function RosterPage() {
  const [tab, setTab] = useState('Roster')
  const leave = useQuery({ queryKey: ['pending-leave'], queryFn: () => shiftApi.pendingLeave(), refetchInterval: 30000 })
  const swaps = useQuery({ queryKey: ['pending-swaps'], queryFn: () => shiftApi.pendingSwaps(), refetchInterval: 30000 })
  const open = useQuery({ queryKey: ['open-shifts'], queryFn: () => shiftApi.openShifts(), refetchInterval: 30000 })
  const drivers = useQuery({ queryKey: ['roster-drivers'], queryFn: () => shiftApi.drivers() })

  const counts = { 'Leave requests': unwrap(leave.data).length, 'Shift swaps': unwrap(swaps.data).length, 'Open shifts': unwrap(open.data).length }

  return (
    <AppShell title="Roster & Leave">
      <div className="page-header">
        <div>
          <h1 className="page-title">Roster &amp; Leave</h1>
          <p className="page-subtitle">Schedule driver shifts, approve leave and swaps, and keep every shift staffed.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-5">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={clsx('px-3.5 py-1.5 rounded-full text-sm font-semibold border',
              tab === t ? 'bg-[#0A3D91] text-white border-[#0A3D91]' : 'bg-white text-[#334155] border-[#CBD5E1]')}>
            {t}{counts[t] ? ` (${counts[t]})` : ''}
          </button>
        ))}
      </div>

      {tab === 'Roster' && <RosterTab />}
      {tab === 'Leave requests' && (
        <List query={leave} render={r => <LeaveCard key={r.id} r={r} />}
          empty={{ title: 'No pending leave requests', description: 'Driver leave requests appear here for approval.' }} />
      )}
      {tab === 'Shift swaps' && (
        <List query={swaps} render={r => <SwapCard key={r.id} r={r} />}
          empty={{ title: 'No swaps waiting', description: 'Swaps appear here once the other driver has accepted.' }} />
      )}
      {tab === 'Open shifts' && (
        <List query={open} render={s => <OpenShiftCard key={s.id} s={s} drivers={unwrap(drivers.data)} />}
          empty={{ title: 'No open shifts', description: 'Shifts left unstaffed after approved leave appear here.' }} />
      )}
    </AppShell>
  )
}