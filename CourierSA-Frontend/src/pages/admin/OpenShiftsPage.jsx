import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppShell from '@/components/layout/AppShell'
import SummaryLine from '@/components/roster/SummaryLine'
import { EmptyState, PageLoader, Alert } from '@/components/ui'
import { shiftApi } from '@/api'
import { unwrap, dayKey, daysFromToday, longDate, relativeDay } from '@/utils/roster'
import clsx from 'clsx'
import { UserX, CalendarDays, Clock } from 'lucide-react'

function OpenShiftCard({ s, drivers, onDone }) {
  const qc = useQueryClient()
  const [driverId, setDriverId] = useState('')
  
  const assign = useMutation({
    mutationFn: () => shiftApi.assignShift(s.id, driverId),
    onSuccess: () => {
      ;['open-shifts', 'roster'].forEach(k => qc.invalidateQueries({ queryKey: [k] }))
      onDone(`Assigned ${drivers.find(d => d.driverId === driverId)?.name} to the ${s.shiftType} shift.`)
    },
  })

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-blue-300 transition">
      
      {/* Info Block */}
      <div className="w-full sm:w-1/3 flex flex-col justify-center">
        <div className="flex items-center gap-3 mb-1">
          <span className={clsx("px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider", 
             s.shiftType === 'Morning' ? "bg-amber-100 text-amber-800" : "bg-indigo-100 text-indigo-800")}>
             {s.shiftType}
          </span>
        </div>
        <p className="text-slate-500 font-medium flex items-center gap-1.5 mt-2">
           <Clock size={16} className="text-slate-400" /> {s.startTime} – {s.endTime}
        </p>
        {s.note && <p className="text-sm text-slate-500 italic mt-2">"{s.note}"</p>}
      </div>

      {/* Assignment Block */}
      <div className="flex-1 flex flex-col sm:flex-row gap-3 items-end sm:items-center justify-end">
        <select className="input w-full sm:w-64 bg-slate-50 border-slate-200" value={driverId} onChange={e => setDriverId(e.target.value)}>
          <option value="">Select driver to assign...</option>
          {drivers.map(d => <option key={d.driverId} value={d.driverId}>{d.name}</option>)}
        </select>
        <button className="btn-primary w-full sm:w-auto py-2.5 px-6 whitespace-nowrap" disabled={!driverId || assign.isPending} onClick={() => assign.mutate()}>
          {assign.isPending ? 'Assigning…' : 'Assign Shift'}
        </button>
      </div>

      {assign.error && <div className="w-full mt-2"><Alert type="error" message={assign.error.message} /></div>}
    </div>
  )
}

export default function OpenShiftsPage() {
  const [flash, setFlash] = useState('')
  const open = useQuery({ queryKey: ['open-shifts'], queryFn: () => shiftApi.openShifts(), refetchInterval: 30000 })
  const driversQ = useQuery({ queryKey: ['roster-drivers'], queryFn: () => shiftApi.drivers() })
  
  const drivers = unwrap(driversQ.data) ?? []
  const all = unwrap(open.data) ?? []

  const byDay = new Map()
  all.sort((a, b) => dayKey(a.date).localeCompare(dayKey(b.date)) || a.shiftType.localeCompare(b.shiftType))
     .forEach(s => { const k = dayKey(s.date); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(s) })

  const thisWeek = all.filter(s => daysFromToday(dayKey(s.date)) <= 7).length

  return (
    <AppShell title="Open Shifts">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Open Shifts</h1>
        <p className="text-slate-500 mt-2 text-lg">Shifts left unstaffed (usually due to approved leave). Assign a driver to fill them.</p>
      </div>

      <SummaryLine items={[
        { value: all.length, label: 'Unassigned Shifts', tone: all.length ? 'bad' : 'good' },
        { value: thisWeek, label: 'Need Cover Within 7 Days', tone: thisWeek ? 'warn' : undefined },
      ]} />
      
      {flash && <div className="mb-6"><Alert type="success" message={flash} /></div>}

      {open.isLoading || driversQ.isLoading ? <PageLoader /> : open.error ? (
        <Alert type="error" message={open.error.message} />
      ) : all.length === 0 ? (
        <EmptyState icon={UserX} title="No open shifts" description="All scheduled shifts currently have a driver assigned." />
      ) : (
        <div className="space-y-10 animate-in fade-in max-w-4xl">
          {[...byDay].map(([day, list]) => (
            <section key={day} className="space-y-4">
              <h2 className="text-xl font-bold text-slate-800 border-b border-slate-200 pb-2 flex items-center gap-2">
                <CalendarDays size={20} className="text-blue-600" />
                {longDate(day)} 
                <span className="font-medium text-sm text-slate-400 ml-2 bg-slate-100 px-2 py-0.5 rounded-md">{relativeDay(day)}</span>
              </h2>
              <div className="space-y-3">
                 {list.map(s => <OpenShiftCard key={s.id} s={s} drivers={drivers} onDone={setFlash} />)}
              </div>
            </section>
          ))}
        </div>
      )}
    </AppShell>
  )
}