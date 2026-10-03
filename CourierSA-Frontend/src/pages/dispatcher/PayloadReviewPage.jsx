import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { EmptyState, PageLoader, Alert } from '@/components/ui'
import { parcelApi, payloadApi } from '@/api'
import { Weight, Scissors, Trash2, XCircle, ArrowRightLeft, ClipboardCheck, Eye, CheckCircle2 } from 'lucide-react'
import clsx from 'clsx'

// UC14 Validate and Adjust Vehicle Payload / UC15 Split Overloaded Routes.
//
// UC14: overview of every run with load against the vehicle maximum. The dispatcher moves excess
//       parcels to another run (or back to the queue), then confirms and signs off the manifest.
//       Warehouse staff can only release a run once it is signed off.
// UC15: for an overloaded run the dispatcher picks a standby driver and a standby vehicle, previews
//       the split, then confirms. Confirming finalises both manifests.

const unwrap = r => (r && r.data !== undefined ? r.data : r)

function LoadBar({ load, max, over }) {
  const pct = max > 0 ? Math.min(100, Math.round((load / max) * 100)) : 0
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-[#334155] mb-1">
        <Weight size={13} /> {load} kg / {max} kg
      </div>
      <div className="h-2 rounded-full bg-[#E2E8F0] overflow-hidden">
        <div className={clsx('h-full', over ? 'bg-[#DC2626]' : 'bg-[#16A34A]')} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function StatusBadge({ run }) {
  const over = run.overageKg > 0
  const label = !run.isEditable ? 'Released'
    : over ? `${run.overageKg} kg over`
    : run.signedOff ? 'Signed off' : 'Needs sign-off'
  const tone = !run.isEditable ? 'bg-[#F1F5F9] text-[#475569]'
    : over ? 'bg-[#FEF2F2] text-[#B91C1C]'
    : run.signedOff ? 'bg-[#F0FDF4] text-[#166534]' : 'bg-[#FFFBEB] text-[#92400E]'
  return <span className={clsx('text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap', tone)}>{label}</span>
}

// ── UC14 overview panel: all runs, load against maximum ──────────────────────
function OverviewPanel({ runs, selectedId, onSelect }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {runs.map(run => (
        <button
          key={run.routeId}
          type="button"
          onClick={() => onSelect(run.routeId)}
          className={clsx(
            'card p-4 text-left space-y-3 transition',
            selectedId === run.routeId && 'ring-2 ring-[#0A3D91]'
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-[#0F172A]">{run.runLabel}</p>
              <p className="text-xs text-[#64748B]">{run.driverName} · {run.vehicleRegistration ?? 'No vehicle'}</p>
            </div>
            <StatusBadge run={run} />
          </div>
          <LoadBar load={run.loadKg} max={run.maxKg} over={run.overageKg > 0} />
        </button>
      ))}
    </div>
  )
}

// ── UC15: standby driver + vehicle, preview, confirm ─────────────────────────
function SplitPanel({ run, onDone }) {
  const [driverId, setDriverId] = useState('')
  const [vehicleId, setVehicleId] = useState('')
  const [notes, setNotes] = useState('')
  const [preview, setPreview] = useState(null)

  const { data: optionsRaw } = useQuery({
    queryKey: ['payload-split-options', run.routeId],
    queryFn: () => payloadApi.splitOptions(run.routeId),
  })
  const options = unwrap(optionsRaw) ?? { drivers: [], vehicles: [] }
  const body = { standbyDriverId: driverId, standbyVehicleId: vehicleId, notes }
  const ready = driverId && vehicleId

  const previewMutation = useMutation({
    mutationFn: () => payloadApi.splitPreview(run.routeId, body),
    onSuccess: res => setPreview(unwrap(res)),
  })
  const confirmMutation = useMutation({
    mutationFn: () => payloadApi.splitConfirm(run.routeId, body),
    onSuccess: () => { setPreview(null); onDone('Route split. Both manifests are finalised and ready for warehouse release.') },
  })
  const error = previewMutation.error || confirmMutation.error

  return (
    <div className="border border-[#E2E8F0] rounded-xl p-4 space-y-3">
      <p className="text-sm font-bold text-[#0F172A] flex items-center gap-1.5"><Scissors size={15} /> Split this run (UC15)</p>
      <div className="flex flex-wrap gap-2">
        <select className="input w-auto text-sm" value={driverId}
          onChange={e => { setDriverId(e.target.value); setPreview(null) }}>
          <option value="">Standby driver…</option>
          {options.drivers.map(d => <option key={d.driverId} value={d.driverId}>{d.name}</option>)}
        </select>
        <select className="input w-auto text-sm" value={vehicleId}
          onChange={e => { setVehicleId(e.target.value); setPreview(null) }}>
          <option value="">Standby vehicle…</option>
          {options.vehicles.map(v => <option key={v.vehicleId} value={v.vehicleId}>{v.registration} ({v.capacityKg} kg)</option>)}
        </select>
        <button className="btn-secondary text-sm" disabled={!ready || previewMutation.isPending}
          onClick={() => { previewMutation.reset(); previewMutation.mutate() }}>
          <Eye size={14} /> Preview split
        </button>
      </div>
      {options.drivers.length === 0 && <p className="text-xs text-[#64748B]">No standby drivers are available right now.</p>}

      {preview && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[preview.original, preview.standby].map(r => (
            <div key={r.runLabel} className="border border-[#E2E8F0] rounded-xl p-3 space-y-2">
              <p className="text-xs font-bold text-[#0F172A]">{r.runLabel} · {r.driverName} · {r.vehicleRegistration}</p>
              <LoadBar load={r.loadKg} max={r.maxKg} over={r.overageKg > 0} />
              <ul className="text-xs text-[#475569] space-y-0.5">
                {r.parcels.map(p => <li key={p.parcelId}><span className="font-mono">{p.trackingNumber}</span> · {p.weightKg} kg</li>)}
              </ul>
            </div>
          ))}
          <div className="md:col-span-2 space-y-2">
            <textarea className="input" rows={2} placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} />
            <button className="btn-primary text-sm" disabled={confirmMutation.isPending} onClick={() => confirmMutation.mutate()}>
              <CheckCircle2 size={14} /> {confirmMutation.isPending ? 'Finalising…' : 'Confirm split & finalise both manifests'}
            </button>
          </div>
        </div>
      )}
      {error && <Alert type="error" message={error.message} />}
    </div>
  )
}

// ── UC14 adjust + sign-off for the selected run ──────────────────────────────
function RunDetail({ run, otherRuns, onChanged }) {
  const [selected, setSelected] = useState([])
  const [targetId, setTargetId] = useState('')
  const [notes, setNotes] = useState('')
  const [message, setMessage] = useState('')

  const over = run.overageKg > 0
  const selectedKg = run.parcels.filter(p => selected.includes(p.parcelId)).reduce((s, p) => s + p.weightKg, 0)
  const target = otherRuns.find(r => r.routeId === targetId)
  const targetFree = target ? target.maxKg - target.loadKg : 0

  const done = text => { setSelected([]); setTargetId(''); setMessage(text); onChanged() }

  // toQueue = true returns the parcels to the dispatch queue; false moves them to the chosen run.
  const move = useMutation({
    mutationFn: toQueue => payloadApi.reallocate(run.routeId, {
      parcelIds: selected, targetRouteId: toQueue ? null : targetId, notes,
    }),
    onSuccess: (_res, toQueue) => done(toQueue
      ? 'Parcels returned to the dispatch queue.'
      : `Moved to ${target?.runLabel}. Sign-off on both runs was cleared.`),
  })
  const signOff = useMutation({
    mutationFn: () => payloadApi.signOff(run.routeId, { notes }),
    onSuccess: () => done('Manifest signed off. Warehouse staff can now release it for loading.'),
  })
  const cancel = useMutation({
    mutationFn: () => parcelApi.cancelRoute(run.routeId),
    onSuccess: () => done('Route plan cancelled. Parcels are back in the queue.'),
  })

  const busy = move.isPending || signOff.isPending || cancel.isPending
  const error = move.error || signOff.error || cancel.error
  const toggle = id => setSelected(s => (s.includes(id) ? s.filter(x => x !== id) : [...s, id]))

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-[#0F172A]">{run.runLabel} · {run.driverName}</p>
          <p className="text-xs text-[#64748B]">{run.vehicleRegistration ?? 'Vehicle'} · {run.parcels.length} parcel(s)</p>
        </div>
        <StatusBadge run={run} />
      </div>

      <LoadBar load={run.loadKg} max={run.maxKg} over={over} />

      <div className="divide-y divide-[#E2E8F0] border border-[#E2E8F0] rounded-xl">
        {run.parcels.map(p => (
          <label key={p.parcelId} className="flex items-center gap-3 px-3 py-2.5 text-sm cursor-pointer">
            <input type="checkbox" checked={selected.includes(p.parcelId)} onChange={() => toggle(p.parcelId)} />
            <span className="font-mono text-xs">{p.trackingNumber}</span>
            <span className="text-[#64748B] truncate">{p.recipient}, {p.city}</span>
            <span className="ml-auto font-semibold">{p.weightKg} kg</span>
          </label>
        ))}
      </div>

      <textarea className="input" rows={2} placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} />

      {message && <Alert type="success" message={message} />}
      {error && <Alert type="error" message={error.message} />}

      <div className="flex flex-wrap items-center gap-2">
        <select className="input w-auto text-sm" value={targetId} onChange={e => setTargetId(e.target.value)}>
          <option value="">Move to another run…</option>
          {otherRuns.map(r => (
            <option key={r.routeId} value={r.routeId}>{r.runLabel} ({Math.max(0, r.maxKg - r.loadKg)} kg free)</option>
          ))}
        </select>
        <button className="btn-secondary text-sm"
          disabled={busy || !targetId || selected.length === 0 || selectedKg > targetFree}
          onClick={() => { setMessage(''); move.mutate(false) }}>
          <ArrowRightLeft size={14} /> Move selected ({selected.length})
        </button>
        {targetId && selectedKg > targetFree && (
          <span className="text-xs text-[#B91C1C]">{selectedKg} kg is more than {target?.runLabel} can take ({targetFree} kg free).</span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary text-sm" disabled={busy || selected.length === 0}
          onClick={() => { setMessage(''); move.mutate(true) }}>
          <Trash2 size={14} /> Return selected to queue
        </button>
        <button className="btn-secondary text-sm" disabled={busy}
          onClick={() => { if (window.confirm('Cancel this route plan?')) { setMessage(''); cancel.mutate() } }}>
          <XCircle size={14} /> Cancel plan
        </button>
        <button className="btn-primary text-sm" disabled={busy || over || run.signedOff}
          onClick={() => { setMessage(''); signOff.mutate() }}>
          <ClipboardCheck size={14} /> {run.signedOff ? 'Signed off' : 'Confirm and sign off'}
        </button>
      </div>
      {over && <p className="text-xs text-[#B91C1C]">Over the vehicle limit by {run.overageKg} kg. Move parcels, return them to the queue, or split the run before signing off.</p>}

      {over && <SplitPanel run={run} onDone={done} />}
    </div>
  )
}

export default function PayloadReviewPage() {
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState(null)

  const { data, isLoading } = useQuery({
    queryKey: ['payload-overview'],
    queryFn: () => payloadApi.overview(),
    refetchInterval: 30000,
  })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['payload-overview'] })
    qc.invalidateQueries({ queryKey: ['payload-split-options'] })
    qc.invalidateQueries({ queryKey: ['routes-ready-for-release'] })
    qc.invalidateQueries({ queryKey: ['dispatcher-ready-queue'] })
    qc.invalidateQueries({ queryKey: ['dispatcher-available-drivers'] })
  }

  const runs = unwrap(data)?.runs ?? []
  const selected = runs.find(r => r.routeId === selectedId && r.isEditable)
  const otherRuns = runs.filter(r => r.isEditable && r.routeId !== selectedId)

  return (
    <AppShell title="Payload Review">
      <div className="page-header">
        <div>
          <h1 className="page-title">Payload Review</h1>
          <p className="page-subtitle">Check each run's load against its vehicle, fix overloads, and sign off the manifest. Warehouse staff can only release signed-off runs.</p>
        </div>
      </div>

      {isLoading ? <PageLoader /> : runs.length === 0 ? (
        <EmptyState title="No runs today" description="Routes you plan from the Dispatch Queue appear here." />
      ) : (
        <div className="space-y-6">
          <OverviewPanel runs={runs} selectedId={selectedId} onSelect={setSelectedId} />
          {selected
            ? <RunDetail key={selected.routeId} run={selected} otherRuns={otherRuns} onChanged={refresh} />
            : <p className="text-sm text-[#64748B]">Select a run above to adjust or sign off its manifest.</p>}
        </div>
      )}
    </AppShell>
  )
}
