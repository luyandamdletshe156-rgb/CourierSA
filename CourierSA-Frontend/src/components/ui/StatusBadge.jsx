import clsx from 'clsx'

const COLOR_MAP = {
  // Lost parcel case statuses
  Reported:            'bg-[#F59E0B]/10 text-[#B45309] border-[#F59E0B]/20',
  UnderInvestigation:  'bg-[#1E63E9]/10 text-[#0A3D91] border-[#1E63E9]/20',
  Found:                'bg-[#10B981]/10 text-[#047857] border-[#10B981]/20',
  ConfirmedLost:       'bg-[#EF4444]/10 text-[#B91C1C] border-[#EF4444]/20',
  Closed:              'bg-[#F6FAFF] text-[#64748B] border-[#D8E4F5]',
  // Return request statuses
  Requested:           'bg-[#F59E0B]/10 text-[#B45309] border-[#F59E0B]/20',
  Approved:            'bg-[#1E63E9]/10 text-[#0A3D91] border-[#1E63E9]/20',
  Received:            'bg-[#8B5CF6]/10 text-[#6D28D9] border-[#8B5CF6]/20',
  ReadyForRefund:      'bg-[#10B981]/10 text-[#047857] border-[#10B981]/20',
  InspectionFailed:    'bg-[#EF4444]/10 text-[#B91C1C] border-[#EF4444]/20',
  Refunded:            'bg-[#10B981]/10 text-[#047857] border-[#10B981]/20',
  Dispatched:          'bg-[#F59E0B]/10 text-[#B45309] border-[#F59E0B]/20',
  Collected:           'bg-[#0EA5E9]/10 text-[#0369A1] border-[#0EA5E9]/20',
  // Claim statuses
  Submitted:           'bg-[#F59E0B]/10 text-[#B45309] border-[#F59E0B]/20',
  UnderReview:         'bg-[#1E63E9]/10 text-[#0A3D91] border-[#1E63E9]/20',
  PartiallyApproved:   'bg-[#10B981]/10 text-[#047857] border-[#10B981]/20',
  Rejected:            'bg-[#EF4444]/10 text-[#B91C1C] border-[#EF4444]/20',
  Settled:             'bg-[#10B981]/10 text-[#047857] border-[#10B981]/20',
  // Fraud risk levels (UC-FRAUD-01)
  Low:                 'bg-[#10B981]/10 text-[#047857] border-[#10B981]/20',
  Medium:              'bg-[#F59E0B]/10 text-[#B45309] border-[#F59E0B]/20',
  High:                'bg-[#EF4444]/10 text-[#B91C1C] border-[#EF4444]/20',
  Restricted:          'bg-[#7C2D12]/10 text-[#7C2D12] border-[#7C2D12]/20',
}

export default function StatusBadge({ status }) {
  return (
    <span className={clsx(
      'inline-block px-2.5 py-1 rounded-lg text-xs font-bold border',
      COLOR_MAP[status] || 'bg-[#F6FAFF] text-[#64748B] border-[#D8E4F5]'
    )}>
      {status}
    </span>
  )
}