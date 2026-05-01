import { useNavigate } from 'react-router-dom'
import { logout as apiLogout } from '../services/api'

export default function Dashboard() {
  const nav = useNavigate()
  const session = JSON.parse(sessionStorage.getItem('session') || '{}')
  const username = session.username || 'User'
  const role = session.role || 'user'

  const logout = async () => {
    try { await apiLogout() } catch (_) {}
    sessionStorage.removeItem('session')
    nav('/login')
  }

  const userActions = [
    { icon: '📤', title: 'Upload File', desc: 'Securely encrypt & upload a file', path: '/upload' },
    { icon: '📁', title: 'My Files', desc: 'View & download your encrypted files', path: '/files' },
  ]

  const adminActions = [
    { icon: '📊', title: 'Global Analytics', desc: 'System-wide storage & usage metrics', path: '/admin/analytics' },
    { icon: '👥', title: 'Manage Users', desc: 'View user quotas and roles', path: '/admin/users' },
    { icon: '🛡️', title: 'Audit Logs', desc: 'Track all security events and access', path: '/admin/audits' },
  ]

  const actions = role === 'admin' ? adminActions : userActions

  return (
    <div className="page">
      <div className="header">
        <h1>🔒 VaultSync 2.0</h1>
        <nav>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            👤 {username} <span style={{ color: 'var(--primary)' }}>({role.toUpperCase()})</span>
          </span>
          <button className="btn btn-outline btn-sm" onClick={logout} style={{ width: 'auto', padding: '0.5rem 1rem' }}>
            Logout
          </button>
        </nav>
      </div>

      <div className="dashboard-body">
        <h2 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>Welcome back, {username} 👋</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>
          {role === 'admin' 
            ? 'Administrator Access Control Panel' 
            : 'Zero-Knowledge Secure File Management'}
        </p>

        <div className="action-grid">
          {actions.map((a) => (
            <div key={a.path} className="action-card" onClick={() => nav(a.path)}>
              <div className="icon">{a.icon}</div>
              <h3 style={{ fontSize: '1.2rem', margin: '0.5rem 0' }}>{a.title}</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>{a.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="footer" style={{ textAlign: 'center', marginTop: 'auto', color: 'var(--text-muted)', padding: '2rem 0' }}>
        © 2026 VaultSync Secure Storage Platform
      </div>
    </div>
  )
}
