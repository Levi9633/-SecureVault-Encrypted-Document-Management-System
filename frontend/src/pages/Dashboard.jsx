import { useNavigate } from 'react-router-dom'
import { logout as apiLogout } from '../services/api'
import GlassSurface from '../components/GlassSurface'

export default function Dashboard() {
  const nav = useNavigate()
  const session = JSON.parse(sessionStorage.getItem('session') || '{}')
  const username = session.username || 'User'
  const role = session.role || 'user'

  const userActions = [
    { 
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="17 8 12 3 7 8"></polyline>
          <line x1="12" y1="3" x2="12" y2="15"></line>
        </svg>
      ), 
      title: 'Upload File', 
      desc: 'Securely encrypt & upload a file', 
      path: '/upload' 
    },
    { 
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
        </svg>
      ), 
      title: 'My Files', 
      desc: 'View & download your encrypted files', 
      path: '/files' 
    },
  ]

  const adminActions = [
    {
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6"  y1="20" x2="6"  y2="14" />
        </svg>
      ),
      title: 'Global Analytics',
      desc: 'System-wide storage & usage metrics',
      path: '/admin/analytics'
    },
    {
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
      title: 'Manage Users',
      desc: 'View user quotas and roles',
      path: '/admin/users'
    },
    {
      icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <polyline points="9 12 11 14 15 10" />
        </svg>
      ),
      title: 'Audit Logs',
      desc: 'Track all security events and access',
      path: '/admin/audits'
    },
  ]

  const actions = role === 'admin' ? adminActions : userActions

  return (
    <div className="page" style={{ 
      position: 'relative', 
      overflow: 'hidden', 
      height: '100vh', 
      width: '100vw', 
      maxWidth: 'none', 
      margin: 0, 
      padding: '12vh 10vw 0',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-start'
    }}>
      <div className="header" style={{ position: 'relative', zIndex: 1, paddingBottom: '1.5rem' }}>
        <h1 style={{ 
          position: 'fixed',
          top: '2rem',
          left: '2rem',
          zIndex: 1000,
          margin: 0,
          fontSize: '1.8rem',
          fontWeight: 800,
          background: 'linear-gradient(to right, #ffffff, #a3a3a3)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          textTransform: 'uppercase',
          letterSpacing: '0.05em'
        }}>
          VaultSync 2.0
        </h1>
        <button 
          className="btn btn-outline btn-sm" 
          onClick={() => nav('/profile')} 
          style={{ 
            position: 'fixed',
            top: '2rem',
            right: '2rem',
            zIndex: 1000,
            width: '40px', 
            height: '40px',
            padding: '0', 
            borderRadius: '50%',
            border: '1.5px solid #ffffff', 
            color: '#ffffff', 
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.3)',
            backdropFilter: 'blur(10px)',
            transition: 'all 0.2s ease',
            cursor: 'pointer'
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
          onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,0,0,0.3)'}
          title="User Profile"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        </button>
      </div>

      <div className="dashboard-body" style={{ position: 'relative', zIndex: 1, marginTop: '2rem' }}>
        <h2 style={{ fontSize: '2.8rem', marginBottom: '0.5rem', fontWeight: '700', letterSpacing: '-1px', color: '#ffffff' }}>Welcome back, {username} </h2>


        <div className="action-grid" style={{ marginTop: '3rem', gap: '2rem' }}>
          {actions.map((a) => {
            if (role === 'admin') {
              return (
                <div key={a.path} className="action-card" onClick={() => nav(a.path)} style={{ display: 'flex', flexDirection: 'column', padding: '2.5rem', border: '1.5px solid #ffffff' }}>
                  <div className="icon" style={{ fontSize: '3rem', marginBottom: '1.5rem', filter: 'brightness(0) invert(1) drop-shadow(0 0 10px rgba(255,255,255,0.4))' }}>{a.icon}</div>
                  <h3 style={{ fontSize: '1.4rem', margin: '0.5rem 0', fontWeight: '700', background: 'linear-gradient(to right, #ffffff, #a3a3a3)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{a.title}</h3>
                  <p style={{ color: '#ffffff', fontSize: '1rem', lineHeight: '1.5', fontWeight: 700 }}>{a.desc}</p>
                </div>
              );
            }

            return (
              <div 
                key={a.path} 
                className="action-card glass-wrapper" 
                onClick={() => nav(a.path)} 
                style={{ padding: 0, overflow: 'visible', background: 'transparent', border: 'none', backdropFilter: 'none', WebkitBackdropFilter: 'none', transform: 'translateZ(0)' }}
              >
                <GlassSurface 
                  width="100%" 
                  height="100%"
                  borderRadius={24}
                  blur={20}
                  opacity={0.05}
                  brightness={120}
                  mixBlendMode="screen"
                  displace={1.2}
                  saturation={1.5}
                  className="action-card-glass"
                >
                  <div style={{ padding: '2.5rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: '100%', height: '100%', boxSizing: 'border-box', position: 'relative', zIndex: 10 }}>
                    <div className="icon" style={{ fontSize: '3rem', marginBottom: '1.5rem', filter: 'brightness(0) invert(1) drop-shadow(0px 4px 12px rgba(255,255,255,0.3))' }}>{a.icon}</div>
                    <h3 style={{ fontSize: '1.4rem', margin: '0.5rem 0', fontWeight: '700', background: 'linear-gradient(to right, #ffffff, #a3a3a3)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', textShadow: 'none' }}>{a.title}</h3>
                    <p style={{ color: '#ffffff', fontSize: '1rem', margin: 0, lineHeight: '1.5', fontWeight: 700, textShadow: '0 1px 5px rgba(0,0,0,0.8)' }}>{a.desc}</p>
                  </div>
                </GlassSurface>
              </div>
            );
          })}
        </div>
      </div>

      <div className="footer" style={{ textAlign: 'center', marginTop: 'auto', color: '#ffffff', padding: '2rem 0', fontWeight: 700 }}>
        © 2026 VaultSync Secure Storage Platform
      </div>
    </div>
  )
}
