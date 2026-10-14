import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import SummaryLine from '@/components/roster/SummaryLine'
import { EmptyState, PageLoader, Alert } from '@/components/ui'
import { shiftApi } from '@/api'
import { unwrap, dayKey, daysFromToday } from '@/utils/roster'
import { formatDate } from '@/utils'
import clsx from 'clsx'
import { Repeat, ArrowRight, X } from 'lucide-react'

function SwapCard({ r, onDone }) {
  const qc = useQueryClient()
  const [rejecting, setRejecting] = useState(false)
  const [notes, setNotes] = useState('')

  const review = useMutation({
    mutationFn: approve => shiftApi.reviewSwap(r.id, { approve, notes }),
    onSuccess: (_res, approve) => {
      ;['pending-swaps', 'roster'].forEach(k => qc.invalidateQueries({ queryKey: [k] }))
      onDone(approve ? `Swap approved. ${r.peerName} now works this shift.` : 'Swap rejected. Original shift remains.')
    },
  })

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
      <div className="p-5 border-b border-slate-100 flex justify-between items-start bg-slate-50">
        <div>
          <p className="font-bold text-slate-900 text-lg">{formatDate(r.date)}</p>
          <span className={clsx("inline-block mt-2 px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase", 
            r.shiftType === 'Morning' ? "bg-amber-100 text-amber-800" : "bg-indigo-100 text-indigo-800")}>
            {r.shiftType} Shift
          </span>
        </div>
        {daysFromToday(dayKey(r.date)) <= 2 && <span className="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-1 rounded uppercase tracking-wide">Happening Soon</span>}
      </div>

      <div className="p-5 flex-1">
        <div className="flex items-center justify-between mb-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
          <div className="text-center w-2/5">
            <p className="text-xs text-slate-500 uppercase tracking-wider font-bold mb-1">Rostered</p>
            <p className="font-bold text-slate-800 truncate">{r.requesterName}</p>
          </div>
          <div className="w-1/5 flex justify-center text-slate-400">
             <ArrowRight size={20} />
          </div>
          <div className="text-center w-2/5">
            <p className="text-xs text-slate-500 uppercase tracking-wider font-bold mb-1">Taking Over</p>
            <p className="font-bold text-blue-700 truncate">{r.peerName}</p>
          </div>
        </div>
        {r.reason && <p className="text-sm text-slate-600 italic">"{r.reason}"</p>}
        {review.error && <div className="mt-3"><Alert type="error" message={review.error.message} /></div>}
      </div>

      <div className="p-4 border-t border-slate-100 bg-slate-50 mt-auto relative overflow-hidden h-[72px]">
        {/* Main Action Buttons */}
        <div className={clsx("absolute inset-0 p-4 flex gap-3 transition-transform duration-300", rejecting ? "-translate-y-full" : "translate-y-0")}>
          <button className="btn-secondary flex-1 bg-white hover:bg-red-50 text-red-600 border-red-200" onClick={() => setRejecting(true)}>Reject</button>
          <button className="btn-primary flex-1 bg-green-600 hover:bg-green-700 border-none" disabled={review.isPending} onClick={() => review.mutate(true)}>Approve Swap</button>
        </div>

        {/* Reject Sliding Form */}
        <div className={clsx("absolute inset-0 p-3 flex gap-2 items-center bg-red-50 transition-transform duration-300", rejecting ? "translate-y-0" : "translate-y-full")}>
           <input className="input flex-1 py-2 text-sm border-red-200 focus:ring-red-500" placeholder="Reason for rejecting..." value={notes} onChange={e => setNotes(e.target.value)} autoFocus={rejecting} />
           <button className="btn-primary py-2 px-4 bg-red-600 hover:bg-red-700 border-none text-sm" disabled={review.isPending || !notes.trim()} onClick={() => review.mutate(false)}>Confirm</button>
           <button className="p-2 text-slate-500 hover:bg-red-100 rounded-lg" onClick={() => { setRejecting(false); setNotes('') }}><X size={20} /></button>
        </div>
      </div>
    </div>
  )
}

export default function ShiftSwapsPage() {
  const [flash, setFlash] = useState('')
  const swaps = useQuery({ queryKey: ['pending-swaps'], queryFn: () => shiftApi.pendingSwaps(), refetchInterval: 30000 })
  const all = unwrap(swaps.data) ?? []
  
  const sorted = [...all].sort((a, b) => dayKey(a.date).localeCompare(dayKey(b.date)))
  const soon = all.filter(s => daysFromToday(dayKey(s.date)) <= 2).length

  return (
    <AppShell title="Shift Swaps">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Shift Swaps</h1>
        <p className="text-slate-500 mt-2 text-lg">Approve shift trades between drivers. Both drivers have already agreed.</p>
      </div>

      <SummaryLine items={[
        { value: all.length, label: 'Pending Swaps' }, 
        { value: soon, label: 'Within 48 Hours', tone: soon ? 'warn' : undefined }
      ]} />
      
      {flash && <div className="mb-6"><Alert type="success" message={flash} /></div>}

      {swaps.isLoading ? <PageLoader /> : swaps.error ? (
        <Alert type="error" message={swaps.error.message} />
      ) : all.length === 0 ? (
        <EmptyState icon={Repeat} title="No swaps waiting" description="When drivers agree to trade a shift, it will appear here for final approval." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-in fade-in">
           {sorted.map(r => <SwapCard key={r.id} r={r} onDone={setFlash} />)}
        </div>
      )}
    </AppShell>
  )
}