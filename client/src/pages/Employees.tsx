import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search, Edit, Trash2 } from 'lucide-react'
import { api } from '../services/api'
import { useAuth } from '../context/AuthContext'

interface Employee {
  id: string
  firstName: string
  lastName: string
  email: string
  department: string | null
  jobTitle: string | null
  payType: 'HOURLY' | 'SALARY'
  payRate: string
  isActive: boolean
  company: {
    name: string
  }
}

export default function Employees() {
  const [searchTerm, setSearchTerm] = useState('')
  const { companyId } = useAuth()

  const { data: employees = [], isLoading } = useQuery<Employee[]>({
    queryKey: ['employees', companyId],
    queryFn: () => api.get(`/employees?companyId=${companyId}`).then(res => res.data),
    enabled: Boolean(companyId),
  })

  const filteredEmployees = employees.filter(emp =>
    `${emp.firstName} ${emp.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const formatPayRate = (payType: string, payRate: string) => {
    const rate = parseFloat(payRate)
    if (payType === 'HOURLY') {
      return `$${rate.toFixed(2)}/hr`
    }
    return `$${rate.toLocaleString()}/yr`
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Employees</h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage your employee information and W-4 details.
          </p>
        </div>
        <Link to="/employees/new" className="btn-primary">
          <Plus className="w-4 h-4 mr-2" />
          Add Employee
        </Link>
      </div>

      {/* Search */}
      <div className="card mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search employees..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input pl-10"
          />
        </div>
      </div>

      {/* Employees Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">Loading...</div>
        ) : filteredEmployees.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            {searchTerm ? 'No employees found matching your search.' : 'No employees yet. Add your first employee to get started.'}
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-header">Name</th>
                <th className="table-header">Email</th>
                <th className="table-header">Company</th>
                <th className="table-header">Department</th>
                <th className="table-header">Pay Rate</th>
                <th className="table-header">Status</th>
                <th className="table-header">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredEmployees.map((employee) => (
                <tr key={employee.id} className="hover:bg-gray-50">
                  <td className="table-cell font-medium">
                    {employee.firstName} {employee.lastName}
                  </td>
                  <td className="table-cell text-gray-500">{employee.email}</td>
                  <td className="table-cell">{employee.company?.name || '-'}</td>
                  <td className="table-cell text-gray-500">
                    {employee.department || '-'}
                  </td>
                  <td className="table-cell">
                    {formatPayRate(employee.payType, employee.payRate)}
                  </td>
                  <td className="table-cell">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        employee.isActive
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {employee.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="table-cell">
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/employees/${employee.id}`}
                        className="text-primary-600 hover:text-primary-800"
                      >
                        <Edit className="w-4 h-4" />
                      </Link>
                      <button className="text-red-600 hover:text-red-800">
                        <Trash2 className="w-4 h-4" />
                      </button>
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
