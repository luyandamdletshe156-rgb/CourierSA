import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { StatCard, StatusPill, EmptyState, PageLoader, Modal, Alert, TrackingBadge } from '@/components/ui'
import api from '@/api'
import { AlertTriangle, CheckCircle, Clock, FileText, Plus, Upload, X } from 'lucide-react'
import { formatDate, formatZAR } from '@/utils'
import clsx from 'clsx'

const CLAIM_STATUS_STYLES = {
  Submitted:          { cls: 'status-pending',   label: 'Submitted'           },
  UnderReview:        { cls: 'status-transit',   label: 'Under review'        },
  Approved:           { cls: 'status-approved',  label: 'Approved'            },
  PartiallyApproved:  { cls: 'status-approved',  label: 'Partially approved'  },
  Rejected:           { cls: 'status-failed',    label: 'Rejected'            },
  Settled:            { cls: 'status-delivered', label: 'Settled'             },
}

const CLAIM_TYPES = [
  { value: 'Damage',       label: 'Damaged parcel',     desc: 'Parcel arrived damaged' },
  { value: 'Loss',         label: 'Lost parcel',        desc: 'Parcel never arrived' },
  { value: 'Delay',        label: 'Significant delay',  desc: 'Major delivery delay' },
  { value: 'WrongDelivery',label: 'Wrong delivery',     desc: 'Delivered to wrong address' },
]

function ClaimStatusBadge({ status }) {
  const s = CLAIM_STATUS_STYLES[status] ?? { cls: 'status-draft', label: status }
  return <span className={s.cls}>{s.label}</span>
}

export default function ClaimsPage() {
  const qc = useQueryClient()
  const [newClaimOpen, setNewClaimOpen] = useState(false)
  const [selectedClaim, setSelectedClaim] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['insurance-claims'],
    queryFn:  () => api.get('/claims'),
  })

  const claims = data?.data ?? []

  const pending   = claims.filter(c => c.status === 'Submitted' || c.status === 'UnderReview').length
  const approved  = claims.filter(c => c.status === 'Approved' || c.status === 'PartiallyApproved' || c.status === 'Settled').length
  const rejected  = claims.filter(c => c.status === 'Rejected').length

  return (
    <AppShell title="Claims">
      <div className="page-header">
        <div>
          <h1 className="page-title">Insurance Claims</h1>
          <p className="page-subtitle">Submit and track claims for lost, damaged, or delayed parcels</p>
        </div>
        <button className="btn-primary" onClick={() => setNewClaimOpen(true)}>
          <Plus size={15} /> New claim
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Active claims"   value={pending}  icon={Clock}        color="bg-amber-500"   />
        <StatCard label="Approved"        value={approved} icon={CheckCircle}  color="bg-emerald-500" />
        <StatCard label="Rejected"        value={rejected} icon={X}            color="bg-red-500"     />
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="text-sm font-semibold text-gray-800">My claims</h2>
        </div>

        {isLoading ? <PageLoader /> : claims.length === 0 ? (
          <EmptyState
            icon={AlertTriangle}
            title="No claims filed"
            description="File a claim if your parcel was damaged, lost, or significantly delayed."
            action={
              <button className="btn-primary btn-sm" onClick={() => setNewClaimOpen(true)}>
                <Plus size={14} /> File a claim
              </button>
            }
          />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Claim #</th>
                  <th>Parcel</th>
                  <th>Type</th>
                  <th>Claimed</th>
                  <th>Approved</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {claims.map(c => (
                  <tr key={c.id}>
                    <td>
                      <span className="font-mono text-xs font-medium text-gray-700 bg-gray-100 px-2 py-0.5 rounded">
                        {c.claimNumber}
                      </span>
                    </td>
                    <td><TrackingBadge value={c.trackingNumber} /></td>
                    <td className="text-xs text-gray-600">{c.type?.replace(/([A-Z])/g, ' $1').trim()}</td>
                    <td className="font-medium text-sm">{formatZAR(c.claimedAmountZAR)}</td>
                    <td className="text-sm">
                      {c.approvedAmountZAR ? (
                        <span className="text-emerald-600 font-medium">{formatZAR(c.approvedAmountZAR)}</span>
                      ) : '—'}
                    </td>
                    <td><ClaimStatusBadge status={c.status} /></td>
                    <td className="text-xs text-gray-400">{formatDate(c.createdAt)}</td>
                    <td>
                      <button
                        className="btn-ghost btn-sm"
                        onClick={() => setSelectedClaim(c)}
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <NewClaimModal
        open={newClaimOpen}
        onClose={() => setNewClaimOpen(false)}
        onSuccess={() => {
          setNewClaimOpen(false)
          qc.invalidateQueries({ queryKey: ['insurance-claims'] })
        }}
      />

      <ClaimDetailModal
        claim={selectedClaim}
        onClose={() => setSelectedClaim(null)}
      />
    </AppShell>
  )
}

// ── New Claim Modal ───────────────────────────────────────────────────────────
function NewClaimModal({ open, onClose, onSuccess }) {
  const [form, setForm] = useState({
    trackingNumber: '',
    type:           'Damage',
    claimedAmount:  '',
    description:    '',
  })
  const [error, setError] = useState('')

  const mutation = useMutation({
    mutationFn: () => api.post('/claims', {
      trackingNumber:   form.trackingNumber.trim(),
      type:             form.type,
      claimedAmountZAR: parseFloat(form.claimedAmount),
      description:      form.description.trim(),
    }),
    onSuccess: () => {
      setForm({ trackingNumber: '', type: 'Damage', claimedAmount: '', description: '' })
      onSuccess()
    },
    onError: err => setError(err.message),
  })

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const valid = form.trackingNumber.trim().length > 5 &&
                parseFloat(form.claimedAmount) > 0 &&
                form.description.trim().length > 10

  return (
    <Modal open={open} onClose={onClose} title="File an insurance claim" size="md">
      <div className="space-y-4">
        <Alert type="error" message={error} />

        <div>
          <label className="label">Tracking number</label>
          <input
            className="input font-mono"
            placeholder="CSA-20240615-00423"
            value={form.trackingNumber}
            onChange={set('trackingNumber')}
          />
        </div>

        <div>
          <label className="label">Claim type</label>
          <div className="grid grid-cols-2 gap-2">
            {CLAIM_TYPES.map(t => (
              <button
                key={t.value}
                type="button"
                onClick={() => setForm(f => ({ ...f, type: t.value }))}
                className={clsx(
                  'text-left p-3 rounded-lg border text-sm transition-all',
                  form.type === t.value
                    ? 'border-brand-400 bg-brand-50 text-brand-700'
                    : 'border-gray-200 hover:border-gray-300 text-gray-700'
                )}
              >
                <p className="font-medium">{t.label}</p>
                <p className="text-xs mt-0.5 opacity-70">{t.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Claimed amount (ZAR)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-medium">R</span>
            <input
              type="number"
              min="0"
              step="0.01"
              className="input pl-7"
              placeholder="0.00"
              value={form.claimedAmount}
              onChange={set('claimedAmount')}
            />
          </div>
          <p className="field-error">Must not exceed the declared value of the parcel.</p>
        </div>

        <div>
          <label className="label">Description</label>
          <textarea
            className="input h-24 resize-none"
            placeholder="Describe what happened in detail — when you noticed the damage/loss, condition of packaging, etc."
            value={form.description}
            onChange={set('description')}
          />
          <p className="text-xs text-gray-400 mt-1">{form.description.length}/500 characters</p>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
          <p className="font-semibold mb-0.5">Supporting documents</p>
          <p>Attach photos of damage or proof of loss. File upload UI is available — backend endpoint connects to <code className="font-mono">/claims/:id/documents</code>.</p>
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary"
            disabled={!valid || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'Submitting…' : 'Submit claim'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ── Claim Detail Modal ────────────────────────────────────────────────────────
function ClaimDetailModal({ claim, onClose }) {
  if (!claim) return null

  const steps = [
    { label: 'Submitted',    done: true },
    { label: 'Under review', done: ['UnderReview','Approved','PartiallyApproved','Rejected','Settled'].includes(claim.status) },
    { label: 'Decision',     done: ['Approved','PartiallyApproved','Rejected','Settled'].includes(claim.status) },
    { label: 'Settled',      done: claim.status === 'Settled' },
  ]

  return (
    <Modal open={!!claim} onClose={onClose} title={`Claim ${claim.claimNumber}`} size="md">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Parcel</p>
            <TrackingBadge value={claim.trackingNumber} />
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Status</p>
            <ClaimStatusBadge status={claim.status} />
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Type</p>
            <p className="font-medium text-gray-800">{claim.type?.replace(/([A-Z])/g, ' $1').trim()}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Claimed amount</p>
            <p className="font-medium text-gray-800">{formatZAR(claim.claimedAmountZAR)}</p>
          </div>
          {claim.approvedAmountZAR && (
            <div>
              <p className="text-xs text-gray-500 mb-0.5">Approved amount</p>
              <p className="font-semibold text-emerald-600">{formatZAR(claim.approvedAmountZAR)}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-gray-500 mb-0.5">Submitted</p>
            <p className="text-gray-700">{formatDate(claim.createdAt, { time: true })}</p>
          </div>
        </div>

        {claim.description && (
          <div>
            <p className="text-xs text-gray-500 mb-1">Description</p>
            <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3 border border-gray-200">
              {claim.description}
            </p>
          </div>
        )}

        {claim.resolutionNotes && (
          <div>
            <p className="text-xs text-gray-500 mb-1">Resolution notes</p>
            <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3 border border-gray-200">
              {claim.resolutionNotes}
            </p>
          </div>
        )}

        {/* Progress timeline */}
        <div>
          <p className="text-xs text-gray-500 mb-3">Progress</p>
          <div className="flex items-center gap-0">
            {steps.map((step, i) => (
              <div key={step.label} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div className={clsx(
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2',
                    step.done
                      ? 'bg-brand-500 border-brand-500 text-white'
                      : 'bg-white border-gray-300 text-gray-400'
                  )}>
                    {step.done ? '✓' : i + 1}
                  </div>
                  <p className={clsx(
                    'text-xs mt-1 text-center whitespace-nowrap',
                    step.done ? 'text-brand-600 font-medium' : 'text-gray-400'
                  )}>
                    {step.label}
                  </p>
                </div>
                {i < steps.length - 1 && (
                  <div className={clsx(
                    'flex-1 h-0.5 mb-4 mx-1',
                    steps[i + 1].done ? 'bg-brand-500' : 'bg-gray-200'
                  )} />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <button className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </Modal>
  )
}
