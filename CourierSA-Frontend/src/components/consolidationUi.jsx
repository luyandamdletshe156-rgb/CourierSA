import clsx from 'clsx'

// Shared bits for the consolidation pages.

// The API returns UTC timestamps; MySQL may drop the trailing "Z", which would make the browser read them as local time.
export const asUtc = d => (d ? new Date(/Z$|[+-]\d\d:\d\d$/.test(d) ? d : `${d}Z`) : null)

export const hoursLeft = d => {
  const t = asUtc(d)
  return t ? Math.max(0, Math.ceil((t.getTime() - Date.now()) / 3600000)) : 0
}

export const fmtWhen = d => (d ? asUtc(d).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }) : '—')

const SOURCE = {
  Customer: { label: 'Requested by customer', cls: 'bg-[#F1F5F9] text-[#475569]' },
  System:   { label: 'Automatic',             cls: 'bg-[#EEF2FF] text-[#4338CA]' },
  Staff:    { label: 'Warehouse',             cls: 'bg-[#F5F3FF] text-[#6D28D9]' },
}

export function SourceBadge({ source }) {
  const s = SOURCE[source] ?? SOURCE.Customer
  return <span className={clsx('text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full whitespace-nowrap', s.cls)}>{s.label}</span>
}
