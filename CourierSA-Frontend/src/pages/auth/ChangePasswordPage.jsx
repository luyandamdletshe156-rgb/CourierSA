import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { authApi } from '@/api'
import { useAuth } from '@/context/AuthContext'
import { Alert, Spinner } from '@/components/ui'
import { Lock, Eye, EyeOff, ShieldCheck } from 'lucide-react'

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

// Shown when AuthContext detects mustChangePassword === true right after login.
// Unlike ResetPasswordPage (token-based, for a signed-out user who forgot their
// password), this requires the CURRENT password too — it's an authenticated
// self-service change, used for the forced first-login flow for staff accounts
// created by an admin with a temporary password.
export function ChangePasswordPage() {
  const navigate = useNavigate()
  const { clearMustChangePassword, dashboardPath, user } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [showPw, setShowPw]       = useState(false)
  const [error, setError]         = useState('')
  const [loading, setLoading]     = useState(false)

  const strength = passwordStrength(password)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!currentPassword) return setError('Enter your temporary password')
    if (password.length < 8) return setError('New password must be at least 8 characters')
    if (password !== confirm) return setError('Passwords do not match')
    if (password === currentPassword) return setError('New password must be different from your temporary password')

    setLoading(true)
    try {
      await authApi.changePassword({ currentPassword, newPassword: password })
      // Clears mustChangePassword in both localStorage and live AuthContext state —
      // without this, RequireAuth's guard would immediately bounce back here.
      clearMustChangePassword()
      navigate(dashboardPath(user?.role), { replace: true })
    } catch (err) {
      setError(
        err?.status === 401
          ? 'Your temporary password is incorrect.'
          : err?.message || 'Something went wrong. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F6FAFF] font-sans flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-[24px] border border-[#D8E4F5] shadow-[0_20px_50px_-15px_rgba(10,61,145,0.1)] p-8">
          <div className="w-12 h-12 rounded-xl bg-[#DCEEFF] flex items-center justify-center mb-5">
            <ShieldCheck size={20} className="text-[#0A3D91]" />
          </div>
          <h1 className="text-2xl font-bold text-[#172554] mb-2">Set your password</h1>
          <p className="text-sm text-[#64748B] mb-7 leading-relaxed">
            You're signing in with a temporary password. Choose a permanent password to continue.
          </p>

          {error && (
            <div className="mb-5">
              <Alert type="error" message={error} />
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <div>
              <label className="label" htmlFor="currentPassword">Temporary password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  id="currentPassword"
                  type="password"
                  className="input pl-10"
                  placeholder="From your welcome email"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  autoFocus
                />
              </div>
            </div>

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
              {loading ? <Spinner size="sm" className="text-white" /> : 'Set password & continue'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

export default ChangePasswordPage
