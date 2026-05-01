import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { syncUser } from '../services/api'

export default function Signup() {
  const nav = useNavigate()
  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '' })
  const [status, setStatus] = useState({ msg: '', type: '' })
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const handleSignup = async (e) => {
    e.preventDefault()
    if (!form.username || !form.email || !form.password || !form.confirm)
      return setStatus({ msg: 'Please fill in all fields', type: 'error' })
    if (form.password !== form.confirm)
      return setStatus({ msg: 'Passwords do not match', type: 'error' })
    if (form.password.length < 8)
      return setStatus({ msg: 'Password must be at least 8 characters', type: 'error' })
    if (form.username.toLowerCase() === 'admin')
      return setStatus({ msg: 'That username is reserved.', type: 'error' })

    setLoading(true)
    setStatus({ msg: '⏳ Provisioning account...', type: 'info' })

    try {
      const { data, error } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            username: form.username,
            role: 'user',
          }
        }
      })
      if (error) throw error

      // Tell FastAPI to add user to public.users table so they appear in Admin panel
      await syncUser(form.username, form.email, form.password).catch(() => {})

      // If email confirmation is ON, Supabase returns a user but no session
      if (data.session) {
        // Email confirmation is OFF — log in immediately
        const user = data.user
        const token = data.session.access_token
        sessionStorage.setItem('session', JSON.stringify({
          username: form.username,
          email: user.email,
          role: 'user',
          token
        }))
        setStatus({ msg: '✅ Account created!', type: 'success' })
        setTimeout(() => nav('/dashboard'), 800)
      } else {
        // Email confirmation is ON — show confirmation message
        setDone(true)
      }
    } catch (err) {
      setStatus({ msg: `❌ ${err.message}`, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="auth-page">
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>📬</div>
          <h2>Check Your Email!</h2>
          <p style={{ color: 'var(--text-muted)', marginTop: '1rem', lineHeight: '1.8' }}>
            We sent a verification link to <strong style={{ color: 'var(--primary)' }}>{form.email}</strong>.
            <br />Click the link in your email to activate your account.
          </p>
          <button className="btn btn-outline" style={{ marginTop: '2rem' }} onClick={() => nav('/login')}>
            Back to Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div className="card">
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h2>🚀 Create Account</h2>
          <p style={{ color: 'var(--text-muted)' }}>Join VaultSync 2.0</p>
        </div>

        <form onSubmit={handleSignup}>
          <div className="form-group">
            <label>Username</label>
            <input value={form.username} onChange={set('username')} placeholder="Choose a username" required />
          </div>
          <div className="form-group">
            <label>Email Address</label>
            <input type="email" value={form.email} onChange={set('email')} placeholder="Enter real email (for password reset)" required />
          </div>
          <div className="form-group">
            <label>Password</label>
            <input type="password" value={form.password} onChange={set('password')} placeholder="Min 8 characters" required />
          </div>
          <div className="form-group">
            <label>Confirm Password</label>
            <input type="password" value={form.confirm} onChange={set('confirm')} placeholder="Repeat password" required />
          </div>
          <button className="btn btn-primary" disabled={loading} style={{ marginTop: '1rem' }}>
            {loading ? 'Creating...' : 'Create Account'}
          </button>
        </form>

        {status.msg && <div className={`status ${status.type}`}>{status.msg}</div>}

        <div style={{ textAlign: 'center', marginTop: '1.5rem', color: 'var(--text-muted)' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--primary)', textDecoration: 'none' }}>Log In</Link>
        </div>
      </div>
    </div>
  )
}
