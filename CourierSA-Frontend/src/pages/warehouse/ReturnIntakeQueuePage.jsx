import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { Alert } from '@/components/ui'
import StatusBadge from '@/components/ui/StatusBadge'
import { returnApi } from '@/api'
import { PackageCheck, ChevronDown, ChevronUp, RefreshCw, PackageX } from 'lucide-react'
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
    <div className="space-y-3 bg-[#F8FAFC] p-4 rounded-xl border border-[#E2E8F0]">
      <label className="text-xs font-semibold text-[#475569]">Physical Inspection Result</label>
      <div className="flex gap-4 flex-wrap">
        {['Acceptable', 'Damaged', 'Missing'].map(opt => (
          <label key={opt} className="flex items-center gap-2 text-xs font-medium text-[#1E293B] cursor-pointer">
            <input
              type="radio"
              name={`inspect-${returnId}`}
              checked={result === opt}
              onChange={() => setResult(opt)}
              className="text-[#0A3D91]"
            />{' '}
            {opt}
          </label>
        ))}
      </div>
      <textarea
        rows={3}
        className="input w-full p-2.5 border rounded-lg text-xs"
        placeholder="Enter physical inspection notes (condition, packaging, seal)..."
        value={notes}
        onChange={e => setNotes(e.target.value)}
      />
      {error && <Alert type="error" message={error} />}
      <div className="flex justify-end">
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="btn-primary text-xs px-4 py-2"
        >
          {mutation.isPending ? 'Saving…' : 'Log Inspection'}
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

  // CRITICAL FIX: Safely unwrap data from response envelopes
  const returnsList = Array.isArray(data)
    ? data
    : Array.isArray(data?.data)
    ? data.data
    : []

  const receiveMutation = useMutation({
    mutationFn: id => returnApi.receive(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['return-requests'] }),
  })

  return (
    <AppShell title="Return Intake">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Status Filters */}
        <div className="flex gap-2 flex-wrap">
          {STATUS_FILTERS.map(s => (
            <button
              key={s || 'all'}
              onClick={() => setStatus(s)}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-xs font-bold border-2 transition-all',
                status === s
                  ? 'bg-[#0A3D91] text-white border-[#0A3D91]'
                  : 'bg-white text-[#64748B] border-[#D8E4F5] hover:border-[#0A3D91]'
              )}
            >
              {s || 'All'}
            </button>
          ))}
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center py-12 text-[#64748B] gap-2 text-sm">
            <RefreshCw size={18} className="animate-spin text-[#0A3D91]" /> Loading return queue…
          </div>
        )}

        {/* Query Error State */}
        {isError && (
          <Alert
            type="error"
            message={error?.response?.data?.message || error?.message || 'Failed to load return requests.'}
          />
        )}

        {/* Empty State */}
        {!isLoading && !isError && returnsList.length === 0 && (
          <div className="card text-center py-12 text-[#64748B] bg-white rounded-xl border border-[#D8E4F5]">
            <PackageX size={32} className="mx-auto mb-2 text-[#94A3B8]" />
            <p className="font-semibold">No returns match this filter.</p>
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
                      <p className="text-xs text-[#64748B] mt-1">{r.reason}</p>
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
                    <div className="mt-4 pt-4 border-t border-[#D8E4F5] space-y-4 text-xs">
                      {r.collectionAddress && (
                        <div className="p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] text-[#334155]">
                          <strong className="text-[#1E293B]">Collection Address:</strong>{' '}
                          {r.collectionAddress.streetAddress}, {r.collectionAddress.city},{' '}
                          {r.collectionAddress.province} ({r.collectionAddress.postalCode})
                        </div>
                      )}

                      {/* Action based on return status */}
                      {r.status === 'Approved' && (
                        <div className="flex justify-end">
                          <button
                            onClick={() => receiveMutation.mutate(r.id)}
                            disabled={receiveMutation.isPending}
                            className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5"
                          >
                            {receiveMutation.isPending ? (
                              <>
                                <RefreshCw size={14} className="animate-spin" /> Saving…
                              </>
                            ) : (
                              'Mark as Received'
                            )}
                          </button>
                        </div>
                      )}

                      {r.status === 'Received' && (
                        <InspectForm returnId={r.id} onDone={() => setExpanded(null)} />
                      )}

                      {(r.status === 'ReadyForRefund' ||
                        r.status === 'InspectionFailed' ||
                        r.status === 'Refunded') && (
                        <p className="text-xs text-[#64748B] italic">
                          {r.status === 'ReadyForRefund'
                            ? 'Inspection complete. Awaiting administrator refund release.'
                            : 'No further warehouse action needed for this return.'}
                        </p>
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