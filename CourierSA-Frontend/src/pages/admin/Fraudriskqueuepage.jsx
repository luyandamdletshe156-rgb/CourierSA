import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { Alert } from '@/components/ui'
import StatusBadge from '@/components/ui/StatusBadge'
import { fraudApi } from '@/api'
import { ShieldAlert, RefreshCw, Search, ShieldCheck, ShieldOff } from 'lucide-react'
import { formatDate } from '@/utils'

function RestrictForm({ customerId, onDone }) {
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const qc = useQueryClient()

  const mutation = useMutation({
    mutationFn: () => fraudApi.restrict(customerId, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fraud', 'flagged'] })
      onDone()
    },
    onError: err => setError(err?.response?.data?.message || err?.message || 'Failed to restrict account.'),
  })

  return (
    <div className="space-y-3 bg-[#F8FAFC] p-4 rounded-xl border border-[#E2E8F0]">
      <label className="text-xs font-semibold text-[#475569]">Reason for restriction</label>
      <textarea
        rows={2}
        className="input w-full p-2.5 border rounded-lg text-sm"
        placeholder="e.g. Repeated unfounded loss claims following manual review…"
        value={reason}
        onChange={e => setReason(e.target.value)}
      />
      {error && <Alert type="error" message={error} />}
      <div className="flex justify-end gap-2">
        <button onClick={onDone} className="btn-secondary text-xs px-4 py-2">Cancel</button>
        <button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !reason.trim()}
          className="btn-primary text-xs px-4 py-2 bg-red-600 hover:bg-red-700"
        >
          {mutation.isPending ? 'Restricting…' : 'Confirm Restriction'}
        </button>
      </div>
    </div>
  )
}

function FraudAccountCard({ account }) {
  const [expanded, setExpanded] = useState(false)
  const [error, setError] = useState('')
  const qc = useQueryClient()

  const evaluateMutation = useMutation({
    mutationFn: () => fraudApi.evaluate(account.customerId),
    onSuccess: () => { setError(''); qc.invalidateQueries({ queryKey: ['fraud', 'flagged'] }) },
    onError: err => setError(err?.response?.data?.message || err?.message || 'Failed to re-evaluate.'),
  })

  const liftMutation = useMutation({
    mutationFn: () => fraudApi.liftRestriction(account.customerId),
    onSuccess: () => { setError(''); qc.invalidateQueries({ queryKey: ['fraud', 'flagged'] }) },
    onError: err => setError(err?.response?.data?.message || err?.message || 'Failed to lift restriction.'),
  })

  return (
    <div className="card bg-white p-4 rounded-xl border border-[#D8E4F5]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-[#172554] truncate">{account.customerName}</p>
          <p className="text-xs text-[#64748B] mt-0.5 truncate">{account.email}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={account.riskLevel} />
            {account.isRestricted && <StatusBadge status="Restricted" />}
            <span className="text-xs font-bold text-[#334155]">Score: {account.riskScore}/100</span>
            {account.riskEvaluatedAt && (
              <span className="text-xs text-[#94A3B8]">Evaluated {formatDate(account.riskEvaluatedAt, { time: true })}</span>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-2 flex-shrink-0">
          <button
            onClick={() => evaluateMutation.mutate()}
            disabled={evaluateMutation.isPending}
            className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5"
          >
            <RefreshCw size={13} className={evaluateMutation.isPending ? 'animate-spin' : ''} />
            Re-evaluate
          </button>
          {account.isRestricted ? (
            <button
              onClick={() => liftMutation.mutate()}
              disabled={liftMutation.isPending}
              className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5 text-emerald-700"
            >
              <ShieldCheck size={13} />
              {liftMutation.isPending ? 'Lifting…' : 'Lift Restriction'}
            </button>
          ) : (
            <button
              onClick={() => setExpanded(v => !v)}
              className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5 text-red-700"
            >
              <ShieldOff size={13} />
              Restrict
            </button>
          )}
        </div>
      </div>

      {account.restrictionReason && (
        <p className="text-xs text-[#7C2D12] bg-[#7C2D12]/5 border border-[#7C2D12]/20 rounded-lg px-3 py-2 mt-3">
          Restriction reason: {account.restrictionReason}
        </p>
      )}

      {account.riskFactors?.length > 0 && (
        <ul className="mt-3 space-y-1">
          {account.riskFactors.map((f, i) => (
            <li key={i} className="text-xs text-[#64748B] flex items-start gap-1.5">
              <span className="text-[#94A3B8] mt-0.5">•</span> {f}
            </li>
          ))}
        </ul>
      )}

      {error && <div className="mt-3"><Alert type="error" message={error} /></div>}

      {expanded && (
        <div className="mt-3">
          <RestrictForm customerId={account.customerId} onDone={() => setExpanded(false)} />
        </div>
      )}
    </div>
  )
}

export default function FraudRiskQueuePage() {
  const [lookupId, setLookupId] = useState('')
  const [lookupError, setLookupError] = useState('')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['fraud', 'flagged'],
    queryFn: () => fraudApi.flagged(),
  })

  // Defensive unwrapping — matches the { success, data, message } envelope pattern
  const accounts = Array.isArray(data)
    ? data
    : Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data?.data?.data)
    ? data.data.data
    : []

  const lookupMutation = useMutation({
    mutationFn: id => fraudApi.evaluate(id),
    onSuccess: () => { setLookupError(''); setLookupId('') },
    onError: err => setLookupError(err?.response?.data?.message || err?.message || 'Customer not found.'),
  })

  return (
    <AppShell title="Fraud Risk Queue">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="card bg-white p-4 rounded-xl border border-[#D8E4F5]">
          <label className="text-xs font-semibold text-[#475569] mb-2 block">
            Evaluate a specific customer by ID
          </label>
          <div className="flex gap-2">
            <input
              className="input flex-1 p-2.5 border rounded-lg text-sm font-mono"
              placeholder="Customer profile GUID…"
              value={lookupId}
              onChange={e => setLookupId(e.target.value)}
            />
            <button
              onClick={() => lookupMutation.mutate(lookupId)}
              disabled={lookupMutation.isPending || !lookupId.trim()}
              className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5"
            >
              <Search size={13} />
              {lookupMutation.isPending ? 'Evaluating…' : 'Evaluate'}
            </button>
          </div>
          {lookupError && <div className="mt-2"><Alert type="error" message={lookupError} /></div>}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-sm text-[#64748B]">
            <RefreshCw size={18} className="animate-spin" /> Loading flagged accounts…
          </div>
        ) : isError ? (
          <Alert type="error" message="Failed to load the fraud risk queue." />
        ) : accounts.length === 0 ? (
          <div className="card text-center py-12 text-[#64748B] bg-white rounded-xl border border-[#D8E4F5]">
            <ShieldAlert size={32} className="mx-auto mb-2 text-[#94A3B8]" />
            <p className="font-semibold">No accounts are currently flagged as Medium/High risk.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {accounts.map(a => (
              <FraudAccountCard key={a.customerId} account={a} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  )
}