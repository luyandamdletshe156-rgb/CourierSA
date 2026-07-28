import { useState, useMemo } from 'react'
import { CreditCard, Lock, Check } from 'lucide-react'
import clsx from 'clsx'

/**
 * CardPaymentForm
 * ────────────────────────────────────────────────────────────────────────────
 * Client-side card capture + "tokenization" for the CourierSA demo payment flow.
 *
 * SECURITY MODEL (read this before wiring it up):
 * - The raw card number and CVV NEVER leave this component and are NEVER sent
 *   to the CourierSA backend, logged, or included in any API payload.
 * - On submit, this component produces a `cardToken` object containing only:
 *     { brand, last4, expiryMonth, expiryYear, cardholderName }
 *   That's the only thing that gets sent to the server — mirroring how a real
 *   gateway (PayFast, Stripe, Peach) tokenizes client-side so the merchant's
 *   backend never touches PAN/CVV. Storing raw card data server-side is a
 *   PCI-DSS violation even in a demo/school context, so this boundary is
 *   intentionally hard — do not thread the raw number through as a "shortcut".
 *
 * Usage:
 *   <CardPaymentForm
 *     amount={quote.totalAmountZAR}
 *     onSubmit={(cardToken) => mutate({ ...dto, cardToken })}
 *     submitting={mutation.isPending}
 *   />
 */

// ── Card brand detection (prefix-based, no logos/trademarks) ──────────────────
function detectBrand(digits) {
  if (/^4/.test(digits)) return 'Visa'
  if (/^5[1-5]/.test(digits) || /^2(2[2-9]|[3-6]\d|7[01]|720)/.test(digits)) return 'Mastercard'
  if (/^3[47]/.test(digits)) return 'Amex'
  if (/^6(011|5)/.test(digits)) return 'Discover'
  return null
}

const BRAND_STYLES = {
  Visa:       { label: 'VISA',       bg: 'bg-[#1A1F71]' },
  Mastercard: { label: 'MASTERCARD', bg: 'bg-[#EB001B]' },
  Amex:       { label: 'AMEX',       bg: 'bg-[#2E77BC]' },
  Discover:   { label: 'DISCOVER',   bg: 'bg-[#F76B1C]' },
}

// ── Luhn checksum ───────────────────────────────────────────────────────────
function luhnValid(digits) {
  if (digits.length < 12) return false
  let sum = 0
  let alt = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10)
    if (alt) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alt = !alt
  }
  return sum % 10 === 0
}

// ── Formatters ────────────────────────────────────────────────────────────────
function formatCardNumber(digits, brand) {
  if (brand === 'Amex') {
    // 4-6-5
    return digits.replace(/(\d{4})(\d{0,6})(\d{0,5})/, (_, a, b, c) =>
      [a, b, c].filter(Boolean).join(' '))
  }
  // 4-4-4-4
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim()
}

function formatExpiry(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 4)
  if (digits.length <= 2) return digits
  return `${digits.slice(0, 2)}/${digits.slice(2)}`
}

export default function CardPaymentForm({ amount, onSubmit, submitting, submitLabel }) {
  const [cardNumber, setCardNumber]   = useState('')
  const [expiry, setExpiry]           = useState('')
  const [cvv, setCvv]                 = useState('')
  const [cardholderName, setName]     = useState('')
  const [saveCard, setSaveCard]       = useState(false)
  const [touched, setTouched]         = useState({})
  const [submitError, setSubmitError] = useState('')

  const digits = cardNumber.replace(/\D/g, '')
  const brand  = useMemo(() => detectBrand(digits), [digits])
  const isAmex = brand === 'Amex'
  const expectedLen = isAmex ? 15 : 16
  const cvvLen = isAmex ? 4 : 3

  // ── Validation ────────────────────────────────────────────────────────────
  const errors = {}
  if (touched.cardNumber) {
    if (digits.length !== expectedLen) errors.cardNumber = `Card number must be ${expectedLen} digits`
    else if (!luhnValid(digits))        errors.cardNumber = 'Card number looks invalid'
  }
  if (touched.expiry) {
    const m = expiry.split('/')
    const month = parseInt(m[0], 10)
    const year  = parseInt(m[1], 10)
    const now   = new Date()
    const curYY = now.getFullYear() % 100
    const curMM = now.getMonth() + 1
    if (!m[1] || m[1].length !== 2 || month < 1 || month > 12) {
      errors.expiry = 'Enter a valid expiry (MM/YY)'
    } else if (year < curYY || (year === curYY && month < curMM)) {
      errors.expiry = 'Card has expired'
    }
  }
  if (touched.cvv && cvv.length !== cvvLen) {
    errors.cvv = `CVV must be ${cvvLen} digits`
  }
  if (touched.cardholderName && cardholderName.trim().length < 2) {
    errors.cardholderName = 'Cardholder name required'
  }

  const isValid =
    digits.length === expectedLen && luhnValid(digits) &&
    /^\d{2}\/\d{2}$/.test(expiry) && !errors.expiry &&
    cvv.length === cvvLen &&
    cardholderName.trim().length >= 2

  const markTouched = (field) => setTouched(t => ({ ...t, [field]: true }))

  const handleSubmit = () => {
    setSubmitError('')
    setTouched({ cardNumber: true, expiry: true, cvv: true, cardholderName: true })
    if (!isValid) return

    const [expiryMonth, expiryYear] = expiry.split('/')

    // ── Tokenization boundary ──────────────────────────────────────────────
    // Only this object — never the raw number or CVV — leaves the component.
    const cardToken = {
      brand:          brand ?? 'Card',
      last4:          digits.slice(-4),
      expiryMonth:    Number(expiryMonth),
      expiryYear:     2000 + Number(expiryYear),
      cardholderName: cardholderName.trim(),
      saveCard,
    }

    onSubmit?.(cardToken)
  }

  return (
    <div className="space-y-4">
      {/* Card preview */}
      <div className="relative rounded-2xl p-5 bg-gradient-to-br from-[#172554] to-[#0A3D91] text-white overflow-hidden">
        <div className="flex items-center justify-between mb-8">
          <CreditCard size={24} className="text-white/70" />
          {brand && (
            <span className={clsx('text-[10px] font-extrabold tracking-wider px-2 py-1 rounded', BRAND_STYLES[brand]?.bg)}>
              {BRAND_STYLES[brand]?.label}
            </span>
          )}
        </div>
        <p className="font-mono text-lg tracking-widest mb-4">
          {cardNumber ? formatCardNumber(digits, brand).padEnd(isAmex ? 17 : 19, '•') : '•••• •••• •••• ••••'}
        </p>
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium text-white/70 uppercase tracking-wide truncate max-w-[60%]">
            {cardholderName || 'CARDHOLDER NAME'}
          </span>
          <span className="font-mono font-semibold">{expiry || 'MM/YY'}</span>
        </div>
      </div>

      {/* Card number */}
      <div>
        <label className="label">Card number</label>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="cc-number"
          className={clsx('input font-mono', errors.cardNumber && 'input-error')}
          placeholder="4242 4242 4242 4242"
          value={formatCardNumber(digits, brand)}
          maxLength={isAmex ? 17 : 19}
          onChange={e => setCardNumber(e.target.value.replace(/\D/g, '').slice(0, 16))}
          onBlur={() => markTouched('cardNumber')}
        />
        {errors.cardNumber && <p className="field-error">{errors.cardNumber}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Expiry (MM/YY)</label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="cc-exp"
            className={clsx('input font-mono', errors.expiry && 'input-error')}
            placeholder="MM/YY"
            value={expiry}
            maxLength={5}
            onChange={e => setExpiry(formatExpiry(e.target.value))}
            onBlur={() => markTouched('expiry')}
          />
          {errors.expiry && <p className="field-error">{errors.expiry}</p>}
        </div>
        <div>
          <label className="label">CVV</label>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="cc-csc"
            className={clsx('input font-mono', errors.cvv && 'input-error')}
            placeholder={isAmex ? '••••' : '•••'}
            value={cvv}
            maxLength={cvvLen}
            onChange={e => setCvv(e.target.value.replace(/\D/g, '').slice(0, cvvLen))}
            onBlur={() => markTouched('cvv')}
          />
          {errors.cvv && <p className="field-error">{errors.cvv}</p>}
        </div>
      </div>

      <div>
        <label className="label">Cardholder name</label>
        <input
          type="text"
          autoComplete="cc-name"
          className={clsx('input', errors.cardholderName && 'input-error')}
          placeholder="J. Mokoena"
          value={cardholderName}
          onChange={e => setName(e.target.value)}
          onBlur={() => markTouched('cardholderName')}
        />
        {errors.cardholderName && <p className="field-error">{errors.cardholderName}</p>}
      </div>

      <label className="flex items-center gap-2.5 cursor-pointer select-none">
        <input
          type="checkbox"
          className="w-4 h-4 rounded text-[#0A3D91] border-[#D8E4F5] focus:ring-[#1E63E9]/20"
          checked={saveCard}
          onChange={e => setSaveCard(e.target.checked)}
        />
        <span className="text-sm font-medium text-[#334155]">Save this card for next time</span>
      </label>

      <div className="flex items-start gap-2 px-3.5 py-3 bg-[#F6FAFF] border border-[#D8E4F5] rounded-xl text-[11px] text-[#64748B] font-medium leading-relaxed">
        <Lock size={13} className="flex-shrink-0 mt-0.5 text-[#94A3B8]" />
        Your card number and CVV are processed on this device only and are never sent to or
        stored on CourierSA's servers. Only the card brand, last 4 digits, and expiry are saved.
      </div>

      {submitError && <p className="field-error">{submitError}</p>}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting}
        className="btn-primary w-full justify-center"
      >
        {submitting
          ? 'Processing…'
          : <><Check size={16} /> {submitLabel ?? `Pay ${amount != null ? `R ${Number(amount).toFixed(2)}` : ''}`}</>}
      </button>
    </div>
  )
}
