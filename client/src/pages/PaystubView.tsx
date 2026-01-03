import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Printer, Download, FileText } from 'lucide-react'
import { api } from '../services/api'

interface PayrollDetail {
  id: string
  payPeriodStart: string
  payPeriodEnd: string
  payDate: string
  regularHours: string
  overtimeHours: string
  regularPay: string
  overtimePay: string
  bonus: string
  commission: string
  grossPay: string
  federalWithholding: string
  socialSecurity: string
  medicare: string
  stateWithholding: string
  stateDisability: string
  localWithholding: string
  retirement401k?: string
  employer401kMatch?: string
  totalDeductions: string
  netPay: string
  ytdGrossPay: string
  ytdFederalTax: string
  ytdSocialSecurity: string
  ytdMedicare: string
  ytdStateTax: string
  ytdNetPay: string
  employee: {
    id: string
    firstName: string
    lastName: string
    ssn: string
    department: string
    address: string
    city: string
    state: string
    zipCode: string
  }
  company: {
    name: string
    address: string
    city: string
    state: string
    zipCode: string
    phone: string
  }
}

export default function PaystubView() {
  const { id } = useParams()
  const navigate = useNavigate()

  const { data: payroll, isLoading, error } = useQuery<PayrollDetail>({
    queryKey: ['payroll', id],
    queryFn: () => api.get(`/payroll/${id}`).then(res => res.data),
    enabled: !!id
  })

  const formatCurrency = (amount: string | number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(typeof amount === 'string' ? parseFloat(amount) : amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const handlePrint = async () => {
    try {
      // Use axios to download PDF with authentication header
      const response = await api.get(`/payroll/${id}/pdf`, {
        responseType: 'blob',
      })

      // Create blob and open in new tab
      const blob = new Blob([response.data], { type: 'application/pdf' })
      const url = window.URL.createObjectURL(blob)
      window.open(url, '_blank')

      // Clean up
      setTimeout(() => window.URL.revokeObjectURL(url), 100)
    } catch (error) {
      console.error('Failed to print PDF:', error)
      alert('Failed to generate PDF. Please try again.')
    }
  }

  const handleDownload = async () => {
    try {
      // Use axios to download PDF with authentication header
      const response = await api.get(`/payroll/${id}/pdf`, {
        responseType: 'blob',
      })

      // Create blob and trigger download
      const blob = new Blob([response.data], { type: 'application/pdf' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `paystub-${payroll?.employee.lastName}-${payroll?.payDate.split('T')[0]}.pdf`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      // Clean up
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to download PDF:', error)
      alert('Failed to download PDF. Please try again.')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading paystub...</div>
      </div>
    )
  }

  if (error || !payroll) {
    return (
      <div className="card text-center py-8">
        <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
        <h3 className="text-lg font-medium text-gray-900 mb-1">Paystub not found</h3>
        <button onClick={() => navigate(-1)} className="btn-secondary mt-4">
          Go Back
        </button>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Pay Stub</h1>
            <p className="text-sm text-gray-600">
              {payroll.employee.firstName} {payroll.employee.lastName} - {formatDate(payroll.payDate)}
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={handlePrint} className="btn-secondary">
            <Printer className="w-4 h-4 mr-2" />
            Print
          </button>
          <button onClick={handleDownload} className="btn-primary">
            <Download className="w-4 h-4 mr-2" />
            Download PDF
          </button>
        </div>
      </div>

      {/* Paystub Card */}
      <div className="bg-white shadow-lg rounded-lg overflow-hidden max-w-4xl mx-auto">
        {/* Company Header */}
        <div className="bg-gray-900 text-white p-6 text-center">
          <h2 className="text-2xl font-bold">{payroll.company.name}</h2>
          <p className="text-gray-300 text-sm mt-1">
            {payroll.company.address}, {payroll.company.city}, {payroll.company.state} {payroll.company.zipCode}
          </p>
          <div className="mt-4 inline-block bg-white text-gray-900 px-4 py-1 rounded-full text-sm font-semibold">
            EARNINGS STATEMENT
          </div>
        </div>

        {/* Employee & Pay Period Info */}
        <div className="grid grid-cols-2 gap-6 p-6 bg-gray-50 border-b">
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Employee Information</h3>
            <p className="font-medium">{payroll.employee.firstName} {payroll.employee.lastName}</p>
            <p className="text-sm text-gray-600">ID: {payroll.employee.id.slice(-8).toUpperCase()}</p>
            <p className="text-sm text-gray-600">Dept: {payroll.employee.department || 'N/A'}</p>
            <p className="text-sm text-gray-600">SSN: XXX-XX-{payroll.employee.ssn.slice(-4)}</p>
          </div>
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Pay Period</h3>
            <p className="font-medium">{formatDate(payroll.payPeriodStart)} - {formatDate(payroll.payPeriodEnd)}</p>
            <p className="text-sm text-gray-600">Pay Date: {formatDate(payroll.payDate)}</p>
          </div>
        </div>

        {/* Earnings Section */}
        <div className="p-6 border-b">
          <h3 className="text-sm font-semibold text-blue-600 uppercase mb-4">Earnings</h3>
          <table className="w-full">
            <thead>
              <tr className="text-xs text-gray-500 uppercase">
                <th className="text-left pb-2">Description</th>
                <th className="text-right pb-2">Hours</th>
                <th className="text-right pb-2">Rate</th>
                <th className="text-right pb-2">Current</th>
                <th className="text-right pb-2">YTD</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              <tr>
                <td className="py-1">Regular Pay</td>
                <td className="text-right">{parseFloat(payroll.regularHours).toFixed(2)}</td>
                <td className="text-right">
                  {parseFloat(payroll.regularHours) > 0
                    ? formatCurrency(parseFloat(payroll.regularPay) / parseFloat(payroll.regularHours))
                    : '-'}
                </td>
                <td className="text-right">{formatCurrency(payroll.regularPay)}</td>
                <td className="text-right text-gray-500">-</td>
              </tr>
              {parseFloat(payroll.overtimeHours) > 0 && (
                <tr>
                  <td className="py-1">Overtime Pay</td>
                  <td className="text-right">{parseFloat(payroll.overtimeHours).toFixed(2)}</td>
                  <td className="text-right">
                    {formatCurrency((parseFloat(payroll.overtimePay) / parseFloat(payroll.overtimeHours)))}
                  </td>
                  <td className="text-right">{formatCurrency(payroll.overtimePay)}</td>
                  <td className="text-right text-gray-500">-</td>
                </tr>
              )}
              {parseFloat(payroll.bonus) > 0 && (
                <tr>
                  <td className="py-1">Bonus</td>
                  <td className="text-right">-</td>
                  <td className="text-right">-</td>
                  <td className="text-right">{formatCurrency(payroll.bonus)}</td>
                  <td className="text-right text-gray-500">-</td>
                </tr>
              )}
              {parseFloat(payroll.commission) > 0 && (
                <tr>
                  <td className="py-1">Commission</td>
                  <td className="text-right">-</td>
                  <td className="text-right">-</td>
                  <td className="text-right">{formatCurrency(payroll.commission)}</td>
                  <td className="text-right text-gray-500">-</td>
                </tr>
              )}
              <tr className="font-bold border-t">
                <td className="py-2">GROSS PAY</td>
                <td></td>
                <td></td>
                <td className="text-right">{formatCurrency(payroll.grossPay)}</td>
                <td className="text-right">{formatCurrency(payroll.ytdGrossPay)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Deductions Section */}
        <div className="p-6 border-b">
          <h3 className="text-sm font-semibold text-red-600 uppercase mb-4">Deductions</h3>
          <table className="w-full">
            <thead>
              <tr className="text-xs text-gray-500 uppercase">
                <th className="text-left pb-2">Description</th>
                <th className="text-right pb-2">Current</th>
                <th className="text-right pb-2">YTD</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              <tr>
                <td className="py-1">Federal Income Tax</td>
                <td className="text-right text-red-600">{formatCurrency(payroll.federalWithholding)}</td>
                <td className="text-right text-gray-500">{formatCurrency(payroll.ytdFederalTax)}</td>
              </tr>
              <tr>
                <td className="py-1">Social Security</td>
                <td className="text-right text-red-600">{formatCurrency(payroll.socialSecurity)}</td>
                <td className="text-right text-gray-500">{formatCurrency(payroll.ytdSocialSecurity)}</td>
              </tr>
              <tr>
                <td className="py-1">Medicare</td>
                <td className="text-right text-red-600">{formatCurrency(payroll.medicare)}</td>
                <td className="text-right text-gray-500">{formatCurrency(payroll.ytdMedicare)}</td>
              </tr>
              {parseFloat(payroll.stateWithholding) > 0 && (
                <tr>
                  <td className="py-1">State Income Tax</td>
                  <td className="text-right text-red-600">{formatCurrency(payroll.stateWithholding)}</td>
                  <td className="text-right text-gray-500">{formatCurrency(payroll.ytdStateTax)}</td>
                </tr>
              )}
              {parseFloat(payroll.stateDisability) > 0 && (
                <tr>
                  <td className="py-1">State Disability (SDI)</td>
                  <td className="text-right text-red-600">{formatCurrency(payroll.stateDisability)}</td>
                  <td className="text-right text-gray-500">-</td>
                </tr>
              )}
              {parseFloat(payroll.localWithholding) > 0 && (
                <tr>
                  <td className="py-1">Local Tax</td>
                  <td className="text-right text-red-600">{formatCurrency(payroll.localWithholding)}</td>
                  <td className="text-right text-gray-500">-</td>
                </tr>
              )}
              {parseFloat(payroll.retirement401k || '0') > 0 && (
                <tr>
                  <td className="py-1">401(k)</td>
                  <td className="text-right text-red-600">{formatCurrency(payroll.retirement401k || '0')}</td>
                  <td className="text-right text-gray-500">-</td>
                </tr>
              )}
              <tr className="font-bold border-t">
                <td className="py-2">TOTAL DEDUCTIONS</td>
                <td className="text-right text-red-600">{formatCurrency(payroll.totalDeductions)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Net Pay Section */}
        {parseFloat(payroll.employer401kMatch || '0') > 0 && (
          <div className="p-6 border-b bg-emerald-50">
            <h3 className="text-sm font-semibold text-emerald-700 uppercase mb-4">Employer Contributions</h3>
            <table className="w-full">
              <thead>
                <tr className="text-xs text-gray-500 uppercase">
                  <th className="text-left pb-2">Description</th>
                  <th className="text-right pb-2">Current</th>
                  <th className="text-right pb-2">YTD</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                <tr>
                  <td className="py-1">401(k) Match</td>
                  <td className="text-right text-emerald-700">
                    {formatCurrency(payroll.employer401kMatch || '0')}
                  </td>
                  <td className="text-right text-gray-500">-</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <div className="p-6 bg-green-50">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">Year-to-Date Summary</h3>
              <p className="text-sm">Gross Earnings: {formatCurrency(payroll.ytdGrossPay)}</p>
              <p className="text-sm">Total Taxes: {formatCurrency(
                parseFloat(payroll.ytdFederalTax) +
                parseFloat(payroll.ytdSocialSecurity) +
                parseFloat(payroll.ytdMedicare) +
                parseFloat(payroll.ytdStateTax)
              )}</p>
              <p className="text-sm">Net Pay: {formatCurrency(payroll.ytdNetPay)}</p>
            </div>
            <div className="text-right">
              <h3 className="text-xs font-semibold text-green-700 uppercase mb-1">Net Pay</h3>
              <p className="text-4xl font-bold text-green-700">{formatCurrency(payroll.netPay)}</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-100 text-center text-xs text-gray-500">
          This is a computer-generated document. Please retain for your records.
        </div>
      </div>
    </div>
  )
}
