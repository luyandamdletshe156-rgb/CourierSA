import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { Alert, StatusBadge } from '@/components/ui'
import { returnApi } from '@/api'
import { Wallet, RefreshCw } from 'lucide-react'
import { formatZAR } from '@/utils'

export default function ReturnRefundQueuePage() {
  const [error, setError] = useState('')
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['return-requests', 'queue', 'ReadyForRefund'],
    queryFn: () => returnApi.queue('ReadyForRefund'),
  })

  // Defensive unwrapping
  const returns = Array.isArray(data)
    ? data
    : Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data?.data?.data)
    ? data.data.data
    : []

  const releaseMutation = useMutation({
    mutationFn: id => returnApi.releaseRefund(id, {}),
    onSuccess: () => { 
      setError('') 
      qc.invalidateQueries({ queryKey: ['return-requests', 'queue', 'ReadyForRefund'] }) 
    },
    onError: err => setError(err?.response?.data?.message || err?.message || 'Failed to release refund.'),
  })

  return (
    <AppShell title="Release Return Refunds">
      <div className="max-w-2xl mx-auto space-y-6">
        {error && <Alert type="error" message={error} />}

        {isLoading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-sm text-[#64748B]">
            <RefreshCw size={18} className="animate-spin" /> Loading refunds…
          </div>
        ) : returns.length === 0 ? (
          <div className="card text-center py-12 text-[#64748B] bg-white rounded-xl border border-[#D8E4F5]">
            <Wallet size={32} className="mx-auto mb-2 text-[#94A3B8]" />
            <p className="font-semibold">No returns are awaiting refund right now.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {returns.map(r => (
              <div key={r.id} className="card bg-white p-4 rounded-xl border border-[#D8E4F5] flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-[#172554]">{r.raNumber}</p>
                  <p className="text-xs text-[#64748B] font-mono mt-0.5">{r.trackingNumber}</p>
                  <div className="mt-2 flex gap-2">
                    {r.inspectionResult && <StatusBadge status={r.inspectionResult} />}
                    <span className="text-xs font-bold text-emerald-700">Due: {formatZAR(r.refundAmountZAR)}</span>
                  </div>
                </div>
                <button
                  onClick={() => releaseMutation.mutate(r.id)}
                  disabled={releaseMutation.isPending}
                  className="btn-primary text-xs px-4 py-2"
                >
                  {releaseMutation.isPending ? 'Releasing…' : 'Release Refund'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}