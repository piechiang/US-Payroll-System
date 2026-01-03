import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Tab } from '@headlessui/react'
import { User, Briefcase, FileText, Building2, MapPin, Save, X, CheckCircle2, AlertCircle } from 'lucide-react'
import { api } from '../services/api'

interface EmployeeFormData {
  firstName: string
  lastName: string
  email: string
  ssn: string
  dateOfBirth: string
  hireDate: string
  department: string
  jobTitle: string
  payType: 'HOURLY' | 'SALARY'
  payRate: number
  filingStatus: string
  allowances: number
  additionalWithholding: number
  otherIncome: number
  deductions: number
  retirement401kType?: 'PERCENT' | 'FIXED' | null
  retirement401kRate?: number | null
  retirement401kAmount?: number | null
  address: string
  city: string
  county?: string
  state: string
  zipCode: string
  workCity?: string
  workState?: string
  localResident?: boolean
  companyId: string
}

const US_STATES = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' }, { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' }, { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' }, { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' }, { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' }, { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' }, { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' }, { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' }, { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' }, { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' }, { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' }, { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' }, { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' }, { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' }, { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' }, { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' },
]

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ')
}

export default function EmployeeForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isEditing = Boolean(id)
  const [selectedTab, setSelectedTab] = useState(0)

  const { register, handleSubmit, formState: { errors }, watch, setValue } = useForm<EmployeeFormData>()
  const watchState = watch('state')
  const watchWorkCity = watch('workCity')
  const watchWorkState = watch('workState')
  const watch401kType = watch('retirement401kType')

  useEffect(() => {
    if (watch401kType !== 'PERCENT') {
      setValue('retirement401kRate', null)
    }
    if (watch401kType !== 'FIXED') {
      setValue('retirement401kAmount', null)
    }
  }, [watch401kType, setValue])

  // Fetch companies for dropdown
  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: () => api.get('/companies').then(res => res.data)
  })

  // Fetch employee data if editing
  const { data: employee } = useQuery({
    queryKey: ['employee', id],
    queryFn: () => api.get(`/employees/${id}`).then(res => res.data),
    enabled: isEditing,
  })

  // Populate form when editing
  useEffect(() => {
    if (employee && isEditing) {
      Object.keys(employee).forEach((key) => {
        setValue(key as keyof EmployeeFormData, employee[key])
      })
    }
  }, [employee, isEditing, setValue])

  // Create/Update mutation
  const mutation = useMutation({
    mutationFn: (data: EmployeeFormData) => {
      if (isEditing) {
        return api.put(`/employees/${id}`, data)
      }
      return api.post('/employees', data)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] })
      navigate('/employees')
    }
  })

  const onSubmit = (data: EmployeeFormData) => {
    mutation.mutate(data)
  }

  const tabs = [
    { name: 'Personal', icon: User, fields: ['firstName', 'lastName', 'email', 'ssn', 'dateOfBirth', 'hireDate'] },
    { name: 'Employment', icon: Briefcase, fields: ['companyId', 'department', 'jobTitle', 'payType', 'payRate'] },
    { name: 'Tax (W-4)', icon: FileText, fields: ['filingStatus', 'allowances', 'additionalWithholding', 'otherIncome', 'deductions'] },
    { name: 'Retirement', icon: Building2, fields: ['retirement401kType', 'retirement401kRate', 'retirement401kAmount'] },
    { name: 'Address', icon: MapPin, fields: ['address', 'city', 'county', 'state', 'zipCode', 'workCity', 'workState', 'localResident'] },
  ]

  // Check if tab has errors
  const tabHasErrors = (tabFields: string[]) => {
    return tabFields.some(field => errors[field as keyof typeof errors])
  }

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              {isEditing ? 'Edit Employee' : 'Add New Employee'}
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              {isEditing ? 'Update employee information across all categories.' : 'Enter employee information and W-4 details to get started.'}
            </p>
          </div>
          {isEditing && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span className="text-sm font-medium text-emerald-700">Editing Mode</span>
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <Tab.Group selectedIndex={selectedTab} onChange={setSelectedTab}>
            <div className="border-b border-slate-200 bg-slate-50">
              <Tab.List className="flex space-x-1 px-6">
                {tabs.map((tab, idx) => (
                  <Tab
                    key={tab.name}
                    className={({ selected }) =>
                      classNames(
                        'relative px-4 py-4 text-sm font-medium transition-all duration-200 focus:outline-none',
                        'flex items-center gap-2',
                        selected
                          ? 'text-indigo-600 border-b-2 border-indigo-600'
                          : 'text-slate-600 hover:text-slate-900 border-b-2 border-transparent hover:border-slate-300'
                      )
                    }
                  >
                    {({ selected }) => (
                      <>
                        <tab.icon className={classNames(
                          'w-4 h-4 transition-colors',
                          selected ? 'text-indigo-600' : 'text-slate-400'
                        )} />
                        {tab.name}
                        {tabHasErrors(tab.fields) && (
                          <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                        )}
                      </>
                    )}
                  </Tab>
                ))}
              </Tab.List>
            </div>

            <Tab.Panels className="p-6">
              {/* Personal Information Tab */}
              <Tab.Panel className="space-y-6 animate-fade-in">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      First Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      {...register('firstName', { required: 'First name is required' })}
                      className={classNames(
                        'w-full px-3 py-2 border rounded-lg transition-colors focus:outline-none focus:ring-2',
                        errors.firstName
                          ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200'
                          : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-200'
                      )}
                      placeholder="John"
                    />
                    {errors.firstName && (
                      <p className="mt-1 text-sm text-rose-600">{errors.firstName.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Last Name <span className="text-rose-500">*</span>
                    </label>
                    <input
                      {...register('lastName', { required: 'Last name is required' })}
                      className={classNames(
                        'w-full px-3 py-2 border rounded-lg transition-colors focus:outline-none focus:ring-2',
                        errors.lastName
                          ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200'
                          : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-200'
                      )}
                      placeholder="Doe"
                    />
                    {errors.lastName && (
                      <p className="mt-1 text-sm text-rose-600">{errors.lastName.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Email <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="email"
                      {...register('email', {
                        required: 'Email is required',
                        pattern: {
                          value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                          message: 'Invalid email address'
                        }
                      })}
                      className={classNames(
                        'w-full px-3 py-2 border rounded-lg transition-colors focus:outline-none focus:ring-2',
                        errors.email
                          ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200'
                          : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-200'
                      )}
                      placeholder="john.doe@company.com"
                    />
                    {errors.email && (
                      <p className="mt-1 text-sm text-rose-600">{errors.email.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      SSN <span className="text-rose-500">*</span>
                    </label>
                    <input
                      {...register('ssn', {
                        required: 'SSN is required',
                        pattern: {
                          value: /^\d{3}-\d{2}-\d{4}$/,
                          message: 'Format: XXX-XX-XXXX'
                        }
                      })}
                      placeholder="123-45-6789"
                      className={classNames(
                        'w-full px-3 py-2 border rounded-lg transition-colors focus:outline-none focus:ring-2 font-mono',
                        errors.ssn
                          ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200'
                          : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-200'
                      )}
                    />
                    {errors.ssn && (
                      <p className="mt-1 text-sm text-rose-600">{errors.ssn.message}</p>
                    )}
                    <p className="mt-1 text-xs text-slate-500">Encrypted and secured in database</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Date of Birth <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      {...register('dateOfBirth', { required: 'Date of birth is required' })}
                      className={classNames(
                        'w-full px-3 py-2 border rounded-lg transition-colors focus:outline-none focus:ring-2',
                        errors.dateOfBirth
                          ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200'
                          : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-200'
                      )}
                    />
                    {errors.dateOfBirth && (
                      <p className="mt-1 text-sm text-rose-600">{errors.dateOfBirth.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Hire Date <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      {...register('hireDate', { required: 'Hire date is required' })}
                      className={classNames(
                        'w-full px-3 py-2 border rounded-lg transition-colors focus:outline-none focus:ring-2',
                        errors.hireDate
                          ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200'
                          : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-200'
                      )}
                    />
                    {errors.hireDate && (
                      <p className="mt-1 text-sm text-rose-600">{errors.hireDate.message}</p>
                    )}
                  </div>
                </div>
              </Tab.Panel>

              {/* Employment Details Tab */}
              <Tab.Panel className="space-y-6 animate-fade-in">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Company <span className="text-rose-500">*</span>
                    </label>
                    <select
                      {...register('companyId', { required: 'Company is required' })}
                      className={classNames(
                        'w-full px-3 py-2 border rounded-lg transition-colors focus:outline-none focus:ring-2',
                        errors.companyId
                          ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200'
                          : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-200'
                      )}
                    >
                      <option value="">Select a company</option>
                      {companies.map((company: { id: string; name: string }) => (
                        <option key={company.id} value={company.id}>{company.name}</option>
                      ))}
                    </select>
                    {errors.companyId && (
                      <p className="mt-1 text-sm text-rose-600">{errors.companyId.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Department</label>
                    <input
                      {...register('department')}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:border-indigo-500 focus:ring-indigo-200"
                      placeholder="Engineering"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Job Title</label>
                    <input
                      {...register('jobTitle')}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:border-indigo-500 focus:ring-indigo-200"
                      placeholder="Software Engineer"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Pay Type <span className="text-rose-500">*</span>
                    </label>
                    <select
                      {...register('payType', { required: 'Pay type is required' })}
                      className={classNames(
                        'w-full px-3 py-2 border rounded-lg transition-colors focus:outline-none focus:ring-2',
                        errors.payType
                          ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200'
                          : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-200'
                      )}
                    >
                      <option value="HOURLY">Hourly</option>
                      <option value="SALARY">Salary</option>
                    </select>
                    {errors.payType && (
                      <p className="mt-1 text-sm text-rose-600">{errors.payType.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Pay Rate <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      {...register('payRate', {
                        required: 'Pay rate is required',
                        min: { value: 0, message: 'Pay rate must be positive' },
                        setValueAs: value => value === '' ? undefined : Number(value)
                      })}
                      className={classNames(
                        'w-full px-3 py-2 border rounded-lg transition-colors focus:outline-none focus:ring-2',
                        errors.payRate
                          ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200'
                          : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-200'
                      )}
                      placeholder="25.00"
                    />
                    {errors.payRate && (
                      <p className="mt-1 text-sm text-rose-600">{errors.payRate.message}</p>
                    )}
                    <p className="mt-1 text-xs text-slate-500">
                      {watch('payType') === 'HOURLY' ? 'Hourly rate ($/hour)' : 'Annual salary ($)'}
                    </p>
                  </div>
                </div>
              </Tab.Panel>

              {/* W-4 Tax Information Tab */}
              <Tab.Panel className="space-y-6 animate-fade-in">
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-6">
                  <p className="text-sm text-indigo-900">
                    <strong>W-4 Form:</strong> This information determines federal tax withholding based on the employee's Form W-4.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Filing Status <span className="text-rose-500">*</span>
                    </label>
                    <select
                      {...register('filingStatus', { required: 'Filing status is required' })}
                      className={classNames(
                        'w-full px-3 py-2 border rounded-lg transition-colors focus:outline-none focus:ring-2',
                        errors.filingStatus
                          ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200'
                          : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-200'
                      )}
                    >
                      <option value="SINGLE">Single</option>
                      <option value="MARRIED_FILING_JOINTLY">Married Filing Jointly</option>
                      <option value="MARRIED_FILING_SEPARATELY">Married Filing Separately</option>
                      <option value="HEAD_OF_HOUSEHOLD">Head of Household</option>
                    </select>
                    {errors.filingStatus && (
                      <p className="mt-1 text-sm text-rose-600">{errors.filingStatus.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Dependents (Step 3)
                    </label>
                    <input
                      type="number"
                      {...register('allowances', {
                        min: { value: 0, message: 'Cannot be negative' },
                        setValueAs: value => value === '' ? 0 : Number(value)
                      })}
                      defaultValue={0}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:border-indigo-500 focus:ring-indigo-200"
                    />
                    <p className="mt-1 text-xs text-slate-500">Number of qualifying dependents</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Additional Withholding (Step 4c)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      {...register('additionalWithholding', {
                        min: { value: 0, message: 'Cannot be negative' },
                        setValueAs: value => value === '' ? 0 : Number(value)
                      })}
                      defaultValue={0}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:border-indigo-500 focus:ring-indigo-200"
                      placeholder="0.00"
                    />
                    <p className="mt-1 text-xs text-slate-500">Extra amount per pay period</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Other Income (Step 4a, annual)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      {...register('otherIncome', {
                        min: { value: 0, message: 'Cannot be negative' },
                        setValueAs: value => value === '' ? 0 : Number(value)
                      })}
                      defaultValue={0}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:border-indigo-500 focus:ring-indigo-200"
                      placeholder="0.00"
                    />
                    <p className="mt-1 text-xs text-slate-500">Income not from jobs (annual)</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Deductions (Step 4b, annual)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      {...register('deductions', {
                        min: { value: 0, message: 'Cannot be negative' },
                        setValueAs: value => value === '' ? 0 : Number(value)
                      })}
                      defaultValue={0}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:border-indigo-500 focus:ring-indigo-200"
                      placeholder="0.00"
                    />
                    <p className="mt-1 text-xs text-slate-500">Beyond standard deduction (annual)</p>
                  </div>
                </div>
              </Tab.Panel>

              {/* Retirement (401k) Tab */}
              <Tab.Panel className="space-y-6 animate-fade-in">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Contribution Type
                    </label>
                    <select
                      {...register('retirement401kType', {
                        setValueAs: value => value === '' ? null : value
                      })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:border-indigo-500 focus:ring-indigo-200"
                    >
                      <option value="">None</option>
                      <option value="PERCENT">Percent of gross pay</option>
                      <option value="FIXED">Flat amount per pay period</option>
                    </select>
                  </div>

                  {watch401kType === 'PERCENT' && (
                    <div className="md:col-span-2 animate-fade-in">
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Contribution Rate (%) <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        {...register('retirement401kRate', {
                          min: { value: 0, message: 'Cannot be negative' },
                          max: { value: 100, message: 'Cannot exceed 100%' },
                          setValueAs: value => value === '' ? null : Number(value),
                          validate: value => {
                            if (watch401kType === 'PERCENT' && (value === null || value === undefined)) {
                              return 'Rate is required for percent-based contributions'
                            }
                            return true
                          }
                        })}
                        className={classNames(
                          'w-full px-3 py-2 border rounded-lg transition-colors focus:outline-none focus:ring-2',
                          errors.retirement401kRate
                            ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200'
                            : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-200'
                        )}
                        placeholder="5.00"
                      />
                      {errors.retirement401kRate && (
                        <p className="mt-1 text-sm text-rose-600">{errors.retirement401kRate.message}</p>
                      )}
                      <p className="mt-1 text-xs text-slate-500">Percentage of gross pay (e.g., 5% = 5.00)</p>
                    </div>
                  )}

                  {watch401kType === 'FIXED' && (
                    <div className="md:col-span-2 animate-fade-in">
                      <label className="block text-sm font-medium text-slate-700 mb-2">
                        Contribution Amount (per pay period) <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        {...register('retirement401kAmount', {
                          min: { value: 0, message: 'Cannot be negative' },
                          setValueAs: value => value === '' ? null : Number(value),
                          validate: value => {
                            if (watch401kType === 'FIXED' && (value === null || value === undefined)) {
                              return 'Amount is required for flat contributions'
                            }
                            return true
                          }
                        })}
                        className={classNames(
                          'w-full px-3 py-2 border rounded-lg transition-colors focus:outline-none focus:ring-2',
                          errors.retirement401kAmount
                            ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200'
                            : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-200'
                        )}
                        placeholder="200.00"
                      />
                      {errors.retirement401kAmount && (
                        <p className="mt-1 text-sm text-rose-600">{errors.retirement401kAmount.message}</p>
                      )}
                      <p className="mt-1 text-xs text-slate-500">Fixed dollar amount deducted each pay period</p>
                    </div>
                  )}

                  {!watch401kType && (
                    <div className="md:col-span-2 text-center py-8">
                      <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                      <p className="text-sm text-slate-500">Select a contribution type to configure 401(k) deductions</p>
                    </div>
                  )}
                </div>
              </Tab.Panel>

              {/* Address Tab */}
              <Tab.Panel className="space-y-6 animate-fade-in">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      Street Address <span className="text-rose-500">*</span>
                    </label>
                    <input
                      {...register('address', { required: 'Address is required' })}
                      className={classNames(
                        'w-full px-3 py-2 border rounded-lg transition-colors focus:outline-none focus:ring-2',
                        errors.address
                          ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200'
                          : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-200'
                      )}
                      placeholder="123 Main Street"
                    />
                    {errors.address && (
                      <p className="mt-1 text-sm text-rose-600">{errors.address.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      City <span className="text-rose-500">*</span>
                    </label>
                    <input
                      {...register('city', { required: 'City is required' })}
                      className={classNames(
                        'w-full px-3 py-2 border rounded-lg transition-colors focus:outline-none focus:ring-2',
                        errors.city
                          ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200'
                          : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-200'
                      )}
                      placeholder="San Francisco"
                    />
                    {errors.city && (
                      <p className="mt-1 text-sm text-rose-600">{errors.city.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      County {watchState === 'MD' && <span className="text-rose-500">*</span>}
                    </label>
                    <input
                      {...register('county', {
                        validate: value => {
                          if (watchState === 'MD' && !value?.trim()) {
                            return 'County is required for Maryland employees'
                          }
                          return true
                        }
                      })}
                      className={classNames(
                        'w-full px-3 py-2 border rounded-lg transition-colors focus:outline-none focus:ring-2',
                        errors.county
                          ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200'
                          : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-200'
                      )}
                      placeholder={watchState === 'MD' ? 'Required for MD local tax' : 'Optional'}
                    />
                    {errors.county && (
                      <p className="mt-1 text-sm text-rose-600">{errors.county.message}</p>
                    )}
                    {watchState === 'MD' && (
                      <p className="mt-1 text-xs text-amber-600">Required for Maryland local tax calculation</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      State <span className="text-rose-500">*</span>
                    </label>
                    <select
                      {...register('state', { required: 'State is required' })}
                      className={classNames(
                        'w-full px-3 py-2 border rounded-lg transition-colors focus:outline-none focus:ring-2',
                        errors.state
                          ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200'
                          : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-200'
                      )}
                    >
                      <option value="">Select a state</option>
                      {US_STATES.map(state => (
                        <option key={state.code} value={state.code}>{state.name}</option>
                      ))}
                    </select>
                    {errors.state && (
                      <p className="mt-1 text-sm text-rose-600">{errors.state.message}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                      ZIP Code <span className="text-rose-500">*</span>
                    </label>
                    <input
                      {...register('zipCode', { required: 'ZIP code is required' })}
                      className={classNames(
                        'w-full px-3 py-2 border rounded-lg transition-colors focus:outline-none focus:ring-2',
                        errors.zipCode
                          ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200'
                          : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-200'
                      )}
                      placeholder="94102"
                    />
                    {errors.zipCode && (
                      <p className="mt-1 text-sm text-rose-600">{errors.zipCode.message}</p>
                    )}
                  </div>

                  {/* Work Location (Local Tax) */}
                  <div className="md:col-span-2 mt-6">
                    <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      Work Location (for Local Tax)
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Work City</label>
                        <input
                          {...register('workCity', {
                            validate: value => {
                              if (value?.trim() && !watchWorkState?.trim()) {
                                return 'Work state is required when work city is provided'
                              }
                              return true
                            }
                          })}
                          className={classNames(
                            'w-full px-3 py-2 border rounded-lg transition-colors focus:outline-none focus:ring-2',
                            errors.workCity
                              ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200'
                              : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-200'
                          )}
                          placeholder="New York City"
                        />
                        {errors.workCity && (
                          <p className="mt-1 text-sm text-rose-600">{errors.workCity.message}</p>
                        )}
                        <p className="mt-1 text-xs text-slate-500">For cities with local tax (NYC, Philadelphia, etc.)</p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">Work State</label>
                        <select
                          {...register('workState', {
                            validate: value => {
                              if (value?.trim() && !watchWorkCity?.trim()) {
                                return 'Work city is required when work state is provided'
                              }
                              return true
                            }
                          })}
                          className={classNames(
                            'w-full px-3 py-2 border rounded-lg transition-colors focus:outline-none focus:ring-2',
                            errors.workState
                              ? 'border-rose-300 focus:border-rose-500 focus:ring-rose-200'
                              : 'border-slate-300 focus:border-indigo-500 focus:ring-indigo-200'
                          )}
                        >
                          <option value="">Select a state</option>
                          {US_STATES.map(state => (
                            <option key={state.code} value={state.code}>{state.name}</option>
                          ))}
                        </select>
                        {errors.workState && (
                          <p className="mt-1 text-sm text-rose-600">{errors.workState.message}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          id="localResident"
                          defaultChecked
                          {...register('localResident')}
                          className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-2 focus:ring-indigo-200"
                        />
                        <label htmlFor="localResident" className="text-sm text-slate-700 select-none">
                          Resident of work city (affects local tax rates)
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </Tab.Panel>
            </Tab.Panels>
          </Tab.Group>
        </div>

        {/* Form Actions */}
        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate('/employees')}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <X className="w-4 h-4" />
            Cancel
          </button>

          <button
            type="submit"
            disabled={mutation.isPending}
            className="flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:bg-indigo-400 transition-colors shadow-sm hover:shadow-md"
          >
            <Save className="w-4 h-4" />
            {mutation.isPending ? 'Saving...' : isEditing ? 'Update Employee' : 'Add Employee'}
          </button>
        </div>

        {/* Error Message */}
        {mutation.isError && (
          <div className="mt-4 bg-rose-50 border border-rose-200 rounded-lg p-4 flex items-start gap-3 animate-fade-in">
            <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-rose-900">Failed to save employee</p>
              <p className="text-sm text-rose-700 mt-1">Please check your information and try again.</p>
            </div>
          </div>
        )}
      </form>
    </div>
  )
}
