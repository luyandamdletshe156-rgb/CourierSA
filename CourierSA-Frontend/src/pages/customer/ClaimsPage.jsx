import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { StatCard, EmptyState, PageLoader, Modal, Alert, TrackingBadge } from '@/components/ui'
import api, { parcelApi } from '@/api'
import { AlertTriangle, CheckCircle, Clock, Plus, X, RefreshCw, Package } from 'lucide-react'
import { formatDate, formatZAR } from '@/utils'
import clsx from 'clsx'

const CLAIM_STATUS_STYLES = {
  Submitted:          { cls: 'status-pending bg-amber-50 text-amber-700 border-amber-200',          label: 'Submitted'          },
  UnderReview:        { cls: 'status-transit bg-blue-50 text-blue-700 border-blue-200',            label: 'Under review'       },
  Approved:           { cls: 'status-approved bg-[#DCEEFF] text-[#0A3D91] border-[#BEE3F8]',       label: 'Approved'           },
  PartiallyApproved:  { cls: 'status-approved bg-blue-50 text-blue-800 border-blue-200',           label: 'Partially approved' },
  Rejected:           { cls: 'status-failed bg-red-50 text-red-700 border-red-200',               label: 'Rejected'           },
  Settled:            { cls: 'status-delivered bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Settled'            },
}

const CLAIM_TYPES = [
  { value: 'Damage',       label: 'Damaged parcel',     desc: 'Parcel arrived damaged' },
  { value: 'Loss',         label: 'Lost parcel',        desc: 'Parcel never arrived' },
  { value: 'Delay',        label: 'Significant delay',  desc: 'Major delivery delay' },
  { value: 'WrongDelivery',label: 'Wrong delivery',     desc: 'Delivered to wrong address' },
]

function ClaimStatusBadge({ status }) {
  const s = CLAIM_STATUS_STYLES[status] ?? { cls: 'bg-gray-100 text-gray-700 border-gray-200', label: status }
  return (
    <span className={clsx('px-2.5 py-0.5 rounded-full text-[11px] font-bold border inline-block', s.cls)}>
      {s.label}
    </span>
  )
}

export default function ClaimsPage() {
  const qc = useQueryClient()
  const [newClaimOpen, setNewClaimOpen] = useState(false)
  const [selectedClaim, setSelectedClaim] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['insurance-claims'],
    queryFn: () => api.get('/claims'),
  })

  // Defensive unwrapping for API envelopes
  const claims = Array.isArray(data?.data?.items)
    ? data.data.items
    : Array.isArray(data?.data?.data)
    ? data.data.data
    : Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data)
    ? data
    : []

  const pending  = claims.filter(c => c.status === 'Submitted' || c.status === 'UnderReview').length
  const approved = claims.filter(c => c.status === 'Approved' || c.status === 'PartiallyApproved' || c.status === 'Settled').length
  const rejected = claims.filter(c => c.status === 'Rejected').length

  return (
    <AppShell title="Claims">
      <div className="page-header flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#172554]">Insurance Claims</h1>
          <p className="text-xs text-[#64748B] mt-0.5">Submit and track claims for lost, damaged, or delayed parcels</p>
        </div>
        <button className="btn-primary text-xs px-4 py-2.5 flex items-center gap-2 rounded-xl shadow-sm" onClick={() => setNewClaimOpen(true)}>
          <Plus size={15} /> New claim
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Active claims" value={pending}  icon={Clock}       color="bg-amber-500" />
        <StatCard label="Approved"      value={approved} icon={CheckCircle} color="bg-emerald-500" />
        <StatCard label="Rejected"      value={rejected} icon={X}           color="bg-red-500" />
      </div>

      <div className="card bg-white p-5 rounded-2xl border border-[#D8E4F5] shadow-sm">
        <div className="pb-4 mb-4 border-b border-[#E2E8F0]">
          <h2 className="text-sm font-bold text-[#172554]">My claims</h2>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-[#64748B] gap-2 text-sm">
            <RefreshCw size={18} className="animate-spin text-[#0A3D91]" /> Loading insurance claims…
          </div>
        ) : claims.length === 0 ? (
          <EmptyState
            icon={AlertTriangle}
            title="No claims filed"
            description="File a claim if your parcel was damaged, lost, or significantly delayed."
            action={
              <button className="btn-primary btn-sm text-xs px-3.5 py-2 mt-2" onClick={() => setNewClaimOpen(true)}>
                <Plus size={14} /> File a claim
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[11px] font-bold text-[#475569] uppercase tracking-wider">
                  <th className="p-3 pl-4">Claim #</th>
                  <th className="p-3">Parcel</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Claimed</th>
                  <th className="p-3">Approved</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Submitted</th>
                  <th className="p-3 pr-4 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0] text-[#334155]">
                {claims.map(c => (
                  <tr key={c.id || c.claimNumber} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="p-3 pl-4">
                      <span className="font-mono text-xs font-bold text-[#172554] bg-[#F1F5F9] px-2 py-0.5 rounded-md border border-[#E2E8F0]">
                        {c.claimNumber}
                      </span>
                    </td>
                    <td className="p-3"><TrackingBadge value={c.trackingNumber} /></td>
                    <td className="p-3 font-medium text-[#475569]">{c.type?.replace(/([A-Z])/g, ' $1').trim()}</td>
                    <td className="p-3 font-bold text-[#172554]">{formatZAR(c.claimedAmountZAR)}</td>
                    <td className="p-3">
                      {c.approvedAmountZAR ? (
                        <span className="text-emerald-700 font-bold">{formatZAR(c.approvedAmountZAR)}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="p-3"><ClaimStatusBadge status={c.status} /></td>
                    <td className="p-3 text-[#64748B]">{formatDate(c.createdAt)}</td>
                    <td className="p-3 pr-4 text-right">
                      <button
                        className="btn-ghost btn-sm text-xs text-[#0A3D91] font-semibold hover:underline"
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

  // Fetch Customer's Parcels for Dropdown
  const { data: parcelsData, isLoading: isLoadingParcels } = useQuery({
    queryKey: ['parcels', 'mine'],
    queryFn: () => parcelApi.list({ pageSize: 100 }),
    enabled: open,
  })

  const parcelsList =
    parcelsData?.data?.items ??
    parcelsData?.items ??
    parcelsData?.data ??
    (Array.isArray(parcelsData) ? parcelsData : [])

  const mutation = useMutation({
    mutationFn: () => api.post('/claims', {
      trackingNumber:   form.trackingNumber.trim().toUpperCase(),
      type:             form.type,
      claimedAmountZAR: parseFloat(form.claimedAmount),
      description:      form.description.trim(),
    }),
    onSuccess: () => {
      setForm({ trackingNumber: '', type: 'Damage', claimedAmount: '', description: '' })
      setError('')
      onSuccess()
    },
    onError: err =>
      setError(err?.response?.data?.message || err?.message || 'Failed to submit claim.'),
  })

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))
  const valid = form.trackingNumber.trim().length > 3 &&
                parseFloat(form.claimedAmount) > 0 &&
                form.description.trim().length > 10

  return (
    <Modal open={open} onClose={onClose} title="File an insurance claim" size="md">
      <div className="space-y-4 text-xs">
        {error && <Alert type="error" message={error} />}

        {/* Parcel Selection Dropdown */}
        <div>
          <label className="block font-semibold text-[#334155] mb-1">Select Parcel <span className="text-red-500">*</span></label>
          {isLoadingParcels ? (
            <div className="p-2.5 border border-[#CBD5E1] rounded-xl text-xs text-[#64748B] flex items-center gap-1.5 bg-[#F8FAFC]">
              <RefreshCw size={14} className="animate-spin text-[#0A3D91]" /> Loading parcels…
            </div>
          ) : parcelsList.length === 0 ? (
            <input
              className="input font-mono w-full p-2.5 border border-[#CBD5E1] rounded-xl text-xs"
              placeholder="e.g. CSA-20260809-00042"
              value={form.trackingNumber}
              onChange={set('trackingNumber')}
            />
          ) : (
            <select
              className="input font-mono w-full p-2.5 border border-[#CBD5E1] rounded-xl text-xs bg-white focus:border-[#0A3D91]"
              value={form.trackingNumber}
              onChange={set('trackingNumber')}
            >
              <option value="">-- Select parcel --</option>
              {parcelsList.map(p => {
                const recipient = p.recipientName || p.deliveryAddress?.recipientName
                return (
                  <option key={p.id || p.trackingNumber} value={p.trackingNumber}>
                    {p.trackingNumber} {recipient ? `— To: ${recipient}` : ''} ({p.status})
                  </option>
                )
              })}
            </select>
          )}
        </div>

        <div>
          <label className="block font-semibold text-[#334155] mb-1">Claim type</label>
          <div className="grid grid-cols-2 gap-2">
            {CLAIM_TYPES.map(t => (
              <button
                key={t.value}
                type="button"
                onClick={() => setForm(f => ({ ...f, type: t.value }))}
                className={clsx(
                  'text-left p-3 rounded-xl border transition-all',
                  form.type === t.value
                    ? 'border-[#0A3D91] bg-blue-50/70 text-[#0A3D91] font-bold'
                    : 'border-[#E2E8F0] hover:border-[#CBD5E1] text-[#334155]'
                )}
              >
                <p className="font-semibold">{t.label}</p>
                <p className="text-[11px] mt-0.5 opacity-75 font-normal">{t.desc}</p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block font-semibold text-[#334155] mb-1">Claimed amount (ZAR)</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748B] text-xs font-bold">R</span>
            <input
              type="number"
              min="0"
              step="0.01"
              className="input w-full pl-7 p-2.5 border border-[#CBD5E1] rounded-xl font-mono text-xs"
              placeholder="0.00"
              value={form.claimedAmount}
              onChange={set('claimedAmount')}
            />
          </div>
          <p className="text-[11px] text-[#94A3B8] mt-1">Must not exceed the declared value of the parcel.</p>
        </div>

        <div>
          <label className="block font-semibold text-[#334155] mb-1">Description</label>
          <textarea
            className="input w-full p-2.5 border border-[#CBD5E1] rounded-xl text-xs h-24 resize-none"
            placeholder="Describe what happened in detail — condition of packaging, contents affected, etc."
            value={form.description}
            onChange={set('description')}
          />
          <p className="text-[11px] text-[#94A3B8] mt-1">{form.description.length}/500 characters</p>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-[#E2E8F0]">
          <button className="btn-secondary text-xs px-4 py-2 rounded-xl" onClick={onClose}>Cancel</button>
          <button
            className="btn-primary text-xs px-5 py-2 rounded-xl shadow-xs"
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
      <div className="space-y-5 text-xs text-[#334155]">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[11px] text-[#64748B] mb-0.5">Parcel</p>
            <TrackingBadge value={claim.trackingNumber} />
          </div>
          <div>
            <p className="text-[11px] text-[#64748B] mb-0.5">Status</p>
            <ClaimStatusBadge status={claim.status} />
          </div>
          <div>
            <p className="text-[11px] text-[#64748B] mb-0.5">Type</p>
            <p className="font-semibold text-[#172554]">{claim.type?.replace(/([A-Z])/g, ' $1').trim()}</p>
          </div>
          <div>
            <p className="text-[11px] text-[#64748B] mb-0.5">Claimed amount</p>
            <p className="font-bold text-[#172554]">{formatZAR(claim.claimedAmountZAR)}</p>
          </div>
          {claim.approvedAmountZAR && (
            <div>
              <p className="text-[11px] text-[#64748B] mb-0.5">Approved amount</p>
              <p className="font-bold text-emerald-700">{formatZAR(claim.approvedAmountZAR)}</p>
            </div>
          )}
          <div>
            <p className="text-[11px] text-[#64748B] mb-0.5">Submitted</p>
            <p className="text-[#334155]">{formatDate(claim.createdAt, { time: true })}</p>
          </div>
        </div>

        {claim.description && (
          <div>
            <p className="text-[11px] font-semibold text-[#64748B] mb-1">Description</p>
            <p className="text-xs text-[#475569] bg-[#F8FAFC] rounded-xl p-3 border border-[#E2E8F0]">
              {claim.description}
            </p>
          </div>
        )}

        {claim.resolutionNotes && (
          <div>
            <p className="text-[11px] font-semibold text-[#64748B] mb-1">Resolution notes</p>
            <p className="text-xs text-[#475569] bg-[#F8FAFC] rounded-xl p-3 border border-[#E2E8F0]">
              {claim.resolutionNotes}
            </p>
          </div>
        )}

        {/* Progress timeline */}
        <div>
          <p className="text-[11px] font-semibold text-[#64748B] mb-3">Progress</p>
          <div className="flex items-center gap-0">
            {steps.map((step, i) => (
              <div key={step.label} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div className={clsx(
                    'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all',
                    step.done
                      ? 'bg-[#0A3D91] border-[#0A3D91] text-white shadow-xs'
                      : 'bg-white border-[#CBD5E1] text-[#94A3B8]'
                  )}>
                    {step.done ? '✓' : i + 1}
                  </div>
                  <p className={clsx(
                    'text-[10px] mt-1 text-center whitespace-nowrap font-medium',
                    step.done ? 'text-[#0A3D91]' : 'text-[#94A3B8]'
                  )}>
                    {step.label}
                  </p>
                </div>
                {i < steps.length - 1 && (
                  <div className={clsx(
                    'flex-1 h-0.5 mb-4 mx-1 transition-all',
                    steps[i + 1].done ? 'bg-[#0A3D91]' : 'bg-[#E2E8F0]'
                  )} />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end pt-2 border-t border-[#E2E8F0]">
          <button className="btn-secondary text-xs px-4 py-2 rounded-xl" onClick={onClose}>Close</button>
        </div>
      </div>
    </Modal>
  )
}