import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authApi } from '@/api'
import { Alert, Spinner } from '@/components/ui'
import {
  ArrowLeft, Eye, EyeOff, CheckCircle, User, Mail, Phone, Lock,
} from 'lucide-react'

// Import the logo (white version used on dark panel via brightness/invert, same trick as Footer)
import logo from '@/assets/logo.png'

const STEPS = ['Booked', 'Approved', 'In warehouse', 'Out for delivery', 'Delivered']

const initialForm = {
  firstName: '',
  lastName: '',
  email: '',
  phoneNumber: '',
  password: '',
  confirmPassword: '',
  agreeToTerms: false,
}

function passwordStrength(password) {
  let score = 0
  if (password.length >= 8) score++
  if (/[A-Z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  return score // 0-4
}

const STRENGTH_LABEL = ['Too short', 'Weak', 'Fair', 'Good', 'Strong']
const STRENGTH_COLOR = ['#EF4444', '#EF4444', '#F59E0B', '#1E63E9', '#10B981']

export function RegisterPage() {
  const navigate = useNavigate()
  const [form, setForm]         = useState(initialForm)
  const [errors, setErrors]     = useState({})
  const [showPw, setShowPw]     = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading]   = useState(false)
  const [apiError, setApiError] = useState('')

  const strength = passwordStrength(form.password)

  const update = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm(f => ({ ...f, [field]: value }))
    if (errors[field]) setErrors(er => ({ ...er, [field]: undefined }))
  }

  const validate = () => {
    const e = {}
    if (!form.firstName.trim()) e.firstName = 'First name is required'
    if (!form.lastName.trim())  e.lastName  = 'Last name is required'
    if (!/^\S+@\S+\.\S+$/.test(form.email)) e.email = 'Enter a valid email address'
    if (!/^(\+27|0)[6-8][0-9]{8}$/.test(form.phoneNumber.replace(/\s/g, '')))
      e.phoneNumber = 'Enter a valid South African phone number'
    if (form.password.length < 8) e.password = 'Password must be at least 8 characters'
    if (form.password !== form.confirmPassword) e.confirmPassword = 'Passwords do not match'
    if (!form.agreeToTerms) e.agreeToTerms = 'You must accept the Terms & Privacy Policy'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setApiError('')
    if (!validate()) return

    setLoading(true)
    try {
      await authApi.register({
        firstName:   form.firstName.trim(),
        lastName:    form.lastName.trim(),
        email:       form.email.trim().toLowerCase(),
        phoneNumber: form.phoneNumber.trim(),
        password:    form.password,
      })
      navigate('/', { replace: true })
    } catch (err) {
      setApiError(
        err?.status === 409
          ? 'An account with this email already exists.'
          : err?.message || 'Something went wrong. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 font-sans">
      {/* ── Left panel ─────────────────────────────────────────────────────── */}
      <div className="hidden lg:flex flex-col justify-between bg-gradient-to-br from-[#172554] to-[#0A3D91] relative overflow-hidden p-12">
        <div className="absolute inset-0 opacity-10"
             style={{
               backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
               backgroundSize: '40px 40px',
             }} />
        <Link to="/" className="relative">
          <img src={logo} alt="CourierSA Logo" className="h-10 w-auto object-contain brightness-0 invert" />
        </Link>

        <div className="relative">
          <h1 className="text-4xl font-bold text-white leading-tight mb-4">
            Every parcel.<br />Every stop.<br /><span className="text-[#93B4E8]">Accounted for.</span>
          </h1>
          <p className="text-[#93B4E8] max-w-sm leading-relaxed mb-10">
            Create your CourierSA account to book deliveries, track parcels live,
            and manage everything from one dashboard.
          </p>

          <div className="space-y-0">
            {STEPS.map((s, i) => (
              <div key={s} className="relative pl-8 pb-5 last:pb-0">
                {i < STEPS.length - 1 && (
                  <div className="absolute left-[9px] top-5 bottom-0 w-px bg-white/20" />
                )}
                <div className={`absolute left-0 top-1 w-[18px] h-[18px] rounded-full border-2 border-white/40 flex items-center justify-center
                                  ${i === STEPS.length - 1 ? 'bg-[#10B981] border-[#10B981]' : 'bg-white/10'}`}>
                  {i === STEPS.length - 1 && <CheckCircle size={11} className="text-white" />}
                </div>
                <p className="text-sm font-medium text-white/90">{s}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-[#93B4E8]/70">
          &copy; {new Date().getFullYear()} CourierSA. All rights reserved.
        </p>
      </div>

      {/* ── Right panel: form ──────────────────────────────────────────────── */}
      <div className="flex flex-col justify-center px-6 sm:px-12 lg:px-20 py-12 bg-[#F6FAFF]">
        <div className="w-full max-w-md mx-auto">
          <Link to="/" className="lg:hidden inline-flex items-center gap-1.5 text-sm font-medium text-[#64748B] hover:text-[#0A3D91] mb-8">
            <ArrowLeft size={16} /> Back to Home
          </Link>

          <Link to="/" className="hidden lg:inline-flex items-center gap-1.5 text-sm font-medium text-[#64748B] hover:text-[#0A3D91] mb-8">
            <ArrowLeft size={16} /> Back to Home
          </Link>

          <h2 className="text-2xl font-bold text-[#172554] mb-1">Create your account</h2>
          <p className="text-sm text-[#64748B] mb-8">Get started with CourierSA in under a minute.</p>

          {apiError && (
            <div className="mb-5">
              <Alert type="error" message={apiError} />
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label" htmlFor="firstName">First name</label>
                <div className="relative">
                  <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                  <input
                    id="firstName"
                    className={`input pl-10 ${errors.firstName ? 'input-error' : ''}`}
                    placeholder="Nomvula"
                    value={form.firstName}
                    onChange={update('firstName')}
                    autoComplete="given-name"
                  />
                </div>
                {errors.firstName && <p className="field-error">{errors.firstName}</p>}
              </div>

              <div>
                <label className="label" htmlFor="lastName">Last name</label>
                <input
                  id="lastName"
                  className={`input ${errors.lastName ? 'input-error' : ''}`}
                  placeholder="Dlamini"
                  value={form.lastName}
                  onChange={update('lastName')}
                  autoComplete="family-name"
                />
                {errors.lastName && <p className="field-error">{errors.lastName}</p>}
              </div>
            </div>

            <div>
              <label className="label" htmlFor="email">Email address</label>
              <div className="relative">
                <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  id="email"
                  type="email"
                  className={`input pl-10 ${errors.email ? 'input-error' : ''}`}
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={update('email')}
                  autoComplete="email"
                />
              </div>
              {errors.email && <p className="field-error">{errors.email}</p>}
            </div>

            <div>
              <label className="label" htmlFor="phoneNumber">Phone number</label>
              <div className="relative">
                <Phone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  id="phoneNumber"
                  type="tel"
                  className={`input pl-10 ${errors.phoneNumber ? 'input-error' : ''}`}
                  placeholder="082 123 4567"
                  value={form.phoneNumber}
                  onChange={update('phoneNumber')}
                  autoComplete="tel"
                />
              </div>
              {errors.phoneNumber && <p className="field-error">{errors.phoneNumber}</p>}
            </div>

            <div>
              <label className="label" htmlFor="password">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  className={`input pl-10 pr-10 ${errors.password ? 'input-error' : ''}`}
                  placeholder="At least 8 characters"
                  value={form.password}
                  onChange={update('password')}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#64748B]"
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {form.password && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-1 rounded-full bg-[#D8E4F5] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${(strength / 4) * 100}%`, backgroundColor: STRENGTH_COLOR[strength] }}
                    />
                  </div>
                  <span className="text-[11px] font-medium" style={{ color: STRENGTH_COLOR[strength] }}>
                    {STRENGTH_LABEL[strength]}
                  </span>
                </div>
              )}
              {errors.password && <p className="field-error">{errors.password}</p>}
            </div>

            <div>
              <label className="label" htmlFor="confirmPassword">Confirm password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  id="confirmPassword"
                  type={showConfirm ? 'text' : 'password'}
                  className={`input pl-10 pr-10 ${errors.confirmPassword ? 'input-error' : ''}`}
                  placeholder="Re-enter your password"
                  value={form.confirmPassword}
                  onChange={update('confirmPassword')}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#64748B]"
                  tabIndex={-1}
                >
                  {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.confirmPassword && <p className="field-error">{errors.confirmPassword}</p>}
            </div>

            <div>
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 w-4 h-4 rounded border-[#D8E4F5] text-[#0A3D91] focus:ring-[#1E63E9]"
                  checked={form.agreeToTerms}
                  onChange={update('agreeToTerms')}
                />
                <span className="text-sm text-[#64748B] leading-relaxed">
                  I agree to CourierSA&apos;s{' '}
                  <a href="#" className="text-[#0A3D91] font-medium hover:underline">Terms of Service</a>{' '}
                  and{' '}
                  <a href="#" className="text-[#0A3D91] font-medium hover:underline">Privacy Policy</a>.
                </span>
              </label>
              {errors.agreeToTerms && <p className="field-error">{errors.agreeToTerms}</p>}
            </div>

            <button type="submit" className="btn-primary w-full h-12" disabled={loading}>
              {loading ? <Spinner size="sm" className="text-white" /> : 'Create account'}
            </button>
          </form>

          <p className="text-center text-sm text-[#64748B] mt-8">
            Already have an account?{' '}
            <Link to="/login" className="text-[#0A3D91] font-semibold hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default RegisterPage
