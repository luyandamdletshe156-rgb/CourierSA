import { useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm, FormProvider, useFormContext } from 'react-hook-form'
import { z } from 'zod'
import CardPaymentForm from '@/components/payment/CardPaymentForm'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { Alert, Spinner } from '@/components/ui'
import { parcelApi, quoteApi } from '@/api'
import { useWallet } from '@/hooks/useWallet'
import {
  MapPin, Package, Calculator, CheckCircle,
  ChevronRight, ChevronLeft, Info, Shield,
  AlertTriangle, Truck, Zap, Clock, TrendingDown,
  UploadCloud, Calendar, Flame
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
  }),
})

const parcelSchema = z.object({
  serviceType:         z.string().min(1, 'Select a service type'),
  weightKg:            z.coerce.number({ invalid_type_error: 'Weight required' }).min(0.1, 'Min 0.1 kg').max(999, 'Max 999 kg'),
  description:         z.string().min(3, 'Describe the contents').max(500),
  declaredValueZAR:    z.union([z.coerce.number().min(0), z.literal('')]).optional(),
  isFragile:           z.boolean().default(false),
  requiresSignature:   z.boolean().default(false),
  insuranceRequired:   z.boolean().default(false),
  isEmergency:         z.boolean().default(false),
  scheduledPickupDate: z.string().optional(),
  specialInstructions: z.string().max(300).optional(),
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
      <input type="text" className={clsx('input', errors[prefix]?.[name] && 'input-error')} placeholder={placeholder} {...register(`${prefix}.${name}`)} />
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
          </div>
        </div>
      ))}
      <div className="flex justify-end pt-2">
        <button type="button" onClick={submit} className="btn-primary">Continue <ChevronRight size={16} /></button>
      </div>
    </div>
  )
}

// ── Step 2: Parcel details (With Risk Assessment & Emergency) ─────────────────
const SERVICE_META = {
  Economy:  { icon: TrendingDown, label: 'Economy',  sub: '5–7 business days',  color: 'text-[#64748B]'  },
  Standard: { icon: Truck,        label: 'Standard', sub: '3–5 business days',  color: 'text-[#1E63E9]'  },
  Express:  { icon: Zap,          label: 'Express',  sub: '1–2 business days',  color: 'text-[#0A3D91]' },
  Overnight:{ icon: Clock,        label: 'Overnight',sub: 'Next business day',  color: 'text-purple-500'},
  SameDay:  { icon: Zap,          label: 'Same day', sub: 'Delivered today',    color: 'text-[#EF4444]'   },
}

function Step2ParcelDetails({ onNext, onBack }) {
  const { register, watch, setValue, handleSubmit, setError, clearErrors, formState: { errors: e } } = useFormContext()

  const serviceType  = watch('serviceType')
  const isFragile    = watch('isFragile')
  const isEmergency  = watch('isEmergency')
  const declaredVal  = Number(watch('declaredValueZAR')) || 0
  
  // ── 1. RISK ASSESSMENT LOGIC ──
  // If declared value > R2000 OR item is fragile, force insurance
  const isHighRisk = isFragile || declaredVal >= 2000;
  
  useEffect(() => {
    if (isHighRisk) setValue('insuranceRequired', true, { shouldValidate: true })
  }, [isHighRisk, setValue])

  // ── 2. EMERGENCY ESCALATION LOGIC ──
  // Force SameDay service if escalated
  useEffect(() => {
    if (isEmergency) setValue('serviceType', 'SameDay', { shouldValidate: true })
  }, [isEmergency, setValue])

  const submit = handleSubmit(async (data) => {
    try {
      clearErrors(['serviceType', 'weightKg', 'description', 'declaredValueZAR', 'dimensions'])
      await parcelSchema.parseAsync(data)
      onNext()
    } catch (err) { err?.issues?.forEach(issue => setError(issue.path.join('.'), { message: issue.message })) }
  }, () => {})

  return (
    <div className="space-y-5">
      {/* Risk Warning Alert */}
      {isHighRisk && (
        <div className="flex gap-3 px-4 py-3 bg-[#10B981]/10 border border-[#10B981]/20 rounded-xl text-[#047857] animate-in fade-in">
          <Shield size={20} className="mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <strong>Automatic Risk Assessment</strong>
            <p className="mt-0.5 opacity-90">Because your item is marked as fragile or high-value (≥ R2,000), insurance coverage has been automatically applied to protect your goods.</p>
          </div>
        </div>
      )}

      {/* Emergency Warning Alert */}
      {isEmergency && (
        <div className="flex gap-3 px-4 py-3 bg-[#EF4444]/10 border border-[#EF4444]/20 rounded-xl text-[#B91C1C] animate-in fade-in">
          <Flame size={20} className="mt-0.5 flex-shrink-0" />
          <div className="text-sm">
            <strong>Emergency Escalation Active</strong>
            <p className="mt-0.5 opacity-90">Your parcel will be prioritized by dispatchers. Service type has been locked to <b>Same Day</b>.</p>
          </div>
        </div>
      )}

      {/* Basic info */}
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

      {/* Scheduling & Instructions */}
      <div className="card">
        <div className="card-header"><h3 className="text-sm font-bold text-[#172554]">Logistics</h3></div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label flex items-center gap-1.5"><Calendar size={14}/> Schedule collection</label>
            <input type="date" className="input" {...register('scheduledPickupDate')} min={new Date().toISOString().split('T')[0]} />
            <p className="text-xs text-[#94A3B8] mt-1.5">Leave blank for ASAP collection</p>
          </div>
          <div>
            <label className="label">Driver special instructions</label>
            <input type="text" className="input" placeholder="e.g. Gate code 1234" {...register('specialInstructions')} />
          </div>
        </div>
      </div>

      {/* Service type */}
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

      {/* Options */}
      <div className="card">
        <div className="card-header"><h3 className="text-sm font-bold text-[#172554]">Options</h3></div>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            { field: 'isFragile', icon: AlertTriangle, color: 'text-[#F59E0B]', label: 'Fragile contents', sub: 'Handle with extra care' },
            { field: 'requiresSignature', icon: CheckCircle, color: 'text-[#1E63E9]', label: 'Signature required', sub: 'Sign on delivery' },
            { field: 'insuranceRequired', icon: Shield, color: 'text-[#10B981]', label: 'Parcel insurance', sub: 'Protect your items', disabled: isHighRisk },
            { field: 'isEmergency', icon: Flame, color: 'text-[#EF4444]', label: 'Emergency Escalation', sub: 'Top priority dispatch' },
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
        <button type="button" onClick={submit} className="btn-primary">Get quote <ChevronRight size={16} /></button>
      </div>
    </div>
  )
}

// ── Step 3: Quote ─────────────────────────────────────────────────────────────
function Step3Quote({ onNext, onBack }) {
  const { watch } = useFormContext(); const formData = watch()
  const [quote, setQuote] = useState(null); const [quoteError, setQuoteError] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('CashOnCollection')
  const { balance: walletBalance, isLoading: walletLoading } = useWallet()

  const quoteMutation = useMutation({
    mutationFn: (dto) => quoteApi.calculate(dto),
    onSuccess: (res) => setQuote(res.data),
    onError:   (err) => setQuoteError(err.message),
  })

  const fetchQuote = () => {
    setQuoteError('')
    quoteMutation.mutate({
      originProvince: formData.pickupAddress?.province, destinationProvince: formData.deliveryAddress?.province,
      weightKg: Number(formData.weightKg), serviceType: formData.serviceType,
      declaredValueZAR: formData.declaredValueZAR ? Number(formData.declaredValueZAR) : null,
      insuranceRequired: formData.insuranceRequired ?? false,
    })
  }

  const canPayWallet = walletBalance >= (quote?.totalAmountZAR ?? 0)

  return (
    <div className="space-y-5">
      {!quote && (
        <div className="card text-center py-12">
          <button type="button" onClick={fetchQuote} disabled={quoteMutation.isPending} className="btn-primary px-8 mx-auto">
            {quoteMutation.isPending ? 'Calculating…' : 'Calculate quote'}
          </button>
          {quoteError && <Alert type="error" message={quoteError} className="mt-4" />}
        </div>
      )}

      {quote && (
        <>
          <div className="card">
            <h3 className="text-sm font-bold text-[#172554] mb-4">Total: {formatZAR(quote.totalAmountZAR)}</h3>
          </div>
          <div className="card">
            <h3 className="text-sm font-bold text-[#172554] mb-4">Payment</h3>
            <div className="space-y-3">
              <label className="flex gap-3"><input type="radio" checked={paymentMethod === 'Card'} onChange={() => setPaymentMethod('Card')} /> Pay by card</label>
              <label className="flex gap-3"><input type="radio" checked={paymentMethod === 'CashOnCollection'} onChange={() => setPaymentMethod('CashOnCollection')} /> Cash on collection</label>
            </div>
          </div>
          {paymentMethod === 'Card' && (
            <div className="card">
              {/* Note: The CardPaymentForm will return the cardToken object on submit */}
              <CardPaymentForm amount={quote.totalAmountZAR} submitLabel="Continue" onSubmit={(token) => onNext({ quote, paymentMethod, cardToken: token })} />
            </div>
          )}
        </>
      )}

      <div className="flex justify-between pt-2">
        <button type="button" onClick={onBack} className="btn-secondary"><ChevronLeft size={16} /> Back</button>
        {paymentMethod !== 'Card' && (
          <button type="button" onClick={() => onNext({ quote, paymentMethod })} disabled={!quote} className="btn-primary">Review <ChevronRight size={16} /></button>
        )}
      </div>
    </div>
  )
}

// ── Step 4: Confirm ───────────────────────────────────────────────────────────
function Step4Confirm({ onBack, onSubmit, isSubmitting, error }) {
  return (
    <div className="card text-center space-y-6">
      <h3 className="text-xl font-bold">Review your booking</h3>
      {error && <Alert type="error" message={error} />}
      <div className="flex justify-between">
        <button type="button" onClick={onBack} className="btn-secondary" disabled={isSubmitting}>Back</button>
        <button type="button" onClick={onSubmit} disabled={isSubmitting} className="btn-primary px-8">
          {isSubmitting ? 'Booking…' : 'Confirm booking'}
        </button>
      </div>
    </div>
  )
}

// ── Bulk Upload Component (Cart equivalent) ───────────────────────────────────
function BulkUploadCSV() {
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState('')

  const handleUpload = async () => {
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    setStatus('Uploading...')
    try {
      // Calls the /api/parcels/bulk-upload endpoint you shared earlier
      const res = await parcelApi.bulkUpload(formData) 
      setStatus(`Success: ${res.data.successful} booked, ${res.data.failed} failed.`)
    } catch (e) {
      setStatus(`Error: ${e.message}`)
    }
  }

  return (
    <div className="card text-center py-12">
      <UploadCloud size={48} className="text-[#0A3D91] mx-auto mb-4" />
      <h3 className="text-lg font-bold text-[#172554] mb-2">Bulk Parcel Upload</h3>
      <p className="text-sm text-[#64748B] mb-6">Upload a CSV file to book multiple parcels at once (like a cart checkout).</p>
      <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files[0])} className="mb-4 text-sm" />
      <br/>
      <button onClick={handleUpload} disabled={!file} className="btn-primary px-8 mx-auto">Upload & Process Bulk</button>
      {status && <p className="mt-4 text-sm font-semibold text-[#172554]">{status}</p>}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function BookParcelPage() {
  const [mode, setMode] = useState('single') // 'single' | 'bulk'
  const [step, setStep] = useState(1)
  const [quoteData, setQuoteData] = useState(null)
  const [success, setSuccess] = useState(null)
  const [bookError, setBookError] = useState('')

  const methods = useForm({ defaultValues: { isFragile: false, isEmergency: false, insuranceRequired: false } })
  const bookMutation = useMutation({ mutationFn: (dto) => parcelApi.book(dto), onSuccess: (res) => setSuccess(res.data), onError: (err) => setBookError(err.message) })

  const handleSubmit = () => {
    setBookError('')
    const data = methods.getValues()
    
    // Concatenate Emergency and Scheduling info into SpecialInstructions for the backend
    let finalInstructions = data.specialInstructions || ''
    if (data.isEmergency) finalInstructions = `[EMERGENCY ESCALATION] ${finalInstructions}`
    if (data.scheduledPickupDate) finalInstructions = `[SCHEDULED PICKUP: ${data.scheduledPickupDate}] ${finalInstructions}`

    bookMutation.mutate({
      pickupAddress: data.pickupAddress, deliveryAddress: data.deliveryAddress,
      serviceType: data.serviceType, weightKg: Number(data.weightKg),
      description: data.description, declaredValueZAR: data.declaredValueZAR ? Number(data.declaredValueZAR) : null,
      isFragile: data.isFragile, requiresSignature: data.requiresSignature, insuranceRequired: data.insuranceRequired,
      specialInstructions: finalInstructions.trim(),
      quoteId: quoteData?.quote?.quoteId ?? null,
      paymentMethod: quoteData?.paymentMethod ?? 'CashOnCollection',
      
      // FIX FOR 400 BAD REQUEST: Ensure token object is stringified!
      cardToken: quoteData?.cardToken ? JSON.stringify(quoteData.cardToken) : null,
    })
  }

  return (
    <AppShell title="Book a Parcel">
      <div className="max-w-2xl mx-auto">
        
        {/* Toggle between Single and Bulk Cart */}
        <div className="flex gap-4 mb-6">
          <button onClick={() => setMode('single')} className={clsx('flex-1 py-3 font-bold rounded-xl border-2 transition-all', mode === 'single' ? 'bg-[#0A3D91] text-white border-[#0A3D91]' : 'bg-white text-[#64748B] border-[#D8E4F5]')}>Single Parcel Booking</button>
          <button onClick={() => setMode('bulk')} className={clsx('flex-1 py-3 font-bold rounded-xl border-2 transition-all', mode === 'bulk' ? 'bg-[#0A3D91] text-white border-[#0A3D91]' : 'bg-white text-[#64748B] border-[#D8E4F5]')}>Bulk Upload (Cart)</button>
        </div>

        {mode === 'bulk' ? (
          <BulkUploadCSV />
        ) : success ? (
          <div className="card text-center py-12"><h2 className="text-2xl font-bold">Booking confirmed!</h2><p className="mt-2 text-xl font-mono">{success.trackingNumber}</p></div>
        ) : (
          <FormProvider {...methods}>
            <StepIndicator currentStep={step} />
            {step === 1 && <Step1Addresses onNext={() => setStep(2)} />}
            {step === 2 && <Step2ParcelDetails onNext={() => setStep(3)} onBack={() => setStep(1)} />}
            {step === 3 && <Step3Quote onNext={(d) => { setQuoteData(d); setStep(4) }} onBack={() => setStep(2)} />}
            {step === 4 && <Step4Confirm onBack={() => setStep(3)} onSubmit={handleSubmit} isSubmitting={bookMutation.isPending} error={bookError} />}
          </FormProvider>
        )}
      </div>
    </AppShell>
  )
}