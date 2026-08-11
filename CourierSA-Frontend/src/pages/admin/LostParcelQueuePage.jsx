import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { Alert } from '@/components/ui'
import StatusBadge from '@/components/ui/StatusBadge'
import { lostParcelApi } from '@/api'
import { PackageX, ChevronDown, ChevronUp, RefreshCw, ShieldCheck } from 'lucide-react'
import clsx from 'clsx'

const STATUS_FILTERS = ['', 'Reported', 'UnderInvestigation', 'ConfirmedLost', 'Found', 'Closed']

function InvestigateForm({ caseId, onDone }) {
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => lostParcelApi.investigate(caseId, { notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lost-parcel-cases'] })
      onDone()
    },
    onError: err => setError(err?.response?.data?.message || err?.message || 'Failed to open investigation.'),
  })

  return (
    <div className="space-y-3 bg-[#F8FAFC] p-4 rounded-xl border border-[#E2E8F0]">
      <label className="text-xs font-semibold text-[#475569]">Investigation Notes</label>
      <textarea
        rows={3}
        className="input w-full p-2.5 border rounded-lg text-sm"
        placeholder="Enter initial investigation details…"
        value={notes}
        onChange={e => setNotes(e.target.value)}
      />
      {error && <Alert type="error" message={error} />}
      <div className="flex justify-end gap-2">
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="btn-primary text-xs px-4 py-2"
        >
          {mutation.isPending ? 'Saving…' : 'Begin Investigation'}
        </button>
      </div>
    </div>
  )
}

function ResolveForm({ caseId, onDone }) {
  const [outcome, setOutcome] = useState('ConfirmedLost')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => lostParcelApi.resolve(caseId, { outcome, notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lost-parcel-cases'] })
      onDone()
    },
    onError: err => setError(err?.response?.data?.message || err?.message || 'Failed to resolve case.'),
  })

  return (
    <div className="space-y-3 bg-[#F8FAFC] p-4 rounded-xl border border-[#E2E8F0]">
      <label className="text-xs font-semibold text-[#475569]">Resolution Outcome</label>
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm font-medium text-[#1E293B] cursor-pointer">
          <input
            type="radio"
            name={`outcome-${caseId}`}
            checked={outcome === 'Found'}
            onChange={() => setOutcome('Found')}
            className="text-[#0A3D91]"
          />
          Parcel Found
        </label>
        <label className="flex items-center gap-2 text-sm font-medium text-[#1E293B] cursor-pointer">
          <input
            type="radio"
            name={`outcome-${caseId}`}
            checked={outcome === 'ConfirmedLost'}
            onChange={() => setOutcome('ConfirmedLost')}
            className="text-[#0A3D91]"
          />
          Confirmed Lost
        </label>
      </div>
      <textarea
        rows={3}
        className="input w-full p-2.5 border rounded-lg text-sm"
        placeholder="Resolution summary notes…"
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
          {mutation.isPending ? 'Saving…' : 'Resolve Case'}
        </button>
      </div>
    </div>
  )
}

function ClaimForm({ caseId, onDone }) {
  const [amountOverride, setAmountOverride] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () =>
      lostParcelApi.submitClaim(caseId, {
        claimAmountOverrideZAR: amountOverride ? Number(amountOverride) : null,
        notes,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lost-parcel-cases'] })
      onDone()
    },
    onError: err => setError(err?.response?.data?.message || err?.message || 'Failed to submit claim.'),
  })

  return (
    <div className="space-y-3 bg-[#F8FAFC] p-4 rounded-xl border border-[#E2E8F0]">
      <div>
        <label className="block text-xs font-semibold text-[#475569] mb-1">
          Claim Amount Override (ZAR)
        </label>
        <input
          type="number"
          step="0.01"
          className="input font-mono w-full p-2 border rounded-lg text-sm"
          placeholder="Leave blank to default to parcel declared value"
          value={amountOverride}
          onChange={e => setAmountOverride(e.target.value)}
        />
      </div>
      <textarea
        rows={2}
        className="input w-full p-2.5 border rounded-lg text-sm"
        placeholder="Insurance claim notes…"
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
          {mutation.isPending ? 'Submitting…' : 'Submit Insurance Claim'}
        </button>
      </div>
    </div>
  )
}

// ── Update Claim Status Form (Admin Action) ───────────────────────────────────
function UpdateClaimStatusForm({ claimId, currentStatus, onDone }) {
  const [status, setStatus] = useState('Approved') // Approved | Settled | Rejected
  const [approvedAmount, setApprovedAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () =>
      lostParcelApi.updateClaimStatus(claimId, {
        status,
        approvedAmountZAR: approvedAmount ? Number(approvedAmount) : null,
        notes,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lost-parcel-cases'] })
      onDone()
    },
    onError: err => setError(err?.response?.data?.message || err?.message || 'Failed to update claim status.'),
  })

  return (
    <div className="space-y-3 bg-[#F0F9FF] p-4 rounded-xl border border-[#BEE3F8]">
      <div className="flex items-center gap-2 text-xs font-bold text-[#0A3D91]">
        <ShieldCheck size={16} /> Manage Insurance Claim Status
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-[#334155] mb-1">Action / Status</label>
          <select
            className="input w-full p-2 border rounded-lg text-xs bg-white"
            value={status}
            onChange={e => setStatus(e.target.value)}
          >
            <option value="Approved">Approve Claim</option>
            <option value="Settled">Settle & Credit Wallet</option>
            <option value="Rejected">Reject Claim</option>
          </select>
        </div>

        {status !== 'Rejected' && (
          <div>
            <label className="block text-xs font-semibold text-[#334155] mb-1">Approved Amount (ZAR)</label>
            <input
              type="number"
              step="0.01"
              className="input font-mono w-full p-2 border rounded-lg text-xs"
              placeholder="e.g. 499.95"
              value={approvedAmount}
              onChange={e => setApprovedAmount(e.target.value)}
            />
          </div>
        )}
      </div>

      <div>
        <label className="block text-xs font-semibold text-[#334155] mb-1">Resolution / Audit Notes</label>
        <textarea
          rows={2}
          className="input w-full p-2.5 border rounded-lg text-xs"
          placeholder="Log notes regarding approval or rejection..."
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
      </div>

      {error && <Alert type="error" message={error} />}

      <div className="flex justify-end">
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="btn-primary text-xs px-4 py-2"
        >
          {mutation.isPending ? 'Updating…' : 'Update Claim Status'}
        </button>
      </div>
    </div>
  )
}

export default function LostParcelQueuePage() {
  const [status, setStatus] = useState('')
  const [expanded, setExpanded] = useState(null)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['lost-parcel-cases', 'queue', status],
    queryFn: () => lostParcelApi.queue(status || undefined),
  })

  // DEFENSIVE UNWRAPPING: Handles raw arrays AND response objects like { data: [...] }
  const casesList = Array.isArray(data)
    ? data
    : Array.isArray(data?.data)
    ? data.data
    : []

  return (
    <AppShell title="Lost Parcel Cases">
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
            <RefreshCw size={18} className="animate-spin" /> Loading queue…
          </div>
        )}

        {/* Error State */}
        {isError && (
          <Alert
            type="error"
            message={error?.response?.data?.message || error?.message || 'Failed to load lost parcel cases.'}
          />
        )}

        {/* Empty State */}
        {!isLoading && !isError && casesList.length === 0 && (
          <div className="card text-center py-12 text-[#64748B]">
            <PackageX size={32} className="mx-auto mb-2 text-[#94A3B8]" />
            <p className="font-semibold">No cases match this filter.</p>
          </div>
        )}

        {/* Cases List */}
        {!isLoading && !isError && casesList.length > 0 && (
          <div className="space-y-3">
            {casesList.map(c => {
              const isOpen = expanded === c.id
              return (
                <div key={c.id} className="card bg-white p-4 rounded-xl border border-[#D8E4F5] shadow-sm">
                  <button
                    className="w-full flex items-center justify-between text-left"
                    onClick={() => setExpanded(isOpen ? null : c.id)}
                  >
                    <div>
                      <p className="text-sm font-bold text-[#172554]">{c.caseNumber}</p>
                      <p className="text-xs text-[#64748B] font-mono">{c.trackingNumber}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={c.status} />
                      {isOpen ? <ChevronUp size={16} className="text-[#64748B]" /> : <ChevronDown size={16} className="text-[#64748B]" />}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="mt-4 pt-4 border-t border-[#D8E4F5] space-y-4">
                      {c.customerNotes && (
                        <p className="text-sm text-[#475569]">
                          <strong className="text-[#1E293B]">Customer notes:</strong> {c.customerNotes}
                        </p>
                      )}
                      {c.investigationNotes && (
                        <p className="text-sm text-[#475569]">
                          <strong className="text-[#1E293B]">Investigation notes:</strong> {c.investigationNotes}
                        </p>
                      )}
                      {c.claimNumber && (
                        <div className="text-sm text-[#0A3D91] flex items-center gap-2 p-2.5 bg-[#F1F5F9] rounded-lg">
                          <strong>Claim:</strong> {c.claimNumber} — <StatusBadge status={c.claimStatus} />
                        </div>
                      )}

                      {/* Action Forms based on Status */}
                      {c.status === 'Reported' && (
                        <InvestigateForm caseId={c.id} onDone={() => setExpanded(null)} />
                      )}
                      {c.status === 'UnderInvestigation' && (
                        <ResolveForm caseId={c.id} onDone={() => setExpanded(null)} />
                      )}
                      {c.status === 'ConfirmedLost' && !c.claimNumber && (
                        <ClaimForm caseId={c.id} onDone={() => setExpanded(null)} />
                      )}

                      {/* Admin Claim Approval / Settlement Form */}
                      {c.claimNumber && c.claimStatus !== 'Settled' && c.claimStatus !== 'Rejected' && (
                        <UpdateClaimStatusForm
                          claimId={c.insuranceClaimId}
                          currentStatus={c.claimStatus}
                          onDone={() => setExpanded(null)}
                        />
                      )}

                      {c.claimStatus === 'Settled' && (
                        <p className="text-xs text-emerald-700 font-semibold bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">
                          ✓ Claim settled and payout released to customer.
                        </p>
                      )}

                      {c.status === 'Found' && (
                        <p className="text-xs text-emerald-700 font-semibold bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">
                          ✓ Case resolved: Parcel was found and is back in transit.
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