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

  // Separate and sort the data
  const leaveRequests = unwrap(leaveQ.data).sort((a, b) => dayKey(b.startDate).localeCompare(dayKey(a.startDate)))
  const swapRequests = swaps.filter(w => !w.awaitingMyReply).sort((a, b) => dayKey(b.date).localeCompare(dayKey(a.date)))

  // Apply the selected status filter
  const visibleLeave = leaveRequests.filter(r => status === 'All' || r.status === status)
  const visibleSwaps = swapRequests.filter(r => status === 'All' || r.status === status)

  // Count totals for the summary line across both types of requests
  const count = s => leaveRequests.filter(r => r.status === s).length + swapRequests.filter(r => r.status === s).length

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
        <div className="max-w-3xl space-y-8">
          
          {needReply.length > 0 && (
            <section className="space-y-3">
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

          {leaveRequests.length === 0 && swapRequests.length === 0 && needReply.length === 0 ? (
            <EmptyState icon={Inbox} title="No requests yet" description="Request leave, or offer a shift from My Schedule, and it is tracked here." />
          ) : (
            <>
              {/* Filter Tabs */}
              <div className="flex flex-wrap gap-1.5 border-b border-[#E2E8F0] pb-4">
                {STATUS_FILTERS.map(f => (
                  <button key={f} onClick={() => setStatus(f)}
                    className={clsx('px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors', status === f ? 'bg-[#0A3D91] text-white border-[#0A3D91]' : 'bg-white text-[#334155] border-[#CBD5E1] hover:bg-gray-50')}>
                    {f}
                  </button>
                ))}
              </div>

              {cancel.error && <Alert type="error" message={cancel.error.message} />}

              {/* Leave Requests Section */}
              <section className="space-y-3">
                <h2 className="text-sm font-bold text-[#0F172A]">Leave requests</h2>
                {visibleLeave.length === 0 ? (
                  <p className="text-xs text-[#64748B]">No {status !== 'All' ? status.toLowerCase() : ''} leave requests.</p>
                ) : (
                  <ul className="card p-0 divide-y divide-[#E2E8F0]">
                    {visibleLeave.map(r => {
                      const days = inclusiveDays(r.startDate, r.endDate)
                      return (
                        <li key={r.id} className="px-4 py-3 space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-bold text-[#172554]">
                              {r.leaveType} leave
                              <span className="ml-2 font-normal text-xs text-[#64748B]">
                                {formatDate(r.startDate)} – {formatDate(r.endDate)} · {days} day{days === 1 ? '' : 's'}
                              </span>
                            </p>
                            <span className={clsx('text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap', STATUS_TONE[r.status] ?? 'bg-[#F1F5F9] text-[#475569]')}>{r.status}</span>
                          </div>
                          {r.adminNotes && <p className="text-xs bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-2.5 py-1.5"><b>Admin:</b> {r.adminNotes}</p>}
                          {r.status === 'Pending' && (
                            <button className="text-xs font-semibold text-[#B91C1C] hover:underline" disabled={cancel.isPending} onClick={() => cancel.mutate(r.id)}>
                              Cancel request
                            </button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </section>

              {/* Swap Requests Section */}
              <section className="space-y-3">
                <h2 className="text-sm font-bold text-[#0F172A]">Shift swap requests</h2>
                {visibleSwaps.length === 0 ? (
                  <p className="text-xs text-[#64748B]">No {status !== 'All' ? status.toLowerCase() : ''} swap requests.</p>
                ) : (
                  <ul className="card p-0 divide-y divide-[#E2E8F0]">
                    {visibleSwaps.map(r => (
                      <li key={r.id} className="px-4 py-3 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-bold text-[#172554]">
                            {r.shiftType} shift swap
                            <span className="ml-2 font-normal text-xs text-[#64748B]">{formatDate(r.date)}</span>
                          </p>
                          <span className={clsx('text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap', STATUS_TONE[r.status] ?? 'bg-[#F1F5F9] text-[#475569]')}>{r.status}</span>
                        </div>
                        <p className="text-xs text-[#64748B] flex items-center gap-1.5">{r.requesterName} <ArrowRight size={11} /> {r.peerName}</p>
                        {r.adminNotes && <p className="text-xs bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg px-2.5 py-1.5"><b>Admin:</b> {r.adminNotes}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      )}
    </AppShell>
  )
}