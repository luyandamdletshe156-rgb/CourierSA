import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { StatCard, TrackingBadge, EmptyState, PageLoader, Modal, Alert } from '@/components/ui'
import { collectionDamageApi } from '@/api'
import { formatDate } from '@/utils'
import { AlertTriangle, CheckCircle, XCircle, Image as ImageIcon, Clock } from 'lucide-react'

const SEVERITY_STYLE = {
  Minor:    'bg-emerald-100 text-emerald-700 border-emerald-200',
  Moderate: 'bg-amber-100 text-amber-700 border-amber-200',
  Severe:   'bg-red-100 text-red-700 border-red-200',
}

const DAMAGE_TYPE_LABELS = {
  Crushed:           'Crushed',
  TornOrPunctured:   'Torn / Punctured',
  WaterDamage:       'Water damage',
  Leaking:           'Leaking',
  BrokenOrShattered: 'Broken / Shattered',
  Other:             'Other',
}

// ── UC02 — Handle Damaged Parcel at Collection: dispatcher escalation queue.
//    Only reports the severity-threshold engine couldn't resolve on its own
//    (Moderate severity, or Minor on a high-value/insured parcel) land here —
//    Severe (auto-rejected) and plain Minor (auto-proceeded) never need a human. ──
export default function DamageEscalationQueuePage() {
  const qc = useQueryClient()
  const [resolveModal, setResolveModal] = useState(null)   // the report being resolved
  const [resolveOutcome, setResolveOutcome] = useState('Proceed')
  const [resolveNotes, setResolveNotes] = useState('')
  const [photoViewer, setPhotoViewer] = useState(null)      // photo data-url being enlarged

  const { data, isLoading } = useQuery({
    queryKey: ['damage-escalation-queue'],
    queryFn:  collectionDamageApi.queue,
    refetchInterval: 30000,
  })

  const reports = data?.data ?? []

  const openResolveModal = (report) => {
    setResolveModal(report)
    setResolveOutcome('Proceed')
    setResolveNotes('')
  }

  const resolveMutation = useMutation({
    mutationFn: () => collectionDamageApi.resolve(resolveModal.id, {
      outcome: resolveOutcome,
      notes: resolveNotes,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['damage-escalation-queue'] })
      qc.invalidateQueries({ queryKey: ['driver-deliveries'] })
      setResolveModal(null)
    },
  })

  const severeCount   = reports.filter(r => r.severity === 'Severe').length
  const moderateCount = reports.filter(r => r.severity === 'Moderate').length

  return (
    <AppShell title="Damaged Parcel Escalations">
      <div className="page-header">
        <div>
          <h1 className="page-title">Damaged Parcel Escalations</h1>
          <p className="page-subtitle">
            Collection damage reports the system couldn't resolve on its own — your call decides whether the driver proceeds
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Pending review" value={reports.length} icon={AlertTriangle} color="bg-amber-500" />
        <StatCard label="Moderate severity" value={moderateCount} icon={Clock} color="bg-amber-500" />
        <StatCard label="Severe severity" value={severeCount} icon={XCircle} color="bg-red-500" />
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="text-sm font-semibold text-gray-800">Escalated damage reports</h2>
        </div>

        {isLoading ? (
          <PageLoader />
        ) : reports.length === 0 ? (
          <EmptyState
            icon={CheckCircle}
            title="No pending escalations"
            description="All damage reports have been resolved. Drivers see your decision immediately."
          />
        ) : (
          <div className="space-y-3 p-4">
            {reports.map(r => (
              <div key={r.id} className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <TrackingBadge value={r.trackingNumber} />
                      <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full border ${SEVERITY_STYLE[r.severity] ?? SEVERITY_STYLE.Moderate}`}>
                        {r.severity}
                      </span>
                      <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full bg-gray-100 text-gray-600 border border-gray-200">
                        {DAMAGE_TYPE_LABELS[r.damageType] ?? r.damageType}
                      </span>
                    </div>

                    <p className="text-xs text-gray-500">
                      Reported by <span className="font-medium text-gray-700">{r.driverName ?? 'Unknown driver'}</span> · {formatDate(r.createdAt, { time: true })}
                    </p>

                    {r.notes && (
                      <p className="text-sm text-gray-700 mt-2 bg-white border border-amber-200/60 rounded-lg px-3 py-2">
                        {r.notes}
                      </p>
                    )}

                    {r.photoDataUrls?.length > 0 && (
                      <div className="flex gap-2 mt-2">
                        {r.photoDataUrls.map((src, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setPhotoViewer(src)}
                            className="w-14 h-14 rounded-lg overflow-hidden border border-gray-200 hover:border-amber-400 transition-colors flex-shrink-0"
                          >
                            <img src={src} alt={`Damage evidence ${i + 1}`} className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </div>
                    )}

                    <p className="text-xs text-amber-700 mt-2 flex items-center gap-1">
                      <ImageIcon size={12} />
                      System recommendation: <span className="font-semibold">{r.systemRecommendedOutcome}</span>
                    </p>
                  </div>

                  <div className="flex-shrink-0">
                    <button
                      className="btn-primary btn-sm w-full sm:w-auto"
                      onClick={() => openResolveModal(r)}
                    >
                      Resolve
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resolve modal */}
      <Modal
        open={!!resolveModal}
        onClose={() => setResolveModal(null)}
        title="Resolve damage escalation"
        size="sm"
      >
        {resolveModal && (
          <>
            <p className="text-sm text-gray-600 mb-1">
              Deciding for <TrackingBadge value={resolveModal.trackingNumber} />
            </p>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-4">
              {DAMAGE_TYPE_LABELS[resolveModal.damageType] ?? resolveModal.damageType} · {resolveModal.severity} severity
              {resolveModal.notes && ` — "${resolveModal.notes}"`}
            </p>

            <label className="label mb-2">Decision</label>
            <div className="grid grid-cols-2 gap-2 mb-4">
              <button
                type="button"
                onClick={() => setResolveOutcome('Proceed')}
                className={`px-3 py-2.5 text-sm font-bold rounded-lg border-2 transition-all active:scale-95 ${
                  resolveOutcome === 'Proceed'
                    ? 'bg-emerald-500 text-white border-emerald-500 shadow-md'
                    : 'bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50'
                }`}
              >
                <CheckCircle size={15} className="inline mr-1.5 -mt-0.5" />
                Proceed
              </button>
              <button
                type="button"
                onClick={() => setResolveOutcome('Rejected')}
                className={`px-3 py-2.5 text-sm font-bold rounded-lg border-2 transition-all active:scale-95 ${
                  resolveOutcome === 'Rejected'
                    ? 'bg-red-500 text-white border-red-500 shadow-md'
                    : 'bg-white text-red-700 border-red-300 hover:bg-red-50'
                }`}
              >
                <XCircle size={15} className="inline mr-1.5 -mt-0.5" />
                Reject
              </button>
            </div>

            <label className="label" htmlFor="resolve-notes">Decision notes (optional)</label>
            <textarea
              id="resolve-notes"
              className="input h-20 resize-none"
              placeholder="Reasoning for the driver and audit trail…"
              value={resolveNotes}
              onChange={e => setResolveNotes(e.target.value)}
            />

            {resolveMutation.error && (
              <Alert type="error" message={resolveMutation.error.message} className="mt-3" />
            )}

            <div className="flex justify-end gap-2 mt-4">
              <button className="btn-secondary" onClick={() => setResolveModal(null)}>Cancel</button>
              <button
                className={resolveOutcome === 'Rejected' ? 'btn-danger' : 'btn-primary'}
                disabled={resolveMutation.isPending}
                onClick={() => resolveMutation.mutate()}
              >
                {resolveMutation.isPending ? 'Saving…' : `Confirm ${resolveOutcome === 'Proceed' ? 'Proceed' : 'Rejection'}`}
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* Photo viewer */}
      <Modal
        open={!!photoViewer}
        onClose={() => setPhotoViewer(null)}
        title="Damage evidence"
        size="md"
      >
        {photoViewer && (
          <img src={photoViewer} alt="Damage evidence, enlarged" className="w-full rounded-lg" />
        )}
      </Modal>
    </AppShell>
  )
}