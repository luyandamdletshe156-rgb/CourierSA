import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { EmptyState, PageLoader, Alert } from '@/components/ui'
import { shiftApi } from '@/api'
import { formatDate } from '@/utils'
import clsx from 'clsx'
import { CalendarDays, Repeat, Plane } from 'lucide-react'

// Request Driver Leave and Request Shift Swap (driver).
// Page order: swap replies that need you, then your shifts by week on the left;
// request leave and the status of your requests on the right.
const iso = d => {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
const unwrap = d => (Array.isArray(d) ? d : d?.data ?? [])
const LEAVE_TYPES = ['Annual', 'Sick', 'Emergency']

const dayKey = d => String(d).slice(0, 10)
const parseIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
const mondayKeyOf = s => { const x = parseIso(s); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return iso(x) }
const shortDate = s => parseIso(s).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' })
const weekdayOf = s => parseIso(s).toLocaleDateString('en-ZA', { weekday: 'short' })

// "This week", "Next week", otherwise "Week of 19 Oct", plus the date range.
function weekLabel(mondayKey) {
  const thisMonday = mondayKeyOf(iso(new Date()))
  const diffWeeks = Math.round((parseIso(mondayKey) - parseIso(thisMonday)) / (7 * 86400000))
  const sunday = new Date(parseIso(mondayKey)); sunday.setDate(sunday.getDate() + 6)
  const range = `${shortDate(mondayKey)} – ${shortDate(iso(sunday))}`
  const name = diffWeeks === 0 ? 'This week' : diffWeeks === 1 ? 'Next week' : `Week of ${shortDate(mondayKey)}`
  return { name, range }
}

const STATUS_TONE = {
  Pending: 'bg-[#FFFBEB] text-[#92400E]',
  Approved: 'bg-[#F0FDF4] text-[#166534]',
  Rejected: 'bg-[#FEF2F2] text-[#B91C1C]',
}
function StatusPill({ status }) {
  return (
    <span className={clsx('text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap', STATUS_TONE[status] ?? 'bg-[#F1F5F9] text-[#475569]')}>
      {status}
    </span>
  )
}

function SwapForm({ shift, onDone }) {
  const [peerId, setPeerId] = useState('')
  const [reason, setReason] = useState('')
  const { data } = useQuery({ queryKey: ['swap-peers', shift.id], queryFn: () => shiftApi.swapPeers(shift.id) })
  const peers = unwrap(data)
  const send = useMutation({
    mutationFn: () => shiftApi.requestSwap({ shiftId: shift.id, peerDriverId: peerId, reason }),
    onSuccess: onDone,
  })
  return (
    <div className="mt-3 space-y-2 border-t border-[#E2E8F0] pt-3">
      <p className="text-xs text-[#64748B]">Offer this shift to a colleague who is off duty that day. They have to accept, then an admin approves.</p>
      <select className="input" value={peerId} onChange={e => setPeerId(e.target.value)}>
        <option value="">{peers.length ? 'Choose an off-duty colleague…' : 'No off-duty colleagues on this day'}</option>
        {peers.map(p => <option key={p.driverId} value={p.driverId}>{p.name}</option>)}
      </select>
      <input className="input" placeholder="Reason (optional)" value={reason} onChange={e => setReason(e.target.value)} />
      {send.error && <Alert type="error" message={send.error.message} />}
      <button className="btn-primary text-sm" disabled={!peerId || send.isPending} onClick={() => send.mutate()}>
        {send.isPending ? 'Sending…' : 'Send swap request'}
      </button>
    </div>
  )
}

function LeaveForm({ onDone }) {
  const today = iso(new Date())
  const [type, setType] = useState('Annual')
  const [start, setStart] = useState(today)
  const [end, setEnd] = useState(today)
  const [reason, setReason] = useState('')

  const { data: balanceRes } = useQuery({ queryKey: ['leave-balance'], queryFn: () => shiftApi.leaveBalance() })
  const balance = balanceRes?.data ?? balanceRes
  const items = balance?.items ?? []

  // Live check: days requested, balance left, and clashes with published shifts
  const { data: previewRes, error: previewError } = useQuery({
    queryKey: ['leave-preview', type, start, end],
    queryFn: () => shiftApi.previewLeave({ leaveType: type, startDate: start, endDate: end }),
    enabled: !!start && !!end,
  })
  const preview = previewRes?.data ?? previewRes

  const send = useMutation({
    mutationFn: () => shiftApi.requestLeave({ leaveType: type, startDate: start, endDate: end, reason }),
    onSuccess: () => { setReason(''); onDone() },
  })
  const blocked = !!preview && !preview.canSubmit

  return (
    <div className="card p-5 space-y-4">
      <h3 className="text-sm font-bold flex items-center gap-1.5"><Plane size={15} /> Request leave</h3>

      {items.length > 0 && (
        <div className="rounded-xl border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#64748B] mb-1">Leave balance · {balance.year}</p>
          {items.map(i => (
            <div key={i.leaveType} className="flex justify-between text-sm">
              <span>{i.leaveType}</span>
              <span className="font-semibold">
                {i.remaining == null ? 'No cap' : `${i.remaining} of ${i.entitlement} days`}
                {i.pending > 0 && <span className="text-xs font-normal text-[#64748B]"> ({i.pending} pending)</span>}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Fields, each labelled */}
      <div className="space-y-3">
        <div>
          <label className="label">Leave type</label>
          <select className="input" value={type} onChange={e => setType(e.target.value)}>
            {LEAVE_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">From</label>
            <input type="date" className="input" min={today} value={start} onChange={e => { setStart(e.target.value); if (e.target.value > end) setEnd(e.target.value) }} />
          </div>
          <div>
            <label className="label">To</label>
            <input type="date" className="input" min={start} value={end} onChange={e => setEnd(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="label">Notes</label>
          <textarea className="input" rows={2} placeholder="Optional" value={reason} onChange={e => setReason(e.target.value)} />
        </div>
      </div>

      {/* Live check of the request */}
      {previewError && <Alert type="error" message={`Could not check your request: ${previewError.message}`} />}
      {preview && preview.problem && <Alert type="error" message={preview.problem} />}
      {preview && !preview.problem && (
        <div className="space-y-2">
          <Alert type="success" message={`${preview.daysRequested} day(s) requested · balance sufficient${preview.balanceRemaining == null ? ' (no cap for this type)' : ` · ${preview.balanceRemaining - preview.daysRequested} day(s) will remain`}`} />
          {preview.publishedShiftClashes > 0 ? (
            <Alert type="warning" message={`${preview.publishedShiftClashes} of your published shift(s) fall in these dates. If approved they will be reassigned to other drivers.`} />
          ) : (
            <Alert type="info" message="No clash with your published shifts." />
          )}
        </div>
      )}

      {send.error && <Alert type="error" message={send.error.message} />}
      {send.isSuccess && <Alert type="success" message="Leave request sent for approval." />}
      <button className="btn-primary text-sm w-full justify-center" disabled={send.isPending || blocked} onClick={() => send.mutate()}>
        {send.isPending ? 'Sending…' : 'Submit leave request'}
      </button>
    </div>
  )
}

export default function DriverSchedulePage() {
  const qc = useQueryClient()
  const [swapFor, setSwapFor] = useState(null)
  const todayKey = iso(new Date())
  const from = todayKey
  const to = iso(new Date(Date.now() + 28 * 86400000))

  const { data: shiftsData, isLoading } = useQuery({ queryKey: ['my-shifts'], queryFn: () => shiftApi.myShifts(from, to) })
  const { data: leaveData } = useQuery({ queryKey: ['my-leave'], queryFn: () => shiftApi.myLeave() })
  const { data: swapData } = useQuery({ queryKey: ['my-swaps'], queryFn: () => shiftApi.mySwaps() })
  const shifts = unwrap(shiftsData), leave = unwrap(leaveData), swaps = unwrap(swapData)

  const refresh = () => {
    ['my-shifts', 'my-leave', 'my-swaps', 'leave-balance', 'leave-preview'].forEach(k => qc.invalidateQueries({ queryKey: [k] }))
  }
  const cancel = useMutation({ mutationFn: id => shiftApi.cancelLeave(id), onSuccess: refresh })
  const respond = useMutation({ mutationFn: ({ id, accept }) => shiftApi.respondSwap(id, accept), onSuccess: refresh })

  // Swaps waiting on this driver are pulled out to the top; the rest stay in "My requests".
  const needReply = swaps.filter(w => w.awaitingMyReply)
  const otherSwaps = swaps.filter(w => !w.awaitingMyReply)

  // Shifts grouped by week, in date order.
  const byWeek = new Map()
  ;[...shifts].sort((a, b) => dayKey(a.date).localeCompare(dayKey(b.date))).forEach(s => {
    const key = mondayKeyOf(dayKey(s.date))
    if (!byWeek.has(key)) byWeek.set(key, [])
    byWeek.get(key).push(s)
  })

  return (
    <AppShell title="My Schedule">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Schedule</h1>
          <p className="page-subtitle">Your published shifts for the next four weeks. Request leave or offer a shift to an off-duty colleague.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        {/* Left: what needs you, then your shifts by week */}
        <div className="xl:col-span-2 space-y-5">
          {needReply.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3">
              <h2 className="text-sm font-bold text-amber-900">Waiting for your reply ({needReply.length})</h2>
              {needReply.map(w => (
                <div key={w.id} className="bg-white border border-amber-200 rounded-xl px-3 py-2.5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">{w.requesterName} asks you to take {w.shiftType} · {formatDate(w.date)}</p>
                    {w.reason && <p className="text-xs text-[#64748B]">{w.reason}</p>}
                  </div>
                  <div className="flex gap-2">
                    <button className="btn-primary btn-sm text-xs" disabled={respond.isPending} onClick={() => respond.mutate({ id: w.id, accept: true })}>Accept</button>
                    <button className="btn-secondary btn-sm text-xs" disabled={respond.isPending} onClick={() => respond.mutate({ id: w.id, accept: false })}>Decline</button>
                  </div>
                </div>
              ))}
              {respond.error && <Alert type="error" message={respond.error.message} />}
            </div>
          )}

          {isLoading ? <PageLoader /> : shifts.length === 0 ? (
            <EmptyState title="No published shifts" description="Your roster will appear here once the admin publishes it." />
          ) : [...byWeek].map(([weekKey, list]) => {
            const { name, range } = weekLabel(weekKey)
            return (
              <section key={weekKey} className="space-y-2">
                <h2 className="text-sm font-bold text-[#0F172A]">
                  {name} <span className="font-normal text-xs text-[#64748B]">{range}</span>
                </h2>
                <div className="space-y-2">
                  {list.map(s => {
                    const key = dayKey(s.date)
                    return (
                      <div key={s.id} className={clsx('card p-4', key === todayKey && 'ring-2 ring-[#0A3D91]')}>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-bold flex items-center gap-1.5">
                              <CalendarDays size={14} /> {weekdayOf(key)} {formatDate(s.date)}
                              {key === todayKey && <span className="text-[11px] font-bold bg-[#DBEAFE] text-[#1D4ED8] px-2 py-0.5 rounded-full">Today</span>}
                            </p>
                            <p className="text-xs text-[#64748B]">{s.shiftType} shift · {s.startTime}–{s.endTime}</p>
                          </div>
                          <button className="btn-secondary btn-sm text-xs" onClick={() => setSwapFor(swapFor === s.id ? null : s.id)}>
                            <Repeat size={12} /> {swapFor === s.id ? 'Close' : 'Swap'}
                          </button>
                        </div>
                        {swapFor === s.id && <SwapForm shift={s} onDone={() => { setSwapFor(null); refresh() }} />}
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>

        {/* Right: ask for leave, then follow your requests */}
        <div className="space-y-6">
          <LeaveForm onDone={refresh} />

          <div className="card p-5 space-y-5">
            <h2 className="text-sm font-bold">My requests</h2>

            <section className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[#64748B]">Leave</h3>
              {leave.length === 0 && <p className="text-xs text-[#64748B]">No leave requests yet.</p>}
              {leave.map(l => (
                <div key={l.id} className="text-sm border border-[#E2E8F0] rounded-xl px-3 py-2">
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold">{l.leaveType}</span>
                    <StatusPill status={l.status} />
                  </div>
                  <p className="text-xs text-[#64748B]">{formatDate(l.startDate)} – {formatDate(l.endDate)}</p>
                  {l.adminNotes && <p className="text-xs mt-1">{l.adminNotes}</p>}
                  {l.status === 'Pending' && (
                    <button className="text-xs text-[#B91C1C] mt-1" disabled={cancel.isPending} onClick={() => cancel.mutate(l.id)}>Cancel request</button>
                  )}
                </div>
              ))}
              {cancel.error && <Alert type="error" message={cancel.error.message} />}
            </section>

            <section className="space-y-2 border-t border-[#E2E8F0] pt-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-[#64748B]">Shift swaps</h3>
              {otherSwaps.length === 0 && <p className="text-xs text-[#64748B]">No shift swaps yet.</p>}
              {otherSwaps.map(w => (
                <div key={w.id} className="text-sm border border-[#E2E8F0] rounded-xl px-3 py-2">
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold">{w.shiftType} · {formatDate(w.date)}</span>
                    <StatusPill status={w.status} />
                  </div>
                  <p className="text-xs text-[#64748B]">{w.requesterName} → {w.peerName}</p>
                  {w.adminNotes && <p className="text-xs mt-1">{w.adminNotes}</p>}
                </div>
              ))}
            </section>
          </div>
        </div>
      </div>
    </AppShell>
  )
}