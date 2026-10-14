import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { EmptyState, PageLoader, Alert, StatCard } from '@/components/ui'
import { parcelApi, payloadApi } from '@/api'
import {
  Weight, Trash2, XCircle, ArrowRightLeft, ClipboardCheck, Eye, CheckCircle2,
  Search, Truck, AlertTriangle, Gauge, Check, CircleAlert, ArrowRight, SplitSquareHorizontal,
  ArrowLeft // Added ArrowLeft
} from 'lucide-react'
import clsx from 'clsx'

const unwrap = r => (r && r.data !== undefined ? r.data : r)
const isMaster = p => String(p.trackingNumber || '').toUpperCase().startsWith('MST-')

// ── Shared UI Components ─────────────────────────────────────────────────────

function LoadBar({ load, max, over }) {
  const pct = max > 0 ? Math.min(100, Math.round((load / max) * 100)) : 0
  const tone = over ? 'bg-red-500' : pct >= 90 ? 'bg-amber-500' : 'bg-blue-600'
  return (
    <div className="w-full">
      <div className="flex justify-between text-sm font-medium text-slate-600 mb-1.5">
        <span className="flex items-center gap-1.5">
          <Weight size={16} className={over ? "text-red-500" : "text-slate-400"} /> 
          {load} kg / {max} kg
        </span>
        <span className={over ? 'text-red-600 font-bold' : 'text-slate-500'}>{pct}% Full</span>
      </div>
      <div className="h-3 rounded-full bg-slate-200 overflow-hidden">
        <div className={clsx('h-full transition-all', tone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function StatusBadge({ run }) {
  const over = run.overageKg > 0
  const state = !run.isEditable ? 'Released'
    : over ? `${run.overageKg} kg over limit`
    : run.signedOff ? 'Signed Off' : 'Needs Sign-off'
  const styles = !run.isEditable ? 'bg-slate-100 text-slate-600'
    : over ? 'bg-red-100 text-red-700'
    : run.signedOff ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'
  return <span className={clsx('text-xs font-bold px-3 py-1 rounded-full', styles)}>{state}</span>
}

// ── Dashboard: Grid of all Runs ──────────────────────────────────────────────

function RunList({ runs, onSelect }) {
  const [search, setSearch] = useState('')

  const shown = useMemo(() => {
    const q = search.toLowerCase()
    return runs.filter(r => !q || [r.runLabel, r.driverName, r.vehicleRegistration].some(v => String(v ?? '').toLowerCase().includes(q)))
  }, [runs, search])

  return (
    <div className="space-y-6">
      <div className="relative max-w-md">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input 
          className="input pl-10 w-full bg-white border-slate-200 shadow-sm" 
          placeholder="Search runs, drivers, or vehicles..." 
          value={search} onChange={e => setSearch(e.target.value)} 
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {shown.map(run => (
          <button key={run.routeId} type="button" disabled={!run.isEditable} onClick={() => onSelect(run.routeId)}
            className={clsx('w-full p-5 text-left border rounded-xl bg-white shadow-sm transition hover:shadow-md hover:border-blue-300 flex flex-col h-full', 
              !run.isEditable && 'opacity-60 cursor-not-allowed')}>
            <div className="flex justify-between items-start mb-4 gap-4">
              <div className="min-w-0">
                <p className="font-bold text-slate-900 text-lg truncate">{run.runLabel}</p>
                <p className="text-sm text-slate-500 truncate mt-0.5">{run.driverName || 'Unassigned'}</p>
              </div>
              <StatusBadge run={run} />
            </div>
            <div className="mt-auto pt-2">
              <LoadBar load={run.loadKg} max={run.maxKg} over={run.overageKg > 0} />
            </div>
          </button>
        ))}
      </div>
      {shown.length === 0 && (
        <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-300">
          <p className="text-slate-500">No runs found matching "{search}".</p>
        </div>
      )}
    </div>
  )
}

// ── Main Panel: Focused Step-by-Step Detail ──────────────────────────────────

function RunDetail({ run, otherRuns, onChanged }) {
  const [step, setStep] = useState(1)
  const [reviewed, setReviewed] = useState(!!run.signedOff)
  const over = run.overageKg > 0

  useEffect(() => { 
    setStep(1); setReviewed(!!run.signedOff); 
  }, [run.routeId])

  const [adjustMode, setAdjustMode] = useState('move')
  const [selected, setSelected] = useState([])
  const [targetId, setTargetId] = useState('')
  const [notes, setNotes] = useState('')

  const done = () => { setSelected([]); setTargetId(''); onChanged(); }

  const move = useMutation({
    mutationFn: toQueue => payloadApi.reallocate(run.routeId, { parcelIds: selected, targetRouteId: toQueue ? null : targetId }),
    onSuccess: done,
  })
  
  const signOff = useMutation({
    mutationFn: () => payloadApi.signOff(run.routeId, { notes }),
    onSuccess: done,
  })

  const selectedKg = run.parcels.filter(p => selected.includes(p.parcelId)).reduce((s, p) => s + p.weightKg, 0)
  const target = otherRuns.find(r => r.routeId === targetId)
  const tooHeavy = !!targetId && selectedKg > (target ? target.maxKg - target.loadKg : 0)

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      
      {/* HEADER */}
      <div className="p-6 border-b border-slate-200 bg-slate-50">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
          <div>
            <h2 className="text-3xl font-bold text-slate-900 mb-2">{run.runLabel}</h2>
            <p className="text-slate-500 text-lg flex items-center gap-2">
              <Truck size={20} /> {run.vehicleRegistration ?? 'No Vehicle'} · {run.driverName ?? 'No Driver'}
            </p>
          </div>
          <StatusBadge run={run} />
        </div>
        <LoadBar load={run.loadKg} max={run.maxKg} over={over} />
      </div>

      {/* WIZARD TRACKER */}
      <div className="flex bg-white border-b border-slate-200">
        {[
          { num: 1, label: 'Review Parcels', active: step === 1, complete: reviewed },
          { num: 2, label: 'Adjust Load', active: step === 2, complete: !over },
          { num: 3, label: 'Sign Off', active: step === 3, complete: run.signedOff }
        ].map((s) => (
          <div key={s.num} onClick={() => setStep(s.num)} className={clsx(
            "flex-1 p-5 flex items-center justify-center gap-3 border-b-2 cursor-pointer transition",
            s.active ? "border-blue-600 bg-blue-50/30" : "border-transparent text-slate-500 hover:bg-slate-50"
          )}>
            <div className={clsx("w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
              s.complete ? "bg-green-100 text-green-700" : s.active ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-600")}>
              {s.complete ? <Check size={18} /> : s.num}
            </div>
            <span className={clsx("font-semibold", s.active ? "text-blue-700" : "text-slate-600")}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* BODY */}
      <div className="p-6 md:p-10">
        
        {/* === STEP 1: REVIEW === */}
        {step === 1 && (
          <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in">
            <div className="text-center mb-8">
              <h3 className="text-xl font-bold text-slate-800">Review Route Parcels</h3>
              <p className="text-slate-500 mt-1">Please verify the {run.parcels.length} parcels assigned to this vehicle below.</p>
            </div>

            <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 shadow-sm">
              {run.parcels.map(p => (
                <div key={p.parcelId} className="flex justify-between items-center p-4 bg-white hover:bg-slate-50 transition">
                  <div>
                    <p className="font-mono font-bold text-slate-700 text-lg">{p.trackingNumber}</p>
                    <p className="text-slate-500">{p.recipient}, {p.city}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-slate-900 text-lg">{p.weightKg} kg</p>
                    {isMaster(p) && <span className="text-[10px] font-bold uppercase bg-purple-100 text-purple-700 px-2 py-1 rounded mt-1 inline-block">Master Box</span>}
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-blue-50 p-6 rounded-xl border border-blue-100 flex flex-col items-center gap-6 mt-8">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" className="w-6 h-6 text-blue-600 rounded border-blue-300" 
                  checked={reviewed} onChange={e => setReviewed(e.target.checked)} />
                <span className="font-semibold text-blue-900 text-lg">I have reviewed and verified these parcels</span>
              </label>
              <button className="btn-primary w-full max-w-md py-3 text-lg flex justify-center items-center gap-2" onClick={() => setStep(over ? 2 : 3)}>
                {over ? 'Proceed to Adjust Load' : 'Proceed to Sign Off'} <ArrowRight size={20} />
              </button>
            </div>
          </div>
        )}

        {/* === STEP 2: ADJUST === */}
        {step === 2 && (
          <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in">
            {!over ? (
              <div className="text-center py-16">
                <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                   <CheckCircle2 size={48} className="text-green-600" />
                </div>
                <h3 className="text-2xl font-bold text-slate-800 mb-2">Load is within limits</h3>
                <p className="text-slate-500 text-lg mb-8">No capacity adjustments are necessary. You can proceed to sign-off.</p>
                <button className="btn-primary py-3 px-8 text-lg" onClick={() => setStep(3)}>Go to Sign Off</button>
              </div>
            ) : (
              <>
                <div className="bg-red-50 text-red-800 p-6 rounded-xl flex items-center justify-between border border-red-200">
                  <div className="flex items-center gap-4">
                    <AlertTriangle size={32} className="text-red-600" />
                    <div>
                      <p className="font-bold text-xl">Vehicle Overloaded</p>
                      <p className="text-red-600 mt-1">You are <b>{run.overageKg} kg</b> over capacity. Choose an action below to resolve this.</p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 p-1.5 bg-slate-100 rounded-xl">
                  <button onClick={() => setAdjustMode('move')} className={clsx("flex-1 py-3 font-bold text-base rounded-lg transition", adjustMode === 'move' ? "bg-white shadow text-slate-800" : "text-slate-500 hover:text-slate-700")}>Move Specific Parcels</button>
                  <button onClick={() => setAdjustMode('split')} className={clsx("flex-1 py-3 font-bold text-base rounded-lg transition", adjustMode === 'split' ? "bg-white shadow text-slate-800" : "text-slate-500 hover:text-slate-700")}>Split Route into Two Vehicles</button>
                </div>

                {adjustMode === 'move' ? (
                  <div className="border border-slate-200 p-6 rounded-xl bg-white shadow-sm">
                    <p className="font-semibold text-slate-700 mb-4 text-lg">Select parcels to remove from this vehicle:</p>
                    <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-xl mb-6">
                      {run.parcels.map(p => (
                        <label key={p.parcelId} className="flex justify-between items-center p-4 border-b border-slate-100 hover:bg-blue-50/50 cursor-pointer transition">
                          <div className="flex items-center gap-4">
                            <input type="checkbox" className="w-5 h-5 text-blue-600 rounded border-slate-300" checked={selected.includes(p.parcelId)} onChange={() => {
                              setSelected(s => s.includes(p.parcelId) ? s.filter(x => x !== p.parcelId) : [...s, p.parcelId])
                            }} />
                            <span className="font-mono font-medium text-slate-800 text-lg">{p.trackingNumber}</span>
                          </div>
                          <span className="font-bold text-slate-900 text-lg">{p.weightKg} kg</span>
                        </label>
                      ))}
                    </div>

                    <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 flex flex-col gap-5">
                      <p className="font-bold text-slate-800">Action for {selected.length} selected parcels ({selectedKg} kg):</p>
                      <div className="flex flex-col sm:flex-row gap-3">
                        <select className="input flex-1 py-3 bg-white" value={targetId} onChange={e => setTargetId(e.target.value)}>
                          <option value="">Move to another route...</option>
                          {otherRuns.map(r => <option key={r.routeId} value={r.routeId}>{r.runLabel} ({Math.max(0, r.maxKg - r.loadKg)} kg free)</option>)}
                        </select>
                        <button className="btn-primary py-3 px-8 whitespace-nowrap" disabled={!targetId || selected.length === 0 || tooHeavy || move.isPending} onClick={() => move.mutate(false)}>
                           Move Parcels
                        </button>
                      </div>
                      {tooHeavy && <p className="text-sm font-medium text-red-600">Selected parcels exceed the target vehicle's free capacity.</p>}
                      
                      <div className="relative py-2">
                        <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-300"></div></div>
                        <div className="relative flex justify-center"><span className="bg-slate-50 px-4 text-sm font-bold text-slate-400 uppercase">Or</span></div>
                      </div>

                      <button className="btn-secondary w-full py-3 text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300" disabled={selected.length === 0 || move.isPending} onClick={() => move.mutate(true)}>
                        <Trash2 size={18} className="mr-2 inline" /> Return Selected Parcels to Dispatch Queue
                      </button>
                    </div>
                  </div>
                ) : (
                  <SplitPanel run={run} onDone={done} />
                )}
              </>
            )}
          </div>
        )}

        {/* === STEP 3: SIGN OFF === */}
        {step === 3 && (
          <div className="space-y-6 max-w-2xl mx-auto animate-in fade-in">
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold text-slate-800">Final Verification</h3>
              <p className="text-slate-500 mt-2 text-lg">Review the checklist before signing off the manifest.</p>
            </div>

            <ul className="bg-white border border-slate-200 rounded-xl p-8 space-y-6 shadow-sm">
              <li className="flex items-center gap-4">
                {reviewed ? <CheckCircle2 size={28} className="text-green-500" /> : <CircleAlert size={28} className="text-red-500" />}
                <span className={clsx("text-xl font-medium", reviewed ? "text-slate-800" : "text-red-600 font-bold")}>Parcels have been reviewed</span>
              </li>
              <li className="flex items-center gap-4">
                {!over ? <CheckCircle2 size={28} className="text-green-500" /> : <CircleAlert size={28} className="text-red-500" />}
                <span className={clsx("text-xl font-medium", !over ? "text-slate-800" : "text-red-600 font-bold")}>Load is within vehicle capacity</span>
              </li>
              <li className="flex items-center gap-4">
                {run.driverName ? <CheckCircle2 size={28} className="text-green-500" /> : <CircleAlert size={28} className="text-amber-500" />}
                <span className="text-xl font-medium text-slate-800">Driver assigned ({run.driverName || 'Missing'})</span>
              </li>
            </ul>

            <div className="pt-4">
              <textarea 
                className="input w-full p-4 text-base bg-slate-50 border-slate-200 rounded-xl" 
                rows={3} 
                placeholder="Add any final dispatch notes here (optional)..." 
                value={notes} 
                onChange={e => setNotes(e.target.value)} 
              />
            </div>

            <button 
              className="btn-primary w-full py-4 text-xl flex justify-center items-center gap-3 shadow-md" 
              disabled={over || !reviewed || run.signedOff || signOff.isPending} 
              onClick={() => signOff.mutate()}
            >
              <ClipboardCheck size={26} /> 
              {run.signedOff ? 'Manifest Already Signed Off' : 'Sign Off & Finalize Manifest'}
            </button>
            {(over || !reviewed) && <p className="text-center font-medium text-red-600">Please complete previous steps to enable sign-off.</p>}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sub-component: Split Panel ───────────────────────────────────────────────

function SplitPanel({ run, onDone }) {
  const [driverId, setDriverId] = useState(''); const [vehicleId, setVehicleId] = useState('');
  const [preview, setPreview] = useState(null)

  const { data: optRaw } = useQuery({ queryKey: ['split-opts', run.routeId], queryFn: () => payloadApi.splitOptions(run.routeId) })
  const opts = unwrap(optRaw) ?? { drivers: [], vehicles: [] }

  const previewMut = useMutation({ mutationFn: () => payloadApi.splitPreview(run.routeId, { standbyDriverId: driverId, standbyVehicleId: vehicleId }), onSuccess: res => setPreview(unwrap(res)) })
  const confirmMut = useMutation({ mutationFn: () => payloadApi.splitConfirm(run.routeId, { standbyDriverId: driverId, standbyVehicleId: vehicleId }), onSuccess: onDone })

  return (
    <div className="border border-slate-200 bg-white shadow-sm rounded-xl p-6 space-y-6">
      <p className="text-slate-600 text-lg">Assign a standby driver and vehicle. The system will auto-balance the load across both vehicles.</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <select className="input py-3" value={driverId} onChange={e => { setDriverId(e.target.value); setPreview(null) }}>
          <option value="">Select Standby Driver...</option>
          {opts.drivers.map(d => <option key={d.driverId} value={d.driverId}>{d.name}</option>)}
        </select>
        <select className="input py-3" value={vehicleId} onChange={e => { setVehicleId(e.target.value); setPreview(null) }}>
          <option value="">Select Standby Vehicle...</option>
          {opts.vehicles.map(v => <option key={v.vehicleId} value={v.vehicleId}>{v.registration} ({v.capacityKg}kg)</option>)}
        </select>
      </div>

      <button className="btn-secondary w-full py-3 text-lg bg-slate-50" disabled={!driverId || !vehicleId || previewMut.isPending} onClick={() => previewMut.mutate()}>
        <Eye size={20} className="mr-2 inline" /> Preview Route Split
      </button>

      {preview && (
        <div className="pt-6 border-t border-slate-200 space-y-5 animate-in fade-in">
          <h4 className="text-xl font-bold text-slate-800 text-center">Proposed Distribution</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="bg-slate-50 p-5 border border-slate-200 rounded-xl">
              <p className="font-bold text-slate-800 text-lg">Original Route</p>
              <p className="text-slate-500 mb-4">{preview.original.parcels.length} parcels</p>
              <LoadBar load={preview.original.loadKg} max={preview.original.maxKg} over={false} />
            </div>
            <div className="bg-slate-50 p-5 border border-slate-200 rounded-xl">
              <p className="font-bold text-slate-800 text-lg">Standby Route</p>
              <p className="text-slate-500 mb-4">{preview.standby.parcels.length} parcels</p>
              <LoadBar load={preview.standby.loadKg} max={preview.standby.maxKg} over={false} />
            </div>
          </div>
          <button className="btn-primary w-full py-4 text-lg bg-green-600 hover:bg-green-700 border-none" disabled={confirmMut.isPending} onClick={() => confirmMut.mutate()}>
            Confirm and Finalize Split
          </button>
        </div>
      )}
    </div>
  )
}

// ── Page Entry Point ─────────────────────────────────────────────────────────

export default function PayloadReviewPage() {
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState(null)

  const { data, isLoading } = useQuery({ queryKey: ['payload-overview'], queryFn: () => payloadApi.overview(), refetchInterval: 30000 })
  const refresh = () => qc.invalidateQueries()

  const runs = unwrap(data)?.runs ?? []
  const open = runs.filter(r => r.isEditable)
  const overloaded = open.filter(r => r.overageKg > 0).length
  const needSign = open.filter(r => r.overageKg <= 0 && !r.signedOff).length

  return (
    <AppShell title="Payload Validation">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Payload Validation</h1>
        <p className="text-slate-500 mt-2 text-lg">Validate routes step-by-step and sign off manifests for warehouse release.</p>
      </div>

      {isLoading ? <PageLoader /> : runs.length === 0 ? (
        <EmptyState title="No active routes" description="Routes dispatched from the queue will appear here." />
      ) : (
        <div>
          {/* Conditional Rendering: Show ONLY the selected run workspace, OR the dashboard list */}
          {selectedId ? (
            <div className="animate-in fade-in max-w-5xl mx-auto">
              {/* Back Button */}
              <button 
                onClick={() => setSelectedId(null)} 
                className="flex items-center gap-2 text-slate-500 hover:text-blue-700 font-bold mb-6 transition"
              >
                <ArrowLeft size={20} /> Back to Routes Overview
              </button>
              
              {/* Dedicated Workspace */}
              <RunDetail 
                key={selectedId} 
                run={runs.find(r => r.routeId === selectedId)} 
                otherRuns={open.filter(r => r.routeId !== selectedId)} 
                onChanged={() => { refresh(); setSelectedId(null); }} // Return to dashboard when done
              />
            </div>
          ) : (
            <div className="space-y-8 animate-in fade-in">
              {/* Top Dashboard Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <StatCard label="Overloaded Routes" value={overloaded} icon={AlertTriangle} color={overloaded ? 'bg-red-500' : 'bg-green-500'} sub="Requires adjustment" />
                <StatCard label="Ready for Sign-off" value={needSign} icon={ClipboardCheck} color="bg-amber-500" sub="Within limits, unsigned" />
                <StatCard label="Total Active Routes" value={open.length} icon={Truck} color="bg-blue-600" sub="Currently in planning" />
              </div>

              {/* Grid of all runs */}
              <RunList runs={runs} onSelect={setSelectedId} />
            </div>
          )}
        </div>
      )}
    </AppShell>
  )
}