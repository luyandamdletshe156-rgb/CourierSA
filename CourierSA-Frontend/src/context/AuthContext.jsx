import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import { authApi } from '@/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [loading, setLoading] = useState(true)  // true while checking stored session

  // ── Re-hydrate session on page load ──────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('accessToken')
    const stored = localStorage.getItem('user')
    if (token && stored) {
      try { setUser(JSON.parse(stored)) } catch { localStorage.clear() }
    }
    setLoading(false)
  }, [])

  // ── Login ─────────────────────────────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    const res = await authApi.login({ email, password })
     const { accessToken, refreshToken, userId, firstName, lastName, role, email: userEmail, mustChangePassword } =
    res.data  

    localStorage.setItem('accessToken',  accessToken)
    localStorage.setItem('refreshToken', refreshToken)

    const profile = { id: userId, firstName, lastName, email: userEmail, role, mustChangePassword } 
    localStorage.setItem('user', JSON.stringify(profile))
    setUser(profile)
    return profile
  }, [])

  // ── Logout ────────────────────────────────────────────────────────────────
  const logout = useCallback(async () => {
    try { await authApi.revoke() } catch { /* best-effort */ }
    localStorage.clear()
    setUser(null)
  }, [])

  const clearMustChangePassword = useCallback(() => {
  setUser(prev => {
    if (!prev) return prev
    const updated = { ...prev, mustChangePassword: false }
    localStorage.setItem('user', JSON.stringify(updated))
    return updated
  })
}, [])

  // ── Role helpers ──────────────────────────────────────────────────────────
  const isRole  = (...roles) => roles.includes(user?.role)
  const isAdmin = () => isRole('Administrator')

  const dashboardPath = (role) => ({
    Administrator:  '/admin/dashboard',
    Dispatcher:     '/dispatcher/dashboard',
    WarehouseStaff: '/warehouse/dashboard',
    Driver:         '/driver/dashboard',
    BusinessClient: '/business/dashboard',
    Customer:       '/customer/dashboard',
  }[role] ?? '/customer/dashboard')

  return (
    <AuthContext.Provider value={{
      user, loading, login, logout,
      isRole, isAdmin,
      dashboardPath,
      clearMustChangePassword, 
      isAuthenticated: !!user,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
