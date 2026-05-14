import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { logout as apiLogout, getProfile, changePassword } from '../services/api'
import GlassSurface from '../components/GlassSurface'

export default function Profile() {
  const nav = useNavigate()
  const session = JSON.parse(sessionStorage.getItem('session') || '{}')
  
  const [profileData, setProfileData] = useState(null)
  const [loading, setLoading] = useState(true)
  
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [pwdStatus, setPwdStatus] = useState({ msg: '', type: '' })
  const [isChanging, setIsChanging] = useState(false)
  const [isFocused, setIsFocused] = useState({ new: false, confirm: false })
  const [showPasswordForm, setShowPasswordForm] = useState(false)

  useEffect(() => {
    if (session.profileStats) {
      setProfileData(session.profileStats)
      setLoading(false)
    } else {
      fetchProfile()
    }
  }, [])

  const fetchProfile = async () => {
    try {
      const res = await getProfile()
      setProfileData(res.data)
    } catch (err) {
      console.error('Failed to load profile', err)
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    try { await apiLogout() } catch (_) {}
    sessionStorage.removeItem('session')
    nav('/login')
  }

  const handleChangePassword = async (e) => {
    e.preventDefault()
    if (newPassword.length < 6) {
      return setPwdStatus({ msg: 'Password must be at least 6 characters', type: 'error' })
    }
    if (newPassword !== confirmPassword) {
      return setPwdStatus({ msg: 'Passwords do not match', type: 'error' })
    }
    
    setIsChanging(true)
    setPwdStatus({ msg: '', type: '' })
    
    try {
      await changePassword(newPassword)
      setPwdStatus({ msg: 'Password changed successfully! You can now use your new password.', type: 'success' })
      setNewPassword('')
      setConfirmPassword('')
      setIsFocused({ new: false, confirm: false })
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.message || 'Failed to change password'
      setPwdStatus({ msg: `Error: ${errorMsg}`, type: 'error' })
    } finally {
      setIsChanging(false)
    }
  }

  const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const inputStyle = (focused) => ({
    width: '100%',
    padding: '0.85rem 1rem',
    background: '#000000',
    border: focused ? '1.5px solid #ffffff' : '1.5px solid rgba(255,255,255,0.3)',
    borderRadius: '12px',
    color: '#ffffff',
    fontSize: '1rem',
    fontWeight: '700',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'all 0.3s ease'
  })

  return (
    <div className="page" style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', padding: '2rem 5vw' }}>
      {/* Header */}
      <div className="header" style={{ position: 'relative', zIndex: 1, paddingBottom: '1.5rem', marginBottom: '2rem' }}>
        <button
          className="btn btn-outline btn-sm"
          onClick={() => nav('/dashboard')}
          style={{ 
            position: 'fixed',
            top: '2rem',
            left: '2rem',
            zIndex: 1000,
            width: 'auto', 
            color: '#ffffff', 
            border: '1.5px solid #ffffff', 
            background: 'rgba(0,0,0,0.3)',
            backdropFilter: 'blur(10px)',
            fontWeight: 700 
          }}
        >
          ← Back
        </button>
        <h1 style={{ 
          position: 'fixed',
          top: '2rem',
          right: '2rem',
          zIndex: 1000,
          margin: 0,
          fontSize: '1.6rem',
          fontWeight: 800,
          background: 'linear-gradient(to right, #ffffff, #a3a3a3)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          textTransform: 'uppercase',
          letterSpacing: '0.05em'
        }}>
          User Profile
        </h1>
      </div>

      <div style={{ maxWidth: '600px', width: '100%', margin: '2rem auto', position: 'relative', zIndex: 1 }}>
        <div style={{ position: 'relative', borderRadius: '24px', overflow: 'hidden' }}>
          <GlassSurface
            width="100%"
            height="100%"
            borderRadius={24}
            blur={20}
            opacity={0.35}
            brightness={40}
            saturation={1.5}
          >
            <div style={{ padding: '2.5rem', width: '100%', boxSizing: 'border-box' }}>
              
              {loading ? (
                <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                  <div className="spinner" />
                  <p style={{ color: '#a3a3a3', marginTop: '1rem' }}>Loading profile data...</p>
                </div>
              ) : profileData ? (
                <>
                  {/* User Profile Info */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', marginBottom: '2.5rem' }}>
                    <div style={{ 
                      width: '80px', height: '80px', 
                      background: 'rgba(255,255,255,0.1)', 
                      border: '2px solid #ffffff', 
                      borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '2.5rem',
                      color: '#ffffff'
                    }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                        <circle cx="12" cy="7" r="4"></circle>
                      </svg>
                    </div>
                    <div>
                      <h2 style={{ color: '#ffffff', margin: 0, fontSize: '1.8rem', fontWeight: 800 }}>{profileData.username}</h2>
                      <p style={{ color: '#a3a3a3', margin: '0.2rem 0 0.5rem 0', fontSize: '1rem', fontWeight: 500 }}>{profileData.email}</p>
                      <span style={{ 
                        background: profileData.role === 'admin' ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.05)',
                        border: '1px solid #ffffff',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        color: '#ffffff'
                      }}>
                        {profileData.role}
                      </span>
                    </div>
                  </div>

                  {/* Storage Stats */}
                  <div style={{ 
                    background: 'rgba(255,255,255,0.03)', 
                    border: '1px solid rgba(255,255,255,0.2)', 
                    borderRadius: '16px', 
                    padding: '1.5rem',
                    marginBottom: '2.5rem'
                  }}>
                    <h3 style={{ color: '#ffffff', fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem' }}>Storage Usage</h3>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ color: '#ffffff', fontWeight: 600, fontSize: '0.9rem' }}>
                        {formatBytes(profileData.storage_used)} / {formatBytes(profileData.storage_limit)}
                      </span>
                      <span style={{ color: '#a3a3a3', fontSize: '0.85rem', fontWeight: 600 }}>
                        {profileData.files_count} file{profileData.files_count !== 1 ? 's' : ''}
                      </span>
                    </div>
                    
                    <div style={{ width: '100%', background: 'rgba(255,255,255,0.1)', height: '12px', borderRadius: '6px', overflow: 'hidden' }}>
                      <div style={{ 
                        width: `${Math.min(100, (profileData.storage_used / profileData.storage_limit) * 100)}%`, 
                        background: '#ffffff', 
                        height: '100%',
                        borderRadius: '6px',
                        transition: 'width 0.5s ease'
                      }}></div>
                    </div>
                  </div>

                  {/* Change Password Form */}
                  <div style={{ marginBottom: '2.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: showPasswordForm ? '1rem' : '0' }}>
                      <h3 style={{ color: '#ffffff', fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Security Settings</h3>
                      {!showPasswordForm && (
                        <button 
                          onClick={() => setShowPasswordForm(true)}
                          style={{ 
                            padding: '0.5rem 1rem', 
                            background: 'rgba(255,255,255,0.05)', 
                            border: '1px solid #ffffff', 
                            borderRadius: '8px', 
                            color: '#ffffff', 
                            cursor: 'pointer', 
                            fontSize: '0.85rem', 
                            fontWeight: 700,
                            transition: 'all 0.2s ease'
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                        >
                          Change Password
                        </button>
                      )}
                    </div>

                    {showPasswordForm && (
                      <form onSubmit={handleChangePassword} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '16px', padding: '1.5rem', animation: 'fadeIn 0.3s ease' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                          <h4 style={{ color: '#ffffff', fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>Update Password</h4>
                          <button 
                            type="button" 
                            onClick={() => { setShowPasswordForm(false); setPwdStatus({msg:'', type:''}); setNewPassword(''); setConfirmPassword(''); }} 
                            style={{ background: 'transparent', border: 'none', color: '#a3a3a3', cursor: 'pointer', fontSize: '1.5rem', lineHeight: 1 }}
                            onMouseEnter={e => e.currentTarget.style.color = '#ffffff'}
                            onMouseLeave={e => e.currentTarget.style.color = '#a3a3a3'}
                          >
                            ×
                          </button>
                        </div>
                        
                        <div style={{ marginBottom: '1rem' }}>
                          <label style={{ display: 'block', color: '#ffffff', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            New Password
                          </label>
                          <input
                            type="password"
                            value={newPassword}
                            onChange={e => setNewPassword(e.target.value)}
                            placeholder="Enter new password"
                            style={inputStyle(isFocused.new)}
                            onFocus={() => setIsFocused({...isFocused, new: true})}
                            onBlur={() => setIsFocused({...isFocused, new: false})}
                          />
                        </div>

                        <div style={{ marginBottom: '1.5rem' }}>
                          <label style={{ display: 'block', color: '#ffffff', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Confirm New Password
                          </label>
                          <input
                            type="password"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            placeholder="Re-enter new password"
                            style={inputStyle(isFocused.confirm)}
                            onFocus={() => setIsFocused({...isFocused, confirm: true})}
                            onBlur={() => setIsFocused({...isFocused, confirm: false})}
                          />
                        </div>

                        {pwdStatus.msg && (
                          <div style={{
                            marginBottom: '1.5rem',
                            padding: '0.75rem 1rem',
                            borderRadius: '10px',
                            fontSize: '0.85rem',
                            fontWeight: 700,
                            color: '#ffffff',
                            background: pwdStatus.type === 'error' ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)',
                            border: `1px solid ${pwdStatus.type === 'error' ? 'rgba(239,68,68,0.5)' : 'rgba(16,185,129,0.5)'}`,
                          }}>
                            {pwdStatus.msg}
                          </div>
                        )}

                        <button
                          type="submit"
                          disabled={isChanging}
                          style={{ 
                            width: '100%',
                            padding: '0.85rem', 
                            background: 'rgba(255,255,255,0.05)', 
                            backdropFilter: 'blur(10px)',
                            border: '1.5px solid #ffffff', 
                            borderRadius: '12px', 
                            color: '#ffffff', 
                            cursor: 'pointer', 
                            fontSize: '1rem', 
                            fontWeight: 700,
                            transition: 'all 0.2s ease'
                          }}
                          onMouseEnter={e => { if (!isChanging) { e.currentTarget.style.background = 'rgba(255,255,255,0.15)' } }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
                        >
                          {isChanging ? 'Updating Password...' : 'Update Password'}
                        </button>
                      </form>
                    )}
                  </div>

                  {/* Logout Action */}
                  <hr style={{ border: '0', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: '1.5rem' }} />
                  
                  <button
                    onClick={handleLogout}
                    style={{ 
                      width: '100%',
                      padding: '0.85rem', 
                      background: 'rgba(239, 68, 68, 0.1)', 
                      backdropFilter: 'blur(10px)',
                      border: '1.5px solid #ef4444', 
                      borderRadius: '12px', 
                      color: '#ef4444', 
                      cursor: 'pointer', 
                      fontSize: '1rem', 
                      fontWeight: 700,
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)' }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                      <polyline points="16 17 21 12 16 7"></polyline>
                      <line x1="21" y1="12" x2="9" y2="12"></line>
                    </svg>
                    Logout from VaultSync
                  </button>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '2rem 0', color: '#ef4444' }}>
                  Failed to load profile data.
                </div>
              )}

            </div>
          </GlassSurface>
        </div>
      </div>
    </div>
  )
}
