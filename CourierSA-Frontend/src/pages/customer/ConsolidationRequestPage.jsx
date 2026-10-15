import { useState, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { Alert } from '@/components/ui'
import StatusBadge from '@/components/ui/StatusBadge'
import { SourceBadge, hoursLeft } from '@/components/consolidation/consolidationUi'
import { consolidationApi } from '@/api'
import { formatZAR } from '@/utils'
import { Boxes, RefreshCw, CheckCircle2, Clock, Truck, PackageCheck, PauseCircle, AlertTriangle, ShieldCheck } from 'lucide-react'
import clsx from 'clsx'

const asList = d => (Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : [])
const asObj = d => (d && d.data !== undefined ? d.data : d)

// Package consolidation (customer). The business groups parcels going to the same address;
// this page tells the customer what is happening, what is still on its way, and lets them opt out or step in.
//   1. How should we handle it?   2. What is happening to my parcels?   3. Choose parcels myself   4. My orders

const PREFS = [
  { key: 'Auto',     title: 'Combine automatically', desc: 'Recommended. We group parcels going to the same address and tell you. You can cancel before the warehouse starts.' },
  { key: 'AskFirst', title: 'Ask me first',          desc: 'We tell you when parcels can be combined. Nothing happens until you confirm.' },
  { key: 'Never',    title: 'Never automatically',   desc: 'Parcels ship separately unless you combine them yourself.' },
]

const STATE = {
  Waiting:            { label: 'Waiting for more parcels', icon: Clock,         cls: 'bg-[#FFFBEB] text-[#92400E] border-[#FDE68A]' },
  Combining:          { label: 'Combining soon',           icon: PackageCheck,  cls: 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]' },
  ReadyToConfirm:     { label: 'Ready for you to confirm', icon: CheckCircle2,  cls: 'bg-[#F0FDF4] text-[#166534] border-[#BBF7D0]' },
  Paused:             { label: 'Automatic is off',         icon: PauseCircle,   cls: 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]' },
  Blocked:            { label: 'Cannot be packed together', icon: AlertTriangle, cls: 'bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]' },
  ShippingSeparately: { label: 'Shipping separately',      icon: Truck,         cls: 'bg-[#F1F5F9] text-[#475569] border-[#E2E8F0]' },
}

function PreferenceCard() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['consolidation', 'preference'], queryFn: consolidationApi.preference })
  const pref = asObj(data)
  const save = useMutation({
    mutationFn: key => consolidationApi.setPreference(key),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consolidation'] }),
  })
  const current = save.isPending ? save.variables : pref?.preference

  return (
    <div className="card bg-white p-5 rounded-xl border border-[#D8E4F5] space-y-3">
      <div>
        <h2 className="text-sm font-bold text-[#172554] flex items-center gap-2"><ShieldCheck size={16} /> How should we handle parcels to the same address?</h2>
        <p className="text-xs text-[#64748B] mt-1">
          When parcels going to the same address are in our warehouse we can pack them into one shipment and you save 10% (2 parcels) or 15% (3 or more).
          If more are still on their way we wait up to {pref?.holdHours ?? 24} hours for them. Express, Overnight and Same-day parcels are never held or combined.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {PREFS.map(o => (
          <button key={o.key} type="button" disabled={save.isPending} onClick={() => save.mutate(o.key)}
            className={clsx('text-left p-3 rounded-xl border transition',
              current === o.key ? 'border-[#0A3D91] bg-[#F6FAFF] ring-1 ring-[#0A3D91]' : 'border-[#E2E8F0] hover:border-[#1E63E9]')}>
            <p className="text-sm font-bold text-[#172554]">{o.title}</p>
            <p className="text-xs text-[#64748B] mt-1">{o.desc}</p>
          </button>
        ))}
      </div>
      {save.error && <Alert type="error" message={save.error.message} />}
    </div>
  )
}

function ParcelChip({ p }) {
  const where = p.inWarehouse
    ? { label: 'In warehouse', cls: 'bg-[#F0FDF4] text-[#166534]' }
    : p.status === 'PendingApproval'
      ? { label: 'Awaiting approval', cls: 'bg-[#FFFBEB] text-[#92400E]' }
      : { label: 'On its way', cls: 'bg-[#EFF6FF] text-[#1D4ED8]' }
  return <span className={clsx('text-[11px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap', where.cls)}>{where.label}</span>
}

function OutlookGroup({ g, onChanged, onError, onSuccess }) {
  const st = STATE[g.state] ?? STATE.Paused
  const Icon = st.icon
  const readyIds = g.parcels.filter(p => p.inWarehouse && !p.shipAlone && !p.blockedReason).map(p => p.id)
  const canCombine = readyIds.length >= 2 && ['Waiting', 'Combining', 'ReadyToConfirm', 'Paused'].includes(g.state)

  const combine = useMutation({
    mutationFn: () => consolidationApi.request({ parcelIds: readyIds }),
    onSuccess: () => { onSuccess('Consolidation requested. The work order has been sent to the warehouse.'); onChanged() },
    onError: e => onError(e?.message || 'Could not combine these parcels.'),
  })
  const alone = useMutation({
    mutationFn: ({ id, value }) => consolidationApi.shipAlone(id, value),
    onSuccess: onChanged,
    onError: e => onError(e?.message || 'Could not update the parcel.'),
  })

  const hold = g.state === 'Waiting' && g.holdUntil ? hoursLeft(g.holdUntil) : null

  return (
    <div className="card bg-white p-5 rounded-xl border border-[#D8E4F5] space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-[#172554]">{g.destination}</p>
          <p className="text-xs text-[#64748B]">{g.inWarehouseCount} in the warehouse · {g.incomingCount} on the way</p>
        </div>
        <span className={clsx('inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border', st.cls)}>
          <Icon size={13} /> {st.label}
        </span>
      </div>

      <p className="text-sm text-[#334155]">{g.message}</p>

      {hold != null && (
        <p className="text-xs text-[#92400E] bg-[#FFFBEB] border border-[#FDE68A] rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5">
          <Clock size={12} /> {hold === 0 ? 'Hold window ending now.' : `About ${hold} h left to wait for the other parcels.`}
        </p>
      )}

      {g.preview && (
        <div className="grid grid-cols-3 gap-2 text-center">
          {[['Separate', formatZAR(g.preview.separateShippingZAR)], ['Combined', formatZAR(g.preview.consolidatedShippingZAR)], ['You save', `${formatZAR(g.preview.savingZAR)} (${g.preview.savingPercent}%)`]].map(([k, v], i) => (
            <div key={k} className="rounded-lg bg-[#F8FAFC] border border-[#E2E8F0] py-2">
              <p className="text-[10px] uppercase font-bold text-[#64748B]">{k}</p>
              <p className={clsx('text-xs font-bold', i === 2 ? 'text-emerald-700' : 'text-[#172554]')}>{v}</p>
            </div>
          ))}
        </div>
      )}

      <div className="divide-y divide-[#E2E8F0] border border-[#E2E8F0] rounded-xl">
        {g.parcels.map(p => (
          <div key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
            <span className="font-mono text-xs w-40">{p.trackingNumber}</span>
            <ParcelChip p={p} />
            <span className="text-xs text-[#64748B]">{Number(p.weightKg).toFixed(1)} kg · {p.serviceType}{p.isFragile ? ' · Fragile' : ''}</span>
            <span className="ml-auto">
              {p.blockedReason ? (
                <span className="text-[11px] text-[#64748B]" title={p.blockedReason}>Always ships alone</span>
              ) : (
                <button type="button" disabled={alone.isPending}
                  className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-[#E2E8F0] hover:bg-[#F8FAFC]"
                  onClick={() => alone.mutate({ id: p.id, value: !p.shipAlone })}>
                  {p.shipAlone ? 'Combine again' : 'Ship now'}
                </button>
              )}
            </span>
          </div>
        ))}
      </div>

      {canCombine && (
        <button type="button" className="btn-primary text-sm py-2 px-4 rounded-xl inline-flex items-center gap-2"
          disabled={combine.isPending} onClick={() => combine.mutate()}>
          {combine.isPending ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
          {g.state === 'Waiting' ? "Don't wait: combine what is here" : 'Combine now'}
        </button>
      )}
      <p className="text-[11px] text-[#94A3B8]">"Ship now" sends a parcel on its own and takes it out of any automatic grouping.</p>
    </div>
  )
}

export default function ConsolidationRequestPage() {
  const qc = useQueryClient()
  const [selected, setSelected] = useState([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const { data: outlookRaw, isLoading: outlookLoading } = useQuery({
    queryKey: ['consolidation', 'outlook'],
    queryFn: consolidationApi.outlook,
    refetchInterval: 60000,
  })
  const { data: eligibleRaw, isLoading } = useQuery({
    queryKey: ['consolidation', 'eligible'],
    queryFn: consolidationApi.eligible,
  })
  const { data: mineRaw } = useQuery({
    queryKey: ['consolidation', 'mine'],
    queryFn: consolidationApi.mine,
    refetchInterval: 60000,
  })

  const outlook = asList(outlookRaw)
  const eligible = asList(eligibleRaw)
  const mine = asList(mineRaw)

  const refresh = () => qc.invalidateQueries({ queryKey: ['consolidation'] })

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
      refresh()
    },
    onError: err => { setSuccess(''); setError(err?.message || 'Failed to request consolidation.') },
  })

  const cancelMutation = useMutation({
    mutationFn: id => consolidationApi.cancel(id),
    onSuccess: () => { setError(''); refresh() },
    onError: err => setError(err?.message || 'Failed to cancel.'),
  })

  const toggle = p => {
    setSuccess('')
    setSelected(cur => (cur.includes(p.id) ? cur.filter(x => x !== p.id) : [...cur, p.id]))
  }

  return (
    <AppShell title="Package Consolidation">
      <div className="max-w-5xl mx-auto space-y-6">
        {error && <Alert type="error" message={error} />}
        {success && <Alert type="success" message={success} />}

        {/* 1. How should we handle it */}
        <PreferenceCard />

        {/* 2. What is happening to my parcels */}
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-bold text-[#172554]">What is happening to my parcels</h2>
            <p className="text-xs text-[#64748B]">Parcels going to the same address, including ones that are still on their way to our warehouse.</p>
          </div>
          {outlookLoading ? (
            <div className="flex items-center gap-2 py-6 justify-center text-sm text-[#64748B]"><RefreshCw size={16} className="animate-spin" /> Loading…</div>
          ) : outlook.length === 0 ? (
            <div className="card bg-white p-6 rounded-xl border border-[#D8E4F5] text-center text-sm text-[#64748B]">
              You have no parcels going to the same address right now. When you book a second parcel to an address you already use,
              it will appear here with the saving.
            </div>
          ) : (
            <div className="space-y-4">
              {outlook.map(g => (
                <OutlookGroup key={g.addressKey} g={g} onChanged={refresh} onError={m => { setSuccess(''); setError(m) }} onSuccess={m => { setError(''); setSuccess(m) }} />
              ))}
            </div>
          )}
        </section>

        {/* 3. Choose parcels myself */}
        <details className="group">
          <summary className="cursor-pointer text-sm font-bold text-[#172554] mb-3">Choose parcels myself</summary>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <div className="card bg-white p-5 rounded-xl border border-[#D8E4F5]">
                <h2 className="text-sm font-bold text-[#172554] mb-1">My Parcels in the Warehouse</h2>
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
                      const otherAddress = selectedKey && p.addressKey !== selectedKey
                      const blocked = otherAddress || !!p.blockedReason
                      return (
                        <label
                          key={p.id}
                          title={p.blockedReason || undefined}
                          className={clsx(
                            'flex items-center gap-3 p-3 rounded-lg border text-sm',
                            checked ? 'border-[#F77F00] bg-[#FFF7ED]' : 'border-[#E2E8F0] bg-white',
                            blocked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'
                          )}
                        >
                          <input type="checkbox" checked={checked} disabled={blocked} onChange={() => toggle(p)} />
                          <span className="font-mono text-xs w-40">{p.trackingNumber}</span>
                          <span className="flex-1 text-[#334155]">
                            {p.destinationAddress}
                            {p.blockedReason && <span className="block text-[11px] text-[#B91C1C]">{p.blockedReason}</span>}
                            {p.shipAlone && !p.blockedReason && <span className="block text-[11px] text-[#64748B]">Marked "Ship now". Selecting it combines it again.</span>}
                          </span>
                          <span className="text-xs text-[#64748B]">{Number(p.weightKg).toFixed(1)} kg</span>
                          <span className="text-xs font-mono text-[#64748B] w-10 text-right">{p.binCode || '—'}</span>
                        </label>
                      )
                    })}
                  </div>
                )}
                {selectedKey && (
                  <p className="text-xs text-emerald-700 mt-3">✓ Parcels with a different destination are greyed out.</p>
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
            </div>
          </div>
        </details>

        {/* 4. My orders */}
        <div className="card bg-white p-5 rounded-xl border border-[#D8E4F5]">
          <h2 className="text-sm font-bold text-[#172554] mb-3">My consolidation orders</h2>
          {mine.length === 0 ? (
            <p className="text-sm text-[#64748B]">No consolidation orders yet.</p>
          ) : (
            <div className="space-y-2">
              {mine.map(o => (
                <div key={o.id} className="p-3 rounded-lg border border-[#E2E8F0] flex flex-wrap items-center gap-3 text-sm">
                  <div className="flex-1 min-w-[200px]">
                    <p className="font-bold text-[#172554] flex flex-wrap items-center gap-2">
                      {o.orderNumber}
                      {o.masterTrackingId && <span className="font-mono text-xs text-[#0A3D91]">{o.masterTrackingId}</span>}
                      <SourceBadge source={o.source} />
                    </p>
                    <p className="text-xs text-[#64748B]">
                      {o.parcelCount} parcels · {o.destination}{o.lane ? ` · ${o.lane}` : ''}
                      {o.savingZAR > 0 && ` · saves ${formatZAR(o.savingZAR)}`}
                    </p>
                  </div>
                  <StatusBadge status={o.status} />
                  {o.status === 'Pending' && (
                    <button
                      className="text-xs px-3 py-1.5 rounded-lg border border-[#E2E8F0] hover:bg-[#F8FAFC]"
                      disabled={cancelMutation.isPending}
                      onClick={() => cancelMutation.mutate(o.id)}
                    >
                      {o.source === 'Customer' ? 'Cancel' : 'Cancel, ship separately'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
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
