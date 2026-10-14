import clsx from 'clsx'

// One quiet line of key numbers, in place of a row of big stat cards.
const TONES = { good: 'text-[#166534]', warn: 'text-[#B45309]', bad: 'text-[#B91C1C]' }

export default function SummaryLine({ items }) {
  return (
    <ul className="flex flex-wrap gap-x-7 gap-y-1 mb-5 text-sm text-[#64748B]">
      {items.map(i => (
        <li key={i.label}>
          <b className={clsx('text-base tabular-nums', TONES[i.tone] ?? 'text-[#0F172A]')}>{i.value}</b> {i.label}
        </li>
      ))}
    </ul>
  )
}
