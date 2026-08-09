import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { Alert } from '@/components/ui'
import StatusBadge from '@/components/ui/StatusBadge'
import { returnApi } from '@/api'
import { RotateCcw, Package } from 'lucide-react'
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
  trackingNumber: z.string().min(5, 'Enter a valid tracking number'),
  reason: z.string().min(10, 'Please explain why you are returning this item (min 10 characters)'),
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
  const { register, handleSubmit, reset, formState: { errors } } = useForm({ resolver: zodResolver(schema) })
  const [formError, setFormError] = useState('')
  const qc = useQueryClient()

  const { data: returns, isLoading } = useQuery({
    queryKey: ['return-requests', 'mine'],
    queryFn: () => returnApi.mine(),
  })

  const requestMutation = useMutation({
    mutationFn: dto => returnApi.request(dto),
    onSuccess: () => {
      reset()
      setFormError('')
      qc.invalidateQueries({ queryKey: ['return-requests', 'mine'] })
    },
    onError: err => setFormError(err?.message || 'Failed to request return.'),
  })

  const onSubmit = data => {
    setFormError('')
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
        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white bg-[#1E63E9]">
                <RotateCcw size={15} />
              </div>
              <h3 className="text-sm font-bold text-[#172554]">Return a delivered parcel</h3>
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
              <label className="label">Reason for return <span className="text-red-400">*</span></label>
              <textarea
                rows={3}
                className={clsx('input', errors.reason && 'input-error')}
                placeholder="e.g. Wrong item received, item damaged in transit…"
                {...register('reason')}
              />
              {errors.reason && <p className="field-error">{errors.reason.message}</p>}
            </div>

            <div className="pt-2 border-t border-[#D8E4F5]">
              <h4 className="text-sm font-bold text-[#172554] mb-3 mt-3">Collection address</h4>
              <div className="grid grid-cols-2 gap-4">
                {[
                  ['recipientName', 'Full name', 'Zanele Nkosi', true],
                  ['recipientPhone', 'Mobile number', '+27 82 123 4567', true],
                  ['recipientEmail', 'Email (optional)', 'zanele@email.com', false],
                ].map(([name, label, placeholder, required]) => (
                  <div key={name} className={name === 'recipientName' ? 'col-span-2' : ''}>
                    <label className="label">{label}{required && <span className="text-red-400 ml-0.5">*</span>}</label>
                    <input
                      type="text" placeholder={placeholder}
                      className={clsx('input', errors.collectionAddress?.[name] && 'input-error')}
                      {...register(`collectionAddress.${name}`)}
                    />
                    {errors.collectionAddress?.[name] && <p className="field-error">{errors.collectionAddress[name].message}</p>}
                  </div>
                ))}
                <div className="col-span-2">
                  <label className="label">Street address <span className="text-red-400">*</span></label>
                  <input
                    type="text" placeholder="78 Victoria Embankment"
                    className={clsx('input', errors.collectionAddress?.streetAddress && 'input-error')}
                    {...register('collectionAddress.streetAddress')}
                  />
                  {errors.collectionAddress?.streetAddress && <p className="field-error">{errors.collectionAddress.streetAddress.message}</p>}
                </div>
                <div>
                  <label className="label">Suburb</label>
                  <input type="text" placeholder="Morningside" className="input" {...register('collectionAddress.suburb')} />
                </div>
                <div>
                  <label className="label">City <span className="text-red-400">*</span></label>
                  <input
                    type="text" placeholder="Durban"
                    className={clsx('input', errors.collectionAddress?.city && 'input-error')}
                    {...register('collectionAddress.city')}
                  />
                  {errors.collectionAddress?.city && <p className="field-error">{errors.collectionAddress.city.message}</p>}
                </div>
                <div>
                  <label className="label">Province <span className="text-red-400">*</span></label>
                  <select className={clsx('input', errors.collectionAddress?.province && 'input-error')} {...register('collectionAddress.province')}>
                    <option value="">Select province…</option>
                    {SA_PROVINCES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                  {errors.collectionAddress?.province && <p className="field-error">{errors.collectionAddress.province.message}</p>}
                </div>
                <div>
                  <label className="label">Postal code <span className="text-red-400">*</span></label>
                  <input
                    type="text" placeholder="4001"
                    className={clsx('input', errors.collectionAddress?.postalCode && 'input-error')}
                    {...register('collectionAddress.postalCode')}
                  />
                  {errors.collectionAddress?.postalCode && <p className="field-error">{errors.collectionAddress.postalCode.message}</p>}
                </div>
                <div className="col-span-2">
                  <label className="label">Collection notes (optional)</label>
                  <input type="text" placeholder="e.g. Gate code 4521" className="input" {...register('collectionAddress.specialInstructions')} />
                </div>
              </div>
            </div>

            {formError && <Alert type="error" message={formError} />}

            <div className="flex justify-end pt-2">
              <button type="submit" disabled={requestMutation.isPending} className="btn-primary px-8">
                {requestMutation.isPending ? 'Submitting…' : 'Request return'}
              </button>
            </div>
          </form>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-2.5">
              <Package size={16} className="text-[#0A3D91]" />
              <h3 className="text-sm font-bold text-[#172554]">Your return requests</h3>
            </div>
          </div>

          {isLoading && <p className="text-sm text-[#64748B] py-4">Loading…</p>}
          {!isLoading && (!returns || returns.length === 0) && (
            <p className="text-sm text-[#64748B] py-4">No return requests yet.</p>
          )}
          {!isLoading && returns?.length > 0 && (
            <div className="space-y-3">
              {returns.map(r => (
                <div key={r.id} className="flex items-center justify-between px-4 py-3 rounded-xl border border-[#D8E4F5]">
                  <div>
                    <p className="text-sm font-bold text-[#172554]">{r.raNumber}</p>
                    <p className="text-xs text-[#64748B] font-mono mt-0.5">{r.trackingNumber}</p>
                    {r.refundAmountZAR != null && (
                      <p className="text-xs text-[#10B981] font-semibold mt-1">Refunded: {formatZAR(r.refundAmountZAR)}</p>
                    )}
                  </div>
                  <StatusBadge status={r.status} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}