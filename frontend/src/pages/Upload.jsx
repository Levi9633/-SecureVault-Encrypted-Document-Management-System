import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { uploadFile } from '../services/api'
import ProgressModal from '../components/ProgressModal'
import GlassSurface from '../components/GlassSurface'

const UPLOAD_STAGES = [
  { label: 'Deriving Key', icon: '🔑' },
  { label: 'Encrypting', icon: '🔐' },
  { label: 'Uploading', icon: '☁️' },
  { label: 'Complete', icon: '✅' },
]

export default function Upload() {
  const nav = useNavigate()
  const [file, setFile] = useState(null)
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState({ msg: '', type: '' })
  const [loading, setLoading] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const fileInputRef = useRef(null)

  const [showProgress, setShowProgress] = useState(false)
  const [currentStage, setCurrentStage] = useState(0)
  const [progress, setProgress] = useState(0)
  const [isComplete, setIsComplete] = useState(false)

  const validatePassword = (pwd) => {
    return {
      minLen: pwd.length >= 6,
      hasNum: /\d/.test(pwd),
      hasCaps: /[A-Z]/.test(pwd),
      hasSpec: /[!@#$%^&*(),.?":{}|<>]/.test(pwd)
    }
  }

  const passValid = validatePassword(password)
  const isPassComplete = Object.values(passValid).every(Boolean)

  const handleUpload = async () => {
    if (!file) return setStatus({ msg: 'Please select a file first', type: 'error' })
    if (!isPassComplete) {
      return setStatus({
        msg: 'Password does not meet requirements.',
        type: 'error'
      })
    }

    setLoading(true)
    setStatus({ msg: '', type: '' })
    setShowProgress(true)
    setIsComplete(false)

    try {
      setCurrentStage(0); setProgress(0)
      await new Promise(r => setTimeout(r, 800))

      setCurrentStage(1); setProgress(0)
      await new Promise(r => setTimeout(r, 600))

      setCurrentStage(2); setProgress(1)
      await uploadFile(file, password, (pct) => setProgress(pct))

      setCurrentStage(3); setProgress(100); setIsComplete(true)
      setTimeout(() => { setShowProgress(false); nav('/dashboard') }, 1500)

    } catch (err) {
      setShowProgress(false)
      const msg = err.response?.data?.detail || err.message
      setStatus({ msg: `❌ Upload Failed: ${msg}`, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page" style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', padding: '2rem 5vw' }}>
      {showProgress && (
        <ProgressModal
          title="Securing Your File"
          stages={UPLOAD_STAGES}
          currentStage={currentStage}
          progress={progress}
          isComplete={isComplete}
        />
      )}

      {/* Header */}
      <div className="header" style={{ position: 'relative', zIndex: 1, paddingBottom: '1.5rem', marginBottom: '3rem' }}>
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

      </div>

      {/* Glassmorphism Card */}
      <div style={{ maxWidth: '620px', width: '100%', margin: '0 auto', position: 'relative', zIndex: 1 }}>
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

              {/* Drop Zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: `2px dashed rgba(255,255,255,0.85)`,
                  borderRadius: '16px',
                  padding: '2.5rem 2rem',
                  textAlign: 'center',
                  cursor: 'pointer',
                  background: file ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)',
                  transition: 'all 0.3s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.09)' }}
                onMouseLeave={e => { e.currentTarget.style.background = file ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)' }}
              >
                <div style={{ fontSize: '3rem', marginBottom: '1rem', filter: 'brightness(0) invert(1)' }}>
                  {file ? '📄' : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '1rem' }}>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="17 8 12 3 7 8"></polyline>
                      <line x1="12" y1="3" x2="12" y2="15"></line>
                    </svg>
                  )}
                </div>
                <h3 style={{ color: '#ffffff', fontWeight: 700, marginBottom: '0.5rem' }}>
                  {file ? file.name : 'Click to select a file'}
                </h3>
                <p style={{ color: '#ffffff', fontWeight: 700, fontSize: '0.9rem' }}>
                  {file ? `${(file.size / 1024).toFixed(2)} KB` : ''}
                </p>
                <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={e => setFile(e.target.files[0])} />
              </div>

              {/* Password Field */}
              {file && (
                <div style={{ marginTop: '2rem' }}>
                  <label style={{ display: 'block', color: '#ffffff', fontSize: '0.85rem', fontWeight: 700, marginBottom: '0.6rem', letterSpacing: '0.03em', textTransform: 'uppercase' }}>
                    Encryption Password (Critical)
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder={isFocused ? '' : "Min 6 chars, 1 caps, 1 digit, 1 special"}
                    style={{
                      width: '100%',
                      padding: '0.85rem 1rem',
                      background: 'rgba(255,255,255,0.07)',
                      border: isFocused ? '1.5px solid #ffffff' : '1.5px solid rgba(255,255,255,0.3)',
                      borderRadius: '12px',
                      color: '#ffffff',
                      fontSize: '1rem',
                      fontWeight: '700',
                      outline: 'none',
                      boxSizing: 'border-box',
                      transition: 'all 0.3s ease'
                    }}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.8rem' }}>
                    {[
                      { key: 'minLen', label: '6+ Characters' },
                      { key: 'hasNum', label: '1 Digit' },
                      { key: 'hasCaps', label: '1 Capital Letter' },
                      { key: 'hasSpec', label: '1 Special Char' }
                    ].map(req => (
                      <div key={req.key} style={{ 
                        fontSize: '0.8rem', 
                        color: '#ffffff', 
                        fontWeight: 700, 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '0.4rem',
                        opacity: passValid[req.key] ? 1 : 0.4,
                        transition: 'opacity 0.2s ease'
                      }}>
                        {passValid[req.key] ? (
                          <span style={{ 
                            width: '16px', 
                            height: '16px', 
                            background: '#ffffff', 
                            color: '#000000', 
                            borderRadius: '50%', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            fontSize: '10px'
                          }}>✔</span>
                        ) : (
                          <span style={{ 
                            width: '16px', 
                            height: '16px', 
                            border: '1.5px solid #ffffff', 
                            borderRadius: '50%', 
                            display: 'inline-block',
                            boxSizing: 'border-box'
                          }} />
                        )} {req.label}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Upload Button */}
              <button
                onClick={handleUpload}
                disabled={!file || !isPassComplete || loading}
                style={{
                  marginTop: '2rem',
                  width: '100%',
                  padding: '1rem',
                  background: loading || !file || !isPassComplete ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.15)',
                  border: '1.5px solid rgba(255,255,255,1)',
                  borderRadius: '14px',
                  color: '#ffffff',
                  fontSize: '1rem',
                  fontWeight: 700,
                  cursor: !file || !isPassComplete || loading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.3s ease',
                  letterSpacing: '0.03em',
                  opacity: !file || !isPassComplete || loading ? 0.5 : 1
                }}
                onMouseEnter={e => { if (file && isPassComplete && !loading) { e.target.style.background = 'rgba(255,255,255,0.22)'; e.target.style.boxShadow = '0 0 20px rgba(255,255,255,0.1)' }}}
                onMouseLeave={e => { e.target.style.background = !file || !isPassComplete || loading ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.15)'; e.target.style.boxShadow = 'none' }}
              >
                {loading ? <><span style={{ filter: 'brightness(0) invert(1)' }}>⏳</span> Processing...</> : <><span style={{ filter: 'brightness(0) invert(1)' }}>🔒</span> Encrypt & Upload</>}
              </button>

              {/* Status */}
              {status.msg && (
                <div style={{
                  marginTop: '1.5rem',
                  padding: '1rem',
                  borderRadius: '12px',
                  fontSize: '0.9rem',
                  textAlign: 'center',
                  fontWeight: 700,
                  color: '#ffffff',
                  background: status.type === 'error' ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)',
                  border: `1.5px solid #ffffff`,
                }}>
                  {status.msg}
                </div>
              )}
            </div>
          </GlassSurface>
        </div>
      </div>
    </div>
  )
}
