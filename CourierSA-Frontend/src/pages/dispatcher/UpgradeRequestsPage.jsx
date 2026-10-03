import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { EmptyState, PageLoader, Alert } from '@/components/ui'
import { upgradeApi } from '@/api'
import { formatZAR, formatDate } from '@/utils'
import { Zap, CheckCircle, XCircle } from 'lucide-react'

// Review Priority Upgrade (dispatcher).
function RequestCard({ r }) {
  const qc = useQueryClient()
  const [notes, setNotes] = useState('')
  const review = useMutation({
    mutationFn: approve => upgradeApi.review(r.id, { approve, notes }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['upgrade-requests', 'pending'] }),
  })

  return (
    <div className="card p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-sm font-bold text-[#0F172A]">{r.trackingNumber}</p>
          <p className="text-xs text-[#64748B]">To {r.destinationCity} · requested {formatDate(r.createdAt)}</p>
        </div>
        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[#EFF6FF] text-[#1D4ED8] flex items-center gap-1">
          <Zap size={12} /> {r.currentServiceType} → {r.requestedServiceType}
        </span>
      </div>

      <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl px-3 py-2.5 text-sm">
        <p className="text-[11px] font-bold text-[#64748B] uppercase mb-1">Customer's reason</p>
        {r.reason}
      </div>

      <p className="text-sm">Fee difference the customer will pay: <b>{formatZAR(r.feeZAR)}</b></p>

      <textarea
        className="input" rows={2} value={notes} onChange={e => setNotes(e.target.value)}
        placeholder="Notes (required if rejecting, e.g. the window is not achievable)"
      />
      {review.error && <Alert type="error" message={review.error.message} />}

      <div className="flex gap-2">
        <button className="btn-primary text-sm" disabled={review.isPending} onClick={() => review.mutate(true)}>
          <CheckCircle size={14} /> Approve
        </button>
        <button className="btn-danger text-sm" disabled={review.isPending || !notes.trim()} onClick={() => review.mutate(false)}>
          <XCircle size={14} /> Reject
        </button>
      </div>
    </div>
  )
}

export default function UpgradeRequestsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['upgrade-requests', 'pending'],
    queryFn: () => upgradeApi.pending(),
    refetchInterval: 30000,
  })
  const items = Array.isArray(data) ? data : data?.data ?? []

  return (
    <AppShell title="Priority Upgrades">
      <div className="page-header">
        <div>
          <h1 className="page-title">Priority Upgrades</h1>
          <p className="page-subtitle">Approve an upgrade only if the shorter delivery window is achievable on current routes.</p>
        </div>
      </div>
      {isLoading ? <PageLoader /> : items.length === 0 ? (
        <EmptyState title="No pending upgrade requests" description="Customer requests for a faster service level appear here." />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">{items.map(r => <RequestCard key={r.id} r={r} />)}</div>
      )}
    </AppShell>
  )
}
