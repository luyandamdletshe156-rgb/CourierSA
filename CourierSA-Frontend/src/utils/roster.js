// Shared date and shift helpers for the roster, leave, swap and schedule pages.
// All dates are handled as local "YYYY-MM-DD" strings (toISOString is UTC and can show
// yesterday just after midnight in SAST).

export const iso = d => {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
export const unwrap = d => (Array.isArray(d) ? d : d?.data ?? [])
export const unwrapObj = d => d?.data ?? d

export const parseIso = s => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d) }
export const dayKey = d => String(d).slice(0, 10)
export const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return iso(new Date(y, m - 1, d + n)) }
export const mondayOf = (d = new Date()) => {
  const x = new Date(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x
}
export const mondayKeyOf = s => iso(mondayOf(parseIso(s)))

export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const shortDate = s => parseIso(s).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short' })
export const longDate = s => parseIso(s).toLocaleDateString('en-ZA', { weekday: 'short', day: '2-digit', month: 'short' })
export const weekdayOf = s => parseIso(s).toLocaleDateString('en-ZA', { weekday: 'short' })
export const compactHours = h => (h ?? '').replace(/:00/g, '')

// Whole days from today to the given date (negative = in the past).
export const daysFromToday = s => Math.round((parseIso(s) - parseIso(iso(new Date()))) / 86400000)

export const relativeDay = s => {
  const n = daysFromToday(s)
  if (n === 0) return 'Today'
  if (n === 1) return 'Tomorrow'
  if (n === -1) return 'Yesterday'
  if (n > 1) return `In ${n} days`
  return `${Math.abs(n)} days ago`
}

// Inclusive day count between two dates.
export const inclusiveDays = (start, end) => Math.max(1, daysFromToday(dayKey(end)) - daysFromToday(dayKey(start)) + 1)

// "06:00" / "06:00:00" -> minutes after midnight
const toMinutes = t => {
  const [h, m] = String(t ?? '').split(':').map(Number)
  return Number.isFinite(h) ? h * 60 + (Number.isFinite(m) ? m : 0) : 0
}
export const shiftHours = s => Math.max(0, (toMinutes(s.endTime) - toMinutes(s.startTime)) / 60)

// "This week", "Next week", otherwise "Week of 19 Oct", plus the date range.
export function weekLabel(mondayKey) {
  const thisMonday = mondayKeyOf(iso(new Date()))
  const diffWeeks = Math.round((parseIso(mondayKey) - parseIso(thisMonday)) / (7 * 86400000))
  const range = `${shortDate(mondayKey)} – ${shortDate(addDays(mondayKey, 6))}`
  const name = diffWeeks === 0 ? 'This week' : diffWeeks === 1 ? 'Next week' : `Week of ${shortDate(mondayKey)}`
  return { name, range }
}

export const SHIFT_TONE = {
  Morning: { letter: 'A', label: 'Morning', pill: 'bg-[#DBEAFE] text-[#1D4ED8]' },
  Afternoon: { letter: 'B', label: 'Afternoon', pill: 'bg-[#FFEDD5] text-[#C2410C]' },
}
