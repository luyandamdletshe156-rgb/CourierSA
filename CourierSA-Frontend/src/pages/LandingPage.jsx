import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  Truck, Package, CheckCircle, Search, ArrowRight, Menu, X,
  Zap, ShieldCheck, BarChart3, Building2, Star, ChevronDown,
  Phone, Mail, Facebook, Twitter, Instagram, Linkedin,
  CreditCard, Globe, FileCheck, Users, Boxes, Calendar, Route as RouteIcon,
  LayoutDashboard, Radio,
} from 'lucide-react'

// 👉 IMPORT THE LOGO HERE
import logo from '@/assets/logo.png' 

// ─────────────────────────────────────────────────────────────────────────────
// Dark Azure + Soft Blue token system — deliberately separate from the app's
// orange product theme (tailwind.config brand-*). This page is the only place
// these hex values are used, via Tailwind arbitrary-value classes, so nothing
// in the logged-in product is affected.
//   primary   #0A3D91   hover   #082F6D   secondary #1E63E9
//   soft-blue #DCEEFF   page    #F6FAFF   border    #D8E4F5
//   heading   #172554   body    #64748B
// ─────────────────────────────────────────────────────────────────────────────

// ── Count-up hook for the statistics band ────────────────────────────────────
function useCountUp(target, durationMs = 1600) {
  const [value, setValue] = useState(0)
  const ref = useRef(null)
  const started = useRef(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true
        const start = performance.now()
        const tick = (now) => {
          const progress = Math.min((now - start) / durationMs, 1)
          const eased = 1 - Math.pow(1 - progress, 3)
          setValue(Math.round(target * eased))
          if (progress < 1) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }
    }, { threshold: 0.4 })
    obs.observe(node)
    return () => obs.disconnect()
  }, [target, durationMs])

  return [value, ref]
}

// ── Nav ───────────────────────────────────────────────────────────────────────
function Nav() {
  const [open, setOpen]       = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const links = [
    { label: 'Services',        href: '#services' },
    { label: 'Track Parcel',    to: '/track' },
    { label: 'Business',        href: '#business' },
    { label: 'Become a Driver', href: '#final-cta' },
    { label: 'Pricing',         href: '#services' },
    { label: 'About',           href: '#footer' },
    { label: 'Contact',         href: '#footer' },
  ]

  return (
    <header className={`sticky top-0 z-30 transition-all duration-300 ${
      scrolled ? 'bg-white/80 backdrop-blur-md border-b border-[#D8E4F5] shadow-[0_1px_20px_rgba(10,61,145,0.06)]' : 'bg-transparent border-b border-transparent'
    }`}>
      <div className="max-w-[1440px] mx-auto px-6 lg:px-10 h-[72px] flex items-center justify-between">
        <Link to="/" className="flex items-center">
          {/* 👉 USE THE IMPORTED LOGO HERE */}
          <img src={logo} alt="CourierSA Logo" className="h-10 w-auto object-contain" />
        </Link>

        <nav className="hidden lg:flex items-center gap-8">
          {links.map(l => l.to ? (
            <Link key={l.label} to={l.to} className="text-sm font-medium text-[#334155] hover:text-[#0A3D91] transition-colors">
              {l.label}
            </Link>
          ) : (
            <a key={l.label} href={l.href} className="text-sm font-medium text-[#334155] hover:text-[#0A3D91] transition-colors">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden lg:flex items-center gap-3">
          <Link to="/login" className="px-4 py-2 text-sm font-medium text-[#0A3D91] hover:bg-[#DCEEFF] rounded-xl transition-colors">
            Login
          </Link>
          <Link to="/register" className="px-5 py-2.5 text-sm font-semibold text-white bg-[#0A3D91] hover:bg-[#082F6D] rounded-xl transition-all shadow-[0_4px_14px_rgba(10,61,145,0.25)] active:scale-[0.98]">
            Get Started
          </Link>
        </div>

        <button onClick={() => setOpen(o => !o)} className="lg:hidden text-[#172554]">
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {open && (
        <div className="lg:hidden bg-white border-t border-[#D8E4F5] px-6 py-5 space-y-4">
          {links.map(l => l.to ? (
            <Link key={l.label} to={l.to} onClick={() => setOpen(false)} className="block text-sm font-medium text-[#334155]">{l.label}</Link>
          ) : (
            <a key={l.label} href={l.href} onClick={() => setOpen(false)} className="block text-sm font-medium text-[#334155]">{l.label}</a>
          ))}
          <div className="flex gap-3 pt-2">
            <Link to="/login" className="flex-1 text-center px-4 py-2.5 text-sm font-medium text-[#0A3D91] border border-[#D8E4F5] rounded-xl">Login</Link>
            <Link to="/register" className="flex-1 text-center px-4 py-2.5 text-sm font-semibold text-white bg-[#0A3D91] rounded-xl">Get Started</Link>
          </div>
        </div>
      )}
    </header>
  )
}

// 👉 Moved outside to prevent array recreation and hook dependency warnings
const stops = ['Order received', 'Courier assigned', 'Picked up', 'In transit', 'Out for delivery']

// ── Hero: right-side product mockup ──────────────────────────────────────────
function HeroDashboard() {
  const [step, setStep] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setStep(s => (s + 1) % stops.length), 2400)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="relative">
      <div className="absolute -inset-6 bg-[#1E63E9]/10 blur-3xl rounded-[40px]" />
      <div className="relative bg-white rounded-[20px] border border-[#D8E4F5] shadow-[0_30px_80px_-20px_rgba(10,61,145,0.25)] p-5 w-full max-w-[420px]">

        {/* Map panel */}
        <div className="relative rounded-2xl bg-[#F6FAFF] border border-[#D8E4F5] h-52 mb-4 overflow-hidden">
          <svg viewBox="0 0 400 210" className="absolute inset-0 w-full h-full">
            <defs>
              <pattern id="heroGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M20 0H0V20" fill="none" stroke="#D8E4F5" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="400" height="210" fill="url(#heroGrid)" />
            <path d="M40 170 C 120 150, 140 90, 220 70 S 320 50, 360 40"
                  fill="none" stroke="#1E63E9" strokeWidth="3" strokeDasharray="2 8" strokeLinecap="round" opacity="0.8" />
            <circle cx="40" cy="170" r="5" fill="#0A3D91" />
            <circle cx="360" cy="40" r="5" fill="#172554" />
            <g transform="translate(210, 76)">
              <circle r="12" fill="#1E63E9" opacity="0.25" className="animate-ping" style={{ transformOrigin: 'center' }} />
              <circle r="7" fill="#1E63E9" />
              <circle r="3" fill="white" />
            </g>
          </svg>
          <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-white/90 backdrop-blur px-2.5 py-1 rounded-full border border-[#D8E4F5]">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
            </span>
            <span className="text-[11px] font-medium text-[#334155]">Live</span>
          </div>
          <div className="absolute bottom-3 right-3 bg-white/95 backdrop-blur px-3 py-2 rounded-xl border border-[#D8E4F5] shadow-sm">
            <p className="text-[10px] text-[#64748B] font-medium">ETA</p>
            <p className="text-sm font-bold text-[#172554] font-mono">18 min</p>
          </div>
        </div>

        {/* Courier card */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-[#DCEEFF]/60 mb-4">
          <div className="w-9 h-9 rounded-full bg-[#0A3D91] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">TM</div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-[#172554]">Thabo M. · Toyota Hilux</p>
            <p className="text-[11px] text-[#64748B]">CSA-20260720-8841 · 4.2kg</p>
          </div>
          <span className="text-[10px] font-mono text-[#0A3D91] bg-white px-2 py-1 rounded-md border border-[#D8E4F5]">3.1km</span>
        </div>

        {/* Timeline */}
        <div className="flex items-center justify-between">
          {stops.map((s, i) => (
            <div key={s} className="flex-1 flex flex-col items-center">
              <div className={`w-2.5 h-2.5 rounded-full transition-colors duration-500 ${i <= step ? 'bg-[#1E63E9]' : 'bg-[#D8E4F5]'}`} />
            </div>
          ))}
        </div>
        <p className="text-center text-xs font-medium text-[#0A3D91] mt-3">{stops[step]}</p>
      </div>
    </div>
  )
}

// ── Hero ──────────────────────────────────────────────────────────────────────
function Hero() {
  const badges = [
    { icon: Radio,       label: 'Real-Time Tracking' },
    { icon: CreditCard,  label: 'Secure Payments' },
    { icon: Globe,       label: 'Nationwide Coverage' },
    { icon: FileCheck,   label: 'Proof of Delivery' },
  ]

  return (
    <section className="relative bg-[#F6FAFF] overflow-hidden">
      <div className="absolute inset-0 opacity-50"
           style={{
             backgroundImage: 'linear-gradient(#D8E4F5 1px, transparent 1px), linear-gradient(90deg, #D8E4F5 1px, transparent 1px)',
             backgroundSize: '48px 48px',
             maskImage: 'radial-gradient(ellipse 70% 60% at 50% 20%, black 40%, transparent 100%)',
           }} />

      <div className="relative max-w-[1440px] mx-auto px-6 lg:px-10 pt-16 pb-24 grid lg:grid-cols-2 gap-16 items-center">
        <div>
          <h1 className="text-4xl md:text-[3.25rem] font-bold text-[#172554] leading-[1.08] tracking-tight mb-6">
            Deliver Smarter<br />Across South Africa
          </h1>
          <p className="text-[#64748B] text-lg mb-8 max-w-md leading-relaxed">
            CourierSA provides fast, secure, and intelligent courier services with live
            tracking, optimized delivery routes, and enterprise logistics tools for
            businesses and individuals.
          </p>

          <div className="flex flex-wrap items-center gap-3 mb-10">
            <Link to="/register" className="px-6 py-3.5 text-sm font-semibold text-white bg-[#0A3D91] hover:bg-[#082F6D] rounded-xl transition-all shadow-[0_8px_24px_rgba(10,61,145,0.3)] active:scale-[0.98] flex items-center gap-2">
              Send a Parcel <ArrowRight size={16} />
            </Link>
            <Link to="/track" className="px-6 py-3.5 text-sm font-semibold text-[#0A3D91] bg-white border border-[#D8E4F5] hover:border-[#1E63E9] rounded-xl transition-colors flex items-center gap-2">
              <Search size={15} /> Track Shipment
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3 max-w-md">
            {badges.map(b => (
              <div key={b.label} className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#DCEEFF] flex items-center justify-center flex-shrink-0">
                  <b.icon size={13} className="text-[#0A3D91]" />
                </div>
                <span className="text-xs font-medium text-[#334155]">{b.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-center lg:justify-end">
          <HeroDashboard />
        </div>
      </div>
    </section>
  )
}

// ── Trusted companies ─────────────────────────────────────────────────────────
function TrustedCompanies() {
  const companies = [
    { name: 'Retailico',    icon: Boxes },
    { name: 'MedSupply Co', icon: ShieldCheck },
    { name: 'Fabrica Mfg',  icon: Building2 },
    { name: 'QuickCart',    icon: Package },
    { name: 'NoshExpress',  icon: Truck },
  ]
  return (
    <section className="bg-white border-y border-[#D8E4F5] py-10">
      <div className="max-w-[1440px] mx-auto px-6 lg:px-10">
        <p className="text-center text-xs font-semibold text-[#64748B] uppercase tracking-wider mb-7">
          Trusted by teams shipping every day
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-6">
          {companies.map(c => (
            <div key={c.name} className="flex items-center gap-2 text-[#94A3B8] hover:text-[#0A3D91] transition-colors">
              <c.icon size={18} />
              <span className="text-base font-semibold">{c.name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Services ──────────────────────────────────────────────────────────────────
function Services() {
  const services = [
    { icon: Zap,        title: 'Same-Day Delivery',       copy: 'Book before 11am, delivered before close of business — same metro only.', big: true },
    { icon: RouteIcon,  title: 'Express Shipping',        copy: 'Priority sorting and next-day delivery between major metros.' },
    { icon: Building2,  title: 'Business Logistics',      copy: 'Bulk booking, wallet billing, and dedicated account support.' },
    { icon: Calendar,   title: 'Scheduled Deliveries',    copy: 'Set a recurring collection window for regular shipments.' },
    { icon: Package,    title: 'Parcel Collection',       copy: 'A driver collects from your door — no drop-off point required.' },
    { icon: Globe,      title: 'Nationwide Distribution', copy: 'Reach all nine provinces through our regional hub network.', big: true },
  ]
  return (
    <section id="services" className="bg-[#F6FAFF] py-24">
      <div className="max-w-[1440px] mx-auto px-6 lg:px-10">
        <div className="max-w-lg mb-14">
          <h2 className="text-3xl font-bold text-[#172554] mb-3 tracking-tight">Services built around how you ship</h2>
          <p className="text-[#64748B]">From a single parcel to a warehouse&apos;s worth, choose the service that matches the job.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-5 auto-rows-[1fr]">
          {services.map(s => (
            <div key={s.title}
                 className={`group bg-white rounded-2xl border border-[#D8E4F5] p-6 hover:border-[#1E63E9] hover:shadow-[0_16px_40px_-12px_rgba(10,61,145,0.18)] transition-all duration-300 hover:-translate-y-1 ${s.big ? 'md:col-span-2' : ''}`}>
              <div className="w-11 h-11 rounded-xl bg-[#DCEEFF] flex items-center justify-center mb-5 group-hover:bg-[#0A3D91] transition-colors">
                <s.icon size={19} className="text-[#0A3D91] group-hover:text-white transition-colors" />
              </div>
              <h3 className="text-base font-semibold text-[#172554] mb-2">{s.title}</h3>
              <p className="text-sm text-[#64748B] leading-relaxed">{s.copy}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Live tracking showcase ────────────────────────────────────────────────────
function LiveTrackingShowcase() {
  const events = [
    { label: 'Order Received',    done: true },
    { label: 'Courier Assigned',  done: true },
    { label: 'Picked Up',         done: true },
    { label: 'In Transit',        done: true, current: true },
    { label: 'Out for Delivery',  done: false },
    { label: 'Delivered',         done: false },
  ]
  return (
    <section className="bg-white py-24">
      <div className="max-w-[1440px] mx-auto px-6 lg:px-10 grid lg:grid-cols-2 gap-16 items-center">
        <div>
          <p className="text-xs font-semibold text-[#0A3D91] uppercase tracking-wider mb-3">Live tracking</p>
          <h2 className="text-3xl font-bold text-[#172554] mb-4 tracking-tight">Know exactly where it is, always</h2>
          <p className="text-[#64748B] mb-8 max-w-md leading-relaxed">
            Every scan, every hub, every handoff — visible the moment it happens.
            No calling in for an update.
          </p>
          <div className="space-y-0">
            {events.map((e, i) => (
              <div key={e.label} className="relative pl-8 pb-6 last:pb-0">
                {i < events.length - 1 && (
                  <div className={`absolute left-[9px] top-5 bottom-0 w-px ${e.done ? 'bg-[#1E63E9]' : 'bg-[#D8E4F5]'}`} />
                )}
                <div className={`absolute left-0 top-1 w-[18px] h-[18px] rounded-full border-2 border-white flex items-center justify-center
                                  ${e.done ? 'bg-[#1E63E9]' : 'bg-[#D8E4F5]'} ${e.current ? 'ring-4 ring-[#1E63E9]/20' : ''}`}>
                  {e.done && <CheckCircle size={10} className="text-white" />}
                </div>
                <p className={`text-sm font-medium ${e.done ? 'text-[#172554]' : 'text-[#94A3B8]'}`}>{e.label}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#F6FAFF] rounded-[24px] border border-[#D8E4F5] p-6">
          <div className="flex items-center justify-between mb-5">
            <span className="font-mono text-sm font-semibold text-[#172554] bg-white px-2.5 py-1 rounded-lg border border-[#D8E4F5]">
              CSA-20260720-8841
            </span>
            <span className="text-xs font-medium text-[#1E63E9] bg-[#DCEEFF] px-2.5 py-1 rounded-full">In transit</span>
          </div>
          <div className="bg-white rounded-2xl border border-[#D8E4F5] h-64 relative overflow-hidden mb-5">
            <svg viewBox="0 0 400 260" className="absolute inset-0 w-full h-full">
              <path d="M30 220 C 100 200, 150 120, 210 110 S 330 90, 370 50"
                    fill="none" stroke="#1E63E9" strokeWidth="3" strokeDasharray="2 8" strokeLinecap="round" opacity="0.7" />
              <circle cx="30" cy="220" r="5" fill="#172554" />
              <circle cx="370" cy="50" r="5" fill="#0A3D91" />
              <g transform="translate(210, 112)">
                <circle r="13" fill="#1E63E9" opacity="0.25" className="animate-ping" style={{ transformOrigin: 'center' }} />
                <circle r="7" fill="#1E63E9" />
              </g>
            </svg>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-[#D8E4F5] p-3 text-center">
              <p className="text-[10px] text-[#64748B] uppercase tracking-wide mb-1">Vehicle</p>
              <p className="text-xs font-semibold text-[#172554]">Hilux · CA</p>
            </div>
            <div className="bg-white rounded-xl border border-[#D8E4F5] p-3 text-center">
              <p className="text-[10px] text-[#64748B] uppercase tracking-wide mb-1">ETA</p>
              <p className="text-xs font-semibold text-[#172554] font-mono">18 min</p>
            </div>
            <div className="bg-white rounded-xl border border-[#D8E4F5] p-3 text-center">
              <p className="text-[10px] text-[#64748B] uppercase tracking-wide mb-1">Weight</p>
              <p className="text-xs font-semibold text-[#172554]">4.2 kg</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── How it works ──────────────────────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    { icon: Package,     title: 'Book Delivery' },
    { icon: Truck,       title: 'Courier Picks Up' },
    { icon: RouteIcon,   title: 'Track Live' },
    { icon: CheckCircle, title: 'Delivered Safely' },
  ]
  return (
    <section className="bg-[#F6FAFF] py-24">
      <div className="max-w-[1440px] mx-auto px-6 lg:px-10">
        <div className="max-w-lg mb-16">
          <h2 className="text-3xl font-bold text-[#172554] mb-3 tracking-tight">Four steps, start to finish</h2>
          <p className="text-[#64748B]">The same simple flow whether it&apos;s one parcel or a thousand.</p>
        </div>

        <div className="relative grid grid-cols-2 md:grid-cols-4 gap-y-10 gap-x-6">
          <div className="hidden md:block absolute top-7 left-[12.5%] right-[12.5%] h-px bg-[#D8E4F5] overflow-hidden">
            <div className="h-full bg-[#1E63E9]" style={{ width: '70%' }} />
          </div>
          {steps.map((s, i) => (
            <div key={s.title} className="relative flex flex-col items-center text-center">
              <div className="w-14 h-14 rounded-full bg-white border-2 border-[#0A3D91] flex items-center justify-center mb-4 relative z-10 shadow-[0_8px_20px_rgba(10,61,145,0.15)]">
                <s.icon size={20} className="text-[#0A3D91]" />
              </div>
              <p className="text-xs font-mono text-[#1E63E9] mb-1">0{i + 1}</p>
              <h3 className="text-sm font-semibold text-[#172554]">{s.title}</h3>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Statistics ────────────────────────────────────────────────────────────────
function StatBlock({ target, suffix, label }) {
  const [value, ref] = useCountUp(target)
  return (
    <div ref={ref} className="text-center">
      <p className="text-4xl md:text-5xl font-bold text-white font-mono mb-2">
        {value.toLocaleString()}{suffix}
      </p>
      <p className="text-sm text-[#93B4E8]">{label}</p>
    </div>
  )
}

function Statistics() {
  return (
    <section className="bg-[#0A3D91] py-20">
      <div className="max-w-[1440px] mx-auto px-6 lg:px-10 grid grid-cols-2 md:grid-cols-4 gap-8">
        <StatBlock target={50000} suffix="+" label="Successful Deliveries" />
        <StatBlock target={98} suffix="%" label="On-Time Delivery" />
        <StatBlock target={9} suffix="" label="Provinces Covered" />
        <div className="text-center">
          <p className="text-4xl md:text-5xl font-bold text-white font-mono mb-2">24/7</p>
          <p className="text-sm text-[#93B4E8]">Customer Support</p>
        </div>
      </div>
    </section>
  )
}

// ── Business solutions ────────────────────────────────────────────────────────
function BusinessSolutions() {
  const capabilities = [
    { icon: Truck,           title: 'Fleet Management' },
    { icon: Boxes,           title: 'Bulk Shipping' },
    { icon: Zap,             title: 'API Integration' },
    { icon: BarChart3,       title: 'Delivery Analytics' },
    { icon: LayoutDashboard, title: 'Business Dashboard' },
    { icon: Users,           title: 'Team Management' },
  ]
  return (
    <section id="business" className="bg-white py-24">
      <div className="max-w-[1440px] mx-auto px-6 lg:px-10 grid lg:grid-cols-2 gap-16 items-center">
        <div className="rounded-[24px] overflow-hidden border border-[#D8E4F5] aspect-[4/3] bg-gradient-to-br from-[#172554] to-[#0A3D91] relative">
          <div className="absolute inset-0 opacity-20"
               style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
          <div className="absolute bottom-6 left-6 right-6 bg-white/10 backdrop-blur-md rounded-2xl border border-white/20 p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-white/80">Dispatch — JHB Hub</span>
              <span className="flex items-center gap-1.5 text-xs text-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> 142 active
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {['Queued', 'In transit', 'Delivered today'].map((label, i) => (
                <div key={label}>
                  <p className="text-lg font-bold text-white font-mono">{[86, 142, 391][i]}</p>
                  <p className="text-[10px] text-white/60">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-[#0A3D91] uppercase tracking-wider mb-3">Business solutions</p>
          <h2 className="text-3xl font-bold text-[#172554] mb-4 tracking-tight">Enterprise tools for real shipping volume</h2>
          <p className="text-[#64748B] mb-8 max-w-md leading-relaxed">
            Warehouses and retailers don&apos;t ship one parcel at a time. CourierSA&apos;s
            business layer is built for the volume, the reporting, and the team
            behind it.
          </p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 mb-9">
            {capabilities.map(c => (
              <div key={c.title} className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#DCEEFF] flex items-center justify-center flex-shrink-0">
                  <c.icon size={14} className="text-[#0A3D91]" />
                </div>
                <span className="text-sm font-medium text-[#334155]">{c.title}</span>
              </div>
            ))}
          </div>
          <Link to="/register" className="inline-flex items-center gap-2 px-6 py-3.5 text-sm font-semibold text-white bg-[#0A3D91] hover:bg-[#082F6D] rounded-xl transition-all shadow-[0_8px_24px_rgba(10,61,145,0.3)]">
            Request Business Demo <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  )
}

// ── Why choose CourierSA ──────────────────────────────────────────────────────
function WhyChoose() {
  const rows = [
    'Live Tracking', 'Instant Quotes', 'Smart Dispatch', 'Digital Proof of Delivery',
    'Route Optimization', 'Business Dashboard', 'Faster Deliveries', 'Transparent Pricing',
  ]
  return (
    <section className="bg-[#F6FAFF] py-24">
      <div className="max-w-[1440px] mx-auto px-6 lg:px-10">
        <div className="max-w-lg mb-14">
          <h2 className="text-3xl font-bold text-[#172554] mb-3 tracking-tight">Why teams choose CourierSA</h2>
          <p className="text-[#64748B]">Set next to a traditional courier, the difference is in what you can see.</p>
        </div>

        <div className="bg-white rounded-2xl border border-[#D8E4F5] overflow-hidden max-w-3xl">
          <div className="grid grid-cols-3 bg-[#172554] text-white text-sm font-semibold">
            <div className="px-6 py-4">Capability</div>
            <div className="px-6 py-4 text-center">CourierSA</div>
            <div className="px-6 py-4 text-center text-white/60">Traditional</div>
          </div>
          {rows.map((r, i) => (
            <div key={r} className={`grid grid-cols-3 text-sm ${i % 2 ? 'bg-[#F6FAFF]/60' : 'bg-white'}`}>
              <div className="px-6 py-3.5 text-[#334155] font-medium">{r}</div>
              <div className="px-6 py-3.5 flex justify-center">
                <CheckCircle size={16} className="text-[#1E63E9]" />
              </div>
              <div className="px-6 py-3.5 flex justify-center">
                <span className="w-4 h-px bg-[#CBD5E1] self-center" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Testimonials ──────────────────────────────────────────────────────────────
function Testimonials() {
  const quotes = [
    { name: 'Naledi Khumalo', role: 'Owner, The Bead & Bloom Co.', initials: 'NK',
      quote: 'Bulk booking cut our dispatch morning from two hours to twenty minutes.' },
    { name: 'Werner Botha', role: 'Ops Manager, Retailico', initials: 'WB',
      quote: 'Failed-delivery reporting finally told us which addresses to flag before they cost us again.' },
    { name: 'Ayesha Patel', role: 'Individual customer', initials: 'AP',
      quote: 'I could see the courier was three streets away — no more standing by the window.' },
  ]
  return (
    <section className="bg-white py-24">
      <div className="max-w-[1440px] mx-auto px-6 lg:px-10">
        <div className="max-w-lg mb-14">
          <h2 className="text-3xl font-bold text-[#172554] mb-3 tracking-tight">What people say after they switch</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {quotes.map(q => (
            <div key={q.name} className="bg-[#F6FAFF] rounded-2xl border border-[#D8E4F5] p-6">
              <div className="flex gap-0.5 mb-4">
                {Array.from({ length: 5 }).map((_, i) => <Star key={i} size={13} className="fill-[#1E63E9] text-[#1E63E9]" />)}
              </div>
              <p className="text-sm text-[#334155] leading-relaxed mb-6">&quot;{q.quote}&quot;</p>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[#0A3D91] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {q.initials}
                </div>
                <div>
                  <p className="text-sm font-semibold text-[#172554] flex items-center gap-1.5">
                    {q.name}
                    <CheckCircle size={12} className="text-[#1E63E9]" />
                  </p>
                  <p className="text-xs text-[#64748B]">{q.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Mobile applications ───────────────────────────────────────────────────────
function PhoneMock({ title, features }) {
  return (
    <div className="flex flex-col items-center">
      <div className="w-[220px] h-[440px] rounded-[32px] border-[8px] border-[#172554] bg-white shadow-[0_30px_60px_-15px_rgba(10,61,145,0.3)] overflow-hidden relative">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-4 bg-[#172554] rounded-b-xl z-10" />
        <div className="pt-8 px-4">
          <p className="text-xs font-semibold text-[#172554] mb-4">{title}</p>
          <div className="space-y-2.5">
            {features.map(f => (
              <div key={f} className="flex items-center gap-2 bg-[#F6FAFF] rounded-lg px-2.5 py-2 border border-[#D8E4F5]">
                <div className="w-1.5 h-1.5 rounded-full bg-[#1E63E9] flex-shrink-0" />
                <span className="text-[10px] text-[#334155] font-medium">{f}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="text-xs text-[#64748B] mt-4 font-medium">{title}</p>
    </div>
  )
}

function MobileApps() {
  return (
    <section className="bg-[#F6FAFF] py-24 overflow-hidden">
      <div className="max-w-[1440px] mx-auto px-6 lg:px-10">
        <div className="max-w-lg mb-16 mx-auto text-center">
          <h2 className="text-3xl font-bold text-[#172554] mb-3 tracking-tight">One platform, three screens</h2>
          <p className="text-[#64748B]">Customers, drivers, and admins each get exactly the view they need.</p>
        </div>

        <div className="flex flex-col lg:flex-row items-center justify-center gap-10">
          <PhoneMock title="Customer App" features={['Book deliveries', 'Track parcels', 'Payment history', 'Notifications']} />

          <div className="w-full max-w-sm bg-white rounded-2xl border border-[#D8E4F5] shadow-[0_20px_50px_-15px_rgba(10,61,145,0.2)] overflow-hidden">
            <div className="flex items-center gap-1.5 px-4 py-3 bg-[#F6FAFF] border-b border-[#D8E4F5]">
              <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#10B981]" />
              <span className="ml-2 text-[10px] text-[#64748B] font-mono">app.couriersa.co.za/admin</span>
            </div>
            <div className="p-5 flex items-center gap-2 mb-1">
              <LayoutDashboard size={14} className="text-[#0A3D91]" />
              <span className="text-xs font-semibold text-[#172554]">Admin Dashboard</span>
            </div>
            <div className="px-5 pb-5 grid grid-cols-2 gap-3">
              {[['Active drivers', '312'], ['Deliveries today', '4,180'], ['On-time rate', '98%'], ['Open claims', '6']].map(([l, v]) => (
                <div key={l} className="bg-[#F6FAFF] rounded-xl border border-[#D8E4F5] p-3">
                  <p className="text-[10px] text-[#64748B]">{l}</p>
                  <p className="text-lg font-bold text-[#172554] font-mono">{v}</p>
                </div>
              ))}
            </div>
          </div>

          <PhoneMock title="Driver App" features={['Turn-by-turn navigation', 'Route optimization', 'Delivery verification', 'Earnings dashboard']} />
        </div>
      </div>
    </section>
  )
}

// ── FAQ ───────────────────────────────────────────────────────────────────────
function FAQ() {
  const items = [
    { q: 'How long does delivery take?', a: 'Standard is 3–5 business days, Express is 1–2 days, and Same-Day covers bookings within the same metro made before 11am.' },
    { q: 'How is pricing calculated?', a: 'Pricing is based on parcel weight, dimensions, and the distance between collection and delivery points. You get an instant quote before booking.' },
    { q: 'Can I track my parcel in real time?', a: 'Yes — every parcel gets a tracking number with live GPS updates from collection through to delivery.' },
    { q: 'Is my parcel insured?', a: 'All parcels are covered against loss or damage up to a standard limit, with optional extended cover at checkout.' },
    { q: 'Do you offer business accounts?', a: 'Yes — business accounts get bulk CSV booking, a prepaid wallet, and delivery analytics by branch.' },
    { q: 'Which areas do you cover?', a: 'CourierSA operates across all nine provinces through our regional hub network, with same-day service in major metros.' },
  ]
  const [open, setOpen] = useState(0)

  return (
    <section className="bg-white py-24">
      <div className="max-w-3xl mx-auto px-6 lg:px-10">
        <div className="mb-14 text-center">
          <h2 className="text-3xl font-bold text-[#172554] mb-3 tracking-tight">Common questions</h2>
        </div>
        <div className="space-y-3">
          {items.map((item, i) => (
            <div key={item.q} className="border border-[#D8E4F5] rounded-2xl overflow-hidden">
              <button
                onClick={() => setOpen(open === i ? -1 : i)}
                className="w-full flex items-center justify-between px-5 py-4 text-left"
              >
                <span className="text-sm font-semibold text-[#172554]">{item.q}</span>
                <ChevronDown size={17} className={`text-[#64748B] transition-transform duration-300 flex-shrink-0 ${open === i ? 'rotate-180' : ''}`} />
              </button>
              <div className={`grid transition-all duration-300 ${open === i ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                <div className="overflow-hidden">
                  <p className="px-5 pb-4 text-sm text-[#64748B] leading-relaxed">{item.a}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Final CTA ─────────────────────────────────────────────────────────────────
function FinalCta() {
  return (
    <section id="final-cta" className="relative bg-[#0A3D91] overflow-hidden">
      <div className="absolute inset-0 opacity-10"
           style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
      <div className="relative max-w-[1440px] mx-auto px-6 lg:px-10 py-24 text-center">
        <h2 className="text-3xl md:text-4xl font-bold text-white mb-4 tracking-tight">Ready to Deliver Smarter?</h2>
        <p className="text-[#93B4E8] mb-10 max-w-lg mx-auto">
          Join the individuals and businesses already shipping across South Africa with full visibility, every step of the way.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link to="/register" className="px-7 py-3.5 text-sm font-semibold text-[#0A3D91] bg-white hover:bg-[#DCEEFF] rounded-xl transition-colors">
            Get Started
          </Link>
          <Link to="/register" className="px-7 py-3.5 text-sm font-semibold text-white border border-white/30 hover:bg-white/10 rounded-xl transition-colors">
            Become a Courier
          </Link>
        </div>
      </div>
    </section>
  )
}

// ── Footer ────────────────────────────────────────────────────────────────────
function Footer() {
  const columns = [
    { title: 'Company',   links: ['About', 'Careers', 'Press', 'Partners'] },
    { title: 'Services',  links: ['Parcel Delivery', 'Express Shipping', 'Business Logistics', 'Driver Program'] },
    { title: 'Resources', links: ['Help Center', 'API Documentation', 'FAQs', 'Blog'] },
    { title: 'Legal',     links: ['Privacy Policy', 'Terms', 'Cookies'] },
  ]
  return (
    <footer id="footer" className="bg-[#172554] pt-16 pb-8">
      <div className="max-w-[1440px] mx-auto px-6 lg:px-10">
        <div className="grid md:grid-cols-[1.4fr_repeat(4,1fr)] gap-10 mb-12">
          <div>
            <div className="flex items-center mb-4">
              {/* 👉 USE THE IMPORTED LOGO HERE TOO */}
              <img src={logo} alt="CourierSA Logo" className="h-12 w-auto object-contain brightness-0 invert" />
            </div>
            <p className="text-sm text-[#93B4E8] max-w-xs leading-relaxed mb-5">
              Fast, tracked courier delivery connecting South Africa&apos;s metros —
              for individuals and businesses alike.
            </p>
            <div className="flex items-center gap-3">
              {[Facebook, Twitter, Instagram, Linkedin].map((Icon, i) => (
                <a key={i} href="#" className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors">
                  <Icon size={14} className="text-white" />
                </a>
              ))}
            </div>
          </div>

          {columns.map(col => (
            <div key={col.title}>
              <p className="text-xs font-semibold text-white uppercase tracking-wider mb-4">{col.title}</p>
              <ul className="space-y-2.5">
                {col.links.map(l => (
                  <li key={l}><a href="#" className="text-sm text-[#93B4E8] hover:text-white transition-colors">{l}</a></li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="pt-6 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-3">
          <p className="text-xs text-[#93B4E8]">© {new Date().getFullYear()} CourierSA. All rights reserved.</p>
          <div className="flex items-center gap-5 text-xs text-[#93B4E8]">
            <span className="flex items-center gap-1.5"><Phone size={12} /> 0800 123 456</span>
            <span className="flex items-center gap-1.5"><Mail size={12} /> hello@couriersa.co.za</span>
          </div>
        </div>
      </div>
    </footer>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <Nav />
      <Hero />
      <TrustedCompanies />
      <Services />
      <LiveTrackingShowcase />
      <HowItWorks />
      <Statistics />
      <BusinessSolutions />
      <WhyChoose />
      <Testimonials />
      <MobileApps />
      <FAQ />
      <FinalCta />
      <Footer />
    </div>
  )
}