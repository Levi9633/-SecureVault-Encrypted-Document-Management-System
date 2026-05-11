import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { listFiles, downloadFile } from '../services/api'
import ProgressModal from '../components/ProgressModal'
import GlassSurface from '../components/GlassSurface'

const DOWNLOAD_STAGES = [
  { label: 'Authenticating', icon: '🔒' },
  { label: 'Downloading', icon: '☁️' },
  { label: 'Decrypting', icon: '🔑' },
  { label: 'Complete', icon: '✅' },
]

export default function Files() {
  const nav = useNavigate()
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState({ msg: '', type: '' })

  const [modalOpen, setModalOpen] = useState(false)
  const [selectedFile, setSelectedFile] = useState('')
  const [password, setPassword] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [isFocused, setIsFocused] = useState(false)

  const [showProgress, setShowProgress] = useState(false)
  const [currentStage, setCurrentStage] = useState(0)
  const [progress, setProgress] = useState(0)
  const [isComplete, setIsComplete] = useState(false)

  useEffect(() => { fetchFiles() }, [])

  const fetchFiles = async () => {
    try {
      const res = await listFiles()
      setFiles(res.data)
    } catch {
      setStatus({ msg: 'Failed to load files', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const promptDownload = (filename) => {
    setSelectedFile(filename)
    setPassword('')
    setModalOpen(true)
    setStatus({ msg: '', type: '' })
  }

  const handleDownload = async () => {
    if (!password) return setStatus({ msg: 'Password is required to decrypt', type: 'error' })

    setDownloading(true)
    setModalOpen(false)
    setShowProgress(true)
    setIsComplete(false)

    try {
      setCurrentStage(0); setProgress(0)
      await new Promise(r => setTimeout(r, 600))

      setCurrentStage(1); setProgress(1)
      const res = await downloadFile(selectedFile, password, (pct) => setProgress(pct))

      setCurrentStage(2); setProgress(0)
      await new Promise(r => setTimeout(r, 700))
      setProgress(100)

      setCurrentStage(3); setIsComplete(true)

      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', selectedFile.replace('.enc', ''))
      document.body.appendChild(link)
      link.click()
      link.remove()

      setTimeout(() => setShowProgress(false), 1500)
    } catch (err) {
      setShowProgress(false)
      setModalOpen(true)
      const msg = err.response?.data?.detail || 'Incorrect password or file corrupted'
      setStatus({ msg: `❌ ${msg}`, type: 'error' })
    } finally {
      setDownloading(false)
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '0.85rem 1rem',
    background: '#000000',
    border: isFocused ? '1.5px solid #ffffff' : '1.5px solid rgba(255,255,255,0.3)',
    borderRadius: '12px',
    color: '#ffffff',
    fontSize: '1rem',
    fontWeight: '700',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'all 0.3s ease'
  }

  return (
    <div className="page" style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', padding: '2rem 5vw' }}>
      {showProgress && (
        <ProgressModal
          title="Decrypting File"
          stages={DOWNLOAD_STAGES}
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
          My Encrypted Files
        </h1>
      </div>

      {/* Files Glassmorphism Card */}
      <div style={{ maxWidth: '820px', width: '100%', margin: '0 auto', position: 'relative', zIndex: 1 }}>
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
                  <p style={{ color: '#a3a3a3', marginTop: '1rem' }}>Loading securely...</p>
                </div>
              ) : files.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 0' }}>
                  <div style={{ fontSize: '3.5rem', marginBottom: '1rem', filter: 'brightness(0) invert(1)' }}>📭</div>
                  <p style={{ color: '#ffffff', fontWeight: 700, fontSize: '1rem' }}>No encrypted files found.</p>
                  <button
                    onClick={() => nav('/upload')}
                    style={{ marginTop: '1.5rem', padding: '0.75rem 1.5rem', background: 'rgba(255,255,255,0.1)', border: '1.5px solid rgba(255,255,255,1)', borderRadius: '12px', color: '#ffffff', cursor: 'pointer', fontSize: '0.95rem', fontWeight: 700 }}
                  >
                    Upload your first file →
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <p style={{ color: '#ffffff', fontSize: '1.1rem', marginBottom: '1rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {files.length} encrypted file{files.length !== 1 ? 's' : ''} found
                  </p>
                  {files.map((f, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '1rem 1.25rem',
                        background: 'transparent',
                        border: '0.6px solid #ffffff',
                        borderRadius: '14px',
                        transition: 'all 0.25s ease',
                        flexWrap: 'wrap',
                        gap: '0.75rem',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.03)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: '1.5rem', flexShrink: 0, filter: 'brightness(0) invert(1)' }}>📄</span>
                        <span style={{ fontWeight: 500, color: '#ffffff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {f.name.replace('.enc', '')}
                        </span>
                        <span style={{ fontSize: '0.7rem', color: '#a3a3a3', border: '1px solid rgba(255,255,255,0.2)', padding: '2px 6px', borderRadius: '4px', flexShrink: 0 }}>
                          .ENC
                        </span>
                      </div>
                      <button
                        onClick={() => promptDownload(f.name)}
                        style={{
                          padding: '0.55rem 1.2rem',
                          background: 'rgba(255,255,255,0.05)',
                          backdropFilter: 'blur(10px)',
                          border: '1.5px solid #ffffff',
                          borderRadius: '10px',
                          color: '#ffffff',
                          fontSize: '0.9rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          flexShrink: 0,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; e.currentTarget.style.boxShadow = '0 0 15px rgba(255,255,255,0.05)' }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; e.currentTarget.style.boxShadow = 'none' }}
                      >
                        <span style={{ filter: 'brightness(0) invert(1)' }}>🔑</span> Decrypt & Download
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </GlassSurface>
        </div>
      </div>

      {/* Password Modal */}
      {modalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.1)', backdropFilter: 'blur(16px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, padding: '1rem' }}>
          <div style={{ position: 'relative', borderRadius: '20px', overflow: 'hidden', width: '100%', maxWidth: '420px' }}>
            <GlassSurface width="100%" height="100%" borderRadius={20} blur={20} opacity={0.35} brightness={40} saturation={1.5}>
              <div style={{ padding: '2rem', width: '100%', boxSizing: 'border-box' }}>
                <h3 style={{ color: '#ffffff', marginBottom: '0.75rem', fontSize: '1.3rem', fontWeight: 700 }}><span style={{ filter: 'brightness(0) invert(1)' }}>🔑</span> Decrypt File</h3>
                <p style={{ color: '#ffffff', fontSize: '0.9rem', marginBottom: '1.5rem', lineHeight: 1.5, fontWeight: 700 }}>
                  Enter the password you used when uploading{' '}
                  <strong style={{ color: '#ffffff', fontWeight: 800 }}>{selectedFile.replace('.enc', '')}</strong>.
                </p>

                <label style={{ display: 'block', color: '#ffffff', fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  File Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleDownload()}
                  autoFocus
                  placeholder={isFocused ? "" : "Enter your encryption password"}
                  style={inputStyle}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                />

                {status.msg && (
                  <div style={{
                    marginTop: '1rem',
                    padding: '0.75rem 1rem',
                    borderRadius: '10px',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    color: '#ffffff',
                    background: status.type === 'error' ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)',
                    border: `1.5px solid #ffffff`,
                  }}>
                    {status.msg}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
                  <button
                    onClick={() => setModalOpen(false)}
                    disabled={downloading}
                    style={{ 
                      flex: 1, 
                      padding: '0.8rem', 
                      background: 'rgba(255,255,255,0.05)', 
                      backdropFilter: 'blur(10px)',
                      border: '1.5px solid #ffffff', 
                      borderRadius: '12px', 
                      color: '#ffffff', 
                      cursor: 'pointer', 
                      fontSize: '0.95rem', 
                      fontWeight: 700 
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDownload}
                    disabled={downloading}
                    style={{ 
                      flex: 1, 
                      padding: '0.8rem', 
                      background: 'rgba(255,255,255,0.02)', 
                      backdropFilter: 'blur(10px)',
                      border: '1.5px solid #ffffff', 
                      borderRadius: '12px', 
                      color: '#ffffff', 
                      cursor: 'pointer', 
                      fontSize: '0.95rem', 
                      fontWeight: 700 
                    }}
                    onMouseEnter={e => { if (!downloading) { e.target.style.background = 'rgba(255,255,255,0.12)'; e.target.style.boxShadow = '0 0 15px rgba(255,255,255,0.05)' }}}
                    onMouseLeave={e => { e.target.style.background = 'rgba(255,255,255,0.02)'; e.target.style.boxShadow = 'none' }}
                  >
                    {downloading ? <><span style={{ filter: 'brightness(0) invert(1)' }}>⏳</span> Decrypting...</> : <><span style={{ filter: 'brightness(0) invert(1)' }}>🔑</span> Decrypt & Download</>}
                  </button>
                </div>
              </div>
            </GlassSurface>
          </div>
        </div>
      )}
    </div>
  )
}
