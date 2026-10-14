import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { EmptyState, PageLoader, Alert, StatCard } from '@/components/ui'
import { parcelApi, payloadApi } from '@/api'
import {
  Weight, Trash2, XCircle, ArrowRightLeft, ClipboardCheck, Eye, CheckCircle2, ChevronDown, ChevronRight,
  Search, Truck, AlertTriangle, Gauge, Wand2, Check, CircleAlert,
} from 'lucide-react'
import clsx from 'clsx'

// UC14 Validate and Adjust Vehicle Payload / UC15 Split Overloaded Routes.
//
// Layout: summary numbers on top. Runs are listed on the left, grouped by what needs doing
// and filterable. The selected run opens on the right as three clearly labelled steps:
//   1. Review the parcels   2. Adjust the load (move, return or split)   3. Sign off
// A "next step" message at the top of the run always says what to do now.
// Cancel plan sits apart at the bottom.

const unwrap = r => (r && r.data !== undefined ? r.data : r)
const isMaster = p => String(p.trackingNumber || '').toUpperCase().startsWith('MST-')

function LoadBar({ load, max, over, showPct = true }) {
  const pct = max > 0 ? Math.min(100, Math.round((load / max) * 100)) : 0
  const tone = over ? 'bg-[#DC2626]' : pct >= 90 ? 'bg-[#F59E0B]' : 'bg-[#16A34A]'
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-xs font-semibold text-[#334155] mb-1">
        <span className="flex items-center gap-1.5"><Weight size={13} /> {load} kg / {max} kg</span>
        {showPct && <span className={clsx(over ? 'text-[#B91C1C]' : 'text-[#64748B]')}>{max > 0 ? Math.round((load / max) * 100) : 0}% full</span>}
      </div>
      <div className="h-2 rounded-full bg-[#E2E8F0] overflow-hidden">
        <div className={clsx('h-full transition-all', tone)} style={{ width: `${pct}%` }} />
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

// ── Run list, grouped by what needs doing ────────────────────────────────────
const GROUPS = [
  { key: 'attention', title: 'Overloaded', match: r => r.isEditable && r.overageKg > 0 },
  { key: 'pending', title: 'Needs sign-off', match: r => r.isEditable && r.overageKg <= 0 && !r.signedOff },
  { key: 'signed', title: 'Signed off', match: r => r.isEditable && r.overageKg <= 0 && r.signedOff },
  { key: 'released', title: 'Released', match: r => !r.isEditable },
]
const FILTERS = [{ key: 'all', title: 'All' }, ...GROUPS.map(g => ({ key: g.key, title: g.title }))]

function RunRow({ run, active, onSelect }) {
  const clickable = run.isEditable
  return (
    <button type="button" disabled={!clickable} onClick={() => onSelect(run.routeId)}
      className={clsx('card w-full p-3 text-left space-y-2 transition', active && 'ring-2 ring-[#0A3D91]', !clickable && 'opacity-60 cursor-default')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-[#0F172A]">{run.runLabel}</p>
          <p className="text-xs text-[#64748B] truncate">{run.driverName}, {run.vehicleRegistration ?? 'No vehicle'}</p>
        </div>
        <StatusBadge run={run} />
      </div>
      <LoadBar load={run.loadKg} max={run.maxKg} over={run.overageKg > 0} showPct={false} />
    </button>
  )
}

function RunList({ runs, selectedId, onSelect }) {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [showReleased, setShowReleased] = useState(false)

  const q = search.trim().toLowerCase()
  const shown = runs
    .filter(r => filter === 'all' || GROUPS.find(g => g.key === filter).match(r))
    .filter(r => !q || [r.runLabel, r.driverName, r.vehicleRegistration].some(v => String(v ?? '').toLowerCase().includes(q)))

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
        <input className="input pl-9 text-sm" placeholder="Find a run, driver or vehicle…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={clsx('px-3 py-1 rounded-full text-xs font-semibold border',
              filter === f.key ? 'bg-[#0A3D91] text-white border-[#0A3D91]' : 'bg-white text-[#334155] border-[#CBD5E1]')}>{f.title}</button>
        ))}
      </div>

      {shown.length === 0 && <p className="text-xs text-[#64748B]">No runs match.</p>}

      {GROUPS.map(g => {
        const items = shown.filter(g.match)
        if (items.length === 0) return null
        const collapsed = g.key === 'released' && filter !== 'released' && !showReleased
        return (
          <section key={g.key} className="space-y-2">
            {g.key === 'released' && filter !== 'released' ? (
              <button type="button" className="flex items-center gap-1 text-sm font-bold text-[#475569]" onClick={() => setShowReleased(v => !v)}>
                {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />} {g.title} ({items.length})
              </button>
            ) : (
              <h2 className={clsx('text-sm font-bold', g.key === 'attention' ? 'text-[#B91C1C]' : 'text-[#0F172A]')}>{g.title} ({items.length})</h2>
            )}
            {!collapsed && (
              <div className="space-y-2">
                {items.map(run => <RunRow key={run.routeId} run={run} active={selectedId === run.routeId} onSelect={onSelect} />)}
              </div>
            )}
          </section>
        )
      })}
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
    <div className="space-y-3">
      <p className="text-xs text-[#64748B]">
        Share the parcels between this vehicle and a standby vehicle with its own driver. Needs more than one parcel.
      </p>
      <div className="flex flex-wrap gap-2">
        <select className="input w-auto text-sm" value={driverId} onChange={e => { setDriverId(e.target.value); setPreview(null) }}>
          <option value="">Standby driver…</option>
          {options.drivers.map(d => <option key={d.driverId} value={d.driverId}>{d.name}{d.status === 'OffDuty' ? ' (off duty, call in)' : ''}</option>)}
        </select>
        <select className="input w-auto text-sm" value={vehicleId} onChange={e => { setVehicleId(e.target.value); setPreview(null) }}>
          <option value="">Standby vehicle…</option>
          {options.vehicles.map(v => <option key={v.vehicleId} value={v.vehicleId}>{v.registration} ({v.capacityKg} kg)</option>)}
        </select>
        <button className="btn-secondary text-sm" disabled={!ready || previewMutation.isPending}
          onClick={() => { previewMutation.reset(); previewMutation.mutate() }}>
          <Eye size={14} /> Preview split
        </button>
      </div>
      {options.drivers.length === 0 && <p className="text-xs text-[#64748B]">No standby drivers are available right now. Every other driver is suspended, on a delivery, or already on another run.</p>}

      {preview && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[preview.original, preview.standby].map(r => (
            <div key={r.runLabel} className="border border-[#E2E8F0] rounded-xl p-3 space-y-2">
              <p className="text-xs font-bold text-[#0F172A]">{r.runLabel}, {r.driverName}, {r.vehicleRegistration}</p>
              <LoadBar load={r.loadKg} max={r.maxKg} over={r.overageKg > 0} />
              <ul className="text-xs text-[#475569] space-y-0.5">
                {r.parcels.map(p => <li key={p.parcelId}><span className="font-mono">{p.trackingNumber}</span>{isMaster(p) ? ' (master box)' : ''} · {p.weightKg} kg</li>)}
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

// ── Detail panel: next step, then the three steps ────────────────────────────
function Check_({ ok, warn, children }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {ok ? <Check size={16} className="text-[#16A34A] mt-0.5 shrink-0" /> : <CircleAlert size={16} className={clsx('mt-0.5 shrink-0', warn ? 'text-[#F59E0B]' : 'text-[#DC2626]')} />}
      <span className={clsx(!ok && !warn && 'text-[#B91C1C]')}>{children}</span>
    </li>
  )
}

function RunDetail({ run, otherRuns, onChanged }) {
  const [step, setStep] = useState('review')
  const [mode, setMode] = useState('move')
  const [selected, setSelected] = useState([])
  const [heaviestFirst, setHeaviestFirst] = useState(false)
  const [targetId, setTargetId] = useState('')
  const [notes, setNotes] = useState('')
  const [reviewed, setReviewed] = useState(!!run.signedOff)
  const [message, setMessage] = useState('')

  const over = run.overageKg > 0
  const selectedKg = run.parcels.filter(p => selected.includes(p.parcelId)).reduce((s, p) => s + p.weightKg, 0)
  const target = otherRuns.find(r => r.routeId === targetId)
  const targetFree = target ? target.maxKg - target.loadKg : 0
  const tooHeavy = !!targetId && selectedKg > targetFree
  const afterKg = run.loadKg - selectedKg
  const parcels = heaviestFirst ? [...run.parcels].sort((a, b) => b.weightKg - a.weightKg) : run.parcels

  const done = text => { setSelected([]); setTargetId(''); setMessage(text); onChanged() }

  // toQueue = true returns the parcels to the dispatch queue; false moves them to the chosen run.
  const move = useMutation({
    mutationFn: toQueue => payloadApi.reallocate(run.routeId, { parcelIds: selected, targetRouteId: toQueue ? null : targetId, notes }),
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

  // Pick the lightest single parcel that clears the overload, otherwise the heaviest ones until it does.
  const suggest = () => {
    const single = [...run.parcels].sort((a, b) => a.weightKg - b.weightKg).find(p => p.weightKg >= run.overageKg)
    if (single) return setSelected([single.parcelId])
    const ids = []
    let acc = 0
    for (const p of [...run.parcels].sort((a, b) => b.weightKg - a.weightKg)) {
      if (acc >= run.overageKg) break
      ids.push(p.parcelId); acc += p.weightKg
    }
    setSelected(ids)
  }

  const next = over
    ? { tone: 'bg-[#FEF2F2] border-[#FECACA] text-[#991B1B]', text: `Over the limit by ${run.overageKg} kg. Go to step 2 and move parcels, return them to the queue, or split the run.`, go: 'adjust', cta: 'Adjust the load' }
    : run.signedOff
      ? { tone: 'bg-[#F0FDF4] border-[#BBF7D0] text-[#166534]', text: 'This run is signed off. Warehouse staff can release it for loading.', go: null }
      : { tone: 'bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]', text: 'The load is within the limit. Check the parcels, then sign off in step 3.', go: 'signoff', cta: 'Go to sign-off' }

  const STEPS = [
    { key: 'review', n: 1, title: 'Review parcels', complete: reviewed },
    { key: 'adjust', n: 2, title: 'Adjust load', complete: !over },
    { key: 'signoff', n: 3, title: 'Sign off', complete: run.signedOff },
  ]
  const canSign = !over && reviewed && !run.signedOff

  return (
    <div className="card p-5 space-y-4">
      {/* Header: which run, how full */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-bold text-[#0F172A]">{run.runLabel}, {run.driverName}</p>
            <p className="text-xs text-[#64748B]">{run.vehicleRegistration ?? 'No vehicle'} · {run.parcels.length} parcel(s)</p>
          </div>
          <StatusBadge run={run} />
        </div>
        <LoadBar load={run.loadKg} max={run.maxKg} over={over} />
      </div>

      {/* What to do now */}
      <div className={clsx('rounded-xl border px-3.5 py-2.5 text-sm flex flex-wrap items-center justify-between gap-2', next.tone)}>
        <span><b>Next step:</b> {next.text}</span>
        {next.go && <button className="btn-secondary btn-sm" onClick={() => setStep(next.go)}>{next.cta}</button>}
      </div>

      {message && <Alert type="success" message={message} />}
      {error && <Alert type="error" message={error.message} />}

      {/* Step switcher */}
      <div role="tablist" className="grid grid-cols-3 gap-2">
        {STEPS.map(s => (
          <button key={s.key} role="tab" aria-selected={step === s.key} onClick={() => setStep(s.key)}
            className={clsx('flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-bold transition',
              step === s.key ? 'border-[#0A3D91] bg-[#F6FAFF] text-[#0A3D91]' : 'border-[#E2E8F0] text-[#475569] hover:border-[#1E63E9]')}>
            <span className={clsx('w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-[11px]',
              s.complete ? 'bg-[#16A34A] text-white' : step === s.key ? 'bg-[#0A3D91] text-white' : 'bg-[#E2E8F0] text-[#475569]')}>
              {s.complete ? <Check size={12} /> : s.n}
            </span>
            {s.title}
          </button>
        ))}
      </div>

      {/* Step 1 */}
      {step === 'review' && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-[#64748B]">Tick parcels to move or return them in step 2. The bar shows each parcel's share of the load.</p>
            <div className="flex gap-2">
              {over && <button className="btn-secondary btn-sm" onClick={suggest}><Wand2 size={13} /> Suggest what to move</button>}
              <button className="btn-secondary btn-sm" onClick={() => setHeaviestFirst(v => !v)}>{heaviestFirst ? 'Original order' : 'Heaviest first'}</button>
            </div>
          </div>
          <div className="divide-y divide-[#E2E8F0] border border-[#E2E8F0] rounded-xl">
            {parcels.map(p => {
              const share = run.loadKg > 0 ? Math.round((p.weightKg / run.loadKg) * 100) : 0
              return (
                <label key={p.parcelId} className="block px-3 py-2.5 text-sm cursor-pointer space-y-1.5">
                  <span className="flex items-center gap-3">
                    <input type="checkbox" checked={selected.includes(p.parcelId)} onChange={() => toggle(p.parcelId)} />
                    <span className="font-mono text-xs">{p.trackingNumber}</span>
                    {isMaster(p) && <span className="text-[10px] font-bold uppercase bg-[#EDE9FE] text-[#6D28D9] px-1.5 py-0.5 rounded">Master box</span>}
                    <span className="text-[#64748B] truncate">{p.recipient}, {p.city}</span>
                    <span className="ml-auto font-semibold whitespace-nowrap">{p.weightKg} kg <span className="text-[11px] font-normal text-[#64748B]">({share}%)</span></span>
                  </span>
                  <span className="block h-1 rounded-full bg-[#E2E8F0] overflow-hidden ml-7"><span className="block h-full bg-[#1E63E9]" style={{ width: `${share}%` }} /></span>
                </label>
              )
            })}
          </div>
          <p className="text-xs text-[#64748B]">{selected.length === 0 ? 'No parcels selected.' : `${selected.length} selected · ${selectedKg} kg`}</p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={reviewed} onChange={e => setReviewed(e.target.checked)} />
            I have checked these parcels and their weights
          </label>
        </section>
      )}

      {/* Step 2 */}
      {step === 'adjust' && (
        <section className="space-y-3">
          {over && (
            <div role="tablist" className="inline-flex rounded-xl border border-[#D8E4F5] bg-white p-1">
              {[['move', 'Move or return parcels'], ['split', 'Split the run']].map(([k, label]) => (
                <button key={k} role="tab" aria-selected={mode === k} onClick={() => setMode(k)}
                  className={clsx('px-3 py-1.5 rounded-lg text-xs font-bold', mode === k ? 'bg-[#0A3D91] text-white' : 'text-[#475569] hover:bg-[#F1F5F9]')}>{label}</button>
              ))}
            </div>
          )}

          {(mode === 'move' || !over) ? (
            <div className="space-y-3">
              <p className="text-xs text-[#64748B]">{selected.length === 0 ? 'Select parcels in step 1 first.' : `${selected.length} selected · ${selectedKg} kg`}</p>

              {selected.length > 0 && (
                <div className="rounded-xl border border-[#E2E8F0] p-3 space-y-1.5">
                  <p className="text-xs font-bold text-[#0F172A]">This run after removing them</p>
                  <LoadBar load={afterKg} max={run.maxKg} over={afterKg > run.maxKg} />
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <select className="input w-auto text-sm" value={targetId} onChange={e => setTargetId(e.target.value)}>
                  <option value="">Move to another run…</option>
                  {otherRuns.map(r => <option key={r.routeId} value={r.routeId}>{r.runLabel} ({Math.max(0, r.maxKg - r.loadKg)} kg free)</option>)}
                </select>
                <button className="btn-secondary text-sm" disabled={busy || !targetId || selected.length === 0 || tooHeavy}
                  onClick={() => { setMessage(''); move.mutate(false) }}>
                  <ArrowRightLeft size={14} /> Move selected
                </button>
              </div>
              {target && selected.length > 0 && !tooHeavy && (
                <p className="text-xs text-[#475569]">{target.runLabel} would carry {target.loadKg + selectedKg} kg of {target.maxKg} kg.</p>
              )}
              {tooHeavy && <p className="text-xs text-[#B91C1C]">{selectedKg} kg is more than {target?.runLabel} can take ({targetFree} kg free).</p>}
              <button className="btn-secondary text-sm" disabled={busy || selected.length === 0} onClick={() => { setMessage(''); move.mutate(true) }}>
                <Trash2 size={14} /> Return selected to queue
              </button>
            </div>
          ) : (
            <SplitPanel run={run} onDone={text => { done(text); setStep('review') }} />
          )}
        </section>
      )}

      {/* Step 3 */}
      {step === 'signoff' && (
        <section className="space-y-3">
          <ul className="space-y-1.5 rounded-xl border border-[#E2E8F0] p-3">
            <Check_ ok={!over}>Load is within the vehicle limit{over ? ` (${run.overageKg} kg over)` : ''}</Check_>
            <Check_ ok={reviewed}>Parcels and weights checked{!reviewed && ' (tick the box in step 1)'}</Check_>
            <Check_ ok={!!run.vehicleRegistration && !!run.driverName} warn>Driver and vehicle assigned{!run.vehicleRegistration && ' (no vehicle yet)'}</Check_>
          </ul>
          <textarea className="input" rows={2} placeholder="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} />
          <p className="text-xs text-[#64748B]">
            {over ? 'Fix the overload in step 2 before you can sign off.' : run.signedOff ? 'This run is already signed off.' : 'Signing off lets warehouse staff release this run for loading.'}
          </p>
          <button className="btn-primary text-sm" disabled={busy || !canSign} onClick={() => { setMessage(''); signOff.mutate() }}>
            <ClipboardCheck size={14} /> {run.signedOff ? 'Signed off' : 'Confirm and sign off'}
          </button>
        </section>
      )}

      {/* Destructive action kept apart */}
      <div className="border-t border-[#E2E8F0] pt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[#64748B]">Drop this run entirely. All its parcels go back to the dispatch queue.</p>
        <button className="btn-secondary text-sm text-[#B91C1C] whitespace-nowrap" disabled={busy}
          onClick={() => { if (window.confirm('Cancel this route plan?')) { setMessage(''); cancel.mutate() } }}>
          <XCircle size={14} /> Cancel plan
        </button>
      </div>
    </div>
  )
}

export default function PayloadReviewPage() {
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState(null)

  const { data, isLoading } = useQuery({ queryKey: ['payload-overview'], queryFn: () => payloadApi.overview(), refetchInterval: 30000 })

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

  const open = runs.filter(r => r.isEditable)
  const overloaded = open.filter(r => r.overageKg > 0).length
  const needSign = open.filter(r => r.overageKg <= 0 && !r.signedOff).length
  const totalLoad = open.reduce((s, r) => s + r.loadKg, 0)
  const totalCap = open.reduce((s, r) => s + r.maxKg, 0)
  const fleetPct = totalCap > 0 ? Math.round((totalLoad / totalCap) * 100) : 0

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
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard label="Active runs" value={open.length} icon={Truck} color="bg-[#0A3D91]" sub={`${runs.length - open.length} already released`} />
            <StatCard label="Overloaded" value={overloaded} icon={AlertTriangle} color={overloaded ? 'bg-[#DC2626]' : 'bg-[#16A34A]'} sub={overloaded ? 'Fix these first' : 'All within limits'} />
            <StatCard label="Need sign-off" value={needSign} icon={ClipboardCheck} color={needSign ? 'bg-[#F59E0B]' : 'bg-[#64748B]'} sub="Within limit, not signed" />
            <StatCard label="Fleet load" value={`${fleetPct}%`} icon={Gauge} color="bg-[#1E63E9]" sub={`${totalLoad} kg of ${totalCap} kg`} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-6 items-start">
            <RunList runs={runs} selectedId={selectedId} onSelect={setSelectedId} />
            <div className="xl:sticky xl:top-4">
              {selected
                ? <RunDetail key={selected.routeId} run={selected} otherRuns={otherRuns} onChanged={refresh} />
                : <div className="card p-8 text-center text-sm text-[#64748B]">Select a run to review its parcels and sign off its manifest.</div>}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}
