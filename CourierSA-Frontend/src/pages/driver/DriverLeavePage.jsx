import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import RosterSubNav from '@/components/roster/RosterSubNav'
import { Alert } from '@/components/ui'
import { shiftApi } from '@/api'
import { iso, unwrapObj, addDays } from '@/utils/roster'
import clsx from 'clsx'
import { Plane, ArrowRight } from 'lucide-react'

// Request Driver Leave (driver): one job, in three steps.
// 1. Choose type and dates, 2. check the request, 3. add a note and submit.
// The balance sits beside the form so you can see it while you choose.

const LEAVE_TYPES = ['Annual', 'Sick', 'Emergency']
const QUICK = [
  { label: '1 day', days: 1 },
  { label: '3 days', days: 3 },
  { label: '1 week', days: 7 },
]

const Step = ({ n, title, hint, children }) => (
  <section className="space-y-3">
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 w-5 h-5 shrink-0 rounded-full bg-[#0A3D91] text-white text-[11px] font-bold flex items-center justify-center">{n}</span>
      <div>
        <h2 className="text-sm font-bold text-[#0F172A]">{title}</h2>
        {hint && <p className="text-xs text-[#64748B]">{hint}</p>}
      </div>
    </div>
    {children}
  </section>
)

// Used / pending / remaining as one stacked bar per leave type.
function BalanceRow({ item, active }) {
  const cap = item.entitlement
  const pct = n => (cap ? Math.min(100, (n / cap) * 100) : 0)
  return (
    <div className={clsx('rounded-xl border px-3 py-2.5 space-y-1.5', active ? 'border-[#0A3D91] bg-[#F6FAFF]' : 'border-[#E2E8F0]')}>
      <div className="flex justify-between text-sm">
        <span className="font-semibold">{item.leaveType}</span>
        <span className="font-semibold">{item.remaining == null ? 'No cap' : `${item.remaining} of ${item.entitlement} days left`}</span>
      </div>
      {cap != null && (
        <div className="h-2 rounded-full bg-[#E2E8F0] overflow-hidden flex" aria-label={`${item.used} used, ${item.pending} pending`}>
          <div className="h-full bg-[#0A3D91]" style={{ width: `${pct(item.used)}%` }} />
          <div className="h-full bg-[#F59E0B]" style={{ width: `${pct(item.pending)}%` }} />
        </div>
      )}
      <p className="text-[11px] text-[#64748B]">{item.used} used{item.pending > 0 ? ` · ${item.pending} pending` : ''}</p>
    </div>
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

  // Live check: days requested, balance left, and clashes with published shifts
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
          <p className="page-subtitle">Pick your dates, check the request, and send it to the admin for approval.</p>
        </div>
      </div>

      <RosterSubNav role="driver" />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        <div className="card p-5 space-y-6 xl:col-span-2">
          <Step n={1} title="Choose type and dates">
            <div className="space-y-3">
              <div>
                <label className="label">Leave type</label>
                <div className="flex flex-wrap gap-2">
                  {LEAVE_TYPES.map(t => (
                    <button key={t} type="button" onClick={() => { setType(t); send.reset() }}
                      className={clsx('px-3.5 py-1.5 rounded-full text-sm font-semibold border',
                        type === t ? 'bg-[#0A3D91] text-white border-[#0A3D91]' : 'bg-white text-[#334155] border-[#CBD5E1]')}>{t}</button>
                  ))}
                </div>
              </div>
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
                {QUICK.map(q => (
                  <button key={q.label} type="button" className="btn-secondary btn-sm" onClick={() => { setEnd(addDays(start, q.days - 1)); send.reset() }}>{q.label}</button>
                ))}
              </div>
            </div>
          </Step>

          <div className="border-t border-[#E2E8F0] pt-5">
            <Step n={2} title="Check your request" hint="Updates as you change the dates.">
              {previewError && <Alert type="error" message={`Could not check your request: ${previewError.message}`} />}
              {!preview && !previewError && <p className="text-xs text-[#64748B]">Checking…</p>}
              {preview?.problem && <Alert type="error" message={preview.problem} />}
              {preview && !preview.problem && (
                <div className="space-y-2">
                  <Alert type="success" message={`${preview.daysRequested} day(s) requested · balance sufficient${preview.balanceRemaining == null ? ' (no cap for this type)' : ` · ${preview.balanceRemaining - preview.daysRequested} day(s) will remain`}`} />
                  {preview.publishedShiftClashes > 0
                    ? <Alert type="warning" message={`${preview.publishedShiftClashes} of your published shift(s) fall in these dates. If approved they will be reassigned to other drivers.`} />
                    : <Alert type="info" message="No clash with your published shifts." />}
                </div>
              )}
            </Step>
          </div>

          <div className="border-t border-[#E2E8F0] pt-5">
            <Step n={3} title="Add a note and submit">
              <textarea className="input" rows={3} placeholder="Notes for the admin (optional)" value={reason} onChange={e => setReason(e.target.value)} />
              {send.error && <Alert type="error" message={send.error.message} />}
              {send.isSuccess && (
                <Alert type="success" message="Leave request sent for approval. You can follow it under My requests." />
              )}
              <div className="flex flex-wrap items-center gap-3">
                <button className="btn-primary text-sm" disabled={send.isPending || blocked} onClick={() => send.mutate()}>
                  <Plane size={14} /> {send.isPending ? 'Sending…' : 'Submit leave request'}
                </button>
                <Link to="/driver/requests" className="inline-flex items-center gap-1 text-xs font-bold text-[#0A3D91]">My requests <ArrowRight size={12} /></Link>
              </div>
            </Step>
          </div>
        </div>

        <div className="space-y-5">
          <div className="card p-5 space-y-3">
            <h2 className="text-sm font-bold">Leave balance{balance?.year ? ` · ${balance.year}` : ''}</h2>
            {items.length === 0 && <p className="text-xs text-[#64748B]">Your balance will show here.</p>}
            {items.map(i => <BalanceRow key={i.leaveType} item={i} active={i.leaveType === type} />)}
            <div className="flex gap-3 text-[11px] text-[#64748B]">
              <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#0A3D91]" /> Used</span>
              <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-[#F59E0B]" /> Pending</span>
            </div>
          </div>

          <div className="card p-5 space-y-2">
            <h2 className="text-sm font-bold">What happens next</h2>
            <ol className="text-xs text-[#475569] space-y-1.5 list-decimal list-inside">
              <li>The admin sees your request and its effect on depot cover.</li>
              <li>If approved, your shifts in those dates go to other drivers.</li>
              <li>You can cancel a pending request under My requests.</li>
            </ol>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
