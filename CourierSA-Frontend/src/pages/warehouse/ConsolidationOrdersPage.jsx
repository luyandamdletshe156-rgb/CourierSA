import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { Alert } from '@/components/ui'
import StatusBadge from '@/components/ui/StatusBadge'
import { consolidationApi } from '@/api'
import { Boxes, RefreshCw, ScanLine, Printer, CheckCircle2 } from 'lucide-react'
import clsx from 'clsx'

const asList = d => (Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : [])

const LANES = [
  'Lane 1 – North Coast',
  'Lane 2 – Central',
  'Lane 3 – North Coast',
  'Lane 4 – Inner West',
]

function printLabel(o) {
  const w = window.open('', '_blank', 'width=420,height=360')
  if (!w) return
  w.document.write(`<html><head><title>${o.masterTrackingId}</title></head>
    <body style="font-family:monospace;padding:24px;border:3px solid #000;margin:12px">
      <div style="font-size:12px">MyCourier SA – MASTER SHIPMENT</div>
      <div style="font-size:34px;font-weight:bold;margin:12px 0;letter-spacing:2px">${o.masterTrackingId}</div>
      <div>Order: ${o.orderNumber}</div>
      <div>Parcels inside: ${o.parcelCount}</div>
      <div>Size: ${o.lengthCm} × ${o.widthCm} × ${o.heightCm} cm &nbsp; Weight: ${o.finalWeightKg} kg</div>
      <div style="margin-top:10px">Deliver to: ${o.destination}</div>
    </body></html>`)
  w.document.close()
  w.focus()
  w.print()
}

// UC11 – Consolidate Warehouse Parcels, UC13 – Dispatch Consolidated Shipment (warehouse staff)
export default function ConsolidationOrdersPage() {
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState(null)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [scan, setScan] = useState('')
  const [dims, setDims] = useState({ lengthCm: '', widthCm: '', heightCm: '', finalWeightKg: '' })
  const [masterScan, setMasterScan] = useState('')
  const [lane, setLane] = useState(LANES[0])

  const { data, isLoading } = useQuery({
    queryKey: ['consolidation', 'queue'],
    queryFn: () => consolidationApi.queue(),
    refetchInterval: 30000,
  })
  const orders = asList(data)
  const order = orders.find(o => o.id === selectedId) || null

  const refresh = () => qc.invalidateQueries({ queryKey: ['consolidation'] })
  const fail = err => { setInfo(''); setError(err?.message || 'Something went wrong.') }

  const scanMutation = useMutation({
    mutationFn: () => consolidationApi.scan(order.id, { trackingNumber: scan }),
    onSuccess: () => { setError(''); setInfo(`${scan.trim().toUpperCase()} matched.`); setScan(''); refresh() },
    onError: fail,
  })

  const packMutation = useMutation({
    mutationFn: () => consolidationApi.pack(order.id, {
      lengthCm: Number(dims.lengthCm), widthCm: Number(dims.widthCm),
      heightCm: Number(dims.heightCm), finalWeightKg: Number(dims.finalWeightKg),
    }),
    onSuccess: () => { setError(''); setInfo('Master label generated. Print it and attach it to the box.'); refresh() },
    onError: fail,
  })

  const stageMutation = useMutation({
    mutationFn: () => consolidationApi.stage(order.id, { masterTrackingId: masterScan, lane }),
    onSuccess: () => {
      setError(''); setInfo('Staged for dispatch. The dispatcher can now plan the route.')
      setMasterScan(''); setSelectedId(null); refresh()
    },
    onError: fail,
  })

  const pick = o => {
    setSelectedId(o.id); setError(''); setInfo(''); setScan(''); setMasterScan('')
    setDims({ lengthCm: '', widthCm: '', heightCm: '', finalWeightKg: '' })
  }

  const allScanned = order && order.parcels.length > 0 && order.parcels.every(p => p.scanned)
  const canScan = order && (order.status === 'Pending' || order.status === 'InProgress')

  return (
    <AppShell title="Consolidate Warehouse Parcels">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card bg-white p-4 rounded-xl border border-[#D8E4F5] h-fit">
          <h2 className="text-sm font-bold text-[#172554] mb-3">Consolidation task queue</h2>
          {isLoading ? (
            <p className="text-sm text-[#64748B] flex items-center gap-2"><RefreshCw size={14} className="animate-spin" /> Loading…</p>
          ) : orders.length === 0 ? (
            <p className="text-sm text-[#64748B]">No consolidation orders waiting.</p>
          ) : (
            <div className="space-y-2">
              {orders.map(o => (
                <button
                  key={o.id}
                  onClick={() => pick(o)}
                  className={clsx(
                    'w-full text-left p-3 rounded-lg border text-sm',
                    o.id === selectedId ? 'border-[#F77F00] bg-[#FFF7ED]' : 'border-[#E2E8F0] hover:bg-[#F8FAFC]'
                  )}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-[#172554]">{o.orderNumber}</span>
                    <StatusBadge status={o.status} />
                  </div>
                  <p className="text-xs text-[#64748B]">{o.parcelCount} parcels – {o.destinationCity}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="lg:col-span-2 space-y-4">
          {error && <Alert type="error" message={error} />}
          {info && <Alert type="success" message={info} />}

          {!order ? (
            <div className="card bg-white p-10 rounded-xl border border-[#D8E4F5] text-center text-sm text-[#64748B]">
              <Boxes size={32} className="mx-auto mb-2 text-[#94A3B8]" />
              Select an order from the queue to start picking.
            </div>
          ) : (
            <div className="card bg-white p-5 rounded-xl border border-[#D8E4F5] space-y-5">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-sm font-bold text-[#172554]">Order {order.orderNumber} – pick, scan &amp; repack</h2>
                  <p className="text-xs text-[#64748B]">Deliver to: {order.destination}</p>
                </div>
                <StatusBadge status={order.status} />
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase text-[#64748B]">
                    <th className="py-1">Parcel</th><th>Bin</th><th>Weight</th><th>Scan</th>
                  </tr>
                </thead>
                <tbody>
                  {order.parcels.map(p => (
                    <tr key={p.parcelId} className="border-t border-[#F1F5F9]">
                      <td className="py-2 font-mono text-xs">{p.trackingNumber}</td>
                      <td className="font-mono text-xs">{p.binCode || '—'}</td>
                      <td className="text-xs">{Number(p.weightKg).toFixed(1)} kg</td>
                      <td>
                        <span className={clsx(
                          'text-[11px] font-bold px-2 py-0.5 rounded-full border',
                          p.scanned ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                        )}>
                          {p.scanned ? '✓ Matched' : 'Awaiting scan'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {canScan && (
                <form
                  onSubmit={e => { e.preventDefault(); if (scan.trim()) scanMutation.mutate() }}
                  className="flex gap-2"
                >
                  <div className="relative flex-1">
                    <ScanLine size={14} className="absolute left-3 top-3 text-[#94A3B8]" />
                    <input
                      autoFocus
                      className="input w-full pl-8 p-2 border rounded-lg text-sm font-mono"
                      placeholder="Scan parcel barcode / type tracking number"
                      value={scan}
                      onChange={e => setScan(e.target.value)}
                    />
                  </div>
                  <button className="btn-primary text-sm px-4 rounded-lg" disabled={scanMutation.isPending || !scan.trim()}>
                    Scan
                  </button>
                </form>
              )}

              {order.status === 'InProgress' && allScanned && (
                <div className="space-y-3 pt-3 border-t border-[#E2E8F0]">
                  <p className="text-xs font-bold text-[#334155]">All parcels scanned. Enter the final box details.</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[['lengthCm', 'Length (cm)'], ['widthCm', 'Width (cm)'], ['heightCm', 'Height (cm)'], ['finalWeightKg', 'Final weight (kg)']].map(([k, label]) => (
                      <div key={k}>
                        <label className="block text-[11px] font-semibold text-[#475569] mb-1">{label}</label>
                        <input
                          type="number" min="0" step="0.1"
                          className="input w-full p-2 border rounded-lg text-sm"
                          value={dims[k]}
                          onChange={e => setDims(d => ({ ...d, [k]: e.target.value }))}
                        />
                      </div>
                    ))}
                  </div>
                  <button
                    className="btn-primary text-sm px-5 py-2.5 rounded-xl"
                    disabled={packMutation.isPending || Object.values(dims).some(v => !v)}
                    onClick={() => packMutation.mutate()}
                  >
                    {packMutation.isPending ? 'Generating…' : 'Generate Master Label & Mark Consolidated'}
                  </button>
                </div>
              )}

              {order.status === 'Consolidated' && (
                <div className="space-y-3 pt-3 border-t border-[#E2E8F0]">
                  <div className="p-3 rounded-lg bg-[#EFF6FF] border border-[#BFDBFE] flex items-center justify-between">
                    <div>
                      <p className="text-[11px] text-[#64748B]">Master tracking ID</p>
                      <p className="font-mono font-bold text-[#0A3D91]">{order.masterTrackingId}</p>
                      <p className="text-[11px] text-[#64748B]">{order.lengthCm} × {order.widthCm} × {order.heightCm} cm · {order.finalWeightKg} kg</p>
                    </div>
                    <button className="text-xs px-3 py-2 rounded-lg border border-[#BFDBFE] bg-white flex items-center gap-2" onClick={() => printLabel(order)}>
                      <Printer size={14} /> Print label
                    </button>
                  </div>

                  <p className="text-xs font-bold text-[#334155]">Stage for dispatch</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      className="input p-2 border rounded-lg text-sm font-mono"
                      placeholder="Scan master shipping label"
                      value={masterScan}
                      onChange={e => setMasterScan(e.target.value)}
                    />
                    <select className="input p-2 border rounded-lg text-sm bg-white" value={lane} onChange={e => setLane(e.target.value)}>
                      {LANES.map(l => <option key={l}>{l}</option>)}
                    </select>
                  </div>
                  <button
                    className="btn-primary text-sm px-5 py-2.5 rounded-xl flex items-center gap-2"
                    disabled={stageMutation.isPending || !masterScan.trim()}
                    onClick={() => stageMutation.mutate()}
                  >
                    <CheckCircle2 size={14} /> Stage for Dispatch
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
