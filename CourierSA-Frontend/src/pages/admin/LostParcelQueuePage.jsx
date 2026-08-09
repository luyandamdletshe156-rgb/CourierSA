import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { Alert } from '@/components/ui'
import StatusBadge from '@/components/ui/StatusBadge'
import { lostParcelApi } from '@/api'
import { PackageX, ChevronDown, ChevronUp } from 'lucide-react'
import clsx from 'clsx'

const STATUS_FILTERS = ['', 'Reported', 'UnderInvestigation', 'ConfirmedLost', 'Found', 'Closed']

function InvestigateForm({ caseId, onDone }) {
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => lostParcelApi.investigate(caseId, { notes }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lost-parcel-cases', 'queue'] }); onDone() },
    onError: err => setError(err?.message || 'Failed to open investigation.'),
  })

  return (
    <div className="space-y-3">
      <textarea rows={3} className="input" placeholder="Investigation notes…" value={notes} onChange={e => setNotes(e.target.value)} />
      {error && <Alert type="error" message={error} />}
      <button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="btn-primary">
        {mutation.isPending ? 'Saving…' : 'Begin investigation'}
      </button>
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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lost-parcel-cases', 'queue'] }); onDone() },
    onError: err => setError(err?.message || 'Failed to resolve case.'),
  })

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" checked={outcome === 'Found'} onChange={() => setOutcome('Found')} /> Found
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" checked={outcome === 'ConfirmedLost'} onChange={() => setOutcome('ConfirmedLost')} /> Confirmed lost
        </label>
      </div>
      <textarea rows={3} className="input" placeholder="Resolution notes…" value={notes} onChange={e => setNotes(e.target.value)} />
      {error && <Alert type="error" message={error} />}
      <button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="btn-primary">
        {mutation.isPending ? 'Saving…' : 'Resolve case'}
      </button>
    </div>
  )
}

function ClaimForm({ caseId, onDone }) {
  const [amountOverride, setAmountOverride] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => lostParcelApi.submitClaim(caseId, {
      claimAmountOverrideZAR: amountOverride ? Number(amountOverride) : null,
      notes,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lost-parcel-cases', 'queue'] }); onDone() },
    onError: err => setError(err?.message || 'Failed to submit claim.'),
  })

  return (
    <div className="space-y-3">
      <div>
        <label className="label">Claim amount override (optional — defaults to declared value)</label>
        <input type="number" step="0.01" className="input font-mono" placeholder="Leave blank to use declared value" value={amountOverride} onChange={e => setAmountOverride(e.target.value)} />
      </div>
      <textarea rows={2} className="input" placeholder="Claim notes…" value={notes} onChange={e => setNotes(e.target.value)} />
      {error && <Alert type="error" message={error} />}
      <button onClick={() => mutation.mutate()} disabled={mutation.isPending} className="btn-primary">
        {mutation.isPending ? 'Submitting…' : 'Submit insurance claim'}
      </button>
    </div>
  )
}

export default function LostParcelQueuePage() {
  const [status, setStatus] = useState('')
  const [expanded, setExpanded] = useState(null)

  const { data: cases, isLoading } = useQuery({
    queryKey: ['lost-parcel-cases', 'queue', status],
    queryFn: () => lostParcelApi.queue(status || undefined),
  })

  return (
    <AppShell title="Lost Parcel Cases">
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
        {!isLoading && (!cases || cases.length === 0) && (
          <div className="card text-center py-12 text-[#64748B]">
            <PackageX size={28} className="mx-auto mb-2 text-[#94A3B8]" />
            No cases match this filter.
          </div>
        )}

        <div className="space-y-3">
          {cases?.map(c => {
            const isOpen = expanded === c.id
            return (
              <div key={c.id} className="card">
                <button className="w-full flex items-center justify-between" onClick={() => setExpanded(isOpen ? null : c.id)}>
                  <div className="text-left">
                    <p className="text-sm font-bold text-[#172554]">{c.caseNumber}</p>
                    <p className="text-xs text-[#64748B] font-mono">{c.trackingNumber}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={c.status} />
                    {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </button>

                {isOpen && (
                  <div className="mt-4 pt-4 border-t border-[#D8E4F5] space-y-4">
                    {c.customerNotes && <p className="text-sm text-[#64748B]"><strong>Customer notes:</strong> {c.customerNotes}</p>}
                    {c.investigationNotes && <p className="text-sm text-[#64748B]"><strong>Investigation notes:</strong> {c.investigationNotes}</p>}
                    {c.claimNumber && (
                      <p className="text-sm text-[#0A3D91]"><strong>Claim:</strong> {c.claimNumber} — <StatusBadge status={c.claimStatus} /></p>
                    )}

                    {c.status === 'Reported' && <InvestigateForm caseId={c.id} onDone={() => setExpanded(null)} />}
                    {c.status === 'UnderInvestigation' && <ResolveForm caseId={c.id} onDone={() => setExpanded(null)} />}
                    {c.status === 'ConfirmedLost' && !c.claimNumber && <ClaimForm caseId={c.id} onDone={() => setExpanded(null)} />}
                    {(c.status === 'Found' || c.status === 'Closed') && (
                      <p className="text-sm text-[#64748B] italic">No further action needed.</p>
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