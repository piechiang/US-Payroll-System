import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import RequireAuth from './components/RequireAuth'
import Dashboard from './pages/Dashboard'
import Employees from './pages/Employees'
import EmployeeForm from './pages/EmployeeForm'
import Companies from './pages/Companies'
import RunPayroll from './pages/RunPayroll'
import PayrollHistory from './pages/PayrollHistory'
import PaystubView from './pages/PaystubView'
import Login from './pages/Login'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireAuth />}>
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
      </Route>
    </Routes>
  )
}

export default App
