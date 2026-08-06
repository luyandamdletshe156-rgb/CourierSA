import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { TrackingProvider } from '@/context/TrackingContext'
import { ParcelCartProvider } from '@/context/ParcelCartContext'
import { RequireAuth, RequireRole, GuestOnly } from '@/routes/guards'

// Public & Auth
import LandingPage from '@/pages/LandingPage'
import LoginPage from '@/pages/auth/LoginPage'
import RegisterPage from '@/pages/auth/RegisterPage'
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage'
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage'
import ChangePasswordPage from '@/pages/auth/ChangePasswordPage'
import { PublicTrackingPage, NotFoundPage, UnauthorizedPage } from '@/pages/PublicPages'

// Customer
import { CustomerDashboard, CustomerParcels } from '@/pages/customer/CustomerPages'
import ParcelDetailPage from '@/pages/customer/ParcelDetailPage'
import BookParcelPage from '@/pages/customer/book/BookParcelPage'
import WalletPage from '@/pages/customer/WalletPage'
import ClaimsPage from '@/pages/customer/ClaimsPage'
import InvoicesPage from '@/pages/customer/InvoicesPage'
import CustomerTrackPage from '@/pages/customer/CustomerTrackPage'

// Dispatcher
import { DispatcherDashboard, DispatchQueue } from '@/pages/dispatcher/DispatcherPages'
import FailedDeliveriesPage from '@/pages/dispatcher/FailedDeliveriesPage'
import LiveMapPage from '@/pages/dispatcher/LiveMapPage'
import DispatcherReassignmentPage from '@/pages/dispatcher/DispatcherReassignmentPage'
import { DispatcherHistoryPage } from '@/pages/dispatcher/DispatcherHistoryPage'
import { MaintenanceSwapsPage } from '@/pages/dispatcher/MaintenanceSwapsPage'
import { DispatcherTrackPage } from '@/pages/dispatcher/DispatcherTrackPage'

// Driver
import { DriverDashboard } from '@/pages/driver/DriverDashboard'
import { DriverDeliveries } from '@/pages/driver/DriverPages'
import { DriverRoute } from '@/pages/driver/DriverRoute'
import { DriverHistoryPage } from '@/pages/driver/DriverHistory'

// Warehouse
import { WarehouseDashboard } from '@/pages/warehouse/WarehouseDashboard'
import { WarehouseInventoryPage } from '@/pages/warehouse/WarehouseInventory'
import { ParcelProcessingPage } from '@/pages/warehouse/ParcelProcessing'
import { WarehouseTrackPage } from '@/pages/warehouse/WarehouseTrack'

// Admin
import { AdminDashboard } from '@/pages/admin/AdminDashboard'
import { AdminReportsPage } from '@/pages/admin/AdminReports'
import { VehicleInspectionsPage } from '@/pages/admin/VehicleInspections'
import CreateStaffPage from '@/pages/admin/CreateStaffPage'
import AdminParcelsPage from '@/pages/admin/AdminParcelsPage'
import AdminFleetPage from '@/pages/admin/AdminFleetPage'
import AuditLogPage from '@/pages/admin/AuditLogPage'

// Business
import { BusinessDashboard } from '@/pages/business/BusinessDashboard'
import BulkUploadPage from '@/pages/business/BulkUploadPage'


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

// Wraps any route subtree that needs access to the parcel cart (Customer + Business).
// Persistence (localStorage) is handled inside ParcelCartProvider itself.
function ParcelCartLayout() {
  return (
    <ParcelCartProvider>
      <Outlet />
    </ParcelCartProvider>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <AuthProvider>
          <TrackingProvider>
            <Routes>
              <Route path="/" element={<RootRedirect />} />
              <Route path="/track" element={<PublicTrackingPage />} />
              <Route path="/track/:number" element={<PublicTrackingPage />} />
              <Route path="/unauthorized" element={<UnauthorizedPage />} />

              <Route element={<GuestOnly />}>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
              </Route>

              <Route element={<RequireAuth />}>
                <Route path="/change-password" element={<ChangePasswordPage />} />

                {/* Customer */}
                <Route element={<RequireRole roles={['Customer']} />}>
                  <Route element={<ParcelCartLayout />}>
                    <Route path="/customer/dashboard" element={<CustomerDashboard />} />
                    <Route path="/customer/parcels" element={<CustomerParcels />} />
                    <Route path="/customer/book" element={<BookParcelPage />} />
                    <Route path="/customer/parcels/:id" element={<ParcelDetailPage />} />
                    <Route path="/customer/track" element={<CustomerTrackPage />} />
                    <Route path="/customer/wallet" element={<WalletPage />} />
                    <Route path="/customer/claims" element={<ClaimsPage />} />
                    <Route path="/customer/invoices" element={<InvoicesPage />} />
                  </Route>
                </Route>

                {/* Dispatcher */}
                <Route element={<RequireRole roles={['Dispatcher', 'Administrator']} />}>
                  <Route path="/dispatcher/dashboard" element={<DispatcherDashboard />} />
                  <Route path="/dispatcher/pending" element={<DispatcherDashboard />} />
                  <Route path="/dispatcher/dispatch" element={<DispatchQueue />} />
                  <Route path="/dispatcher/map" element={<LiveMapPage />} />
                  <Route path="/dispatcher/failed" element={<FailedDeliveriesPage />} />
                  <Route path="/dispatcher/reassign" element={<DispatcherReassignmentPage />} />
                  <Route path="/dispatcher/swaps" element={<MaintenanceSwapsPage />} />
                  <Route path="/dispatcher/history" element={<DispatcherHistoryPage />} />
                  <Route path="/dispatcher/track" element={<DispatcherTrackPage />} />
                </Route>

                {/* Driver */}
                <Route element={<RequireRole roles={['Driver']} />}>
                  <Route path="/driver/dashboard" element={<DriverDashboard />} />
                  <Route path="/driver/deliveries" element={<DriverDeliveries />} />
                  <Route path="/driver/route" element={<DriverRoute />} />
                  <Route path="/driver/history" element={<DriverHistoryPage />} />
                </Route>

                {/* Warehouse */}
                <Route element={<RequireRole roles={['WarehouseStaff', 'Administrator']} />}>
                  <Route path="/warehouse/dashboard" element={<WarehouseDashboard />} />
                  <Route path="/warehouse/inventory" element={<WarehouseInventoryPage />} />
                  <Route path="/warehouse/inspections" element={<ParcelProcessingPage />} />
                  <Route path="/warehouse/track" element={<WarehouseTrackPage />} />
                </Route>

                {/* Admin */}
                <Route element={<RequireRole roles={['Administrator']} />}>
                  <Route path="/admin/dashboard" element={<AdminDashboard />} />
                  <Route path="/admin/parcels" element={<AdminParcelsPage />} />
                  <Route path="/admin/users" element={<AdminDashboard />} />
                  <Route path="/admin/fleet" element={<AdminFleetPage />} />
                  <Route path="/admin/vehicles" element={<VehicleInspectionsPage />} />
                  <Route path="/admin/reports" element={<AdminReportsPage />} />
                  <Route path="/admin/audit-logs" element={<AuditLogPage />} />
                  <Route path="/admin/settings" element={<AdminDashboard />} />
                  <Route path="/admin/staff/new" element={<CreateStaffPage />} />
                </Route>

                {/* Business Client */}
                <Route element={<RequireRole roles={['BusinessClient', 'Administrator']} />}>
                  <Route element={<ParcelCartLayout />}>
                    <Route path="/business/dashboard" element={<BusinessDashboard />} />
                    <Route path="/business/parcels" element={<CustomerParcels />} />
                    <Route path="/business/book" element={<BookParcelPage />} />
                    <Route path="/business/bulk-upload" element={<BulkUploadPage />} />
                    <Route path="/business/invoices" element={<InvoicesPage />} />
                    <Route path="/business/reports" element={<AdminReportsPage />} />
                    <Route path="/business/wallet" element={<WalletPage />} />
                  </Route>
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