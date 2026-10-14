import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import SummaryLine from '@/components/roster/SummaryLine'
import { EmptyState, PageLoader, Alert } from '@/components/ui'
import { shiftApi } from '@/api'
import { unwrap, dayKey, inclusiveDays } from '@/utils/roster'
import { formatDate } from '@/utils'
import clsx from 'clsx'
import { Inbox, ArrowRight } from 'lucide-react'

// My Requests (driver): one page, no tabs. Anything waiting for your reply comes first,
// then every leave and swap request in one list, newest first.

const STATUS_TONE = {
  Pending: 'bg-[#FFFBEB] text-[#92400E]',
  Approved: 'bg-[#F0FDF4] text-[#166534]',
  Rejected: 'bg-[#FEF2F2] text-[#B91C1C]',
}
const STATUS_FILTERS = ['All', 'Pending', 'Approved', 'Rejected']

export default function DriverRequestsPage() {
  const qc = useQueryClient()
  const [status, setStatus] = useState('All')

  const leaveQ = useQuery({ queryKey: ['my-leave'], queryFn: () => shiftApi.myLeave() })
  const swapQ = useQuery({ queryKey: ['my-swaps'], queryFn: () => shiftApi.mySwaps() })
  const swaps = unwrap(swapQ.data)
  const needReply = swaps.filter(w => w.awaitingMyReply)

  const refresh = () => ['my-shifts', 'my-leave', 'my-swaps', 'leave-balance', 'leave-preview'].forEach(k => qc.invalidateQueries({ queryKey: [k] }))
  const cancel = useMutation({ mutationFn: id => shiftApi.cancelLeave(id), onSuccess: refresh })
  const respond = useMutation({ mutationFn: ({ id, accept }) => shiftApi.respondSwap(id, accept), onSuccess: refresh })

  const all = [
    ...unwrap(leaveQ.data).map(r => ({ ...r, kind: 'leave', when: dayKey(r.startDate) })),
    ...swaps.filter(w => !w.awaitingMyReply).map(r => ({ ...r, kind: 'swap', when: dayKey(r.date) })),
  ].sort((a, b) => b.when.localeCompare(a.when))
  const visible = all.filter(r => status === 'All' || r.status === status)
  const count = s => all.filter(r => r.status === s).length

  return (
    <AppShell title="My Requests">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Requests</h1>
          <p className="page-subtitle">Your leave and shift swap requests, and swaps colleagues have offered you.</p>
        </div>
      </div>

      <SummaryLine items={[
        { value: count('Pending'), label: 'pending', tone: count('Pending') ? 'warn' : undefined },
        { value: count('Approved'), label: 'approved', tone: 'good' },
        { value: count('Rejected'), label: 'rejected', tone: count('Rejected') ? 'bad' : undefined },
      ]} />

      {leaveQ.isLoading || swapQ.isLoading ? <PageLoader /> : (
        <div className="max-w-3xl space-y-6">
          {needReply.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-bold text-[#0F172A]">Waiting for your reply</h2>
              {respond.error && <Alert type="error" message={respond.error.message} />}
              {needReply.map(w => (
                <div key={w.id} className="card p-4 flex flex-wrap items-center justify-between gap-3 border-amber-200 bg-amber-50/40">
                  <div>
                    <p className="text-sm font-semibold">{w.requesterName} asks you to take the {w.shiftType.toLowerCase()} shift on {formatDate(w.date)}</p>
                    {w.reason && <p className="text-xs text-[#334155] mt-1">“{w.reason}”</p>}
                    <p className="text-[11px] text-[#64748B] mt-1">If you accept, an admin still has to approve it.</p>
                  </div>
                  <div className="flex gap-2">
                    <button className="btn-primary btn-sm text-xs" disabled={respond.isPending} onClick={() => respond.mutate({ id: w.id, accept: true })}>Accept</button>
                    <button className="btn-secondary btn-sm text-xs" disabled={respond.isPending} onClick={() => respond.mutate({ id: w.id, accept: false })}>Decline</button>
                  </div>
                </div>
              ))}
            </section>
          )}

          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-[#0F172A]">All requests</h2>
              <div className="flex flex-wrap gap-1.5">
                {STATUS_FILTERS.map(f => (
                  <button key={f} onClick={() => setStatus(f)}
                    className={clsx('px-3 py-1 rounded-full text-xs font-semibold border', status === f ? 'bg-[#0A3D91] text-white border-[#0A3D91]' : 'bg-white text-[#334155] border-[#CBD5E1]')}>{f}</button>
                ))}
              </div>
            </div>
            {cancel.error && <Alert type="error" message={cancel.error.message} />}
            {all.length === 0 && needReply.length === 0
              ? <EmptyState icon={Inbox} title="No requests yet" description="Request leave, or offer a shift from My Schedule, and it is tracked here." />
              : visible.length === 0
                ? <p className="text-xs text-[#64748B]">No {status.toLowerCase()} requests.</p>
                : (
                  <ul className="card p-0 divide-y divide-[#E2E8F0]">
                    {visible.map(r => (
                      <li key={`${r.kind}-${r.id}`} className="px-4 py-3 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-bold">
                            {r.kind === 'leave' ? `${r.leaveType} leave` : `${r.shiftType} shift swap`}
                            <span className="ml-2 font-normal text-xs text-[#64748B]">
                              {r.kind === 'leave'
                                ? `${formatDate(r.startDate)} – ${formatDate(r.endDate)} · ${inclusiveDays(r.startDate, r.endDate)} day${inclusiveDays(r.startDate, r.endDate) === 1 ? '' : 's'}`
                                : formatDate(r.date)}
                            </span>
                          </p>
                          <span className={clsx('text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap', STATUS_TONE[r.status] ?? 'bg-[#F1F5F9] text-[#475569]')}>{r.status}</span>
                        </div>
                        {r.kind === 'swap' && <p className="text-xs text-[#64748B] flex items-center gap-1.5">{r.requesterName} <ArrowRight size={11} /> {r.peerName}</p>}
                        {r.adminNotes && <p className="text-xs bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-2.5 py-1.5"><b>Admin:</b> {r.adminNotes}</p>}
                        {r.kind === 'leave' && r.status === 'Pending' && (
                          <button className="text-xs font-semibold text-[#B91C1C]" disabled={cancel.isPending} onClick={() => cancel.mutate(r.id)}>Cancel request</button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
          </section>
        </div>
      )}
    </AppShell>
  )
}
