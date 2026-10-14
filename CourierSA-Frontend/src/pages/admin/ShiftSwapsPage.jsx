import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import RosterSubNav from '@/components/roster/RosterSubNav'
import { EmptyState, PageLoader, Alert, StatCard } from '@/components/ui'
import { shiftApi } from '@/api'
import { unwrap, dayKey, daysFromToday, relativeDay, SHIFT_TONE } from '@/utils/roster'
import { formatDate } from '@/utils'
import clsx from 'clsx'
import { ArrowRight, Repeat, Clock, Check } from 'lucide-react'

// Approve Shift Swaps (admin). A swap only reaches this page once the other driver has accepted,
// so the admin makes the final decision on one clear card per swap.

const FILTERS = ['All', 'Morning', 'Afternoon']

// Three-step progress: requested, colleague accepted, admin decision (this is the open step).
function Progress() {
  const steps = [
    { label: 'Requested', done: true },
    { label: 'Colleague accepted', done: true },
    { label: 'Your decision', done: false },
  ]
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold">
      {steps.map((s, i) => (
        <li key={s.label} className="flex items-center gap-2">
          <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full',
            s.done ? 'bg-[#F0FDF4] text-[#166534]' : 'bg-[#FFFBEB] text-[#92400E] ring-1 ring-[#F59E0B]')}>
            {s.done && <Check size={11} />}{s.label}
          </span>
          {i < steps.length - 1 && <ArrowRight size={11} className="text-[#94A3B8]" />}
        </li>
      ))}
    </ol>
  )
}

function SwapCard({ r, onDone }) {
  const qc = useQueryClient()
  const [notes, setNotes] = useState('')
  const review = useMutation({
    mutationFn: approve => shiftApi.reviewSwap(r.id, { approve, notes }),
    onSuccess: (_res, approve) => {
      ;['pending-swaps', 'roster'].forEach(k => qc.invalidateQueries({ queryKey: [k] }))
      onDone(approve ? `Swap approved. ${r.peerName} now works the ${r.shiftType.toLowerCase()} shift on ${formatDate(r.date)}.` : 'Swap rejected. The original shift stays as rostered.')
    },
  })
  const tone = SHIFT_TONE[r.shiftType]
  const when = dayKey(r.date)

  return (
    <div className="card p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-bold text-sm">{formatDate(r.date)}</p>
          <p className="text-xs text-[#64748B]">{relativeDay(when)}</p>
        </div>
        <span className={clsx('text-xs font-bold px-2.5 py-1 rounded-full', tone?.pill ?? 'bg-[#F1F5F9] text-[#475569]')}>{tone?.letter} {r.shiftType}</span>
      </div>

      {/* Who gives the shift to whom */}
      <div className="flex items-center gap-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm">
        <div className="min-w-0"><p className="text-[11px] uppercase font-bold text-[#64748B]">Currently</p><p className="font-semibold truncate">{r.requesterName}</p></div>
        <ArrowRight size={16} className="text-[#64748B] shrink-0" />
        <div className="min-w-0"><p className="text-[11px] uppercase font-bold text-[#64748B]">Taking over</p><p className="font-semibold truncate">{r.peerName}</p></div>
      </div>
      {r.reason && <p className="text-sm text-[#334155]">“{r.reason}”</p>}

      <Progress />

      {review.error && <Alert type="error" message={review.error.message} />}
      <div className="space-y-2 border-t border-[#E2E8F0] pt-4">
        <textarea className="input" rows={2} placeholder="Notes (required if rejecting)" value={notes} onChange={e => setNotes(e.target.value)} />
        <div className="flex gap-2">
          <button className="btn-primary text-sm" disabled={review.isPending} onClick={() => review.mutate(true)}>Approve swap</button>
          <button className="btn-danger text-sm" disabled={review.isPending || !notes.trim()} onClick={() => review.mutate(false)}>Reject</button>
        </div>
      </div>
    </div>
  )
}

export default function ShiftSwapsPage() {
  const [filter, setFilter] = useState('All')
  const [flash, setFlash] = useState('')
  const swaps = useQuery({ queryKey: ['pending-swaps'], queryFn: () => shiftApi.pendingSwaps(), refetchInterval: 30000 })
  const all = unwrap(swaps.data)
  const visible = all
    .filter(s => filter === 'All' || s.shiftType === filter)
    .sort((a, b) => dayKey(a.date).localeCompare(dayKey(b.date)))
  const soon = all.filter(s => daysFromToday(dayKey(s.date)) <= 2).length

  return (
    <AppShell title="Shift Swaps">
      <div className="page-header">
        <div>
          <h1 className="page-title">Shift Swaps</h1>
          <p className="page-subtitle">Swaps appear here once the other driver has accepted. Approve to move the shift across.</p>
        </div>
      </div>

      <RosterSubNav role="admin" />

      {flash && <div className="mb-5"><Alert type="success" message={flash} /></div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <StatCard label="Swaps waiting" value={all.length} icon={Repeat} color="bg-[#0A3D91]" sub="Accepted by the colleague" />
        <StatCard label="Within 2 days" value={soon} icon={Clock} color={soon ? 'bg-[#F59E0B]' : 'bg-[#64748B]'} sub="Decide these first" />
      </div>

      {swaps.isLoading ? <PageLoader /> : swaps.error ? (
        <Alert type="error" message={`Could not load swaps: ${swaps.error.message}`} />
      ) : all.length === 0 ? (
        <EmptyState icon={Repeat} title="No swaps waiting" description="Swaps appear here once the other driver has accepted." />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={clsx('px-3 py-1 rounded-full text-xs font-semibold border',
                  filter === f ? 'bg-[#0A3D91] text-white border-[#0A3D91]' : 'bg-white text-[#334155] border-[#CBD5E1]')}>{f === 'All' ? 'All shifts' : f}</button>
            ))}
          </div>
          {visible.length === 0
            ? <p className="text-sm text-[#64748B]">No {filter.toLowerCase()} swaps waiting.</p>
            : <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">{visible.map(r => <SwapCard key={r.id} r={r} onDone={setFlash} />)}</div>}
        </div>
      )}
    </AppShell>
  )
}
