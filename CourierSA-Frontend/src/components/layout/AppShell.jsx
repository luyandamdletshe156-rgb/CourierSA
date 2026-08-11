import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Avatar, LiveDot } from '@/components/ui'
import { useTracking } from '@/context/TrackingContext'
import {
  LayoutDashboard, Package, Truck, Users, FileText,
  BarChart3, Settings, LogOut, Bell, Menu, X,
  ClipboardCheck, ShieldCheck, ShieldAlert, MapPin,
  CreditCard, AlertTriangle, RefreshCw, PackageX, RotateCcw, HandCoins, Archive, Search
} from 'lucide-react'
import clsx from 'clsx'

const NAV = {
  Administrator: [
    { label: 'Dashboard',   icon: LayoutDashboard, to: '/admin/dashboard'   },
    { label: 'Parcels',     icon: Package,         to: '/admin/parcels'     },
    { label: 'Users',       icon: Users,           to: '/admin/users'       },
    { label: 'Vehicles',    icon: Truck,           to: '/admin/vehicles'    },
    { label: 'Lost Parcels',icon: PackageX,        to: '/admin/lost-parcels'},
    { label: 'Returns',     icon: HandCoins,       to: '/admin/returns/refunds' },
    { label: 'Reports',     icon: BarChart3,       to: '/admin/reports'     },
    { label: 'Audit Logs',  icon: ShieldCheck,     to: '/admin/audit-logs'  },
    { label: 'Settings',    icon: Settings,        to: '/admin/settings'    },
  ],
  WarehouseStaff: [
    { label: 'Dashboard',    icon: LayoutDashboard, to: '/warehouse/dashboard'  },
    { label: 'Inventory',    icon: Archive,         to: '/warehouse/inventory'  },
    { label: 'Processing',   icon: ClipboardCheck,  to: '/warehouse/inspections'},
    { label: 'Returns',      icon: RotateCcw,       to: '/warehouse/returns'    },
    { label: 'Track Parcel', icon: Search,          to: '/warehouse/track'      },
  ],
  // ... other roles (Customer, Driver, etc.)
}

const ROLE_LABELS = { Administrator: 'Administrator', WarehouseStaff: 'Warehouse' }
const ROLE_COLORS = { Administrator: 'bg-purple-500', WarehouseStaff: 'bg-teal-500' }

export default function AppShell({ children, title }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user, logout } = useAuth()
  const { connected } = useTracking() ?? {}
  const navigate = useNavigate()
  const navItems = NAV[user?.role] ?? []

  return (
    <div className="flex h-screen bg-canvas overflow-hidden">
      <aside className={clsx('fixed inset-y-0 left-0 z-30 w-64 bg-sidebar flex flex-col transition-transform lg:translate-x-0 lg:static', sidebarOpen ? 'translate-x-0' : '-translate-x-full')}>
        <div className="flex items-center justify-between h-16 px-5 border-b border-white/10">
          <span className="text-white font-bold text-lg">CourierSA</span>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-white"><X size={18} /></button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map(({ label, icon: Icon, to }) => (
            <NavLink key={to} to={to} className={({ isActive }) => clsx('nav-item', isActive && 'nav-item-active')}>
              <Icon size={17} /> <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-white/10 p-4 space-y-3">
          <button onClick={() => { logout(); navigate('/login') }} className="nav-item w-full text-red-400">
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden"><Menu size={20} /></button>
          <h1 className="text-base font-semibold">{title}</h1>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}