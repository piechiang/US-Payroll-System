import { Outlet, NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  Building2,
  DollarSign,
  CalendarDays,
  History,
  Settings,
} from 'lucide-react'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Employees', href: '/employees', icon: Users },
  { name: 'Companies', href: '/companies', icon: Building2 },
  { name: 'Pay Periods', href: '/pay-periods', icon: CalendarDays },
  { name: 'Run Payroll', href: '/payroll/run', icon: DollarSign },
  { name: 'Payroll History', href: '/payroll/history', icon: History },
]

export default function Layout() {
  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <div className="w-64 bg-gray-900 text-white">
        <div className="p-4">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-green-400" />
            US Payroll
          </h1>
        </div>

        <nav className="mt-8">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-gray-800 text-white border-l-4 border-primary-500'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              {item.name}
            </NavLink>
          ))}
        </nav>

        <div className="absolute bottom-0 w-64 p-4 border-t border-gray-700">
          <NavLink
            to="/settings"
            className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-300 hover:bg-gray-800 hover:text-white rounded-md transition-colors"
          >
            <Settings className="w-5 h-5" />
            Settings
          </NavLink>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200 px-6 py-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900">
              {/* Dynamic page title could go here */}
            </h2>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">Admin User</span>
              <div className="w-8 h-8 bg-primary-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                A
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
