import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { CheckCircle, DollarSign, Send, ArrowLeft } from 'lucide-react'
import { api } from '../services/api'

interface Employee {
  id: string
  firstName: string
  lastName: string
  payType: 'HOURLY' | 'SALARY'
  payRate: string
  department?: string
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

interface PayPeriodDetailResponse {
  id: string
  company: { id: string; name: string; ein: string }
  startDate: string
  endDate: string
  payDate: string
  status: string
  summary: {
    totalEmployees: number
    totalGrossPay: number
    totalNetPay: number
  }
  payrolls: {
    id: string
    employee: Employee
    grossPay: number
    netPay: number
    totalDeductions: number
  }[]
}

export default function PayPeriodDetail() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [employeeHours, setEmployeeHours] = useState<Record<string, { hours: number; overtime: number }>>({})
  const [previews, setPreviews] = useState<PayrollPreview[]>([])
  const [step, setStep] = useState<'setup' | 'preview' | 'complete'>('setup')

  const { data: payPeriod, isLoading } = useQuery<PayPeriodDetailResponse>({
    queryKey: ['pay-period', id],
    queryFn: () => api.get(`/pay-periods/${id}`).then(res => res.data),
    enabled: !!id
  })

  const { data: employees = [] } = useQuery<Employee[]>({
    queryKey: ['employees', payPeriod?.company.id],
    queryFn: () => api.get(`/employees?companyId=${payPeriod?.company.id}`).then(res => res.data),
    enabled: !!payPeriod?.company.id
  })

  const calculateMutation = useMutation({
    mutationFn: async () => {
      if (!payPeriod) return []
      const results: PayrollPreview[] = []
      for (const employee of employees) {
        const hours = employeeHours[employee.id] || { hours: 0, overtime: 0 }
        const response = await api.post('/payroll/calculate', {
          employeeId: employee.id,
          payPeriodStart: payPeriod.startDate,
          payPeriodEnd: payPeriod.endDate,
          hoursWorked: hours.hours,
          overtimeHours: hours.overtime
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

  const runPayrollMutation = useMutation({
    mutationFn: () => api.post('/payroll/run', {
      companyId: payPeriod?.company.id,
      payPeriodStart: payPeriod?.startDate,
      payPeriodEnd: payPeriod?.endDate,
      payDate: payPeriod?.payDate,
      employeePayData: employees.map(emp => ({
        employeeId: emp.id,
        hoursWorked: employeeHours[emp.id]?.hours || 0,
        overtimeHours: employeeHours[emp.id]?.overtime || 0
      }))
    }),
    onSuccess: () => {
      setStep('complete')
      queryClient.invalidateQueries({ queryKey: ['pay-period', id] })
      queryClient.invalidateQueries({ queryKey: ['pay-periods'] })
    }
  })

  const submitForApprovalMutation = useMutation({
    mutationFn: () => api.post(`/payroll-approval/${id}/submit`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pay-period', id] })
      queryClient.invalidateQueries({ queryKey: ['pay-periods'] })
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

  const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount)

  const formatDate = (value: string) => new Date(value).toLocaleDateString('en-US')

  const totalGross = previews.reduce((sum, p) => sum + p.earnings.grossPay, 0)
  const totalNet = previews.reduce((sum, p) => sum + p.netPay, 0)
  const totalDeductions = previews.reduce((sum, p) => sum + p.totalDeductions, 0)

  const payrollLocked = payPeriod ? ['PROCESSING', 'PROCESSED', 'PAID'].includes(payPeriod.status) : false
  const canSubmit = payPeriod ? ['DRAFT', 'REJECTED'].includes(payPeriod.status) : false

  const existingPayrolls = useMemo(() => payPeriod?.payrolls || [], [payPeriod])

  if (isLoading || !payPeriod) {
    return <p className="text-sm text-gray-500">Loading pay period...</p>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 text-sm text-gray-500">
        <Link to="/pay-periods" className="inline-flex items-center gap-2 text-primary-600 hover:underline">
          <ArrowLeft className="w-4 h-4" />
          Back to Pay Periods
        </Link>
      </div>

      <div className="card">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{payPeriod.company.name}</h1>
            <p className="text-sm text-gray-600">
              {formatDate(payPeriod.startDate)} - {formatDate(payPeriod.endDate)} · Pay Date {formatDate(payPeriod.payDate)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700">
              {payPeriod.status}
            </span>
            {canSubmit && (
              <button
                className="btn-secondary"
                onClick={() => submitForApprovalMutation.mutate()}
                disabled={submitForApprovalMutation.isPending}
              >
                <Send className="w-4 h-4 mr-2" />
                {submitForApprovalMutation.isPending ? 'Submitting...' : 'Submit for Approval'}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card text-center">
          <p className="text-sm text-gray-500">Employees</p>
          <p className="text-2xl font-bold text-gray-900">{payPeriod.summary.totalEmployees}</p>
        </div>
        <div className="card text-center">
          <p className="text-sm text-gray-500">Gross Pay</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(payPeriod.summary.totalGrossPay)}</p>
        </div>
        <div className="card text-center">
          <p className="text-sm text-gray-500">Net Pay</p>
          <p className="text-2xl font-bold text-green-600">{formatCurrency(payPeriod.summary.totalNetPay)}</p>
        </div>
      </div>

      {existingPayrolls.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">Payroll Records</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b text-sm text-gray-500">
                  <th className="text-left py-2">Employee</th>
                  <th className="text-left py-2">Department</th>
                  <th className="text-right py-2">Gross</th>
                  <th className="text-right py-2">Deductions</th>
                  <th className="text-right py-2">Net</th>
                </tr>
              </thead>
              <tbody>
                {existingPayrolls.map(payroll => (
                  <tr key={payroll.id} className="border-b text-sm">
                    <td className="py-3 font-medium text-gray-900">
                      {payroll.employee.firstName} {payroll.employee.lastName}
                    </td>
                    <td className="py-3">{payroll.employee.department || '—'}</td>
                    <td className="py-3 text-right">{formatCurrency(payroll.grossPay)}</td>
                    <td className="py-3 text-right text-red-600">{formatCurrency(payroll.totalDeductions)}</td>
                    <td className="py-3 text-right text-green-600">{formatCurrency(payroll.netPay)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!payrollLocked && (
        <div className="space-y-6">
          {step === 'setup' && (
            <div className="card">
              <h2 className="text-lg font-semibold mb-4">Prepare Payroll</h2>
              <div className="overflow-x-auto">
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
                    {employees.map(emp => (
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
              <div className="flex justify-end mt-4">
                <button
                  className="btn-primary"
                  onClick={() => calculateMutation.mutate()}
                  disabled={calculateMutation.isPending || employees.length === 0}
                >
                  <DollarSign className="w-4 h-4 mr-2" />
                  {calculateMutation.isPending ? 'Calculating...' : 'Calculate Payroll'}
                </button>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

              <div className="card overflow-x-auto">
                <h2 className="text-lg font-semibold mb-4">Payroll Preview</h2>
                <table className="min-w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Employee</th>
                      <th className="text-right py-2">Gross Pay</th>
                      <th className="text-right py-2">Total Deductions</th>
                      <th className="text-right py-2">Net Pay</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previews.map(preview => (
                      <tr key={preview.employee.id} className="border-b">
                        <td className="py-3 font-medium">{preview.employee.name}</td>
                        <td className="py-3 text-right">{formatCurrency(preview.earnings.grossPay)}</td>
                        <td className="py-3 text-right text-red-600">{formatCurrency(preview.totalDeductions)}</td>
                        <td className="py-3 text-right text-green-600">{formatCurrency(preview.netPay)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between">
                <button className="btn-secondary" onClick={() => setStep('setup')}>
                  Back to Edit
                </button>
                <button
                  className="btn-primary"
                  onClick={() => runPayrollMutation.mutate()}
                  disabled={runPayrollMutation.isPending}
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
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Payroll Processed!</h2>
              <p className="text-gray-600 mb-6">
                Payroll has been successfully processed for {previews.length} employees.
              </p>
              <button
                onClick={() => {
                  setStep('setup')
                  setPreviews([])
                }}
                className="btn-primary"
              >
                Run Again
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
