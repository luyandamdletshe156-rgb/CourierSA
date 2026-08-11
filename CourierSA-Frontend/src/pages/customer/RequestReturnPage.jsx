import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { Alert } from '@/components/ui'
import StatusBadge from '@/components/ui/StatusBadge'
import { returnApi, parcelApi } from '@/api'
import { RotateCcw, Package, CheckCircle2, ChevronDown, ChevronUp, RefreshCw, FileText, Copy } from 'lucide-react'
import { SA_PROVINCES, formatZAR } from '@/utils'
import clsx from 'clsx'

const SA_PROVINCE_ENUM_NAMES = [
  'Gauteng', 'WesternCape', 'EasternCape', 'KwaZuluNatal',
  'Limpopo', 'Mpumalanga', 'NorthWest', 'NorthernCape', 'FreeState',
]

function toProvinceEnum(value) {
  if (!value) return value
  const normalized = value.replace(/[\s-]/g, '').toLowerCase()
  return SA_PROVINCE_ENUM_NAMES.find(name => name.toLowerCase() === normalized) || value
}

const schema = z.object({
  trackingNumber: z.string().min(1, 'Please select a delivered parcel to return'),
  reason: z.string().min(10, 'Please explain why you are returning this item (min 10 characters)').max(500, 'Reason cannot exceed 500 characters'),
  collectionAddress: z.object({
    recipientName:  z.string().min(2, 'Name required'),
    recipientPhone: z.string().regex(/^(\+27|0)[6-8][0-9]{8}$/, 'Enter a valid SA mobile number'),
    recipientEmail: z.string().email('Invalid email').optional().or(z.literal('')),
    streetAddress:  z.string().min(5, 'Street address required'),
    suburb:         z.string().optional(),
    city:           z.string().min(2, 'City required'),
    province:       z.string().min(1, 'Province required'),
    postalCode:     z.string().regex(/^\d{4}$/, 'SA postal codes are 4 digits'),
    specialInstructions: z.string().max(200).optional(),
  }),
})

export default function RequestReturnPage() {
  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(schema)
  })

  const [formError, setFormError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [expandedReturnId, setExpandedReturnId] = useState(null)
  const qc = useQueryClient()

  const selectedTrackingNumber = watch('trackingNumber')
  const reasonValue = watch('reason', '')

  // 1. Fetch My Return Requests
  const { data: returnsData, isLoading: isLoadingReturns, isError: isReturnsError, error: returnsError } = useQuery({
    queryKey: ['return-requests', 'mine'],
    queryFn: () => returnApi.mine(),
  })

  // 2. Fetch My Parcels (using parcelApi)
  const { data: parcelsData, isLoading: isLoadingParcels } = useQuery({
    queryKey: ['parcels', 'mine'],
    queryFn: () => parcelApi.list(),
  })

  // Defensive unwrapping for API response envelopes
  const returnsList = Array.isArray(returnsData)
    ? returnsData
    : Array.isArray(returnsData?.data)
    ? returnsData.data
    : []

  const rawParcels = Array.isArray(parcelsData)
    ? parcelsData
    : Array.isArray(parcelsData?.items)
    ? parcelsData.items
    : Array.isArray(parcelsData?.data)
    ? parcelsData.data
    : []

  // Filter Delivered parcels that don't already have an open return request
  const existingReturnTrackingNumbers = new Set(returnsList.map(r => r.trackingNumber))
  const eligibleParcels = rawParcels.filter(p => {
    const isDelivered = p.status === 'Delivered'
    const hasNoOpenReturn = !existingReturnTrackingNumbers.has(p.trackingNumber)
    return isDelivered && hasNoOpenReturn
  })

  // Selected Parcel object
  const selectedParcel = rawParcels.find(p => p.trackingNumber === selectedTrackingNumber)

  // Quick Action: Auto-fill address from selected parcel's delivery address
  const handleAutoFillAddress = () => {
    if (!selectedParcel) return
    const addr = selectedParcel.deliveryAddress || selectedParcel.pickupAddress
    if (!addr) return

    setValue('collectionAddress.recipientName', addr.recipientName || '', { shouldValidate: true })
    setValue('collectionAddress.recipientPhone', addr.recipientPhone || '', { shouldValidate: true })
    setValue('collectionAddress.recipientEmail', addr.recipientEmail || '', { shouldValidate: true })
    setValue('collectionAddress.streetAddress', addr.streetAddress || '', { shouldValidate: true })
    setValue('collectionAddress.suburb', addr.suburb || '', { shouldValidate: true })
    setValue('collectionAddress.city', addr.city || '', { shouldValidate: true })
    setValue('collectionAddress.province', addr.province || '', { shouldValidate: true })
    setValue('collectionAddress.postalCode', addr.postalCode || '', { shouldValidate: true })
    setValue('collectionAddress.specialInstructions', addr.specialInstructions || '', { shouldValidate: true })
  }

  const requestMutation = useMutation({
    mutationFn: dto => returnApi.request(dto),
    onSuccess: res => {
      reset()
      setFormError('')
      const raNum = res?.raNumber || res?.data?.raNumber
      setSuccessMessage(
        raNum
          ? `Return authorization requested! RA Reference: ${raNum}`
          : 'Return request submitted successfully!'
      )
      qc.invalidateQueries({ queryKey: ['return-requests', 'mine'] })
      qc.invalidateQueries({ queryKey: ['parcels', 'mine'] })
    },
    onError: err => {
      setSuccessMessage('')
      const apiMsg =
        err?.response?.data?.message ||
        err?.response?.data ||
        err?.message ||
        'Failed to request return. Please check your details and try again.'
      setFormError(typeof apiMsg === 'string' ? apiMsg : 'Failed to request return.')
    },
  })

  const onSubmit = data => {
    setFormError('')
    setSuccessMessage('')
    requestMutation.mutate({
      trackingNumber: data.trackingNumber.trim().toUpperCase(),
      reason: data.reason.trim(),
      collectionAddress: {
        recipientName:  data.collectionAddress.recipientName,
        recipientPhone: data.collectionAddress.recipientPhone,
        recipientEmail: data.collectionAddress.recipientEmail || null,
        streetAddress:  data.collectionAddress.streetAddress,
        suburb:         data.collectionAddress.suburb || null,
        city:           data.collectionAddress.city,
        province:       toProvinceEnum(data.collectionAddress.province),
        postalCode:     data.collectionAddress.postalCode,
        country:        'South Africa',
        specialInstructions: data.collectionAddress.specialInstructions?.trim() || null,
      },
    })
  }

  return (
    <AppShell title="Request a Return">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Request Form Card */}
        <div className="card bg-white p-6 rounded-2xl border border-[#D8E4F5] shadow-sm">
          <div className="flex items-center gap-3 pb-4 mb-5 border-b border-[#E2E8F0]">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white bg-gradient-to-br from-[#1E63E9] to-[#0A3D91] shadow-sm">
              <RotateCcw size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#172554]">Return a delivered parcel</h3>
              <p className="text-xs text-[#64748B]">
                Request return collection for delivered items eligible for return or exchange.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Parcel Selection Dropdown */}
            <div>
              <label className="block text-xs font-semibold text-[#334155] mb-1.5">
                Select Delivered Parcel <span className="text-red-500">*</span>
              </label>

              {isLoadingParcels ? (
                <div className="flex items-center gap-2 p-3 border border-[#CBD5E1] rounded-xl text-sm text-[#64748B] bg-[#F8FAFC]">
                  <RefreshCw size={16} className="animate-spin text-[#0A3D91]" /> Loading delivered parcels…
                </div>
              ) : eligibleParcels.length === 0 ? (
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-start gap-2.5">
                  <Package size={18} className="shrink-0 text-amber-600 mt-0.5" />
                  <div>
                    <p className="font-semibold">No delivered parcels available for return</p>
                    <p className="mt-0.5 text-amber-700">
                      Only parcels with status 'Delivered' that do not already have an open return request can be selected.
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
                  <option value="">-- Select a delivered parcel --</option>
                  {eligibleParcels.map(p => {
                    const recipient = p.recipientName || p.deliveryAddress?.recipientName
                    return (
                      <option key={p.id || p.trackingNumber} value={p.trackingNumber}>
                        {p.trackingNumber} {recipient ? `— To: ${recipient}` : ''} (Delivered)
                      </option>
                    )
                  })}
                </select>
              )}

              {errors.trackingNumber && (
                <p className="text-xs text-red-500 mt-1 font-medium">{errors.trackingNumber.message}</p>
              )}
            </div>

            {/* Return Reason */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-semibold text-[#334155]">
                  Reason for return <span className="text-red-500">*</span>
                </label>
                <span className="text-[11px] text-[#94A3B8]">
                  {(reasonValue || '').length}/500
                </span>
              </div>
              <textarea
                rows={3}
                className={clsx(
                  'input w-full p-3 border rounded-xl text-sm transition-all',
                  errors.reason ? 'border-red-500' : 'border-[#CBD5E1] focus:border-[#0A3D91]'
                )}
                placeholder="e.g. Wrong item received, product damaged during transit, size mismatch…"
                {...register('reason')}
              />
              {errors.reason && <p className="text-xs text-red-500 mt-1 font-medium">{errors.reason.message}</p>}
            </div>

            {/* Collection Address Section */}
            <div className="pt-4 border-t border-[#E2E8F0]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                <div>
                  <h4 className="text-sm font-bold text-[#172554]">Collection address</h4>
                  <p className="text-xs text-[#64748B]">Address where the courier should collect the return package.</p>
                </div>

                {/* Auto-fill address button */}
                {selectedParcel && (
                  <button
                    type="button"
                    onClick={handleAutoFillAddress}
                    className="text-xs text-[#0A3D91] font-semibold flex items-center gap-1.5 hover:underline bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200 shrink-0"
                  >
                    <Copy size={13} /> Copy Original Delivery Address
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#334155] mb-1">
                    Full name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Zanele Nkosi"
                    className={clsx('input w-full p-2.5 border rounded-xl text-xs', errors.collectionAddress?.recipientName && 'border-red-500')}
                    {...register('collectionAddress.recipientName')}
                  />
                  {errors.collectionAddress?.recipientName && (
                    <p className="text-xs text-red-500 mt-1 font-medium">{errors.collectionAddress.recipientName.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#334155] mb-1">
                    Mobile number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="+27 82 123 4567"
                    className={clsx('input w-full p-2.5 border rounded-xl text-xs', errors.collectionAddress?.recipientPhone && 'border-red-500')}
                    {...register('collectionAddress.recipientPhone')}
                  />
                  {errors.collectionAddress?.recipientPhone && (
                    <p className="text-xs text-red-500 mt-1 font-medium">{errors.collectionAddress.recipientPhone.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#334155] mb-1">
                    Email <span className="text-[#94A3B8] font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="zanele@email.com"
                    className="input w-full p-2.5 border border-[#CBD5E1] rounded-xl text-xs"
                    {...register('collectionAddress.recipientEmail')}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#334155] mb-1">
                    Street address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="78 Victoria Embankment"
                    className={clsx('input w-full p-2.5 border rounded-xl text-xs', errors.collectionAddress?.streetAddress && 'border-red-500')}
                    {...register('collectionAddress.streetAddress')}
                  />
                  {errors.collectionAddress?.streetAddress && (
                    <p className="text-xs text-red-500 mt-1 font-medium">{errors.collectionAddress.streetAddress.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#334155] mb-1">
                    Suburb <span className="text-[#94A3B8] font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Morningside"
                    className="input w-full p-2.5 border border-[#CBD5E1] rounded-xl text-xs"
                    {...register('collectionAddress.suburb')}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#334155] mb-1">
                    City <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Durban"
                    className={clsx('input w-full p-2.5 border rounded-xl text-xs', errors.collectionAddress?.city && 'border-red-500')}
                    {...register('collectionAddress.city')}
                  />
                  {errors.collectionAddress?.city && (
                    <p className="text-xs text-red-500 mt-1 font-medium">{errors.collectionAddress.city.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#334155] mb-1">
                    Province <span className="text-red-500">*</span>
                  </label>
                  <select
                    className={clsx('input w-full p-2.5 border rounded-xl text-xs bg-white', errors.collectionAddress?.province && 'border-red-500')}
                    {...register('collectionAddress.province')}
                  >
                    <option value="">Select province…</option>
                    {SA_PROVINCES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                  {errors.collectionAddress?.province && (
                    <p className="text-xs text-red-500 mt-1 font-medium">{errors.collectionAddress.province.message}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#334155] mb-1">
                    Postal code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="4001"
                    className={clsx('input w-full p-2.5 border rounded-xl text-xs', errors.collectionAddress?.postalCode && 'border-red-500')}
                    {...register('collectionAddress.postalCode')}
                  />
                  {errors.collectionAddress?.postalCode && (
                    <p className="text-xs text-red-500 mt-1 font-medium">{errors.collectionAddress.postalCode.message}</p>
                  )}
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[#334155] mb-1">
                    Collection notes <span className="text-[#94A3B8] font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Gate code 4521, leave at security gate"
                    className="input w-full p-2.5 border border-[#CBD5E1] rounded-xl text-xs"
                    {...register('collectionAddress.specialInstructions')}
                  />
                </div>
              </div>
            </div>

            {/* Backend Error Banner */}
            {formError && <Alert type="error" message={formError} />}

            {/* Submission Success Banner */}
            {successMessage && (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-start gap-3">
                <CheckCircle2 size={18} className="text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold">Return Authorized</p>
                  <p className="text-xs mt-0.5 text-emerald-700">{successMessage}</p>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={requestMutation.isPending || eligibleParcels.length === 0}
                className="btn-primary px-8 py-2.5 rounded-xl font-semibold text-sm flex items-center gap-2 shadow-md hover:shadow-lg transition-all disabled:opacity-50"
              >
                {requestMutation.isPending ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" /> Submitting…
                  </>
                ) : (
                  'Request Return'
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Return Requests List Card */}
        <div className="card bg-white p-6 rounded-2xl border border-[#D8E4F5] shadow-sm">
          <div className="flex items-center gap-2.5 pb-4 mb-4 border-b border-[#E2E8F0]">
            <RotateCcw size={18} className="text-[#0A3D91]" />
            <h3 className="text-base font-bold text-[#172554]">Your return requests</h3>
          </div>

          {isLoadingReturns && (
            <div className="flex items-center justify-center py-8 text-[#64748B] text-sm gap-2">
              <RefreshCw size={16} className="animate-spin" /> Loading return requests…
            </div>
          )}

          {isReturnsError && (
            <Alert
              type="error"
              message={returnsError?.response?.data?.message || returnsError?.message || 'Failed to load return requests.'}
            />
          )}

          {!isLoadingReturns && !isReturnsError && returnsList.length === 0 && (
            <div className="text-center py-8 text-[#64748B]">
              <FileText size={28} className="mx-auto mb-2 text-[#94A3B8]" />
              <p className="text-sm font-medium">No return requests submitted yet.</p>
            </div>
          )}

          {!isLoadingReturns && !isReturnsError && returnsList.length > 0 && (
            <div className="space-y-3">
              {returnsList.map(r => {
                const isExpanded = expandedReturnId === r.id
                return (
                  <div
                    key={r.id}
                    className="rounded-xl border border-[#D8E4F5] overflow-hidden bg-white hover:border-[#0A3D91]/40 transition-all"
                  >
                    <button
                      className="w-full flex items-center justify-between p-4 text-left hover:bg-[#F8FAFC] transition-colors"
                      onClick={() => setExpandedReturnId(isExpanded ? null : r.id)}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-[#172554]">{r.raNumber}</p>
                          <span className="text-[10px] bg-[#F1F5F9] text-[#475569] font-mono px-2 py-0.5 rounded-full border border-[#E2E8F0]">
                            {r.trackingNumber}
                          </span>
                        </div>
                        {r.refundAmountZAR != null && (
                          <p className="text-xs text-[#10B981] font-semibold mt-1">
                            Refund Released: {formatZAR(r.refundAmountZAR)}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <StatusBadge status={r.status} />
                        {isExpanded ? (
                          <ChevronUp size={16} className="text-[#64748B]" />
                        ) : (
                          <ChevronDown size={16} className="text-[#64748B]" />
                        )}
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="p-4 bg-[#F8FAFC] border-t border-[#E2E8F0] space-y-3 text-xs text-[#334155]">
                        {r.reason && (
                          <div>
                            <span className="font-semibold text-[#1E293B]">Return Reason:</span>
                            <p className="mt-0.5 text-[#475569] bg-white p-2.5 rounded-lg border border-[#E2E8F0]">
                              {r.reason}
                            </p>
                          </div>
                        )}
                        {r.inspectionNotes && (
                          <div>
                            <span className="font-semibold text-[#1E293B]">Warehouse Inspection Update:</span>
                            <p className="mt-0.5 text-[#475569] bg-white p-2.5 rounded-lg border border-[#E2E8F0]">
                              {r.inspectionNotes}
                            </p>
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