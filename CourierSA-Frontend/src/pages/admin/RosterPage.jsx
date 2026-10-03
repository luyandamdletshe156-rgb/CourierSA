import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { EmptyState, PageLoader, Alert } from '@/components/ui'
import { shiftApi } from '@/api'
import { formatDate } from '@/utils'
import clsx from 'clsx'

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

function RosterTab() {
  const qc = useQueryClient()
  const [weekStart, setWeekStart] = useState(iso(mondayOf()))
  const weekEnd = iso(new Date(new Date(weekStart).getTime() + 6 * 86400000))
  const [driverId, setDriverId] = useState('')
  const [date, setDate] = useState(iso(new Date()))
  const [shiftType, setShiftType] = useState('Morning')

  const { data: drivers, error: driversError } = useQuery({
    queryKey: ['roster-drivers'],
    queryFn: () => shiftApi.drivers(),
  })
  const { data, isLoading, error: rosterError } = useQuery({
    queryKey: ['roster', weekStart],
    queryFn: () => shiftApi.roster(weekStart, weekEnd),
  })
  const shifts = unwrap(data)
  const driverList = unwrap(drivers)
  const refresh = () => qc.invalidateQueries({ queryKey: ['roster'] })

  const add = useMutation({
    mutationFn: () => shiftApi.schedule({ shifts: [{ driverId, date, shiftType }], publish: false }),
    onSuccess: refresh,
  })
  const publish = useMutation({
    mutationFn: () => shiftApi.publish({ from: weekStart, to: weekEnd }),
    onSuccess: refresh,
  })
  const unpublished = shifts.filter(s => !s.isPublished && s.status === 'Scheduled').length

  return (
    <div className="space-y-5">
      {driversError && <Alert type="error" message={`Could not load drivers: ${driversError.message}`} />}
      {rosterError && <Alert type="error" message={`Could not load roster: ${rosterError.message}`} />}
      {!driversError && drivers && driverList.length === 0 && (
        <Alert type="error" message="No active drivers found. Create a driver account under Users first." />
      )}

      <div className="card p-5 space-y-3">
        <h3 className="text-sm font-bold">Add a shift</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <select className="input" value={driverId} onChange={e => setDriverId(e.target.value)}>
            <option value="">Driver…</option>
            {driverList.map(d => <option key={d.driverId} value={d.driverId}>{d.name}</option>)}
          </select>
          <input type="date" className="input" value={date} onChange={e => setDate(e.target.value)} />
          <select className="input" value={shiftType} onChange={e => setShiftType(e.target.value)}>
            <option value="Morning">Morning 07:30–13:00</option>
            <option value="Afternoon">Afternoon 13:30–19:00</option>
          </select>
          <button className="btn-primary text-sm" disabled={!driverId || add.isPending} onClick={() => add.mutate()}>Add shift</button>
        </div>
        {add.error && <Alert type="error" message={add.error.message} />}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-semibold">Week starting</label>
        <input type="date" className="input w-auto" value={weekStart} onChange={e => setWeekStart(e.target.value)} />
        <button className="btn-primary text-sm" disabled={unpublished === 0 || publish.isPending} onClick={() => publish.mutate()}>
          Publish week ({unpublished} unpublished)
        </button>
      </div>
      {publish.error && <Alert type="error" message={publish.error.message} />}

      {isLoading ? <PageLoader /> : rosterError ? null : shifts.length === 0 ? (
        <EmptyState title="No shifts this week" description="Add shifts above, then publish the week so drivers can see it." />
      ) : (
        <div className="card divide-y divide-[#E2E8F0]">
          {shifts.map(s => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
              <span className="font-semibold w-28">{formatDate(s.date)}</span>
              <span className="w-24">{s.shiftType}</span>
              <span className="text-[#64748B]">{s.startTime}–{s.endTime}</span>
              <span className="font-semibold">{s.driverName ?? 'Unstaffed'}</span>
              <span className={clsx('ml-auto text-xs font-bold px-2 py-0.5 rounded-full',
                s.status === 'Open' ? 'bg-[#FEF2F2] text-[#B91C1C]' : s.isPublished ? 'bg-[#F0FDF4] text-[#166534]' : 'bg-[#F1F5F9] text-[#475569]')}>
                {s.status === 'Open' ? 'Open' : s.isPublished ? 'Published' : 'Draft'}
              </span>
              {s.note && <span className="w-full text-xs text-[#64748B]">{s.note}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function LeaveCard({ r }) {
  const qc = useQueryClient()
  const [notes, setNotes] = useState('')
  const [override, setOverride] = useState(false)
  const [result, setResult] = useState(null)
  const review = useMutation({
    mutationFn: approve => shiftApi.reviewLeave(r.id, { approve, notes, allowUnderstaffed: override }),
    onSuccess: res => {
      setResult(res?.data ?? res)
      qc.invalidateQueries({ queryKey: ['pending-leave'] })
      qc.invalidateQueries({ queryKey: ['open-shifts'] })
      qc.invalidateQueries({ queryKey: ['roster'] })
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