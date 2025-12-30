import { useEffect, useMemo, useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  Building2,
  DollarSign,
  History,
  Settings,
} from 'lucide-react'
import { api } from '../services/api'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Employees', href: '/employees', icon: Users },
  { name: 'Companies', href: '/companies', icon: Building2 },
  { name: 'Run Payroll', href: '/payroll/run', icon: DollarSign },
  { name: 'Payroll History', href: '/payroll/history', icon: History },
]

const TOKEN_KEY = 'token'
const USER_KEY = 'currentUser'
const COMPANY_KEY = 'activeCompanyId'

interface CompanyOption {
  id: string
  name: string
}

export default function Layout() {
  const navigate = useNavigate()
  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(
    localStorage.getItem(COMPANY_KEY)
  )
  const [userName, setUserName] = useState('User')

  const activeCompanyName = useMemo(() => {
    return companies.find(company => company.id === activeCompanyId)?.name || 'All Companies'
  }, [companies, activeCompanyId])

  useEffect(() => {
    const storedUser = localStorage.getItem(USER_KEY)
    if (storedUser) {
      try {
        const parsed = JSON.parse(storedUser)
        setUserName(parsed.firstName ? `${parsed.firstName} ${parsed.lastName}` : parsed.email || 'User')
      } catch {
        setUserName('User')
      }
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    api.get('/companies')
      .then((res) => {
        if (!isMounted) return
        const list = Array.isArray(res.data) ? res.data : res.data?.data || []
        setCompanies(list)

        if (!activeCompanyId && list.length > 0) {
          const defaultCompanyId = list[0].id
          setActiveCompanyId(defaultCompanyId)
          localStorage.setItem(COMPANY_KEY, defaultCompanyId)
        }
      })
      .catch(() => {})

    return () => {
      isMounted = false
    }
  }, [])

  const handleCompanyChange = (value: string) => {
    setActiveCompanyId(value)
    localStorage.setItem(COMPANY_KEY, value)
  }

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    localStorage.removeItem(COMPANY_KEY)
    navigate('/login')
  }

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
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span className="font-medium text-gray-500">Company:</span>
                <select
                  className="input py-2"
                  value={activeCompanyId || ''}
                  onChange={(event) => handleCompanyChange(event.target.value)}
                >
                  {companies.length === 0 ? (
                    <option value="">{activeCompanyName}</option>
                  ) : (
                    companies.map(company => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-sm text-gray-600">
                  <p className="font-medium">{userName}</p>
                  <button
                    type="button"
                    className="text-xs text-primary-600 hover:text-primary-700"
                    onClick={handleLogout}
                  >
                    Sign out
                  </button>
                </div>
                <div className="w-8 h-8 bg-primary-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                  {userName.charAt(0).toUpperCase()}
                </div>
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
