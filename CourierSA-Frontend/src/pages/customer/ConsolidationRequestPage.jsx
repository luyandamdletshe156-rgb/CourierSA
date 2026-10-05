import { useState, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { Alert } from '@/components/ui'
import StatusBadge from '@/components/ui/StatusBadge'
import { consolidationApi } from '@/api'
import { formatZAR } from '@/utils'
import { Boxes, RefreshCw, CheckCircle2 } from 'lucide-react'
import clsx from 'clsx'

const asList = d => (Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : [])
const asObj = d => (d && d.data !== undefined ? d.data : d)

// UC10 – Request Package Consolidation (customer)
export default function ConsolidationRequestPage() {
  const qc = useQueryClient()
  const [selected, setSelected] = useState([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const { data: eligibleRaw, isLoading } = useQuery({
    queryKey: ['consolidation', 'eligible'],
    queryFn: consolidationApi.eligible,
  })
  const { data: mineRaw } = useQuery({
    queryKey: ['consolidation', 'mine'],
    queryFn: consolidationApi.mine,
  })

  const eligible = asList(eligibleRaw)
  const mine = asList(mineRaw)

  const selectedKey = useMemo(
    () => eligible.find(p => selected.includes(p.id))?.addressKey ?? null,
    [eligible, selected]
  )
  const sortedIds = useMemo(() => [...selected].sort(), [selected])

  const { data: previewRaw, isFetching: previewing, error: previewError } = useQuery({
    queryKey: ['consolidation', 'preview', sortedIds],
    queryFn: () => consolidationApi.preview({ parcelIds: sortedIds }),
    enabled: sortedIds.length >= 2,
    retry: false,
  })
  const preview = sortedIds.length >= 2 ? asObj(previewRaw) : null

  const requestMutation = useMutation({
    mutationFn: () => consolidationApi.request({ parcelIds: sortedIds }),
    onSuccess: () => {
      setError('')
      setSuccess('Consolidation requested. The work order has been sent to the warehouse.')
      setSelected([])
      qc.invalidateQueries({ queryKey: ['consolidation'] })
    },
    onError: err => { setSuccess(''); setError(err?.message || 'Failed to request consolidation.') },
  })

  const cancelMutation = useMutation({
    mutationFn: id => consolidationApi.cancel(id),
    onSuccess: () => { setError(''); qc.invalidateQueries({ queryKey: ['consolidation'] }) },
    onError: err => setError(err?.message || 'Failed to cancel.'),
  })

  const toggle = p => {
    setSuccess('')
    setSelected(cur => (cur.includes(p.id) ? cur.filter(x => x !== p.id) : [...cur, p.id]))
  }

  return (
    <AppShell title="Request Package Consolidation">
      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {error && <Alert type="error" message={error} />}
          {success && <Alert type="success" message={success} />}

          <div className="card bg-white p-5 rounded-xl border border-[#D8E4F5]">
            <h2 className="text-sm font-bold text-[#172554] mb-1">My Pending Shipments – Awaiting Dispatch</h2>
            <p className="text-xs text-[#64748B] mb-4">
              Pick two or more parcels going to the same address. They will be packed into one master shipment.
            </p>

            {isLoading ? (
              <div className="flex items-center gap-2 py-8 justify-center text-sm text-[#64748B]">
                <RefreshCw size={16} className="animate-spin" /> Loading…
              </div>
            ) : eligible.length === 0 ? (
              <p className="text-sm text-[#64748B] py-6 text-center">
                No parcels are waiting in the warehouse right now.
              </p>
            ) : (
              <div className="space-y-2">
                {eligible.map(p => {
                  const checked = selected.includes(p.id)
                  const blocked = selectedKey && p.addressKey !== selectedKey
                  return (
                    <label
                      key={p.id}
                      className={clsx(
                        'flex items-center gap-3 p-3 rounded-lg border text-sm',
                        checked ? 'border-[#F77F00] bg-[#FFF7ED]' : 'border-[#E2E8F0] bg-white',
                        blocked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                      )}
                    >
                      <input type="checkbox" checked={checked} disabled={blocked} onChange={() => toggle(p)} />
                      <span className="font-mono text-xs w-44">{p.trackingNumber}</span>
                      <span className="flex-1 text-[#334155]">{p.destinationAddress}</span>
                      <span className="text-xs text-[#64748B]">{Number(p.weightKg).toFixed(1)} kg</span>
                      <span className="text-xs font-mono text-[#64748B] w-10 text-right">{p.binCode || '—'}</span>
                    </label>
                  )
                })}
              </div>
            )}
            {selectedKey && (
              <p className="text-xs text-emerald-700 mt-3">
                ✓ Parcels with a different destination are greyed out.
              </p>
            )}
          </div>

          <div className="card bg-white p-5 rounded-xl border border-[#D8E4F5]">
            <h2 className="text-sm font-bold text-[#172554] mb-3">My consolidation orders</h2>
            {mine.length === 0 ? (
              <p className="text-sm text-[#64748B]">You have not requested any consolidations yet.</p>
            ) : (
              <div className="space-y-2">
                {mine.map(o => (
                  <div key={o.id} className="p-3 rounded-lg border border-[#E2E8F0] flex items-center gap-3 text-sm">
                    <div className="flex-1">
                      <p className="font-bold text-[#172554]">{o.orderNumber}
                        {o.masterTrackingId && <span className="ml-2 font-mono text-xs text-[#0A3D91]">{o.masterTrackingId}</span>}
                      </p>
                      <p className="text-xs text-[#64748B]">{o.parcelCount} parcels · {o.destination}{o.lane ? ` · ${o.lane}` : ''}</p>
                    </div>
                    <StatusBadge status={o.status} />
                    {o.status === 'Pending' && (
                      <button
                        className="text-xs px-3 py-1.5 rounded-lg border border-[#E2E8F0] hover:bg-[#F8FAFC]"
                        disabled={cancelMutation.isPending}
                        onClick={() => cancelMutation.mutate(o.id)}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card bg-white p-5 rounded-xl border border-[#D8E4F5] h-fit space-y-3">
          <h2 className="text-sm font-bold text-[#172554] flex items-center gap-2"><Boxes size={16} /> Consolidation summary</h2>
          <Row k="Parcels selected" v={selected.length} />
          {selected.length < 2 ? (
            <p className="text-xs text-[#64748B]">Select at least two parcels to see the combined weight and saving.</p>
          ) : previewError ? (
            <Alert type="error" message={previewError?.message || 'These parcels cannot be consolidated.'} />
          ) : previewing || !preview ? (
            <p className="text-xs text-[#64748B] flex items-center gap-2"><RefreshCw size={12} className="animate-spin" /> Calculating…</p>
          ) : (
            <>
              <Row k="Estimated combined weight" v={`${Number(preview.combinedWeightKg).toFixed(1)} kg`} />
              <Row k="Separate shipping" v={formatZAR(preview.separateShippingZAR)} />
              <Row k="Consolidated shipping" v={formatZAR(preview.consolidatedShippingZAR)} />
              <Row k="Estimated saving" v={`${formatZAR(preview.savingZAR)} (${preview.savingPercent}%)`} strong />
              <p className="text-[11px] text-[#94A3B8]">Estimate only. Your original payment is not changed by this request.</p>
            </>
          )}
          <button
            className="btn-primary w-full text-sm py-2.5 rounded-xl flex items-center justify-center gap-2"
            disabled={selected.length < 2 || !preview || requestMutation.isPending}
            onClick={() => requestMutation.mutate()}
          >
            {requestMutation.isPending ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
            Request Consolidation
          </button>
          <p className="text-[11px] text-[#64748B]">
            Parcel statuses change to <strong>Consolidation Requested</strong> and a work order is sent to the warehouse queue.
          </p>
        </div>
      </div>
    </AppShell>
  )
}

function Row({ k, v, strong }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-[#64748B]">{k}</span>
      <span className={clsx('text-[#172554]', strong ? 'font-bold text-emerald-700' : 'font-semibold')}>{v}</span>
    </div>
  )
}
