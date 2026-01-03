import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FileText, Download, Eye, Printer, Filter } from 'lucide-react'
import { api } from '../services/api'

interface PayrollRecord {
  id: string
  payPeriodStart: string
  payPeriodEnd: string
  payDate: string
  grossPay: string
  netPay: string
  totalDeductions: string
  status: string
  employee: {
    firstName: string
    lastName: string
  }
}

interface Company {
  id: string
  name: string
}

export default function PayrollHistory() {
  const [selectedCompany, setSelectedCompany] = useState<string>('')

  // Fetch companies for filter
  const { data: companies = [] } = useQuery<Company[]>({
    queryKey: ['companies'],
    queryFn: () => api.get('/companies').then(res => res.data)
  })

  // Fetch payrolls
  const { data: payrolls = [], isLoading } = useQuery<PayrollRecord[]>({
    queryKey: ['payroll-history', selectedCompany],
    queryFn: async () => {
      if (!selectedCompany) {
        // Fetch from all companies
        const allPayrolls: PayrollRecord[] = []
        for (const company of companies) {
          try {
            const res = await api.get(`/payroll/company/${company.id}`)
            allPayrolls.push(...res.data)
          } catch (e) {
            // Ignore errors for individual companies
          }
        }
        return allPayrolls.sort((a, b) =>
          new Date(b.payDate).getTime() - new Date(a.payDate).getTime()
        )
      }
      const res = await api.get(`/payroll/company/${selectedCompany}`)
      return res.data
    },
    enabled: companies.length > 0
  })

  const formatCurrency = (amount: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(parseFloat(amount))
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const handlePrintPDF = async (payrollId: string) => {
    try {
      // Use axios to download PDF with authentication header
      const response = await api.get(`/payroll/${payrollId}/pdf`, {
        responseType: 'blob', // Important: tells axios to expect binary data
      })

      // Create blob from response
      const blob = new Blob([response.data], { type: 'application/pdf' })

      // Create temporary URL for the blob
      const url = window.URL.createObjectURL(blob)

      // Open PDF in new tab
      window.open(url, '_blank')

      // Clean up the temporary URL after a short delay
      setTimeout(() => window.URL.revokeObjectURL(url), 100)
    } catch (error) {
      console.error('Failed to download PDF:', error)
      alert('Failed to generate PDF. Please try again.')
    }
  }

  // Calculate totals
  const totalGross = payrolls.reduce((sum, p) => sum + parseFloat(p.grossPay), 0)
  const totalNet = payrolls.reduce((sum, p) => sum + parseFloat(p.netPay), 0)
  const totalDeductions = payrolls.reduce((sum, p) => sum + parseFloat(p.totalDeductions), 0)

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payroll History</h1>
          <p className="mt-1 text-sm text-gray-600">
            View past payroll runs and download pay stubs.
          </p>
        </div>
        <Link to="/payroll/run" className="btn-primary">
          Run New Payroll
        </Link>
      </div>

      {/* Filters */}
      <div className="card mb-6">
        <div className="flex items-center gap-4">
          <Filter className="w-5 h-5 text-gray-400" />
          <div className="flex-1 max-w-xs">
            <select
              value={selectedCompany}
              onChange={(e) => setSelectedCompany(e.target.value)}
              className="input"
            >
              <option value="">All Companies</option>
              {companies.map(company => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </select>
          </div>
          {payrolls.length > 0 && (
            <div className="ml-auto text-sm text-gray-600">
              Showing {payrolls.length} records
            </div>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      {payrolls.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="card text-center">
            <p className="text-sm text-gray-500">Total Gross Pay</p>
            <p className="text-xl font-bold text-gray-900">{formatCurrency(totalGross.toString())}</p>
          </div>
          <div className="card text-center">
            <p className="text-sm text-gray-500">Total Deductions</p>
            <p className="text-xl font-bold text-red-600">{formatCurrency(totalDeductions.toString())}</p>
          </div>
          <div className="card text-center">
            <p className="text-sm text-gray-500">Total Net Pay</p>
            <p className="text-xl font-bold text-green-600">{formatCurrency(totalNet.toString())}</p>
          </div>
        </div>
      )}

      {/* Payroll Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">Loading...</div>
        ) : payrolls.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <h3 className="text-lg font-medium text-gray-900 mb-1">No payroll history yet</h3>
            <p className="mb-4">Run your first payroll to see records here.</p>
            <Link to="/payroll/run" className="btn-primary">
              Run Payroll
            </Link>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-header">Pay Date</th>
                <th className="table-header">Pay Period</th>
                <th className="table-header">Employee</th>
                <th className="table-header">Gross Pay</th>
                <th className="table-header">Deductions</th>
                <th className="table-header">Net Pay</th>
                <th className="table-header">Status</th>
                <th className="table-header">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {payrolls.map((payroll) => (
                <tr key={payroll.id} className="hover:bg-gray-50">
                  <td className="table-cell font-medium">
                    {formatDate(payroll.payDate)}
                  </td>
                  <td className="table-cell text-gray-500 text-sm">
                    {formatDate(payroll.payPeriodStart)} - {formatDate(payroll.payPeriodEnd)}
                  </td>
                  <td className="table-cell">
                    {payroll.employee.firstName} {payroll.employee.lastName}
                  </td>
                  <td className="table-cell">
                    {formatCurrency(payroll.grossPay)}
                  </td>
                  <td className="table-cell text-red-600">
                    -{formatCurrency(payroll.totalDeductions)}
                  </td>
                  <td className="table-cell font-medium text-green-600">
                    {formatCurrency(payroll.netPay)}
                  </td>
                  <td className="table-cell">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      payroll.status === 'PROCESSED' ? 'bg-green-100 text-green-800' :
                      payroll.status === 'PAID' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {payroll.status}
                    </span>
                  </td>
                  <td className="table-cell">
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/payroll/${payroll.id}`}
                        className="text-primary-600 hover:text-primary-800"
                        title="View Paystub"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
                      <button
                        onClick={() => handlePrintPDF(payroll.id)}
                        className="text-gray-600 hover:text-gray-800"
                        title="Print PDF"
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                      <a
                        href={`/api/payroll/${payroll.id}/pdf`}
                        download
                        className="text-gray-600 hover:text-gray-800"
                        title="Download PDF"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
