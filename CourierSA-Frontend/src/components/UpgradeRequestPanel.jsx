import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Alert } from '@/components/ui'
import { upgradeApi } from '@/api'
import { formatZAR } from '@/utils'
import { Zap } from 'lucide-react'

// Request Priority Upgrade (customer). Priority is the service level chosen at
// booking; it only changes through a request the dispatcher approves and the
// customer pays for.

const LEVELS = ['Economy', 'Standard', 'Express', 'Overnight', 'SameDay']
const UPGRADABLE = ['PendingApproval', 'Approved', 'InWarehouse', 'AwaitingCheckIn', 'CheckedOut']

export default function UpgradeRequestPanel({ parcel, onChanged }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState('')
  const [reason, setReason] = useState('')

  const { data } = useQuery({
    queryKey: ['upgrade-requests', 'mine'],
    queryFn: () => upgradeApi.mine(),
  })
  const mine = (Array.isArray(data) ? data : data?.data ?? []).filter(r => r.parcelId === parcel.id)
  const active = mine.find(r => r.status === 'Pending' || r.status === 'Approved')
  const last = mine[0]

  const faster = LEVELS.filter((_, i) => i > LEVELS.indexOf(parcel.serviceType))
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['upgrade-requests'] })
    onChanged?.()
  }

  const request = useMutation({
    mutationFn: () => upgradeApi.request(parcel.id, { requestedServiceType: target, reason }),
    onSuccess: () => { setOpen(false); setReason(''); setTarget(''); refresh() },
  })
  const pay = useMutation({
    mutationFn: id => upgradeApi.pay(id),
    onSuccess: refresh,
  })

  if (!UPGRADABLE.includes(parcel.status) && !active && !last) return null

  return (
    <div className="card bg-white p-5 rounded-2xl border border-[#D8E4F5] space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-[#0A3D91] uppercase tracking-wider flex items-center gap-1.5">
          <Zap size={13} /> Priority upgrade
        </h3>
        {!active && UPGRADABLE.includes(parcel.status) && faster.length > 0 && (
          <button className="btn-secondary btn-sm text-xs" onClick={() => setOpen(o => !o)}>
            {open ? 'Close' : 'Request upgrade'}
          </button>
        )}
      </div>

      {active?.status === 'Pending' && (
        <Alert type="info" message={`Your request to upgrade to ${active.requestedServiceType} is waiting for the dispatcher.`} />
      )}

      {active?.status === 'Approved' && (
        <div className="space-y-2">
          <Alert type="success" message={`Approved. Pay ${formatZAR(active.feeZAR)} from your wallet to upgrade to ${active.requestedServiceType}.`} />
          <button className="btn-primary text-sm" disabled={pay.isPending} onClick={() => pay.mutate(active.id)}>
            {pay.isPending ? 'Paying…' : `Pay ${formatZAR(active.feeZAR)}`}
          </button>
          {pay.error && <Alert type="error" message={pay.error.message} />}
        </div>
      )}

      {!active && last?.status === 'Rejected' && (
        <Alert type="warning" message={`Your last upgrade request was declined${last.dispatcherNotes ? `: ${last.dispatcherNotes}` : '.'}`} />
      )}
      {!active && last?.status === 'Paid' && (
        <Alert type="success" message={`Upgraded to ${last.requestedServiceType}.`} />
      )}

      {open && (
        <div className="space-y-3">
          <select className="input" value={target} onChange={e => setTarget(e.target.value)}>
            <option value="">Choose a faster service…</option>
            {faster.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
          <textarea
            className="input" rows={3} value={reason} onChange={e => setReason(e.target.value)}
            placeholder="Why does this parcel need to arrive sooner?"
          />
          {request.error && <Alert type="error" message={request.error.message} />}
          <button
            className="btn-primary text-sm"
            disabled={!target || !reason.trim() || request.isPending}
            onClick={() => request.mutate()}
          >
            {request.isPending ? 'Sending…' : 'Send to dispatcher'}
          </button>
          <p className="text-[11px] text-[#64748B]">The dispatcher checks it can be delivered in the shorter window. You only pay the fee difference if it is approved.</p>
        </div>
      )}
    </div>
  )
}
