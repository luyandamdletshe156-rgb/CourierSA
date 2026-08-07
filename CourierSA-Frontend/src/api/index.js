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
  queue:   (params) => api.get('/parcels/queue', { params }),
  get:        id     => api.get(`/parcels/${id}`),
  book:       dto    => api.post('/parcels', dto),
  bookBatch:  dto    => api.post('/parcels/batch', dto),
  approve:    id     => api.put(`/parcels/${id}/approve`),
  reject:     (id, reason) => api.put(`/parcels/${id}/reject`, { reason }),
  checkIn:          (id, sortingBinId) =>
                         api.put(`/parcels/${id}/checkin`, { sortingBinId }),
  sortingSuggestion:(id) => api.get(`/parcels/${id}/sorting-suggestion`),
  checkout:      id        => api.put(`/parcels/${id}/checkout`),
  logInspection: (id, dto) => api.post(`/parcels/${id}/inspections`, dto),
  inspections:   ()        => api.get('/parcels/inspections'),
  dispatch:   (id, driverId) =>
                         api.put(`/parcels/${id}/dispatch`, { driverId }),
  dispatchRoute: (parcelIds, driverId) =>
                         api.post('/parcels/dispatch-route', { parcelIds, driverId }),
  bulkUpload: file   => {
    const form = new FormData()
    form.append('file', file)
    return api.post('/parcels/bulk-upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
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
  updateLocation:(id, lat, lng) =>
                    api.put(`/deliveries/${id}/location`, { latitude: lat, longitude: lng }),
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

export const driverApi = {
  all:        ()         => api.get('/drivers'), // Shared directory
  locations:  ()         => api.get('/drivers/locations'),
  available:  ()         => api.get('/drivers/available'),
  updateLocation: (driverId, lat, lng) =>
    api.put(`/drivers/${driverId}/location`, { latitude: lat, longitude: lng }),
}

export const dispatcherApi = {
  vehicles:       ()       => api.get('/dispatcher/vehicles'),
  reassignDriver: (id, driverId) => api.put(`/dispatcher/vehicles/${id}/reassign`, { driverId }),
}

// ➕ ADD THIS AT THE BOTTOM OF YOUR API FILE
export const invoiceApi = {
  list:        params => api.get('/invoices', { params }),
  get:            id  => api.get(`/invoices/${id}`),
  downloadPdf:    id  => api.get(`/invoices/${id}/pdf`, { responseType: 'blob' }),
}