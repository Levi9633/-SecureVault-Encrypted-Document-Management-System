import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { listFiles, downloadFile } from '../services/api'
import ProgressModal from '../components/ProgressModal'

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

  // Password Modal State
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedFile, setSelectedFile] = useState('')
  const [password, setPassword] = useState('')
  const [downloading, setDownloading] = useState(false)

  // Progress Modal State
  const [showProgress, setShowProgress] = useState(false)
  const [currentStage, setCurrentStage] = useState(0)
  const [progress, setProgress] = useState(0)
  const [isComplete, setIsComplete] = useState(false)

  useEffect(() => {
    fetchFiles()
  }, [])

  const fetchFiles = async () => {
    try {
      const res = await listFiles()
      setFiles(res.data)
    } catch (err) {
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
      // Stage 0: Authenticating
      setCurrentStage(0)
      setProgress(0)
      await new Promise(r => setTimeout(r, 600))

      // Stage 1: Downloading from server (real Axios download progress)
      setCurrentStage(1)
      setProgress(1)
      const res = await downloadFile(selectedFile, password, (pct) => {
        setProgress(pct)
      })

      // Stage 2: Decrypting (server-side, show simulation)
      setCurrentStage(2)
      setProgress(0)
      await new Promise(r => setTimeout(r, 700))
      setProgress(100)

      // Stage 3: Complete
      setCurrentStage(3)
      setIsComplete(true)

      // Trigger the browser download
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', selectedFile.replace('.enc', ''))
      document.body.appendChild(link)
      link.click()
      link.remove()

      setTimeout(() => {
        setShowProgress(false)
      }, 1500)

    } catch (err) {
      setShowProgress(false)
      setModalOpen(true)
      const msg = err.response?.data?.detail || 'Incorrect password or file corrupted'
      setStatus({ msg: `❌ ${msg}`, type: 'error' })
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="page">
      {showProgress && (
        <ProgressModal
          title="Decrypting File"
          stages={DOWNLOAD_STAGES}
          currentStage={currentStage}
          progress={progress}
          isComplete={isComplete}
        />
      )}

      <div className="header">
        <h1>📁 My Encrypted Files</h1>
        <button className="btn btn-outline btn-sm" onClick={() => nav('/dashboard')} style={{ width: 'auto' }}>
          Back to Dashboard
        </button>
      </div>

      <div className="card" style={{ maxWidth: '800px', margin: '0 auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem 0' }}>
            <div className="spinner" />
            <p style={{ color: 'var(--text-muted)', marginTop: '1rem' }}>Loading securely...</p>
          </div>
        ) : files.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem 0' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📭</div>
            <p style={{ color: 'var(--text-muted)' }}>No encrypted files found.</p>
          </div>
        ) : (
          <div className="file-list">
            {files.map((f, i) => (
              <div key={i} className="file-item">
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>📄</span>
                  <span style={{ fontWeight: '500' }}>{f.name.replace('.enc', '')}</span>
                  <span style={{ fontSize: '0.8rem', color: 'var(--primary)', border: '1px solid var(--primary)', padding: '2px 6px', borderRadius: '4px' }}>.ENC</span>
                </div>
                <button className="btn btn-primary" style={{ width: 'auto', padding: '0.5rem 1rem' }} onClick={() => promptDownload(f.name)}>
                  Decrypt & Download
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Password Modal */}
      {modalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3 style={{ marginBottom: '1.5rem' }}>🔑 Decrypt File</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
              Enter the password you used when uploading <strong>{selectedFile.replace('.enc', '')}</strong> to re-derive the decryption key.
            </p>

            <div className="form-group">
              <label>File Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleDownload()}
                autoFocus
                placeholder="Enter your encryption password"
              />
            </div>

            {status.msg && <div className={`status ${status.type}`}>{status.msg}</div>}

            <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
              <button className="btn btn-outline" onClick={() => setModalOpen(false)} disabled={downloading}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleDownload} disabled={downloading}>
                {downloading ? 'Decrypting...' : 'Decrypt & Download'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
