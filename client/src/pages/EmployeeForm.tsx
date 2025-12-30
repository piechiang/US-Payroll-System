import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../services/api'
import { useAuth } from '../context/AuthContext'

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

export default function EmployeeForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const isEditing = Boolean(id)
  const { companyId } = useAuth()

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

  useEffect(() => {
    if (!isEditing && companyId) {
      setValue('companyId', companyId)
    }
  }, [companyId, isEditing, setValue])

  // Fetch companies for dropdown
  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: () => api.get('/companies').then(res => res.data)
  })

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

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {isEditing ? 'Edit Employee' : 'Add New Employee'}
        </h1>
        <p className="mt-1 text-sm text-gray-600">
          Enter employee information and W-4 details.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
        {/* Personal Information */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Personal Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="label">First Name *</label>
              <input {...register('firstName', { required: true })} className="input" />
              {errors.firstName && <p className="text-red-500 text-sm mt-1">Required</p>}
            </div>
            <div>
              <label className="label">Last Name *</label>
              <input {...register('lastName', { required: true })} className="input" />
            </div>
            <div>
              <label className="label">Email *</label>
              <input type="email" {...register('email', { required: true })} className="input" />
            </div>
            <div>
              <label className="label">SSN * (XXX-XX-XXXX)</label>
              <input
                {...register('ssn', { required: true, pattern: /^\d{3}-\d{2}-\d{4}$/ })}
                placeholder="123-45-6789"
                className="input"
              />
            </div>
            <div>
              <label className="label">Date of Birth *</label>
              <input type="date" {...register('dateOfBirth', { required: true })} className="input" />
            </div>
            <div>
              <label className="label">Hire Date *</label>
              <input type="date" {...register('hireDate', { required: true })} className="input" />
            </div>
          </div>
        </div>

        {/* Employment Details */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Employment Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="label">Company *</label>
              <select {...register('companyId', { required: true })} className="input">
                <option value="">Select a company</option>
                {companies.map((company: { id: string; name: string }) => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Department</label>
              <input {...register('department')} className="input" />
            </div>
            <div>
              <label className="label">Job Title</label>
              <input {...register('jobTitle')} className="input" />
            </div>
            <div>
              <label className="label">Pay Type *</label>
              <select {...register('payType', { required: true })} className="input">
                <option value="HOURLY">Hourly</option>
                <option value="SALARY">Salary</option>
              </select>
            </div>
            <div>
              <label className="label">Pay Rate * (Hourly rate or Annual salary)</label>
              <input
                type="number"
                step="0.01"
                {...register('payRate', {
                  required: true,
                  min: 0,
                  setValueAs: value => value === '' ? undefined : Number(value)
                })}
                className="input"
              />
            </div>
          </div>
        </div>

        {/* W-4 Information */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">W-4 Tax Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="label">Filing Status *</label>
              <select {...register('filingStatus', { required: true })} className="input">
                <option value="SINGLE">Single</option>
                <option value="MARRIED_FILING_JOINTLY">Married Filing Jointly</option>
                <option value="MARRIED_FILING_SEPARATELY">Married Filing Separately</option>
                <option value="HEAD_OF_HOUSEHOLD">Head of Household</option>
              </select>
            </div>
            <div>
              <label className="label">Dependents (Step 3)</label>
              <input
                type="number"
                {...register('allowances', {
                  min: 0,
                  setValueAs: value => value === '' ? undefined : Number(value)
                })}
                defaultValue={0}
                className="input"
              />
              <p className="text-xs text-gray-500 mt-1">Number of qualifying dependents</p>
            </div>
            <div>
              <label className="label">Additional Withholding (Step 4c)</label>
              <input
                type="number"
                step="0.01"
                {...register('additionalWithholding', {
                  min: 0,
                  setValueAs: value => value === '' ? undefined : Number(value)
                })}
                defaultValue={0}
                className="input"
              />
              <p className="text-xs text-gray-500 mt-1">Extra amount to withhold per pay period</p>
            </div>
            <div>
              <label className="label">Other Income (Step 4a, annual)</label>
              <input
                type="number"
                step="0.01"
                {...register('otherIncome', {
                  min: 0,
                  setValueAs: value => value === '' ? undefined : Number(value)
                })}
                defaultValue={0}
                className="input"
              />
              <p className="text-xs text-gray-500 mt-1">Other income not from jobs (annual)</p>
            </div>
            <div>
              <label className="label">Deductions (Step 4b, annual)</label>
              <input
                type="number"
                step="0.01"
                {...register('deductions', {
                  min: 0,
                  setValueAs: value => value === '' ? undefined : Number(value)
                })}
                defaultValue={0}
                className="input"
              />
              <p className="text-xs text-gray-500 mt-1">Itemized deductions beyond standard (annual)</p>
            </div>
          </div>
        </div>

        {/* Retirement */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Retirement (401k)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="label">Contribution Type</label>
              <select
                {...register('retirement401kType', {
                  setValueAs: value => value === '' ? null : value
                })}
                className="input"
              >
                <option value="">None</option>
                <option value="PERCENT">Percent of gross pay</option>
                <option value="FIXED">Flat amount per pay period</option>
              </select>
              {errors.retirement401kType && (
                <p className="text-red-500 text-sm mt-1">{errors.retirement401kType.message}</p>
              )}
            </div>
            {watch401kType === 'PERCENT' && (
              <div>
                <label className="label">Contribution Rate (%)</label>
                <input
                  type="number"
                  step="0.01"
                  {...register('retirement401kRate', {
                    min: 0,
                    max: 100,
                    setValueAs: value => value === '' ? null : Number(value),
                    validate: value => {
                      if (watch401kType === 'PERCENT' && (value === null || value === undefined)) {
                        return 'Rate is required for percent-based contributions'
                      }
                      return true
                    }
                  })}
                  className="input"
                />
                {errors.retirement401kRate && (
                  <p className="text-red-500 text-sm mt-1">{errors.retirement401kRate.message}</p>
                )}
              </div>
            )}
            {watch401kType === 'FIXED' && (
              <div>
                <label className="label">Contribution Amount (per pay period)</label>
                <input
                  type="number"
                  step="0.01"
                  {...register('retirement401kAmount', {
                    min: 0,
                    setValueAs: value => value === '' ? null : Number(value),
                    validate: value => {
                      if (watch401kType === 'FIXED' && (value === null || value === undefined)) {
                        return 'Amount is required for flat contributions'
                      }
                      return true
                    }
                  })}
                  className="input"
                />
                {errors.retirement401kAmount && (
                  <p className="text-red-500 text-sm mt-1">{errors.retirement401kAmount.message}</p>
                )}
              </div>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-3">Contributions are deducted each pay period.</p>
        </div>

        {/* Address */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Address</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="label">Street Address *</label>
              <input {...register('address', { required: true })} className="input" />
            </div>
            <div>
              <label className="label">City *</label>
              <input {...register('city', { required: true })} className="input" />
            </div>
            <div>
              <label className="label">County</label>
              <input
                {...register('county', {
                  validate: value => {
                    if (watchState === 'MD' && !value?.trim()) {
                      return 'County is required for Maryland employees'
                    }
                    return true
                  }
                })}
                className="input"
              />
              <p className="text-xs text-gray-500 mt-1">Required for Maryland local tax</p>
              {errors.county && (
                <p className="text-red-500 text-sm mt-1">{errors.county.message}</p>
              )}
            </div>
            <div>
              <label className="label">State *</label>
              <select {...register('state', { required: true })} className="input">
                <option value="">Select a state</option>
                {US_STATES.map(state => (
                  <option key={state.code} value={state.code}>{state.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">ZIP Code *</label>
              <input {...register('zipCode', { required: true })} className="input" />
            </div>
          </div>
        </div>

        {/* Local Tax / Work Location */}
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Local Tax / Work Location</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="label">Work City</label>
              <input
                {...register('workCity', {
                  validate: value => {
                    if (value?.trim() && !watchWorkState?.trim()) {
                      return 'Work state is required when work city is provided'
                    }
                    return true
                  }
                })}
                className="input"
              />
              <p className="text-xs text-gray-500 mt-1">Use for cities with local tax (NYC, Philadelphia, etc.)</p>
              {errors.workCity && (
                <p className="text-red-500 text-sm mt-1">{errors.workCity.message}</p>
              )}
            </div>
            <div>
              <label className="label">Work State</label>
              <select
                {...register('workState', {
                  validate: value => {
                    if (value?.trim() && !watchWorkCity?.trim()) {
                      return 'Work city is required when work state is provided'
                    }
                    return true
                  }
                })}
                className="input"
              >
                <option value="">Select a state</option>
                {US_STATES.map(state => (
                  <option key={state.code} value={state.code}>{state.name}</option>
                ))}
              </select>
              {errors.workState && (
                <p className="text-red-500 text-sm mt-1">{errors.workState.message}</p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="localResident"
                defaultChecked
                {...register('localResident')}
              />
              <label htmlFor="localResident" className="text-sm text-gray-700">
                Resident of work city
              </label>
            </div>
          </div>
        </div>

        {/* Form Actions */}
        <div className="flex justify-end gap-4">
          <button
            type="button"
            onClick={() => navigate('/employees')}
            className="btn-secondary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={mutation.isPending}
            className="btn-primary"
          >
            {mutation.isPending ? 'Saving...' : isEditing ? 'Update Employee' : 'Add Employee'}
          </button>
        </div>

        {mutation.isError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
            Failed to save employee. Please try again.
          </div>
        )}
      </form>
    </div>
  )
}
