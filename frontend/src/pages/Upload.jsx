import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { uploadFile } from '../services/api'
import ProgressModal from '../components/ProgressModal'

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
  const fileInputRef = useRef(null)

  // Progress Modal State
  const [showProgress, setShowProgress] = useState(false)
  const [currentStage, setCurrentStage] = useState(0)
  const [progress, setProgress] = useState(0)
  const [isComplete, setIsComplete] = useState(false)

  const validatePassword = (pwd) => {
    const minLen = pwd.length >= 6
    const hasNum = /\d/.test(pwd)
    const hasChar = /[a-zA-Z]/.test(pwd)
    const hasSpec = /[!@#$%^&*(),.?":{}|<>]/.test(pwd)
    return minLen && hasNum && hasChar && hasSpec
  }

  const handleUpload = async () => {
    if (!file) return setStatus({ msg: 'Please select a file first', type: 'error' })
    if (!validatePassword(password)) {
      return setStatus({
        msg: 'Password must be min 6 chars, contain a number, a letter, and a special character.',
        type: 'error'
      })
    }

    setLoading(true)
    setStatus({ msg: '', type: '' })
    setShowProgress(true)
    setIsComplete(false)

    try {
      // Stage 0: Deriving Key (simulated 800ms)
      setCurrentStage(0)
      setProgress(0)
      await new Promise(r => setTimeout(r, 800))

      // Stage 1: Encrypting (simulated 600ms)
      setCurrentStage(1)
      setProgress(0)
      await new Promise(r => setTimeout(r, 600))

      // Stage 2: Uploading to server (real Axios progress)
      setCurrentStage(2)
      setProgress(1)
      await uploadFile(file, password, (pct) => {
        setProgress(pct)
      })

      // Stage 3: Complete
      setCurrentStage(3)
      setProgress(100)
      setIsComplete(true)

      setTimeout(() => {
        setShowProgress(false)
        nav('/dashboard')
      }, 1500)

    } catch (err) {
      setShowProgress(false)
      const msg = err.response?.data?.detail || err.message
      setStatus({ msg: `❌ Upload Failed: ${msg}`, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      {showProgress && (
        <ProgressModal
          title="Securing Your File"
          stages={UPLOAD_STAGES}
          currentStage={currentStage}
          progress={progress}
          isComplete={isComplete}
        />
      )}

      <div className="header">
        <h1>📤 Secure Upload</h1>
        <button className="btn btn-outline btn-sm" onClick={() => nav('/dashboard')} style={{ width: 'auto' }}>
          Back to Dashboard
        </button>
      </div>

      <div className="card" style={{ maxWidth: '600px', margin: '0 auto' }}>
        <div
          className="upload-zone"
          onClick={() => fileInputRef.current?.click()}
        >
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>{file ? '📄' : '📥'}</div>
          <h3>{file ? file.name : 'Click to select a file'}</h3>
          <p style={{ color: 'var(--text-muted)' }}>
            {file ? `${(file.size / 1024).toFixed(2)} KB` : 'Any file type supported. It will be zero-knowledge encrypted.'}
          </p>
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            onChange={e => setFile(e.target.files[0])}
          />
        </div>

        {file && (
          <div className="form-group" style={{ marginTop: '2rem' }}>
            <label>Encryption Password (Critical)</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Min 6 chars, 1 letter, 1 number, 1 special char"
            />
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
              ⚠️ If you lose this password, the file cannot be recovered. The server never stores it.
            </p>
          </div>
        )}

        <button
          className="btn btn-primary"
          onClick={handleUpload}
          disabled={!file || loading}
          style={{ marginTop: '1.5rem' }}
        >
          {loading ? 'Processing...' : 'Encrypt & Upload'}
        </button>

        {status.msg && <div className={`status ${status.type}`}>{status.msg}</div>}
      </div>
    </div>
  )
}
