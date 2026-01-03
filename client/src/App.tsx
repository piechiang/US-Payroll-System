import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Employees from './pages/Employees'
import EmployeeForm from './pages/EmployeeForm'
import Companies from './pages/Companies'
import RunPayroll from './pages/RunPayroll'
import PayrollHistory from './pages/PayrollHistory'
import PaystubView from './pages/PaystubView'
import Login from './pages/Login'
import { fetchCsrfToken } from './services/api'

function App() {
  // Fetch CSRF token on app initialization
  useEffect(() => {
    const initCsrf = async () => {
      try {
        await fetchCsrfToken()
        console.log('CSRF token initialized')
      } catch (error) {
        console.warn('Failed to initialize CSRF token:', error)
        // Don't block app loading if CSRF fetch fails
        // The request interceptor will retry on first state-changing request
      }
    }

    // Only fetch if user is logged in
    const token = localStorage.getItem('token')
    if (token) {
      initCsrf()
    }
  }, [])

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Layout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="employees" element={<Employees />} />
        <Route path="employees/new" element={<EmployeeForm />} />
        <Route path="employees/:id" element={<EmployeeForm />} />
        <Route path="companies" element={<Companies />} />
        <Route path="payroll/run" element={<RunPayroll />} />
        <Route path="payroll/history" element={<PayrollHistory />} />
        <Route path="payroll/:id" element={<PaystubView />} />
      </Route>
    </Routes>
  )
}

export default App
