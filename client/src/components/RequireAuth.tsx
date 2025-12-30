import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function RequireAuth() {
  const location = useLocation()
  const { token, isAuthLoading } = useAuth()

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (isAuthLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Loading...
      </div>
    )
  }

  return <Outlet />
}
