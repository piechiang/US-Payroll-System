// ═══════════════════════════════════════════════════════════════════
// Section 1: IMPORTS
// ═══════════════════════════════════════════════════════════════════
import { useState, useMemo, useCallback } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Disclosure, DisclosureButton, DisclosurePanel } from '@headlessui/react'
import {
  DollarSign, Calculator, Check, Users, TrendingDown,
  ChevronRight, ArrowLeft, FileText, AlertCircle,
  Building2, Banknote, CheckCircle2, RotateCcw, History,
  Loader2, Briefcase
} from 'lucide-react'
import { api } from '../services/api'

// ═══════════════════════════════════════════════════════════════════
// Section 2: TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════
interface Employee {
  id: string
  firstName: string
  lastName: string
  payType: 'HOURLY' | 'SALARY'
  payRate: string
  department: string | null
  jobTitle: string | null
  isActive: boolean
}

interface EmployeesResponse {
  data: Employee[]
  pagination: {
    page: number; limit: number; total: number
    totalPages: number; hasNext: boolean; hasPrev: boolean
  }
}

interface EmployeePayInput {
  hours: number
  overtime: number
  bonus: number
  commission: number
  reimbursements: number
  creditCardTips: number
  cashTips: number
  included: boolean
}

interface PayrollPreview {
  employee: { id: string; name: string }
  payPeriod: { start: string; end: string }
  earnings: {
    regularHours: number; overtimeHours: number
    regularPay: number; overtimePay: number
    bonus: number; commission: number
    creditCardTips: number; cashTips: number; totalTips: number
    grossPay: number
    prorationFactor?: number; proratedAmount?: number
  }
  taxes: {
    federal: {
      incomeTax: number; socialSecurity: number; medicare: number
      medicareAdditional?: number; total: number
    }
    state: {
      incomeTax: number; sdi: number; sui?: number; total: number
    }
    local: {
      cityTax: number; countyTax: number; schoolDistrictTax: number
      otherLocalTax: number; total: number
      details: { cityName: string; taxType: string; rate: number; isResident: boolean }
    } | null
  }
  retirement401k: number
  employer401kMatch: number
  employerTaxes: {
    futa: number; suta: number; socialSecurity: number; medicare: number; total: number
  }
  garnishments: number
  garnishmentDetails?: Array<{ garnishmentId: string; description: string; amount: number }>
  totalEmployeeTaxes: number
  totalDeductions: number
  netPay: number
  reimbursements: number
  totalPay: number
  totalEmployerCost: number
}

interface PayrollRunResponse {
  message: string
  payDate: string
  payPeriod: { start: string; end: string }
  results: PayrollPreview[]
  summary: {
    totalEmployees: number; totalGrossPay: number; totalNetPay: number
    totalEmployeeTaxes: number; totalEmployeeDeductions: number
    totalEmployerTaxes: number; totalEmployerCost: number
  }
}

// ═══════════════════════════════════════════════════════════════════
// Section 3: CONSTANTS & HELPERS
// ═══════════════════════════════════════════════════════════════════
function classNames(...classes: (string | false | undefined | null)[]): string {
  return classes.filter(Boolean).join(' ')
}

const formatCurrency = (amount: number): string =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

const DEFAULT_PAY_INPUT: EmployeePayInput = {
  hours: 0, overtime: 0, bonus: 0, commission: 0,
  reimbursements: 0, creditCardTips: 0, cashTips: 0, included: true,
}

const SALARY_DEFAULT_HOURS = 80

const STEPS = [
  { key: 'setup', label: 'Setup', icon: Calculator },
  { key: 'preview', label: 'Preview', icon: FileText },
  { key: 'complete', label: 'Confirm', icon: Check },
] as const

// ═══════════════════════════════════════════════════════════════════
// Section 4: SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════

// --- 4a. Step Indicator ---
const StepIndicator = ({ currentStep }: { currentStep: string }) => {
  const currentIdx = STEPS.findIndex(s => s.key === currentStep)
  return (
    <div className="mb-8">
      <div className="flex items-center justify-center">
        {STEPS.map((step, idx) => {
          const StepIcon = step.icon
          const isCompleted = idx < currentIdx
          const isCurrent = idx === currentIdx
          return (
            <div key={step.key} className="flex items-center">
              <div className="flex flex-col items-center">
                <div className={classNames(
                  'w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300',
                  isCompleted && 'bg-emerald-500 text-white',
                  isCurrent && 'bg-indigo-600 text-white ring-4 ring-indigo-100',
                  !isCompleted && !isCurrent && 'bg-slate-200 text-slate-400',
                )}>
                  {isCompleted ? <Check className="w-5 h-5" /> : <StepIcon className="w-5 h-5" />}
                </div>
                <span className={classNames(
                  'mt-2 text-xs font-semibold',
                  isCurrent ? 'text-indigo-600' : isCompleted ? 'text-emerald-600' : 'text-slate-400',
                )}>{step.label}</span>
              </div>
              {idx < STEPS.length - 1 && (
                <div className={classNames(
                  'w-24 h-0.5 mx-3 mb-5 transition-colors duration-300',
                  idx < currentIdx ? 'bg-emerald-500' : 'bg-slate-200',
                )} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// --- 4b. KPI Card ---
const KpiCard = ({ title, value, icon: Icon, iconBg, iconColor }: {
  title: string; value: string; icon: React.ElementType
  iconBg: string; iconColor: string
}) => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex items-center gap-4">
    <div className={classNames('w-12 h-12 rounded-xl flex items-center justify-center', iconBg)}>
      <Icon className={classNames('w-6 h-6', iconColor)} />
    </div>
    <div>
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="text-xl font-bold text-slate-900">{value}</p>
    </div>
  </div>
)

// --- 4c. Grid Number Input ---
const GridInput = ({ value, onChange, disabled, step = '0.01', prefix }: {
  value: number; onChange: (v: number) => void; disabled?: boolean; step?: string; prefix?: string
}) => (
  <div className="relative">
    {prefix && (
      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">{prefix}</span>
    )}
    <input
      type="number"
      min="0"
      step={step}
      value={value || ''}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      disabled={disabled}
      className={classNames(
        'w-full px-2 py-1.5 text-sm text-right border border-slate-200 rounded-lg',
        'focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 focus:outline-none',
        'transition-colors',
        disabled && 'bg-slate-50 text-slate-400 cursor-not-allowed',
        prefix && 'pl-5',
      )}
      placeholder="0"
    />
  </div>
)

// --- 4d. Employee Grid Row ---
const EmployeeGridRow = ({ employee, payInput, onChange, onToggleInclude }: {
  employee: Employee
  payInput: EmployeePayInput
  onChange: (field: keyof EmployeePayInput, value: number) => void
  onToggleInclude: () => void
}) => {
  const rate = parseFloat(employee.payRate)
  const isSalary = employee.payType === 'SALARY'

  const estimatedGross = useMemo(() => {
    if (isSalary) {
      const basePeriod = rate / 26
      const otPay = (rate / 2080) * 1.5 * payInput.overtime
      return basePeriod + otPay + payInput.bonus + payInput.commission + payInput.creditCardTips + payInput.cashTips
    }
    const reg = rate * payInput.hours
    const ot = rate * 1.5 * payInput.overtime
    return reg + ot + payInput.bonus + payInput.commission + payInput.creditCardTips + payInput.cashTips
  }, [rate, isSalary, payInput])

  return (
    <tr className={classNames(
      'transition-colors',
      payInput.included ? 'hover:bg-indigo-50/50' : 'opacity-40 bg-slate-50',
    )}>
      <td className="pl-6 pr-2 py-3">
        <input
          type="checkbox"
          checked={payInput.included}
          onChange={onToggleInclude}
          className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-2 focus:ring-indigo-200"
        />
      </td>
      <td className="px-3 py-3">
        <div className="font-medium text-sm text-slate-900">{employee.firstName} {employee.lastName}</div>
        {employee.jobTitle && (
          <div className="text-xs text-slate-400">{employee.jobTitle}</div>
        )}
      </td>
      <td className="px-3 py-3">
        <span className="text-xs text-slate-500">{employee.department || '—'}</span>
      </td>
      <td className="px-3 py-3">
        <span className={classNames(
          'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
          isSalary ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700',
        )}>
          {employee.payType}
        </span>
      </td>
      <td className="px-3 py-3 text-sm text-slate-600 text-right whitespace-nowrap">
        {isSalary
          ? `$${rate.toLocaleString()}/yr`
          : `$${rate.toFixed(2)}/hr`}
      </td>
      <td className="px-2 py-2 w-20">
        {isSalary ? (
          <div className="text-center text-xs text-slate-400 py-1.5">Salaried</div>
        ) : (
          <GridInput value={payInput.hours} onChange={(v) => onChange('hours', v)} step="0.5" />
        )}
      </td>
      <td className="px-2 py-2 w-20">
        <GridInput value={payInput.overtime} onChange={(v) => onChange('overtime', v)} step="0.5" />
      </td>
      <td className="px-2 py-2 w-24">
        <GridInput value={payInput.bonus} onChange={(v) => onChange('bonus', v)} prefix="$" />
      </td>
      <td className="px-2 py-2 w-24">
        <GridInput value={payInput.commission} onChange={(v) => onChange('commission', v)} prefix="$" />
      </td>
      <td className="px-2 py-2 w-24">
        <GridInput value={payInput.reimbursements} onChange={(v) => onChange('reimbursements', v)} prefix="$" />
      </td>
      <td className="px-3 py-3 text-right">
        <span className="text-sm font-semibold text-emerald-600 whitespace-nowrap">
          {formatCurrency(estimatedGross)}
        </span>
      </td>
    </tr>
  )
}

// --- 4e. Detail Line in Expanded Preview ---
const DetailLine = ({ label, amount, color = 'text-slate-700' }: {
  label: string; amount: number; color?: string
}) => (
  amount !== 0 ? (
    <div className="flex justify-between py-1">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={classNames('text-xs font-medium', color)}>{formatCurrency(amount)}</span>
    </div>
  ) : null
)

// --- 4f. Expandable Preview Row ---
const ExpandablePreviewRow = ({ preview }: { preview: PayrollPreview }) => (
  <Disclosure>
    {({ open }) => (
      <div className={classNames(
        'transition-colors',
        open ? 'bg-slate-50/50' : 'hover:bg-slate-50/50',
      )}>
        <DisclosureButton className="w-full px-6 py-4 flex items-center gap-4 text-left">
          <ChevronRight className={classNames(
            'w-4 h-4 text-slate-400 transition-transform duration-200 flex-shrink-0',
            open && 'rotate-90',
          )} />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-semibold text-slate-900">{preview.employee.name}</span>
          </div>
          <div className="flex items-center gap-6 text-sm whitespace-nowrap">
            <div className="text-right w-24">
              <div className="text-xs text-slate-400">Gross</div>
              <div className="font-medium text-emerald-600">{formatCurrency(preview.earnings.grossPay)}</div>
            </div>
            <div className="text-right w-24">
              <div className="text-xs text-slate-400">Taxes</div>
              <div className="font-medium text-rose-600">{formatCurrency(preview.totalEmployeeTaxes)}</div>
            </div>
            <div className="text-right w-24">
              <div className="text-xs text-slate-400">Deductions</div>
              <div className="font-medium text-rose-600">{formatCurrency(preview.totalDeductions)}</div>
            </div>
            <div className="text-right w-28">
              <div className="text-xs text-slate-400">Net Pay</div>
              <div className="font-bold text-slate-900">{formatCurrency(preview.netPay)}</div>
            </div>
          </div>
        </DisclosureButton>

        <DisclosurePanel className="px-6 pb-5 animate-fade-in">
          <div className="ml-8 grid grid-cols-1 md:grid-cols-3 gap-6 bg-white rounded-xl border border-slate-200 p-5">
            {/* Earnings Breakdown */}
            <div>
              <h4 className="text-xs font-bold text-emerald-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5" /> Earnings
              </h4>
              <div className="space-y-0.5">
                <DetailLine label="Regular Pay" amount={preview.earnings.regularPay} color="text-emerald-600" />
                <DetailLine label="Overtime Pay" amount={preview.earnings.overtimePay} color="text-emerald-600" />
                <DetailLine label="Bonus" amount={preview.earnings.bonus} color="text-emerald-600" />
                <DetailLine label="Commission" amount={preview.earnings.commission} color="text-emerald-600" />
                <DetailLine label="Credit Card Tips" amount={preview.earnings.creditCardTips} color="text-emerald-600" />
                <DetailLine label="Cash Tips" amount={preview.earnings.cashTips} color="text-emerald-600" />
                <div className="border-t border-slate-200 mt-2 pt-2 flex justify-between">
                  <span className="text-xs font-bold text-slate-700">Gross Pay</span>
                  <span className="text-xs font-bold text-emerald-700">{formatCurrency(preview.earnings.grossPay)}</span>
                </div>
              </div>
            </div>

            {/* Tax Breakdown */}
            <div>
              <h4 className="text-xs font-bold text-rose-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <TrendingDown className="w-3.5 h-3.5" /> Taxes & Deductions
              </h4>
              <div className="space-y-0.5">
                <DetailLine label="Federal Income Tax" amount={preview.taxes.federal.incomeTax} color="text-rose-600" />
                <DetailLine label="Social Security" amount={preview.taxes.federal.socialSecurity} color="text-rose-600" />
                <DetailLine label="Medicare" amount={preview.taxes.federal.medicare} color="text-rose-600" />
                {preview.taxes.federal.medicareAdditional && (
                  <DetailLine label="Additional Medicare" amount={preview.taxes.federal.medicareAdditional} color="text-rose-600" />
                )}
                <DetailLine label="State Income Tax" amount={preview.taxes.state.incomeTax} color="text-rose-600" />
                <DetailLine label="State Disability (SDI)" amount={preview.taxes.state.sdi} color="text-rose-600" />
                {preview.taxes.local && (
                  <DetailLine label={`Local Tax (${preview.taxes.local.details.cityName})`} amount={preview.taxes.local.total} color="text-rose-600" />
                )}
                <DetailLine label="401(k) Contribution" amount={preview.retirement401k} color="text-rose-600" />
                {preview.garnishments > 0 && (
                  <DetailLine label="Garnishments" amount={preview.garnishments} color="text-rose-600" />
                )}
                <div className="border-t border-slate-200 mt-2 pt-2 flex justify-between">
                  <span className="text-xs font-bold text-slate-700">Total Deductions</span>
                  <span className="text-xs font-bold text-rose-700">{formatCurrency(preview.totalDeductions)}</span>
                </div>
              </div>
            </div>

            {/* Employer Costs */}
            <div>
              <h4 className="text-xs font-bold text-indigo-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5" /> Employer Cost
              </h4>
              <div className="space-y-0.5">
                <DetailLine label="SS Match" amount={preview.employerTaxes.socialSecurity} color="text-indigo-600" />
                <DetailLine label="Medicare Match" amount={preview.employerTaxes.medicare} color="text-indigo-600" />
                <DetailLine label="FUTA" amount={preview.employerTaxes.futa} color="text-indigo-600" />
                <DetailLine label="SUTA" amount={preview.employerTaxes.suta} color="text-indigo-600" />
                <DetailLine label="401(k) Match" amount={preview.employer401kMatch} color="text-indigo-600" />
                <div className="border-t border-slate-200 mt-2 pt-2 flex justify-between">
                  <span className="text-xs font-bold text-slate-700">Total Employer Cost</span>
                  <span className="text-xs font-bold text-indigo-700">{formatCurrency(preview.totalEmployerCost)}</span>
                </div>
              </div>
            </div>
          </div>
        </DisclosurePanel>
      </div>
    )}
  </Disclosure>
)

// --- 4g. Employer Cost Section ---
const EmployerCostSection = ({ totals }: {
  totals: { employerTaxes: number; employer401k: number; totalEmployerCost: number; gross: number }
}) => (
  <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-6">
    <h3 className="text-sm font-bold text-indigo-900 uppercase tracking-wider mb-4 flex items-center gap-2">
      <Building2 className="w-4 h-4" /> Employer Cost Summary
    </h3>
    <div className="space-y-3">
      <div className="flex justify-between text-sm">
        <span className="text-indigo-700">Employer Taxes (FICA + FUTA + SUTA)</span>
        <span className="font-semibold text-indigo-900">{formatCurrency(totals.employerTaxes)}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span className="text-indigo-700">401(k) Employer Match</span>
        <span className="font-semibold text-indigo-900">{formatCurrency(totals.employer401k)}</span>
      </div>
      <div className="border-t border-indigo-200 pt-3 flex justify-between">
        <span className="text-sm font-bold text-indigo-900">Total Employer Burden</span>
        <span className="text-sm font-bold text-indigo-900">{formatCurrency(totals.employerTaxes + totals.employer401k)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-sm font-bold text-indigo-900">Total Payroll Cost (Gross + Employer)</span>
        <span className="text-lg font-bold text-indigo-900">{formatCurrency(totals.totalEmployerCost)}</span>
      </div>
    </div>
  </div>
)

// --- 4h. Completion Step ---
const CompletionStep = ({ runResponse, payDate, onRunAnother }: {
  runResponse: PayrollRunResponse | null
  payDate: string
  onRunAnother: () => void
}) => {
  const summary = runResponse?.summary
  return (
    <div className="animate-fade-in">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm py-12 px-8 text-center">
        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-fade-in">
          <CheckCircle2 className="w-10 h-10 text-emerald-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">Payroll Processed Successfully</h2>
        <p className="text-slate-500 mb-8">
          Payroll for <span className="font-semibold text-slate-700">{summary?.totalEmployees || 0} employees</span> has been processed for pay date <span className="font-semibold text-slate-700">{payDate}</span>.
        </p>

        {summary && (
          <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto mb-8">
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-xs text-slate-400 mb-1">Gross Pay</div>
              <div className="text-sm font-bold text-slate-900">{formatCurrency(summary.totalGrossPay)}</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-xs text-slate-400 mb-1">Deductions</div>
              <div className="text-sm font-bold text-rose-600">{formatCurrency(summary.totalEmployeeDeductions)}</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-xs text-slate-400 mb-1">Net Pay</div>
              <div className="text-sm font-bold text-emerald-600">{formatCurrency(summary.totalNetPay)}</div>
            </div>
          </div>
        )}

        <div className="flex justify-center gap-3">
          <Link
            to="/payroll/history"
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <History className="w-4 h-4" />
            View History
          </Link>
          <button
            onClick={onRunAnother}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Run Another Payroll
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Section 5: MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════
export default function RunPayroll() {
  const [step, setStep] = useState<'setup' | 'preview' | 'complete'>('setup')
  const [selectedCompany, setSelectedCompany] = useState('')
  const [payPeriodStart, setPayPeriodStart] = useState('')
  const [payPeriodEnd, setPayPeriodEnd] = useState('')
  const [payDate, setPayDate] = useState('')
  const [employeePayInputs, setEmployeePayInputs] = useState<Record<string, EmployeePayInput>>({})
  const [previews, setPreviews] = useState<PayrollPreview[]>([])
  const [runResponse, setRunResponse] = useState<PayrollRunResponse | null>(null)
  const [calculateError, setCalculateError] = useState<string | null>(null)

  // --- Queries ---
  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: () => api.get('/companies').then(res => res.data),
  })

  const { data: employeesResponse } = useQuery<EmployeesResponse>({
    queryKey: ['employees', selectedCompany],
    queryFn: () => api.get(`/employees?companyId=${selectedCompany}&limit=500`).then(res => res.data),
    enabled: !!selectedCompany,
  })

  const employees = employeesResponse?.data?.filter(e => e.isActive) || []

  // --- Derived State ---
  const getInput = useCallback((id: string): EmployeePayInput => {
    return employeePayInputs[id] || DEFAULT_PAY_INPUT
  }, [employeePayInputs])

  const includedEmployees = useMemo(() =>
    employees.filter(emp => getInput(emp.id).included),
    [employees, getInput]
  )

  const allSelected = useMemo(() =>
    employees.length > 0 && employees.every(emp => getInput(emp.id).included),
    [employees, getInput]
  )

  const totals = useMemo(() => ({
    employees: previews.length,
    gross: previews.reduce((s, p) => s + p.earnings.grossPay, 0),
    deductions: previews.reduce((s, p) => s + p.totalDeductions, 0),
    net: previews.reduce((s, p) => s + p.netPay, 0),
    employerTaxes: previews.reduce((s, p) => s + (p.employerTaxes?.total || 0), 0),
    employer401k: previews.reduce((s, p) => s + (p.employer401kMatch || 0), 0),
    totalEmployerCost: previews.reduce((s, p) => s + (p.totalEmployerCost || 0), 0),
  }), [previews])

  const canCalculate = selectedCompany && payPeriodStart && payPeriodEnd && payDate && includedEmployees.length > 0

  // --- Mutations ---
  const calculateMutation = useMutation({
    mutationFn: async () => {
      setCalculateError(null)
      const promises = includedEmployees.map(employee => {
        const input = getInput(employee.id)
        return api.post('/payroll/calculate', {
          employeeId: employee.id,
          payPeriodStart,
          payPeriodEnd,
          hoursWorked: employee.payType === 'SALARY' ? SALARY_DEFAULT_HOURS : input.hours,
          overtimeHours: input.overtime,
          bonus: input.bonus,
          commission: input.commission,
          reimbursements: input.reimbursements,
          creditCardTips: input.creditCardTips,
          cashTips: input.cashTips,
        }).then(res => res.data as PayrollPreview)
      })
      return Promise.all(promises)
    },
    onSuccess: (data) => { setPreviews(data); setStep('preview') },
    onError: (error: any) => {
      setCalculateError(error.response?.data?.message || error.response?.data?.error || 'Calculation failed. Please check employee data and try again.')
    },
  })

  const runPayrollMutation = useMutation({
    mutationFn: () => {
      return api.post('/payroll/run', {
        companyId: selectedCompany,
        payPeriodStart,
        payPeriodEnd,
        payDate,
        employeePayData: includedEmployees.map(emp => {
          const input = getInput(emp.id)
          return {
            employeeId: emp.id,
            hoursWorked: emp.payType === 'SALARY' ? SALARY_DEFAULT_HOURS : input.hours,
            overtimeHours: input.overtime,
            bonus: input.bonus,
            commission: input.commission,
            reimbursements: input.reimbursements,
            creditCardTips: input.creditCardTips,
            cashTips: input.cashTips,
          }
        }),
      }).then(res => res.data as PayrollRunResponse)
    },
    onSuccess: (data) => { setRunResponse(data); setStep('complete') },
  })

  // --- Handlers ---
  const handlePayInputChange = useCallback((
    employeeId: string, field: keyof EmployeePayInput, value: number | boolean
  ) => {
    setEmployeePayInputs(prev => ({
      ...prev,
      [employeeId]: { ...DEFAULT_PAY_INPUT, ...prev[employeeId], [field]: value },
    }))
  }, [])

  const handleToggleAll = useCallback((included: boolean) => {
    setEmployeePayInputs(prev => {
      const next = { ...prev }
      employees.forEach(emp => {
        next[emp.id] = { ...DEFAULT_PAY_INPUT, ...next[emp.id], included }
      })
      return next
    })
  }, [employees])

  const handleReset = useCallback(() => {
    setStep('setup')
    setPreviews([])
    setRunResponse(null)
    setEmployeePayInputs({})
    setCalculateError(null)
  }, [])

  // --- Render ---
  return (
    <div className="max-w-7xl mx-auto animate-fade-in">
      {/* Page Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Run Payroll</h1>
          <p className="mt-1 text-sm text-slate-500 font-medium">Process payroll for your employees</p>
        </div>
        {step === 'setup' && includedEmployees.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-lg">
            <Users className="w-4 h-4 text-indigo-600" />
            <span className="text-sm font-medium text-indigo-700">{includedEmployees.length} employee{includedEmployees.length !== 1 ? 's' : ''} selected</span>
          </div>
        )}
      </div>

      {/* Step Indicator */}
      <StepIndicator currentStep={step} />

      {/* ═══════════════ STEP 1: SETUP ═══════════════ */}
      {step === 'setup' && (
        <div className="space-y-6 animate-fade-in">
          {/* Payroll Setup Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-indigo-600" /> Payroll Setup
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Company <span className="text-rose-500">*</span></label>
                <select
                  value={selectedCompany}
                  onChange={(e) => { setSelectedCompany(e.target.value); setEmployeePayInputs({}) }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:border-indigo-500 focus:ring-indigo-200 text-sm"
                >
                  <option value="">Select a company</option>
                  {companies.map((c: { id: string; name: string }) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Period Start <span className="text-rose-500">*</span></label>
                <input type="date" value={payPeriodStart} onChange={(e) => setPayPeriodStart(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:border-indigo-500 focus:ring-indigo-200 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Period End <span className="text-rose-500">*</span></label>
                <input type="date" value={payPeriodEnd} onChange={(e) => setPayPeriodEnd(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:border-indigo-500 focus:ring-indigo-200 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Pay Date <span className="text-rose-500">*</span></label>
                <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:border-indigo-500 focus:ring-indigo-200 text-sm" />
              </div>
            </div>
          </div>

          {/* Employee Hours & Compensation Grid */}
          {selectedCompany && employees.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                  <Users className="w-5 h-5 text-indigo-600" /> Employee Hours & Compensation
                </h2>
                <span className="bg-indigo-100 text-indigo-700 text-xs font-bold px-2.5 py-1 rounded-full">
                  {includedEmployees.length} / {employees.length}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="pl-6 pr-2 py-3 text-left">
                        <input type="checkbox" checked={allSelected}
                          onChange={(e) => handleToggleAll(e.target.checked)}
                          className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-2 focus:ring-indigo-200" />
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Employee</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Dept</th>
                      <th className="px-3 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Rate</th>
                      <th className="px-2 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Hours</th>
                      <th className="px-2 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">OT</th>
                      <th className="px-2 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Bonus</th>
                      <th className="px-2 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Comm.</th>
                      <th className="px-2 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Reimb.</th>
                      <th className="px-3 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Est. Gross</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {employees.map(emp => (
                      <EmployeeGridRow
                        key={emp.id}
                        employee={emp}
                        payInput={getInput(emp.id)}
                        onChange={(field, val) => handlePayInputChange(emp.id, field, val)}
                        onToggleInclude={() => handlePayInputChange(emp.id, 'included', !getInput(emp.id).included)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {employees.length === 0 && (
                <div className="text-center py-12 text-slate-400">
                  <Users className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">No active employees found for this company</p>
                </div>
              )}
            </div>
          )}

          {/* Empty state when no company selected */}
          {!selectedCompany && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm py-16 text-center">
              <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 text-sm">Select a company to load employees</p>
            </div>
          )}

          {/* Error Display */}
          {calculateError && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3 animate-fade-in">
              <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-rose-900">Calculation Error</p>
                <p className="text-sm text-rose-700 mt-1">{calculateError}</p>
              </div>
            </div>
          )}

          {runPayrollMutation.isError && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 flex items-start gap-3 animate-fade-in">
              <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-rose-900">Processing Error</p>
                <p className="text-sm text-rose-700 mt-1">
                  {(runPayrollMutation.error as any)?.response?.data?.message || 'Failed to process payroll. Please try again.'}
                </p>
              </div>
            </div>
          )}

          {/* Action Bar */}
          <div className="flex justify-end">
            <button
              onClick={() => calculateMutation.mutate()}
              disabled={!canCalculate || calculateMutation.isPending}
              className={classNames(
                'flex items-center gap-2 px-6 py-2.5 text-sm font-medium rounded-lg transition-all shadow-sm',
                canCalculate && !calculateMutation.isPending
                  ? 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-md'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed',
              )}
            >
              {calculateMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Calculating...</>
              ) : (
                <><Calculator className="w-4 h-4" /> Calculate Payroll</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════ STEP 2: PREVIEW ═══════════════ */}
      {step === 'preview' && (
        <div className="space-y-6 animate-fade-in">
          {/* Summary KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard title="Employees" value={String(totals.employees)} icon={Users} iconBg="bg-indigo-100" iconColor="text-indigo-600" />
            <KpiCard title="Gross Pay" value={formatCurrency(totals.gross)} icon={DollarSign} iconBg="bg-emerald-100" iconColor="text-emerald-600" />
            <KpiCard title="Total Deductions" value={formatCurrency(totals.deductions)} icon={TrendingDown} iconBg="bg-rose-100" iconColor="text-rose-600" />
            <KpiCard title="Net Pay" value={formatCurrency(totals.net)} icon={Banknote} iconBg="bg-blue-100" iconColor="text-blue-600" />
          </div>

          {/* Employee Detail Table with Expandable Rows */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Payroll Detail</h2>
              <p className="text-xs text-slate-400">Click a row to expand details</p>
            </div>

            {/* Table Header */}
            <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-4">
              <div className="w-4" /> {/* Chevron spacer */}
              <div className="flex-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">Employee</div>
              <div className="flex items-center gap-6 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <div className="text-right w-24">Gross</div>
                <div className="text-right w-24">Taxes</div>
                <div className="text-right w-24">Deductions</div>
                <div className="text-right w-28">Net Pay</div>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {previews.map(preview => (
                <ExpandablePreviewRow key={preview.employee.id} preview={preview} />
              ))}
            </div>
          </div>

          {/* Employer Cost Summary */}
          <EmployerCostSection totals={totals} />

          {/* Action Bar */}
          <div className="flex justify-between">
            <button
              onClick={() => setStep('setup')}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Edit
            </button>
            <button
              onClick={() => runPayrollMutation.mutate()}
              disabled={runPayrollMutation.isPending}
              className={classNames(
                'flex items-center gap-2 px-6 py-2.5 text-sm font-medium rounded-lg transition-all shadow-sm',
                runPayrollMutation.isPending
                  ? 'bg-indigo-400 text-white cursor-wait'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-md',
              )}
            >
              {runPayrollMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
              ) : (
                <><DollarSign className="w-4 h-4" /> Process Payroll</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════ STEP 3: COMPLETE ═══════════════ */}
      {step === 'complete' && (
        <CompletionStep
          runResponse={runResponse}
          payDate={payDate}
          onRunAnother={handleReset}
        />
      )}
    </div>
  )
}
