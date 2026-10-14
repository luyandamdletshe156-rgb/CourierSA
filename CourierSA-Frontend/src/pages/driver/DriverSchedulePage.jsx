import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import RosterSubNav from '@/components/roster/RosterSubNav'
import { EmptyState, PageLoader, Alert, StatCard } from '@/components/ui'
import { shiftApi } from '@/api'
import {
  iso, unwrap, dayKey, addDays, mondayOf, mondayKeyOf, shortDate, weekdayOf, weekLabel,
  relativeDay, shiftHours, daysFromToday, SHIFT_TONE, DAY_LABELS,
} from '@/utils/roster'
import { formatDate } from '@/utils'
import clsx from 'clsx'
import { CalendarDays, Repeat, Clock, Hourglass, ListChecks, CalendarRange, ArrowRight } from 'lucide-react'

// My Schedule (driver): only the shifts. Leave and requests have their own pages.
// Page order: summary and next shift, anything waiting on you, then your shifts (list or calendar).

const VIEWS = [
  { key: 'list', label: 'List', icon: ListChecks },
  { key: 'calendar', label: 'Calendar', icon: CalendarRange },
]

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
      <p className="text-xs text-[#64748B]">Offer this shift to a colleague who is off duty that day. They accept first, then an admin approves.</p>
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

function ShiftCard({ s, todayKey, swapOpen, onToggle, onSent }) {
  const key = dayKey(s.date)
  const tone = SHIFT_TONE[s.shiftType]
  return (
    <div className={clsx('card p-4', key === todayKey && 'ring-2 ring-[#0A3D91]')}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold flex flex-wrap items-center gap-1.5">
            <CalendarDays size={14} /> {weekdayOf(key)} {formatDate(s.date)}
            {key === todayKey && <span className="text-[11px] font-bold bg-[#DBEAFE] text-[#1D4ED8] px-2 py-0.5 rounded-full">Today</span>}
          </p>
          <p className="text-xs text-[#64748B] mt-0.5 flex flex-wrap items-center gap-1.5">
            <span className={clsx('font-bold px-2 py-0.5 rounded-full', tone?.pill)}>{tone?.letter} {s.shiftType}</span>
            {s.startTime}–{s.endTime} · {shiftHours(s)} h · {relativeDay(key)}
          </p>
        </div>
        <button className="btn-secondary btn-sm text-xs" onClick={onToggle}>
          <Repeat size={12} /> {swapOpen ? 'Close' : 'Swap'}
        </button>
      </div>
      {swapOpen && <SwapForm shift={s} onDone={onSent} />}
    </div>
  )
}

export default function DriverSchedulePage() {
  const qc = useQueryClient()
  const [view, setView] = useState('list')
  const [swapFor, setSwapFor] = useState(null)
  const [pickedDay, setPickedDay] = useState(null)
  const [sentMsg, setSentMsg] = useState('')

  const todayKey = iso(new Date())
  const from = todayKey
  const to = iso(new Date(Date.now() + 28 * 86400000))

  const { data: shiftsData, isLoading, error } = useQuery({ queryKey: ['my-shifts'], queryFn: () => shiftApi.myShifts(from, to) })
  const { data: swapData } = useQuery({ queryKey: ['my-swaps'], queryFn: () => shiftApi.mySwaps() })
  const shifts = [...unwrap(shiftsData)].sort((a, b) => dayKey(a.date).localeCompare(dayKey(b.date)))
  const waiting = unwrap(swapData).filter(w => w.awaitingMyReply).length

  const refresh = () => ['my-shifts', 'my-swaps'].forEach(k => qc.invalidateQueries({ queryKey: [k] }))
  const sent = () => { setSwapFor(null); setSentMsg('Swap request sent. Track it under My requests.'); refresh() }

  const byDay = {}
  shifts.forEach(s => { byDay[dayKey(s.date)] = s })
  const next = shifts.find(s => dayKey(s.date) >= todayKey)
  const totalHours = shifts.reduce((sum, s) => sum + shiftHours(s), 0)
  const mornings = shifts.filter(s => s.shiftType === 'Morning').length

  // Shifts grouped by week for the list view
  const byWeek = new Map()
  shifts.forEach(s => {
    const k = mondayKeyOf(dayKey(s.date))
    if (!byWeek.has(k)) byWeek.set(k, [])
    byWeek.get(k).push(s)
  })

  // Calendar: every week from this Monday to the last fetched day
  const firstMonday = iso(mondayOf())
  const weekKeys = []
  for (let k = firstMonday; k <= to; k = addDays(k, 7)) weekKeys.push(k)
  const picked = pickedDay ? byDay[pickedDay] : null

  return (
    <AppShell title="My Schedule">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Schedule</h1>
          <p className="page-subtitle">Your published shifts for the next four weeks. Offer a shift to an off-duty colleague with Swap.</p>
        </div>
      </div>

      <RosterSubNav role="driver" />

      <div className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label="Next shift" value={next ? relativeDay(dayKey(next.date)) : '—'} icon={Clock} color="bg-[#0A3D91]"
            sub={next ? `${next.shiftType} · ${next.startTime}–${next.endTime}` : 'Nothing published yet'} />
          <StatCard label="Shifts" value={shifts.length} icon={CalendarDays} color="bg-[#1E63E9]" sub="In the next 4 weeks" />
          <StatCard label="Hours" value={totalHours} icon={Hourglass} color="bg-[#16A34A]" sub={`${mornings} morning, ${shifts.length - mornings} afternoon`} />
          <StatCard label="Days off" value={Math.max(0, 28 - shifts.length)} icon={CalendarRange} color="bg-[#64748B]" sub="In the next 4 weeks" />
        </div>

        {waiting > 0 && (
          <Link to="/driver/requests" className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 hover:bg-amber-100">
            <span><b>{waiting}</b> swap request{waiting === 1 ? ' is' : 's are'} waiting for your reply.</span>
            <span className="inline-flex items-center gap-1 font-bold">Reply <ArrowRight size={14} /></span>
          </Link>
        )}
        {sentMsg && <Alert type="success" message={sentMsg} />}
        {error && <Alert type="error" message={`Could not load your shifts: ${error.message}`} />}

        {isLoading ? <PageLoader /> : shifts.length === 0 ? (
          <EmptyState title="No published shifts" description="Your roster will appear here once the admin publishes it." />
        ) : (
          <div className="space-y-4">
            <div role="tablist" className="inline-flex rounded-xl border border-[#D8E4F5] bg-white p-1">
              {VIEWS.map(v => (
                <button key={v.key} role="tab" aria-selected={view === v.key} onClick={() => setView(v.key)}
                  className={clsx('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition',
                    view === v.key ? 'bg-[#0A3D91] text-white' : 'text-[#475569] hover:bg-[#F1F5F9]')}>
                  <v.icon size={13} /> {v.label}
                </button>
              ))}
            </div>

            {view === 'list' ? [...byWeek].map(([weekKey, list]) => {
              const { name, range } = weekLabel(weekKey)
              return (
                <section key={weekKey} className="space-y-2">
                  <h2 className="text-sm font-bold text-[#0F172A]">
                    {name} <span className="font-normal text-xs text-[#64748B]">{range} · {list.length} shift{list.length === 1 ? '' : 's'}</span>
                  </h2>
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-start">
                    {list.map(s => (
                      <ShiftCard key={s.id} s={s} todayKey={todayKey} swapOpen={swapFor === s.id}
                        onToggle={() => { setSentMsg(''); setSwapFor(swapFor === s.id ? null : s.id) }} onSent={sent} />
                    ))}
                  </div>
                </section>
              )
            }) : (
              <div className="space-y-4">
                <div className="card p-4 overflow-x-auto">
                  <div className="min-w-[560px] space-y-1.5">
                    <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-bold uppercase text-[#64748B]">
                      {DAY_LABELS.map(d => <div key={d}>{d}</div>)}
                    </div>
                    {weekKeys.map(wk => (
                      <div key={wk} className="grid grid-cols-7 gap-1.5">
                        {Array.from({ length: 7 }, (_, i) => addDays(wk, i)).map(d => {
                          const s = byDay[d]
                          const past = daysFromToday(d) < 0
                          const tone = s && SHIFT_TONE[s.shiftType]
                          return (
                            <button key={d} type="button" disabled={!s} onClick={() => { setSentMsg(''); setSwapFor(null); setPickedDay(d === pickedDay ? null : d) }}
                              className={clsx('rounded-xl border p-1.5 min-h-[64px] text-left transition',
                                s ? 'border-[#D8E4F5] bg-white hover:border-[#1E63E9]' : 'border-transparent bg-[#F8FAFC]',
                                d === todayKey && 'ring-2 ring-[#0A3D91]', d === pickedDay && 'border-[#0A3D91]', past && 'opacity-40')}>
                              <span className="block text-[11px] text-[#64748B]">{shortDate(d)}</span>
                              {s && <span className={clsx('mt-1 inline-block text-[11px] font-bold px-1.5 py-0.5 rounded-full', tone.pill)}>{tone.letter} {s.startTime.slice(0, 5)}</span>}
                            </button>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2 text-[11px] font-bold">
                  <span className={clsx('px-2 py-0.5 rounded-full', SHIFT_TONE.Morning.pill)}>A morning</span>
                  <span className={clsx('px-2 py-0.5 rounded-full', SHIFT_TONE.Afternoon.pill)}>B afternoon</span>
                  <span className="px-2 py-0.5 rounded-full bg-[#F1F5F9] text-[#64748B]">Day off</span>
                </div>
                {picked
                  ? <ShiftCard s={picked} todayKey={todayKey} swapOpen={swapFor === picked.id}
                      onToggle={() => setSwapFor(swapFor === picked.id ? null : picked.id)} onSent={sent} />
                  : <p className="text-xs text-[#64748B]">Tap a shift in the calendar to see its details or offer it for a swap.</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  )
}
