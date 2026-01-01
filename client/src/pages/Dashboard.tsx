import { Users, DollarSign, Calendar, Clock } from 'lucide-react'
import { Link } from 'react-router-dom'

const kpiCards = [
  {
    name: 'Next Pay Date',
    value: 'Oct 20, 2024',
    subtitle: 'In 3 days',
    icon: Calendar,
    color: 'bg-indigo-500',
    trend: null
  },
  {
    name: 'Total Payroll Cost',
    value: '$124,350.00',
    subtitle: 'Last period',
    icon: DollarSign,
    color: 'bg-emerald-500',
    trend: { value: '↑ 2%', positive: true }
  },
  {
    name: 'Active Employees',
    value: '42',
    subtitle: 'Currently employed',
    icon: Users,
    color: 'bg-blue-500',
    trend: { value: '↑ 3', positive: true }
  },
  {
    name: 'Pending Tasks',
    value: '5',
    subtitle: 'Require attention',
    icon: Clock,
    color: 'bg-amber-500',
    trend: null
  },
]

const recentActivity = [
  { action: 'Payroll run completed', employee: 'All employees', date: '2 days ago', status: 'success' },
  { action: 'New employee added', employee: 'John Doe', date: '3 days ago', status: 'info' },
  { action: 'W-2 forms generated', employee: 'Tax year 2023', date: '1 week ago', status: 'success' },
  { action: 'Employee updated', employee: 'Jane Smith', date: '1 week ago', status: 'info' },
]

export default function Dashboard() {
  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-600">
          Welcome back! Here's what's happening with your payroll today.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {kpiCards.map((kpi) => (
          <div key={kpi.name} className="bg-white overflow-hidden shadow-sm rounded-lg border border-slate-200">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className={`${kpi.color} rounded-md p-3`}>
                    <kpi.icon className="h-6 w-6 text-white" />
                  </div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-slate-500 truncate">{kpi.name}</dt>
                    <dd className="flex items-baseline">
                      <div className="text-2xl font-semibold text-slate-900">{kpi.value}</div>
                      {kpi.trend && (
                        <div className={`ml-2 flex items-baseline text-sm font-semibold ${
                          kpi.trend.positive ? 'text-emerald-600' : 'text-rose-600'
                        }`}>
                          {kpi.trend.value}
                        </div>
                      )}
                    </dd>
                    <dd className="text-xs text-slate-500 mt-1">{kpi.subtitle}</dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="bg-white shadow-sm rounded-lg border border-slate-200 p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/payroll/run"
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
          >
            <DollarSign className="mr-2 h-4 w-4" />
            Run Payroll
          </Link>
          <Link
            to="/employees/new"
            className="inline-flex items-center px-4 py-2 border border-slate-300 text-sm font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
          >
            <Users className="mr-2 h-4 w-4" />
            Add Employee
          </Link>
          <Link
            to="/w2"
            className="inline-flex items-center px-4 py-2 border border-slate-300 text-sm font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
          >
            Generate W-2s
          </Link>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white shadow-sm rounded-lg border border-slate-200">
        <div className="p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Recent Activity</h2>
          <div className="flow-root">
            <ul className="-mb-8">
              {recentActivity.map((activity, activityIdx) => (
                <li key={activityIdx}>
                  <div className="relative pb-8">
                    {activityIdx !== recentActivity.length - 1 && (
                      <span
                        className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-slate-200"
                        aria-hidden="true"
                      />
                    )}
                    <div className="relative flex space-x-3">
                      <div>
                        <span className={`h-8 w-8 rounded-full flex items-center justify-center ring-8 ring-white ${
                          activity.status === 'success' ? 'bg-emerald-100' : 'bg-blue-100'
                        }`}>
                          {activity.status === 'success' ? (
                            <DollarSign className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <Users className="h-4 w-4 text-blue-600" />
                          )}
                        </span>
                      </div>
                      <div className="flex min-w-0 flex-1 justify-between space-x-4 pt-1.5">
                        <div>
                          <p className="text-sm text-slate-900 font-medium">{activity.action}</p>
                          <p className="text-sm text-slate-500">{activity.employee}</p>
                        </div>
                        <div className="whitespace-nowrap text-right text-sm text-slate-500">
                          {activity.date}
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
