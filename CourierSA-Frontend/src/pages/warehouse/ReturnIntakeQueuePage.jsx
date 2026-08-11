import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { Alert, StatusBadge } from '@/components/ui'
import { returnApi } from '@/api'
import { PackageCheck, ChevronDown, ChevronUp, RefreshCw, PackageX, ClipboardCheck, RotateCcw } from 'lucide-react'
import clsx from 'clsx'

const STATUS_FILTERS = ['Approved', 'Received', 'ReadyForRefund', 'InspectionFailed', 'Refunded', '']

function InspectForm({ returnId, onDone }) {
  const [result, setResult] = useState('Acceptable')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => returnApi.inspect(returnId, { result, notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['return-requests'] })
      onDone()
    },
    onError: err =>
      setError(err?.response?.data?.message || err?.message || 'Failed to log inspection.'),
  })

  return (
    <div className="space-y-4 bg-[#F8FAFC] p-5 rounded-2xl border border-[#E2E8F0]">
      <label className="text-xs font-bold text-[#475569] uppercase tracking-wider">Physical Inspection Result</label>
      
      {/* Visual Radio Selection */}
      <div className="grid grid-cols-3 gap-3">
        {['Acceptable', 'Damaged', 'Missing'].map(opt => (
          <label key={opt} className={clsx(
            'flex flex-col items-center justify-center p-3 rounded-xl border-2 cursor-pointer transition-all',
            result === opt ? 'bg-[#0A3D91] text-white border-[#0A3D91]' : 'bg-white border-[#E2E8F0] text-[#64748B] hover:border-[#0A3D91]/30'
          )}>
            <input type="radio" name={`inspect-${returnId}`} checked={result === opt} onChange={() => setResult(opt)} className="hidden" />
            <span className="text-xs font-bold">{opt}</span>
          </label>
        ))}
      </div>

      <textarea
        rows={3}
        className="input w-full p-3 border border-[#CBD5E1] rounded-xl text-sm"
        placeholder="Log physical condition (packaging, seal, contents)..."
        value={notes}
        onChange={e => setNotes(e.target.value)}
      />
      
      {error && <Alert type="error" message={error} />}
      
      <div className="flex justify-end">
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="btn-primary text-xs px-6 py-2.5 rounded-xl flex items-center gap-2"
        >
          {mutation.isPending ? <RefreshCw className="animate-spin" size={14} /> : <ClipboardCheck size={14} />}
          {mutation.isPending ? 'Logging…' : 'Finalize Inspection'}
        </button>
      </div>
    </div>
  )
}

export default function ReturnIntakeQueuePage() {
  const [status, setStatus] = useState('Approved')
  const [expanded, setExpanded] = useState(null)
  const qc = useQueryClient()

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['return-requests', 'queue', status],
    queryFn: () => returnApi.queue(status || undefined),
  })

  const returnsList = Array.isArray(data)
    ? data
    : Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data?.data?.data)
    ? data.data.data
    : []

  const receiveMutation = useMutation({
    mutationFn: id => returnApi.receive(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['return-requests'] }),
  })

  return (
    <AppShell title="Warehouse Return Intake">
      <div className="max-w-3xl mx-auto space-y-6">
        
        {/* Status Filters */}
        <div className="flex gap-2 flex-wrap">
          {STATUS_FILTERS.map(s => (
            <button
              key={s || 'all'}
              onClick={() => setStatus(s)}
              className={clsx(
                'px-4 py-2 rounded-xl text-xs font-bold border-2 transition-all flex items-center gap-2',
                status === s
                  ? 'bg-[#0A3D91] text-white border-[#0A3D91]'
                  : 'bg-white text-[#64748B] border-[#D8E4F5] hover:border-[#0A3D91]'
              )}
            >
              {s || 'All'}
            </button>
          ))}
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-12 text-[#64748B] gap-2 text-sm">
            <RefreshCw size={18} className="animate-spin text-[#0A3D91]" /> Loading queue…
          </div>
        )}

        {isError && (
          <Alert
            type="error"
            message={error?.response?.data?.message || error?.message || 'Failed to load return queue.'}
          />
        )}

        {!isLoading && !isError && returnsList.length === 0 && (
          <div className="card text-center py-12 text-[#64748B] bg-white rounded-2xl border border-[#D8E4F5]">
            <PackageX size={32} className="mx-auto mb-2 text-[#94A3B8]" />
            <p className="font-semibold">Queue is clear.</p>
          </div>
        )}

        {/* Return Queue List */}
        {!isLoading && !isError && returnsList.length > 0 && (
          <div className="space-y-3">
            {returnsList.map(r => {
              const isOpen = expanded === r.id
              return (
                <div key={r.id} className="card bg-white p-4 rounded-xl border border-[#D8E4F5] shadow-sm">
                  <button
                    className="w-full flex items-center justify-between text-left"
                    onClick={() => setExpanded(isOpen ? null : r.id)}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-[#172554]">{r.raNumber}</p>
                        <span className="text-[10px] bg-[#F1F5F9] text-[#475569] font-mono px-2 py-0.5 rounded-full border border-[#E2E8F0]">
                          {r.trackingNumber}
                        </span>
                      </div>
                      <p className="text-xs text-[#64748B] mt-1 line-clamp-1">{r.reason}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={r.status} />
                      {isOpen ? (
                        <ChevronUp size={16} className="text-[#64748B]" />
                      ) : (
                        <ChevronDown size={16} className="text-[#64748B]" />
                      )}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="mt-4 pt-4 border-t border-[#E2E8F0] space-y-4">
                      {r.collectionAddress && (
                        <div className="p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] text-xs text-[#334155]">
                          <strong className="text-[#1E293B]">Collection Address:</strong>{' '}
                          {r.collectionAddress.streetAddress}, {r.collectionAddress.city}
                        </div>
                      )}

                      {r.status === 'Approved' && (
                        <div className="flex justify-end pt-2">
                          <button
                            onClick={() => receiveMutation.mutate(r.id)}
                            disabled={receiveMutation.isPending}
                            className="btn-primary text-xs px-5 py-2.5 rounded-xl flex items-center gap-2 shadow-sm"
                          >
                            {receiveMutation.isPending ? <RefreshCw className="animate-spin" size={14} /> : <RotateCcw size={14} />}
                            Mark as Received
                          </button>
                        </div>
                      )}

                      {r.status === 'Received' && (
                        <InspectForm returnId={r.id} onDone={() => setExpanded(null)} />
                      )}

                      {(r.status === 'ReadyForRefund' || r.status === 'InspectionFailed' || r.status === 'Refunded') && (
                        <div className="p-3 bg-blue-50 text-blue-800 text-xs rounded-lg border border-blue-100 italic">
                          {r.status === 'ReadyForRefund'
                            ? 'Inspection complete. Ready for credit.'
                            : 'No further warehouse action needed.'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AppShell>
  )
}