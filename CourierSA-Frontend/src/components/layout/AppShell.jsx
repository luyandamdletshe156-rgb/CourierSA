import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Avatar, LiveDot } from '@/components/ui'
import { useTracking } from '@/context/TrackingContext'
import {
  LayoutDashboard, Package, Truck, Users, FileText,
  BarChart3, Settings, LogOut, Bell, Menu, X,
  ClipboardCheck, MapPin, CreditCard, AlertTriangle, 
  RefreshCw, PackageX, RotateCcw, HandCoins, Archive, Search
} from 'lucide-react'
import clsx from 'clsx'

// ── Nav config for all roles ──────────────────────────────────────────────────
const NAV = {
  Administrator: [
    { label: 'Dashboard',   icon: LayoutDashboard, to: '/admin/dashboard'   },
    { label: 'Parcels',     icon: Package,         to: '/admin/parcels'     },
    { label: 'Users',       icon: Users,           to: '/admin/users'       },
    { label: 'Vehicles',    icon: Truck,           to: '/admin/vehicles'    },
    { label: 'Lost Parcels',icon: PackageX,        to: '/admin/lost-parcels'},
    { label: 'Refunds',     icon: HandCoins,       to: '/admin/returns/refunds' },
    { label: 'Reports',     icon: BarChart3,       to: '/admin/reports'     },
    { label: 'Audit Logs',  icon: FileText,        to: '/admin/audit-logs'  },
    { label: 'Settings',    icon: Settings,        to: '/admin/settings'    },
  ],
  WarehouseStaff: [
    { label: 'Dashboard',    icon: LayoutDashboard, to: '/warehouse/dashboard'  },
    { label: 'Inventory',    icon: Archive,         to: '/warehouse/inventory'  },
    { label: 'Processing',   icon: ClipboardCheck,  to: '/warehouse/inspections'},
    { label: 'Returns',      icon: RotateCcw,       to: '/warehouse/returns'    },
    { label: 'Track Parcel', icon: Search,          to: '/warehouse/track'      },
  ],
  Customer: [
    { label: 'Dashboard',    icon: LayoutDashboard, to: '/customer/dashboard'   },
    { label: 'My Parcels',   icon: Package,         to: '/customer/parcels'     },
    { label: 'Book Parcel',  icon: Package,         to: '/customer/book'        },
    { label: 'Track',        icon: MapPin,          to: '/customer/track'       },
    { label: 'Lost Parcel',  icon: PackageX,        to: '/customer/lost-parcels'},
    { label: 'Returns',      icon: RotateCcw,       to: '/customer/returns'     },
    { label: 'Wallet',       icon: CreditCard,      to: '/customer/wallet'      },
    { label: 'Claims',       icon: AlertTriangle,   to: '/customer/claims'      },
  ],
  Driver: [
    { label: 'Dashboard',     icon: LayoutDashboard, to: '/driver/dashboard'   },
    { label: 'My Deliveries', icon: Truck,           to: '/driver/deliveries'  },
    { label: 'History',       icon: FileText,        to: '/driver/history'     },
  ]
}

const ROLE_LABELS = { 
  Administrator: 'Administrator', 
  WarehouseStaff: 'Warehouse', 
  Customer: 'Customer', 
  Driver: 'Driver' 
}

const ROLE_COLORS = { 
  Administrator: 'bg-purple-500', 
  WarehouseStaff: 'bg-teal-500', 
  Customer: 'bg-blue-600', 
  Driver: 'bg-amber-500' 
}

export default function AppShell({ children, title }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { user, logout } = useAuth()
  const { connected } = useTracking() ?? {}
  const navigate = useNavigate()
  
  // Safeguard: fallback to an empty array if role is unknown
  const navItems = NAV[user?.role] ?? []

  return (
    <div className="flex h-screen bg-canvas overflow-hidden">
      {/* Sidebar */}
      <aside className={clsx(
        'fixed inset-y-0 left-0 z-30 w-64 bg-[#0F172A] flex flex-col transition-transform lg:translate-x-0 lg:static', 
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <div className="flex items-center justify-between h-16 px-5 border-b border-white/10">
          <span className="text-white font-bold text-lg">CourierSA</span>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-white"><X size={18} /></button>
        </div>

        {/* Role Badge */}
        <div className="px-5 py-4">
          <span className={clsx('inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full text-white uppercase tracking-wider', ROLE_COLORS[user?.role] ?? 'bg-gray-600')}>
            {ROLE_LABELS[user?.role] ?? 'User'}
          </span>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
          {navItems.map(({ label, icon: Icon, to }) => (
            <NavLink key={to} to={to} className={({ isActive }) => clsx('nav-item flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg transition-colors', isActive ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-white hover:bg-white/5')}>
              <Icon size={18} /> <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User Footer */}
        <div className="border-t border-white/10 p-4 space-y-4">
          <div className="flex items-center gap-3 px-1">
            <Avatar name={`${user?.firstName} ${user?.lastName}`} size="sm" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.firstName}</p>
              <p className="text-[10px] text-gray-500 truncate">{user?.email}</p>
            </div>
          </div>
          <button onClick={() => { logout(); navigate('/login') }} className="flex items-center gap-3 w-full text-xs text-red-400 hover:text-red-300">
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden"><Menu size={20} /></button>
          <h1 className="text-sm font-bold text-gray-800">{title}</h1>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  )
}