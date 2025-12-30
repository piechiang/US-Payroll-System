import { useState, useEffect } from 'react'
import { FileText, Download, Calendar, Filter, RefreshCw } from 'lucide-react'
import api from '../services/api'

type ReportType = 'payroll-summary' | 'tax-summary' | 'employee-earnings'

interface ReportFilters {
  reportType: ReportType
  companyId: string
  startDate: string
  endDate: string
  department?: string
}

export default function Reports() {
  const [filters, setFilters] = useState<ReportFilters>({
    reportType: 'payroll-summary',
    companyId: '',
    startDate: getDefaultStartDate(),
    endDate: getDefaultEndDate(),
  })

  const [report, setReport] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [companies, setCompanies] = useState<any[]>([])

  // Get company ID from localStorage or fetch companies
  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const response = await api.get('/companies')
        setCompanies(response.data || [])

        // Set default company
        const savedCompanyId = localStorage.getItem('selectedCompanyId')
        if (savedCompanyId) {
          setFilters((prev) => ({ ...prev, companyId: savedCompanyId }))
        } else if (response.data && response.data.length > 0) {
          const firstCompanyId = response.data[0].id
          setFilters((prev) => ({ ...prev, companyId: firstCompanyId }))
        }
      } catch (err) {
        console.error('Failed to fetch companies:', err)
      }
    }

    fetchCompanies()
  }, [])

  // Generate default date range (current year)
  function getDefaultStartDate() {
    const now = new Date()
    return new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0]
  }

  function getDefaultEndDate() {
    return new Date().toISOString().split('T')[0]
  }

  // Generate report
  const generateReport = async () => {
    if (!filters.companyId) {
      setError('Please select a company')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const endpoint = `/reports/${filters.reportType}`
      const response = await api.post(endpoint, {
        companyId: filters.companyId,
        startDate: filters.startDate,
        endDate: filters.endDate,
        department: filters.department,
      })

      setReport(response.data)
    } catch (err: any) {
      console.error('Failed to generate report:', err)
      setError(err.response?.data?.error || 'Failed to generate report')
    } finally {
      setLoading(false)
    }
  }

  // Export to CSV
  const exportToCSV = async () => {
    if (!filters.companyId) {
      setError('Please select a company')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await api.post(
        '/reports/export/csv',
        {
          reportType: filters.reportType,
          companyId: filters.companyId,
          startDate: filters.startDate,
          endDate: filters.endDate,
          department: filters.department,
        },
        { responseType: 'blob' }
      )

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute(
        'download',
        `${filters.reportType}-${new Date().toISOString().split('T')[0]}.csv`
      )
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch (err: any) {
      console.error('Failed to export CSV:', err)
      setError(err.response?.data?.error || 'Failed to export CSV')
    } finally {
      setLoading(false)
    }
  }

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount)
  }

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="mt-1 text-sm text-gray-600">
          Generate and export payroll and tax reports
        </p>
      </div>

      {/* Filters Card */}
      <div className="card mb-6">
        <div className="flex items-center mb-4">
          <Filter className="w-5 h-5 text-gray-500 mr-2" />
          <h2 className="text-lg font-semibold text-gray-900">Report Filters</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Report Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Report Type
            </label>
            <select
              className="input"
              value={filters.reportType}
              onChange={(e) =>
                setFilters({ ...filters, reportType: e.target.value as ReportType })
              }
            >
              <option value="payroll-summary">Payroll Summary</option>
              <option value="tax-summary">Tax Summary</option>
              <option value="employee-earnings">Employee Earnings</option>
            </select>
          </div>

          {/* Company */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
            <select
              className="input"
              value={filters.companyId}
              onChange={(e) => setFilters({ ...filters, companyId: e.target.value })}
            >
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Start Date
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="date"
                className="input pl-10"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              />
            </div>
          </div>

          {/* End Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="date"
                className="input pl-10"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 flex gap-3">
          <button className="btn-primary" onClick={generateReport} disabled={loading}>
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <FileText className="w-4 h-4 mr-2" />
                Generate Report
              </>
            )}
          </button>

          {report && (
            <button className="btn-secondary" onClick={exportToCSV} disabled={loading}>
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="card bg-red-50 border-red-200 mb-6">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Report Display */}
      {report && !loading && (
        <div className="card">
          {/* Report Header */}
          <div className="mb-6 pb-4 border-b">
            <h2 className="text-xl font-bold text-gray-900">
              {filters.reportType === 'payroll-summary' && 'Payroll Summary Report'}
              {filters.reportType === 'tax-summary' && 'Tax Summary Report'}
              {filters.reportType === 'employee-earnings' && 'Employee Earnings Report'}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Period: {formatDate(report.period.startDate)} - {formatDate(report.period.endDate)}
            </p>
          </div>

          {/* Payroll Summary Report */}
          {filters.reportType === 'payroll-summary' && (
            <div>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Employees</p>
                  <p className="text-2xl font-bold text-blue-700">
                    {report.summary.totalEmployees}
                  </p>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Gross Pay</p>
                  <p className="text-2xl font-bold text-green-700">
                    {formatCurrency(report.summary.totalGrossPay)}
                  </p>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Net Pay</p>
                  <p className="text-2xl font-bold text-purple-700">
                    {formatCurrency(report.summary.totalNetPay)}
                  </p>
                </div>
                <div className="bg-orange-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Taxes</p>
                  <p className="text-2xl font-bold text-orange-700">
                    {formatCurrency(report.summary.totalTaxes)}
                  </p>
                </div>
                <div className="bg-red-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Employer Tax</p>
                  <p className="text-2xl font-bold text-red-700">
                    {formatCurrency(report.summary.totalEmployerTax)}
                  </p>
                </div>
              </div>

              {/* Payroll Details Table */}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Employee
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Department
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Pay Date
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        Gross Pay
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        Taxes
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        Net Pay
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {report.payrolls.map((payroll: any, index: number) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {payroll.employeeName}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {payroll.department}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {formatDate(payroll.payDate)}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                          {formatCurrency(payroll.grossPay)}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-600">
                          {formatCurrency(payroll.taxes)}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-medium text-green-700">
                          {formatCurrency(payroll.netPay)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Tax Summary Report */}
          {filters.reportType === 'tax-summary' && (
            <div>
              {/* Tax Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                {/* Federal Taxes */}
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-blue-900 mb-3">Federal Taxes</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Federal Withholding</span>
                      <span className="font-medium">
                        {formatCurrency(report.federal.federalWithholding)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Social Security</span>
                      <span className="font-medium">
                        {formatCurrency(report.federal.socialSecurity)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Medicare</span>
                      <span className="font-medium">
                        {formatCurrency(report.federal.medicare)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>FUTA</span>
                      <span className="font-medium">{formatCurrency(report.federal.futa)}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-blue-200 font-bold">
                      <span>Total</span>
                      <span>{formatCurrency(report.federal.total)}</span>
                    </div>
                  </div>
                </div>

                {/* State Taxes */}
                <div className="bg-green-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-green-900 mb-3">State Taxes</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>State Withholding</span>
                      <span className="font-medium">
                        {formatCurrency(report.state.stateWithholding)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>SUI</span>
                      <span className="font-medium">{formatCurrency(report.state.sui)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>SDI</span>
                      <span className="font-medium">{formatCurrency(report.state.sdi)}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-green-200 font-bold">
                      <span>Total</span>
                      <span>{formatCurrency(report.state.total)}</span>
                    </div>
                  </div>
                </div>

                {/* Totals */}
                <div className="bg-purple-50 p-4 rounded-lg">
                  <h3 className="font-semibold text-purple-900 mb-3">Summary</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Employee Taxes</span>
                      <span className="font-medium">
                        {formatCurrency(report.totals.employeeTaxes)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Employer Taxes</span>
                      <span className="font-medium">
                        {formatCurrency(report.totals.employerTaxes)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Local Taxes</span>
                      <span className="font-medium">
                        {formatCurrency(report.local.localWithholding)}
                      </span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-purple-200 font-bold text-lg">
                      <span>Grand Total</span>
                      <span>{formatCurrency(report.totals.grandTotal)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Employee Earnings Report */}
          {filters.reportType === 'employee-earnings' && (
            <div>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Total Gross Pay</p>
                  <p className="text-2xl font-bold text-blue-700">
                    {formatCurrency(report.summary.totalGrossPay)}
                  </p>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Total Net Pay</p>
                  <p className="text-2xl font-bold text-green-700">
                    {formatCurrency(report.summary.totalNetPay)}
                  </p>
                </div>
                <div className="bg-orange-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Total Taxes</p>
                  <p className="text-2xl font-bold text-orange-700">
                    {formatCurrency(report.summary.totalTaxes)}
                  </p>
                </div>
                <div className="bg-red-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Total Deductions</p>
                  <p className="text-2xl font-bold text-red-700">
                    {formatCurrency(report.summary.totalDeductions)}
                  </p>
                </div>
              </div>

              {/* Employee Details Table */}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Employee
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        SSN
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        Regular Pay
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        Overtime
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        Bonus
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        Gross Pay
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        Taxes
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        Net Pay
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {report.employees.map((employee: any, index: number) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">{employee.name}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                          {employee.ssn}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-900">
                          {formatCurrency(employee.regularPay)}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-600">
                          {formatCurrency(employee.overtimePay)}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-600">
                          {formatCurrency(employee.bonus)}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                          {formatCurrency(employee.grossPay)}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-gray-600">
                          {formatCurrency(
                            employee.federalTax + employee.stateTax + employee.fica
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-medium text-green-700">
                          {formatCurrency(employee.netPay)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
