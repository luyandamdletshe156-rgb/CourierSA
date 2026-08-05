import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import { StatusPill, TrackingBadge, PageLoader, Alert } from '@/components/ui'
import { trackingApi } from '@/api'
import { Search, MapPin } from 'lucide-react'
import { formatDate } from '@/utils'

export function DispatcherTrackPage() {
  const [trackingNumber, setTrackingNumber] = useState('')
  const [searched, setSearched] = useState('')

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['dispatcher-track', searched],
    queryFn: () => trackingApi.trackPrivate(searched),
    enabled: !!searched,
  })

  const result = data?.data

  return (
    <AppShell title="Track Parcel">
      <div className="page-header">
        <div>
          <h1 className="page-title">Track Parcel</h1>
          <p className="page-subtitle">Private dispatcher lookup for any system parcel</p>
        </div>
      </div>

      <div className="card mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            className="input font-mono flex-1"
            placeholder="Enter tracking number..."
            value={trackingNumber}
            onChange={e => setTrackingNumber(e.target.value.toUpperCase())}
          />
          <button className="btn-primary" onClick={() => setSearched(trackingNumber.trim())} disabled={!trackingNumber.trim()}>
            <Search size={15} /> Track
          </button>
        </div>
      </div>

      {isLoading && <PageLoader />}
      {isError && searched && <Alert type="error" message={error?.message ?? 'Parcel not found.'} />}

      {result && (
        <div className="card">
          <div className="card-header">
            <div className="flex items-center gap-3">
              <TrackingBadge value={result.trackingNumber} />
              <StatusPill status={result.status} />
            </div>
          </div>
          <p className="text-xs font-bold text-[#172554] mb-3 flex items-center gap-1.5"><MapPin size={13} /> Event History</p>
          <div className="space-y-3">
            {result.trackingEvents?.map((e, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <div className="w-2 h-2 rounded-full bg-[#0A3D91] mt-1.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-[#172554]">{e.eventType}{e.location ? ` — ${e.location}` : ''}</p>
                  <p className="text-xs text-[#64748B]">{e.description}</p>
                  <p className="text-xs text-[#94A3B8] font-mono">{formatDate(e.occurredAt, { time: true })}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </AppShell>
  )
}