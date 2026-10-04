import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
})

// ── Request: attach JWT ───────────────────────────────────────────────────────
api.interceptors.request.use(config => {
  const token = localStorage.getItem('accessToken')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ── Response: handle 401, extract data envelope ───────────────────────────────
api.interceptors.response.use(
  response => response.data,   // unwrap { success, data, message }
  async error => {
    const original = error.config

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      try {
        const refreshToken = localStorage.getItem('refreshToken')
        if (!refreshToken) throw new Error('No refresh token')

        const res = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken })
        const { accessToken, refreshToken: newRefresh } = res.data.data

        localStorage.setItem('accessToken',  accessToken)
        localStorage.setItem('refreshToken', newRefresh)
        original.headers.Authorization = `Bearer ${accessToken}`
        return api(original)
      } catch {
        localStorage.clear()
        window.location.href = '/login'
        return Promise.reject(error)
      }
    }

    // Shape error for consistent handling in components
    const message =
      error.response?.data?.message ||
      error.response?.data?.errors?.[0] ||
      error.message ||
      'An unexpected error occurred'

    return Promise.reject({ message, status: error.response?.status, raw: error })
  }
)

export default api

// ── Typed API modules ─────────────────────────────────────────────────────────
export const authApi = {
  login:   dto    => api.post('/auth/login',   dto),
  register:dto    => api.post('/auth/register', dto),
  refresh: token  => api.post('/auth/refresh', { refreshToken: token }),
  revoke:  ()     => api.post('/auth/revoke'),
  forgotPassword: email => api.post('/auth/forgot-password', { email }),
  resetPassword:  dto   => api.post('/auth/reset-password', dto),
  changePassword: dto   => api.post('/auth/change-password', dto),
  me:      ()     => api.get('/auth/me'),
}

export const parcelApi = {
  list:       params => api.get('/parcels', { params }),
  queue:      params => api.get('/parcels/queue', { params }),
  get:        id     => api.get(`/parcels/${id}`),
  book:       dto    => api.post('/parcels', dto),
  bookBatch:  dto    => api.post('/parcels/batch', dto),
  approve:    id     => api.put(`/parcels/${id}/approve`),
  reject:     (id, reason) => api.put(`/parcels/${id}/reject`, { reason }),

  // ➕ ADDED: CUSTOMER PARCEL CANCELLATION ENDPOINTS
  cancelPreview:    id        => api.get(`/parcels/${id}/cancel-quote`),
  requestCancelOtp: id        => api.put(`/parcels/${id}/request-cancel-otp`),
  cancel:           (id, dto) => api.put(`/parcels/${id}/cancel`, dto), // dto: { reason, otp }

  checkIn:          (id, sortingBinId) =>
                         api.put(`/parcels/${id}/checkin`, { sortingBinId }),
  sortingSuggestion:(id) => api.get(`/parcels/${id}/sorting-suggestion`),
  checkout:         id        => api.put(`/parcels/${id}/checkout`),
  logInspection:    (id, dto) => api.post(`/parcels/${id}/inspections`, dto),
  inspections:      ()        => api.get('/parcels/inspections'),
  dispatch:         (id, driverId) =>
                         api.put(`/parcels/${id}/dispatch`, { driverId }),
  dispatchRoute:    ({ parcelIds, driverId }) =>
                         api.post('/parcels/dispatch-route', { parcelIds, driverId }),
  planRoute:           ({ parcelIds, driverId }) =>
                         api.post('/parcels/routes/plan', { parcelIds, driverId }),
  cancelRoute:         id             => api.delete(`/parcels/routes/${id}`),
  routesReadyForRelease: ()           => api.get('/parcels/routes/ready-for-release'),
  releaseRoute:        (id, trackingNumbers) =>
                         api.post(`/parcels/routes/${id}/release`, { trackingNumbers }),
  bulkUpload:       file   => {
    const form = new FormData()
    form.append('file', file)
    return api.post('/parcels/bulk-upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}

// UC14 Validate and Adjust Vehicle Payload / UC15 Split Overloaded Routes
export const payloadApi = {
  overview:      date          => api.get('/payload/overview', { params: date ? { date } : {} }),
  reallocate:    (id, body)    => api.put(`/payload/runs/${id}/reallocate`, body),
  signOff:       (id, body)    => api.post(`/payload/runs/${id}/sign-off`, body ?? {}),
  splitOptions:  id            => api.get(`/payload/runs/${id}/split/options`),
  splitPreview:  (id, body)    => api.post(`/payload/runs/${id}/split/preview`, body),
  splitConfirm:  (id, body)    => api.post(`/payload/runs/${id}/split/confirm`, body),
}

export const upgradeApi = {
  request: (parcelId, body) => api.post(`/parcels/${parcelId}/upgrade-requests`, body),
  mine:    ()               => api.get('/upgrade-requests/mine'),
  pay:     id               => api.post(`/upgrade-requests/${id}/pay`),
  pending: ()               => api.get('/upgrade-requests/pending'),
  review:  (id, body)       => api.put(`/upgrade-requests/${id}/review`, body),
}

export const shiftApi = {
  // admin
  drivers:      ()            => api.get('/roster/drivers'),
  roster:       (from, to)    => api.get('/roster', { params: { from, to } }),
  schedule:     body          => api.post('/roster', body),
  publish:      body          => api.post('/roster/publish', body),
  openShifts:   ()            => api.get('/roster/open'),
  assignShift:  (id, driverId) => api.put(`/roster/shifts/${id}/assign`, { driverId }),
  pendingLeave: ()            => api.get('/leave-requests/pending'),
  leaveImpact:  id            => api.get(`/leave-requests/${id}/impact`),
  reviewLeave:  (id, body)    => api.put(`/leave-requests/${id}/review`, body),
  pendingSwaps: ()            => api.get('/shift-swaps/pending'),
  reviewSwap:   (id, body)    => api.put(`/shift-swaps/${id}/review`, body),
  // driver
  myShifts:     (from, to)    => api.get('/driver/shifts', { params: { from, to } }),
  myLeave:      ()            => api.get('/driver/leave-requests'),
  requestLeave: body          => api.post('/driver/leave-requests', body),
  cancelLeave:  id            => api.delete(`/driver/leave-requests/${id}`),
  swapPeers:    shiftId       => api.get(`/driver/shifts/${shiftId}/swap-peers`),
  mySwaps:      ()            => api.get('/driver/shift-swaps'),
  requestSwap:  body          => api.post('/driver/shift-swaps', body),
  respondSwap:  (id, accept)  => api.put(`/driver/shift-swaps/${id}/respond`, { accept }),
}

export const trackingApi = {
  track:        trackingNumber => api.get(`/tracking/${trackingNumber}`),
  trackPrivate: trackingNumber => api.get(`/tracking/private/${trackingNumber}`),
}

export const quoteApi = {
  calculate: dto => api.post('/quotes/calculate', dto),
  get:       id  => api.get(`/quotes/${id}`),
}

export const walletApi = {
  balance:      ()     => api.get('/wallet/balance'),
  transactions: params => api.get('/wallet/transactions', { params }),
  topUp:        dto    => api.post('/wallet/topup', dto),
  selfTopUp:    dto    => api.post('/wallet/topup/self', dto),
}

export const bulkUploadApi = {
  preview:       file      => {
    const form = new FormData()
    form.append('file', file)
    return api.post('/bulk-upload/preview', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  upload:        file      => {
    const form = new FormData()
    form.append('file', file)
    return api.post('/bulk-upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  history:       ()        => api.get('/bulk-upload/history'),
  historyDetail: uploadId  => api.get(`/bulk-upload/history/${uploadId}`),
  template:      ()        => `${API_BASE}/bulk-upload/template`,  // direct URL for window.open
}

// ── ENRICHED DELIVERY API ─────────────────────────────────────────────────────
export const deliveryApi = {
  myDeliveries:  ()          => api.get('/deliveries/my'),
  summary:       ()          => api.get('/deliveries/summary'),          // Added for Driver Dashboard
  history:       params      => api.get('/deliveries/history', { params }),// Added for Driver History
  failed:        ()          => api.get('/deliveries/failed'),           // Added for Dispatcher Failed list
  markDelivered: (id, dto)   => api.put(`/deliveries/${id}/delivered`, dto),
  markFailed:    (id, dto)   => api.put(`/deliveries/${id}/failed`, dto),
  resolveEscalation: (id, dto) => api.put(`/deliveries/${id}/resolve-escalation`, dto),
  updateLocation:(id, lat, lng) =>
                    api.put(`/deliveries/${id}/location`, { latitude: lat, longitude: lng }),
}

// ── UC02 — Handle Damaged Parcel at Collection ──────────────────────────────────
export const collectionDamageApi = {
  preview: (deliveryId, dto) => api.post(`/collection-damage/${deliveryId}/preview`, dto),
  report:  (deliveryId, dto) => api.post(`/collection-damage/${deliveryId}/report`, dto),
  queue:   ()                => api.get('/collection-damage/queue'),
  resolve: (id, dto)         => api.put(`/collection-damage/${id}/resolve`, dto),
}

export const notificationApi = {
  list:       () => api.get('/notifications'),
  markRead:   id => api.put(`/notifications/${id}/read`),
  markAllRead:() => api.put('/notifications/read-all'),
}

export const adminApi = {
  users:          ()       => api.get('/admin/users'),
  suspendUser:    id       => api.put(`/admin/users/${id}/suspend`),
  reactivateUser: id       => api.put(`/admin/users/${id}/reactivate`),
  auditLogs:      params   => api.get('/admin/audit-logs', { params }),
  dashboardStats: ()       => api.get('/admin/dashboard/stats'),
  createStaffUser: dto     => api.post('/admin/staff', dto),

  // Fleet Management
  vehicles:       ()       => api.get('/admin/vehicles'),
  createVehicle:  dto      => api.post('/admin/vehicles', dto),
  updateVehicle:  (id, dto)=> api.put(`/admin/vehicles/${id}`, dto),
  assignDriver:   (id, driverId) => api.put(`/admin/vehicles/${id}/assign`, { driverId }),
  retireVehicle:  id       => api.delete(`/admin/vehicles/${id}`),
}

export const fraudApi = {
  flagged:        ()             => api.get('/admin/fraud/flagged'),
  get:             customerId    => api.get(`/admin/fraud/${customerId}`),
  evaluate:        customerId    => api.post(`/admin/fraud/${customerId}/evaluate`),
  restrict:       (customerId, dto) => api.post(`/admin/fraud/${customerId}/restrict`, dto),
  liftRestriction: customerId    => api.post(`/admin/fraud/${customerId}/lift-restriction`),
}

export const driverApi = {
  all:            () => api.get('/drivers'),
  locations:      () => api.get('/drivers/locations'),
  available:      () => api.get('/drivers/available'),
  updateLocation: (driverId, lat, lng) =>
    api.put(`/drivers/${driverId}/location`, { latitude: lat, longitude: lng }),
  myStatus:       ()       => api.get('/driver-portal/me'),
  updateMyStatus: status   => api.put('/driver-portal/status', { status }),
  toggleStatus:   status   => api.put('/driver-portal/status', { status }),
}

export const dispatcherApi = {
  vehicles:       ()       => api.get('/dispatcher/vehicles'),
  reassignDriver: (id, driverId) => api.put(`/dispatcher/vehicles/${id}/reassign`, { driverId }),
}

export const invoiceApi = {
  list:        params => api.get('/invoices', { params }),
  get:         id     => api.get(`/invoices/${id}`),
  downloadPdf: id     => api.get(`/invoices/${id}/pdf`, { responseType: 'blob' }),
}

export const lostParcelApi = {
  report:       dto        => api.post('/lost-parcels', dto),
  mine:         ()         => api.get('/lost-parcels/mine'),
  queue:        status     => api.get('/lost-parcels/queue', { params: { status } }),
  get:          id         => api.get(`/lost-parcels/${id}`),
  investigate:  (id, dto)  => api.put(`/lost-parcels/${id}/investigate`, dto),
  resolve:      (id, dto)  => api.put(`/lost-parcels/${id}/resolve`, dto),
  submitClaim:  (id, dto)  => api.post(`/lost-parcels/${id}/insurance-claim`, dto),
}

export const returnApi = {
  request:            dto        => api.post('/return-requests', dto),
  mine:               ()         => api.get('/return-requests/mine'),
  queue:              status     => api.get('/return-requests', { params: { status } }),
  get:                id         => api.get(`/return-requests/${id}`),
  dispatchCollection: (id, driverId) => api.put(`/return-requests/${id}/dispatch-collection`, { driverId }),
  markCollected:      id         => api.put(`/return-requests/${id}/mark-collected`),
  myCollections:      ()         => api.get('/return-requests/my-collections'),
  receive:            id         => api.put(`/return-requests/${id}/receive`),
  inspect:            (id, dto)  => api.put(`/return-requests/${id}/inspect`, dto),
  releaseRefund:      (id, dto)  => api.put(`/return-requests/${id}/release-refund`, dto),
}

export const secureDeliveryApi = {
  flagHighValue:        id        => api.put(`/parcels/${id}/flag-high-value`),
  verifyOtp:            (id, dto) => api.put(`/parcels/${id}/verify-otp`, dto),  // 👈 FIXED THIS LINE
  resendOtp:            id        => api.put(`/parcels/${id}/resend-otp`),
  getOtpPending:        ()        => api.get('/parcels/otp-pending'),
  getHighValueEligible: ()        => api.get('/parcels/high-value-eligible'),
}

export const reschedulingApi = {
  previewFee:  (id, proposedDate) =>
    api.get(`/parcels/${id}/reschedule-quote`, { params: { proposedDate } }),
  reschedule:  (id, newScheduledPickupDate) =>
    api.put(`/parcels/${id}/reschedule`, { newScheduledPickupDate }),
}