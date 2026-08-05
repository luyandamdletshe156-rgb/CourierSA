import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import {
  StatCard, StatusPill, TrackingBadge, EmptyState,
  PageLoader, Modal, Alert
} from '@/components/ui'
import { parcelApi, trackingApi } from '@/api'
import {
  PackageCheck, CheckCircle, AlertTriangle, XCircle,
  Search, Warehouse, ClipboardCheck, Plus, MapPin
} from 'lucide-react'
import { formatDate } from '@/utils'
import clsx from 'clsx'

// ═══════════════════════════════════════════════════════════════════════════
// EXTERIOR-ONLY INSPECTION CHECKLIST — shared shape for Checkout page +
// the standalone Inspections page. Never opens sealed parcels.
// ═══════════════════════════════════════════════════════════════════════════
const emptyChecklist = {
  packagingIntact: false,
  noMoistureDamage: false,
  weightMatchesDeclared: false,
  fragileHandlingOk: null, // null = N/A (not fragile)
  sealIntact: false,
}

function InspectionChecklistFields({ checklist, setChecklist, isFragile }) {
  const toggle = key => setChecklist(prev => ({ ...prev, [key]: !prev[key] }))

  const ITEMS = [
    { key: 'packagingIntact',       label: 'Packaging intact — no tears or crushing' },
    { key: 'noMoistureDamage',      label: 'No visible moisture / water damage' },
    { key: 'weightMatchesDeclared', label: 'Weight roughly matches declared weight' },
    { key: 'sealIntact',            label: 'Seal / tape intact — no tamper signs' },
  ]

  return (
    <div className="space-y-2">
      {ITEMS.map(item => (
        <label key={item.key} className="flex items-center gap-3 cursor-pointer px-4 py-2.5 rounded-xl hover:bg-[#F6FAFF] border border-[#D8E4F5] transition-colors">
          <input
            type="checkbox"
            checked={!!checklist[item.key]}
            onChange={() => toggle(item.key)}
            className="w-4 h-4 text-[#0A3D91] rounded border-[#D8E4F5] focus:ring-[#1E63E9]/20"
          />
          <span className="text-sm font-medium text-[#334155]">{item.label}</span>
        </label>
      ))}
      {isFragile && (
        <label className="flex items-center gap-3 cursor-pointer px-4 py-2.5 rounded-xl hover:bg-[#F6FAFF] border border-[#D8E4F5] transition-colors">
          <input
            type="checkbox"
            checked={!!checklist.fragileHandlingOk}
            onChange={() => setChecklist(prev => ({ ...prev, fragileHandlingOk: !prev.fragileHandlingOk }))}
            className="w-4 h-4 text-[#0A3D91] rounded border-[#D8E4F5] focus:ring-[#1E63E9]/20"
          />
          <span className="text-sm font-medium text-[#334155]">⚠ Fragile handling compliant (padded, stickers visible)</span>
        </label>
      )}
    </div>
  )
}

function ResultPicker({ result, setResult }) {
  const OPTIONS = [
    { value: 'Pass',     label: 'Pass',     cls: 'border-[#10B981] bg-[#10B981]/10 text-[#10B981]' },
    { value: 'Damaged',  label: 'Damaged',  cls: 'border-[#F59E0B] bg-[#F59E0B]/10 text-[#F59E0B]' },
    { value: 'Rejected', label: 'Rejected', cls: 'border-[#EF4444] bg-[#EF4444]/10 text-[#EF4444]' },
  ]
  return (
    <div className="grid grid-cols-3 gap-3">
      {OPTIONS.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => setResult(opt.value)}
          className={clsx(
            'py-2.5 rounded-xl border-2 text-sm font-bold transition-all',
            result === opt.value ? opt.cls : 'border-[#D8E4F5] bg-white text-[#94A3B8] hover:border-[#1E63E9]/50 hover:text-[#1E63E9]'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// CHECKOUT PAGE (Warehouse Staff / Admin)
// Mirrors the Check In page pattern: scan-confirm + inspection + confirm.
// ═══════════════════════════════════════════════════════════════════════════
export function WarehouseCheckoutPage() {
  const qc = useQueryClient()
  const [checkoutModal, setCheckoutModal] = useState(null)
  const [scanConfirm, setScanConfirm] = useState('')
  const [checklist, setChecklist] = useState(emptyChecklist)
  const [result, setResult] = useState('Pass')
  const [notes, setNotes] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['parcels-awaiting-checkout'],
    queryFn:  () => parcelApi.queue({ status: 'InWarehouse', pageSize: 50 }),
    refetchInterval: 30000,
  })

  const parcels = data?.data?.items ?? []
  const scanConfirmed = scanConfirm && scanConfirm === checkoutModal?.trackingNumber
  const scanMismatch  = scanConfirm && scanConfirm !== checkoutModal?.trackingNumber

  const closeModal = () => {
    setCheckoutModal(null)
    setScanConfirm('')
    setChecklist(emptyChecklist)
    setResult('Pass')
    setNotes('')
  }

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      // Log the checkout-stage inspection first — condition record precedes the state change
      await parcelApi.logInspection(checkoutModal.id, {
        stage: 'Checkout',
        packagingIntact: checklist.packagingIntact,
        noMoistureDamage: checklist.noMoistureDamage,
        weightMatchesDeclared: checklist.weightMatchesDeclared,
        fragileHandlingOk: checkoutModal.isFragile ? checklist.fragileHandlingOk : null,
        sealIntact: checklist.sealIntact,
        result,
        notes: notes.trim() || null,
      })
      // Checkout is never blocked by inspection result — logged as a non-blocking flag instead
      await parcelApi.checkout(checkoutModal.id)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parcels-awaiting-checkout'] })
      qc.invalidateQueries({ queryKey: ['warehouse-inventory'] })
      qc.invalidateQueries({ queryKey: ['parcel-inspections'] })
      closeModal()
    },
  })

  return (
    <AppShell title="Checkout">
      <div className="page-header">
        <div>
          <h1 className="page-title">Checkout</h1>
          <p className="page-subtitle">Verify and release parcels for dispatch</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 mb-6">
        <StatCard label="Awaiting checkout" value={data?.data?.totalCount ?? parcels.length}
                   icon={Warehouse} color="bg-[#0A3D91]" />
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="text-sm font-bold text-[#172554]">Parcels in warehouse</h2>
        </div>

        {isLoading ? <PageLoader /> : parcels.length === 0 ? (
          <EmptyState icon={CheckCircle} title="All clear" description="No parcels waiting for checkout." />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Tracking #</th>
                  <th>Service</th>
                  <th>Destination</th>
                  <th>Bin</th>
                  <th>Weight</th>
                  <th>Fragile</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {parcels.map(p => (
                  <tr key={p.id}>
                    <td><TrackingBadge value={p.trackingNumber} /></td>
                    <td className="capitalize text-xs font-medium text-[#172554]">{p.serviceType}</td>
                    <td className="text-xs text-[#64748B]">{p.destinationCity}</td>
                    <td className="text-xs text-[#64748B]">{p.binCode ?? '—'}</td>
                    <td className="text-xs text-[#64748B] font-mono">{p.weightKg} kg</td>
                    <td>
                      {p.isFragile
                        ? <span className="text-xs font-bold text-[#F59E0B]">⚠ Yes</span>
                        : <span className="text-xs text-[#94A3B8]">No</span>}
                    </td>
                    <td>
                      <button className="btn-primary btn-sm" onClick={() => setCheckoutModal(p)}>
                        <PackageCheck size={14} /> Check out
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal open={!!checkoutModal} onClose={closeModal} title="Check out parcel" size="md">
        <p className="text-sm text-[#64748B] mb-4 flex items-center gap-2">
          Checking out <TrackingBadge value={checkoutModal?.trackingNumber} />
        </p>

        <label className="label">Confirm tracking number</label>
        <input
          type="text"
          className="input font-mono"
          placeholder="Scan or type tracking number…"
          value={scanConfirm}
          onChange={e => setScanConfirm(e.target.value.toUpperCase())}
          autoFocus
        />
        {scanMismatch && <p className="text-xs text-[#EF4444] mt-1">Does not match this parcel.</p>}
        {scanConfirmed && (
          <p className="text-xs text-[#10B981] mt-1 flex items-center gap-1">
            <CheckCircle size={12} /> Parcel confirmed
          </p>
        )}

        <label className="label mt-5 mb-2 block">Exterior condition check</label>
        <InspectionChecklistFields
          checklist={checklist}
          setChecklist={setChecklist}
          isFragile={checkoutModal?.isFragile}
        />

        <label className="label mt-5">Result</label>
        <ResultPicker result={result} setResult={setResult} />

        {result !== 'Pass' && (
          <Alert
            type="warning"
            message="This won't block checkout — it will flag the parcel for the dispatcher and driver, and notify the customer."
            className="mt-3"
          />
        )}

        <label className="label mt-4">Notes</label>
        <textarea
          className="input h-20 resize-none"
          placeholder="Optional notes…"
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />

        {checkoutMutation.error && (
          <Alert type="error" message={checkoutMutation.error.message} className="mt-4" />
        )}

        <div className="flex justify-end gap-3 mt-6">
          <button className="btn-secondary" onClick={closeModal}>Cancel</button>
          <button
            className="btn-primary"
            disabled={!scanConfirmed || checkoutMutation.isPending}
            onClick={() => checkoutMutation.mutate()}
          >
            <CheckCircle size={16} /> Confirm checkout
          </button>
        </div>
      </Modal>
    </AppShell>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// PARCEL INSPECTIONS PAGE (Warehouse Staff / Admin)
// Same list-plus-modal pattern as VehicleInspectionsPage, but for parcels.
// Also usable standalone for ad-hoc / check-in-stage logging.
// ═══════════════════════════════════════════════════════════════════════════
const RESULT_STYLES = {
  Pass:     { cls: 'status-delivered', icon: CheckCircle,   color: 'text-[#10B981]' },
  Damaged:  { cls: 'status-pending',   icon: AlertTriangle, color: 'text-[#F59E0B]' },
  Rejected: { cls: 'status-failed',    icon: XCircle,       color: 'text-[#EF4444]' },
}

export function ParcelInspectionsPage() {
  const qc = useQueryClient()
  const [newOpen, setNewOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['parcel-inspections'],
    queryFn:  () => parcelApi.inspections(),
  })

  const inspections = data?.data ?? []
  const passed   = inspections.filter(i => i.result === 'Pass').length
  const damaged  = inspections.filter(i => i.result === 'Damaged').length
  const rejected = inspections.filter(i => i.result === 'Rejected').length

  return (
    <AppShell title="Parcel Inspections">
      <div className="page-header">
        <div>
          <h1 className="page-title">Parcel Inspections</h1>
          <p className="page-subtitle">Exterior condition checks — check-in and checkout</p>
        </div>
        <button className="btn-primary" onClick={() => setNewOpen(true)}>
          <Plus size={15} /> New inspection
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Passed"   value={passed}   icon={CheckCircle}   color="bg-[#10B981]" />
        <StatCard label="Damaged"  value={damaged}  icon={AlertTriangle} color="bg-[#F59E0B]" />
        <StatCard label="Rejected" value={rejected} icon={XCircle}       color="bg-[#EF4444]" />
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="text-sm font-semibold text-[#172554]">Recent inspections</h2>
        </div>

        {isLoading ? <PageLoader /> : inspections.length === 0 ? (
          <EmptyState icon={ClipboardCheck} title="No inspections recorded" description="Log a check-in or checkout condition check to get started." />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Tracking #</th>
                  <th>Stage</th>
                  <th>Result</th>
                  <th>Notes</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {inspections.map(insp => {
                  const style = RESULT_STYLES[insp.result] ?? RESULT_STYLES.Pass
                  return (
                    <tr key={insp.id}>
                      <td><TrackingBadge value={insp.trackingNumber} /></td>
                      <td className="text-xs text-[#64748B]">{insp.stage}</td>
                      <td><span className={style.cls}>{insp.result}</span></td>
                      <td className="text-xs text-[#64748B] max-w-[220px] truncate">{insp.notes || '—'}</td>
                      <td className="text-xs text-[#94A3B8] font-mono">{formatDate(insp.createdAt, { time: true })}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <NewParcelInspectionModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onSuccess={() => { setNewOpen(false); qc.invalidateQueries({ queryKey: ['parcel-inspections'] }) }}
      />
    </AppShell>
  )
}

function NewParcelInspectionModal({ open, onClose, onSuccess }) {
  const [trackingNumber, setTrackingNumber] = useState('')
  const [lookedUp, setLookedUp] = useState(null) // resolved parcel from trackingApi
  const [lookupError, setLookupError] = useState('')
  const [stage, setStage] = useState('CheckIn')
  const [checklist, setChecklist] = useState(emptyChecklist)
  const [result, setResult] = useState('Pass')
  const [notes, setNotes] = useState('')

  const reset = () => {
    setTrackingNumber(''); setLookedUp(null); setLookupError('')
    setStage('CheckIn'); setChecklist(emptyChecklist); setResult('Pass'); setNotes('')
  }

  const lookupMutation = useMutation({
    mutationFn: () => trackingApi.trackPrivate(trackingNumber.trim().toUpperCase()),
    onSuccess: res => { setLookedUp(res.data); setLookupError('') },
    onError:   err => { setLookedUp(null); setLookupError(err.message) },
  })

  const submitMutation = useMutation({
    mutationFn: () => parcelApi.logInspection(lookedUp.id, {
      stage,
      packagingIntact: checklist.packagingIntact,
      noMoistureDamage: checklist.noMoistureDamage,
      weightMatchesDeclared: checklist.weightMatchesDeclared,
      fragileHandlingOk: lookedUp.isFragile ? checklist.fragileHandlingOk : null,
      sealIntact: checklist.sealIntact,
      result,
      notes: notes.trim() || null,
    }),
    onSuccess: () => { onSuccess(); reset() },
  })

  const handleClose = () => { reset(); onClose() }

  return (
    <Modal open={open} onClose={handleClose} title="Log parcel inspection" size="md">
      <div className="space-y-4">
        <div>
          <label className="label">Tracking number</label>
          <div className="flex gap-2">
            <input
              type="text"
              className="input font-mono flex-1"
              placeholder="e.g. CSA-2026-000123"
              value={trackingNumber}
              onChange={e => setTrackingNumber(e.target.value.toUpperCase())}
            />
            <button
              className="btn-secondary"
              disabled={!trackingNumber.trim() || lookupMutation.isPending}
              onClick={() => lookupMutation.mutate()}
            >
              <Search size={15} /> Find
            </button>
          </div>
          {lookupError && <p className="text-xs text-[#EF4444] mt-1">{lookupError}</p>}
          {lookedUp && (
            <p className="text-xs text-[#10B981] mt-1 flex items-center gap-1">
              <CheckCircle size={12} /> {lookedUp.trackingNumber} — {lookedUp.status}
            </p>
          )}
        </div>

        {lookedUp && (
          <>
            <div>
              <label className="label">Stage</label>
              <select className="input" value={stage} onChange={e => setStage(e.target.value)}>
                <option value="CheckIn">Check-in (as received)</option>
                <option value="Checkout">Checkout (leaving warehouse)</option>
              </select>
            </div>

            <div>
              <label className="label mb-2 block">Exterior condition check</label>
              <InspectionChecklistFields
                checklist={checklist}
                setChecklist={setChecklist}
                isFragile={lookedUp.isFragile}
              />
            </div>

            <div>
              <label className="label">Result</label>
              <ResultPicker result={result} setResult={setResult} />
            </div>

            <div>
              <label className="label">Notes</label>
              <textarea className="input h-20 resize-none" placeholder="Optional notes…" value={notes} onChange={e => setNotes(e.target.value)} />
            </div>

            {submitMutation.error && <Alert type="error" message={submitMutation.error.message} />}
          </>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button className="btn-secondary" onClick={handleClose}>Cancel</button>
          <button
            className="btn-primary"
            disabled={!lookedUp || submitMutation.isPending}
            onClick={() => submitMutation.mutate()}
          >
            <ClipboardCheck size={16} /> Submit inspection
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// TRACK PARCEL PAGE (Warehouse Staff / Admin)
// Staff lookup — reuses trackingApi.trackPrivate, no new backend needed.
// ═══════════════════════════════════════════════════════════════════════════
export function WarehouseTrackPage() {
  const [trackingNumber, setTrackingNumber] = useState('')
  const [searched, setSearched] = useState('')

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['warehouse-track', searched],
    queryFn:  () => trackingApi.trackPrivate(searched),
    enabled:  !!searched,
  })

  const result = data?.data

  const handleSearch = () => {
    if (trackingNumber.trim()) setSearched(trackingNumber.trim().toUpperCase())
  }

  return (
    <AppShell title="Track Parcel">
      <div className="page-header">
        <div>
          <h1 className="page-title">Track Parcel</h1>
          <p className="page-subtitle">Look up any parcel's full status and history</p>
        </div>
      </div>

      <div className="card mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            className="input font-mono flex-1"
            placeholder="Enter tracking number…"
            value={trackingNumber}
            onChange={e => setTrackingNumber(e.target.value.toUpperCase())}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
          <button className="btn-primary" onClick={handleSearch} disabled={!trackingNumber.trim()}>
            <Search size={15} /> Track
          </button>
        </div>
      </div>

      {isLoading && <PageLoader />}
      {isError && searched && <Alert type="error" message={error?.message ?? 'Parcel not found.'} />}

      {result && (
        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-3">
              <TrackingBadge value={result.trackingNumber} />
              <StatusPill status={result.status} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
            <div>
              <p className="text-xs text-[#94A3B8] uppercase font-semibold mb-1">Pickup</p>
              <p className="text-[#172554] font-medium">{result.pickupAddress?.recipientName}</p>
              <p className="text-[#64748B] text-xs">{result.pickupAddress?.streetAddress}, {result.pickupAddress?.city}</p>
            </div>
            <div>
              <p className="text-xs text-[#94A3B8] uppercase font-semibold mb-1">Delivery</p>
              <p className="text-[#172554] font-medium">{result.deliveryAddress?.recipientName}</p>
              <p className="text-[#64748B] text-xs">{result.deliveryAddress?.streetAddress}, {result.deliveryAddress?.city}</p>
            </div>
          </div>

          <p className="text-xs font-bold text-[#172554] mb-3 flex items-center gap-1.5">
            <MapPin size={13} /> Tracking history
          </p>
          <div className="space-y-3">
            {result.trackingEvents?.map((e, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <div className="w-2 h-2 rounded-full bg-[#0A3D91] mt-1.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-[#172554]">{e.eventType}{e.location ? ` — ${e.location}` : ''}</p>
                  <p className="text-xs text-[#64748B]">{e.description}</p>
                  <p className="text-xs text-[#94A3B8] font-mono">{formatDate(e.occurredAt, { time: true })}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </AppShell>
  )
}