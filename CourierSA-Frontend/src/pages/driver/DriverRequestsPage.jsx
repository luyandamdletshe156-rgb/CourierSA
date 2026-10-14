import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import RosterSubNav from '@/components/roster/RosterSubNav'
import { EmptyState, PageLoader, Alert, StatCard } from '@/components/ui'
import { shiftApi } from '@/api'
import { unwrap, dayKey, inclusiveDays } from '@/utils/roster'
import { formatDate } from '@/utils'
import clsx from 'clsx'
import { Hourglass, CheckCircle2, XCircle, Inbox, ArrowRight } from 'lucide-react'

// My Requests (driver): follow your leave and swap requests, and answer swaps colleagues sent you.
// Tabs keep the three jobs apart: reply, leave, swaps.

const STATUS_TONE = {
  Pending: 'bg-[#FFFBEB] text-[#92400E]',
  Approved: 'bg-[#F0FDF4] text-[#166534]',
  Rejected: 'bg-[#FEF2F2] text-[#B91C1C]',
}
const STATUS_FILTERS = ['All', 'Pending', 'Approved', 'Rejected']

function StatusPill({ status }) {
  return (
    <span className={clsx('text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap', STATUS_TONE[status] ?? 'bg-[#F1F5F9] text-[#475569]')}>{status}</span>
  )
}

function Filters({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {STATUS_FILTERS.map(f => (
        <button key={f} onClick={() => onChange(f)}
          className={clsx('px-3 py-1 rounded-full text-xs font-semibold border',
            value === f ? 'bg-[#0A3D91] text-white border-[#0A3D91]' : 'bg-white text-[#334155] border-[#CBD5E1]')}>{f}</button>
      ))}
    </div>
  )
}

export default function DriverRequestsPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState(null)
  const [status, setStatus] = useState('All')

  const leaveQ = useQuery({ queryKey: ['my-leave'], queryFn: () => shiftApi.myLeave() })
  const swapQ = useQuery({ queryKey: ['my-swaps'], queryFn: () => shiftApi.mySwaps() })
  const leave = unwrap(leaveQ.data), swaps = unwrap(swapQ.data)
  const needReply = swaps.filter(w => w.awaitingMyReply)
  const otherSwaps = swaps.filter(w => !w.awaitingMyReply)

  const refresh = () => ['my-shifts', 'my-leave', 'my-swaps', 'leave-balance', 'leave-preview'].forEach(k => qc.invalidateQueries({ queryKey: [k] }))
  const cancel = useMutation({ mutationFn: id => shiftApi.cancelLeave(id), onSuccess: refresh })
  const respond = useMutation({ mutationFn: ({ id, accept }) => shiftApi.respondSwap(id, accept), onSuccess: refresh })

  const active = tab ?? (needReply.length > 0 ? 'reply' : 'leave')
  const all = [...leave, ...otherSwaps]
  const count = s => all.filter(r => r.status === s).length
  const match = r => status === 'All' || r.status === status

  const TABS = [
    { key: 'reply', label: 'Waiting for my reply', n: needReply.length },
    { key: 'leave', label: 'Leave', n: leave.length },
    { key: 'swaps', label: 'Shift swaps', n: otherSwaps.length },
  ]
  const loading = leaveQ.isLoading || swapQ.isLoading

  return (
    <AppShell title="My Requests">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Requests</h1>
          <p className="page-subtitle">Follow your leave and shift swap requests, and reply to swaps your colleagues have offered you.</p>
        </div>
      </div>

      <RosterSubNav role="driver" />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Pending" value={count('Pending')} icon={Hourglass} color="bg-[#F59E0B]" sub="With the admin or colleague" />
        <StatCard label="Approved" value={count('Approved')} icon={CheckCircle2} color="bg-[#16A34A]" sub="Leave and swaps" />
        <StatCard label="Rejected" value={count('Rejected')} icon={XCircle} color="bg-[#DC2626]" sub="See the admin's note" />
      </div>

      <div role="tablist" className="flex flex-wrap gap-2 mb-5">
        {TABS.map(t => (
          <button key={t.key} role="tab" aria-selected={active === t.key} onClick={() => { setTab(t.key); setStatus('All') }}
            className={clsx('inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-semibold border',
              active === t.key ? 'bg-[#0A3D91] text-white border-[#0A3D91]' : 'bg-white text-[#334155] border-[#CBD5E1]')}>
            {t.label}
            {t.n > 0 && <span className={clsx('text-[11px] font-bold px-1.5 py-0.5 rounded-full', t.key === 'reply' ? 'bg-[#F59E0B] text-white' : 'bg-[#E2E8F0] text-[#334155]')}>{t.n}</span>}
          </button>
        ))}
      </div>

      {loading ? <PageLoader /> : (
        <>
          {active === 'reply' && (
            needReply.length === 0
              ? <EmptyState icon={Inbox} title="Nothing waiting for you" description="When a colleague offers you a shift, it appears here." />
              : (
                <div className="space-y-3 max-w-3xl">
                  {respond.error && <Alert type="error" message={respond.error.message} />}
                  {needReply.map(w => (
                    <div key={w.id} className="card p-4 flex flex-wrap items-center justify-between gap-3 border-amber-200">
                      <div>
                        <p className="text-sm font-semibold">{w.requesterName} asks you to take the {w.shiftType.toLowerCase()} shift</p>
                        <p className="text-xs text-[#64748B]">{formatDate(w.date)}</p>
                        {w.reason && <p className="text-xs text-[#334155] mt-1">“{w.reason}”</p>}
                        <p className="text-[11px] text-[#64748B] mt-1">If you accept, an admin still has to approve it.</p>
                      </div>
                      <div className="flex gap-2">
                        <button className="btn-primary btn-sm text-xs" disabled={respond.isPending} onClick={() => respond.mutate({ id: w.id, accept: true })}>Accept</button>
                        <button className="btn-secondary btn-sm text-xs" disabled={respond.isPending} onClick={() => respond.mutate({ id: w.id, accept: false })}>Decline</button>
                      </div>
                    </div>
                  ))}
                </div>
              )
          )}

          {active === 'leave' && (
            <div className="space-y-3 max-w-3xl">
              <Filters value={status} onChange={setStatus} />
              {cancel.error && <Alert type="error" message={cancel.error.message} />}
              {leave.length === 0 && <EmptyState icon={Inbox} title="No leave requests yet" description="Use Request leave to send your first one." />}
              {leave.filter(match).map(l => {
                const days = inclusiveDays(l.startDate, l.endDate)
                return (
                  <div key={l.id} className="card p-4 space-y-1.5">
                    <div className="flex justify-between gap-2">
                      <span className="text-sm font-bold">{l.leaveType} leave</span>
                      <StatusPill status={l.status} />
                    </div>
                    <p className="text-xs text-[#64748B]">{formatDate(l.startDate)} – {formatDate(l.endDate)} · {days} day{days === 1 ? '' : 's'}</p>
                    {l.adminNotes && <p className="text-xs bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-2.5 py-1.5"><b>Admin:</b> {l.adminNotes}</p>}
                    {l.status === 'Pending' && (
                      <button className="text-xs font-semibold text-[#B91C1C]" disabled={cancel.isPending} onClick={() => cancel.mutate(l.id)}>Cancel request</button>
                    )}
                  </div>
                )
              })}
              {leave.length > 0 && leave.filter(match).length === 0 && <p className="text-xs text-[#64748B]">No {status.toLowerCase()} leave requests.</p>}
            </div>
          )}

          {active === 'swaps' && (
            <div className="space-y-3 max-w-3xl">
              <Filters value={status} onChange={setStatus} />
              {otherSwaps.length === 0 && <EmptyState icon={Inbox} title="No shift swaps yet" description="Offer a shift from My schedule and it will be tracked here." />}
              {otherSwaps.filter(match).map(w => (
                <div key={w.id} className="card p-4 space-y-1.5">
                  <div className="flex justify-between gap-2">
                    <span className="text-sm font-bold">{w.shiftType} shift · {formatDate(dayKey(w.date))}</span>
                    <StatusPill status={w.status} />
                  </div>
                  <p className="text-xs text-[#64748B] flex items-center gap-1.5">{w.requesterName} <ArrowRight size={11} /> {w.peerName}</p>
                  {w.adminNotes && <p className="text-xs bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-2.5 py-1.5"><b>Admin:</b> {w.adminNotes}</p>}
                </div>
              ))}
              {otherSwaps.length > 0 && otherSwaps.filter(match).length === 0 && <p className="text-xs text-[#64748B]">No {status.toLowerCase()} swaps.</p>}
            </div>
          )}
        </>
      )}
    </AppShell>
  )
}
