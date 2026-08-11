import { useState, useEffect } from 'react'
import { useForm, FormProvider, useFormContext } from 'react-hook-form'
import { z } from 'zod'
import CardPaymentForm from '@/components/payment/CardPaymentForm'
import { useMutation } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { Alert } from '@/components/ui'
import { parcelApi, quoteApi } from '@/api'
import { useWallet } from '@/hooks/useWallet'
import { ParcelCartProvider, useParcelCart } from '@/context/ParcelCartContext'
import CartSummaryPanel from './CartSummaryPanel'
import {
  MapPin, Package, Calculator, CheckCircle,
  ChevronRight, ChevronLeft, Shield,
  AlertTriangle, Truck, Zap, Clock, TrendingDown,
  Calendar, Flame, Wallet, PlusCircle, ShoppingCart, RefreshCw,
  CheckCircle2, ArrowRight, RotateCcw
} from 'lucide-react'
import { SA_PROVINCES, formatZAR } from '@/utils'
import clsx from 'clsx'

// ── Zod schemas per step ──────────────────────────────────────────────────────
const addressSchema = z.object({
  pickupAddress: z.object({
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
  deliveryAddress: z.object({
    recipientName:  z.string().min(2, 'Recipient name required'),
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

const DEFAULT_COUNTRY = 'South Africa'

const SA_PROVINCE_ENUM_NAMES = [
  'Gauteng', 'WesternCape', 'EasternCape', 'KwaZuluNatal',
  'Limpopo', 'Mpumalanga', 'NorthWest', 'NorthernCape', 'FreeState',
]

function toProvinceEnum(value) {
  if (!value) return value
  const normalized = value.replace(/[\s-]/g, '').toLowerCase()
  const match = SA_PROVINCE_ENUM_NAMES.find(name => name.toLowerCase() === normalized)
  if (!match) {
    console.warn(`Unrecognised province value "${value}" — check it matches a SaProvince enum member.`)
  }
  return match || value
}

function toAddressDto(addr) {
  return {
    recipientName:  addr?.recipientName,
    recipientPhone: addr?.recipientPhone,
    recipientEmail: addr?.recipientEmail || null,
    streetAddress:  addr?.streetAddress,
    suburb:         addr?.suburb || null,
    city:           addr?.city,
    province:       toProvinceEnum(addr?.province),
    postalCode:     addr?.postalCode,
    country:        DEFAULT_COUNTRY,
    specialInstructions: addr?.specialInstructions?.trim() || null,
  }
}

const parcelSchema = z.object({
  serviceType:         z.string().min(1, 'Select a service type'),
  weightKg:            z.coerce.number({ invalid_type_error: 'Weight required' }).min(0.1, 'Min 0.1 kg').max(999, 'Max 999 kg'),
  description:         z.string().min(3, 'Describe the contents').max(500),
  declaredValueZAR:    z.union([z.coerce.number().min(0), z.literal('')]).optional(),
  isFragile:           z.boolean().default(false),
  requiresSignature:   z.boolean().default(false),
  insuranceRequired:   z.boolean().default(false),
  isEmergency:          z.boolean().default(false),
  scheduledPickupDate: z.string().optional(),
  specialInstructions: z.string().max(300).optional(),
})

// ── Step metadata ─────────────────────────────────────────────────────────────
const STEPS = [
  { id: 1, label: 'Addresses',      icon: MapPin      },
  { id: 2, label: 'Parcel details', icon: Package     },
  { id: 3, label: 'Quote',          icon: Calculator  },
  { id: 4, label: 'Confirm',        icon: CheckCircle },
]

function StepIndicator({ currentStep }) {
  return (
    <div className="flex items-center mb-8 bg-white p-5 rounded-2xl border border-[#D8E4F5] shadow-sm">
      {STEPS.map((step, i) => {
        const Icon = step.icon; const isActive = step.id === currentStep; const isDone = step.id < currentStep; const isLast = i === STEPS.length - 1
        return (
          <div key={step.id} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-300', isActive && 'bg-[#0A3D91] shadow-md', isDone && 'bg-[#DCEEFF]/40 border border-[#D8E4F5]', !isActive && !isDone && 'bg-[#F6FAFF] border border-[#D8E4F5]')}>
                {isDone ? <CheckCircle size={16} className="text-[#1E63E9]" /> : <Icon size={16} className={isActive ? 'text-white' : 'text-[#94A3B8]'} />}
              </div>
              <span className={clsx('text-xs mt-2 font-bold whitespace-nowrap', isActive ? 'text-[#0A3D91]' : isDone ? 'text-[#64748B]' : 'text-[#94A3B8]')}>{step.label}</span>
            </div>
            {!isLast && <div className={clsx('flex-1 h-0.5 mx-3 mb-6 transition-colors duration-300', isDone ? 'bg-[#1E63E9]' : 'bg-[#D8E4F5]')} />}
          </div>
        )
      })}
    </div>
  )
}

// ── Step 1: Addresses ─────────────────────────────────────────────────────────
function Step1Addresses({ onNext }) {
  const { register, handleSubmit, setError, clearErrors, formState: { errors } } = useFormContext()

  const Field = ({ prefix, name, label, placeholder, span, required }) => (
    <div className={span ? 'col-span-2' : ''}>
      <label className="label">{label}{required && <span className="text-red-400 ml-0.5">*</span>}</label>
      <input
        type="text"
        className={clsx('input', errors[prefix]?.[name] && 'input-error')}
        placeholder={placeholder}
        aria-invalid={!!errors[prefix]?.[name]}
        {...register(`${prefix}.${name}`)}
      />
      {errors[prefix]?.[name] && <p className="field-error">{errors[prefix][name].message}</p>}
    </div>
  )

  const submit = handleSubmit(async (data) => {
    try {
      clearErrors(['pickupAddress', 'deliveryAddress'])
      await addressSchema.parseAsync({ pickupAddress: data.pickupAddress, deliveryAddress: data.deliveryAddress })
      onNext()
    } catch (err) { err?.issues?.forEach(issue => setError(issue.path.join('.'), { message: issue.message })) }
  }, () => {})

  return (
    <div className="space-y-5">
      {['pickupAddress', 'deliveryAddress'].map((prefix, i) => (
        <div key={prefix} className="card">
          <div className="card-header">
            <div className="flex items-center gap-2.5">
              <div className={clsx('w-8 h-8 rounded-xl flex items-center justify-center text-white', i === 0 ? 'bg-[#0A3D91]' : 'bg-[#1E63E9]')}><MapPin size={15} /></div>
              <h3 className="text-sm font-bold text-[#172554]">{i === 0 ? 'Pickup address' : 'Delivery address'}</h3>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field prefix={prefix} name="recipientName" label="Full name" placeholder="Zanele Nkosi" required span />
            <Field prefix={prefix} name="recipientPhone" label="Mobile number" placeholder="+27 82 123 4567" required />
            <Field prefix={prefix} name="recipientEmail" label="Email (optional)" placeholder="zanele@email.com" />
            <Field prefix={prefix} name="streetAddress" label="Street address" placeholder="78 Victoria Embankment" required span />
            <Field prefix={prefix} name="suburb" label="Suburb" placeholder="Morningside" />
            <Field prefix={prefix} name="city" label="City" placeholder="Durban" required />
            <div>
              <label className="label">Province <span className="text-red-400">*</span></label>
              <select className={clsx('input', errors[prefix]?.province && 'input-error')} {...register(`${prefix}.province`)}>
                <option value="">Select province…</option>
                {SA_PROVINCES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
              {errors[prefix]?.province && <p className="field-error">{errors[prefix].province.message}</p>}
            </div>
            <Field prefix={prefix} name="postalCode" label="Postal code" placeholder="4001" required />
            <Field
              prefix={prefix} name="specialInstructions" span
              label={i === 0 ? 'Pickup location notes (optional)' : 'Delivery location notes (optional)'}
              placeholder="e.g. Gate code 4521, blue security gate, unit 12B"
            />
          </div>
        </div>
      ))}
      <div className="flex justify-end pt-2">
        <button type="button" onClick={submit} className="btn-primary">Continue <ChevronRight size={16} /></button>
      </div>
    </div>
  )
}

// ── Step 2: Parcel details ─────────────────────────────────────────────────────
const SERVICE_META = {
  Economy:   { icon: TrendingDown, label: 'Economy',   sub: '5–7 business days', color: 'text-[#64748B]'  },
  Standard:  { icon: Truck,        label: 'Standard',  sub: '3–5 business days', color: 'text-[#1E63E9]'  },
  Express:   { icon: Zap,          label: 'Express',   sub: '1–2 business days', color: 'text-[#0A3D91]'  },
  Overnight: { icon: Clock,        label: 'Overnight', sub: 'Next business day', color: 'text-purple-500' },
  SameDay:   { icon: Zap,          label: 'Same day',  sub: 'Delivered today',   color: 'text-[#EF4444]'  },
}

function Step2ParcelDetails({ onNext, onBack, nextButtonLabel = 'Get quote' }) {
  const { register, watch, setValue, handleSubmit, setError, clearErrors, formState: { errors: e } } = useFormContext()

  const serviceType = watch('serviceType')
  const isFragile   = watch('isFragile')
  const isEmergency = watch('isEmergency')
  const declaredVal = Number(watch('declaredValueZAR')) || 0

  // FIX: Get local YYYY-MM-DD date for min date setting
  const todayLocal = new Date().toLocaleDateString('en-CA')

  const isHighRisk = isFragile || declaredVal >= 2000
  useEffect(() => {
    if (isHighRisk) setValue('insuranceRequired', true, { shouldValidate: true })
  }, [isHighRisk, setValue])

  useEffect(() => {
    if (isEmergency) setValue('serviceType', 'SameDay', { shouldValidate: true })
  }, [isEmergency, setValue])

  const submit = handleSubmit(async (data) => {
    try {
      clearErrors(['serviceType', 'weightKg', 'description', 'declaredValueZAR'])
      await parcelSchema.parseAsync(data)
      onNext()
    } catch (err) { err?.issues?.forEach(issue => setError(issue.path.join('.'), { message: issue.message })) }
  }, () => {})

  return (
    <div className="space-y-5">
      {isHighRisk && (
        <div className="flex gap-3 px-4 py-3 bg-[#10B981]/10 border border-[#10B981]/20 rounded-xl text-[#047857]">
          <Shield size={20} className="mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <strong>Automatic risk assessment</strong>
            <p className="mt-0.5 opacity-90">Because this item is fragile or high-value (≥ R2,000), insurance cover has been applied automatically.</p>
          </div>
        </div>
      )}

      {isEmergency && (
        <div className="flex gap-3 px-4 py-3 bg-[#EF4444]/10 border border-[#EF4444]/20 rounded-xl text-[#B91C1C]">
          <Flame size={20} className="mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <strong>Emergency escalation active</strong>
            <p className="mt-0.5 opacity-90">Dispatchers will prioritise this parcel. Service type is locked to <b>Same Day</b>.</p>
          </div>
        </div>
      )}

      <div className="card">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Weight (kg) <span className="text-red-400">*</span></label>
            <input type="number" step="0.1" className={clsx('input font-mono', e.weightKg && 'input-error')} placeholder="2.5" {...register('weightKg')} />
            {e.weightKg && <p className="field-error">{e.weightKg.message}</p>}
          </div>
          <div>
            <label className="label">Declared value (ZAR)</label>
            <input type="number" step="0.01" className="input font-mono" placeholder="1 500.00" {...register('declaredValueZAR')} />
          </div>
          <div className="col-span-2">
            <label className="label">Contents description <span className="text-red-400">*</span></label>
            <input type="text" className={clsx('input', e.description && 'input-error')} placeholder="e.g. Electronic components…" {...register('description')} />
            {e.description && <p className="field-error">{e.description.message}</p>}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3 className="text-sm font-bold text-[#172554]">Logistics</h3></div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label flex items-center gap-1.5"><Calendar size={14} /> Schedule collection</label>
            <input type="date" className="input" {...register('scheduledPickupDate')} min={todayLocal} disabled={isEmergency} />
            <p className="text-xs text-[#94A3B8] mt-1.5">{isEmergency ? 'Not available for emergency escalations — collection is immediate.' : 'Leave blank for ASAP collection'}</p>
          </div>
          <div>
            <label className="label">Driver special instructions</label>
            <input type="text" className="input" placeholder="e.g. Gate code 1234" {...register('specialInstructions')} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h3 className="text-sm font-bold text-[#172554]">Service type</h3></div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Object.entries(SERVICE_META).map(([value, meta]) => (
            <button
              key={value} type="button" disabled={isEmergency}
              onClick={() => setValue('serviceType', value, { shouldValidate: true })}
              className={clsx('flex flex-col items-start gap-1.5 px-4 py-3.5 rounded-xl border-2 text-left transition-all duration-300',
                serviceType === value ? 'border-[#1E63E9] bg-[#DCEEFF]/40 ring-4 ring-[#1E63E9]/10' : 'border-[#D8E4F5] hover:border-[#1E63E9]/50 hover:bg-[#F6FAFF]',
                isEmergency && serviceType !== value && 'opacity-40 cursor-not-allowed'
              )}>
              <meta.icon size={18} className={serviceType === value ? 'text-[#0A3D91]' : meta.color} />
              <span className={clsx('text-sm font-bold', serviceType === value ? 'text-[#0A3D91]' : 'text-[#172554]')}>{meta.label}</span>
              <span className="text-xs text-[#64748B] font-medium">{meta.sub}</span>
            </button>
          ))}
        </div>
        {e.serviceType && <p className="field-error mt-2">{e.serviceType.message}</p>}
      </div>

      <div className="card">
        <div className="card-header"><h3 className="text-sm font-bold text-[#172554]">Options</h3></div>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            { field: 'isFragile',         icon: AlertTriangle, color: 'text-[#F59E0B]', label: 'Fragile contents',    sub: 'Handle with extra care' },
            { field: 'requiresSignature', icon: CheckCircle,   color: 'text-[#1E63E9]', label: 'Signature required',  sub: 'Sign on delivery' },
            { field: 'insuranceRequired', icon: Shield,        color: 'text-[#10B981]', label: 'Parcel insurance',    sub: 'Protect your items', disabled: isHighRisk },
            { field: 'isEmergency',        icon: Flame,         color: 'text-[#EF4444]', label: 'Emergency escalation', sub: 'Top priority dispatch' },
          ].map(({ field, icon: Icon, color, label, sub, disabled }) => {
            const value = watch(field)
            return (
              <label key={field} className={clsx('flex items-center gap-3 px-4 py-3 rounded-xl border-2 cursor-pointer transition-all duration-300', value ? 'border-[#1E63E9]/30 bg-[#DCEEFF]/30' : 'border-[#D8E4F5]', disabled && 'opacity-60 cursor-not-allowed')}>
                <input type="checkbox" disabled={disabled} className="w-4 h-4 rounded text-[#0A3D91] border-[#D8E4F5]" {...register(field)} />
                <div>
                  <div className="flex items-center gap-1.5"><Icon size={14} className={value ? 'text-[#0A3D91]' : color} /><span className="text-sm font-semibold text-[#172554]">{label}</span></div>
                  <p className="text-[11px] text-[#64748B] font-medium mt-0.5">{sub}</p>
                </div>
              </label>
            )
          })}
        </div>
      </div>

      <div className="flex justify-between pt-2">
        <button type="button" onClick={onBack} className="btn-secondary"><ChevronLeft size={16} /> Back</button>
        <button type="button" onClick={submit} className="btn-primary">{nextButtonLabel} <ChevronRight size={16} /></button>
      </div>
    </div>
  )
}

// ── Payment method picker ──────────────────────────────────────────────────────
function PaymentMethodPicker({ paymentMethod, setPaymentMethod, amount, walletBalance, walletLoading }) {
  const canPayWallet = !walletLoading && walletBalance >= amount

  return (
    <div className="card">
      <h3 className="text-sm font-bold text-[#172554] mb-4">Payment</h3>
      <div className="space-y-3">
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="radio" name="paymentMethod" checked={paymentMethod === 'Card'} onChange={() => setPaymentMethod('Card')} />
          Pay by card
        </label>

        <label className={clsx('flex items-center gap-3 cursor-pointer', !canPayWallet && 'opacity-60')}>
          <input type="radio" name="paymentMethod" checked={paymentMethod === 'Wallet'} disabled={!canPayWallet} onChange={() => setPaymentMethod('Wallet')} />
          <span className="flex items-center gap-1.5"><Wallet size={14} /> Pay from wallet</span>
          <span className="text-xs text-[#64748B] ml-auto">
            {walletLoading ? 'Loading balance…' : canPayWallet ? `Balance: ${formatZAR(walletBalance)}` : `Insufficient balance (${formatZAR(walletBalance)})`}
          </span>
        </label>

        <label className="flex items-center gap-3 cursor-pointer">
          <input type="radio" name="paymentMethod" checked={paymentMethod === 'CashOnCollection'} onChange={() => setPaymentMethod('CashOnCollection')} />
          Cash on collection
        </label>
      </div>
    </div>
  )
}

// ── Step 3: Quote (single booking) ─────────────────────────────────────────────
function Step3Quote({ onNext, onBack }) {
  const { watch } = useFormContext()
  const formData = watch()
  const [quote, setQuote] = useState(null)
  const [quoteError, setQuoteError] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('CashOnCollection')
  const { balance: walletBalance, isLoading: walletLoading } = useWallet()

  const quoteMutation = useMutation({
    mutationFn: (dto) => quoteApi.calculate(dto),
    onSuccess: (res) => {
      const q = res?.data?.data ?? res?.data ?? res
      setQuote(q)
    },
    onError: (err) => setQuoteError(err?.response?.data?.message || err?.message || 'Failed to calculate quote.'),
  })

  // FIX: Send isFragile, requiresSignature, and isEmergency to quote calculation
  const fetchQuote = () => {
    setQuoteError('')
    quoteMutation.mutate({
      originProvince: toProvinceEnum(formData.pickupAddress?.province),
      destinationProvince: toProvinceEnum(formData.deliveryAddress?.province),
      weightKg: Number(formData.weightKg),
      serviceType: formData.serviceType,
      declaredValueZAR: formData.declaredValueZAR ? Number(formData.declaredValueZAR) : null,
      insuranceRequired: formData.insuranceRequired ?? false,
      isFragile: formData.isFragile ?? false,
      requiresSignature: formData.requiresSignature ?? false,
      isEmergency: formData.isEmergency ?? false,
    })
  }

  useEffect(() => {
    fetchQuote()
  }, [])

  const baseRate = quote?.baseRateZAR ?? quote?.basePriceZAR ?? quote?.baseRate ?? 0
  const insurancePremium = quote?.insuranceFeeZAR ?? quote?.insurancePremiumZAR ?? quote?.insuranceFee ?? 0
  const vat = quote?.vatAmountZAR ?? quote?.vatZAR ?? quote?.vatAmount ?? 0
  const total = quote?.totalAmountZAR ?? quote?.totalZAR ?? quote?.totalAmount ?? quote?.amountZAR ?? 0
  const deliveryDate = quote?.estimatedDeliveryDate ?? quote?.estimatedDelivery

  return (
    <div className="space-y-5">
      {quoteMutation.isPending && (
        <div className="card text-center py-12 text-[#64748B] flex flex-col items-center gap-2">
          <RefreshCw size={24} className="animate-spin text-[#0A3D91]" />
          <p className="text-sm font-medium">Calculating your quote options…</p>
        </div>
      )}

      {quoteError && (
        <div className="card text-center py-8">
          <Alert type="error" message={quoteError} className="mb-4" />
          <button type="button" onClick={fetchQuote} className="btn-primary px-8 mx-auto">
            Retry quote calculation
          </button>
        </div>
      )}

      {quote && !quoteMutation.isPending && (
        <>
          <div className="card">
            <h3 className="text-sm font-bold text-[#172554] mb-4 border-b border-[#D8E4F5] pb-3">Quote Summary</h3>
            
            {quote.breakdown && quote.breakdown.length > 0 ? (
              <div className="space-y-1 mb-2">
                {quote.breakdown.map((item, index) => (
                  <div key={index} className={clsx("flex justify-between py-2 text-sm", item.isTotal && "border-t border-[#D8E4F5] mt-2 pt-3")}>
                    <div className="flex flex-col">
                      <span className={clsx(item.isTotal ? "font-bold text-[#172554] text-base" : "text-[#64748B]")}>
                        {item.label}
                      </span>
                      {item.description && (
                        <span className="text-[11px] text-[#94A3B8] mt-0.5">{item.description}</span>
                      )}
                    </div>
                    <span className={clsx(item.isTotal ? "font-bold text-[#1E63E9] text-base" : "font-semibold text-[#172554]")}>
                      {formatZAR(item.amountZAR ?? item.amount ?? 0)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-3 mb-2 text-sm">
                <div className="flex justify-between py-1 text-[#64748B]">
                  <span>Base rate</span>
                  <span className="font-semibold text-[#172554]">{formatZAR(baseRate)}</span>
                </div>
                {insurancePremium > 0 && (
                  <div className="flex justify-between py-1 text-[#64748B]">
                    <span>Insurance premium</span>
                    <span className="font-semibold text-[#172554]">{formatZAR(insurancePremium)}</span>
                  </div>
                )}
                <div className="flex justify-between py-1 text-[#64748B]">
                  <span>VAT (15%)</span>
                  <span className="font-semibold text-[#172554]">{formatZAR(vat)}</span>
                </div>
                <div className="flex justify-between py-3 border-t border-[#D8E4F5] mt-2 text-base font-bold text-[#172554]">
                  <span>Total</span>
                  <span className="text-[#1E63E9]">{formatZAR(total)}</span>
                </div>
              </div>
            )}

            {deliveryDate && (
              <div className="mt-4 pt-3 border-t border-[#D8E4F5] flex justify-between text-sm bg-[#F6FAFF] p-3 rounded-lg">
                 <span className="text-[#64748B]">Estimated delivery</span>
                 <span className="font-bold text-[#0A3D91]">
                   {new Date(deliveryDate).toLocaleDateString('en-ZA', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                 </span>
              </div>
            )}
          </div>

          <PaymentMethodPicker
            paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod}
            amount={total} walletBalance={walletBalance} walletLoading={walletLoading}
          />

          {paymentMethod === 'Card' && (
            <div className="card">
              <CardPaymentForm amount={total} submitLabel="Continue" onSubmit={(token) => onNext({ quote, paymentMethod, cardToken: token })} />
            </div>
          )}
        </>
      )}

      <div className="flex justify-between pt-2">
        <button type="button" onClick={onBack} className="btn-secondary"><ChevronLeft size={16} /> Back</button>
        {paymentMethod !== 'Card' && (
          <button type="button" onClick={() => onNext({ quote, paymentMethod })} disabled={!quote || quoteMutation.isPending} className="btn-primary">
            Review <ChevronRight size={16} />
          </button>
        )}
      </div>
    </div>
  )
}

// ── Step 4: Confirm (single booking) ──────────────────────────────────────────
function SummaryRow({ label, value }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="flex justify-between py-1.5 text-sm">
      <span className="text-[#64748B]">{label}</span>
      <span className="font-semibold text-[#172554] text-right">{value}</span>
    </div>
  )
}

function Step4Confirm({ onBack, onSubmit, isSubmitting, error }) {
  const { watch } = useFormContext()
  const data = watch()

  return (
    <div className="space-y-5">
      <div className="card">
        <div className="card-header"><h3 className="text-sm font-bold text-[#172554]">Pickup</h3></div>
        <SummaryRow label="Contact" value={data.pickupAddress?.recipientName} />
        <SummaryRow label="Address" value={[data.pickupAddress?.streetAddress, data.pickupAddress?.suburb, data.pickupAddress?.city].filter(Boolean).join(', ')} />
        <SummaryRow label="Postal code" value={data.pickupAddress?.postalCode} />
      </div>

      <div className="card">
        <div className="card-header"><h3 className="text-sm font-bold text-[#172554]">Delivery</h3></div>
        <SummaryRow label="Contact" value={data.deliveryAddress?.recipientName} />
        <SummaryRow label="Address" value={[data.deliveryAddress?.streetAddress, data.deliveryAddress?.suburb, data.deliveryAddress?.city].filter(Boolean).join(', ')} />
        <SummaryRow label="Postal code" value={data.deliveryAddress?.postalCode} />
      </div>

      <div className="card">
        <div className="card-header"><h3 className="text-sm font-bold text-[#172554]">Parcel</h3></div>
        <SummaryRow label="Service" value={data.serviceType} />
        <SummaryRow label="Weight" value={`${data.weightKg} kg`} />
        <SummaryRow label="Description" value={data.description} />
        <SummaryRow label="Fragile" value={data.isFragile ? 'Yes' : null} />
        <SummaryRow label="Signature required" value={data.requiresSignature ? 'Yes' : null} />
        <SummaryRow label="Insurance" value={data.insuranceRequired ? 'Included' : null} />
        <SummaryRow label="Emergency escalation" value={data.isEmergency ? 'Yes — Same Day priority' : null} />
        <SummaryRow label="Scheduled collection" value={data.scheduledPickupDate || null} />
        <SummaryRow label="Instructions" value={data.specialInstructions} />
      </div>

      {error && <Alert type="error" message={error} />}

      <div className="flex justify-between pt-2">
        <button type="button" onClick={onBack} className="btn-secondary" disabled={isSubmitting}><ChevronLeft size={16} /> Back</button>
        <button type="button" onClick={onSubmit} disabled={isSubmitting} className="btn-primary px-8">
          {isSubmitting ? 'Booking…' : 'Confirm booking'}
        </button>
      </div>
    </div>
  )
}

// ── Single-parcel booking flow ─────────────────────────────────────────────────
function SingleParcelFlow() {
  const [step, setStep] = useState(1)
  const [quoteData, setQuoteData] = useState(null)
  const [success, setSuccess] = useState(null)
  const [bookError, setBookError] = useState('')

  const methods = useForm({ defaultValues: { isFragile: false, isEmergency: false, insuranceRequired: false } })

  // FIX: Auto scroll to top when changing steps
  const changeStep = (nextStep) => {
    setStep(nextStep)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  
  const bookMutation = useMutation({ 
    mutationFn: (dto) => parcelApi.book(dto), 
    onSuccess: (res) => setSuccess(res.data?.data ?? res.data), 
    onError: (err) => setBookError(err?.response?.data?.message || err?.message || 'Failed to book parcel.') 
  })

  const handleSubmit = () => {
    setBookError('')
    const data = methods.getValues()

    bookMutation.mutate({
      pickupAddress: toAddressDto(data.pickupAddress), deliveryAddress: toAddressDto(data.deliveryAddress),
      serviceType: data.serviceType, weightKg: Number(data.weightKg),
      dimensions: null,
      description: data.description, declaredValueZAR: data.declaredValueZAR ? Number(data.declaredValueZAR) : null,
      isFragile: data.isFragile, requiresSignature: data.requiresSignature, insuranceRequired: data.insuranceRequired,
      isEmergency: data.isEmergency,
      scheduledPickupDate: data.scheduledPickupDate || null,
      specialInstructions: data.specialInstructions?.trim() || null,
      quoteId: quoteData?.quote?.quoteId ?? null,
      paymentMethod: quoteData?.paymentMethod ?? 'CashOnCollection',
      cardToken: quoteData?.cardToken ? JSON.stringify(quoteData.cardToken) : null,
    })
  }

  const handleReset = () => {
    methods.reset({ isFragile: false, isEmergency: false, insuranceRequired: false })
    setQuoteData(null)
    setSuccess(null)
    setBookError('')
    changeStep(1)
  }

  // FIX: Enhanced Success View with Action Buttons
  if (success) {
    return (
      <div className="card text-center py-12 space-y-4">
        <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
          <CheckCircle2 size={28} />
        </div>
        <h2 className="text-2xl font-bold text-[#172554]">Booking confirmed!</h2>
        <p className="text-sm text-[#64748B]">Your parcel tracking number:</p>
        <p className="text-xl font-mono font-bold text-[#0A3D91] bg-blue-50 py-2 px-4 rounded-xl inline-block border border-blue-200">
          {success.trackingNumber}
        </p>

        <div className="flex justify-center gap-3 pt-4">
          <button onClick={handleReset} className="btn-secondary text-xs px-5 py-2.5 flex items-center gap-2">
            <RotateCcw size={14} /> Book another parcel
          </button>
          <a href="/customer/parcels" className="btn-primary text-xs px-5 py-2.5 flex items-center gap-2">
            View My Parcels <ArrowRight size={14} />
          </a>
        </div>
      </div>
    )
  }

  return (
    <FormProvider {...methods}>
      <StepIndicator currentStep={step} />
      {step === 1 && <Step1Addresses onNext={() => changeStep(2)} />}
      {step === 2 && <Step2ParcelDetails onNext={() => changeStep(3)} onBack={() => changeStep(1)} />}
      {step === 3 && <Step3Quote onNext={(d) => { setQuoteData(d); changeStep(4) }} onBack={() => changeStep(2)} />}
      {step === 4 && <Step4Confirm onBack={() => changeStep(3)} onSubmit={handleSubmit} isSubmitting={bookMutation.isPending} error={bookError} />}
    </FormProvider>
  )
}

// ── Multi-parcel (cart) flow ───────────────────────────────────────────────────
function AddParcelToCartForm({ onAdded }) {
  const [step, setStep] = useState(1)
  const methods = useForm({ defaultValues: { isFragile: false, isEmergency: false, insuranceRequired: false } })
  const { addItem } = useParcelCart()

  const handleAdd = () => {
    const data = methods.getValues()
    addItem({
      pickupAddress: toAddressDto(data.pickupAddress), deliveryAddress: toAddressDto(data.deliveryAddress),
      serviceType: data.serviceType, weightKg: Number(data.weightKg),
      dimensions: null,
      description: data.description, declaredValueZAR: data.declaredValueZAR ? Number(data.declaredValueZAR) : null,
      isFragile: data.isFragile, requiresSignature: data.requiresSignature, insuranceRequired: data.insuranceRequired,
      isEmergency: data.isEmergency,
      scheduledPickupDate: data.scheduledPickupDate || null,
      specialInstructions: data.specialInstructions?.trim() || null,
    })
    methods.reset({ isFragile: false, isEmergency: false, insuranceRequired: false })
    setStep(1)
    onAdded()
  }

  return (
    <FormProvider {...methods}>
      <div className="flex items-center gap-2 mb-4">
        <div className={clsx('w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold', step === 1 ? 'bg-[#0A3D91] text-white' : 'bg-[#DCEEFF]/40 text-[#0A3D91]')}>1</div>
        <span className="text-xs font-bold text-[#64748B]">Addresses</span>
        <div className="flex-1 h-0.5 bg-[#D8E4F5]" />
        <div className={clsx('w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold', step === 2 ? 'bg-[#0A3D91] text-white' : 'bg-[#F6FAFF] text-[#94A3B8] border border-[#D8E4F5]')}>2</div>
        <span className="text-xs font-bold text-[#64748B]">Parcel details</span>
      </div>
      {step === 1 && <Step1Addresses onNext={() => setStep(2)} />}
      {step === 2 && <Step2ParcelDetails onNext={handleAdd} onBack={() => setStep(1)} nextButtonLabel="Add to cart" />}
    </FormProvider>
  )
}

function CartCheckoutView({ onBookedSuccess }) {
  const { items, removeItem, clearCart } = useParcelCart()
  const [quotes, setQuotes] = useState(null)
  const [quoteError, setQuoteError] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('CashOnCollection')
  const [bookError, setBookError] = useState('')
  const { balance: walletBalance, isLoading: walletLoading } = useWallet()

  // FIX: Reset quotes if cart item is removed to prevent quote/item count mismatch
  const handleRemoveItem = (index) => {
    removeItem(index)
    setQuotes(null)
  }

  const total = quotes?.reduce((sum, q) => sum + (q?.totalAmountZAR ?? q?.totalZAR ?? 0), 0) ?? 0

  const quoteAllMutation = useMutation({
    mutationFn: async () => Promise.all(items.map(item => quoteApi.calculate({
      originProvince: toProvinceEnum(item.pickupAddress?.province),
      destinationProvince: toProvinceEnum(item.deliveryAddress?.province),
      weightKg: item.weightKg,
      serviceType: item.serviceType,
      declaredValueZAR: item.declaredValueZAR,
      insuranceRequired: item.insuranceRequired ?? false,
      isFragile: item.isFragile ?? false,
      requiresSignature: item.requiresSignature ?? false,
      isEmergency: item.isEmergency ?? false,
    }).then(r => r.data?.data ?? r.data))),
    onSuccess: (results) => { setQuotes(results); setQuoteError('') },
    onError: (err) => setQuoteError(err?.response?.data?.message || err?.message || 'Failed to calculate quotes.'),
  })

  const bookBatchMutation = useMutation({
    mutationFn: (dto) => parcelApi.bookBatch(dto),
    onSuccess: (res) => { clearCart(); onBookedSuccess(res.data?.data ?? res.data) },
    onError: (err) => setBookError(err?.response?.data?.message || err?.message || 'Failed to book batch parcels.'),
  })

  const handleBookAll = (cardToken) => {
    setBookError('')
    bookBatchMutation.mutate({
      parcels: items.map((item, i) => ({
        pickupAddress: item.pickupAddress, deliveryAddress: item.deliveryAddress,
        serviceType: item.serviceType, weightKg: item.weightKg,
        dimensions: null, description: item.description,
        declaredValueZAR: item.declaredValueZAR, isFragile: item.isFragile,
        requiresSignature: item.requiresSignature, insuranceRequired: item.insuranceRequired,
        isEmergency: item.isEmergency, scheduledPickupDate: item.scheduledPickupDate,
        specialInstructions: item.specialInstructions || null,
        quoteId: quotes?.[i]?.quoteId ?? null,
      })),
      paymentMethod,
      cardToken: cardToken ? JSON.stringify(cardToken) : null,
    })
  }

  return (
    <div className="space-y-5">
      <CartSummaryPanel items={items} quotes={quotes} onRemove={handleRemoveItem} />

      {items.length > 0 && !quotes && (
        <div className="card text-center py-8">
          <button type="button" onClick={() => quoteAllMutation.mutate()} disabled={quoteAllMutation.isPending} className="btn-primary px-8 mx-auto">
            {quoteAllMutation.isPending ? 'Calculating…' : `Get quote for ${items.length} parcel${items.length === 1 ? '' : 's'}`}
          </button>
          {quoteError && <Alert type="error" message={quoteError} className="mt-4" />}
        </div>
      )}

      {quotes && (
        <>
          <div className="card">
            <h3 className="text-sm font-bold text-[#172554]">Batch total: {formatZAR(total)}</h3>
          </div>

          <PaymentMethodPicker
            paymentMethod={paymentMethod} setPaymentMethod={setPaymentMethod}
            amount={total} walletBalance={walletBalance} walletLoading={walletLoading}
          />

          {bookError && <Alert type="error" message={bookError} />}

          {paymentMethod === 'Card' ? (
            <div className="card">
              <CardPaymentForm amount={total} submitLabel="Confirm & pay" onSubmit={handleBookAll} />
            </div>
          ) : (
            <div className="flex justify-end">
              <button type="button" onClick={() => handleBookAll(null)} disabled={bookBatchMutation.isPending} className="btn-primary px-8">
                {bookBatchMutation.isPending ? 'Booking…' : `Book ${items.length} parcel${items.length === 1 ? '' : 's'}`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function CartFlow() {
  const { items } = useParcelCart()
  const [view, setView] = useState('add') // 'add' | 'checkout'
  const [success, setSuccess] = useState(null)

  if (success) {
    return (
      <div className="card text-center py-12 space-y-4">
        <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
          <CheckCircle2 size={28} />
        </div>
        <h2 className="text-2xl font-bold text-[#172554]">{success.parcels?.length ?? 0} parcels booked!</h2>
        <p className="text-sm text-[#64748B]">Tracking numbers have been assigned to your account and sent via email.</p>
        <div className="flex justify-center gap-3 pt-2">
          <button onClick={() => { setSuccess(null); setView('add') }} className="btn-secondary text-xs px-5 py-2.5 flex items-center gap-2">
            <RotateCcw size={14} /> Book more parcels
          </button>
          <a href="/customer/parcels" className="btn-primary text-xs px-5 py-2.5 flex items-center gap-2">
            View My Parcels <ArrowRight size={14} />
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-3">
        <button
          onClick={() => setView('add')}
          className={clsx('flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-xl border-2 transition-all', view === 'add' ? 'bg-[#0A3D91] text-white border-[#0A3D91]' : 'bg-white text-[#64748B] border-[#D8E4F5]')}
        >
          <PlusCircle size={15} /> Add parcel
        </button>
        <button
          onClick={() => setView('checkout')}
          className={clsx('flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-xl border-2 transition-all', view === 'checkout' ? 'bg-[#0A3D91] text-white border-[#0A3D91]' : 'bg-white text-[#64748B] border-[#D8E4F5]')}
        >
          <ShoppingCart size={15} /> Cart{items.length > 0 && ` (${items.length})`}
        </button>
      </div>

      {view === 'add' && <AddParcelToCartForm onAdded={() => setView('checkout')} />}
      {view === 'checkout' && <CartCheckoutView onBookedSuccess={setSuccess} />}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function BookParcelPage() {
  const [mode, setMode] = useState('single') // 'single' | 'cart'

  return (
    <AppShell title="Book a Parcel">
      <div className="max-w-2xl mx-auto">
        <div className="flex gap-4 mb-6">
          <button onClick={() => setMode('single')} className={clsx('flex-1 py-3 font-bold rounded-xl border-2 transition-all', mode === 'single' ? 'bg-[#0A3D91] text-white border-[#0A3D91]' : 'bg-white text-[#64748B] border-[#D8E4F5]')}>
            Single parcel
          </button>
          <button onClick={() => setMode('cart')} className={clsx('flex-1 py-3 font-bold rounded-xl border-2 transition-all', mode === 'cart' ? 'bg-[#0A3D91] text-white border-[#0A3D91]' : 'bg-white text-[#64748B] border-[#D8E4F5]')}>
            Multiple parcels
          </button>
        </div>

        {mode === 'single' ? (
          <SingleParcelFlow />
        ) : (
          <ParcelCartProvider>
            <CartFlow />
          </ParcelCartProvider>
        )}
      </div>
    </AppShell>
  )
}