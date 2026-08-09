import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { Alert } from '@/components/ui'
import StatusBadge from '@/components/ui/StatusBadge'
import { returnApi } from '@/api'
import { Wallet } from 'lucide-react'
import { formatZAR } from '@/utils'

export default function ReturnRefundQueuePage() {
  const [error, setError] = useState('')
  const qc = useQueryClient()

  const { data: returns, isLoading } = useQuery({
    queryKey: ['return-requests', 'queue', 'ReadyForRefund'],
    queryFn: () => returnApi.queue('ReadyForRefund'),
  })

  const releaseMutation = useMutation({
    mutationFn: id => returnApi.releaseRefund(id, {}),
    onSuccess: () => { setError(''); qc.invalidateQueries({ queryKey: ['return-requests', 'queue', 'ReadyForRefund'] }) },
    onError: err => setError(err?.message || 'Failed to release refund.'),
  })

  return (
    <AppShell title="Release Return Refunds">
      <div className="max-w-2xl mx-auto space-y-6">
        {error && <Alert type="error" message={error} />}

        {isLoading && <p className="text-sm text-[#64748B]">Loading…</p>}
        {!isLoading && (!returns || returns.length === 0) && (
          <div className="card text-center py-12 text-[#64748B]">
            <Wallet size={28} className="mx-auto mb-2 text-[#94A3B8]" />
            No returns are awaiting refund right now.
          </div>
        )}

        <div className="space-y-3">
          {returns?.map(r => (
            <div key={r.id} className="card flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-[#172554]">{r.raNumber}</p>
                <p className="text-xs text-[#64748B] font-mono mt-0.5">{r.trackingNumber}</p>
                {r.inspectionResult && <StatusBadge status={r.inspectionResult} />}
              </div>
              <button
                onClick={() => releaseMutation.mutate(r.id)}
                disabled={releaseMutation.isPending}
                className="btn-primary"
              >
                {releaseMutation.isPending ? 'Releasing…' : 'Release refund'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  )
}