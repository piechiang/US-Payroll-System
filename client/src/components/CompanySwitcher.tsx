import { Building2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function CompanySwitcher() {
  const { companies, companyId, setCompanyId, isCompaniesLoading } = useAuth()

  if (isCompaniesLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Building2 className="w-4 h-4" />
        Loading companies...
      </div>
    )
  }

  if (companies.length === 0) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Building2 className="w-4 h-4" />
        No companies
      </div>
    )
  }

  return (
    <label className="flex items-center gap-2 text-sm text-gray-600">
      <Building2 className="w-4 h-4" />
      <select
        value={companyId}
        onChange={(event) => setCompanyId(event.target.value)}
        className="input py-1 px-2 text-sm"
      >
        {companies.map((company) => (
          <option key={company.id} value={company.id}>
            {company.name}
          </option>
        ))}
      </select>
    </label>
  )
}
