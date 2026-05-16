import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { getProfile } from '../services/api'
import GlassSurface from '../components/GlassSurface'

export default function Login() {
  const nav = useNavigate()
  const [form, setForm] = useState({ email: '', password: '' })
  const [status, setStatus] = useState({ msg: '', type: '' })
  const [loading, setLoading] = useState(false)

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setStatus({ msg: '⏳ Authenticating...', type: 'info' })

    // Special case: hardcoded Admin
    if (form.email === 'admin@vaultsync.com') {
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 8000)
        const res = await fetch('http://localhost:8000/auth/admin-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: form.password }),
          signal: controller.signal
        })
        clearTimeout(timeoutId)
        const data = await res.json()
        if (!res.ok) throw new Error(data.detail || 'Wrong password')
        sessionStorage.setItem('session', JSON.stringify(data))
        setStatus({ msg: '✔ Admin Access Granted', type: 'success' })
        setTimeout(() => nav('/dashboard'), 800)
      } catch (err) {
        const msg = err.name === 'AbortError'
          ? 'Server is taking too long. Check that the backend is running.'
          : err.message === 'Failed to fetch'
          ? 'Cannot reach server. Make sure the backend is running on port 8000.'
          : err.message
        setStatus({ msg: `❌ ${msg}`, type: 'error' })
      } finally {
        setLoading(false)
      }
      return
    }

    // Regular users via Supabase Auth
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: form.email,
        password: form.password,
      })
      if (error) throw error

      const user = data.user
      const username = user.user_metadata?.username || user.email.split('@')[0]
      const role = user.user_metadata?.role || 'user'
      const token = data.session.access_token

      sessionStorage.setItem('session', JSON.stringify({ 
        username, email: user.email, role, token
      }))
      
      setStatus({ msg: '✔ Access Granted', type: 'success' })
      setTimeout(() => nav('/dashboard'), 800)
    } catch (err) {
      setStatus({ msg: `❌ ${err.message}`, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page" style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', padding: '2rem 5vw', justifyContent: 'center' }}>
      <div style={{ maxWidth: '460px', width: '100%', margin: '0 auto', position: 'relative', zIndex: 1 }}>
        <div style={{ position: 'relative', borderRadius: '24px', overflow: 'hidden' }}>
          <GlassSurface width="100%" height="100%" borderRadius={24} blur={20} opacity={0.35} brightness={40} saturation={1.5}>
            <div style={{ padding: '3rem 2rem', width: '100%', boxSizing: 'border-box' }}>
              <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                <h1 style={{ fontSize: '2.4rem', fontWeight: 700, filter: 'brightness(0) invert(1)' }}>VaultSync</h1>
              </div>

              <form onSubmit={handleLogin}>
                <div className="form-group">
                  <label style={{ color: '#ffffff', fontWeight: 700 }}>Email Address</label>
                  <input type="email" value={form.email} onChange={set('email')} required placeholder="Enter your Email" style={{ background: 'rgba(255,255,255,0.07)', border: '1.5px solid rgba(255,255,255,0.3)', color: '#ffffff', fontWeight: 700 }} />
                </div>
                <div className="form-group">
                  <label style={{ color: '#ffffff', fontWeight: 700 }}>Password</label>
                  <input type="password" value={form.password} onChange={set('password')} required placeholder="Enter password" style={{ background: 'rgba(255,255,255,0.07)', border: '1.5px solid rgba(255,255,255,0.3)', color: '#ffffff', fontWeight: 700 }} />
                </div>

                <div style={{ textAlign: 'right', marginTop: '-0.5rem', marginBottom: '1.5rem' }}>
                  <Link to="/forgot-password" style={{ color: '#ffffff', fontSize: '0.85rem', textDecoration: 'none', fontWeight: 700 }}>
                    Forgot Password?
                  </Link>
                </div>

                <button className="btn btn-primary" disabled={loading} style={{ width: '100%', background: 'rgba(255,255,255,0.15)', border: '1.5px solid #ffffff', color: '#ffffff', fontWeight: 700 }}>
                  {loading ? 'Authenticating...' : 'Sign In'}
                </button>
              </form>

              {status.msg && (
                <div style={{ marginTop: '1.5rem', padding: '1rem', borderRadius: '12px', fontSize: '0.9rem', textAlign: 'center', fontWeight: 700, color: '#ffffff', background: status.type === 'error' ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)', border: '1.5px solid #ffffff' }}>
                  {status.msg}
                </div>
              )}

              <div style={{ textAlign: 'center', marginTop: '2rem', color: '#ffffff', fontWeight: 400, fontSize: '0.9rem' }}>
                New to VaultSync?{' '}
                <Link to="/signup" style={{ color: '#ffffff', textDecoration: 'underline', fontWeight: 700 }}>Create Account</Link>
              </div>
            </div>
          </GlassSurface>
        </div>
      </div>
    </div>
  )
}
