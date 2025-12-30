import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { CalendarDays, PlusCircle } from 'lucide-react'
import { api } from '../services/api'

interface Company {
  id: string
  name: string
}

interface PayPeriodSummary {
  id: string
  company: Company
  startDate: string
  endDate: string
  payDate: string
  status: string
  employeeCount: number
  totalGrossPay: number
  totalNetPay: number
}

export default function PayPeriods() {
  const [selectedCompany, setSelectedCompany] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [payDate, setPayDate] = useState('')
  const queryClient = useQueryClient()

  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ['companies'],
    queryFn: () => api.get('/companies').then(res => res.data)
  })

  const { data: payPeriodResponse, isLoading } = useQuery<{ payPeriods: PayPeriodSummary[] }>({
    queryKey: ['pay-periods', selectedCompany],
    queryFn: () => api.get('/pay-periods', {
      params: selectedCompany ? { companyId: selectedCompany } : undefined
    }).then(res => res.data)
  })

  const payPeriods = useMemo(() => payPeriodResponse?.payPeriods || [], [payPeriodResponse])

  const createPayPeriodMutation = useMutation({
    mutationFn: () => api.post('/pay-periods', {
      companyId: selectedCompany,
      startDate,
      endDate,
      payDate
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pay-periods'] })
      setStartDate('')
      setEndDate('')
      setPayDate('')
    }
  })

  const formatDate = (value: string) => new Date(value).toLocaleDateString('en-US')
  const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Pay Periods</h1>
        <p className="mt-1 text-sm text-gray-600">
          Manage payroll workflows by pay period.
        </p>
      </div>

      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <CalendarDays className="w-5 h-5 text-primary-600" />
          <h2 className="text-lg font-semibold">Create Pay Period</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="label">Company *</label>
            <select
              value={selectedCompany}
              onChange={(e) => setSelectedCompany(e.target.value)}
              className="input"
            >
              <option value="">Select a company</option>
              {companies.map(company => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Start Date *</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="label">End Date *</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="input"
            />
          </div>
          <div>
            <label className="label">Pay Date *</label>
            <input
              type="date"
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
              className="input"
            />
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <button
            className="btn-primary"
            onClick={() => createPayPeriodMutation.mutate()}
            disabled={!selectedCompany || !startDate || !endDate || !payDate || createPayPeriodMutation.isPending}
          >
            <PlusCircle className="w-4 h-4 mr-2" />
            {createPayPeriodMutation.isPending ? 'Creating...' : 'Create Pay Period'}
          </button>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Pay Period Workflow</h2>
          <span className="text-sm text-gray-500">{payPeriods.length} periods</span>
        </div>
        {isLoading ? (
          <p className="text-sm text-gray-500">Loading pay periods...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b text-sm text-gray-500">
                  <th className="text-left py-2">Company</th>
                  <th className="text-left py-2">Period</th>
                  <th className="text-left py-2">Pay Date</th>
                  <th className="text-left py-2">Status</th>
                  <th className="text-right py-2">Employees</th>
                  <th className="text-right py-2">Gross</th>
                  <th className="text-right py-2">Net</th>
                  <th className="text-right py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {payPeriods.map(period => (
                  <tr key={period.id} className="border-b text-sm">
                    <td className="py-3 font-medium text-gray-900">{period.company.name}</td>
                    <td className="py-3">
                      {formatDate(period.startDate)} - {formatDate(period.endDate)}
                    </td>
                    <td className="py-3">{formatDate(period.payDate)}</td>
                    <td className="py-3">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
                        {period.status}
                      </span>
                    </td>
                    <td className="py-3 text-right">{period.employeeCount}</td>
                    <td className="py-3 text-right">{formatCurrency(period.totalGrossPay)}</td>
                    <td className="py-3 text-right">{formatCurrency(period.totalNetPay)}</td>
                    <td className="py-3 text-right">
                      <Link to={`/pay-periods/${period.id}`} className="text-primary-600 font-medium hover:underline">
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
