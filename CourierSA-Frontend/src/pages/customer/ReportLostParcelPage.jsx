import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { Alert } from '@/components/ui'
import StatusBadge from '@/components/ui/StatusBadge'
import { lostParcelApi, parcelApi } from '@/api'
import {
  PackageX,
  Search,
  CheckCircle2,
  FileText,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Package,
  ShieldCheck,
  AlertTriangle,
  ArrowRight
} from 'lucide-react'
import clsx from 'clsx'

const schema = z.object({
  trackingNumber: z.string().min(1, 'Please select an eligible parcel'),
  customerNotes: z.string().max(500, 'Notes cannot exceed 500 characters').optional(),
})

export default function ReportLostParcelPage() {
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm({ resolver: zodResolver(schema) })

  const [formError, setFormError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [expandedCaseId, setExpandedCaseId] = useState(null)
  const qc = useQueryClient()

  const notesValue = watch('customerNotes', '')

  // 1. Fetch Customer's Reported Lost Parcel Cases
  const { data: casesData, isLoading: isLoadingCases, isError: isCasesError, error: casesError } = useQuery({
    queryKey: ['lost-parcel-cases', 'mine'],
    queryFn: () => lostParcelApi.mine(),
  })

  // 2. Fetch Customer's Parcels
  const { data: parcelsData, isLoading: isLoadingParcels } = useQuery({
    queryKey: ['parcels', 'mine'],
    queryFn: () => parcelApi.list({ pageSize: 100 }),
  })

  // Defensive unwrapping for API response envelopes
  const casesList = Array.isArray(casesData)
    ? casesData
    : Array.isArray(casesData?.data)
    ? casesData.data
    : []

  const rawParcels =
    parcelsData?.data?.items ??
    parcelsData?.items ??
    parcelsData?.data ??
    (Array.isArray(parcelsData) ? parcelsData : [])

  // 3. Filter Eligible Parcels:
  // - Exclude statuses: Delivered, Cancelled, Lost
  // - Exclude parcels that already have an open lost-parcel report
  const INELIGIBLE_STATUSES = ['delivered', 'cancelled', 'lost']
  const existingReportedTrackingNumbers = new Set(casesList.map(c => c.trackingNumber))

  const eligibleParcels = rawParcels.filter(p => {
    const statusLower = p.status?.toLowerCase() || ''
    const isStatusEligible = !INELIGIBLE_STATUSES.includes(statusLower)
    const hasNoOpenCase = !existingReportedTrackingNumbers.has(p.trackingNumber)
    return isStatusEligible && hasNoOpenCase
  })

  const reportMutation = useMutation({
    mutationFn: dto => lostParcelApi.report(dto),
    onSuccess: res => {
      reset()
      setFormError('')
      const caseNum = res?.caseNumber || res?.data?.caseNumber
      setSuccessMessage(
        caseNum
          ? `Lost parcel report submitted successfully! Case reference: ${caseNum}`
          : 'Lost parcel report submitted successfully!'
      )
      qc.invalidateQueries({ queryKey: ['lost-parcel-cases', 'mine'] })
      qc.invalidateQueries({ queryKey: ['parcels', 'mine'] })
    },
    onError: err => {
      setSuccessMessage('')
      const apiMsg =
        err?.response?.data?.message ||
        err?.response?.data ||
        err?.message ||
        'Failed to report lost parcel. Please try again.'
      setFormError(typeof apiMsg === 'string' ? apiMsg : 'Failed to report lost parcel.')
    },
  })

  const onSubmit = formData => {
    setFormError('')
    setSuccessMessage('')
    reportMutation.mutate({
      trackingNumber: formData.trackingNumber.trim().toUpperCase(),
      customerNotes: formData.customerNotes?.trim() || null,
    })
  }

  return (
    <AppShell title="Report a Lost Parcel">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Report Form Card */}
        <div className="card bg-white p-6 rounded-2xl border border-[#D8E4F5] shadow-sm">
          <div className="flex items-center gap-3 pb-4 mb-5 border-b border-[#E2E8F0]">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white bg-gradient-to-br from-red-500 to-rose-600 shadow-sm">
              <PackageX size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#172554]">Report missing delivery</h3>
              <p className="text-xs text-[#64748B]">
                Select an active parcel to open a missing delivery investigation.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Parcel Dropdown Selection */}
            <div>
              <label className="block text-xs font-semibold text-[#334155] mb-1.5">
                Select Parcel <span className="text-red-500">*</span>
              </label>

              {isLoadingParcels ? (
                <div className="flex items-center gap-2 p-3 border border-[#CBD5E1] rounded-xl text-sm text-[#64748B] bg-[#F8FAFC]">
                  <RefreshCw size={16} className="animate-spin text-[#0A3D91]" /> Loading eligible parcels…
                </div>
              ) : eligibleParcels.length === 0 ? (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-start gap-2.5">
                  <Package size={18} className="shrink-0 text-amber-600 mt-0.5" />
                  <div>
                    <p className="font-semibold">No eligible parcels available</p>
                    <p className="mt-0.5 text-amber-700">
                      Parcels that are Delivered, Cancelled, or already have an open report cannot be selected.
                    </p>
                  </div>
                </div>
              ) : (
                <select
                  className={clsx(
                    'input font-mono w-full p-3 border rounded-xl text-sm transition-all bg-white',
                    errors.trackingNumber
                      ? 'border-red-500 focus:ring-red-200'
                      : 'border-[#CBD5E1] focus:border-[#0A3D91] focus:ring-[#0A3D91]/10'
                  )}
                  {...register('trackingNumber')}
                >
                  <option value="">-- Select a parcel to report --</option>
                  {eligibleParcels.map(p => {
                    const recipient = p.recipientName || p.deliveryAddress?.recipientName
                    return (
                      <option key={p.id || p.trackingNumber} value={p.trackingNumber}>
                        {p.trackingNumber} {recipient ? `— To: ${recipient}` : ''} ({p.status})
                      </option>
                    )
                  })}
                </select>
              )}

              {errors.trackingNumber && (
                <p className="text-xs text-red-500 mt-1 font-medium">{errors.trackingNumber.message}</p>
              )}
            </div>

            {/* Additional Notes */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-semibold text-[#334155]">
                  Additional details <span className="text-[#94A3B8] font-normal">(optional)</span>
                </label>
                <span className="text-[11px] text-[#94A3B8]">
                  {(notesValue || '').length}/500
                </span>
              </div>
              <textarea
                rows={4}
                className="input w-full p-3 border border-[#CBD5E1] rounded-xl text-sm focus:border-[#0A3D91] focus:ring-[#0A3D91]/10"
                placeholder="e.g. Tracking hasn't updated in 5 days, no delivery attempt recorded at my address…"
                {...register('customerNotes')}
              />
            </div>

            {/* Backend Error Banner */}
            {formError && <Alert type="error" message={formError} />}

            {/* Submission Success Banner */}
            {successMessage && (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-start gap-3">
                <CheckCircle2 size={18} className="text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">Report Submitted</p>
                  <p className="text-xs mt-0.5 text-emerald-700">{successMessage}</p>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={reportMutation.isPending || eligibleParcels.length === 0}
                className="btn-primary px-8 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 shadow-md hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {reportMutation.isPending ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" /> Submitting…
                  </>
                ) : (
                  'Report Lost Parcel'
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Reported Cases List Card */}
        <div className="card bg-white p-6 rounded-2xl border border-[#D8E4F5] shadow-sm">
          <div className="flex items-center gap-2.5 pb-4 mb-4 border-b border-[#E2E8F0]">
            <Search size={18} className="text-[#0A3D91]" />
            <h3 className="text-base font-bold text-[#172554]">Your reported cases</h3>
          </div>

          {isLoadingCases && (
            <div className="flex items-center justify-center py-8 text-[#64748B] text-sm gap-2">
              <RefreshCw size={16} className="animate-spin" /> Loading your cases…
            </div>
          )}

          {isCasesError && (
            <Alert
              type="error"
              message={casesError?.response?.data?.message || casesError?.message || 'Failed to load reported cases.'}
            />
          )}

          {!isLoadingCases && !isCasesError && casesList.length === 0 && (
            <div className="text-center py-8 text-[#64748B]">
              <FileText size={28} className="mx-auto mb-2 text-[#94A3B8]" />
              <p className="text-sm font-medium">No lost parcel cases reported yet.</p>
              <p className="text-xs text-[#94A3B8] mt-1">
                Any cases you submit will appear here with live investigation updates.
              </p>
            </div>
          )}

          {!isLoadingCases && !isCasesError && casesList.length > 0 && (
            <div className="space-y-3">
              {casesList.map(c => {
                const isExpanded = expandedCaseId === c.id
                const isConfirmedLost = c.status === 'ConfirmedLost' || c.status === 'Closed'
                const isFound = c.status === 'Found'

                return (
                  <div
                    key={c.id}
                    className="rounded-xl border border-[#D8E4F5] overflow-hidden bg-white hover:border-[#0A3D91]/40 transition-all"
                  >
                    <button
                      className="w-full flex items-center justify-between p-4 text-left hover:bg-[#F8FAFC] transition-colors"
                      onClick={() => setExpandedCaseId(isExpanded ? null : c.id)}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-[#172554]">{c.caseNumber}</p>
                          <span className="text-[10px] bg-[#F1F5F9] text-[#475569] font-mono px-2 py-0.5 rounded-full border border-[#E2E8F0]">
                            {c.trackingNumber}
                          </span>
                        </div>
                        {c.reportedAt && (
                          <p className="text-[11px] text-[#94A3B8] mt-1">
                            Reported on {new Date(c.reportedAt).toLocaleDateString()}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <StatusBadge status={c.status} />
                        {isExpanded ? (
                          <ChevronUp size={16} className="text-[#64748B]" />
                        ) : (
                          <ChevronDown size={16} className="text-[#64748B]" />
                        )}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="p-4 bg-[#F8FAFC] border-t border-[#E2E8F0] space-y-3 text-xs text-[#334155]">
                        {/* Customer Notes */}
                        {c.customerNotes && (
                          <div>
                            <span className="font-semibold text-[#1E293B]">Your Notes:</span>
                            <p className="mt-0.5 text-[#475569] bg-white p-2.5 rounded-lg border border-[#E2E8F0]">
                              {c.customerNotes}
                            </p>
                          </div>
                        )}

                        {/* Staff Investigation Update */}
                        {c.investigationNotes && (
                          <div>
                            <span className="font-semibold text-[#1E293B]">Staff Investigation Update:</span>
                            <p className="mt-0.5 text-[#475569] bg-white p-2.5 rounded-lg border border-[#E2E8F0]">
                              {c.investigationNotes}
                            </p>
                          </div>
                        )}

                        {/* Status Resolution Banner */}
                        {isConfirmedLost && !c.claimNumber && (
                          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 flex items-start gap-2">
                            <AlertTriangle size={16} className="text-amber-600 mt-0.5 shrink-0" />
                            <div>
                              <p className="font-semibold">Parcel Confirmed Lost</p>
                              <p className="text-[11px] mt-0.5 text-amber-700">
                                The investigation confirmed this parcel is lost. An insurance claim is being generated for your declared value.
                              </p>
                            </div>
                          </div>
                        )}

                        {isFound && (
                          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 flex items-start gap-2">
                            <CheckCircle2 size={16} className="text-emerald-600 mt-0.5 shrink-0" />
                            <div>
                              <p className="font-semibold">Parcel Located!</p>
                              <p className="text-[11px] mt-0.5 text-emerald-700">
                                Good news! Your parcel was located in our logistics network and is back in transit to your destination address.
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Linked Insurance Claim Display */}
                        {c.claimNumber && (
                          <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl text-[#0A3D91] space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5 font-bold">
                                <ShieldCheck size={16} className="text-[#0A3D91]" />
                                Insurance Claim: {c.claimNumber}
                              </div>
                              <StatusBadge status={c.claimStatus || 'SUBMITTED'} />
                            </div>
                            <p className="text-[11px] text-[#475569]">
                              Loss claim generated for your declared value. Status updates automatically sync with your claims dashboard.
                            </p>
                            <div className="pt-1 flex justify-end">
                              <a
                                href="/customer/claims"
                                className="text-[11px] font-bold text-[#0A3D91] hover:underline flex items-center gap-1"
                              >
                                View Claim Details & Progress Tracker <ArrowRight size={12} />
                              </a>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}