import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { Alert } from '@/components/ui'
import StatusBadge from '@/components/ui/StatusBadge'
import { lostParcelApi } from '@/api'
import { PackageX, Search } from 'lucide-react'
import clsx from 'clsx'

const schema = z.object({
  trackingNumber: z.string().min(5, 'Enter a valid tracking number'),
  customerNotes: z.string().max(500).optional(),
})

export default function ReportLostParcelPage() {
  const { register, handleSubmit, reset, formState: { errors } } = useForm({ resolver: zodResolver(schema) })
  const [formError, setFormError] = useState('')
  const qc = useQueryClient()

  const { data: cases, isLoading } = useQuery({
    queryKey: ['lost-parcel-cases', 'mine'],
    queryFn: () => lostParcelApi.mine(),
  })

  const reportMutation = useMutation({
    mutationFn: dto => lostParcelApi.report(dto),
    onSuccess: () => {
      reset()
      setFormError('')
      qc.invalidateQueries({ queryKey: ['lost-parcel-cases', 'mine'] })
    },
    onError: err => setFormError(err?.message || 'Failed to report lost parcel.'),
  })

  const onSubmit = data => {
    setFormError('')
    reportMutation.mutate({
      trackingNumber: data.trackingNumber.trim().toUpperCase(),
      customerNotes: data.customerNotes?.trim() || null,
    })
  }

  return (
    <AppShell title="Report a Lost Parcel">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white bg-[#EF4444]">
                <PackageX size={15} />
              </div>
              <h3 className="text-sm font-bold text-[#172554]">Report missing delivery</h3>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="label">Tracking number <span className="text-red-400">*</span></label>
              <input
                type="text"
                className={clsx('input font-mono', errors.trackingNumber && 'input-error')}
                placeholder="CSA-20260809-00042"
                {...register('trackingNumber')}
              />
              {errors.trackingNumber && <p className="field-error">{errors.trackingNumber.message}</p>}
            </div>

            <div>
              <label className="label">Additional details (optional)</label>
              <textarea
                rows={4}
                className="input"
                placeholder="e.g. Tracking hasn't updated in 5 days, no delivery attempt recorded…"
                {...register('customerNotes')}
              />
            </div>

            {formError && <Alert type="error" message={formError} />}

            <div className="flex justify-end">
              <button type="submit" disabled={reportMutation.isPending} className="btn-primary px-8">
                {reportMutation.isPending ? 'Submitting…' : 'Report lost parcel'}
              </button>
            </div>
          </form>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-2.5">
              <Search size={16} className="text-[#0A3D91]" />
              <h3 className="text-sm font-bold text-[#172554]">Your reported cases</h3>
            </div>
          </div>

          {isLoading && <p className="text-sm text-[#64748B] py-4">Loading…</p>}
          {!isLoading && (!cases || cases.length === 0) && (
            <p className="text-sm text-[#64748B] py-4">No lost parcel cases reported yet.</p>
          )}
          {!isLoading && cases?.length > 0 && (
            <div className="space-y-3">
              {cases.map(c => (
                <div key={c.id} className="flex items-center justify-between px-4 py-3 rounded-xl border border-[#D8E4F5]">
                  <div>
                    <p className="text-sm font-bold text-[#172554]">{c.caseNumber}</p>
                    <p className="text-xs text-[#64748B] font-mono mt-0.5">{c.trackingNumber}</p>
                    {c.claimNumber && (
                      <p className="text-xs text-[#0A3D91] mt-1">
                        Claim: {c.claimNumber} — <StatusBadge status={c.claimStatus} />
                      </p>
                    )}
                  </div>
                  <StatusBadge status={c.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}