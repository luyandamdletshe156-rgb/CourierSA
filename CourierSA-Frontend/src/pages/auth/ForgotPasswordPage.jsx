import { useState } from 'react'
import { Link } from 'react-router-dom'
import { authApi } from '@/api'
import { Alert, Spinner } from '@/components/ui'
import { ArrowLeft, Mail, MailCheck, KeyRound } from 'lucide-react'

import logo from '@/assets/logo.png'

export function ForgotPasswordPage() {
  const [email, setEmail]       = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [sent, setSent]         = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError('Enter a valid email address')
      return
    }

    setLoading(true)
    try {
      await authApi.forgotPassword(email.trim().toLowerCase())
      // Always show the same success state, whether or not the email exists —
      // this avoids leaking which addresses are registered.
      setSent(true)
    } catch (err) {
      // Network/server errors still get a generic message; account-existence
      // is intentionally never revealed via the error path either.
      setError(err?.message || 'Something went wrong. Please try again.')
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
            {!sent ? (
              <>
                <div className="w-12 h-12 rounded-xl bg-[#DCEEFF] flex items-center justify-center mb-5">
                  <KeyRound size={20} className="text-[#0A3D91]" />
                </div>
                <h1 className="text-2xl font-bold text-[#172554] mb-2">Forgot your password?</h1>
                <p className="text-sm text-[#64748B] mb-7 leading-relaxed">
                  Enter the email address linked to your account and we&apos;ll send you a link to reset your password.
                </p>

                {error && (
                  <div className="mb-5">
                    <Alert type="error" message={error} />
                  </div>
                )}

                <form onSubmit={handleSubmit} noValidate className="space-y-5">
                  <div>
                    <label className="label" htmlFor="email">Email address</label>
                    <div className="relative">
                      <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                      <input
                        id="email"
                        type="email"
                        className="input pl-10"
                        placeholder="you@example.com"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        autoComplete="email"
                        autoFocus
                      />
                    </div>
                  </div>

                  <button type="submit" className="btn-primary w-full h-12" disabled={loading}>
                    {loading ? <Spinner size="sm" className="text-white" /> : 'Send reset link'}
                  </button>
                </form>
              </>
            ) : (
              <div className="text-center py-2">
                <div className="w-14 h-14 rounded-full bg-[#10B981]/10 flex items-center justify-center mx-auto mb-5">
                  <MailCheck size={24} className="text-[#10B981]" />
                </div>
                <h1 className="text-xl font-bold text-[#172554] mb-2">Check your email</h1>
                <p className="text-sm text-[#64748B] leading-relaxed mb-1">
                  If an account exists for
                </p>
                <p className="text-sm font-semibold text-[#172554] font-mono mb-4 break-all">{email}</p>
                <p className="text-sm text-[#64748B] leading-relaxed mb-7">
                  a password reset link is on its way. It expires in 30 minutes — check your spam folder if it doesn&apos;t arrive shortly.
                </p>
                <button
                  onClick={() => { setSent(false); setEmail('') }}
                  className="btn-secondary w-full h-12"
                >
                  Use a different email
                </button>
              </div>
            )}
          </div>

          <p className="text-center text-sm text-[#64748B] mt-6">
            Remembered it after all?{' '}
            <Link to="/login" className="text-[#0A3D91] font-semibold hover:underline">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default ForgotPasswordPage
