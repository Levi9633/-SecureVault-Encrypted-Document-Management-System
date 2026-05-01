import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../services/supabase'

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
      // Admin bypasses Supabase Auth - call our backend
      try {
        const res = await fetch('http://localhost:8000/auth/admin-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: form.password })
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.detail || 'Wrong password')
        sessionStorage.setItem('session', JSON.stringify(data))
        setStatus({ msg: '✅ Admin Access Granted', type: 'success' })
        setTimeout(() => nav('/dashboard'), 800)
      } catch (err) {
        setStatus({ msg: `❌ ${err.message}`, type: 'error' })
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

      sessionStorage.setItem('session', JSON.stringify({ username, email: user.email, role, token }))
      setStatus({ msg: '✅ Access Granted', type: 'success' })
      setTimeout(() => nav('/dashboard'), 800)
    } catch (err) {
      setStatus({ msg: `❌ ${err.message}`, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="card">
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1>🔒 VaultSync</h1>
          <p style={{ color: 'var(--text-muted)' }}>Secure Zero-Knowledge Access</p>
        </div>

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label>Email Address</label>
            <input type="email" value={form.email} onChange={set('email')} required placeholder="Enter your email" />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" value={form.password} onChange={set('password')} required placeholder="Enter password" />
          </div>

          <div style={{ textAlign: 'right', marginTop: '-0.5rem', marginBottom: '1rem' }}>
            <Link to="/forgot-password" style={{ color: 'var(--primary)', fontSize: '0.85rem', textDecoration: 'none' }}>
              Forgot Password?
            </Link>
          </div>

          <button className="btn btn-primary" disabled={loading}>
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>

        {status.msg && <div className={`status ${status.type}`}>{status.msg}</div>}

        <div style={{ textAlign: 'center', marginTop: '1.5rem', color: 'var(--text-muted)' }}>
          New to VaultSync?{' '}
          <Link to="/signup" style={{ color: 'var(--primary)', textDecoration: 'none' }}>Create Account</Link>
        </div>
      </div>
    </div>
  )
}
