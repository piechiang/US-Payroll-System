import { Navigate, Outlet, useLocation } from 'react-router-dom'

const TOKEN_KEY = 'token'

export default function RequireAuth() {
  const location = useLocation()
  const token = localStorage.getItem(TOKEN_KEY)

  if (!token) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  return <Outlet />
}
