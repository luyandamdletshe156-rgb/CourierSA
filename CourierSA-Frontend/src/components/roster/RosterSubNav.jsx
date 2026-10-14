import { NavLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { shiftApi } from '@/api'
import { unwrap } from '@/utils/roster'
import clsx from 'clsx'

// Page switcher shown at the top of every roster page, so each activity has its own page
// but the admin or driver can still hop between them in one click.

const ADMIN_LINKS = [
  { to: '/admin/roster', label: 'Roster planner', key: null },
  { to: '/admin/leave', label: 'Leave requests', key: 'leave' },
  { to: '/admin/swaps', label: 'Shift swaps', key: 'swaps' },
  { to: '/admin/open-shifts', label: 'Open shifts', key: 'open' },
]
const DRIVER_LINKS = [
  { to: '/driver/schedule', label: 'My schedule', key: null },
  { to: '/driver/leave', label: 'Request leave', key: null },
  { to: '/driver/requests', label: 'My requests', key: 'reply' },
]

export default function RosterSubNav({ role }) {
  const admin = role === 'admin'
  const leave = useQuery({ queryKey: ['pending-leave'], queryFn: () => shiftApi.pendingLeave(), enabled: admin, refetchInterval: 30000 })
  const swaps = useQuery({ queryKey: ['pending-swaps'], queryFn: () => shiftApi.pendingSwaps(), enabled: admin, refetchInterval: 30000 })
  const open = useQuery({ queryKey: ['open-shifts'], queryFn: () => shiftApi.openShifts(), enabled: admin, refetchInterval: 30000 })
  const mySwaps = useQuery({ queryKey: ['my-swaps'], queryFn: () => shiftApi.mySwaps(), enabled: !admin })

  const counts = admin
    ? { leave: unwrap(leave.data).length, swaps: unwrap(swaps.data).length, open: unwrap(open.data).length }
    : { reply: unwrap(mySwaps.data).filter(w => w.awaitingMyReply).length }

  return (
    <nav aria-label="Roster pages" className="flex flex-wrap gap-2 mb-6">
      {(admin ? ADMIN_LINKS : DRIVER_LINKS).map(l => {
        const n = l.key ? counts[l.key] : 0
        return (
          <NavLink key={l.to} to={l.to} end
            className={({ isActive }) => clsx(
              'inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-semibold border transition',
              isActive ? 'bg-[#0A3D91] text-white border-[#0A3D91]' : 'bg-white text-[#334155] border-[#CBD5E1] hover:border-[#1E63E9]')}>
            {l.label}
            {n > 0 && <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-[#F59E0B] text-white">{n}</span>}
          </NavLink>
        )
      })}
    </nav>
  )
}
