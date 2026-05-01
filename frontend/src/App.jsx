import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import { logout } from './services/api'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'
import Upload from './pages/Upload'
import Files from './pages/Files'
import AdminDashboard from './pages/AdminDashboard'

function PrivateRoute({ children }) {
  const session = sessionStorage.getItem('session')
  return session ? children : <Navigate to="/login" />
}

function IdleTimer() {
  const nav = useNavigate()

  useEffect(() => {
    let timeoutId

    const resetTimer = () => {
      clearTimeout(timeoutId)
      // 12 minutes = 12 * 60 * 1000 = 720,000 ms
      timeoutId = setTimeout(async () => {
        // Only auto-logout if there is an active session
        if (sessionStorage.getItem('session')) {
          console.log('Idle timeout reached. Logging out.')
          await logout().catch(() => {})
          nav('/login')
        }
      }, 720000)
    }

    // List of events that indicate user activity
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']
    
    events.forEach(event => window.addEventListener(event, resetTimer))
    
    // Initialize timer
    resetTimer()

    return () => {
      clearTimeout(timeoutId)
      events.forEach(event => window.removeEventListener(event, resetTimer))
    }
  }, [nav])

  return null // This component doesn't render anything
}

export default function App() {
  return (
    <BrowserRouter>
      <IdleTimer />
      <Routes>
        <Route path="/" element={<Navigate to="/login" />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
        <Route path="/upload" element={<PrivateRoute><Upload /></PrivateRoute>} />
        <Route path="/files" element={<PrivateRoute><Files /></PrivateRoute>} />
        <Route path="/admin/*" element={<PrivateRoute><AdminDashboard /></PrivateRoute>} />
      </Routes>
    </BrowserRouter>
  )
}
