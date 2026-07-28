import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm, FormProvider, useFormContext } from 'react-hook-form'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { Alert, Spinner } from '@/components/ui'
import { parcelApi, quoteApi } from '@/api'
import { useWallet } from '@/hooks/useWallet'
import {
  MapPin, Package, Calculator, CheckCircle,
  ChevronRight, ChevronLeft, Info, Shield,
  AlertTriangle, Truck, Zap, Clock, TrendingDown
} from 'lucide-react'
import { SA_PROVINCES, formatZAR } from '@/utils'
import clsx from 'clsx'

// ── Zod schemas per step ──────────────────────────────────────────────────────
const addressSchema = z.object({
  pickupAddress: z.object({
    recipientName:  z.string().min(2, 'Name required'),
    recipientPhone: z.string()
      .regex(/^(\+27|0)[6-8][0-9]{8}$/, 'Enter a valid SA mobile number'),
    recipientEmail: z.string().email('Invalid email').optional().or(z.literal('')),
    streetAddress:  z.string().min(5, 'Street address required'),
    suburb:         z.string().optional(),
    city:           z.string().min(2, 'City required'),
    province:       z.string().min(1, 'Province required'),
    postalCode:     z.string().regex(/^\d{4}$/, 'SA postal codes are 4 digits'),
    specialInstructions: z.string().max(300).optional(),
  }),
  deliveryAddress: z.object({
    recipientName:  z.string().min(2, 'Recipient name required'),
    recipientPhone: z.string()
      .regex(/^(\+27|0)[6-8][0-9]{8}$/, 'Enter a valid SA mobile number'),
    recipientEmail: z.string().email('Invalid email').optional().or(z.literal('')),
    streetAddress:  z.string().min(5, 'Street address required'),
    suburb:         z.string().optional(),
    city:           z.string().min(2, 'City required'),
    province:       z.string().min(1, 'Province required'),
    postalCode:     z.string().regex(/^\d{4}$/, 'SA postal codes are 4 digits'),
    specialInstructions: z.string().max(300).optional(),
  }),
})

const parcelSchema = z.object({
  serviceType:      z.string().min(1, 'Select a service type'),
  weightKg:         z.coerce.number({ invalid_type_error: 'Weight required' }).min(0.1, 'Min 0.1 kg').max(999, 'Max 999 kg'),
  description:      z.string().min(3, 'Describe the contents').max(500),
  declaredValueZAR: z.union([z.coerce.number().min(0), z.literal('')]).optional(),
  isFragile:        z.boolean().default(false),
  requiresSignature:z.boolean().default(false),
  insuranceRequired:z.boolean().default(false),
  dimensions: z.object({
    lengthCm: z.union([z.coerce.number().min(1).max(300), z.literal('')]).optional(),
    widthCm:  z.union([z.coerce.number().min(1).max(300), z.literal('')]).optional(),
    heightCm: z.union([z.coerce.number().min(1).max(300), z.literal('')]).optional(),
  }).optional(),
})

// ── Step metadata ─────────────────────────────────────────────────────────────
const STEPS = [
  { id: 1, label: 'Addresses',     icon: MapPin       },
  { id: 2, label: 'Parcel details',icon: Package      },
  { id: 3, label: 'Quote',         icon: Calculator   },
  { id: 4, label: 'Confirm',       icon: CheckCircle  },
]

// ── Step indicator ────────────────────────────────────────────────────────────
function StepIndicator({ currentStep }) {
  return (
    <div className="flex items-center mb-8 bg-white p-5 rounded-2xl border border-[#D8E4F5] shadow-sm">
      {STEPS.map((step, i) => {
        const Icon      = step.icon
        const isActive  = step.id === currentStep
        const isDone    = step.id < currentStep
        const isLast    = i === STEPS.length - 1

        return (
          <div key={step.id} className="flex items-center flex-1 last:flex-none">
            {/* Step node */}
            <div className="flex flex-col items-center">
              <div className={clsx(
                'w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300',
                isActive && 'bg-[#0A3D91] shadow-[0_4px_14px_rgba(10,61,145,0.25)]',
                isDone   && 'bg-[#DCEEFF]/40 border border-[#D8E4F5]',
                !isActive && !isDone && 'bg-[#F6FAFF] border border-[#D8E4F5]',
              )}>
                {isDone
                  ? <CheckCircle size={16} className="text-[#1E63E9]" />
                  : <Icon size={16} className={isActive ? 'text-white' : 'text-[#94A3B8]'} />
                }
              </div>
              <span className={clsx(
                'text-xs mt-2 font-bold whitespace-nowrap',
                isActive ? 'text-[#0A3D91]' : isDone ? 'text-[#64748B]' : 'text-[#94A3B8]'
              )}>
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {!isLast && (
              <div className={clsx(
                'flex-1 h-0.5 mx-3 mb-6 transition-colors duration-300',
                isDone ? 'bg-[#1E63E9]' : 'bg-[#D8E4F5]'
              )} />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Address form section ──────────────────────────────────────────────────────
function AddressSection({ prefix, title, icon: Icon, color }) {
  const { register, formState: { errors } } = useFormContext()
  const e = errors[prefix] ?? {}

  const Field = ({ name, label, placeholder, type = 'text', span, required }) => (
    <div className={span ? 'col-span-2' : ''}>
      <label className="label">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        className={clsx('input', e[name] && 'input-error')}
        placeholder={placeholder}
        {...register(`${prefix}.${name}`)}
      />
      {e[name] && <p className="field-error">{e[name].message}</p>}
    </div>
  )

  return (
    <div className="card">
      <div className="card-header">
        <div className="flex items-center gap-2.5">
          <div className={clsx('w-8 h-8 rounded-xl flex items-center justify-center text-white', color)}>
            <Icon size={15} />
          </div>
          <h3 className="text-sm font-bold text-[#172554]">{title}</h3>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field name="recipientName"  label="Full name"     placeholder="Zanele Nkosi"   required span />
        <Field name="recipientPhone" label="Mobile number" placeholder="+27 82 123 4567" required />
        <Field name="recipientEmail" label="Email (optional)" placeholder="zanele@email.com" type="email" />
        <Field name="streetAddress"  label="Street address" placeholder="78 Victoria Embankment" required span />

        <div className="grid grid-cols-2 gap-4 col-span-2">
          <Field name="suburb"   label="Suburb"   placeholder="Morningside" />
          <Field name="city"     label="City"     placeholder="Durban"       required />
        </div>

        <div>
          <label className="label">Province <span className="text-red-400">*</span></label>
          <select
            className={clsx('input', e.province && 'input-error')}
            {...register(`${prefix}.province`)}
          >
            <option value="">Select province…</option>
            {SA_PROVINCES.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          {e.province && <p className="field-error">{e.province.message}</p>}
        </div>

        <Field name="postalCode" label="Postal code" placeholder="4001" required />

        <div className="col-span-2">
          <label className="label">Special instructions (optional)</label>
          <textarea
            className="input h-20 resize-none"
            placeholder="e.g. Ring bell, leave with security…"
            {...register(`${prefix}.specialInstructions`)}
          />
        </div>
      </div>
    </div>
  )
}

// ── Step 1: Addresses ─────────────────────────────────────────────────────────
function Step1Addresses({ onNext }) {
  const methods = useFormContext()
  const { handleSubmit, setError, clearErrors } = methods

  const submit = handleSubmit(async (data) => {
    try {
      clearErrors(['pickupAddress', 'deliveryAddress'])
      await addressSchema.parseAsync({
        pickupAddress:   data.pickupAddress,
        deliveryAddress: data.deliveryAddress,
      })
      onNext()
    } catch (err) {
      if (err?.issues) {
        err.issues.forEach(issue => {
          setError(issue.path.join('.'), { message: issue.message })
        })
      }
    }
  }, () => {})

  return (
    <div className="space-y-5">
      <AddressSection
        prefix="pickupAddress"
        title="Pickup address"
        icon={MapPin}
        color="bg-[#0A3D91]"
      />
      <AddressSection
        prefix="deliveryAddress"
        title="Delivery address"
        icon={MapPin}
        color="bg-[#1E63E9]"
      />
      <div className="flex justify-end pt-2">
        <button type="button" onClick={submit} className="btn-primary">
          Continue <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}

// ── Service type cards ────────────────────────────────────────────────────────
const SERVICE_META = {
  Economy:  { icon: TrendingDown, label: 'Economy',  sub: '5–7 business days',  color: 'text-[#64748B]'  },
  Standard: { icon: Truck,        label: 'Standard', sub: '3–5 business days',  color: 'text-[#1E63E9]'  },
  Express:  { icon: Zap,          label: 'Express',  sub: '1–2 business days',  color: 'text-[#0A3D91]' },
  Overnight:{ icon: Clock,        label: 'Overnight',sub: 'Next business day',  color: 'text-purple-500'},
  SameDay:  { icon: Zap,          label: 'Same day', sub: 'Delivered today',    color: 'text-[#EF4444]'   },
}

// ── Step 2: Parcel details ────────────────────────────────────────────────────
function Step2ParcelDetails({ onNext, onBack }) {
  const { register, watch, setValue, handleSubmit, setError, clearErrors,
          formState: { errors: e } } = useFormContext()

  const serviceType  = watch('serviceType')
  const isFragile    = watch('isFragile')
  const needsSig     = watch('requiresSignature')
  const needsInsure  = watch('insuranceRequired')
  const [showDims, setShowDims] = useState(false)

  const submit = handleSubmit(async (data) => {
    try {
      clearErrors(['serviceType', 'weightKg', 'description', 'declaredValueZAR', 'dimensions'])
      await parcelSchema.parseAsync(data)
      onNext()
    } catch (err) {
      if (err?.issues) {
        err.issues.forEach(issue => {
          setError(issue.path.join('.'), { message: issue.message })
        })
      }
    }
  }, () => {})

  return (
    <div className="space-y-5">
      {/* Service type */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-sm font-bold text-[#172554]">Service type</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Object.entries(SERVICE_META).map(([value, meta]) => {
            const Icon    = meta.icon
            const active  = serviceType === value
            return (
              <button
                key={value}
                type="button"
                onClick={() => setValue('serviceType', value, { shouldValidate: true })}
                className={clsx(
                  'flex flex-col items-start gap-1.5 px-4 py-3.5 rounded-xl border-2 text-left',
                  'transition-all duration-300',
                  active
                    ? 'border-[#1E63E9] bg-[#DCEEFF]/40 ring-4 ring-[#1E63E9]/10'
                    : 'border-[#D8E4F5] hover:border-[#1E63E9]/50 hover:bg-[#F6FAFF]'
                )}
              >
                <Icon size={18} className={active ? 'text-[#0A3D91]' : meta.color} />
                <span className={clsx(
                  'text-sm font-bold',
                  active ? 'text-[#0A3D91]' : 'text-[#172554]'
                )}>
                  {meta.label}
                </span>
                <span className="text-xs text-[#64748B] font-medium">{meta.sub}</span>
              </button>
            )
          })}
        </div>
        {e.serviceType && <p className="field-error mt-2">{e.serviceType.message}</p>}
      </div>

      {/* Weight and value */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-sm font-bold text-[#172554]">Parcel details</h3>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Weight (kg) <span className="text-red-400">*</span></label>
            <div className="relative">
              <input
                type="number"
                step="0.1"
                min="0.1"
                className={clsx('input pr-10 font-mono', e.weightKg && 'input-error')}
                placeholder="2.5"
                {...register('weightKg')}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#94A3B8]">kg</span>
            </div>
            {e.weightKg && <p className="field-error">{e.weightKg.message}</p>}
          </div>

          <div>
            <label className="label">Declared value (optional)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-[#94A3B8]">R</span>
              <input
                type="number"
                step="0.01"
                className="input pl-8 font-mono"
                placeholder="1 500.00"
                {...register('declaredValueZAR')}
              />
            </div>
          </div>

          <div className="col-span-2">
            <label className="label">
              Contents description <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              className={clsx('input', e.description && 'input-error')}
              placeholder="e.g. Electronic components, clothing, documents…"
              {...register('description')}
            />
            {e.description && <p className="field-error">{e.description.message}</p>}
          </div>
        </div>

        {/* Dimensions toggle */}
        <div className="mt-5">
          <button
            type="button"
            onClick={() => setShowDims(v => !v)}
            className="text-xs text-[#0A3D91] hover:text-[#1E63E9] font-bold flex items-center gap-1.5 transition-colors"
          >
            <Package size={14} />
            {showDims ? 'Hide dimensions' : 'Add dimensions (optional — improves quote accuracy)'}
          </button>

          {showDims && (
            <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-[#D8E4F5] animate-in fade-in duration-300">
              {['lengthCm', 'widthCm', 'heightCm'].map(dim => {
                const label = dim.replace('Cm', '').replace('length', 'Length').replace('width', 'Width').replace('height', 'Height')
                return (
                  <div key={dim}>
                    <label className="label">{label} (cm)</label>
                    <input
                      type="number"
                      min="1"
                      className="input font-mono"
                      placeholder="—"
                      {...register(`dimensions.${dim}`)}
                    />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Options */}
      <div className="card">
        <div className="card-header">
          <h3 className="text-sm font-bold text-[#172554]">Options</h3>
        </div>
        <div className="space-y-3">
          {[
            {
              field: 'isFragile',
              icon: AlertTriangle,
              color: 'text-[#F59E0B]',
              label: 'Fragile contents',
              sub: 'Handle with extra care — marked on the parcel',
              value: isFragile,
            },
            {
              field: 'requiresSignature',
              icon: CheckCircle,
              color: 'text-[#1E63E9]',
              label: 'Signature on delivery',
              sub: 'Recipient must sign before parcel is handed over',
              value: needsSig,
            },
            {
              field: 'insuranceRequired',
              icon: Shield,
              color: 'text-[#10B981]',
              label: 'Parcel insurance',
              sub: 'Added to your quote based on declared value',
              value: needsInsure,
            },
          ].map(({ field, icon: Icon, color, label, sub, value }) => (
            <label
              key={field}
              className={clsx(
                'flex items-start gap-4.5 px-4 py-3.5 rounded-xl border-2 cursor-pointer',
                'transition-all duration-300',
                value
                  ? 'border-[#1E63E9]/30 bg-[#DCEEFF]/30'
                  : 'border-[#D8E4F5] hover:border-[#1E63E9]/40'
              )}
            >
              <input
                type="checkbox"
                className="mt-0.5 w-4 h-4 rounded text-[#0A3D91] border-[#D8E4F5] focus:ring-[#1E63E9]/20"
                {...register(field)}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <Icon size={14} className={value ? 'text-[#0A3D91]' : color} />
                  <span className="text-sm font-semibold text-[#172554]">{label}</span>
                </div>
                <p className="text-xs text-[#64748B] font-medium mt-1 leading-relaxed">{sub}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="flex justify-between pt-2">
        <button type="button" onClick={onBack} className="btn-secondary">
          <ChevronLeft size={16} /> Back
        </button>
        <button type="button" onClick={submit} className="btn-primary">
          Get quote <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}

// ── Step 3: Quote ─────────────────────────────────────────────────────────────
function Step3Quote({ onNext, onBack }) {
  const { watch } = useFormContext()
  const formData  = watch()

  const [quote,         setQuote]         = useState(null)
  const [quoteError,    setQuoteError]    = useState('')
  const [payFromWallet, setPayFromWallet] = useState(false)

  const { balance: walletBalance, isLoading: walletLoading } = useWallet()

  const quoteMutation = useMutation({
    mutationFn: (dto) => quoteApi.calculate(dto),
    onSuccess: (res) => setQuote(res.data),
    onError:   (err) => setQuoteError(err.message),
  })

  const fetchQuote = () => {
    setQuoteError('')
    quoteMutation.mutate({
      originProvince:      formData.pickupAddress?.province,
      destinationProvince: formData.deliveryAddress?.province,
      weightKg:            Number(formData.weightKg),
      serviceType:         formData.serviceType,
      declaredValueZAR:    formData.declaredValueZAR
                             ? Number(formData.declaredValueZAR) : null,
      insuranceRequired:   formData.insuranceRequired ?? false,
      dimensions:          formData.dimensions?.lengthCm
                             ? {
                                 lengthCm: Number(formData.dimensions.lengthCm),
                                 widthCm:  Number(formData.dimensions.widthCm),
                                 heightCm: Number(formData.dimensions.heightCm),
                               }
                             : null,
    })
  }

  const canPayWallet = walletBalance >= (quote?.totalAmountZAR ?? 0)

  return (
    <div className="space-y-5">
      {/* Quote fetch card */}
      {!quote && (
        <div className="card text-center py-12">
          <div className="w-16 h-16 bg-[#DCEEFF]/50 rounded-full flex items-center justify-center mx-auto mb-5 text-[#0A3D91]">
            <Calculator size={28} />
          </div>
          <h3 className="text-lg font-bold text-[#172554] mb-1">Ready to calculate</h3>
          <p className="text-sm text-[#64748B] mb-6 max-w-xs mx-auto leading-relaxed">
            Your quote is calculated based on weight, dimensions, service type, and route.
          </p>
          {quoteError && <Alert type="error" message={quoteError} className="mb-5 text-left" />}
          <button
            type="button"
            onClick={fetchQuote}
            disabled={quoteMutation.isPending}
            className="btn-primary px-8"
          >
            {quoteMutation.isPending
              ? <><Spinner size="sm" className="text-white" /> Calculating…</>
              : <><Calculator size={16} /> Calculate quote</>}
          </button>
        </div>
      )}

      {/* Quote result */}
      {quote && (
        <>
          <div className="card">
            <div className="card-header">
              <div>
                <h3 className="text-sm font-bold text-[#172554]">Your quote</h3>
                <p className="text-xs text-[#64748B] font-medium mt-1">
                  Valid for 30 minutes · {formData.serviceType}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setQuote(null); setQuoteError('') }}
                className="text-xs text-[#0A3D91] hover:text-[#1E63E9] font-bold transition-colors"
              >
                Recalculate
              </button>
            </div>

            {/* Route summary */}
            <div className="flex items-center gap-4 mb-6 px-4 py-3.5 bg-[#F6FAFF] border border-[#D8E4F5] rounded-xl">
              <div className="text-center">
                <p className="text-[10px] text-[#64748B] font-bold uppercase tracking-wider mb-0.5">From</p>
                <p className="text-sm font-bold text-[#172554]">
                  {SA_PROVINCES.find(p => p.value === formData.pickupAddress?.province)?.label}
                </p>
              </div>
              <div className="flex-1 flex items-center gap-1 justify-center text-[#94A3B8]">
                <div className="h-[2px] flex-1 bg-[#D8E4F5]" />
                <Truck size={16} className="text-[#1E63E9]" />
                <div className="h-[2px] flex-1 bg-[#D8E4F5]" />
              </div>
              <div className="text-center">
                <p className="text-[10px] text-[#64748B] font-bold uppercase tracking-wider mb-0.5">To</p>
                <p className="text-sm font-bold text-[#172554]">
                  {SA_PROVINCES.find(p => p.value === formData.deliveryAddress?.province)?.label}
                </p>
              </div>
            </div>

            {/* Line items */}
            <div className="space-y-3 mb-4">
              {[
                { label: 'Base rate',      value: quote.baseAmountZAR      },
                { label: 'Weight/size surcharge', value: quote.surchargeZAR, hide: !quote.surchargeZAR },
                { label: 'Insurance premium', value: quote.insurancePremiumZAR, hide: !quote.insurancePremiumZAR },
              ].filter(r => !r.hide).map(row => (
                <div key={row.label} className="flex justify-between text-sm font-medium">
                  <span className="text-[#64748B]">{row.label}</span>
                  <span className="font-semibold text-[#172554] font-mono">{formatZAR(row.value)}</span>
                </div>
              ))}

              <div className="flex justify-between text-sm font-semibold border-t border-dashed border-[#D8E4F5] pt-3">
                <span className="text-[#64748B]">Subtotal</span>
                <span className="font-bold text-[#172554] font-mono">{formatZAR(quote.baseAmountZAR + (quote.surchargeZAR ?? 0) + (quote.insurancePremiumZAR ?? 0))}</span>
              </div>

              <div className="flex justify-between text-sm font-semibold">
                <span className="text-[#64748B]">VAT (15%)</span>
                <span className="font-bold text-[#172554] font-mono">{formatZAR(quote.vatAmountZAR)}</span>
              </div>

              <div className="flex justify-between text-base font-bold border-t border-[#D8E4F5] pt-4 mt-2">
                <span className="text-[#172554]">Total</span>
                <span className="text-[#0A3D91] font-extrabold font-mono">{formatZAR(quote.totalAmountZAR)}</span>
              </div>
            </div>

            {/* Est. delivery */}
            {quote.estimatedDeliveryDays && (
              <div className="flex items-center gap-2 text-xs font-semibold text-[#1E63E9] mt-4 px-4 py-3 bg-[#DCEEFF]/40 rounded-xl border border-[#D8E4F5]">
                <Clock size={13} className="text-[#1E63E9]" />
                Estimated delivery: <span className="font-bold">{quote.estimatedDeliveryDays} business day{quote.estimatedDeliveryDays > 1 ? 's' : ''}</span>
              </div>
            )}
          </div>

          {/* Payment method */}
          <div className="card">
            <div className="card-header">
              <h3 className="text-sm font-bold text-[#172554]">Payment</h3>
            </div>
            <div className="space-y-3">
              <label className={clsx(
                'flex items-center gap-4.5 px-4 py-4 rounded-xl border-2 cursor-pointer',
                'transition-all duration-300',
                !payFromWallet
                  ? 'border-[#1E63E9]/30 bg-[#DCEEFF]/30'
                  : 'border-[#D8E4F5] hover:border-[#1E63E9]/40'
              )}>
                <input
                  type="radio"
                  name="payMethod"
                  className="accent-[#0A3D91]"
                  checked={!payFromWallet}
                  onChange={() => setPayFromWallet(false)}
                />
                <div>
                  <p className="text-sm font-bold text-[#172554]">Pay on collection</p>
                  <p className="text-xs text-[#64748B] font-medium mt-1">Pay via EFT or cash when parcel is collected</p>
                </div>
              </label>

              <label className={clsx(
                'flex items-center gap-4.5 px-4 py-4 rounded-xl border-2 cursor-pointer',
                'transition-all duration-300',
                canPayWallet
                  ? payFromWallet
                    ? 'border-[#1E63E9]/30 bg-[#DCEEFF]/30'
                    : 'border-[#D8E4F5] hover:border-[#1E63E9]/40'
                  : 'border-[#D8E4F5] bg-[#F6FAFF] opacity-60 cursor-not-allowed'
              )}>
                <input
                  type="radio"
                  name="payMethod"
                  className="accent-[#0A3D91]"
                  checked={payFromWallet}
                  disabled={!canPayWallet}
                  onChange={() => setPayFromWallet(true)}
                />
                <div className="flex-1">
                  <p className="text-sm font-bold text-[#172554]">Pay from wallet</p>
                  <p className="text-xs text-[#64748B] font-semibold mt-1">
                    Balance:{' '}
                    {walletLoading
                      ? <span className="text-[#94A3B8]">Loading…</span>
                      : <span className={clsx('font-bold font-mono', canPayWallet ? 'text-[#10B981]' : 'text-[#EF4444]')}>
                          {formatZAR(walletBalance)}
                        </span>
                    }
                    {!walletLoading && !canPayWallet && ' — insufficient funds'}
                  </p>
                </div>
              </label>
            </div>
          </div>
        </>
      )}

      <div className="flex justify-between pt-2">
        <button type="button" onClick={onBack} className="btn-secondary">
          <ChevronLeft size={16} /> Back
        </button>
        <button
          type="button"
          onClick={() => onNext({ quote, payFromWallet })}
          disabled={!quote}
          className="btn-primary"
        >
          Review booking <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}

// ── Step 4: Confirm ───────────────────────────────────────────────────────────
function Step4Confirm({ onBack, onSubmit, quoteData, isSubmitting, error }) {
  const { watch } = useFormContext()
  const data = watch()

  const Section = ({ title, children }) => (
    <div>
      <h4 className="text-xs font-bold text-[#0A3D91] uppercase tracking-wider mb-2.5">{title}</h4>
      <div className="bg-[#F6FAFF] border border-[#D8E4F5] rounded-xl px-4 py-3 text-sm text-[#334155] space-y-2">
        {children}
      </div>
    </div>
  )

  const Row = ({ label, value }) => value ? (
    <div className="flex justify-between gap-4 font-medium">
      <span className="text-[#64748B] flex-shrink-0">{label}</span>
      <span className="font-semibold text-right text-[#172554]">{value}</span>
    </div>
  ) : null

  return (
    <div className="space-y-5">
      <div className="card space-y-6">
        <Section title="Pickup">
          <Row label="Name"    value={data.pickupAddress?.recipientName} />
          <Row label="Address" value={`${data.pickupAddress?.streetAddress}, ${data.pickupAddress?.suburb ? data.pickupAddress.suburb + ', ' : ''}${data.pickupAddress?.city}`} />
          <Row label="Province"value={SA_PROVINCES.find(p => p.value === data.pickupAddress?.province)?.label} />
          <Row label="Phone"   value={data.pickupAddress?.recipientPhone} />
        </Section>

        <Section title="Delivery">
          <Row label="Name"    value={data.deliveryAddress?.recipientName} />
          <Row label="Address" value={`${data.deliveryAddress?.streetAddress}, ${data.deliveryAddress?.suburb ? data.deliveryAddress.suburb + ', ' : ''}${data.deliveryAddress?.city}`} />
          <Row label="Province"value={SA_PROVINCES.find(p => p.value === data.deliveryAddress?.province)?.label} />
          <Row label="Phone"   value={data.deliveryAddress?.recipientPhone} />
        </Section>

        <Section title="Parcel">
          <Row label="Service"     value={data.serviceType} />
          <Row label="Weight"      value={`${data.weightKg} kg`} />
          <Row label="Contents"    value={data.description} />
          <Row label="Declared value" value={data.declaredValueZAR ? formatZAR(data.declaredValueZAR) : null} />
          {data.isFragile        && <p className="text-[#F59E0B] text-xs font-bold">⚠ Fragile contents</p>}
          {data.requiresSignature && <p className="text-[#1E63E9] text-xs font-bold">✓ Signature required</p>}
          {data.insuranceRequired && <p className="text-[#10B981] text-xs font-bold">🛡 Insurance included</p>}
        </Section>

        {quoteData?.quote && (
          <Section title="Payment">
            <Row label="Total"  value={formatZAR(quoteData.quote.totalAmountZAR)} />
            <Row label="Method" value={quoteData.payFromWallet ? 'Wallet debit' : 'Pay on collection'} />
          </Section>
        )}
      </div>

      {/* Legal note */}
      <div className="flex gap-2.5 px-4 py-3 bg-[#F59E0B]/10 rounded-xl border border-[#F59E0B]/20 text-xs text-[#F59E0B] font-medium leading-relaxed">
        <Info size={14} className="flex-shrink-0 mt-0.5" />
        By confirming you agree to the CourierSA terms of service. Fragile and high-value items
        must comply with our packaging guidelines to qualify for insurance claims.
      </div>

      {error && <Alert type="error" message={error} />}

      <div className="flex justify-between pt-2">
        <button type="button" onClick={onBack} className="btn-secondary" disabled={isSubmitting}>
          <ChevronLeft size={16} /> Back
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={isSubmitting}
          className="btn-primary px-8"
        >
          {isSubmitting
            ? <><Spinner size="sm" className="text-white" /> Booking…</>
            : <><CheckCircle size={16} /> Confirm booking</>}
        </button>
      </div>
    </div>
  )
}

// ── Success screen ────────────────────────────────────────────────────────────
function BookingSuccess({ result, onBookAnother }) {
  const navigate = useNavigate()
  return (
    <div className="max-w-md mx-auto text-center py-8">
      <div className="w-16 h-16 bg-[#10B981]/10 rounded-full flex items-center justify-center mx-auto mb-5">
        <CheckCircle size={32} className="text-[#10B981]" />
      </div>
      <h2 className="text-2xl font-bold text-[#172554] mb-2 tracking-tight">Booking confirmed!</h2>
      <p className="text-[#64748B] mb-6 text-sm leading-relaxed">
        Your parcel has been booked and is awaiting dispatcher approval.
      </p>

      <div className="bg-[#F6FAFF] border border-[#D8E4F5] rounded-xl px-6 py-4 mb-8 inline-block shadow-sm">
        <p className="text-xs font-bold text-[#64748B] uppercase tracking-wider mb-1.5">Tracking number</p>
        <p className="font-mono text-xl font-bold text-[#172554]">{result?.trackingNumber}</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <button
          className="btn-secondary"
          onClick={() => navigate(`/customer/track?q=${result?.trackingNumber}`)}
        >
          Track this parcel
        </button>
        <button className="btn-primary" onClick={onBookAnother}>
          <Package size={15} /> Book another
        </button>
      </div>
    </div>
  )
}

// ── Main BookParcel page ──────────────────────────────────────────────────────
export default function BookParcelPage() {
  const [step,      setStep]      = useState(1)
  const [quoteData, setQuoteData] = useState(null)
  const [success,   setSuccess]   = useState(null)
  const [bookError, setBookError] = useState('')

  const queryClient = useQueryClient()
  const methods = useForm({
    defaultValues: {
      pickupAddress:    { country: 'South Africa' },
      deliveryAddress:  { country: 'South Africa' },
      serviceType:      '',
      weightKg:         '',
      description:      '',
      declaredValueZAR: '',
      isFragile:        false,
      requiresSignature:false,
      insuranceRequired:false,
      dimensions:       {},
    },
  })

 const bookMutation = useMutation({
  mutationFn: (dto) => parcelApi.book(dto),
  onSuccess: (res) => {
    setSuccess(res.data)
    queryClient.invalidateQueries({ queryKey: ['wallet-balance'] })
    queryClient.invalidateQueries({ queryKey: ['wallet-transactions'] })
  },
  onError: (err) => setBookError(err.message),
})

  const handleNext = useCallback((extraData) => {
    if (step === 3) setQuoteData(extraData)
    setStep(s => s + 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [step])

  const handleBack = useCallback(() => {
    setStep(s => s - 1)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const handleSubmit = () => {
    setBookError('')
    const data = methods.getValues()
    bookMutation.mutate({
      pickupAddress:    data.pickupAddress,
      deliveryAddress:  data.deliveryAddress,
      serviceType:      data.serviceType,
      weightKg:         Number(data.weightKg),
      description:      data.description,
      declaredValueZAR: data.declaredValueZAR ? Number(data.declaredValueZAR) : null,
      isFragile:        data.isFragile,
      requiresSignature:data.requiresSignature,
      insuranceRequired:data.insuranceRequired,
      dimensions:       data.dimensions?.lengthCm
                          ? {
                              lengthCm: Number(data.dimensions.lengthCm),
                              widthCm:  Number(data.dimensions.widthCm),
                              heightCm: Number(data.dimensions.heightCm),
                            }
                          : null,
      quoteId:          quoteData?.quote?.id ?? null,
      payFromWallet:    quoteData?.payFromWallet ?? false,
    })
  }

  const resetForm = () => {
    methods.reset()
    setStep(1)
    setQuoteData(null)
    setSuccess(null)
    setBookError('')
  }

  return (
    <AppShell title="Book a Parcel">
      <div className="max-w-2xl mx-auto">
        <div className="page-header">
          <div>
            <h1 className="page-title">Book a parcel</h1>
            <p className="page-subtitle">Fill in the details below to get a quote and confirm your booking</p>
          </div>
        </div>

        {success ? (
          <BookingSuccess result={success} onBookAnother={resetForm} />
        ) : (
          <FormProvider {...methods}>
            <StepIndicator currentStep={step} />

            {step === 1 && <Step1Addresses onNext={handleNext} />}
            {step === 2 && <Step2ParcelDetails onNext={handleNext} onBack={handleBack} />}
            {step === 3 && <Step3Quote onNext={handleNext} onBack={handleBack} />}
            {step === 4 && (
              <Step4Confirm
                onBack={handleBack}
                onSubmit={handleSubmit}
                quoteData={quoteData}
                isSubmitting={bookMutation.isPending}
                error={bookError}
              />
            )}
          </FormProvider>
        )}
      </div>
    </AppShell>
  )
}