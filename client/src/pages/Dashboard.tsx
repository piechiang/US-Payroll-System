import { Users, Building2, DollarSign, TrendingUp } from 'lucide-react'

const stats = [
  { name: 'Total Employees', value: '0', icon: Users, color: 'bg-blue-500' },
  { name: 'Active Companies', value: '0', icon: Building2, color: 'bg-green-500' },
  { name: 'Total Payroll (YTD)', value: '$0', icon: DollarSign, color: 'bg-purple-500' },
  { name: 'Avg. Payroll/Month', value: '$0', icon: TrendingUp, color: 'bg-orange-500' },
]

export default function Dashboard() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-600">
          Welcome to your payroll management system.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        {stats.map((stat) => (
          <div key={stat.name} className="card">
            <div className="flex items-center">
              <div className={`p-3 rounded-lg ${stat.color}`}>
                <stat.icon className="w-6 h-6 text-white" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-500">{stat.name}</p>
                <p className="text-2xl font-semibold text-gray-900">{stat.value}</p>
              </div>
            </div>
          </div>
        ))}
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
          <a href="/companies" className="btn-secondary">
            Manage Companies
          </a>
        </div>
      </div>

      {/* Getting Started */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Getting Started</h2>
        <ol className="list-decimal list-inside space-y-2 text-gray-600">
          <li>Add a company with tax registration information</li>
          <li>Add employees with their W-4 details</li>
          <li>Run your first payroll</li>
          <li>Review and approve pay stubs</li>
        </ol>
      </div>
    </div>
  )
}
