import { useEffect, useState } from 'react'
import { Users, Building2, DollarSign, TrendingUp, AlertCircle, Calendar, RefreshCw } from 'lucide-react'
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'
import api from '../services/api'

interface DashboardStats {
  employees: {
    total: number
    active: number
    inactive: number
    recentHires: number
  }
  companies: {
    total: number
    active: number
  }
  payroll: {
    totalYTD: number
    currentMonth: number
    lastMonth: number
    averagePerMonth: number
    pendingApproval: number
  }
  taxes: {
    totalYTD: number
    federal: number
    state: number
    fica: number
    employer: number
  }
  trends: {
    last6Months: Array<{
      month: string
      grossPay: number
      netPay: number
      taxes: number
    }>
  }
  recentActivity: Array<{
    type: 'payroll' | 'employee' | 'company'
    description: string
    date: string
    id: string
  }>
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [companyId, setCompanyId] = useState<string>('')

  // Get company ID from localStorage or fetch first company
  useEffect(() => {
    const fetchCompanyId = async () => {
      try {
        // Try to get from localStorage first
        const savedCompanyId = localStorage.getItem('selectedCompanyId')
        if (savedCompanyId) {
          setCompanyId(savedCompanyId)
          return
        }

        // Otherwise fetch companies and use the first one
        const response = await api.get('/companies')
        if (response.data && response.data.length > 0) {
          const firstCompanyId = response.data[0].id
          setCompanyId(firstCompanyId)
          localStorage.setItem('selectedCompanyId', firstCompanyId)
        }
      } catch (err) {
        console.error('Failed to fetch company:', err)
      }
    }

    fetchCompanyId()
  }, [])

  // Fetch dashboard stats
  useEffect(() => {
    if (!companyId) return

    const fetchStats = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await api.get(`/dashboard/stats?companyId=${companyId}`)
        setStats(response.data)
      } catch (err: any) {
        console.error('Failed to fetch dashboard stats:', err)
        setError(err.response?.data?.error || 'Failed to load dashboard data')
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [companyId])

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
        <span className="ml-2 text-gray-600">Loading dashboard...</span>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="card bg-red-50 border-red-200">
        <div className="flex items-center text-red-800">
          <AlertCircle className="w-5 h-5 mr-2" />
          <span>{error}</span>
        </div>
      </div>
    )
  }

  // No data state
  if (!stats) {
    return (
      <div className="card">
        <div className="text-center py-8">
          <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Company Selected</h3>
          <p className="text-gray-600 mb-4">Please add a company to get started.</p>
          <a href="/companies" className="btn-primary">
            Add Company
          </a>
        </div>
      </div>
    )
  }

  // Prepare tax breakdown data for pie chart
  const taxBreakdownData = [
    { name: 'Federal Tax', value: stats.taxes.federal, color: '#3b82f6' },
    { name: 'State Tax', value: stats.taxes.state, color: '#10b981' },
    { name: 'FICA', value: stats.taxes.fica, color: '#f59e0b' },
    { name: 'Employer Tax', value: stats.taxes.employer, color: '#8b5cf6' },
  ].filter(item => item.value > 0)

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-600">
          Welcome to your payroll management system. Here's your overview.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <div className="card">
          <div className="flex items-center">
            <div className="p-3 rounded-lg bg-blue-500">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Total Employees</p>
              <p className="text-2xl font-semibold text-gray-900">{stats.employees.total}</p>
              <p className="text-xs text-gray-500 mt-1">
                {stats.employees.active} active, {stats.employees.inactive} inactive
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="p-3 rounded-lg bg-green-500">
              <DollarSign className="w-6 h-6 text-white" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Total Payroll (YTD)</p>
              <p className="text-2xl font-semibold text-gray-900">
                {formatCurrency(stats.payroll.totalYTD)}
              </p>
              <p className="text-xs text-gray-500 mt-1">Year to date</p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="p-3 rounded-lg bg-purple-500">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Avg. Payroll/Month</p>
              <p className="text-2xl font-semibold text-gray-900">
                {formatCurrency(stats.payroll.averagePerMonth)}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                This month: {formatCurrency(stats.payroll.currentMonth)}
              </p>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center">
            <div className="p-3 rounded-lg bg-orange-500">
              <Calendar className="w-6 h-6 text-white" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500">Pending Approval</p>
              <p className="text-2xl font-semibold text-gray-900">
                {stats.payroll.pendingApproval}
              </p>
              <p className="text-xs text-gray-500 mt-1">Payroll periods</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Payroll Trend Chart */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Payroll Trends (6 Months)</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={stats.trends.last6Months}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip
                formatter={(value: number | undefined) => formatCurrency(value || 0)}
                contentStyle={{ backgroundColor: 'white', border: '1px solid #ccc' }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="grossPay"
                stroke="#3b82f6"
                name="Gross Pay"
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="netPay"
                stroke="#10b981"
                name="Net Pay"
                strokeWidth={2}
              />
              <Line
                type="monotone"
                dataKey="taxes"
                stroke="#f59e0b"
                name="Taxes"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Tax Breakdown Chart */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Tax Breakdown (YTD)</h2>
          {taxBreakdownData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={taxBreakdownData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name}: ${formatCurrency(entry.value)}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {taxBreakdownData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number | undefined) => formatCurrency(value || 0)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[300px] text-gray-500">
              No tax data available yet
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-4">
          <a href="/employees/new" className="btn-primary">
            Add Employee
          </a>
          <a href="/payroll/run" className="btn-primary">
            Run Payroll
          </a>
          {stats.payroll.pendingApproval > 0 && (
            <a href="/payroll/history" className="btn-secondary">
              Review Pending ({stats.payroll.pendingApproval})
            </a>
          )}
          <a href="/companies" className="btn-secondary">
            Manage Companies
          </a>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h2>
        {stats.recentActivity.length > 0 ? (
          <div className="space-y-3">
            {stats.recentActivity.slice(0, 10).map((activity, index) => (
              <div
                key={index}
                className="flex items-center justify-between py-2 border-b last:border-b-0"
              >
                <div className="flex items-center">
                  <div
                    className={`w-2 h-2 rounded-full mr-3 ${
                      activity.type === 'payroll'
                        ? 'bg-green-500'
                        : activity.type === 'employee'
                        ? 'bg-blue-500'
                        : 'bg-purple-500'
                    }`}
                  />
                  <span className="text-sm text-gray-700">{activity.description}</span>
                </div>
                <span className="text-xs text-gray-500">
                  {new Date(activity.date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <Calendar className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No recent activity</p>
          </div>
        )}
      </div>

      {/* Getting Started (show if no employees) */}
      {stats.employees.total === 0 && (
        <div className="card mt-8 bg-blue-50 border-blue-200">
          <h2 className="text-lg font-semibold text-blue-900 mb-4">Getting Started</h2>
          <ol className="list-decimal list-inside space-y-2 text-blue-800">
            <li>Add a company with tax registration information</li>
            <li>Add employees with their W-4 details</li>
            <li>Run your first payroll</li>
            <li>Review and approve pay stubs</li>
          </ol>
        </div>
      )}
    </div>
  )
}
