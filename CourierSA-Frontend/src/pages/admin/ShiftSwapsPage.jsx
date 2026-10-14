import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import SummaryLine from '@/components/roster/SummaryLine'
import { EmptyState, PageLoader, Alert } from '@/components/ui'
import { shiftApi } from '@/api'
import { unwrap, dayKey, daysFromToday, relativeDay, SHIFT_TONE } from '@/utils/roster'
import { formatDate } from '@/utils'
import clsx from 'clsx'
import { ArrowRight, Repeat } from 'lucide-react'

// Shift Swaps (admin): a swap only appears once the other driver has accepted,
// so each row is just the final yes or no.

const FILTERS = ['All', 'Morning', 'Afternoon']

function SwapRow({ r, onDone }) {
  const qc = useQueryClient()
  const [rejecting, setRejecting] = useState(false)
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
    <li className="px-4 py-3.5 space-y-2.5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="w-28">
          <p className="text-sm font-bold">{formatDate(r.date)}</p>
          <p className="text-xs text-[#64748B]">{relativeDay(when)}</p>
        </div>
        <span className={clsx('text-xs font-bold px-2.5 py-1 rounded-full', tone?.pill ?? 'bg-[#F1F5F9] text-[#475569]')}>{tone?.letter} {r.shiftType}</span>
        <p className="flex items-center gap-2 text-sm min-w-0">
          <b className="truncate">{r.requesterName}</b><ArrowRight size={14} className="text-[#64748B] shrink-0" /><b className="truncate">{r.peerName}</b>
        </p>
        {!rejecting && (
          <div className="ml-auto flex gap-2">
            <button className="btn-primary btn-sm text-xs" disabled={review.isPending} onClick={() => review.mutate(true)}>Approve</button>
            <button className="btn-secondary btn-sm text-xs" disabled={review.isPending} onClick={() => setRejecting(true)}>Reject</button>
          </div>
        )}
      </div>
      {r.reason && <p className="text-xs text-[#475569]">“{r.reason}”</p>}
      {review.error && <Alert type="error" message={review.error.message} />}
      {rejecting && (
        <div className="flex flex-wrap gap-2">
          <input className="input flex-1 min-w-[220px]" placeholder="Why are you rejecting this swap?" value={notes} onChange={e => setNotes(e.target.value)} autoFocus />
          <button className="btn-danger btn-sm text-xs" disabled={review.isPending || !notes.trim()} onClick={() => review.mutate(false)}>Confirm rejection</button>
          <button className="btn-ghost btn-sm text-xs" onClick={() => { setRejecting(false); setNotes('') }}>Back</button>
        </div>
      )}
    </li>
  )
}

export default function ShiftSwapsPage() {
  const [filter, setFilter] = useState('All')
  const [flash, setFlash] = useState('')
  const swaps = useQuery({ queryKey: ['pending-swaps'], queryFn: () => shiftApi.pendingSwaps(), refetchInterval: 30000 })
  const all = unwrap(swaps.data)
  const visible = all.filter(s => filter === 'All' || s.shiftType === filter).sort((a, b) => dayKey(a.date).localeCompare(dayKey(b.date)))
  const soon = all.filter(s => daysFromToday(dayKey(s.date)) <= 2).length

  return (
    <AppShell title="Shift Swaps">
      <div className="page-header">
        <div>
          <h1 className="page-title">Shift Swaps</h1>
          <p className="page-subtitle">The other driver has already agreed. Approve to move the shift across.</p>
        </div>
      </div>

      <SummaryLine items={[{ value: all.length, label: 'waiting' }, { value: soon, label: 'within 2 days', tone: soon ? 'warn' : undefined }]} />
      {flash && <div className="mb-4"><Alert type="success" message={flash} /></div>}

      {swaps.isLoading ? <PageLoader /> : swaps.error ? (
        <Alert type="error" message={`Could not load swaps: ${swaps.error.message}`} />
      ) : all.length === 0 ? (
        <EmptyState icon={Repeat} title="No swaps waiting" description="Swaps appear here once the other driver has accepted." />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={clsx('px-3 py-1 rounded-full text-xs font-semibold border', filter === f ? 'bg-[#0A3D91] text-white border-[#0A3D91]' : 'bg-white text-[#334155] border-[#CBD5E1]')}>{f === 'All' ? 'All shifts' : f}</button>
            ))}
          </div>
          {visible.length === 0
            ? <p className="text-sm text-[#64748B]">No {filter.toLowerCase()} swaps waiting.</p>
            : <ul className="card p-0 divide-y divide-[#E2E8F0]">{visible.map(r => <SwapRow key={r.id} r={r} onDone={setFlash} />)}</ul>}
        </div>
      )}
    </AppShell>
  )
}
