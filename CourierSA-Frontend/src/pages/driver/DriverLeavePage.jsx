import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { Alert } from '@/components/ui'
import { shiftApi } from '@/api'
import { iso, unwrapObj, addDays } from '@/utils/roster'
import clsx from 'clsx'
import { Plane, ArrowRight } from 'lucide-react'

// Request Leave (driver): the balance tiles are also the type picker, so you see
// what is left while you choose. Dates, a live check, a note, send.

const LEAVE_TYPES = ['Annual', 'Sick', 'Emergency']
const QUICK = [{ label: '1 day', days: 1 }, { label: '3 days', days: 3 }, { label: '1 week', days: 7 }]

function TypeTile({ type, item, active, onPick }) {
  const cap = item?.entitlement
  const pct = n => (cap ? Math.min(100, (n / cap) * 100) : 0)
  return (
    <button type="button" onClick={onPick} aria-pressed={active}
      className={clsx('card p-4 text-left space-y-2 transition', active ? 'ring-2 ring-[#0A3D91] bg-[#F6FAFF]' : 'hover:border-[#1E63E9]')}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-bold">{type}</span>
        <span className="text-xs font-semibold text-[#475569]">{!item ? '' : item.remaining == null ? 'No cap' : `${item.remaining} of ${item.entitlement} left`}</span>
      </div>
      {cap != null && (
        <div className="h-2 rounded-full bg-[#E2E8F0] overflow-hidden flex" aria-label={`${item.used} used, ${item.pending} pending`}>
          <div className="h-full bg-[#0A3D91]" style={{ width: `${pct(item.used)}%` }} />
          <div className="h-full bg-[#F59E0B]" style={{ width: `${pct(item.pending)}%` }} />
        </div>
      )}
      {item && <p className="text-[11px] text-[#64748B]">{item.used} used{item.pending > 0 ? `, ${item.pending} pending` : ''}</p>}
    </button>
  )
}

export default function DriverLeavePage() {
  const qc = useQueryClient()
  const today = iso(new Date())
  const [type, setType] = useState('Annual')
  const [start, setStart] = useState(today)
  const [end, setEnd] = useState(today)
  const [reason, setReason] = useState('')

  const { data: balanceRes } = useQuery({ queryKey: ['leave-balance'], queryFn: () => shiftApi.leaveBalance() })
  const balance = unwrapObj(balanceRes)
  const items = balance?.items ?? []

  const { data: previewRes, error: previewError } = useQuery({
    queryKey: ['leave-preview', type, start, end],
    queryFn: () => shiftApi.previewLeave({ leaveType: type, startDate: start, endDate: end }),
    enabled: !!start && !!end,
  })
  const preview = unwrapObj(previewRes)

  const send = useMutation({
    mutationFn: () => shiftApi.requestLeave({ leaveType: type, startDate: start, endDate: end, reason }),
    onSuccess: () => {
      setReason('')
      ;['my-leave', 'my-shifts', 'leave-balance', 'leave-preview'].forEach(k => qc.invalidateQueries({ queryKey: [k] }))
    },
  })
  const blocked = !!preview && !preview.canSubmit

  return (
    <AppShell title="Request Leave">
      <div className="page-header">
        <div>
          <h1 className="page-title">Request Leave</h1>
          <p className="page-subtitle">Choose a type and your dates. The admin approves it.{balance?.year ? ` Balances are for ${balance.year}.` : ''}</p>
        </div>
      </div>

      <div className="max-w-3xl space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {LEAVE_TYPES.map(t => (
            <TypeTile key={t} type={t} item={items.find(i => i.leaveType === t)} active={type === t} onPick={() => { setType(t); send.reset() }} />
          ))}
        </div>

        <div className="card p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">From</label>
              <input type="date" className="input" min={today} value={start}
                onChange={e => { setStart(e.target.value); if (e.target.value > end) setEnd(e.target.value); send.reset() }} />
            </div>
            <div>
              <label className="label">To</label>
              <input type="date" className="input" min={start} value={end} onChange={e => { setEnd(e.target.value); send.reset() }} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-[#64748B]">Quick length:</span>
            {QUICK.map(q => <button key={q.label} type="button" className="btn-secondary btn-sm" onClick={() => { setEnd(addDays(start, q.days - 1)); send.reset() }}>{q.label}</button>)}
          </div>

          <div className="space-y-2">
            {previewError && <Alert type="error" message={`Could not check your request: ${previewError.message}`} />}
            {!preview && !previewError && <p className="text-xs text-[#64748B]">Checking…</p>}
            {preview?.problem && <Alert type="error" message={preview.problem} />}
            {preview && !preview.problem && (
              <>
                <Alert type="success" message={`${preview.daysRequested} day(s) requested${preview.balanceRemaining == null ? ', no cap for this type' : `, ${preview.balanceRemaining - preview.daysRequested} day(s) will remain`}`} />
                {preview.publishedShiftClashes > 0
                  ? <Alert type="warning" message={`${preview.publishedShiftClashes} of your published shift(s) fall in these dates. If approved they will go to other drivers.`} />
                  : <Alert type="info" message="No clash with your published shifts." />}
              </>
            )}
          </div>

          <textarea className="input" rows={3} placeholder="Note for the admin (optional)" value={reason} onChange={e => setReason(e.target.value)} />
          {send.error && <Alert type="error" message={send.error.message} />}
          {send.isSuccess && <Alert type="success" message="Leave request sent for approval." />}
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-primary text-sm" disabled={send.isPending || blocked} onClick={() => send.mutate()}>
              <Plane size={14} /> {send.isPending ? 'Sending…' : 'Send leave request'}
            </button>
            <Link to="/driver/requests" className="inline-flex items-center gap-1 text-xs font-bold text-[#0A3D91]">Track it in My Requests <ArrowRight size={12} /></Link>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
