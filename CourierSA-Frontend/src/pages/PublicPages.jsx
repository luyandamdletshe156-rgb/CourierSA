import { useState } from 'react'
import { trackingApi } from '@/api'
import { StatusPill, Alert, Spinner } from '@/components/ui'
import { Search, Truck, MapPin, Package, CheckCircle, XCircle, AlertTriangle, Clock, ArrowLeft } from 'lucide-react'
import { formatDate } from '@/utils'
import { Link } from 'react-router-dom'

// Import the logo
import logo from '@/assets/logo.png'

// ── Event icon map ────────────────────────────────────────────────────────────
// Updated to use the landing page theme colors (Blue/Emerald/Slate) instead of orange
const EVENT_ICONS = {
  Booked:              { Icon: Package,       bg: 'bg-[#94A3B8]' }, 
  Approved:            { Icon: CheckCircle,   bg: 'bg-[#1E63E9]' }, 
  ReceivedAtWarehouse: { Icon: Package,       bg: 'bg-[#0A3D91]' }, 
  OutForDelivery:      { Icon: Truck,         bg: 'bg-[#1E63E9]' }, 
  Delivered:           { Icon: CheckCircle,   bg: 'bg-[#10B981]' }, 
  DeliveryFailed:      { Icon: XCircle,       bg: 'bg-[#EF4444]' }, 
  Cancelled:           { Icon: XCircle,       bg: 'bg-[#94A3B8]' }, 
  InWarehouse:         { Icon: Package,       bg: 'bg-[#0A3D91]' }, 
}

export function PublicTrackingPage() {
  const [query,   setQuery]   = useState('')
  const [result,  setResult]  = useState(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const handleTrack = async e => {
    e.preventDefault()
    if (!query.trim()) return
    setError('')
    setResult(null)
    setLoading(true)
    try {
      const res = await trackingApi.track(query.trim())
      setResult(res.data)
    } catch (err) {
      setError(err.status === 404
        ? `No parcel found with tracking number "${query.trim()}". Check the number and try again.`
        : err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F6FAFF] font-sans">
      {/* ── Header ───────────────────────────────────────────────────────────── */}
      <header className="bg-white border-b border-[#D8E4F5] px-6 lg:px-10 h-[72px] flex items-center justify-between sticky top-0 z-30 shadow-[0_1px_20px_rgba(10,61,145,0.06)]">
        <Link to="/" className="flex items-center">
          <img 
            src={logo} 
            alt="CourierSA Logo" 
            className="h-10 w-auto object-contain hover:opacity-80 transition-opacity" 
          />
        </Link>
        <div className="flex items-center gap-6">
          <Link to="/" className="hidden sm:flex items-center gap-1.5 text-sm font-medium text-[#64748B] hover:text-[#0A3D91] transition-colors">
            <ArrowLeft size={16} /> Back to Home
          </Link>
          <Link to="/login" className="px-5 py-2.5 text-sm font-semibold text-white bg-[#0A3D91] hover:bg-[#082F6D] rounded-xl transition-all shadow-[0_4px_14px_rgba(10,61,145,0.25)] active:scale-[0.98]">
            Sign in
          </Link>
        </div>
      </header>

      {/* ── Main Content ─────────────────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto px-4 py-16">
        <div className="text-center mb-10">
          <Link to="/" className="sm:hidden inline-flex items-center gap-1.5 text-sm font-medium text-[#64748B] hover:text-[#0A3D91] transition-colors mb-6">
            <ArrowLeft size={16} /> Back to Home
          </Link>
          <h1 className="text-3xl md:text-4xl font-bold text-[#172554] mb-3 tracking-tight">Track your parcel</h1>
          <p className="text-[#64748B]">Enter your tracking number to see real-time updates</p>
        </div>

        {/* Search Form */}
        <form onSubmit={handleTrack} className="flex flex-col sm:flex-row gap-3 mb-8">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
            <input
              className="w-full pl-12 pr-4 h-14 rounded-xl border border-[#D8E4F5] focus:border-[#1E63E9] focus:ring-4 focus:ring-[#1E63E9]/20 outline-none text-[#172554] text-base font-mono bg-white transition-all shadow-sm placeholder:text-[#94A3B8] placeholder:font-sans"
              placeholder="e.g. CSA-20240615-00423"
              value={query}
              onChange={e => setQuery(e.target.value.toUpperCase())}
              autoComplete="off"
            />
          </div>
          <button 
            type="submit" 
            className="px-8 h-14 flex items-center justify-center text-sm font-semibold text-white bg-[#0A3D91] hover:bg-[#082F6D] rounded-xl transition-all shadow-[0_8px_24px_rgba(10,61,145,0.25)] active:scale-[0.98] sm:w-auto w-full" 
            disabled={loading}
          >
            {loading ? <Spinner size="sm" className="text-white" /> : 'Track Parcel'}
          </button>
        </form>

        {error && (
          <div className="mb-6">
            <Alert type="error" message={error} />
          </div>
        )}

        {/* Result Card */}
        {result && (
          <div className="bg-white rounded-[24px] border border-[#D8E4F5] p-6 md:p-8 shadow-[0_20px_50px_-15px_rgba(10,61,145,0.1)] animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-4 mb-8 pb-6 border-b border-[#D8E4F5]">
              <div>
                <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wider mb-1">Tracking Number</p>
                <span className="text-xl font-bold text-[#172554] font-mono block mb-3">{result.trackingNumber}</span>
                <StatusPill status={result.status.replace(/\s/g, '')} />
              </div>
              <div className="text-left sm:text-right bg-[#F6FAFF] p-3 rounded-xl border border-[#D8E4F5] min-w-[140px]">
                <p className="text-[10px] text-[#64748B] uppercase tracking-wide mb-1">Service Level</p>
                <p className="text-sm font-semibold text-[#172554] capitalize mb-3">{result.serviceType}</p>
                {result.estimatedDelivery && (
                  <>
                    <p className="text-[10px] text-[#64748B] uppercase tracking-wide mb-1">Est. Delivery</p>
                    <p className="text-sm font-semibold text-[#1E63E9]">
                      {formatDate(result.estimatedDelivery)}
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* Destination */}
            {result.destination && (
              <div className="flex items-center gap-3 text-sm text-[#334155] mb-8 px-4 py-3 bg-[#DCEEFF]/40 rounded-xl border border-[#DCEEFF]">
                <div className="w-8 h-8 rounded-full bg-[#1E63E9]/10 flex items-center justify-center flex-shrink-0">
                  <MapPin size={16} className="text-[#1E63E9]" />
                </div>
                <span>Delivering to <strong className="text-[#172554]">{result.destination}</strong></span>
              </div>
            )}

            {/* Timeline */}
            <div>
              <h3 className="text-xs font-semibold text-[#0A3D91] uppercase tracking-wider mb-6">
                Tracking History
              </h3>
              <div className="space-y-0">
                {result.events?.map((event, i) => {
                  const { Icon, bg } = EVENT_ICONS[event.eventType] ?? { Icon: Clock, bg: 'bg-[#94A3B8]' }
                  const isLast = i === result.events.length - 1
                  
                  return (
                    <div key={i} className="relative pl-10 pb-8 last:pb-0 group">
                      {!isLast && (
                        <div className="absolute left-[19px] top-8 bottom-0 w-[2px] bg-[#D8E4F5] group-hover:bg-[#1E63E9]/20 transition-colors" />
                      )}
                      <div className={`absolute left-1.5 top-1 w-8 h-8 rounded-full flex items-center justify-center border-[3px] border-white shadow-sm z-10 ${bg}`}>
                        <Icon size={14} className="text-white" />
                      </div>
                      <div className="pl-2">
                        <p className="text-sm font-semibold text-[#172554]">{event.description}</p>
                        {event.location && (
                          <p className="text-xs font-medium text-[#64748B] mt-1 flex items-center gap-1.5">
                            <MapPin size={12} className="text-[#94A3B8]" /> {event.location}
                          </p>
                        )}
                        <p className="text-xs text-[#94A3B8] mt-1.5 font-mono bg-[#F6FAFF] inline-block px-2 py-0.5 rounded border border-[#D8E4F5]">
                          {formatDate(event.occurredAt, { time: true })}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── 404 ───────────────────────────────────────────────────────────────────────
export function NotFoundPage() {
  return (
    <div className="min-h-screen bg-[#F6FAFF] flex flex-col font-sans">
      <header className="bg-white border-b border-[#D8E4F5] px-6 h-[72px] flex items-center">
        <Link to="/">
          <img src={logo} alt="CourierSA Logo" className="h-10 w-auto object-contain" />
        </Link>
      </header>
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <p className="text-7xl font-bold text-[#D8E4F5] font-mono mb-4">404</p>
          <h1 className="text-2xl font-bold text-[#172554] mb-3">Page not found</h1>
          <p className="text-[#64748B] mb-8 leading-relaxed">The page you're looking for doesn't exist or has been moved.</p>
          <Link to="/" className="inline-flex items-center gap-2 px-6 py-3.5 text-sm font-semibold text-white bg-[#0A3D91] hover:bg-[#082F6D] rounded-xl transition-all shadow-[0_8px_24px_rgba(10,61,145,0.25)]">
            <ArrowLeft size={16} /> Return Home
          </Link>
        </div>
      </div>
    </div>
  )
}

// ── Unauthorized ──────────────────────────────────────────────────────────────
export function UnauthorizedPage() {
  return (
    <div className="min-h-screen bg-[#F6FAFF] flex flex-col font-sans">
      <header className="bg-white border-b border-[#D8E4F5] px-6 h-[72px] flex items-center">
        <Link to="/">
          <img src={logo} alt="CourierSA Logo" className="h-10 w-auto object-contain" />
        </Link>
      </header>
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-[#EF4444]/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertTriangle size={32} className="text-[#EF4444]" />
          </div>
          <h1 className="text-2xl font-bold text-[#172554] mb-3">Access denied</h1>
          <p className="text-[#64748B] mb-8 leading-relaxed">You don't have the required permissions to view this page. Please log in with a different account.</p>
          <Link to="/" className="inline-flex items-center gap-2 px-6 py-3.5 text-sm font-semibold text-white bg-[#0A3D91] hover:bg-[#082F6D] rounded-xl transition-all shadow-[0_8px_24px_rgba(10,61,145,0.25)]">
            <ArrowLeft size={16} /> Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}