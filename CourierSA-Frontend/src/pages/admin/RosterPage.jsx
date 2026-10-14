import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import SummaryLine from '@/components/roster/SummaryLine'
import { PageLoader, Alert } from '@/components/ui'
import { shiftApi } from '@/api'
import {
  iso, unwrap, unwrapObj, parseIso, addDays, dayKey, mondayOf, shortDate,
  DAY_LABELS, compactHours, shiftHours, SHIFT_TONE,
} from '@/utils/roster'
import clsx from 'clsx'
import { ChevronLeft, ChevronRight, Search, Copy, CheckCircle2, AlertTriangle, CalendarDays } from 'lucide-react'

export default function RosterPage() {
  const qc = useQueryClient()
  const [weekStart, setWeekStart] = useState(iso(mondayOf()))
  const [search, setSearch] = useState('')
  const [copyMsg, setCopyMsg] = useState('')

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])
  const weekEnd = days[6]
  const todayIso = iso(new Date())

  const { data: rulesRes } = useQuery({ queryKey: ['roster', 'rules'], queryFn: () => shiftApi.rosterRules() })
  const rules = unwrapObj(rulesRes)
  const minDrivers = rules?.minDriversPerShift ?? 1

  const { data: drivers, error: driversError } = useQuery({ queryKey: ['roster-drivers'], queryFn: () => shiftApi.drivers() })
  const { data, isLoading, error: rosterError } = useQuery({ queryKey: ['roster', weekStart], queryFn: () => shiftApi.roster(weekStart, weekEnd) })
  const { data: checkRes } = useQuery({ queryKey: ['roster', 'validate', weekStart], queryFn: () => shiftApi.rosterValidate(weekStart, weekEnd) })
  
  const check = unwrapObj(checkRes)
  const violations = check?.violations ?? []
  const warnings = check?.warnings ?? []

  const driverList = unwrap(drivers)
  const shifts = unwrap(data).filter(s => s.driverId && s.status === 'Scheduled')
  
  const byCell = {}
  shifts.forEach(s => { byCell[`${s.driverId}|${dayKey(s.date)}`] = s })
  
  const unpublished = shifts.filter(s => !s.isPublished).length
  const refresh = () => qc.invalidateQueries({ queryKey: ['roster'] })

  const cycle = useMutation({
    mutationFn: ({ driverId, date, shift }) => {
      if (!shift) return shiftApi.schedule({ shifts: [{ driverId, date, shiftType: 'Morning' }], publish: false })
      if (shift.shiftType === 'Morning') return shiftApi.changeShift(shift.id, 'Afternoon')
      return shiftApi.removeShift(shift.id)
    },
    onSuccess: refresh,
  })
  
  const publish = useMutation({ mutationFn: () => shiftApi.publish({ from: weekStart, to: weekEnd }), onSuccess: refresh })

  const copyLast = useMutation({
    mutationFn: async () => {
      const prev = unwrap(await shiftApi.roster(addDays(weekStart, -7), addDays(weekStart, -1))).filter(s => s.driverId && s.status === 'Scheduled')
      const items = prev
        .map(s => ({ driverId: s.driverId, date: addDays(dayKey(s.date), 7), shiftType: s.shiftType }))
        .filter(i => i.date >= todayIso && !byCell[`${i.driverId}|${i.date}`])
      if (items.length) await shiftApi.schedule({ shifts: items, publish: false })
      return items.length
    },
    onSuccess: n => {
      setCopyMsg(n === 0 ? 'Nothing to copy. Last week is empty or this week is fully rostered.' : `Copied ${n} shift(s) from last week as drafts.`)
      refresh()
    },
  })

  const count = (date, type) => shifts.filter(s => dayKey(s.date) === date && s.shiftType === type).length
  const applies = date => date >= todayIso && !(parseIso(date).getDay() === 0 && shifts.every(s => dayKey(s.date) !== date))
  const blocked = violations.length > 0

  const slots = days.filter(applies).flatMap(d => ['Morning', 'Afternoon'].map(t => count(d, t)))
  const slotsMet = slots.filter(n => n >= minDrivers).length
  const coveragePct = slots.length ? Math.round((slotsMet / slots.length) * 100) : null
  const totalHours = shifts.reduce((sum, s) => sum + shiftHours(s), 0)
  const visibleDrivers = driverList.filter(d => d.name.toLowerCase().includes(search.trim().toLowerCase()))

  return (
    <AppShell title="Roster Planner">
      <div className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Roster Planner</h1>
          <p className="text-slate-500 mt-1 text-lg">Click cells to cycle shifts (Off → Morning → Afternoon), then publish.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn-secondary bg-white text-slate-700 shadow-sm" disabled={copyLast.isPending} onClick={() => { if (window.confirm("Copy last week's pattern?")) copyLast.mutate() }}>
            <Copy size={16} className="mr-2 inline" /> {copyLast.isPending ? 'Copying…' : 'Copy Last Week'}
          </button>
          <button className="btn-primary shadow-md" disabled={unpublished === 0 || publish.isPending || blocked} onClick={() => { if (window.confirm(`Publish ${unpublished} draft(s)?`)) publish.mutate() }}>
            <CheckCircle2 size={16} className="mr-2 inline" /> {publish.isPending ? 'Publishing…' : unpublished ? `Publish ${unpublished} Drafts` : 'Fully Published'}
          </button>
        </div>
      </div>

      <SummaryLine items={[
        { value: shifts.length, label: 'Total Shifts' },
        { value: `${totalHours}h`, label: 'Scheduled Hours' },
        { value: coveragePct == null ? '—' : `${coveragePct}%`, label: 'Depot Coverage', tone: coveragePct == null || coveragePct === 100 ? 'good' : 'bad' },
        { value: unpublished, label: 'Unpublished Drafts', tone: unpublished ? 'warn' : undefined },
      ]} />

      <div className="space-y-6">
        {/* Error / Warning Banners */}
        <div className="space-y-2">
          {violations.length > 0 && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800">
              <p className="font-bold flex items-center gap-2"><AlertTriangle size={18}/> {violations.length} Rule Violations (Must fix before publishing)</p>
              <ul className="mt-2 pl-6 list-disc text-sm space-y-1">{violations.map((v, i) => <li key={i}>{v.message}</li>)}</ul>
            </div>
          )}
          {copyMsg && <Alert type="info" message={copyMsg} />}
        </div>

        {/* Toolbar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center bg-slate-100 p-1 rounded-lg">
            <button className="px-3 py-1.5 rounded text-slate-600 hover:bg-white hover:shadow-sm transition" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft size={18} /></button>
            <div className="flex items-center gap-2 px-4 font-bold text-slate-800">
               <CalendarDays size={16} className="text-slate-400" />
               {shortDate(weekStart)} – {shortDate(weekEnd)}
            </div>
            <button className="px-3 py-1.5 rounded text-slate-600 hover:bg-white hover:shadow-sm transition" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight size={18} /></button>
            <button className="ml-2 px-3 py-1.5 text-sm font-semibold text-blue-600 hover:bg-blue-50 rounded" onClick={() => setWeekStart(iso(mondayOf()))}>Today</button>
          </div>
          
          <div className="relative w-full md:w-72">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9 w-full bg-slate-50" placeholder="Search driver..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        {/* Calendar Grid */}
        {isLoading ? <PageLoader /> : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
            <table className="w-full text-sm min-w-[1000px] border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-5 py-4 text-left font-bold text-slate-500 uppercase tracking-wider sticky left-0 bg-slate-50 z-10 w-48 border-b border-slate-200 shadow-[1px_0_0_0_#e2e8f0]">Driver</th>
                  {days.map((d, i) => (
                    <th key={d} className={clsx('px-3 py-4 text-center border-b border-slate-200', d === todayIso ? 'bg-blue-50 text-blue-700' : 'text-slate-500')}>
                      <div className="font-bold uppercase tracking-widest text-xs mb-1">{DAY_LABELS[i]}</div>
                      <div className="font-medium text-sm">{shortDate(d)}</div>
                    </th>
                  ))}
                  <th className="px-5 py-4 text-center font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleDrivers.map(dr => {
                  const mine = shifts.filter(s => s.driverId === dr.driverId)
                  return (
                    <tr key={dr.driverId} className="hover:bg-slate-50/50 transition">
                      <td className="px-5 py-3 font-semibold text-slate-800 sticky left-0 bg-white z-10 shadow-[1px_0_0_0_#e2e8f0] group-hover:bg-slate-50/50">{dr.name}</td>
                      {days.map(date => {
                        const shift = byCell[`${dr.driverId}|${date}`]
                        const past = date < todayIso
                        const busy = cycle.isPending && cycle.variables?.driverId === dr.driverId && cycle.variables?.date === date
                        
                        return (
                          <td key={date} className={clsx('p-2 text-center', date === todayIso && 'bg-blue-50/30')}>
                            <button
                              disabled={past || cycle.isPending}
                              onClick={() => cycle.mutate({ driverId: dr.driverId, date, shift })}
                              className={clsx('w-full h-12 rounded-lg flex flex-col items-center justify-center font-bold text-xs transition-all duration-200 select-none',
                                !shift ? 'bg-slate-50 text-slate-400 hover:bg-slate-200 border border-transparent' 
                                : shift.shiftType === 'Morning' ? 'bg-amber-100 text-amber-800 border-amber-200'
                                : 'bg-indigo-100 text-indigo-800 border-indigo-200',
                                shift && !shift.isPublished && 'border-dashed border-2 opacity-80',
                                (past || busy) && 'opacity-40 cursor-not-allowed')}
                            >
                              {busy ? '...' : !shift ? 'OFF' : shift.shiftType}
                              {shift && <span className="text-[10px] font-normal opacity-80 mt-0.5">{compactHours(rules?.[`${shift.shiftType.toLowerCase()}Hours`])}</span>}
                            </button>
                          </td>
                        )
                      })}
                      <td className="px-5 py-3 text-center">
                        <div className="inline-flex flex-col items-center justify-center bg-slate-50 rounded-lg px-3 py-1.5 border border-slate-100">
                          <span className={clsx('font-bold', mine.length >= 6 ? 'text-amber-600' : 'text-slate-700')}>{mine.length} shifts</span>
                          <span className="text-xs text-slate-500">{mine.reduce((sum, s) => sum + shiftHours(s), 0)} hrs</span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="bg-slate-50">
                <tr className="border-t-2 border-slate-200">
                  <td colSpan={9} className="px-5 py-3 text-xs text-slate-500 font-medium">
                    <span className="inline-block w-3 h-3 bg-amber-100 border border-amber-200 rounded mr-1 align-middle"/> Morning Shift &nbsp;&nbsp;
                    <span className="inline-block w-3 h-3 bg-indigo-100 border border-indigo-200 rounded mr-1 align-middle"/> Afternoon Shift &nbsp;&nbsp;
                    <span className="inline-block w-3 h-3 border-2 border-dashed border-slate-300 rounded mr-1 align-middle"/> Draft (Unpublished)
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  )
}