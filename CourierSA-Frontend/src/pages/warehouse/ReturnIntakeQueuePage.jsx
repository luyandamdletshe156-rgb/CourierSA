import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { Alert } from '@/components/ui'
import StatusBadge from '@/components/ui/StatusBadge'
import { returnApi } from '@/api'
import { PackageCheck, ChevronDown, ChevronUp } from 'lucide-react'
import clsx from 'clsx'

const STATUS_FILTERS = ['Approved', 'Received', '']

function InspectForm({ returnId, onDone }) {
  const [result, setResult] = useState('Acceptable')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => returnApi.inspect(returnId, { result, notes }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['return-requests', 'queue'] }); onDone() },
    onError: err => setError(err?.message || 'Failed to log inspection.'),
  })

  return (
    <div className="space-y-3">
      <div className="flex gap-3 flex-wrap">
        {['Acceptable', 'Damaged', 'Missing'].map(opt => (
          <label key={opt} className="flex items-center gap-2 text-sm">
            <input type="radio" checked={result === opt} onChange={() => setResult(opt)} /> {opt}
          </label>
        ))}
      </div>
      <textarea rows={3} className="input" placeholder="Inspection notes…" value={notes} onChange={e => setNotes(e.target.value)} />
      {error && <Alert type="error" message={error} />}
      <button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="btn-primary">
        {mutation.isPending ? 'Saving…' : 'Log inspection'}
      </button>
    </div>
  )
}

export default function ReturnIntakeQueuePage() {
  const [status, setStatus] = useState('Approved')
  const [expanded, setExpanded] = useState(null)
  const qc = useQueryClient()

  const { data: returns, isLoading } = useQuery({
    queryKey: ['return-requests', 'queue', status],
    queryFn: () => returnApi.queue(status || undefined),
  })

  const receiveMutation = useMutation({
    mutationFn: id => returnApi.receive(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['return-requests', 'queue'] }),
  })

  return (
    <AppShell title="Return Intake">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex gap-2 flex-wrap">
          {STATUS_FILTERS.map(s => (
            <button
              key={s || 'all'} onClick={() => setStatus(s)}
              className={clsx('px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all',
                status === s ? 'bg-[#0A3D91] text-white border-[#0A3D91]' : 'bg-white text-[#64748B] border-[#D8E4F5]')}
            >
              {s || 'All'}
            </button>
          ))}
        </div>

        {isLoading && <p className="text-sm text-[#64748B]">Loading…</p>}
        {!isLoading && (!returns || returns.length === 0) && (
          <div className="card text-center py-12 text-[#64748B]">
            <PackageCheck size={28} className="mx-auto mb-2 text-[#94A3B8]" />
            No returns match this filter.
          </div>
        )}

        <div className="space-y-3">
          {returns?.map(r => {
            const isOpen = expanded === r.id
            return (
              <div key={r.id} className="card">
                <button className="w-full flex items-center justify-between" onClick={() => setExpanded(isOpen ? null : r.id)}>
                  <div className="text-left">
                    <p className="text-sm font-bold text-[#172554]">{r.raNumber}</p>
                    <p className="text-xs text-[#64748B] font-mono">{r.trackingNumber}</p>
                    <p className="text-xs text-[#64748B] mt-1">{r.reason}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={r.status} />
                    {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </button>

                {isOpen && (
                  <div className="mt-4 pt-4 border-t border-[#D8E4F5] space-y-4">
                    {r.collectionAddress && (
                      <p className="text-sm text-[#64748B]">
                        <strong>Collection:</strong> {r.collectionAddress.streetAddress}, {r.collectionAddress.city}
                      </p>
                    )}
                    {r.status === 'Approved' && (
                      <button onClick={() => receiveMutation.mutate(r.id)} disabled={receiveMutation.isPending} className="btn-primary">
                        {receiveMutation.isPending ? 'Saving…' : 'Mark as received'}
                      </button>
                    )}
                    {r.status === 'Received' && <InspectForm returnId={r.id} onDone={() => setExpanded(null)} />}
                    {(r.status === 'ReadyForRefund' || r.status === 'InspectionFailed' || r.status === 'Refunded') && (
                      <p className="text-sm text-[#64748B] italic">
                        {r.status === 'ReadyForRefund' ? 'Awaiting admin refund release.' : 'No further warehouse action needed.'}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </AppShell>
  )
}