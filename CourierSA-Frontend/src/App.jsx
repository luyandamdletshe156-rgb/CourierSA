import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Avatar, LiveDot } from '@/components/ui'
import { useTracking } from '@/context/TrackingContext'
import {
  LayoutDashboard, Package, Truck, Users, FileText,
  BarChart3, Settings, LogOut, Bell, Menu, X,
  ClipboardCheck, Warehouse, ShieldCheck, MapPin,
  CreditCard, AlertTriangle, ChevronRight,
  PackageCheck, Search
} from 'lucide-react'
import clsx from 'clsx'

// ── Nav config per role ───────────────────────────────────────────────────────
const NAV = {
  Administrator: [
    { label: 'Dashboard',   icon: LayoutDashboard, to: '/admin/dashboard'   },
    { label: 'Parcels',     icon: Package,         to: '/admin/parcels'     },
    { label: 'Users',       icon: Users,           to: '/admin/users'       },
    { label: 'Vehicles',    icon: Truck,           to: '/admin/vehicles'    },
    { label: 'Reports',     icon: BarChart3,       to: '/admin/reports'     },
    { label: 'Audit Logs',  icon: ShieldCheck,     to: '/admin/audit-logs'  },
    { label: 'Settings',    icon: Settings,        to: '/admin/settings'    },
  ],
  Dispatcher: [
    { label: 'Dashboard',   icon: LayoutDashboard, to: '/dispatcher/dashboard' },
    { label: 'Pending',     icon: ClipboardCheck,  to: '/dispatcher/pending'   },
    { label: 'Dispatch',    icon: Truck,           to: '/dispatcher/dispatch'  },
    { label: 'Live Map',    icon: MapPin,          to: '/dispatcher/map'       },
    { label: 'Failed',      icon: AlertTriangle,   to: '/dispatcher/failed'    },
  ],
  WarehouseStaff: [
    { label: 'Dashboard',    icon: LayoutDashboard, to: '/warehouse/dashboard'   },
    { label: 'Check In',     icon: Warehouse,       to: '/warehouse/checkin'     },
    { label: 'Checkout',     icon: PackageCheck,    to: '/warehouse/checkout'    },
    { label: 'Inventory',    icon: Package,         to: '/warehouse/inventory'   },
    { label: 'Inspections',  icon: ClipboardCheck,  to: '/warehouse/inspections' },
    { label: 'Track Parcel', icon: Search,          to: '/warehouse/track'       },
  ],
  Driver: [
    { label: 'Dashboard',     icon: LayoutDashboard, to: '/driver/dashboard'   },
    { label: 'My Deliveries', icon: Truck,         to: '/driver/deliveries'    },
    { label: 'Route',         icon: MapPin,        to: '/driver/route'         },
    { label: 'History',       icon: FileText,      to: '/driver/history'       },
  ],
  Customer: [
    { label: 'Dashboard',   icon: LayoutDashboard, to: '/customer/dashboard'   },
    { label: 'My Parcels',  icon: Package,         to: '/customer/parcels'     },
    { label: 'Book Parcel', icon: Package,         to: '/customer/book'        },
    { label: 'Track',       icon: MapPin,          to: '/customer/track'       },
    { label: 'Wallet',      icon: CreditCard,      to: '/customer/wallet'      },
    { label: 'Claims',      icon: AlertTriangle,   to: '/customer/claims'      },
    { label: 'Invoices',    icon: FileText,        to: '/customer/invoices'    },
  ],
  BusinessClient: [
    { label: 'Dashboard',   icon: LayoutDashboard, to: '/business/dashboard'   },
    { label: 'Parcels',     icon: Package,         to: '/business/parcels'     },
    { label: 'Bulk Upload', icon: FileText,        to: '/business/bulk-upload' },
    { label: 'Invoices',    icon: FileText,        to: '/business/invoices'    },
    { label: 'Reports',     icon: BarChart3,       to: '/business/reports'     },
    { label: 'Wallet',      icon: CreditCard,      to: '/business/wallet'      },
  ],
}

const ROLE_LABELS = {
  Administrator:  'Administrator',
  Dispatcher:     'Dispatcher',
  WarehouseStaff: 'Warehouse',
  Driver:         'Driver',
  Customer:       'Customer',
  BusinessClient: 'Business Client',
}

const ROLE_COLORS = {
  Administrator:  'bg-purple-500',
  Dispatcher:     'bg-blue-500',
  WarehouseStaff: 'bg-teal-500',
  Driver:         'bg-amber-500',
  Customer:       'bg-brand-500',
  BusinessClient: 'bg-indigo-500',
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ open, onClose }) {
  const { user, logout } = useAuth()
  const { connected }    = useTracking() ?? {}
  const navigate         = useNavigate()
  const navItems         = NAV[user?.role] ?? []

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside className={clsx(
        'fixed inset-y-0 left-0 z-30 w-64 bg-sidebar flex flex-col',
        'transition-transform duration-200 ease-out lg:translate-x-0 lg:static lg:z-auto',
        open ? 'translate-x-0' : '-translate-x-full'
      )}>
        {/* Logo */}
        <div className="flex items-center justify-between h-16 px-5 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center">
              <Truck size={16} className="text-white" />
            </div>
            <span className="text-white font-bold text-lg tracking-tight">CourierSA</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white lg:hidden">
            <X size={18} />
          </button>
        </div>

        {/* Role badge */}
        <div className="px-4 py-3 border-b border-white/10">
          <span className={clsx(
            'inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full text-white',
            ROLE_COLORS[user?.role] ?? 'bg-gray-600'
          )}>
            <span className="w-1.5 h-1.5 rounded-full bg-white/70" />
            {ROLE_LABELS[user?.role]}
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto scrollbar-thin space-y-0.5">
          {navItems.map(({ label, icon: Icon, to }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) =>
                clsx('nav-item', isActive && 'nav-item-active')
              }
            >
              <Icon size={17} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Bottom: user + logout */}
        <div className="border-t border-white/10 p-4 space-y-3">
          {/* SignalR status */}
          <div className="flex items-center gap-2 px-1">
            <LiveDot active={connected} />
            <span className="text-xs text-gray-500">
              {connected ? 'Live updates on' : 'Connecting…'}
            </span>
          </div>

          <div className="flex items-center gap-3 px-1">
            <Avatar name={`${user?.firstName} ${user?.lastName}`} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="nav-item w-full text-red-400 hover:text-red-300 hover:bg-red-500/10"
          >
            <LogOut size={16} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>
    </>
  )
}

// ── Top bar ───────────────────────────────────────────────────────────────────
function TopBar({ onMenuClick, title }) {
  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-6 flex-shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="btn-ghost btn-sm lg:hidden"
        >
          <Menu size={20} />
        </button>
        {title && (
          <h1 className="text-base font-semibold text-gray-800 hidden sm:block">{title}</h1>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button className="btn-ghost btn-sm relative">
          <Bell size={18} />
          <span className="absolute top-1 right-1 w-2 h-2 bg-brand-500 rounded-full" />
        </button>
      </div>
    </header>
  )
}

// ── Shell layout ──────────────────────────────────────────────────────────────
export default function AppShell({ children, title }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen bg-canvas overflow-hidden">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar
          onMenuClick={() => setSidebarOpen(true)}
          title={title}
        />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  )
}