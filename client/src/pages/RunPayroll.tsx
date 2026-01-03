import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { DollarSign, Calculator, Check } from 'lucide-react'
import { api } from '../services/api'

interface Employee {
  id: string
  firstName: string
  lastName: string
  payType: 'HOURLY' | 'SALARY'
  payRate: string
}

interface EmployeesResponse {
  data: Employee[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNext: boolean
    hasPrev: boolean
  }
}

interface PayrollPreview {
  employee: { id: string; name: string }
  earnings: {
    regularHours: number
    overtimeHours: number
    regularPay: number
    overtimePay: number
    bonus: number
    commission: number
    grossPay: number
  }
  taxes: {
    federal: {
      incomeTax: number
      socialSecurity: number
      medicare: number
      total: number
    }
    state: {
      incomeTax: number
      sdi: number
      total: number
    }
  }
  totalDeductions: number
  netPay: number
}

export default function RunPayroll() {
  const [selectedCompany, setSelectedCompany] = useState('')
  const [payPeriodStart, setPayPeriodStart] = useState('')
  const [payPeriodEnd, setPayPeriodEnd] = useState('')
  const [payDate, setPayDate] = useState('')
  const [employeeHours, setEmployeeHours] = useState<Record<string, { hours: number; overtime: number }>>({})
  const [previews, setPreviews] = useState<PayrollPreview[]>([])
  const [step, setStep] = useState<'setup' | 'preview' | 'complete'>('setup')

  // Fetch companies
  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: () => api.get('/companies').then(res => res.data)
  })

  // Fetch employees for selected company
  const { data: employeesResponse } = useQuery<EmployeesResponse>({
    queryKey: ['employees', selectedCompany],
    queryFn: () => api.get(`/employees?companyId=${selectedCompany}`).then(res => res.data),
    enabled: !!selectedCompany
  })

  const employees = employeesResponse?.data || []

  // Calculate preview mutation
  const calculateMutation = useMutation({
    mutationFn: async () => {
      const results: PayrollPreview[] = []
      for (const employee of employees) {
        const hours = employeeHours[employee.id] || { hours: 0, overtime: 0 }
        const response = await api.post('/payroll/calculate', {
          employeeId: employee.id,
          payPeriodStart,
          payPeriodEnd,
          hoursWorked: hours.hours,
          overtimeHours: hours.overtime,
        })
        results.push(response.data)
      }
      return results
    },
    onSuccess: (data) => {
      setPreviews(data)
      setStep('preview')
    }
  })

  // Run payroll mutation
  const runPayrollMutation = useMutation({
    mutationFn: () => api.post('/payroll/run', {
      companyId: selectedCompany,
      payPeriodStart,
      payPeriodEnd,
      payDate,
      employeePayData: employees.map(emp => ({
        employeeId: emp.id,
        hoursWorked: employeeHours[emp.id]?.hours || 0,
        overtimeHours: employeeHours[emp.id]?.overtime || 0,
      }))
    }),
    onSuccess: () => {
      setStep('complete')
    }
  })

  const handleHoursChange = (employeeId: string, field: 'hours' | 'overtime', value: number) => {
    setEmployeeHours(prev => ({
      ...prev,
      [employeeId]: {
        ...prev[employeeId],
        [field]: value
      }
    }))
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount)
  }

  const totalGross = previews.reduce((sum, p) => sum + p.earnings.grossPay, 0)
  const totalNet = previews.reduce((sum, p) => sum + p.netPay, 0)
  const totalDeductions = previews.reduce((sum, p) => sum + p.totalDeductions, 0)

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Run Payroll</h1>
        <p className="mt-1 text-sm text-gray-600">
          Process payroll for your employees.
        </p>
      </div>

      {step === 'setup' && (
        <div className="space-y-6">
          {/* Setup Card */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-4">Payroll Setup</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="label">Company *</label>
                <select
                  value={selectedCompany}
                  onChange={(e) => setSelectedCompany(e.target.value)}
                  className="input"
                >
                  <option value="">Select a company</option>
                  {companies.map((company: { id: string; name: string }) => (
                    <option key={company.id} value={company.id}>{company.name}</option>
                  ))}
                </select>
              </div>
              <div />
              <div>
                <label className="label">Pay Period Start *</label>
                <input
                  type="date"
                  value={payPeriodStart}
                  onChange={(e) => setPayPeriodStart(e.target.value)}
                  className="input"
                />
              </div>
              <div>
                <label className="label">Pay Period End *</label>
                <input
                  type="date"
                  value={payPeriodEnd}
                  onChange={(e) => setPayPeriodEnd(e.target.value)}
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
          </div>

          {/* Employee Hours */}
          {employees.length > 0 && (
            <div className="card">
              <h2 className="text-lg font-semibold mb-4">Employee Hours</h2>
              <table className="min-w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Employee</th>
                    <th className="text-left py-2">Pay Type</th>
                    <th className="text-left py-2">Rate</th>
                    <th className="text-left py-2">Regular Hours</th>
                    <th className="text-left py-2">Overtime Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((emp) => (
                    <tr key={emp.id} className="border-b">
                      <td className="py-3 font-medium">{emp.firstName} {emp.lastName}</td>
                      <td className="py-3">{emp.payType}</td>
                      <td className="py-3">
                        {emp.payType === 'HOURLY'
                          ? `$${parseFloat(emp.payRate).toFixed(2)}/hr`
                          : `$${parseFloat(emp.payRate).toLocaleString()}/yr`
                        }
                      </td>
                      <td className="py-3">
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={employeeHours[emp.id]?.hours || (emp.payType === 'SALARY' ? 80 : 0)}
                          onChange={(e) => handleHoursChange(emp.id, 'hours', parseFloat(e.target.value) || 0)}
                          className="input w-24"
                          disabled={emp.payType === 'SALARY'}
                        />
                      </td>
                      <td className="py-3">
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={employeeHours[emp.id]?.overtime || 0}
                          onChange={(e) => handleHoursChange(emp.id, 'overtime', parseFloat(e.target.value) || 0)}
                          className="input w-24"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={() => calculateMutation.mutate()}
              disabled={!selectedCompany || !payPeriodStart || !payPeriodEnd || !payDate || calculateMutation.isPending}
              className="btn-primary"
            >
              <Calculator className="w-4 h-4 mr-2" />
              {calculateMutation.isPending ? 'Calculating...' : 'Calculate Payroll'}
            </button>
          </div>
        </div>
      )}

      {step === 'preview' && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-6">
            <div className="card text-center">
              <p className="text-sm text-gray-500">Total Gross Pay</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalGross)}</p>
            </div>
          <div className="card text-center">
            <p className="text-sm text-gray-500">Total Deductions</p>
            <p className="text-2xl font-bold text-red-600">{formatCurrency(totalDeductions)}</p>
          </div>
            <div className="card text-center">
              <p className="text-sm text-gray-500">Total Net Pay</p>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(totalNet)}</p>
            </div>
          </div>

          {/* Preview Table */}
          <div className="card overflow-x-auto">
            <h2 className="text-lg font-semibold mb-4">Payroll Preview</h2>
            <table className="min-w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Employee</th>
                  <th className="text-right py-2">Gross Pay</th>
                  <th className="text-right py-2">Federal Tax</th>
                  <th className="text-right py-2">SS Tax</th>
                  <th className="text-right py-2">Medicare</th>
                  <th className="text-right py-2">State Tax</th>
                  <th className="text-right py-2">Total Deductions</th>
                  <th className="text-right py-2">Net Pay</th>
                </tr>
              </thead>
              <tbody>
                {previews.map((preview) => (
                  <tr key={preview.employee.id} className="border-b">
                    <td className="py-3 font-medium">{preview.employee.name}</td>
                    <td className="py-3 text-right">{formatCurrency(preview.earnings.grossPay)}</td>
                    <td className="py-3 text-right text-red-600">{formatCurrency(preview.taxes.federal.incomeTax)}</td>
                    <td className="py-3 text-right text-red-600">{formatCurrency(preview.taxes.federal.socialSecurity)}</td>
                    <td className="py-3 text-right text-red-600">{formatCurrency(preview.taxes.federal.medicare)}</td>
                    <td className="py-3 text-right text-red-600">{formatCurrency(preview.taxes.state.incomeTax)}</td>
                    <td className="py-3 text-right text-red-600">{formatCurrency(preview.totalDeductions)}</td>
                    <td className="py-3 text-right font-bold text-green-600">{formatCurrency(preview.netPay)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep('setup')} className="btn-secondary">
              Back to Edit
            </button>
            <button
              onClick={() => runPayrollMutation.mutate()}
              disabled={runPayrollMutation.isPending}
              className="btn-primary"
            >
              <DollarSign className="w-4 h-4 mr-2" />
              {runPayrollMutation.isPending ? 'Processing...' : 'Process Payroll'}
            </button>
          </div>
        </div>
      )}

      {step === 'complete' && (
        <div className="card text-center py-12">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Payroll Processed!</h2>
          <p className="text-gray-600 mb-6">
            Payroll has been successfully processed for {previews.length} employees.
          </p>
          <div className="flex justify-center gap-4">
            <button onClick={() => {
              setStep('setup')
              setPreviews([])
              setEmployeeHours({})
            }} className="btn-primary">
              Run Another Payroll
            </button>
            <a href="/payroll/history" className="btn-secondary">
              View History
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
