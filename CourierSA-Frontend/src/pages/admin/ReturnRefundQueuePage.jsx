import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { Alert } from '@/components/ui'
import StatusBadge from '@/components/ui/StatusBadge'
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

  // ROBUST UNWRAPPING: Handles direct arrays, { data: [...] }, and nested envelopes
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
    onError: err => 
      setError(err?.response?.data?.message || err?.message || 'Failed to release refund.'),
  })

  return (
    <AppShell title="Release Return Refunds">
      <div className="max-w-2xl mx-auto space-y-6">
        {error && <Alert type="error" message={error} />}

        {isLoading && (
          <div className="flex items-center justify-center py-12 text-[#64748B] gap-2 text-sm">
            <RefreshCw size={18} className="animate-spin text-[#0A3D91]" /> Loading refund queue…
          </div>
        )}
        
        {!isLoading && returns.length === 0 && (
          <div className="card text-center py-12 text-[#64748B] bg-white rounded-xl border border-[#D8E4F5]">
            <Wallet size={32} className="mx-auto mb-2 text-[#94A3B8]" />
            <p className="font-semibold">No returns are awaiting refund right now.</p>
          </div>
        )}

        <div className="space-y-3">
          {returns.map(r => (
            <div key={r.id} className="card bg-white p-4 rounded-xl border border-[#D8E4F5] shadow-sm flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-[#172554]">{r.raNumber}</p>
                  <span className="text-[10px] bg-[#F1F5F9] text-[#475569] font-mono px-2 py-0.5 rounded-full border border-[#E2E8F0]">
                    {r.trackingNumber}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  {r.inspectionResult && <StatusBadge status={r.inspectionResult} />}
                  {r.refundAmountZAR != null && (
                    <span className="text-xs font-bold text-emerald-700">
                      Refund Due: {formatZAR(r.refundAmountZAR)}
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={() => releaseMutation.mutate(r.id)}
                disabled={releaseMutation.isPending}
                className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5 shadow-xs"
              >
                {releaseMutation.isPending ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" /> Releasing…
                  </>
                ) : (
                  'Release Refund'
                )}
              </button>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  )
}