import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import RosterSubNav from '@/components/roster/RosterSubNav'
import { EmptyState, PageLoader, Alert, StatCard } from '@/components/ui'
import { shiftApi } from '@/api'
import { unwrap, dayKey, daysFromToday, relativeDay, longDate, SHIFT_TONE } from '@/utils/roster'
import clsx from 'clsx'
import { UserX, CalendarClock, Sun, Sunset } from 'lucide-react'

// Fill Open Shifts (admin). Shifts left unstaffed after approved leave, grouped by day,
// each with one dropdown and one button.

const FILTERS = ['All', 'Morning', 'Afternoon']

function OpenShiftRow({ s, drivers, onDone }) {
  const qc = useQueryClient()
  const [driverId, setDriverId] = useState('')
  const assign = useMutation({
    mutationFn: () => shiftApi.assignShift(s.id, driverId),
    onSuccess: () => {
      ;['open-shifts', 'roster'].forEach(k => qc.invalidateQueries({ queryKey: [k] }))
      onDone(`Assigned ${drivers.find(d => d.driverId === driverId)?.name ?? 'driver'} to the ${s.shiftType.toLowerCase()} shift on ${longDate(dayKey(s.date))}.`)
    },
  })
  const tone = SHIFT_TONE[s.shiftType]
  return (
    <div className="card p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={clsx('text-xs font-bold px-2.5 py-1 rounded-full', tone?.pill ?? 'bg-[#F1F5F9] text-[#475569]')}>{tone?.letter} {s.shiftType}</span>
          <span className="text-xs text-[#64748B]">{s.startTime}–{s.endTime}</span>
        </div>
        {s.note && <p className="text-xs text-[#64748B]">{s.note}</p>}
      </div>
      {assign.error && <Alert type="error" message={assign.error.message} />}
      <div className="flex flex-wrap gap-2">
        <select className="input flex-1 min-w-[180px]" value={driverId} onChange={e => setDriverId(e.target.value)} aria-label="Driver to assign">
          <option value="">Assign a driver…</option>
          {drivers.map(d => <option key={d.driverId} value={d.driverId}>{d.name}</option>)}
        </select>
        <button className="btn-primary text-sm" disabled={!driverId || assign.isPending} onClick={() => assign.mutate()}>
          {assign.isPending ? 'Assigning…' : 'Assign'}
        </button>
      </div>
    </div>
  )
}

export default function OpenShiftsPage() {
  const [filter, setFilter] = useState('All')
  const [flash, setFlash] = useState('')
  const open = useQuery({ queryKey: ['open-shifts'], queryFn: () => shiftApi.openShifts(), refetchInterval: 30000 })
  const driversQ = useQuery({ queryKey: ['roster-drivers'], queryFn: () => shiftApi.drivers() })
  const drivers = unwrap(driversQ.data)
  const all = unwrap(open.data)

  const visible = all.filter(s => filter === 'All' || s.shiftType === filter)
  const byDay = new Map()
  ;[...visible].sort((a, b) => dayKey(a.date).localeCompare(dayKey(b.date)) || a.shiftType.localeCompare(b.shiftType)).forEach(s => {
    const k = dayKey(s.date)
    if (!byDay.has(k)) byDay.set(k, [])
    byDay.get(k).push(s)
  })

  const thisWeek = all.filter(s => daysFromToday(dayKey(s.date)) <= 7).length
  const mornings = all.filter(s => s.shiftType === 'Morning').length

  return (
    <AppShell title="Open Shifts">
      <div className="page-header">
        <div>
          <h1 className="page-title">Open Shifts</h1>
          <p className="page-subtitle">Shifts left without a driver after approved leave. Assign someone to each one.</p>
        </div>
      </div>

      <RosterSubNav role="admin" />

      {flash && <div className="mb-5"><Alert type="success" message={flash} /></div>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard label="Open shifts" value={all.length} icon={UserX} color={all.length ? 'bg-[#DC2626]' : 'bg-[#16A34A]'} sub="Need a driver" />
        <StatCard label="Within 7 days" value={thisWeek} icon={CalendarClock} color={thisWeek ? 'bg-[#F59E0B]' : 'bg-[#64748B]'} sub="Fill these first" />
        <StatCard label="Morning / afternoon" value={`${mornings} / ${all.length - mornings}`} icon={mornings >= all.length - mornings ? Sun : Sunset} color="bg-[#1E63E9]" sub="Shift A / Shift B" />
      </div>

      {open.isLoading ? <PageLoader /> : open.error ? (
        <Alert type="error" message={`Could not load open shifts: ${open.error.message}`} />
      ) : all.length === 0 ? (
        <EmptyState icon={UserX} title="No open shifts" description="Shifts left unstaffed after approved leave appear here." />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={clsx('px-3 py-1 rounded-full text-xs font-semibold border',
                  filter === f ? 'bg-[#0A3D91] text-white border-[#0A3D91]' : 'bg-white text-[#334155] border-[#CBD5E1]')}>{f === 'All' ? 'All shifts' : f}</button>
            ))}
          </div>
          {[...byDay].map(([day, list]) => (
            <section key={day} className="space-y-2">
              <h2 className="text-sm font-bold text-[#0F172A]">{longDate(day)} <span className="font-normal text-xs text-[#64748B]">{relativeDay(day)}</span></h2>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
                {list.map(s => <OpenShiftRow key={s.id} s={s} drivers={drivers} onDone={setFlash} />)}
              </div>
            </section>
          ))}
        </div>
      )}
    </AppShell>
  )
}
