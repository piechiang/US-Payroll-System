import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../services/api'

export interface User {
  id: string
  email: string
  firstName: string
  lastName: string
  role: string
}

interface Company {
  id: string
  name: string
}

interface AuthContextValue {
  user: User | null
  token: string | null
  setToken: (token: string | null) => void
  setUser: (user: User | null) => void
  accessibleCompanyIds: string[]
  companyId: string
  setCompanyId: (companyId: string) => void
  companies: Company[]
  isAuthLoading: boolean
  isCompaniesLoading: boolean
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'))
  const [user, setUser] = useState<User | null>(null)
  const [accessibleCompanyIds, setAccessibleCompanyIds] = useState<string[]>([])
  const [companyId, setCompanyIdState] = useState(() => localStorage.getItem('companyId') || '')

  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token)
    } else {
      localStorage.removeItem('token')
      setUser(null)
      setAccessibleCompanyIds([])
      setCompanyIdState('')
    }
  }, [token])

  useEffect(() => {
    if (companyId) {
      localStorage.setItem('companyId', companyId)
    } else {
      localStorage.removeItem('companyId')
    }
  }, [companyId])

  const authQuery = useQuery<User>({
    queryKey: ['auth-me', token],
    queryFn: () => api.get('/auth/me').then((res) => res.data),
    enabled: Boolean(token),
    retry: false,
  })

  const companiesQuery = useQuery<Company[]>({
    queryKey: ['companies', token],
    queryFn: () => api.get('/companies').then((res) => res.data),
    enabled: Boolean(token),
  })

  useEffect(() => {
    if (authQuery.data) {
      setUser(authQuery.data)
    }
  }, [authQuery.data])

  useEffect(() => {
    if (authQuery.isError) {
      setUser(null)
      setToken(null)
    }
  }, [authQuery.isError])

  useEffect(() => {
    if (!companiesQuery.data) return
    const ids = companiesQuery.data.map((company) => company.id)
    setAccessibleCompanyIds(ids)

    setCompanyIdState((current) => {
      if (current && ids.includes(current)) {
        return current
      }
      return ids[0] || ''
    })
  }, [companiesQuery.data])

  const setCompanyId = (nextCompanyId: string) => {
    setCompanyIdState(nextCompanyId)
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      setToken,
      setUser,
      accessibleCompanyIds,
      companyId,
      setCompanyId,
      companies: companiesQuery.data || [],
      isAuthLoading: authQuery.isLoading,
      isCompaniesLoading: companiesQuery.isLoading,
    }),
    [
      user,
      token,
      accessibleCompanyIds,
      companyId,
      authQuery.isLoading,
      companiesQuery.data,
      companiesQuery.isLoading,
    ]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
