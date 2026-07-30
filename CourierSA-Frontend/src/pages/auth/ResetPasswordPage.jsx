import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { authApi } from '@/api'
import { Alert, Spinner } from '@/components/ui'
import { ArrowLeft, Lock, Eye, EyeOff, CheckCircle, ShieldAlert } from 'lucide-react'

import logo from '@/assets/logo.png'

function passwordStrength(password) {
  let score = 0
  if (password.length >= 8) score++
  if (/[A-Z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  return score
}
const STRENGTH_LABEL = ['Too short', 'Weak', 'Fair', 'Good', 'Strong']
const STRENGTH_COLOR = ['#EF4444', '#EF4444', '#F59E0B', '#1E63E9', '#10B981']

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [showPw, setShowPw]       = useState(false)
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)
  const [done, setDone]           = useState(false)

  const strength = passwordStrength(password)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (password.length < 8) return setError('Password must be at least 8 characters')
    if (password !== confirm) return setError('Passwords do not match')

    setLoading(true)
    try {
      await authApi.resetPassword({ token, newPassword: password })
      setDone(true)
      setTimeout(() => navigate('/login', { replace: true }), 2500)
    } catch (err) {
      setError(
        err?.status === 400 || err?.status === 401
          ? 'This reset link is invalid or has expired. Please request a new one.'
          : err?.message || 'Something went wrong. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F6FAFF] font-sans flex flex-col">
      <header className="bg-white border-b border-[#D8E4F5] px-6 lg:px-10 h-[72px] flex items-center">
        <Link to="/" className="flex items-center">
          <img src={logo} alt="CourierSA Logo" className="h-10 w-auto object-contain" />
        </Link>
      </header>

      <div className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-md">
          <Link to="/login" className="inline-flex items-center gap-1.5 text-sm font-medium text-[#64748B] hover:text-[#0A3D91] mb-8">
            <ArrowLeft size={16} /> Back to sign in
          </Link>

          <div className="bg-white rounded-[24px] border border-[#D8E4F5] shadow-[0_20px_50px_-15px_rgba(10,61,145,0.1)] p-8">
            {!token ? (
              <div className="text-center py-2">
                <div className="w-14 h-14 rounded-full bg-[#EF4444]/10 flex items-center justify-center mx-auto mb-5">
                  <ShieldAlert size={24} className="text-[#EF4444]" />
                </div>
                <h1 className="text-xl font-bold text-[#172554] mb-2">Invalid reset link</h1>
                <p className="text-sm text-[#64748B] leading-relaxed mb-7">
                  This link is missing its reset token. Request a new password reset email and use the link exactly as it arrives.
                </p>
                <Link to="/forgot-password" className="btn-primary w-full h-12 inline-flex">
                  Request new link
                </Link>
              </div>
            ) : done ? (
              <div className="text-center py-2">
                <div className="w-14 h-14 rounded-full bg-[#10B981]/10 flex items-center justify-center mx-auto mb-5">
                  <CheckCircle size={24} className="text-[#10B981]" />
                </div>
                <h1 className="text-xl font-bold text-[#172554] mb-2">Password updated</h1>
                <p className="text-sm text-[#64748B] leading-relaxed">
                  Redirecting you to sign in&hellip;
                </p>
              </div>
            ) : (
              <>
                <div className="w-12 h-12 rounded-xl bg-[#DCEEFF] flex items-center justify-center mb-5">
                  <Lock size={20} className="text-[#0A3D91]" />
                </div>
                <h1 className="text-2xl font-bold text-[#172554] mb-2">Set a new password</h1>
                <p className="text-sm text-[#64748B] mb-7 leading-relaxed">
                  Choose a strong password you haven&apos;t used before.
                </p>

                {error && (
                  <div className="mb-5">
                    <Alert type="error" message={error} />
                  </div>
                )}

                <form onSubmit={handleSubmit} noValidate className="space-y-5">
                  <div>
                    <label className="label" htmlFor="password">New password</label>
                    <div className="relative">
                      <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                      <input
                        id="password"
                        type={showPw ? 'text' : 'password'}
                        className="input pl-10 pr-10"
                        placeholder="At least 8 characters"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        autoComplete="new-password"
                        autoFocus
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
                    {password && (
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
                  </div>

                  <div>
                    <label className="label" htmlFor="confirm">Confirm new password</label>
                    <div className="relative">
                      <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                      <input
                        id="confirm"
                        type={showPw ? 'text' : 'password'}
                        className="input pl-10"
                        placeholder="Re-enter your new password"
                        value={confirm}
                        onChange={e => setConfirm(e.target.value)}
                        autoComplete="new-password"
                      />
                    </div>
                  </div>

                  <button type="submit" className="btn-primary w-full h-12" disabled={loading}>
                    {loading ? <Spinner size="sm" className="text-white" /> : 'Reset password'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ResetPasswordPage
