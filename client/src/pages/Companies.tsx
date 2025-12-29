import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Edit, Trash2 } from 'lucide-react'
import { api } from '../services/api'

interface Company {
  id: string
  name: string
  ein: string
  address: string
  city: string
  state: string
  zipCode: string
  payFrequency: string
  isActive: boolean
  retirement401kMatchRate?: number | null
  retirement401kMatchLimitPercent?: number | null
  _count: {
    employees: number
  }
}

export default function Companies() {
  const [isModalOpen, setIsModalOpen] = useState(false)
  const queryClient = useQueryClient()

  const { data: companies = [], isLoading } = useQuery<Company[]>({
    queryKey: ['companies'],
    queryFn: () => api.get('/companies').then(res => res.data)
  })

  const createMutation = useMutation({
    mutationFn: (data: Partial<Company>) => api.post('/companies', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] })
      setIsModalOpen(false)
    }
  })

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const parseOptionalNumber = (value: FormDataEntryValue | null) => {
      if (!value || value === '') return undefined
      const parsed = parseFloat(String(value))
      return Number.isNaN(parsed) ? undefined : parsed
    }

    createMutation.mutate({
      name: formData.get('name') as string,
      ein: formData.get('ein') as string,
      address: formData.get('address') as string,
      city: formData.get('city') as string,
      state: formData.get('state') as string,
      zipCode: formData.get('zipCode') as string,
      payFrequency: formData.get('payFrequency') as string,
      retirement401kMatchRate: parseOptionalNumber(formData.get('retirement401kMatchRate')),
      retirement401kMatchLimitPercent: parseOptionalNumber(formData.get('retirement401kMatchLimitPercent')),
    })
  }

  const payFrequencyLabel: Record<string, string> = {
    WEEKLY: 'Weekly',
    BIWEEKLY: 'Bi-weekly',
    SEMIMONTHLY: 'Semi-monthly',
    MONTHLY: 'Monthly'
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Companies</h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage companies and their payroll settings.
          </p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="btn-primary">
          <Plus className="w-4 h-4 mr-2" />
          Add Company
        </button>
      </div>

      {/* Companies Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-full text-center py-8 text-gray-500">Loading...</div>
        ) : companies.length === 0 ? (
          <div className="col-span-full card text-center py-8 text-gray-500">
            No companies yet. Add your first company to get started.
          </div>
        ) : (
          companies.map((company) => (
            <div key={company.id} className="card">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">{company.name}</h3>
                  <p className="text-sm text-gray-500">EIN: {company.ein}</p>
                </div>
                <div className="flex gap-2">
                  <button className="text-primary-600 hover:text-primary-800">
                    <Edit className="w-4 h-4" />
                  </button>
                  <button className="text-red-600 hover:text-red-800">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <p className="text-gray-600">
                  {company.address}<br />
                  {company.city}, {company.state} {company.zipCode}
                </p>
                <div className="flex justify-between pt-2 border-t">
                  <span className="text-gray-500">Pay Frequency</span>
                  <span className="font-medium">{payFrequencyLabel[company.payFrequency]}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Employees</span>
                  <span className="font-medium">{company._count?.employees || 0}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Company Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">Add New Company</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Company Name *</label>
                <input name="name" required className="input" />
              </div>
              <div>
                <label className="label">EIN * (XX-XXXXXXX)</label>
                <input name="ein" required pattern="\d{2}-\d{7}" placeholder="12-3456789" className="input" />
              </div>
              <div>
                <label className="label">Address *</label>
                <input name="address" required className="input" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">City *</label>
                  <input name="city" required className="input" />
                </div>
                <div>
                  <label className="label">State *</label>
                  <input name="state" required maxLength={2} className="input" />
                </div>
              </div>
              <div>
                <label className="label">ZIP Code *</label>
                <input name="zipCode" required className="input" />
              </div>
              <div>
                <label className="label">Pay Frequency *</label>
                <select name="payFrequency" required className="input">
                  <option value="WEEKLY">Weekly</option>
                  <option value="BIWEEKLY">Bi-weekly</option>
                  <option value="SEMIMONTHLY">Semi-monthly</option>
                  <option value="MONTHLY">Monthly</option>
                </select>
              </div>
              <div className="pt-2 border-t">
                <h3 className="text-sm font-semibold text-gray-700 mb-2">401(k) Match</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Match Rate (%)</label>
                    <input
                      name="retirement401kMatchRate"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      className="input"
                    />
                    <p className="text-xs text-gray-500 mt-1">Percent of employee contribution</p>
                  </div>
                  <div>
                    <label className="label">Match Limit (% of pay)</label>
                    <input
                      name="retirement401kMatchLimitPercent"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      className="input"
                    />
                    <p className="text-xs text-gray-500 mt-1">Max contribution eligible for match</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-4 pt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary">
                  Cancel
                </button>
                <button type="submit" disabled={createMutation.isPending} className="btn-primary">
                  {createMutation.isPending ? 'Adding...' : 'Add Company'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
