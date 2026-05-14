import axios from 'axios'
import { supabase } from './supabase'

const API = axios.create({
  baseURL: 'http://localhost:8000',
  timeout: 60000,
})

// ─── Session helpers (sessionStorage = per-tab, no cross-tab conflicts) ───────
const getSession = () => JSON.parse(sessionStorage.getItem('session') || '{}')
const setSession = (data) => sessionStorage.setItem('session', JSON.stringify(data))
const clearSession = () => sessionStorage.removeItem('session')

// ─── Request Interceptor: Always attach the freshest token ───────────────────
API.interceptors.request.use(async (config) => {
  const sessionData = getSession()

  // Admin bypass: static token, never expires
  if (sessionData.role === 'admin' && sessionData.token) {
    config.headers.Authorization = `Bearer ${sessionData.token}`
    return config
  }

  // Regular user: ALWAYS use supabase.auth.getSession() — auto-refreshes JWT
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.access_token) {
      const stored = getSession()
      if (stored.token !== session.access_token) {
        setSession({ ...stored, token: session.access_token })
      }
      config.headers.Authorization = `Bearer ${session.access_token}`
    }
  } catch (_) {}

  return config
})

// ─── Response Interceptor: Auto-refresh on 401/403 ───────────────────────────
API.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error.response?.status
    const originalRequest = error.config

    if (originalRequest._retry) return Promise.reject(error)

    if (status === 401 || status === 403) {
      const sessionData = getSession()

      // Admin bypass token never expires — 403 means session was wiped (e.g. idle timer)
      if (sessionData.role === 'admin') {
        console.warn('[Auth] Admin session lost — redirecting to login')
        clearSession()
        window.location.href = '/login'
        return Promise.reject(error)
      }

      // Regular user: try to refresh JWT and retry the original request
      try {
        const { data: { session }, error: refreshError } = await supabase.auth.refreshSession()
        if (refreshError || !session) throw new Error('Refresh failed')

        const stored = getSession()
        setSession({ ...stored, token: session.access_token })

        originalRequest._retry = true
        originalRequest.headers.Authorization = `Bearer ${session.access_token}`
        return API(originalRequest)
      } catch (_) {
        console.warn('[Auth] Session refresh failed — redirecting to login')
        clearSession()
        await supabase.auth.signOut()
        window.location.href = '/login'
        return Promise.reject(error)
      }
    }

    return Promise.reject(error)
  }
)

// ─── Logout ───────────────────────────────────────────────────────────────────
export const logout = async () => {
  clearSession()
  await supabase.auth.signOut()
}

export const syncUser = (username, email, password) =>
  API.post('/auth/sync-user', { username, email, password })

export const getProfile = () => API.get('/auth/profile')

export const changePassword = async (newPassword) => {
  // 1. Update Supabase Auth password
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw error
  
  // 2. Sync to our database
  return API.post('/auth/change-password', { new_password: newPassword })
}

// ─── File Endpoints ───────────────────────────────────────────────────────────
export const uploadFile = (file, file_password, onProgress) => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('file_password', file_password)
  return API.post('/files/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total)
        onProgress(percent)
      }
    },
  })
}

export const listFiles = () => API.get('/files/list')

export const downloadFile = (filename, file_password, onProgress) =>
  API.post(`/files/download/${encodeURIComponent(filename)}`, {}, {
    headers: { 'x-file-password': file_password },
    responseType: 'blob',
    onDownloadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total)
        onProgress(percent)
      }
    },
  })

// ─── Admin Endpoints ──────────────────────────────────────────────────────────
export const getAnalytics = () => API.get('/admin/analytics')
export const getUsers = () => API.get('/admin/users')
export const getAudits = () => API.get('/admin/audits')
export const getSupabaseAudits = () => API.get('/admin/supabase-audits')
export const blockUser = (userId, block) => API.post(`/admin/users/${userId}/block`, { block })
export const deleteUser = (userId) => API.delete(`/admin/users/${userId}`)

export default API
