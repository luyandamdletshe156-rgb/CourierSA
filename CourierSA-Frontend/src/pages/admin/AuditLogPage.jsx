import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { EmptyState, PageLoader, Pagination, Modal } from '@/components/ui'
import { adminApi } from '@/api'
import { ShieldCheck, Search, ChevronRight, Eye } from 'lucide-react'
import { formatDate } from '@/utils'
import clsx from 'clsx'

// ── Action colour coding ──────────────────────────────────────────────────────
const ACTION_STYLES = {
  LOGIN:             'bg-blue-50   text-blue-700   border-blue-200',
  REGISTER:          'bg-green-50  text-green-700  border-green-200',
  PARCEL_BOOKED:     'bg-brand-50  text-brand-700  border-brand-200',
  PARCEL_APPROVED:   'bg-green-50  text-green-700  border-green-200',
  PARCEL_REJECTED:   'bg-red-50    text-red-700    border-red-200',
  PARCEL_DISPATCHED: 'bg-brand-50  text-brand-600  border-brand-200',
  PARCEL_DELIVERED:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  DELIVERY_FAILED:   'bg-red-50    text-red-600    border-red-200',
  USER_SUSPENDED:    'bg-red-50    text-red-700    border-red-200',
  CLAIM_SUBMITTED:   'bg-amber-50  text-amber-700  border-amber-200',
  INVOICE_GENERATED: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  PARCEL_CHECKIN:    'bg-violet-50 text-violet-700 border-violet-200',
}

export default function AuditLogPage() {
  const [page, setPage]     = useState(1)
  const [search, setSearch] = useState('')
  const [detail, setDetail] = useState(null)
  const pageSize = 20

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', page, search],
    queryFn:  () => adminApi.auditLogs({ page, pageSize, search: search || undefined }),
    keepPreviousData: true,
  })

  const logs  = data?.data?.items ?? data?.data ?? []
  const total = data?.data?.totalCount ?? logs.length

  return (
    <AppShell title="Audit Logs">
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit Logs</h1>
          <p className="page-subtitle">Complete tamper-evident record of all system actions</p>
        </div>
      </div>

      {/* Search */}
      <div className="card mb-4">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Search by action, entity type, or user…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
      </div>

      <div className="card">
        {isLoading ? <PageLoader /> : logs.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="No audit logs found" description="Actions will be recorded here." />
        ) : (
          <>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>Performed by</th>
                    <th>IP address</th>
                    <th>Timestamp</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map(log => {
                    const style = ACTION_STYLES[log.action] ?? 'bg-gray-100 text-gray-600 border-gray-200'
                    return (
                      <tr key={log.id}>
                        <td>
                          <span className={clsx(
                            'text-xs font-semibold px-2 py-0.5 rounded border uppercase tracking-wide',
                            style
                          )}>
                            {log.action?.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td>
                          <p className="text-xs font-medium text-gray-700">{log.entityType}</p>
                          {log.entityId && (
                            <p className="font-mono text-xs text-gray-400 truncate max-w-[120px]">
                              {log.entityId}
                            </p>
                          )}
                        </td>
                        <td className="text-xs text-gray-600">
                          {log.user
                            ? `${log.user.firstName} ${log.user.lastName}`
                            : log.userId
                              ? <span className="font-mono text-gray-400">{log.userId.slice(0, 8)}…</span>
                              : <span className="text-gray-400">System</span>}
                        </td>
                        <td className="font-mono text-xs text-gray-400">{log.ipAddress ?? '—'}</td>
                        <td className="text-xs text-gray-400 whitespace-nowrap">
                          {formatDate(log.createdAt, { time: true })}
                        </td>
                        <td>
                          {(log.oldValues || log.newValues) && (
                            <button
                              className="btn-ghost btn-sm"
                              onClick={() => setDetail(log)}
                              title="View diff"
                            >
                              <Eye size={13} />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={pageSize} total={total} onPage={setPage} />
          </>
        )}
      </div>

      {/* Diff modal */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={`${detail?.action} — diff`} size="lg">
        <div className="grid grid-cols-2 gap-4">
          {detail?.oldValues && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Before</p>
              <pre className="text-xs bg-red-50 border border-red-200 rounded-lg p-3 overflow-auto max-h-64 text-red-800">
                {JSON.stringify(JSON.parse(detail.oldValues), null, 2)}
              </pre>
            </div>
          )}
          {detail?.newValues && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">After</p>
              <pre className="text-xs bg-green-50 border border-green-200 rounded-lg p-3 overflow-auto max-h-64 text-green-800">
                {JSON.stringify(JSON.parse(detail.newValues), null, 2)}
              </pre>
            </div>
          )}
        </div>
        <div className="flex justify-end mt-4">
          <button className="btn-secondary" onClick={() => setDetail(null)}>Close</button>
        </div>
      </Modal>
    </AppShell>
  )
}
