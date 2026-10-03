import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { EmptyState, PageLoader, Alert } from '@/components/ui'
import { parcelApi } from '@/api'
import { Truck, ScanLine, CheckCircle2, Circle } from 'lucide-react'
import clsx from 'clsx'

// Route Release (warehouse staff): an extra step after UC14 sign-off, not one of the numbered use cases.
// Scan every parcel on the manifest; the route is released to the driver only
// when the scan matches the manifest exactly. Pickup tasks are not in the
// warehouse, so they are not scanned.

function ReleaseCard({ route }) {
  const qc = useQueryClient()
  const [scanned, setScanned] = useState([])
  const [input, setInput] = useState('')
  const [message, setMessage] = useState('')

  const manifest = route.parcels.filter(p => !p.isPickup)
  const pickups = route.parcels.filter(p => p.isPickup)
  const known = new Set(manifest.map(p => p.trackingNumber.toUpperCase()))

  const addScan = () => {
    const code = input.trim().toUpperCase()
    if (!code) return
    setScanned(s => (s.includes(code) ? s : [...s, code]))
    setInput('')
  }

  const release = useMutation({
    mutationFn: () => parcelApi.releaseRoute(route.routeId, scanned),
    onSuccess: () => {
      setMessage('Manifest verified. Route released to the driver.')
      qc.invalidateQueries({ queryKey: ['routes-ready-for-release'] })
    },
  })

  const unexpected = scanned.filter(c => !known.has(c))
  const allScanned = manifest.every(p => scanned.includes(p.trackingNumber.toUpperCase()))
  const canRelease = allScanned && unexpected.length === 0

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-[#0F172A] flex items-center gap-1.5">
            <Truck size={15} /> Route {String(route.routeId).substring(0, 8)}
          </p>
          <p className="text-xs text-[#64748B]">
            {route.vehicleRegistration ?? 'Vehicle'} · {route.totalWeightKg} / {route.payloadCapacityKg} kg
          </p>
        </div>
        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-[#F0FDF4] text-[#166534]">
          {scanned.filter(c => known.has(c)).length} / {manifest.length} scanned
        </span>
      </div>

      <div className="divide-y divide-[#E2E8F0] border border-[#E2E8F0] rounded-xl">
        {manifest.map(p => {
          const done = scanned.includes(p.trackingNumber.toUpperCase())
          return (
            <div key={p.parcelId} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              {done ? <CheckCircle2 size={16} className="text-[#16A34A]" /> : <Circle size={16} className="text-[#CBD5E1]" />}
              <span className="font-mono text-xs">{p.trackingNumber}</span>
              <span className="text-[#64748B] truncate">{p.recipient}, {p.city}</span>
              <span className="ml-auto font-semibold">{p.weightKg} kg</span>
            </div>
          )
        })}
        {manifest.length === 0 && <p className="px-3 py-2.5 text-sm text-[#64748B]">No warehouse parcels to scan. This route only has pickups.</p>}
      </div>

      {pickups.length > 0 && (
        <p className="text-xs text-[#64748B]">{pickups.length} pickup task(s) on this route do not need scanning.</p>
      )}

      {unexpected.length > 0 && (
        <Alert type="error" message={`Not on this manifest: ${unexpected.join(', ')}`} />
      )}

      <div className="flex gap-2">
        <input
          className="input"
          placeholder="Scan or type a tracking number"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addScan() } }}
        />
        <button className="btn-secondary text-sm" onClick={addScan}><ScanLine size={14} /> Add</button>
      </div>

      {message && <Alert type="success" message={message} />}
      {release.error && <Alert type="error" message={release.error.message} />}

      <button
        className={clsx('btn-primary text-sm', !canRelease && 'opacity-60')}
        disabled={!canRelease || release.isPending}
        onClick={() => { setMessage(''); release.mutate() }}
      >
        {release.isPending ? 'Releasing…' : 'Verify & release to driver'}
      </button>
    </div>
  )
}

export default function RouteReleasePage() {
  const { data, isLoading } = useQuery({
    queryKey: ['routes-ready-for-release'],
    queryFn: () => parcelApi.routesReadyForRelease(),
    refetchInterval: 20000,
  })
  const routes = Array.isArray(data) ? data : data?.data ?? []

  return (
    <AppShell title="Route Release">
      <div className="page-header">
        <div>
          <h1 className="page-title">Route Release</h1>
          <p className="page-subtitle">Scan the packed parcels against each route's manifest, then release the route to the outbound vehicle.</p>
        </div>
      </div>
      {isLoading ? <PageLoader /> : routes.length === 0 ? (
        <EmptyState title="No routes waiting" description="Routes appear here once the dispatcher has signed off their manifest (payload validation)." />
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {routes.map(r => <ReleaseCard key={r.routeId} route={r} />)}
        </div>
      )}
    </AppShell>
  )
}
