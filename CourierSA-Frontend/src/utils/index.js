// ── Date formatting ───────────────────────────────────────────────────────────
export function formatDate(dateStr, { time = false } = {}) {
  if (!dateStr) return '—'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return '—'

  return d.toLocaleDateString('en-ZA', {
    day:   '2-digit',
    month: 'short',
    year:  'numeric',
    ...(time ? { hour: '2-digit', minute: '2-digit' } : {}),
  })
}

// ── ZAR currency ──────────────────────────────────────────────────────────────
export function formatZAR(amount) {
  if (amount == null) return '—'
  return new Intl.NumberFormat('en-ZA', {
    style:    'currency',
    currency: 'ZAR',
    minimumFractionDigits: 2,
  }).format(amount)
}

// ── Relative time ─────────────────────────────────────────────────────────────
export function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins  = Math.floor(diff / 60000)
  if (mins < 1)  return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)  return `${hrs}h ago`
  return formatDate(dateStr)
}

// ── Parcel status to readable ─────────────────────────────────────────────────
export const STATUS_LABEL = {
  Draft:           'Draft',
  PendingApproval: 'Pending approval',
  Approved:        'Approved',
  InWarehouse:     'In warehouse',
  OutForDelivery:  'Out for delivery',
  Delivered:       'Delivered',
  FailedDelivery:  'Delivery failed',
  Cancelled:       'Cancelled',
  Returned:        'Returned',
}

// ── SA Provinces ──────────────────────────────────────────────────────────────
export const SA_PROVINCES = [
  { value: 'Gauteng',          label: 'Gauteng' },
  { value: 'WesternCape',      label: 'Western Cape' },
  { value: 'EasternCape',      label: 'Eastern Cape' },
  { value: 'KwaZuluNatal',     label: 'KwaZulu-Natal' },
  { value: 'Limpopo',          label: 'Limpopo' },
  { value: 'Mpumalanga',       label: 'Mpumalanga' },
  { value: 'NorthWest',        label: 'North West' },
  { value: 'NorthernCape',     label: 'Northern Cape' },
  { value: 'FreeState',        label: 'Free State' },
]

// ── Service types ─────────────────────────────────────────────────────────────
export const SERVICE_TYPES = [
  { value: 'Standard',   label: 'Standard (3–5 days)' },
  { value: 'Express',    label: 'Express (1–2 days)' },
  { value: 'Overnight',  label: 'Overnight' },
  { value: 'SameDay',    label: 'Same day' },
  { value: 'Economy',    label: 'Economy (5–7 days)' },
]

// ── Truncate text ─────────────────────────────────────────────────────────────
export function truncate(str, maxLen = 40) {
  if (!str) return ''
  return str.length > maxLen ? `${str.slice(0, maxLen)}…` : str
}

// ── Debounce ──────────────────────────────────────────────────────────────────
export function debounce(fn, ms = 300) {
  let timer
  return (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), ms)
  }
}
