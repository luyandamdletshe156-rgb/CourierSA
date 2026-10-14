import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import RosterSubNav from '@/components/roster/RosterSubNav'
import { PageLoader, Alert, StatCard } from '@/components/ui'
import { shiftApi } from '@/api'
import {
  iso, unwrap, unwrapObj, parseIso, addDays, dayKey, mondayOf, shortDate, longDate,
  DAY_LABELS, compactHours, shiftHours, SHIFT_TONE,
} from '@/utils/roster'
import clsx from 'clsx'
import { ChevronLeft, ChevronRight, Search, Copy, LayoutGrid, CalendarRange, CalendarCheck2, Users, Gauge, FileClock } from 'lucide-react'

// Schedule Driver Roster (admin): plan the week, check it, publish it.
// Leave requests, shift swaps and open shifts each have their own page now.
// Page order: summary numbers, week controls, roster health, then the roster itself.

const VIEWS = [
  { key: 'grid', label: 'Grid', icon: LayoutGrid },
  { key: 'day', label: 'By day', icon: CalendarRange },
]

export default function RosterPage() {
  const qc = useQueryClient()
  const [weekStart, setWeekStart] = useState(iso(mondayOf()))
  const [view, setView] = useState('grid')
  const [search, setSearch] = useState('')
  const [copyMsg, setCopyMsg] = useState('')

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const weekEnd = days[6]
  const todayIso = iso(new Date())

  const { data: rulesRes } = useQuery({ queryKey: ['roster', 'rules'], queryFn: () => shiftApi.rosterRules() })
  const rules = unwrapObj(rulesRes)
  const minDrivers = rules?.minDriversPerShift ?? 1

  const { data: drivers, error: driversError } = useQuery({ queryKey: ['roster-drivers'], queryFn: () => shiftApi.drivers() })
  const { data, isLoading, error: rosterError } = useQuery({
    queryKey: ['roster', weekStart],
    queryFn: () => shiftApi.roster(weekStart, weekEnd),
  })
  const { data: checkRes } = useQuery({
    queryKey: ['roster', 'validate', weekStart],
    queryFn: () => shiftApi.rosterValidate(weekStart, weekEnd),
  })
  const check = unwrapObj(checkRes)
  const violations = check?.violations ?? []
  const warnings = check?.warnings ?? []

  const driverList = unwrap(drivers)
  const shifts = unwrap(data).filter(s => s.driverId && s.status === 'Scheduled')
  const byCell = {}
  shifts.forEach(s => { byCell[`${s.driverId}|${dayKey(s.date)}`] = s })
  const unpublished = shifts.filter(s => !s.isPublished).length

  const refresh = () => qc.invalidateQueries({ queryKey: ['roster'] })

  // Off -> Morning (A) -> Afternoon (B) -> Off
  const cycle = useMutation({
    mutationFn: ({ driverId, date, shift }) => {
      if (!shift) return shiftApi.schedule({ shifts: [{ driverId, date, shiftType: 'Morning' }], publish: false })
      if (shift.shiftType === 'Morning') return shiftApi.changeShift(shift.id, 'Afternoon')
      return shiftApi.removeShift(shift.id)
    },
    onSuccess: refresh,
  })
  const publish = useMutation({
    mutationFn: () => shiftApi.publish({ from: weekStart, to: weekEnd }),
    onSuccess: refresh,
  })

  // Copy last week's pattern onto this week. Existing cells and past days are left alone.
  const copyLast = useMutation({
    mutationFn: async () => {
      const prev = unwrap(await shiftApi.roster(addDays(weekStart, -7), addDays(weekStart, -1)))
        .filter(s => s.driverId && s.status === 'Scheduled')
      const items = prev
        .map(s => ({ driverId: s.driverId, date: addDays(dayKey(s.date), 7), shiftType: s.shiftType }))
        .filter(i => i.date >= todayIso && !byCell[`${i.driverId}|${i.date}`])
      if (items.length) await shiftApi.schedule({ shifts: items, publish: false })
      return items.length
    },
    onSuccess: n => {
      setCopyMsg(n === 0 ? 'Nothing to copy. Last week is empty or this week is already filled in.' : `Copied ${n} shift${n === 1 ? '' : 's'} from last week as drafts.`)
      refresh()
    },
  })

  const count = (date, type) => shifts.filter(s => dayKey(s.date) === date && s.shiftType === type).length
  // Coverage is only checked from today on, and Sundays only when somebody is rostered.
  const applies = date => date >= todayIso && !(parseIso(date).getDay() === 0 && shifts.every(s => dayKey(s.date) !== date))

  const hours = { Morning: compactHours(rules?.morningHours), Afternoon: compactHours(rules?.afternoonHours) }
  const blocked = violations.length > 0

  // Summary numbers
  const slots = days.filter(applies).flatMap(d => ['Morning', 'Afternoon'].map(t => count(d, t)))
  const slotsMet = slots.filter(n => n >= minDrivers).length
  const coveragePct = slots.length ? Math.round((slotsMet / slots.length) * 100) : null
  const rosteredDrivers = new Set(shifts.map(s => s.driverId)).size
  const totalHours = shifts.reduce((sum, s) => sum + shiftHours(s), 0)

  const visibleDrivers = driverList.filter(d => d.name.toLowerCase().includes(search.trim().toLowerCase()))

  const confirmPublish = () => {
    if (window.confirm(`Publish ${unpublished} draft shift${unpublished === 1 ? '' : 's'}? Drivers will be notified.`)) publish.mutate()
  }
  const confirmCopy = () => {
    setCopyMsg('')
    if (window.confirm('Copy last week\'s roster onto this week? Cells that already have a shift are kept.')) copyLast.mutate()
  }

  return (
    <AppShell title="Roster Planner">
      <div className="page-header">
        <div>
          <h1 className="page-title">Roster Planner</h1>
          <p className="page-subtitle">Plan who works which shift, check the week for problems, then publish it to drivers.</p>
        </div>
      </div>

      <RosterSubNav role="admin" />

      <div className="space-y-5">
        {driversError && <Alert type="error" message={`Could not load drivers: ${driversError.message}`} />}
        {rosterError && <Alert type="error" message={`Could not load roster: ${rosterError.message}`} />}
        {!driversError && drivers && driverList.length === 0 && (
          <Alert type="error" message="No active drivers found. Create a driver account under Users first." />
        )}

        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard label="Shifts planned" value={shifts.length} icon={CalendarCheck2} color="bg-[#0A3D91]" sub={`${totalHours} driver hours this week`} />
          <StatCard label="Drivers rostered" value={`${rosteredDrivers} / ${driverList.length}`} icon={Users} color="bg-[#1E63E9]" sub="With at least one shift" />
          <StatCard label="Coverage" value={coveragePct == null ? '—' : `${coveragePct}%`} icon={Gauge}
            color={coveragePct == null || coveragePct === 100 ? 'bg-[#16A34A]' : 'bg-[#DC2626]'}
            sub={coveragePct == null ? 'No upcoming days this week' : `${slotsMet} of ${slots.length} shifts meet the minimum`} />
          <StatCard label="Drafts" value={unpublished} icon={FileClock} color={unpublished ? 'bg-[#F59E0B]' : 'bg-[#64748B]'}
            sub={unpublished ? 'Not visible to drivers yet' : 'Everything is published'} />
        </div>

        {/* Controls */}
        <div className="card p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1">
              <button className="btn-secondary px-2 py-2" aria-label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft size={16} /></button>
              <input type="date" className="input w-auto" aria-label="Week starting" value={weekStart}
                onChange={e => e.target.value && setWeekStart(iso(mondayOf(parseIso(e.target.value))))} />
              <button className="btn-secondary px-2 py-2" aria-label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight size={16} /></button>
              <button className="btn-ghost btn-sm" onClick={() => setWeekStart(iso(mondayOf()))}>This week</button>
              <span className="ml-1 text-sm font-semibold text-[#0F172A]">{shortDate(weekStart)} – {shortDate(weekEnd)}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button className="btn-secondary btn-sm" disabled={copyLast.isPending} onClick={confirmCopy}>
                <Copy size={13} /> {copyLast.isPending ? 'Copying…' : 'Copy last week'}
              </button>
              <button className="btn-primary text-sm whitespace-nowrap" disabled={unpublished === 0 || publish.isPending || blocked} onClick={confirmPublish}>
                {publish.isPending ? 'Publishing…' : unpublished ? `Publish ${unpublished} draft${unpublished === 1 ? '' : 's'}` : 'Nothing to publish'}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-[#475569] border-t border-[#E2E8F0] pt-3">
            <span><b>Depot:</b> {rules?.depot ?? '—'}</span>
            <span><b>Shift A:</b> {rules?.morningHours ?? '—'}</span>
            <span><b>Shift B:</b> {rules?.afternoonHours ?? '—'}</span>
            <span><b>Minimum:</b> {minDrivers} driver{minDrivers === 1 ? '' : 's'} per shift</span>
            {rules?.minRestHours != null && <span><b>Rest between shifts:</b> {rules.minRestHours} h</span>}
            {rules?.maxConsecutiveDays != null && <span><b>Max days in a row:</b> {rules.maxConsecutiveDays}</span>}
          </div>
          {blocked && <p className="text-xs text-[#B91C1C]">Fix the rest-period problems below before you can publish.</p>}
        </div>

        {cycle.error && <Alert type="error" message={cycle.error.message} />}
        {publish.error && <Alert type="error" message={publish.error.message} />}
        {copyLast.error && <Alert type="error" message={copyLast.error.message} />}
        {publish.isSuccess && <Alert type="success" message="Roster published. Drivers have been notified." />}
        {copyMsg && <Alert type="info" message={copyMsg} />}

        {/* Roster health: seen before publishing */}
        {violations.length > 0 && (
          <div className="rounded-xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm space-y-1">
            <p className="font-bold">Rest-period problems ({violations.length}). Fix these before publishing.</p>
            {violations.map((v, i) => <p key={i}>• {v.message}</p>)}
          </div>
        )}
        {warnings.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-800 px-4 py-3 text-sm space-y-1">
            <p className="font-bold">Coverage warnings ({warnings.length})</p>
            {warnings.map((w, i) => <p key={i}>• {w.message}</p>)}
          </div>
        )}
        {check && violations.length === 0 && warnings.length === 0 && (
          <Alert type="success" message="No scheduling conflicts, rest-period violations or coverage gaps detected." />
        )}

        {/* The roster */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div role="tablist" className="inline-flex rounded-xl border border-[#D8E4F5] bg-white p-1">
              {VIEWS.map(v => (
                <button key={v.key} role="tab" aria-selected={view === v.key} onClick={() => setView(v.key)}
                  className={clsx('inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition',
                    view === v.key ? 'bg-[#0A3D91] text-white' : 'text-[#475569] hover:bg-[#F1F5F9]')}>
                  <v.icon size={13} /> {v.label}
                </button>
              ))}
            </div>
            {view === 'grid' && (
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" />
                <input className="input pl-9 w-56 text-sm" placeholder="Find a driver…" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-[#64748B]">
              {view === 'grid' ? <>Click a cell to cycle <b>Off → A → B → Off</b>.</> : 'Read-only summary. Switch to Grid to make changes.'}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
              <span className={clsx('px-2 py-0.5 rounded-full', SHIFT_TONE.Morning.pill)}>A morning</span>
              <span className={clsx('px-2 py-0.5 rounded-full', SHIFT_TONE.Afternoon.pill)}>B afternoon</span>
              <span className="px-2 py-0.5 rounded-full bg-[#F1F5F9] text-[#64748B]">Off</span>
              <span className="px-2 py-0.5 rounded-full border border-dashed border-[#64748B] text-[#475569]">Draft</span>
            </div>
          </div>

          {isLoading ? <PageLoader /> : view === 'grid' ? (
            <div className="card overflow-x-auto p-0">
              <table className="w-full text-sm min-w-[860px]">
                <thead>
                  <tr className="text-left text-[#64748B] bg-[#F8FAFC]">
                    <th className="px-4 py-2.5 w-48">Driver</th>
                    {days.map((d, i) => (
                      <th key={d} className={clsx('px-2 py-2.5 text-center', d === todayIso && 'text-[#0A3D91]')}>
                        <div className="text-xs font-bold uppercase">{DAY_LABELS[i]}</div>
                        <div className="text-[11px] font-normal">{shortDate(d)}</div>
                      </th>
                    ))}
                    <th className="px-3 py-2.5 text-center text-xs font-bold uppercase">Week</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {visibleDrivers.map(dr => {
                    const mine = shifts.filter(s => s.driverId === dr.driverId)
                    const hrs = mine.reduce((sum, s) => sum + shiftHours(s), 0)
                    return (
                      <tr key={dr.driverId}>
                        <td className="px-4 py-2 font-semibold">{dr.name}</td>
                        {days.map(date => {
                          const shift = byCell[`${dr.driverId}|${date}`]
                          const past = date < todayIso
                          const busy = cycle.isPending && cycle.variables?.driverId === dr.driverId && cycle.variables?.date === date
                          const label = !shift ? 'Off' : `${SHIFT_TONE[shift.shiftType]?.letter ?? '?'} ${hours[shift.shiftType] ?? ''}`
                          return (
                            <td key={date} className="px-1.5 py-1.5 text-center">
                              <button
                                disabled={past || cycle.isPending}
                                onClick={() => cycle.mutate({ driverId: dr.driverId, date, shift })}
                                title={past ? 'Past days cannot be changed' : 'Click to change: Off → A → B → Off'}
                                className={clsx('w-full rounded-full px-2 py-1 text-xs font-bold border transition',
                                  !shift && 'bg-[#F1F5F9] text-[#64748B] border-transparent hover:border-[#CBD5E1]',
                                  shift?.shiftType === 'Morning' && SHIFT_TONE.Morning.pill,
                                  shift?.shiftType === 'Afternoon' && SHIFT_TONE.Afternoon.pill,
                                  shift && (shift.isPublished ? 'border-transparent' : 'border-dashed border-current'),
                                  (past || busy) && 'opacity-50 cursor-not-allowed')}>
                                {busy ? '…' : label}
                              </button>
                            </td>
                          )
                        })}
                        <td className="px-3 py-2 text-center text-xs">
                          <span className={clsx('font-bold', mine.length >= 6 ? 'text-[#B45309]' : 'text-[#0F172A]')}>{mine.length} shift{mine.length === 1 ? '' : 's'}</span>
                          <span className="block text-[11px] text-[#64748B]">{hrs} h</span>
                        </td>
                      </tr>
                    )
                  })}
                  {visibleDrivers.length === 0 && (
                    <tr><td colSpan={9} className="px-4 py-6 text-center text-[#64748B]">{driverList.length === 0 ? 'No drivers to roster yet.' : 'No driver matches your search.'}</td></tr>
                  )}
                </tbody>
                <tfoot className="bg-[#F8FAFC] text-xs">
                  {[['Morning', 'Shift A on duty'], ['Afternoon', 'Shift B on duty']].map(([type, title]) => (
                    <tr key={type} className="border-t border-[#E2E8F0]">
                      <td className="px-4 py-2 font-bold">{title}</td>
                      {days.map(date => {
                        const n = count(date, type)
                        const checked = applies(date)
                        const low = checked && n < minDrivers
                        return (
                          <td key={date} className="px-1.5 py-2 text-center">
                            <span className={clsx('font-bold px-2 py-0.5 rounded-full',
                              !checked ? 'text-[#94A3B8]' : low ? 'bg-[#FEF2F2] text-[#B91C1C]' : 'bg-[#F0FDF4] text-[#166534]')}>
                              {n}{checked ? (low ? ' ✕' : ' ✓') : ''}
                            </span>
                          </td>
                        )
                      })}
                      <td />
                    </tr>
                  ))}
                </tfoot>
              </table>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              {days.map(date => (
                <div key={date} className={clsx('card p-4 space-y-3', date === todayIso && 'ring-2 ring-[#0A3D91]')}>
                  <p className="text-sm font-bold text-[#0F172A]">{longDate(date)}{date === todayIso && <span className="ml-2 text-[11px] font-bold bg-[#DBEAFE] text-[#1D4ED8] px-2 py-0.5 rounded-full">Today</span>}</p>
                  {['Morning', 'Afternoon'].map(type => {
                    const names = shifts.filter(s => dayKey(s.date) === date && s.shiftType === type)
                    const low = applies(date) && names.length < minDrivers
                    return (
                      <div key={type} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className={clsx('font-bold px-2 py-0.5 rounded-full', SHIFT_TONE[type].pill)}>{SHIFT_TONE[type].letter} {SHIFT_TONE[type].label}</span>
                          <span className={clsx('font-bold', low ? 'text-[#B91C1C]' : 'text-[#166534]')}>{names.length}/{minDrivers} {low ? '✕' : '✓'}</span>
                        </div>
                        {names.length === 0
                          ? <p className="text-xs text-[#94A3B8]">Nobody rostered</p>
                          : <ul className="text-xs text-[#334155] space-y-0.5">{names.map(s => (
                              <li key={s.id}>{s.driverName}{!s.isPublished && <span className="text-[#94A3B8]"> (draft)</span>}</li>
                            ))}</ul>}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
