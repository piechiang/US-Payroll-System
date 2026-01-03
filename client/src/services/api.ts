import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Required for CSRF cookie
})

// Store CSRF token in memory (not localStorage for security)
let csrfToken: string | null = null

/**
 * Fetch CSRF token from server
 * Should be called on app initialization and after 403 errors
 */
export async function fetchCsrfToken(): Promise<string> {
  try {
    const response = await api.get<{ csrfToken: string }>('/csrf-token')
    csrfToken = response.data.csrfToken
    return response.data.csrfToken
  } catch (error) {
    console.error('Failed to fetch CSRF token:', error)
    throw error
  }
}

/**
 * Get current CSRF token
 */
export function getCsrfToken(): string | null {
  return csrfToken
}

// Request interceptor for adding auth token and CSRF token
api.interceptors.request.use(
  async (config) => {
    // Add auth token
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }

    // Add CSRF token for state-changing requests
    const method = config.method?.toUpperCase()
    if (method && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      // Fetch CSRF token if we don't have one
      if (!csrfToken) {
        try {
          await fetchCsrfToken()
        } catch (error) {
          console.warn('Could not fetch CSRF token, request may fail:', error)
        }
      }

      if (csrfToken) {
        config.headers['X-CSRF-Token'] = csrfToken
      }
    }

    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor for handling errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    // Handle CSRF token errors (403) - retry once with new token
    if (error.response?.status === 403 &&
        error.response?.data?.error === 'CSRF validation failed' &&
        !originalRequest._csrfRetry) {
      originalRequest._csrfRetry = true

      try {
        // Fetch new CSRF token
        await fetchCsrfToken()
        // Retry the original request with new token
        if (csrfToken) {
          originalRequest.headers['X-CSRF-Token'] = csrfToken
        }
        return api(originalRequest)
      } catch (retryError) {
        return Promise.reject(retryError)
      }
    }

    // Handle unauthorized - redirect to login
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      csrfToken = null // Clear CSRF token on logout
      window.location.href = '/login'
    }

    return Promise.reject(error)
  }
)

export default api
