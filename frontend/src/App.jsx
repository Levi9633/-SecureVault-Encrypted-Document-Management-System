import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import React, { useEffect, Suspense } from 'react'
import { logout } from './services/api'
import LightRays from './components/LightRays'

const Login = React.lazy(() => import('./pages/Login'))
const Signup = React.lazy(() => import('./pages/Signup'))
const Dashboard = React.lazy(() => import('./pages/Dashboard'))
const Upload = React.lazy(() => import('./pages/Upload'))
const Files = React.lazy(() => import('./pages/Files'))
const AdminDashboard = React.lazy(() => import('./pages/AdminDashboard'))

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
      <LightRays
        raysOrigin="top-center"
        raysColor="#ffffff"
        raysSpeed={1}
        lightSpread={0.5}
        rayLength={3}
        followMouse={true}
        mouseInfluence={0.1}
        noiseAmount={0}
        distortion={0}
        className="custom-rays"
        pulsating={false}
        fadeDistance={1}
        saturation={1}
      />
      <Suspense fallback={<div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', color: '#fff' }}>Loading...</div>}>
        <Routes>
          <Route path="/" element={<Navigate to="/login" />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="/upload" element={<PrivateRoute><Upload /></PrivateRoute>} />
          <Route path="/files" element={<PrivateRoute><Files /></PrivateRoute>} />
          <Route path="/admin/*" element={<PrivateRoute><AdminDashboard /></PrivateRoute>} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
