import clsx from 'clsx'

const TONES = { 
  good: 'text-green-700 bg-green-50 border-green-200', 
  warn: 'text-amber-700 bg-amber-50 border-amber-200', 
  bad: 'text-red-700 bg-red-50 border-red-200' 
}

export default function SummaryLine({ items }) {
  return (
    <div className="flex flex-wrap gap-3 mb-6">
      {items.map(i => (
        <div key={i.label} className={clsx("px-4 py-2.5 rounded-xl border flex items-baseline gap-2 shadow-sm transition-all", 
          i.tone ? TONES[i.tone] : 'bg-white border-slate-200 text-slate-600')}>
          <span className="text-xl font-bold tabular-nums tracking-tight">{i.value}</span>
          <span className="text-xs font-bold uppercase tracking-wider opacity-80">{i.label}</span>
        </div>
      ))}
    </div>
  )
}
