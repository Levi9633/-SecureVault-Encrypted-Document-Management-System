import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { syncUser } from '../services/api'
import GlassSurface from '../components/GlassSurface'

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
        setStatus({ msg: '✔ Account created!', type: 'success' })
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
      <div className="auth-page" style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', padding: '2rem 5vw', justifyContent: 'center' }}>
        <div style={{ maxWidth: '460px', width: '100%', margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{ position: 'relative', borderRadius: '24px', overflow: 'hidden' }}>
            <GlassSurface width="100%" height="100%" borderRadius={24} blur={20} opacity={0.35} brightness={40} saturation={1.5}>
              <div style={{ padding: '3rem 2rem', width: '100%', boxSizing: 'border-box', textAlign: 'center' }}>
                <div style={{ fontSize: '4rem', marginBottom: '1rem', filter: 'brightness(0) invert(1)' }}>📬</div>
                <h2 style={{ fontSize: '2rem', fontWeight: 700, color: '#ffffff' }}>Check Your Email!</h2>
                <p style={{ color: '#ffffff', marginTop: '1rem', lineHeight: '1.8', fontWeight: 500 }}>
                  We sent a verification link to <strong style={{ color: '#ffffff', fontWeight: 800 }}>{form.email}</strong>.
                  <br />Click the link in your email to activate your account.
                </p>
                <button 
                  style={{ marginTop: '2rem', width: '100%', padding: '1rem', background: 'rgba(255,255,255,0.15)', border: '1.5px solid #ffffff', borderRadius: '14px', color: '#ffffff', fontWeight: 700, cursor: 'pointer' }}
                  onClick={() => nav('/login')}
                >
                  Back to Login
                </button>
              </div>
            </GlassSurface>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-page" style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', padding: '2rem 5vw', justifyContent: 'center' }}>
      <div style={{ maxWidth: '460px', width: '100%', margin: '0 auto', position: 'relative', zIndex: 1 }}>
        <div style={{ position: 'relative', borderRadius: '24px', overflow: 'hidden' }}>
          <GlassSurface width="100%" height="100%" borderRadius={24} blur={20} opacity={0.35} brightness={40} saturation={1.5}>
            <div style={{ padding: '3rem 2rem', width: '100%', boxSizing: 'border-box' }}>
              <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '2.4rem', fontWeight: 700, filter: 'brightness(0) invert(1)' }}>Create Account</h2>
              </div>

              <form onSubmit={handleSignup}>
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label style={{ color: '#ffffff', fontWeight: 700 }}>Username</label>
                  <input value={form.username} onChange={set('username')} placeholder="Choose a username" required style={{ background: 'rgba(255,255,255,0.07)', border: '1.5px solid rgba(255,255,255,0.3)', color: '#ffffff', fontWeight: 700, padding: '0.85rem 1rem', borderRadius: '12px', width: '100%', boxSizing: 'border-box', marginTop: '0.5rem' }} />
                </div>
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label style={{ color: '#ffffff', fontWeight: 700 }}>Email Address</label>
                  <input type="email" value={form.email} onChange={set('email')} placeholder="Enter your Email" required style={{ background: 'rgba(255,255,255,0.07)', border: '1.5px solid rgba(255,255,255,0.3)', color: '#ffffff', fontWeight: 700, padding: '0.85rem 1rem', borderRadius: '12px', width: '100%', boxSizing: 'border-box', marginTop: '0.5rem' }} />
                </div>
                <div className="form-group" style={{ marginBottom: '1rem' }}>
                  <label style={{ color: '#ffffff', fontWeight: 700 }}>Password</label>
                  <input type="password" value={form.password} onChange={set('password')} placeholder="Min 8 characters" required style={{ background: 'rgba(255,255,255,0.07)', border: '1.5px solid rgba(255,255,255,0.3)', color: '#ffffff', fontWeight: 700, padding: '0.85rem 1rem', borderRadius: '12px', width: '100%', boxSizing: 'border-box', marginTop: '0.5rem' }} />
                </div>
                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                  <label style={{ color: '#ffffff', fontWeight: 700 }}>Confirm Password</label>
                  <input type="password" value={form.confirm} onChange={set('confirm')} placeholder="Repeat password" required style={{ background: 'rgba(255,255,255,0.07)', border: '1.5px solid rgba(255,255,255,0.3)', color: '#ffffff', fontWeight: 700, padding: '0.85rem 1rem', borderRadius: '12px', width: '100%', boxSizing: 'border-box', marginTop: '0.5rem' }} />
                </div>
                <button disabled={loading} style={{ width: '100%', padding: '1rem', background: 'rgba(255,255,255,0.15)', border: '1.5px solid #ffffff', borderRadius: '14px', color: '#ffffff', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}>
                  {loading ? 'Creating...' : 'Create Account'}
                </button>
              </form>

              {status.msg && (
                <div style={{ marginTop: '1.5rem', padding: '1rem', borderRadius: '12px', fontSize: '0.9rem', textAlign: 'center', fontWeight: 700, color: '#ffffff', background: status.type === 'error' ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)', border: '1.5px solid #ffffff' }}>
                  {status.msg}
                </div>
              )}

              <div style={{ textAlign: 'center', marginTop: '2rem', color: '#ffffff', fontWeight: 400, fontSize: '0.9rem' }}>
                Already have an account?{' '}
                <Link to="/login" style={{ color: '#ffffff', textDecoration: 'underline', fontWeight: 700 }}>Log In</Link>
              </div>
            </div>
          </GlassSurface>
        </div>
      </div>
    </div>
  )
}
