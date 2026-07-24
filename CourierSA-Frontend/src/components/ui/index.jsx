import { X, AlertCircle, Package, Inbox } from 'lucide-react'
import clsx from 'clsx'

// ── Status Pill ───────────────────────────────────────────────────────────────
const STATUS_MAP = {
  Delivered:       'status-delivered',
  Failed:          'status-failed',
  FailedDelivery:  'status-failed',
  OutForDelivery:  'status-transit',
  InTransit:       'status-transit',
  PendingApproval: 'status-pending',
  Pending:         'status-pending',
  Approved:        'status-approved',
  InWarehouse:     'status-warehouse',
  Cancelled:       'status-cancelled',
  Draft:           'status-draft',
}

const STATUS_LABELS = {
  PendingApproval: 'Pending',
  OutForDelivery:  'Out for delivery',
  InWarehouse:     'In warehouse',
  FailedDelivery:  'Failed',
}

export function StatusPill({ status }) {
  const cls   = STATUS_MAP[status] ?? 'status-draft'
  const label = STATUS_LABELS[status] ?? status
  return <span className={cls}>{label}</span>
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
export function StatCard({ label, value, icon: Icon, color, sub }) {
  return (
    <div className="stat-card">
      <div className={clsx('stat-icon', color)}>
        <Icon size={20} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-semibold text-gray-900 mt-0.5">{value ?? '—'}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ── Empty State ───────────────────────────────────────────────────────────────
export function EmptyState({ icon: Icon = Package, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        <Icon size={24} className="text-gray-400" />
      </div>
      <h3 className="text-sm font-semibold text-gray-700 mb-1">{title}</h3>
      {description && <p className="text-sm text-gray-500 max-w-xs mb-4">{description}</p>}
      {action}
    </div>
  )
}

// ── Spinner ───────────────────────────────────────────────────────────────────
export function Spinner({ size = 'md', className }) {
  const sizes = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-8 h-8' }
  return (
    <div className={clsx(
      sizes[size],
      'border-2 border-gray-200 border-t-brand-500 rounded-full animate-spin',
      className
    )} />
  )
}

export function PageLoader() {
  return (
    <div className="flex items-center justify-center py-20">
      <Spinner size="lg" />
    </div>
  )
}

// ── Avatar ────────────────────────────────────────────────────────────────────
export function Avatar({ name, size = 'md' }) {
  const initials = name
    ?.split(' ')
    .map(n => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() ?? '?'

  const sizes = {
    sm:  'w-7 h-7 text-xs',
    md:  'w-9 h-9 text-sm',
    lg:  'w-11 h-11 text-base',
  }

  return (
    <div className={clsx(
      'rounded-full bg-brand-500 text-white font-semibold flex items-center justify-center flex-shrink-0',
      sizes[size]
    )}>
      {initials}
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, size = 'md' }) {
  if (!open) return null
  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className={clsx(
        'relative bg-white rounded-xl shadow-modal w-full animate-fade-in',
        widths[size]
      )}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="btn-ghost btn-sm rounded-md -mr-1">
            <X size={16} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

// ── Alert banner ──────────────────────────────────────────────────────────────
export function Alert({ type = 'error', message }) {
  if (!message) return null
  const styles = {
    error:   'bg-red-50 text-red-700 border-red-200',
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    info:    'bg-blue-50 text-blue-700 border-blue-200',
    warning: 'bg-amber-50 text-amber-700 border-amber-200',
  }
  return (
    <div className={clsx(
      'flex items-start gap-2.5 px-4 py-3 rounded-lg border text-sm',
      styles[type]
    )}>
      <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
      <span>{message}</span>
    </div>
  )
}

// ── Tracking number badge ─────────────────────────────────────────────────────
export function TrackingBadge({ value }) {
  return <span className="tracking-number">{value}</span>
}

// ── Live indicator dot ────────────────────────────────────────────────────────
export function LiveDot({ active = true }) {
  return (
    <span className="relative flex h-2 w-2">
      {active && (
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
      )}
      <span className={clsx(
        'relative inline-flex rounded-full h-2 w-2',
        active ? 'bg-emerald-500' : 'bg-gray-300'
      )} />
    </span>
  )
}

// ── Pagination ────────────────────────────────────────────────────────────────
export function Pagination({ page, pageSize, total, onPage }) {
  const totalPages = Math.ceil(total / pageSize)
  if (totalPages <= 1) return null

  return (
    <div className="flex items-center justify-between pt-4 border-t border-gray-100 text-sm text-gray-600">
      <span>{total} total</span>
      <div className="flex items-center gap-1">
        <button
          className="btn-secondary btn-sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </button>
        <span className="px-3 py-1.5 text-gray-500">
          {page} / {totalPages}
        </span>
        <button
          className="btn-secondary btn-sm"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  )
}
