import { useState, useMemo, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { EmptyState, PageLoader, Alert, StatCard } from '@/components/ui'
import { parcelApi, payloadApi } from '@/api'
import {
  Weight, Trash2, XCircle, ArrowRightLeft, ClipboardCheck, Eye, CheckCircle2,
  Search, Truck, AlertTriangle, Gauge, Check, CircleAlert, ArrowRight, SplitSquareHorizontal
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

// ── Sidebar: Run List ────────────────────────────────────────────────────────

function RunList({ runs, selectedId, onSelect }) {
  const [search, setSearch] = useState('')

  const shown = useMemo(() => {
    const q = search.toLowerCase()
    return runs.filter(r => !q || [r.runLabel, r.driverName, r.vehicleRegistration].some(v => String(v ?? '').toLowerCase().includes(q)))
  }, [runs, search])

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input 
          className="input pl-10 w-full bg-slate-50" 
          placeholder="Search runs..." 
          value={search} onChange={e => setSearch(e.target.value)} 
        />
      </div>

      <div className="space-y-2 max-h-[650px] overflow-y-auto pr-1">
        {shown.map(run => (
          <button key={run.routeId} type="button" disabled={!run.isEditable} onClick={() => onSelect(run.routeId)}
            className={clsx('w-full p-4 text-left border rounded-xl transition', 
              selectedId === run.routeId ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600' : 'border-slate-200 hover:border-slate-300',
              !run.isEditable && 'opacity-50')}>
            <div className="flex justify-between items-start mb-3">
              <div>
                <p className="font-bold text-slate-900">{run.runLabel}</p>
                <p className="text-sm text-slate-500">{run.driverName || 'Unassigned'}</p>
              </div>
              <StatusBadge run={run} />
            </div>
            <LoadBar load={run.loadKg} max={run.maxKg} over={run.overageKg > 0} />
          </button>
        ))}
        {shown.length === 0 && <p className="text-center text-slate-500 py-4">No runs found.</p>}
      </div>
    </div>
  )
}

// ── Main Panel: Step-by-Step Detail ──────────────────────────────────────────

function RunDetail({ run, otherRuns, onChanged }) {
  // Step Management: 1 = Review, 2 = Adjust, 3 = Sign Off
  const [step, setStep] = useState(1)
  const [reviewed, setReviewed] = useState(!!run.signedOff)
  const over = run.overageKg > 0

  // Reset step when clicking a different run
  useEffect(() => { 
    setStep(1); setReviewed(!!run.signedOff); 
  }, [run.routeId])

  // Sub-state for Adjust Step
  const [adjustMode, setAdjustMode] = useState('move') // 'move' or 'split'
  const [selected, setSelected] = useState([])
  const [targetId, setTargetId] = useState('')
  const [notes, setNotes] = useState('')

  const done = () => { setSelected([]); setTargetId(''); onChanged(); setStep(1); }

  const move = useMutation({
    mutationFn: toQueue => payloadApi.reallocate(run.routeId, { parcelIds: selected, targetRouteId: toQueue ? null : targetId }),
    onSuccess: done,
  })
  
  const signOff = useMutation({
    mutationFn: () => payloadApi.signOff(run.routeId, { notes }),
    onSuccess: done,
  })

  // Pre-calculations
  const selectedKg = run.parcels.filter(p => selected.includes(p.parcelId)).reduce((s, p) => s + p.weightKg, 0)
  const target = otherRuns.find(r => r.routeId === targetId)
  const tooHeavy = !!targetId && selectedKg > (target ? target.maxKg - target.loadKg : 0)

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col h-full min-h-[600px]">
      
      {/* HEADER: Always visible, shows context */}
      <div className="p-6 border-b border-slate-200">
        <h2 className="text-2xl font-bold text-slate-900 mb-1">{run.runLabel}</h2>
        <p className="text-slate-500 mb-6 flex items-center gap-2">
          <Truck size={16} /> {run.vehicleRegistration ?? 'No Vehicle'} · {run.driverName ?? 'No Driver'}
        </p>
        <LoadBar load={run.loadKg} max={run.maxKg} over={over} />
      </div>

      {/* STEP TRACKER: Visualizes the "Wizard" progression */}
      <div className="flex bg-slate-50 border-b border-slate-200">
        {[
          { num: 1, label: 'Review Parcels', active: step === 1, complete: reviewed },
          { num: 2, label: 'Adjust Load', active: step === 2, complete: !over },
          { num: 3, label: 'Sign Off', active: step === 3, complete: run.signedOff }
        ].map((s) => (
          <div key={s.num} onClick={() => setStep(s.num)} className={clsx(
            "flex-1 p-4 flex items-center justify-center gap-3 border-b-2 cursor-pointer transition",
            s.active ? "border-blue-600 bg-white" : "border-transparent text-slate-500 hover:bg-slate-100"
          )}>
            <div className={clsx("w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold",
              s.complete ? "bg-green-100 text-green-700" : s.active ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-600")}>
              {s.complete ? <Check size={16} /> : s.num}
            </div>
            <span className={clsx("font-medium", s.active ? "text-blue-600" : "text-slate-600")}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* BODY: Only shows the content for the current step (Progressive Disclosure) */}
      <div className="p-6 flex-1 overflow-y-auto">
        
        {/* === STEP 1: REVIEW === */}
        {step === 1 && (
          <div className="space-y-6 max-w-3xl mx-auto animate-in fade-in">
            <div className="text-center mb-6">
              <h3 className="text-lg font-bold text-slate-800">Review Route Parcels</h3>
              <p className="text-slate-500 text-sm">Please verify the parcels assigned to this vehicle below.</p>
            </div>

            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
              {run.parcels.map(p => (
                <div key={p.parcelId} className="flex justify-between p-4 bg-white">
                  <div>
                    <p className="font-mono font-semibold text-slate-700">{p.trackingNumber}</p>
                    <p className="text-sm text-slate-500">{p.recipient}, {p.city}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-slate-900">{p.weightKg} kg</p>
                    {isMaster(p) && <span className="text-[10px] font-bold uppercase bg-purple-100 text-purple-700 px-2 py-0.5 rounded">Master Box</span>}
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-blue-50 p-6 rounded-xl border border-blue-100 flex flex-col items-center gap-4">
              <label className="flex items-center gap-3 cursor-pointer text-lg">
                <input type="checkbox" className="w-5 h-5 text-blue-600 rounded" 
                  checked={reviewed} onChange={e => setReviewed(e.target.checked)} />
                <span className="font-medium text-blue-900">I have reviewed and verified these parcels</span>
              </label>
              
              <button 
                className="btn-primary w-full max-w-sm flex justify-center items-center gap-2"
                onClick={() => setStep(over ? 2 : 3)}
              >
                {over ? 'Proceed to Adjust Load' : 'Proceed to Sign Off'} <ArrowRight size={18} />
              </button>
            </div>
          </div>
        )}

        {/* === STEP 2: ADJUST (Only used if over limit or moving parcels) === */}
        {step === 2 && (
          <div className="space-y-6 max-w-3xl mx-auto animate-in fade-in">
            {!over ? (
              <div className="text-center py-10">
                <CheckCircle2 size={48} className="mx-auto text-green-500 mb-4" />
                <h3 className="text-xl font-bold text-slate-800 mb-2">Load is within limits</h3>
                <p className="text-slate-500 mb-6">No adjustments are necessary. You can proceed to sign-off.</p>
                <button className="btn-primary" onClick={() => setStep(3)}>Go to Sign Off</button>
              </div>
            ) : (
              <>
                <div className="bg-red-50 text-red-800 p-4 rounded-lg flex items-center justify-between border border-red-200">
                  <div className="flex items-center gap-3">
                    <AlertTriangle size={24} className="text-red-600" />
                    <div>
                      <p className="font-bold">Vehicle Overloaded</p>
                      <p className="text-sm">You are {run.overageKg} kg over capacity. Choose an action below.</p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
                  <button onClick={() => setAdjustMode('move')} className={clsx("flex-1 py-2 font-semibold text-sm rounded-md transition", adjustMode === 'move' ? "bg-white shadow text-slate-800" : "text-slate-500")}>Move Parcels</button>
                  <button onClick={() => setAdjustMode('split')} className={clsx("flex-1 py-2 font-semibold text-sm rounded-md transition", adjustMode === 'split' ? "bg-white shadow text-slate-800" : "text-slate-500")}>Split Route in Two</button>
                </div>

                {adjustMode === 'move' ? (
                  <div className="space-y-4 border border-slate-200 p-5 rounded-xl">
                    <p className="font-medium text-slate-700">Select parcels to remove from this vehicle:</p>
                    <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-lg">
                      {run.parcels.map(p => (
                        <label key={p.parcelId} className="flex justify-between items-center p-3 border-b border-slate-100 hover:bg-slate-50 cursor-pointer">
                          <div className="flex items-center gap-3">
                            <input type="checkbox" className="w-4 h-4 text-blue-600 rounded" checked={selected.includes(p.parcelId)} onChange={() => {
                              setSelected(s => s.includes(p.parcelId) ? s.filter(x => x !== p.parcelId) : [...s, p.parcelId])
                            }} />
                            <span className="font-mono text-sm">{p.trackingNumber}</span>
                          </div>
                          <span className="font-bold text-slate-700">{p.weightKg} kg</span>
                        </label>
                      ))}
                    </div>

                    <div className="bg-slate-50 p-4 rounded-lg flex flex-col gap-4">
                      <p className="text-sm font-bold text-slate-700">Action for {selected.length} selected parcels ({selectedKg} kg):</p>
                      <div className="flex gap-3">
                        <select className="input flex-1" value={targetId} onChange={e => setTargetId(e.target.value)}>
                          <option value="">Move to another run...</option>
                          {otherRuns.map(r => <option key={r.routeId} value={r.routeId}>{r.runLabel} ({Math.max(0, r.maxKg - r.loadKg)} kg free)</option>)}
                        </select>
                        <button className="btn-primary whitespace-nowrap" disabled={!targetId || selected.length === 0 || tooHeavy || move.isPending} onClick={() => move.mutate(false)}>Move</button>
                      </div>
                      {tooHeavy && <p className="text-xs text-red-600">Selected parcels exceed the target vehicle's free capacity.</p>}
                      <div className="text-center text-sm text-slate-400 font-bold uppercase">or</div>
                      <button className="btn-secondary w-full text-red-600 border-red-200 hover:bg-red-50" disabled={selected.length === 0 || move.isPending} onClick={() => move.mutate(true)}>
                        <Trash2 size={16} /> Return Selected to Dispatch Queue
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
            <div className="text-center mb-6">
              <h3 className="text-lg font-bold text-slate-800">Final Verification</h3>
              <p className="text-slate-500 text-sm">Review the checklist before signing off the manifest.</p>
            </div>

            <ul className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <li className="flex items-center gap-3">
                {reviewed ? <CheckCircle2 className="text-green-500" /> : <CircleAlert className="text-red-500" />}
                <span className={clsx("text-lg", reviewed ? "text-slate-800" : "text-red-600 font-bold")}>Parcels have been reviewed</span>
              </li>
              <li className="flex items-center gap-3">
                {!over ? <CheckCircle2 className="text-green-500" /> : <CircleAlert className="text-red-500" />}
                <span className={clsx("text-lg", !over ? "text-slate-800" : "text-red-600 font-bold")}>Load is within vehicle capacity</span>
              </li>
              <li className="flex items-center gap-3">
                {run.driverName ? <CheckCircle2 className="text-green-500" /> : <CircleAlert className="text-amber-500" />}
                <span className="text-lg text-slate-800">Driver assigned ({run.driverName || 'Missing'})</span>
              </li>
            </ul>

            <textarea 
              className="input w-full p-4 text-base bg-slate-50 border-slate-200" 
              rows={3} 
              placeholder="Add any final dispatch notes here (optional)..." 
              value={notes} 
              onChange={e => setNotes(e.target.value)} 
            />

            <button 
              className="btn-primary w-full py-4 text-lg flex justify-center items-center gap-2" 
              disabled={over || !reviewed || run.signedOff || signOff.isPending} 
              onClick={() => signOff.mutate()}
            >
              <ClipboardCheck size={24} /> 
              {run.signedOff ? 'Manifest Already Signed Off' : 'Sign Off & Finalize Manifest'}
            </button>
            {(over || !reviewed) && <p className="text-center text-sm text-red-600">Please complete previous steps to enable sign-off.</p>}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sub-component: Split Panel (Used inside Step 2) ──────────────────────────

function SplitPanel({ run, onDone }) {
  const [driverId, setDriverId] = useState('')
  const [vehicleId, setVehicleId] = useState('')
  const [preview, setPreview] = useState(null)

  const { data: optRaw } = useQuery({ queryKey: ['split-opts', run.routeId], queryFn: () => payloadApi.splitOptions(run.routeId) })
  const opts = unwrap(optRaw) ?? { drivers: [], vehicles: [] }

  const previewMut = useMutation({ mutationFn: () => payloadApi.splitPreview(run.routeId, { standbyDriverId: driverId, standbyVehicleId: vehicleId }), onSuccess: res => setPreview(unwrap(res)) })
  const confirmMut = useMutation({ mutationFn: () => payloadApi.splitConfirm(run.routeId, { standbyDriverId: driverId, standbyVehicleId: vehicleId }), onSuccess: onDone })

  return (
    <div className="border border-slate-200 rounded-xl p-5 space-y-5">
      <p className="text-sm text-slate-600">Assign a standby driver and vehicle to split this route automatically.</p>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <select className="input" value={driverId} onChange={e => { setDriverId(e.target.value); setPreview(null) }}>
          <option value="">Select Standby Driver...</option>
          {opts.drivers.map(d => <option key={d.driverId} value={d.driverId}>{d.name}</option>)}
        </select>
        <select className="input" value={vehicleId} onChange={e => { setVehicleId(e.target.value); setPreview(null) }}>
          <option value="">Select Standby Vehicle...</option>
          {opts.vehicles.map(v => <option key={v.vehicleId} value={v.vehicleId}>{v.registration} ({v.capacityKg}kg)</option>)}
        </select>
      </div>

      <button className="btn-secondary w-full bg-slate-50" disabled={!driverId || !vehicleId || previewMut.isPending} onClick={() => previewMut.mutate()}>
        <Eye size={18} className="mr-2 inline" /> Preview Route Split
      </button>

      {preview && (
        <div className="pt-4 border-t border-slate-200 space-y-4 animate-in fade-in">
          <h4 className="font-bold text-slate-800 text-center">Proposed Distribution</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white p-3 border rounded-lg shadow-sm">
              <p className="text-sm font-bold text-slate-700">Original Route</p>
              <p className="text-xs text-slate-500 mb-2">{preview.original.parcels.length} parcels</p>
              <LoadBar load={preview.original.loadKg} max={preview.original.maxKg} over={false} />
            </div>
            <div className="bg-white p-3 border rounded-lg shadow-sm">
              <p className="text-sm font-bold text-slate-700">Standby Route</p>
              <p className="text-xs text-slate-500 mb-2">{preview.standby.parcels.length} parcels</p>
              <LoadBar load={preview.standby.loadKg} max={preview.standby.maxKg} over={false} />
            </div>
          </div>
          <button className="btn-primary w-full bg-green-600 hover:bg-green-700" disabled={confirmMut.isPending} onClick={() => confirmMut.mutate()}>
            Confirm Split
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
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard label="Overloaded Routes" value={overloaded} icon={AlertTriangle} color={overloaded ? 'bg-red-500' : 'bg-green-500'} sub="Requires adjustment" />
            <StatCard label="Ready for Sign-off" value={needSign} icon={ClipboardCheck} color="bg-amber-500" sub="Within limits, unsigned" />
            <StatCard label="Total Active Routes" value={open.length} icon={Truck} color="bg-blue-600" sub="Currently in planning" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[400px_minmax(0,1fr)] gap-6 items-start">
            <RunList runs={runs} selectedId={selectedId} onSelect={setSelectedId} />
            
            <div className="xl:sticky xl:top-6">
              {selectedId ? (
                <RunDetail key={selectedId} run={runs.find(r => r.routeId === selectedId)} otherRuns={open.filter(r => r.routeId !== selectedId)} onChanged={refresh} />
              ) : (
                <div className="h-[600px] bg-white rounded-xl border border-dashed border-slate-300 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
                  <Truck size={64} className="mb-4 text-slate-200" strokeWidth={1} />
                  <p className="text-xl font-medium text-slate-600 mb-2">Select a route to begin</p>
                  <p className="text-slate-500">Choose a route from the sidebar to review and validate its payload.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}