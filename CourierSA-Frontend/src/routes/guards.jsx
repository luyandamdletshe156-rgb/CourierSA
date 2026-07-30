import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'

// ── Require login ─────────────────────────────────────────────────────────────
export function RequireAuth() {
  const { user, isAuthenticated, loading } = useAuth()   // ← add `user`
  const location = useLocation()

  if (loading) return <PageSpinner />
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />

  if (user?.mustChangePassword && location.pathname !== '/change-password') {   // ← add
    return <Navigate to="/change-password" replace />                          // ← add
  }                                                                             // ← add

  return <Outlet />
}

// ── Require specific role(s) ──────────────────────────────────────────────────
export function RequireRole({ roles }) {
  const { user, loading } = useAuth()

  if (loading) return <PageSpinner />
  if (!user) return <Navigate to="/login" replace />
  if (!roles.includes(user.role)) return <Navigate to="/unauthorized" replace />
  return <Outlet />
}

// ── Redirect logged-in users away from /login ─────────────────────────────────
export function GuestOnly() {
  const { isAuthenticated, user, loading, dashboardPath } = useAuth()
  if (loading) return <PageSpinner />
  if (isAuthenticated) return <Navigate to={dashboardPath(user.role)} replace />
  return <Outlet />
}

function PageSpinner() {
  return (
    <div className="min-h-screen bg-canvas flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
        <span className="text-sm text-gray-500">Loading CourierSA…</span>
      </div>
    </div>
  )
}
