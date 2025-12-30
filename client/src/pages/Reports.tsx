import { useState, useEffect } from 'react'
import { FileText, Download, Calendar, Filter, RefreshCw } from 'lucide-react'
import api from '../services/api'

type ReportType =
  | 'payroll-summary'
  | 'tax-summary'
  | 'employee-earnings'
  | 'form-941'
  | 'form-940'
  | 'labor-cost-analysis'
  | 'overtime-analysis'
  | '401k-report'

interface ReportFilters {
  reportType: ReportType
  companyId: string
  startDate: string
  endDate: string
  department?: string
  year?: number
  quarter?: 1 | 2 | 3 | 4
}

export default function Reports() {
  const [filters, setFilters] = useState<ReportFilters>({
    reportType: 'payroll-summary',
    companyId: '',
    startDate: getDefaultStartDate(),
    endDate: getDefaultEndDate(),
    year: new Date().getFullYear(),
    quarter: getCurrentQuarter(),
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

  function getCurrentQuarter(): 1 | 2 | 3 | 4 {
    const month = new Date().getMonth()
    if (month >= 0 && month <= 2) return 1
    if (month >= 3 && month <= 5) return 2
    if (month >= 6 && month <= 8) return 3
    return 4
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
      let endpoint = `/reports/${filters.reportType}`
      let requestBody: any = {
        companyId: filters.companyId,
      }

      // Different reports need different parameters
      if (filters.reportType === 'form-941') {
        requestBody.year = filters.year
        requestBody.quarter = filters.quarter
      } else if (filters.reportType === 'form-940') {
        requestBody.year = filters.year
      } else if (filters.reportType === '401k-report') {
        // Only needs companyId
      } else {
        // Standard reports need date range
        requestBody.startDate = filters.startDate
        requestBody.endDate = filters.endDate
        if (filters.department) {
          requestBody.department = filters.department
        }
      }

      const response = await api.post(endpoint, requestBody)
      setReport(response.data)
    } catch (err: any) {
      console.error('Failed to generate report:', err)
      setError(err.response?.data?.error || 'Failed to generate report')
    } finally {
      setLoading(false)
    }
  }

  // Export to CSV (only for standard reports)
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

  // Get report title
  const getReportTitle = () => {
    switch (filters.reportType) {
      case 'payroll-summary':
        return 'Payroll Summary Report'
      case 'tax-summary':
        return 'Tax Summary Report'
      case 'employee-earnings':
        return 'Employee Earnings Report'
      case 'form-941':
        return 'IRS Form 941 - Quarterly Federal Tax Return'
      case 'form-940':
        return 'IRS Form 940 - Annual FUTA Tax Return'
      case 'labor-cost-analysis':
        return 'Labor Cost Analysis Report'
      case 'overtime-analysis':
        return 'Overtime Analysis Report'
      case '401k-report':
        return '401(k) Participation Report'
      default:
        return 'Report'
    }
  }

  // Check if CSV export is available for this report type
  const canExportCSV = ['payroll-summary', 'tax-summary', 'employee-earnings'].includes(
    filters.reportType
  )

  return (
    <div>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="mt-1 text-sm text-gray-600">
          Generate payroll, tax, and analytics reports
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
          <div className="lg:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Report Type
            </label>
            <select
              className="input"
              value={filters.reportType}
              onChange={(e) => {
                setFilters({ ...filters, reportType: e.target.value as ReportType })
                setReport(null) // Clear previous report
              }}
            >
              <optgroup label="Standard Reports">
                <option value="payroll-summary">Payroll Summary</option>
                <option value="tax-summary">Tax Summary</option>
                <option value="employee-earnings">Employee Earnings</option>
              </optgroup>
              <optgroup label="IRS Tax Forms">
                <option value="form-941">Form 941 (Quarterly Federal Tax)</option>
                <option value="form-940">Form 940 (Annual FUTA Tax)</option>
              </optgroup>
              <optgroup label="Advanced Analytics">
                <option value="labor-cost-analysis">Labor Cost Analysis</option>
                <option value="overtime-analysis">Overtime Analysis</option>
                <option value="401k-report">401(k) Participation Report</option>
              </optgroup>
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

          {/* Conditional filters based on report type */}
          {filters.reportType === 'form-941' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
                <input
                  type="number"
                  className="input"
                  value={filters.year}
                  onChange={(e) => setFilters({ ...filters, year: parseInt(e.target.value) })}
                  min="2020"
                  max={new Date().getFullYear() + 1}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Quarter</label>
                <select
                  className="input"
                  value={filters.quarter}
                  onChange={(e) =>
                    setFilters({ ...filters, quarter: parseInt(e.target.value) as 1 | 2 | 3 | 4 })
                  }
                >
                  <option value={1}>Q1 (Jan - Mar)</option>
                  <option value={2}>Q2 (Apr - Jun)</option>
                  <option value={3}>Q3 (Jul - Sep)</option>
                  <option value={4}>Q4 (Oct - Dec)</option>
                </select>
              </div>
            </>
          )}

          {filters.reportType === 'form-940' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Year</label>
              <input
                type="number"
                className="input"
                value={filters.year}
                onChange={(e) => setFilters({ ...filters, year: parseInt(e.target.value) })}
                min="2020"
                max={new Date().getFullYear()}
              />
            </div>
          )}

          {!['form-941', 'form-940', '401k-report'].includes(filters.reportType) && (
            <>
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
            </>
          )}
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

          {report && canExportCSV && (
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
            <h2 className="text-xl font-bold text-gray-900">{getReportTitle()}</h2>
            <p className="text-sm text-gray-600 mt-1">
              {report.period && (
                <>
                  Period: {formatDate(report.period.startDate)} -{' '}
                  {formatDate(report.period.endDate)}
                </>
              )}
              {report.quarter && report.year && (
                <>
                  Q{report.quarter} {report.year}
                </>
              )}
              {report.year && !report.quarter && <>Year: {report.year}</>}
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

          {/* Form 941 Report */}
          {filters.reportType === 'form-941' && report.line1 !== undefined && (
            <div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Employees</p>
                  <p className="text-2xl font-bold text-blue-700">{report.line1}</p>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Total Wages</p>
                  <p className="text-2xl font-bold text-green-700">
                    {formatCurrency(report.line2)}
                  </p>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Total Tax Due</p>
                  <p className="text-2xl font-bold text-purple-700">
                    {formatCurrency(report.line12)}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="border-b pb-3">
                  <h3 className="font-semibold mb-2">Part 1: Tax Calculations</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex justify-between">
                      <span>Federal Income Tax Withheld (Line 3):</span>
                      <span className="font-medium">{formatCurrency(report.line3)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Social Security & Medicare (Line 5e):</span>
                      <span className="font-medium">{formatCurrency(report.line5e)}</span>
                    </div>
                  </div>
                </div>

                <div className="border-b pb-3">
                  <h3 className="font-semibold mb-2">Part 2: Monthly Tax Liability</h3>
                  {report.monthlyTaxLiability && (
                    <div className="grid grid-cols-3 gap-2 text-sm">
                      <div className="flex justify-between">
                        <span>Month 1:</span>
                        <span className="font-medium">
                          {formatCurrency(report.monthlyTaxLiability.month1)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Month 2:</span>
                        <span className="font-medium">
                          {formatCurrency(report.monthlyTaxLiability.month2)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Month 3:</span>
                        <span className="font-medium">
                          {formatCurrency(report.monthlyTaxLiability.month3)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {(report.line14 > 0 || report.line15 > 0) && (
                  <div className="bg-yellow-50 p-4 rounded-lg">
                    {report.line14 > 0 && (
                      <p className="text-sm">
                        <strong>Balance Due (Line 14):</strong> {formatCurrency(report.line14)}
                      </p>
                    )}
                    {report.line15 > 0 && (
                      <p className="text-sm">
                        <strong>Overpayment (Line 15):</strong> {formatCurrency(report.line15)}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Form 940 Report */}
          {filters.reportType === 'form-940' && report.line3 !== undefined && (
            <div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Total Payments</p>
                  <p className="text-2xl font-bold text-blue-700">
                    {formatCurrency(report.line3)}
                  </p>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Taxable FUTA Wages</p>
                  <p className="text-2xl font-bold text-green-700">
                    {formatCurrency(report.line5)}
                  </p>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">FUTA Tax</p>
                  <p className="text-2xl font-bold text-purple-700">
                    {formatCurrency(report.line10)}
                  </p>
                </div>
                <div className="bg-orange-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Balance</p>
                  <p className="text-2xl font-bold text-orange-700">
                    {report.line12 > 0 ? formatCurrency(report.line12) : '$0'}
                  </p>
                </div>
              </div>

              {report.quarterlyLiability && (
                <div className="border-b pb-4 mb-4">
                  <h3 className="font-semibold mb-3">Quarterly FUTA Liability</h3>
                  <div className="grid grid-cols-4 gap-4">
                    {['q1', 'q2', 'q3', 'q4'].map((q, idx) => (
                      <div key={q} className="bg-gray-50 p-3 rounded">
                        <p className="text-xs text-gray-600">Q{idx + 1}</p>
                        <p className="text-lg font-semibold">
                          {formatCurrency(report.quarterlyLiability[q])}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Labor Cost Analysis */}
          {filters.reportType === 'labor-cost-analysis' && report.summary && (
            <div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Total Labor Cost</p>
                  <p className="text-2xl font-bold text-blue-700">
                    {formatCurrency(report.summary.totalLaborCost)}
                  </p>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Gross Pay</p>
                  <p className="text-2xl font-bold text-green-700">
                    {formatCurrency(report.summary.totalGrossPay)}
                  </p>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Employer Taxes</p>
                  <p className="text-2xl font-bold text-purple-700">
                    {formatCurrency(report.summary.totalEmployerTaxes)}
                  </p>
                </div>
                <div className="bg-orange-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Avg Cost/Employee</p>
                  <p className="text-2xl font-bold text-orange-700">
                    {formatCurrency(report.summary.averageCostPerEmployee)}
                  </p>
                </div>
              </div>

              {report.byDepartment && report.byDepartment.length > 0 && (
                <div className="mb-6">
                  <h3 className="font-semibold mb-3">By Department</h3>
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Department
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          Employees
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          Total Cost
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          % of Total
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {report.byDepartment.map((dept: any, index: number) => (
                        <tr key={index}>
                          <td className="px-4 py-3 text-sm text-gray-900">{dept.department}</td>
                          <td className="px-4 py-3 text-sm text-right">{dept.employeeCount}</td>
                          <td className="px-4 py-3 text-sm text-right font-medium">
                            {formatCurrency(dept.totalCost)}
                          </td>
                          <td className="px-4 py-3 text-sm text-right">{dept.percentOfTotal}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Overtime Analysis */}
          {filters.reportType === 'overtime-analysis' && report.summary && (
            <div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Total OT Hours</p>
                  <p className="text-2xl font-bold text-blue-700">
                    {report.summary.totalOvertimeHours}
                  </p>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Total OT Pay</p>
                  <p className="text-2xl font-bold text-green-700">
                    {formatCurrency(report.summary.totalOvertimePay)}
                  </p>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Avg OT/Employee</p>
                  <p className="text-2xl font-bold text-purple-700">
                    {report.summary.averageOvertimePerEmployee.toFixed(1)} hrs
                  </p>
                </div>
                <div className="bg-orange-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">OT % of Total</p>
                  <p className="text-2xl font-bold text-orange-700">
                    {report.summary.overtimeAsPercentOfTotal.toFixed(1)}%
                  </p>
                </div>
              </div>

              {report.byEmployee && report.byEmployee.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-3">By Employee</h3>
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Employee
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          OT Hours
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          OT Pay
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                          % of Total Pay
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {report.byEmployee.map((emp: any, index: number) => (
                        <tr key={index}>
                          <td className="px-4 py-3 text-sm text-gray-900">{emp.employeeName}</td>
                          <td className="px-4 py-3 text-sm text-right">
                            {emp.totalOvertimeHours}
                          </td>
                          <td className="px-4 py-3 text-sm text-right font-medium">
                            {formatCurrency(emp.totalOvertimePay)}
                          </td>
                          <td className="px-4 py-3 text-sm text-right">
                            {emp.percentOfTotalPay.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* 401k Report */}
          {filters.reportType === '401k-report' && report.summary && (
            <div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Total Employees</p>
                  <p className="text-2xl font-bold text-blue-700">{report.summary.totalEmployees}</p>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Participating</p>
                  <p className="text-2xl font-bold text-green-700">
                    {report.summary.participatingEmployees}
                  </p>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Participation Rate</p>
                  <p className="text-2xl font-bold text-purple-700">
                    {report.summary.participationRate.toFixed(1)}%
                  </p>
                </div>
                <div className="bg-orange-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Avg Contribution</p>
                  <p className="text-2xl font-bold text-orange-700">
                    {report.summary.averageContributionRate.toFixed(1)}%
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Total Employee Contributions (YTD)</p>
                  <p className="text-xl font-bold text-gray-900">
                    {formatCurrency(report.summary.totalEmployeeContributions)}
                  </p>
                </div>
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-600">Total Employer Match (YTD)</p>
                  <p className="text-xl font-bold text-gray-900">
                    {formatCurrency(report.summary.totalEmployerMatch)}
                  </p>
                </div>
              </div>

              {report.contributionRanges && report.contributionRanges.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-3">Contribution Distribution</h3>
                  <div className="grid grid-cols-5 gap-2">
                    {report.contributionRanges.map((range: any, index: number) => (
                      <div key={index} className="bg-blue-50 p-3 rounded text-center">
                        <p className="text-xs text-gray-600">{range.range}</p>
                        <p className="text-lg font-bold text-blue-700">{range.count}</p>
                        <p className="text-xs text-gray-500">{range.percent}%</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
