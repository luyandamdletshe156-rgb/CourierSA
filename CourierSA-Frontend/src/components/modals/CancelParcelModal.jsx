import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Modal, Alert } from '@/components/ui'
import { parcelApi } from '@/api'
import { formatZAR } from '@/utils'
import { AlertTriangle, Info, Ban, ShieldCheck, Mail } from 'lucide-react'

export default function CancelParcelModal({ parcel, open, onClose }) {
  const [reason, setReason] = useState('')
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const qc = useQueryClient()

  useEffect(() => {
    if (open) {
      setReason('')
      setOtp('')
      setOtpSent(false)
      setError('')
      setSuccessMsg('')
    }
  }, [open])

  // Fetch cancellation rules and fee preview from backend
  const { data: quoteRes, isLoading: isCheckingPreview } = useQuery({
    queryKey: ['cancel-preview', parcel?.id],
    queryFn: () => parcelApi.cancelPreview(parcel.id),
    enabled: !!parcel?.id && open,
    retry: false,
  })

  // Trigger OTP generation (Warehouse parcels only)
  const otpMutation = useMutation({
    mutationFn: () => parcelApi.requestCancelOtp(parcel.id),
    onSuccess: () => {
      setOtpSent(true)
      setError('')
      setSuccessMsg('4-digit verification code sent to your registered email.')
    },
    onError: (err) => setError(err?.message || 'Failed to send OTP.'),
  })

  // Finalize cancellation
  const cancelMutation = useMutation({
    mutationFn: () => parcelApi.cancel(parcel.id, { 
      reason: reason.trim(), 
      otp: otp.trim() || null 
    }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['parcels'] })
      qc.invalidateQueries({ queryKey: ['parcel', parcel?.id] })
      qc.invalidateQueries({ queryKey: ['wallet-balance'] })
      onClose()
      alert(res.message || 'Parcel cancelled successfully.')
    },
    onError: (err) => setError(err?.message || 'Failed to cancel parcel.'),
  })

  if (!parcel) return null
  const quote = quoteRes?.data

  const isOtpRequired = quote?.requiresCancellationOtp
  const canSubmit = reason.trim().length >= 3 && (!isOtpRequired || otp.length === 4)

  return (
    <Modal open={open} onClose={onClose} title="Cancel Parcel Booking" size="sm">
      <div className="space-y-4">
        {isCheckingPreview ? (
          <p className="text-sm text-[#64748B] py-4 text-center animate-pulse">Checking cancellation rules...</p>
        ) : quote && !quote.isEligible ? (
          <div className="p-4 bg-[#FEF2F2] border border-[#FECACA] rounded-xl">
            <h4 className="text-sm font-bold text-[#991B1B] flex items-center gap-2">
              <Ban size={16} /> Cancellation Unavailable
            </h4>
            <p className="text-sm text-[#B91C1C] mt-1">{quote.reason}</p>
          </div>
        ) : (
          <>
            {/* Banner: Fee & Security Info */}
            {quote && (
              <div className={`p-4 rounded-xl border ${quote.isFeeApplicable ? 'bg-[#FFFBEB] border-[#FDE68A]' : 'bg-[#EFF6FF] border-[#BFDBFE]'}`}>
                <h4 className={`text-sm font-bold flex items-center gap-2 ${quote.isFeeApplicable ? 'text-[#92400E]' : 'text-[#1E40AF]'}`}>
                  {quote.isFeeApplicable ? <AlertTriangle size={16} /> : <Info size={16} />}
                  {quote.isFeeApplicable ? 'Warehouse Handling Fee & OTP Required' : 'Free Cancellation'}
                </h4>
                <p className="text-xs text-[#475569] mt-1">{quote.reason}</p>

                <div className="mt-3 pt-3 border-t border-[#CBD5E1]/60 space-y-1 text-xs">
                  <div className="flex justify-between text-[#64748B]">
                    <span>Original Quote:</span>
                    <span className="font-mono">{formatZAR(quote.quoteAmountZAR)}</span>
                  </div>
                  {quote.isFeeApplicable && (
                    <div className="flex justify-between text-[#EF4444]">
                      <span>Warehouse Handling Fee:</span>
                      <span className="font-mono">-{formatZAR(quote.cancellationFeeZAR)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-[#059669] font-bold text-sm pt-1">
                    <span>Estimated Net Refund:</span>
                    <span className="font-mono">{formatZAR(quote.estimatedRefundZAR)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Cancellation Reason Input */}
            <div>
              <label className="label">Reason for Cancellation <span className="text-red-400">*</span></label>
              <textarea
                rows={2}
                className="input"
                placeholder="e.g. Booked by mistake, address change..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>

            {/* OTP Section (Warehouse parcels only) */}
            {isOtpRequired && (
              <div className="p-3 bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-[#172554] flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-[#D97706]" /> Security Verification OTP
                  </span>
                  <button
                    type="button"
                    onClick={() => otpMutation.mutate()}
                    disabled={otpMutation.isPending}
                    className="btn-secondary btn-sm text-xs"
                  >
                    <Mail size={12} />
                    {otpMutation.isPending ? 'Sending...' : otpSent ? 'Resend Code' : 'Send Code'}
                  </button>
                </div>

                {otpSent && (
                  <div>
                    <label className="label text-xs">Enter 4-Digit OTP Code</label>
                    <input
                      type="text"
                      maxLength={4}
                      className="input text-center font-mono text-xl tracking-widest"
                      placeholder="0000"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    />
                  </div>
                )}
              </div>
            )}

            {successMsg && <Alert type="success" message={successMsg} />}
            {error && <Alert type="error" message={error} />}

            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-secondary" onClick={onClose} disabled={cancelMutation.isPending}>
                Keep Parcel
              </button>
              <button
                className="btn-danger"
                disabled={!canSubmit || cancelMutation.isPending}
                onClick={() => cancelMutation.mutate()}
              >
                {cancelMutation.isPending ? 'Cancelling...' : 'Confirm Cancellation'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}