import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { TrackingProvider } from '@/context/TrackingContext'
import { RequireAuth, RequireRole, GuestOnly } from '@/routes/guards'

import LandingPage from '@/pages/LandingPage'
import LoginPage from '@/pages/auth/LoginPage'
import RegisterPage from '@/pages/auth/RegisterPage'
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage'
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage'
import ChangePasswordPage from '@/pages/auth/ChangePasswordPage'
import CreateStaffPage from '@/pages/admin/CreateStaffPage'
import AdminParcelsPage from '@/pages/admin/AdminParcelsPage'
import AdminFleetPage from '@/pages/admin/AdminFleetPage'

import { CustomerDashboard, CustomerParcels } from '@/pages/customer/CustomerPages'
import ParcelDetailPage from '@/pages/customer/ParcelDetailPage'
import BookParcelPage  from '@/pages/customer/book/BookParcelPage'
import WalletPage      from '@/pages/customer/WalletPage'
import ClaimsPage      from '@/pages/customer/ClaimsPage'
import InvoicesPage    from '@/pages/customer/InvoicesPage'
import CustomerTrackPage from '@/pages/customer/CustomerTrackPage'

import { DispatcherDashboard, DispatchQueue } from '@/pages/dispatcher/DispatcherPages'
import FailedDeliveriesPage from '@/pages/dispatcher/FailedDeliveriesPage'
import LiveMapPage          from '@/pages/dispatcher/LiveMapPage'
import DispatcherReassignmentPage from '@/pages/dispatcher/DispatcherReassignmentPage'

// Driver Pages
import { DriverDashboard }  from '@/pages/driver/DriverDashboard'
import { DriverDeliveries } from '@/pages/driver/DriverPages'
import { DriverRoute }      from '@/pages/driver/DriverRoute'
import { DriverHistoryPage } from '@/pages/shared/OperationalPages'

import {
  WarehouseDashboard,
  AdminDashboard,
  BusinessDashboard,
} from '@/pages/shared/OtherRolePages'
import { VehicleInspectionsPage, WarehouseInventoryPage, AdminReportsPage } from '@/pages/shared/OperationalPages'

import BulkUploadPage from '@/pages/business/BulkUploadPage'
import AuditLogPage   from '@/pages/admin/AuditLogPage'

import { PublicTrackingPage, NotFoundPage, UnauthorizedPage } from '@/pages/PublicPages'

const qc = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 2, retry: 1, refetchOnWindowFocus: false },
  },
})

function RootRedirect() {
  const { user, isAuthenticated, loading, dashboardPath } = useAuth()
  if (loading) return null
  if (!isAuthenticated) return <LandingPage />
  return <Navigate to={dashboardPath(user.role)} replace />
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <AuthProvider>
          <TrackingProvider>
            <Routes>
              <Route path="/"              element={<RootRedirect />} />
              <Route path="/track"         element={<PublicTrackingPage />} />
              <Route path="/track/:number" element={<PublicTrackingPage />} />
              <Route path="/unauthorized"  element={<UnauthorizedPage />} />

              <Route element={<GuestOnly />}>
                <Route path="/login"    element={<LoginPage />} />
                <Route path="/register"        element={<RegisterPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password"  element={<ResetPasswordPage />} />
              </Route>

              <Route element={<RequireAuth />}>
              <Route path="/change-password" element={<ChangePasswordPage />} />
                {/* Customer */}
                <Route element={<RequireRole roles={['Customer']} />}>
                  <Route path="/customer/dashboard" element={<CustomerDashboard />} />
                  <Route path="/customer/parcels"   element={<CustomerParcels />} />
                  <Route path="/customer/book"      element={<BookParcelPage />} />
                  <Route path="/customer/parcels/:id" element={<ParcelDetailPage />} />
                  <Route path="/customer/track" element={<CustomerTrackPage />} />
                  <Route path="/customer/wallet"    element={<WalletPage />} />
                  <Route path="/customer/claims"    element={<ClaimsPage />} />
                  <Route path="/customer/invoices"  element={<InvoicesPage />} />
                </Route>

                {/* Dispatcher */}
                <Route element={<RequireRole roles={['Dispatcher', 'Administrator']} />}>
                  <Route path="/dispatcher/dashboard" element={<DispatcherDashboard />} />
                  <Route path="/dispatcher/pending"   element={<DispatcherDashboard />} />
                  <Route path="/dispatcher/dispatch"  element={<DispatchQueue />} />
                  <Route path="/dispatcher/map"       element={<LiveMapPage />} />
                  <Route path="/dispatcher/failed"    element={<FailedDeliveriesPage />} />
                  <Route path="/dispatcher/reassign"  element={<DispatcherReassignmentPage />} /> 
                </Route>

                {/* Driver */}
                <Route element={<RequireRole roles={['Driver']} />}>
                  <Route path="/driver/dashboard"  element={<DriverDashboard />} />
                  <Route path="/driver/deliveries" element={<DriverDeliveries />} />
                  <Route path="/driver/route"      element={<DriverRoute />} />
                  <Route path="/driver/history"    element={<DriverHistoryPage />} />
                </Route>

                {/* Warehouse */}
                <Route element={<RequireRole roles={['WarehouseStaff', 'Administrator']} />}>
                  <Route path="/warehouse/dashboard"   element={<WarehouseDashboard />} />
                  <Route path="/warehouse/checkin"     element={<WarehouseDashboard />} />
                  <Route path="/warehouse/inventory"   element={<WarehouseInventoryPage />} />
                  <Route path="/warehouse/inspections" element={<VehicleInspectionsPage />} />
                </Route>

                {/* Admin */}
                <Route element={<RequireRole roles={['Administrator']} />}>
                  <Route path="/admin/dashboard"  element={<AdminDashboard />} />
                  <Route path="/admin/parcels"    element={<AdminParcelsPage />} />
                  <Route path="/admin/users"      element={<AdminDashboard />} />
                  <Route path="/admin/vehicles"   element={<VehicleInspectionsPage />} />
                  <Route path="/admin/reports"    element={<AdminReportsPage />} />
                  <Route path="/admin/audit-logs" element={<AuditLogPage />} />
                  <Route path="/admin/settings"   element={<AdminDashboard />} />
                  <Route path="/admin/staff/new" element={<CreateStaffPage />} />
                  <Route path="/admin/fleet" element={<AdminFleetPage />} />

                </Route>

                {/* Business Client */}
                <Route element={<RequireRole roles={['BusinessClient', 'Administrator']} />}>
                  <Route path="/business/dashboard"   element={<BusinessDashboard />} />
                  <Route path="/business/parcels"     element={<CustomerParcels />} />
                  <Route path="/business/book"        element={<BookParcelPage />} />
                  <Route path="/business/bulk-upload" element={<BulkUploadPage />} />
                  <Route path="/business/invoices"    element={<InvoicesPage />} />
                  <Route path="/business/reports"     element={<AdminReportsPage />} />
                  <Route path="/business/wallet"      element={<WalletPage />} />
                </Route>
              </Route>

              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </TrackingProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}