import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import AppShell from '@/components/layout/AppShell'
import { LiveDot, TrackingBadge, Spinner } from '@/components/ui'
import { driverApi } from '@/api'
import { useTracking } from '@/context/TrackingContext'
import {
  Truck, MapPin, Phone, Package, Clock,
  Radio, Wifi, WifiOff, Play, Square,
  ChevronRight, Navigation, AlertTriangle,
  RefreshCw, Users
} from 'lucide-react'
import { formatDate, timeAgo } from '@/utils'
import clsx from 'clsx'

// ── Leaflet icon fix (webpack/vite asset issue) ───────────────────────────────
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

// ── SA city coordinates for demo simulation ───────────────────────────────────
const SA_ROUTES = [
  {
    // Johannesburg CBD → Sandton → Midrand
    name: 'JHB North Corridor',
    waypoints: [
      [-26.2041, 28.0473], [-26.1952, 28.0542], [-26.1067, 28.0568],
      [-25.9989, 28.1269], [-25.9659, 28.1334],
    ],
  },
  {
    // Cape Town CBD → Sea Point → Camps Bay
    name: 'CPT Atlantic Seaboard',
    waypoints: [
      [-33.9249, 18.4241], [-33.9195, 18.3986], [-33.9483, 18.3776],
      [-33.9604, 18.3746], [-33.9721, 18.3803],
    ],
  },
  {
    // Durban CBD → Umhlanga
    name: 'DBN North Coast',
    waypoints: [
      [-29.8587, 31.0218], [-29.8121, 31.0419], [-29.7392, 31.0682],
      [-29.7218, 31.0794], [-29.7047, 31.0782],
    ],
  },
  {
    // Pretoria CBD → Centurion
    name: 'PTA South Corridor',
    waypoints: [
      [-25.7479, 28.2293], [-25.8110, 28.2232], [-25.8509, 28.1880],
      [-25.8609, 28.1880], [-25.8710, 28.1820],
    ],
  },
]

const DEMO_DRIVERS = [
  { id: 'demo-1', firstName: 'Sipho',   lastName: 'Dlamini',  route: 0, color: '#F97316' },
  { id: 'demo-2', firstName: 'Zanele',  lastName: 'Nkosi',    route: 1, color: '#3B82F6' },
  { id: 'demo-3', firstName: 'Trevor',  lastName: 'Williams', route: 2, color: '#10B981' },
  { id: 'demo-4', firstName: 'Nomvula', lastName: 'Khumalo',  route: 3, color: '#8B5CF6' },
]

// ── Custom SVG driver marker ───────────────────────────────────────────────────
function createDriverIcon(driver, isSelected, color = '#F97316') {
  const initials = `${driver.firstName?.[0] ?? '?'}${driver.lastName?.[0] ?? '?'}`
  const statusColor = {
    OnDelivery: color,
    Available:  '#10B981',
    OffDuty:    '#6B7280',
    Suspended:  '#EF4444',
  }[driver.status] ?? color

  const size      = isSelected ? 48 : 40
  const pulse     = driver.status === 'OnDelivery'
  const ringWidth = isSelected ? 3 : 2

  const svg = `
    <svg width="${size}" height="${size + 8}" viewBox="0 0 ${size} ${size + 8}"
         xmlns="http://www.w3.org/2000/svg">
      ${pulse ? `
        <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"
          fill="${statusColor}" opacity="0.2">
          <animate attributeName="r" values="${size / 2};${size / 2 + 8};${size / 2}"
                   dur="2s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.2;0;0.2"
                   dur="2s" repeatCount="indefinite"/>
        </circle>
      ` : ''}
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1}"
        fill="white" stroke="${statusColor}" stroke-width="${ringWidth}"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 4}"
        fill="${statusColor}" opacity="0.15"/>
      <text x="${size / 2}" y="${size / 2 + 5}"
        text-anchor="middle" font-family="Inter,sans-serif"
        font-size="${isSelected ? 14 : 12}" font-weight="700"
        fill="${statusColor}">${initials}</text>
      <!-- drop pin tail -->
      <polygon points="${size / 2 - 5},${size - 2} ${size / 2 + 5},${size - 2} ${size / 2},${size + 6}"
        fill="${statusColor}"/>
    </svg>`

  return L.divIcon({
    html:        svg,
    className:   '',
    iconSize:    [size, size + 8],
    iconAnchor:  [size / 2, size + 8],
    popupAnchor: [0, -(size + 8)],
  })
}

// ── Destination pin marker ────────────────────────────────────────────────────
function createDestinationIcon() {
  const svg = `
    <svg width="28" height="36" viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg">
      <path d="M14 0C6.27 0 0 6.27 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.27 21.73 0 14 0z"
        fill="#EF4444"/>
      <circle cx="14" cy="14" r="6" fill="white"/>
      <circle cx="14" cy="14" r="3" fill="#EF4444"/>
    </svg>`
  return L.divIcon({
    html: svg, className: '',
    iconSize: [28, 36], iconAnchor: [14, 36], popupAnchor: [0, -36],
  })
}

// ── Interpolate along route ───────────────────────────────────────────────────
function interpolateRoute(waypoints, progress) {
  if (progress <= 0) return waypoints[0]
  if (progress >= 1) return waypoints[waypoints.length - 1]

  const totalSegments = waypoints.length - 1
  const segmentLength = 1 / totalSegments
  const segmentIndex  = Math.floor(progress / segmentLength)
  const segmentProgress = (progress % segmentLength) / segmentLength

  const from = waypoints[Math.min(segmentIndex, waypoints.length - 2)]
  const to   = waypoints[Math.min(segmentIndex + 1, waypoints.length - 1)]

  return [
    from[0] + (to[0] - from[0]) * segmentProgress,
    from[1] + (to[1] - from[1]) * segmentProgress,
  ]
}

function calcBearing(from, to) {
  const dLng = (to[1] - from[1]) * Math.PI / 180
  const lat1  = from[0] * Math.PI / 180
  const lat2  = to[0]   * Math.PI / 180
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360
}

// ── Map re-centring helper ────────────────────────────────────────────────────
function MapController({ centre, zoom }) {
  const map = useMap()
  useEffect(() => {
    if (centre) map.flyTo(centre, zoom ?? map.getZoom(), { duration: 1.2 })
  }, [centre, zoom, map])
  return null
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function LiveMapPage() {
  const qc = useQueryClient()
  const { connected, driverLocations } = useTracking() ?? {}

  // REST snapshot of drivers (initial load + refresh)
  const { data: driversData, isLoading } = useQuery({
    queryKey: ['driver-locations-snapshot'],
    queryFn:  driverApi.locations,
    refetchInterval: 30000,
  })
  const snapshotDrivers = driversData?.data ?? []

  // Merge REST snapshot with live SignalR updates
  const [liveDrivers, setLiveDrivers] = useState({})
  useEffect(() => {
    const merged = {}
    snapshotDrivers.forEach(d => {
      merged[d.driverId] = {
        ...d,
        lat: d.latitude  ?? -26.2041,
        lng: d.longitude ?? 28.0473,
        trail: d.latitude ? [[d.latitude, d.longitude]] : [],
      }
    })
    setLiveDrivers(merged)
  }, [snapshotDrivers])

  // Merge incoming SignalR location updates
  useEffect(() => {
    Object.entries(driverLocations ?? {}).forEach(([driverId, loc]) => {
      setLiveDrivers(prev => {
        if (!prev[driverId]) return prev
        const existing = prev[driverId]
        const trail    = [...(existing.trail ?? []), [loc.lat, loc.lng]].slice(-8)
        return {
          ...prev,
          [driverId]: {
            ...existing,
            lat:          loc.lat,
            lng:          loc.lng,
            heading:      loc.heading,
            speed:        loc.speed,
            lastUpdatedAt:loc.updatedAt,
            trail,
          },
        }
      })
    })
  }, [driverLocations])

  // Demo simulation state
  const [simActive, setSimActive] = useState(false)
  const [simDrivers, setSimDrivers] = useState({})
  const simRef = useRef(null)

  const startSim = useCallback(() => {
    const initial = {}
    DEMO_DRIVERS.forEach(d => {
      initial[d.id] = {
        ...d,
        status:       'OnDelivery',
        lat:          SA_ROUTES[d.route].waypoints[0][0],
        lng:          SA_ROUTES[d.route].waypoints[0][1],
        progress:     0,
        speed:        35 + Math.random() * 25,
        trail:        [SA_ROUTES[d.route].waypoints[0]],
        activeDelivery: {
          trackingNumber: `CSA-DEMO-${1000 + d.id.slice(-1)}`,
          recipientName:  ['Thabo M', 'Zanele N', 'Sipho D', 'Lindiwe Z'][DEMO_DRIVERS.indexOf(d)],
          deliveryCity:   SA_ROUTES[d.route].name.split(' ')[0],
          status:        'InProgress',
        },
      }
    })
    setSimDrivers(initial)
    setSimActive(true)
  }, [])

  const stopSim = useCallback(() => {
    setSimActive(false)
    setSimDrivers({})
    if (simRef.current) clearInterval(simRef.current)
  }, [])

  useEffect(() => {
    if (!simActive) return

    simRef.current = setInterval(() => {
      setSimDrivers(prev => {
        const updated = { ...prev }
        DEMO_DRIVERS.forEach(d => {
          const cur = updated[d.id]
          if (!cur) return
          const route    = SA_ROUTES[d.route]
          const step     = 0.006 + Math.random() * 0.003
          const progress = Math.min(cur.progress + step, 1)
          const pos      = interpolateRoute(route.waypoints, progress)
          const prevPos  = interpolateRoute(route.waypoints, Math.max(0, progress - step))
          const heading  = calcBearing(prevPos, pos)
          const trail    = [...cur.trail, pos].slice(-8)

          updated[d.id] = {
            ...cur,
            lat:      pos[0],
            lng:      pos[1],
            heading,
            progress: progress >= 1 ? 0 : progress,  // loop
            trail,
          }
        })
        return updated
      })
    }, 1500)

    return () => clearInterval(simRef.current)
  }, [simActive])

  // Combine real + demo drivers for display
  const allDrivers = simActive
    ? Object.values(simDrivers)
    : Object.values(liveDrivers)

  const activeCount = allDrivers.filter(d => d.status === 'OnDelivery').length

  // Selected driver for side panel
  const [selectedId, setSelectedId] = useState(null)
  const selectedDriver = allDrivers.find(d => (d.driverId ?? d.id) === selectedId) ?? null

  // Map control
  const [mapCentre, setMapCentre] = useState(null)
  const [mapZoom,   setMapZoom]   = useState(null)
  const [mapReady,  setMapReady]  = useState(false)

  const flyToDriver = (driver) => {
    setSelectedId(driver.driverId ?? driver.id)
    setMapCentre([driver.lat, driver.lng])
    setMapZoom(14)
  }

  const onlineCount  = allDrivers.filter(d => d.status !== 'OffDuty' && d.status !== 'Suspended').length
  const offlineCount = allDrivers.filter(d => d.status === 'OffDuty').length

  return (
    <AppShell title="Live Map">
      {/* ── Page header ── */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="page-title">Live Fleet Map</h1>
          <p className="page-subtitle">
            Real-time driver positions and delivery status
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* SignalR status */}
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            {connected
              ? <><LiveDot active /><span>Live</span></>
              : <><WifiOff size={12} className="text-gray-400" /><span>Offline</span></>}
          </div>

          {/* Refresh */}
          <button
            className="btn-ghost btn-sm"
            onClick={() => qc.invalidateQueries({ queryKey: ['driver-locations-snapshot'] })}
          >
            <RefreshCw size={14} /> Refresh
          </button>

          {/* Demo toggle */}
          <button
            onClick={simActive ? stopSim : startSim}
            className={clsx(
              'btn btn-sm flex items-center gap-1.5 font-medium',
              simActive
                ? 'bg-red-100 text-red-600 hover:bg-red-200 border border-red-200'
                : 'bg-brand-50 text-brand-600 hover:bg-brand-100 border border-brand-200'
            )}
          >
            {simActive
              ? <><Square size={12} className="fill-current" /> Stop demo</>
              : <><Play  size={12} className="fill-current" /> Demo simulation</>}
          </button>
        </div>
      </div>

      {/* ── Stats strip ── */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Total drivers',  value: allDrivers.length, color: 'text-gray-700',    bg: 'bg-gray-100'    },
          { label: 'On delivery',    value: activeCount,        color: 'text-brand-600',   bg: 'bg-brand-50'    },
          { label: 'Available',      value: onlineCount - activeCount, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Off duty',       value: offlineCount,       color: 'text-gray-400',    bg: 'bg-gray-50'     },
        ].map(s => (
          <div key={s.label} className={clsx('rounded-xl px-4 py-3 border border-gray-200', s.bg)}>
            <p className={clsx('text-2xl font-bold', s.color)}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ── Main layout: side panel + map ── */}
      <div className="flex gap-4 h-[calc(100vh-280px)] min-h-[520px]">

        {/* ── Driver roster panel ── */}
        <div className="w-72 flex-shrink-0 flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <Users size={15} className="text-gray-400" />
              Drivers
            </span>
            <span className="text-xs text-gray-400">{allDrivers.length} total</span>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-thin divide-y divide-gray-100">
            {isLoading && !simActive ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : allDrivers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <Truck size={28} className="text-gray-300 mb-2" />
                <p className="text-sm text-gray-500 font-medium">No drivers online</p>
                <p className="text-xs text-gray-400 mt-1">
                  Press "Demo simulation" to see live tracking in action
                </p>
              </div>
            ) : (
              allDrivers.map(driver => {
                const id        = driver.driverId ?? driver.id
                const isActive  = driver.status === 'OnDelivery'
                const isSelected= id === selectedId
                const color     = DEMO_DRIVERS.find(d => d.id === id)?.color ?? '#F97316'

                return (
                  <button
                    key={id}
                    onClick={() => flyToDriver(driver)}
                    className={clsx(
                      'w-full text-left px-4 py-3 transition-colors',
                      isSelected ? 'bg-brand-50' : 'hover:bg-gray-50'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      {/* Avatar */}
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 relative"
                        style={{ backgroundColor: color }}
                      >
                        {driver.firstName?.[0]}{driver.lastName?.[0]}
                        {isActive && (
                          <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-brand-500 rounded-full border-2 border-white" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-800 truncate">
                            {driver.firstName} {driver.lastName}
                          </p>
                          <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />
                        </div>

                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={clsx(
                            'text-xs font-medium',
                            driver.status === 'OnDelivery' ? 'text-brand-500'
                            : driver.status === 'Available' ? 'text-emerald-500'
                            : 'text-gray-400'
                          )}>
                            {driver.status === 'OnDelivery' ? '● On delivery'
                             : driver.status === 'Available' ? '● Available'
                             : '○ Off duty'}
                          </span>
                          {driver.speed && (
                            <span className="text-xs text-gray-400">
                              {Math.round(driver.speed)} km/h
                            </span>
                          )}
                        </div>

                        {driver.activeDelivery && (
                          <p className="text-xs text-gray-400 truncate mt-0.5">
                            → {driver.activeDelivery.deliveryCity ?? driver.activeDelivery.recipientName}
                          </p>
                        )}

                        {driver.lastUpdatedAt && (
                          <p className="text-xs text-gray-300 mt-0.5">
                            {timeAgo(driver.lastUpdatedAt)}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* ── Map ── */}
        <div className="flex-1 relative rounded-xl overflow-hidden border border-gray-200">
          <MapContainer
            center={[-28.4793, 24.6727]}  // SA geographic centre
            zoom={6}
            className="w-full h-full"
            zoomControl={false}
            whenReady={() => setMapReady(true)}
          >
            <TileLayer
              attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {mapReady && mapCentre && (
              <MapController centre={mapCentre} zoom={mapZoom} />
            )}

            {allDrivers.map(driver => {
              const id       = driver.driverId ?? driver.id
              const position = [driver.lat, driver.lng]
              const isSelD   = id === selectedId
              const color    = DEMO_DRIVERS.find(d => d.id === id)?.color ?? '#F97316'

              return (
                <div key={id}>
                  {/* Breadcrumb trail */}
                  {driver.trail?.length > 1 && (
                    <Polyline
                      positions={driver.trail}
                      pathOptions={{
                        color,
                        weight: isSelD ? 3 : 2,
                        opacity: isSelD ? 0.7 : 0.35,
                        dashArray: '6 4',
                      }}
                    />
                  )}

                  {/* Line from driver to destination */}
                  {isSelD && driver.activeDelivery?.deliveryLat && (
                    <Polyline
                      positions={[
                        position,
                        [driver.activeDelivery.deliveryLat, driver.activeDelivery.deliveryLng],
                      ]}
                      pathOptions={{ color: '#EF4444', weight: 2, opacity: 0.5, dashArray: '8 5' }}
                    />
                  )}

                  {/* Destination pin */}
                  {isSelD && driver.activeDelivery?.deliveryLat && (
                    <Marker
                      position={[driver.activeDelivery.deliveryLat, driver.activeDelivery.deliveryLng]}
                      icon={createDestinationIcon()}
                    >
                      <Popup>
                        <div className="text-xs p-1">
                          <p className="font-semibold">Delivery destination</p>
                          <p className="text-gray-500">{driver.activeDelivery.recipientName}</p>
                          <p className="text-gray-500">{driver.activeDelivery.deliveryCity}</p>
                        </div>
                      </Popup>
                    </Marker>
                  )}

                  {/* Driver marker */}
                  <Marker
                    position={position}
                    icon={createDriverIcon(driver, isSelD, color)}
                    eventHandlers={{ click: () => flyToDriver(driver) }}
                  >
                    <Popup>
                      <div className="text-xs p-1 min-w-[140px]">
                        <p className="font-bold text-sm">{driver.firstName} {driver.lastName}</p>
                        <p className="text-gray-500 mt-0.5">{driver.status}</p>
                        {driver.activeDelivery && (
                          <p className="font-mono text-xs mt-1 text-brand-600">
                            {driver.activeDelivery.trackingNumber}
                          </p>
                        )}
                        {driver.speed && (
                          <p className="text-gray-400 mt-0.5">{Math.round(driver.speed)} km/h</p>
                        )}
                      </div>
                    </Popup>
                  </Marker>
                </div>
              )
            })}
          </MapContainer>

          {/* Map overlay: driver detail panel */}
          {selectedDriver && (
            <DriverDetailPanel
              driver={selectedDriver}
              onClose={() => setSelectedId(null)}
            />
          )}

          {/* Map overlay: loading */}
          {isLoading && !simActive && (
            <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
              <Spinner size="lg" />
            </div>
          )}

          {/* Simulation badge */}
          {simActive && (
            <div className="absolute top-3 left-3 bg-amber-500 text-white text-xs font-bold
                            px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5 z-[1000]">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
              DEMO MODE — Simulated GPS
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}

// ── Driver Detail Side Panel ──────────────────────────────────────────────────
function DriverDetailPanel({ driver, onClose }) {
  const delivery = driver.activeDelivery
  const color    = DEMO_DRIVERS.find(d => d.id === (driver.driverId ?? driver.id))?.color ?? '#F97316'

  return (
    <div className="absolute bottom-4 right-4 w-72 bg-white rounded-xl shadow-modal
                    border border-gray-200 z-[1000] animate-slide-in overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-gray-100"
           style={{ borderLeftWidth: 3, borderLeftColor: color }}>
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold"
            style={{ backgroundColor: color }}
          >
            {driver.firstName?.[0]}{driver.lastName?.[0]}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">
              {driver.firstName} {driver.lastName}
            </p>
            <p className={clsx(
              'text-xs font-medium',
              driver.status === 'OnDelivery' ? 'text-brand-500' : 'text-emerald-500'
            )}>
              {driver.status === 'OnDelivery' ? '● On delivery' : '● Available'}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg leading-none">
          ×
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 border-b border-gray-100">
        {[
          { label: 'Speed',    value: driver.speed ? `${Math.round(driver.speed)} km/h` : '—' },
          { label: 'Total',    value: driver.totalDeliveries ?? '—' },
          { label: 'Success',  value: driver.successfulDeliveries
              ? `${Math.round((driver.successfulDeliveries / (driver.totalDeliveries || 1)) * 100)}%`
              : '—' },
        ].map(s => (
          <div key={s.label} className="text-center px-2 py-2.5">
            <p className="text-base font-bold text-gray-800">{s.value}</p>
            <p className="text-xs text-gray-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Active delivery */}
      {delivery ? (
        <div className="px-4 py-3">
          <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">
            Active delivery
          </p>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Package size={13} className="text-gray-400 flex-shrink-0" />
              <span className="font-mono text-xs font-semibold text-brand-600">
                {delivery.trackingNumber}
              </span>
            </div>
            <div className="flex items-start gap-2">
              <MapPin size={13} className="text-gray-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium text-gray-700">{delivery.recipientName}</p>
                <p className="text-xs text-gray-500">
                  {delivery.deliveryAddress ?? delivery.deliveryCity}
                </p>
              </div>
            </div>
            {delivery.recipientPhone && (
              <div className="flex items-center gap-2">
                <Phone size={13} className="text-gray-400 flex-shrink-0" />
                <a
                  href={`tel:${delivery.recipientPhone}`}
                  className="text-xs text-brand-500 hover:text-brand-600 font-medium"
                >
                  {delivery.recipientPhone}
                </a>
              </div>
            )}
            {delivery.dispatchedAt && (
              <div className="flex items-center gap-2">
                <Clock size={13} className="text-gray-400 flex-shrink-0" />
                <span className="text-xs text-gray-500">
                  Dispatched {timeAgo(delivery.dispatchedAt)}
                </span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="px-4 py-4 text-center">
          <p className="text-xs text-gray-400">No active delivery assigned</p>
        </div>
      )}

      {/* Position */}
      <div className="px-4 pb-3">
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <Navigation size={11} />
          <span className="font-mono">
            {driver.lat?.toFixed(5)}, {driver.lng?.toFixed(5)}
          </span>
        </div>
        {driver.lastUpdatedAt && (
          <p className="text-xs text-gray-300 mt-0.5">
            Updated {timeAgo(driver.lastUpdatedAt)}
          </p>
        )}
      </div>
    </div>
  )
}
