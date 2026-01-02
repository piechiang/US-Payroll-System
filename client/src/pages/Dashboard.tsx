import { Users, DollarSign, Calendar, Clock, Banknote, Bell, TrendingUp, CheckCircle, AlertCircle } from 'lucide-react'
import { Link } from 'react-router-dom'
import React, { useState } from 'react'

interface StatCardProps {
  title: string
  value: string
  subtext: string
  trend?: 'up' | 'down' | 'neutral'
  icon: React.ElementType
  color: string
}

const StatCard: React.FC<StatCardProps> = ({ title, value, subtext, trend, icon: Icon, color }) => (
  <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm flex items-start justify-between hover:shadow-md transition-shadow">
    <div>
      <p className="text-slate-500 text-sm font-medium mb-1">{title}</p>
      <h3 className="text-2xl font-bold text-slate-900">{value}</h3>
      <p className={`text-xs mt-2 font-medium flex items-center gap-1 ${
        trend === 'up' ? 'text-emerald-600' :
        trend === 'down' ? 'text-red-600' :
        'text-slate-400'
      }`}>
        {trend === 'up' && <TrendingUp size={12} />}
        {subtext}
      </p>
    </div>
    <div className={`p-3 rounded-lg ${color}`}>
      <Icon size={24} className="text-white" />
    </div>
  </div>
)

const kpiCards = [
  {
    name: 'Estimated Monthly Cost',
    value: '$124,350.00',
    subtitle: 'Up 2.5% from last month',
    icon: DollarSign,
    color: 'bg-indigo-500',
    trend: 'up' as const
  },
  {
    name: 'Next Pay Date',
    value: 'Nov 15, 2024',
    subtitle: '5 days remaining',
    icon: Calendar,
    color: 'bg-blue-500',
    trend: 'neutral' as const
  },
  {
    name: 'Active Employees',
    value: '142',
    subtitle: 'Added 3 this month',
    icon: Users,
    color: 'bg-emerald-500',
    trend: 'up' as const
  },
  {
    name: 'Pending Tasks',
    value: '5',
    subtitle: 'Require attention',
    icon: Clock,
    color: 'bg-amber-500',
    trend: 'neutral' as const
  },
]

const recentActivity = [
  { id: 1, action: 'Completed October payroll run', time: '2 hours ago', user: 'System', status: 'success' },
  { id: 2, action: 'New employee: John Doe added', time: 'Yesterday', user: 'HR Manager', status: 'info' },
  { id: 3, action: 'Updated tax compliance settings', time: '3 days ago', user: 'Finance', status: 'success' },
  { id: 4, action: 'Generated W-2 forms for 2023', time: '1 week ago', user: 'System', status: 'success' },
]

export default function Dashboard() {
  const [chartData] = useState([40, 65, 55, 80, 70, 90])

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Welcome Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Welcome, HR Admin 👋
          </h1>
          <p className="text-slate-500 mt-1">
            Here's your payroll overview for this month.
          </p>
        </div>
        <Link
          to="/payroll/run"
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg font-medium flex items-center shadow-md shadow-indigo-200 transition-all hover:shadow-lg hover:shadow-indigo-300"
        >
          <Banknote size={18} className="mr-2" />
          Run Payroll
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpiCards.map((kpi) => (
          <StatCard
            key={kpi.name}
            title={kpi.name}
            value={kpi.value}
            subtext={kpi.subtitle}
            trend={kpi.trend}
            icon={kpi.icon}
            color={kpi.color}
          />
        ))}
      </div>

      {/* Chart and Activity Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Payroll Trend Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex justify-between items-center mb-6">
            <h3 className="font-bold text-slate-900">Payroll Cost Trend</h3>
            <select className="text-sm border-none bg-slate-50 rounded-md px-2 py-1 text-slate-600 focus:ring-0 cursor-pointer">
              <option>Last 6 months</option>
              <option>Last 12 months</option>
              <option>This year</option>
            </select>
          </div>

          {/* Simple Bar Chart */}
          <div className="h-64 flex items-end justify-between space-x-2 px-4">
            {chartData.map((height, index) => (
              <div key={index} className="w-full bg-indigo-50 rounded-t-md relative group">
                <div
                  className="absolute bottom-0 w-full bg-indigo-500 rounded-t-md transition-all duration-500 group-hover:bg-indigo-600 cursor-pointer"
                  style={{ height: `${height}%` }}
                >
                  <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                    ${(height * 15).toFixed(0)}k
                  </div>
                </div>
                <div className="absolute -bottom-6 w-full text-center text-xs text-slate-400">
                  {['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'][index]}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Activity Feed */}
        <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
          <h3 className="font-bold text-slate-900 mb-4">Recent Activity</h3>
          <div className="space-y-4">
            {recentActivity.map((activity) => (
              <div key={activity.id} className="flex items-start space-x-3 pb-4 border-b border-slate-50 last:border-0 last:pb-0">
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 flex-shrink-0">
                  <Bell size={14} />
                </div>
                <div>
                  <p className="text-sm text-slate-800 font-medium">{activity.action}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {activity.time} • {activity.user}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <button className="w-full mt-4 text-sm text-indigo-600 font-medium hover:text-indigo-700 transition-colors">
            View all activity
          </button>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm">
        <h3 className="font-bold text-slate-900 mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Link
            to="/employees/new"
            className="flex items-center space-x-3 p-4 border border-slate-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors group"
          >
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center group-hover:bg-blue-200 transition-colors">
              <Users size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="font-medium text-slate-900 text-sm">Add Employee</p>
              <p className="text-xs text-slate-500">Create new profile</p>
            </div>
          </Link>

          <Link
            to="/payroll/run"
            className="flex items-center space-x-3 p-4 border border-slate-200 rounded-lg hover:border-emerald-300 hover:bg-emerald-50 transition-colors group"
          >
            <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center group-hover:bg-emerald-200 transition-colors">
              <Banknote size={20} className="text-emerald-600" />
            </div>
            <div>
              <p className="font-medium text-slate-900 text-sm">Run Payroll</p>
              <p className="text-xs text-slate-500">Process payments</p>
            </div>
          </Link>

          <Link
            to="/payroll/history"
            className="flex items-center space-x-3 p-4 border border-slate-200 rounded-lg hover:border-purple-300 hover:bg-purple-50 transition-colors group"
          >
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center group-hover:bg-purple-200 transition-colors">
              <CheckCircle size={20} className="text-purple-600" />
            </div>
            <div>
              <p className="font-medium text-slate-900 text-sm">View History</p>
              <p className="text-xs text-slate-500">Past payroll runs</p>
            </div>
          </Link>

          <Link
            to="/w2"
            className="flex items-center space-x-3 p-4 border border-slate-200 rounded-lg hover:border-amber-300 hover:bg-amber-50 transition-colors group"
          >
            <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center group-hover:bg-amber-200 transition-colors">
              <AlertCircle size={20} className="text-amber-600" />
            </div>
            <div>
              <p className="font-medium text-slate-900 text-sm">Generate W-2</p>
              <p className="text-xs text-slate-500">Tax documents</p>
            </div>
          </Link>
        </div>
      </div>

      {/* Upcoming Deadlines */}
      <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-6 rounded-xl shadow-lg text-white">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center space-x-2 mb-2">
              <Clock size={20} />
              <h3 className="font-bold">Upcoming Deadline</h3>
            </div>
            <p className="text-indigo-100 text-sm mb-4">
              Next payroll run must be completed by November 13, 2024 at 5:00 PM
            </p>
            <Link
              to="/payroll/run"
              className="inline-flex items-center px-4 py-2 bg-white text-indigo-600 rounded-lg font-medium text-sm hover:bg-indigo-50 transition-colors"
            >
              Start Payroll Run
            </Link>
          </div>
          <div className="bg-white/20 backdrop-blur-sm rounded-lg px-4 py-2 text-center">
            <div className="text-3xl font-bold">5</div>
            <div className="text-xs text-indigo-100">Days Left</div>
          </div>
        </div>
      </div>
    </div>
  )
}
