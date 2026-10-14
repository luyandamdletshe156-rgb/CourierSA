import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import SummaryLine from '@/components/roster/SummaryLine'
import { EmptyState, PageLoader, Alert } from '@/components/ui'
import { shiftApi } from '@/api'
import { iso, unwrap, dayKey, addDays, mondayOf, shortDate, weekdayOf, weekLabel, relativeDay, shiftHours, SHIFT_TONE } from '@/utils/roster'
import clsx from 'clsx'
import { Repeat, ArrowRight } from 'lucide-react'

// My Schedule (driver): one agenda, week by week. Shifts and days off in order, swap from the row.

function SwapForm({ shift, onDone }) {
  const [peerId, setPeerId] = useState('')
  const [reason, setReason] = useState('')
  const { data } = useQuery({ queryKey: ['swap-peers', shift.id], queryFn: () => shiftApi.swapPeers(shift.id) })
  const peers = unwrap(data)
  const send = useMutation({ mutationFn: () => shiftApi.requestSwap({ shiftId: shift.id, peerDriverId: peerId, reason }), onSuccess: onDone })
  return (
    <div className="px-4 pb-4 pt-1 space-y-2">
      <p className="text-xs text-[#64748B]">Offer this shift to a colleague who is off that day. They accept first, then an admin approves.</p>
      <div className="flex flex-wrap gap-2">
        <select className="input flex-1 min-w-[200px]" value={peerId} onChange={e => setPeerId(e.target.value)}>
          <option value="">{peers.length ? 'Choose an off-duty colleague…' : 'No off-duty colleagues on this day'}</option>
          {peers.map(p => <option key={p.driverId} value={p.driverId}>{p.name}</option>)}
        </select>
        <input className="input flex-1 min-w-[200px]" placeholder="Reason (optional)" value={reason} onChange={e => setReason(e.target.value)} />
        <button className="btn-primary btn-sm text-xs" disabled={!peerId || send.isPending} onClick={() => send.mutate()}>{send.isPending ? 'Sending…' : 'Send request'}</button>
      </div>
      {send.error && <Alert type="error" message={send.error.message} />}
    </div>
  )
}

export default function DriverSchedulePage() {
  const qc = useQueryClient()
  const [swapFor, setSwapFor] = useState(null)
  const [sentMsg, setSentMsg] = useState('')

  const todayKey = iso(new Date())
  const to = iso(new Date(Date.now() + 28 * 86400000))

  const { data: shiftsData, isLoading, error } = useQuery({ queryKey: ['my-shifts'], queryFn: () => shiftApi.myShifts(todayKey, to) })
  const { data: swapData } = useQuery({ queryKey: ['my-swaps'], queryFn: () => shiftApi.mySwaps() })
  const shifts = [...unwrap(shiftsData)].sort((a, b) => dayKey(a.date).localeCompare(dayKey(b.date)))
  const waiting = unwrap(swapData).filter(w => w.awaitingMyReply).length

  const sent = () => {
    setSwapFor(null); setSentMsg('Swap request sent. Follow it under My Requests.')
    ;['my-shifts', 'my-swaps'].forEach(k => qc.invalidateQueries({ queryKey: [k] }))
  }

  const byDay = {}
  shifts.forEach(s => { byDay[dayKey(s.date)] = s })
  const next = shifts[0]
  const totalHours = shifts.reduce((sum, s) => sum + shiftHours(s), 0)

  const weeks = []
  for (let wk = iso(mondayOf()); wk <= to; wk = addDays(wk, 7)) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(wk, i)).filter(d => d >= todayKey && d <= to)
    if (days.length) weeks.push({ wk, days })
  }

  return (
    <AppShell title="My Schedule">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Schedule</h1>
          <p className="page-subtitle">Your published shifts for the next four weeks.</p>
        </div>
      </div>

      <SummaryLine items={[
        { value: next ? relativeDay(dayKey(next.date)) : '—', label: next ? `next shift, ${next.shiftType.toLowerCase()} ${next.startTime}–${next.endTime}` : 'next shift' },
        { value: shifts.length, label: 'shifts' },
        { value: `${totalHours} h`, label: 'hours' },
        { value: Math.max(0, 28 - shifts.length), label: 'days off' },
      ]} />

      <div className="space-y-4 max-w-4xl">
        {waiting > 0 && (
          <Link to="/driver/requests" className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 hover:bg-amber-100">
            <span><b>{waiting}</b> swap request{waiting === 1 ? ' is' : 's are'} waiting for your reply.</span>
            <span className="inline-flex items-center gap-1 font-bold">Reply <ArrowRight size={14} /></span>
          </Link>
        )}
        {sentMsg && <Alert type="success" message={sentMsg} />}
        {error && <Alert type="error" message={`Could not load your shifts: ${error.message}`} />}

        {isLoading ? <PageLoader /> : shifts.length === 0 ? (
          <EmptyState title="No published shifts" description="Your roster will appear here once the admin publishes it." />
        ) : weeks.map(({ wk, days }) => {
          const { name, range } = weekLabel(wk)
          const count = days.filter(d => byDay[d]).length
          return (
            <section key={wk} className="space-y-2">
              <h2 className="text-sm font-bold text-[#0F172A]">{name} <span className="font-normal text-xs text-[#64748B]">{range} · {count} shift{count === 1 ? '' : 's'}</span></h2>
              <ul className="card p-0 divide-y divide-[#E2E8F0] overflow-hidden">
                {days.map(d => {
                  const s = byDay[d]
                  const tone = s && SHIFT_TONE[s.shiftType]
                  const today = d === todayKey
                  if (!s) return (
                    <li key={d} className={clsx('flex items-center gap-4 px-4 py-2 text-xs text-[#94A3B8]', today && 'bg-[#F6FAFF]')}>
                      <span className="w-24">{weekdayOf(d)} {shortDate(d)}</span>Day off
                    </li>
                  )
                  return (
                    <li key={d} className={clsx(today && 'bg-[#F6FAFF]')}>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3">
                        <span className="w-24 text-sm font-bold">{weekdayOf(d)} {shortDate(d)}</span>
                        <span className={clsx('text-xs font-bold px-2.5 py-1 rounded-full', tone?.pill)}>{tone?.letter} {s.shiftType}</span>
                        <span className="text-xs text-[#64748B]">{s.startTime}–{s.endTime} · {shiftHours(s)} h{today && ' · today'}</span>
                        <button className="btn-secondary btn-sm text-xs ml-auto" onClick={() => { setSentMsg(''); setSwapFor(swapFor === s.id ? null : s.id) }}>
                          <Repeat size={12} /> {swapFor === s.id ? 'Close' : 'Swap'}
                        </button>
                      </div>
                      {swapFor === s.id && <SwapForm shift={s} onDone={sent} />}
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>
    </AppShell>
  )
}
