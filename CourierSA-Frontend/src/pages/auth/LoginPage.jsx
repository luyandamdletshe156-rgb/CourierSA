import { useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Alert, Spinner } from '@/components/ui'
import { Eye, EyeOff, ArrowLeft } from 'lucide-react'

// 👉 IMPORT THE LOGO HERE
import logo from '@/assets/logo.png'

export default function LoginPage() {
  const { login, dashboardPath } = useAuth()
  const navigate  = useNavigate()
  const location  = useLocation()
  const from      = location.state?.from?.pathname

  const [form, setForm]       = useState({ email: '', password: '' })
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async e => {
  e.preventDefault()
  setError('')
  setLoading(true)
  try {
    const user = await login(form.email, form.password)
    if (user.mustChangePassword) {
      navigate('/change-password', { replace: true })   // ignore `from` — password must be set first
    } else {
      // Only honor `from` if it actually belongs to this user's role section —
      // otherwise a stale redirect target from an earlier (different-role or
      // logged-out) URL attempt sends the new session straight to /unauthorized.
      const target = dashboardPath(user.role)
      const rolePrefix = '/' + target.split('/')[1]
      const safeFrom = from && from.startsWith(rolePrefix) ? from : null
      navigate(safeFrom || target, { replace: true })
    } 
  } catch (err) {
    setError(err.message ?? 'Login failed. Check your credentials.')
  } finally {
    setLoading(false)
  }
}

  // Quick-fill demo credentials
  const DEMO = [
    { label: 'Admin',      email: 'admin@couriersa.co.za' },
    { label: 'Customer',   email: 'thabo@gmail.com' },
    { label: 'Driver',     email: 'sipho.driver@couriersa.co.za' },
    { label: 'Dispatcher', email: 'nomvula.dispatch@couriersa.co.za' },
    { label: 'Warehouse',  email: 'trevor.wh@couriersa.co.za' },
    { label: 'Business',   email: 'lindiwe@techcorp.co.za' },
  ]

  return (
    <div className="min-h-screen flex bg-white font-sans">
      {/* ── Left panel - brand ───────────────────────────────────────────────── */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-3/5 flex-col justify-between p-12 relative overflow-hidden bg-gradient-to-br from-[#172554] via-[#0A3D91] to-[#1E63E9]">
        
        {/* Decorative background grid */}
        <div className="absolute inset-0 opacity-10 pointer-events-none"
             style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

        <div className="relative z-10 flex items-center justify-between">
          <Link to="/" className="flex items-center hover:opacity-80 transition-opacity">
            <img src={logo} alt="CourierSA Logo" className="h-10 w-auto object-contain brightness-0 invert" />
          </Link>
          <Link to="/" className="flex items-center gap-1.5 text-sm font-medium text-[#93B4E8] hover:text-white transition-colors">
            <ArrowLeft size={16} /> Back to Home
          </Link>
        </div>

        <div className="relative z-10">
          <h1 className="text-4xl xl:text-[3.25rem] font-bold text-white leading-[1.15] mb-5 tracking-tight">
            Every parcel.<br />
            Every stop.<br />
            <span className="text-[#93B4E8]">Accounted for.</span>
          </h1>
          <p className="text-[#DCEEFF]/80 text-lg max-w-md leading-relaxed">
            End-to-end courier management for South African logistics —
            from booking to proof of delivery.
          </p>
        </div>

        {/* Decorative tracking timeline */}
        <div className="relative z-10 space-y-4 opacity-60">
          {['Booked', 'Approved', 'In warehouse', 'Out for delivery', 'Delivered'].map((s, i) => (
            <div key={s} className="flex items-center gap-3">
              <div className={`w-2.5 h-2.5 rounded-full shadow-[0_0_10px_rgba(255,255,255,0.3)] ${i === 4 ? 'bg-[#10B981]' : 'bg-[#DCEEFF]'}`} />
              <span className="text-[#DCEEFF] text-sm font-medium">{s}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right panel - form ───────────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-6 bg-[#F6FAFF]">
        <div className="w-full max-w-md">
          
          {/* Mobile logo & Back button */}
          <div className="flex items-center justify-between mb-10 lg:hidden">
            <Link to="/">
              <img src={logo} alt="CourierSA Logo" className="h-9 w-auto object-contain" />
            </Link>
            <Link to="/" className="flex items-center gap-1 text-sm font-medium text-[#64748B] hover:text-[#0A3D91]">
              <ArrowLeft size={14} /> Home
            </Link>
          </div>

          <h2 className="text-3xl font-bold text-[#172554] mb-2 tracking-tight">Sign in</h2>
          <p className="text-[#64748B] text-sm mb-8">
            Welcome back. Enter your credentials to continue.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && <Alert type="error" message={error} />}

            <div>
              <label className="label">Email address</label>
              <input
                type="email"
                className="input"
                placeholder="you@example.com"
                value={form.email}
                onChange={set('email')}
                autoComplete="email"
                required
              />
            </div>

            <div>
              <label className="label">Password</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  className="input pr-10"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={set('password')}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(p => !p)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#0A3D91] transition-colors"
                >
                  {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button type="submit" className="btn-primary w-full justify-center py-3.5 mt-2" disabled={loading}>
              {loading ? <Spinner size="sm" className="text-white" /> : 'Sign in'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link to="/register" className="text-sm font-semibold text-[#0A3D91] hover:text-[#1E63E9] transition-colors">
              Don't have an account? Register
            </Link>
          </div>

          {/* ── Demo credentials panel ────────────────────────────────────────── */}
          <div className="mt-10 p-5 bg-white rounded-2xl border border-[#D8E4F5] shadow-[0_10px_30px_-10px_rgba(10,61,145,0.08)]">
            <p className="text-xs font-bold text-[#0A3D91] uppercase tracking-wider mb-3 text-center">
              Demo accounts
            </p>
            <p className="text-[11px] text-[#64748B] text-center mb-4 font-medium">
              Password for all accounts: <code className="bg-[#F6FAFF] px-1.5 py-0.5 rounded border border-[#D8E4F5] font-mono text-[#172554]">Demo@1234</code>
            </p>
            
            <div className="grid grid-cols-2 gap-2">
              {DEMO.map(({ label, email }) => (
                <button
                  key={email}
                  type="button"
                  onClick={() => setForm({ email, password: 'Demo@1234' })}
                  className="text-left px-3 py-2.5 rounded-xl bg-[#F6FAFF] hover:bg-[#DCEEFF]/50
                             border border-[#D8E4F5] hover:border-[#1E63E9]/40
                             text-xs font-semibold text-[#334155] hover:text-[#0A3D91]
                             transition-all active:scale-[0.98]"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          
        </div>
      </div>
    </div>
  )
}