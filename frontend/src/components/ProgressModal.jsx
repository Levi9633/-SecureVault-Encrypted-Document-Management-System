import { useEffect, useRef } from 'react'

/**
 * Multi-Stage Progress Modal
 *
 * stages: array of { label, icon }
 * currentStage: index of active stage (0-based)
 * progress: 0-100 (network progress for current stage)
 * title: modal title
 * isComplete: boolean — shows a success state
 */
export default function ProgressModal({ title, stages, currentStage, progress, isComplete }) {
  const fillRef = useRef(null)

  useEffect(() => {
    if (fillRef.current) {
      fillRef.current.style.width = `${progress}%`
    }
  }, [progress])

  return (
    <div className="modal-overlay">
      <div className="card progress-modal" style={{ width: '480px', padding: '2.5rem', textAlign: 'center' }}>
        
        {/* Animated Icon */}
        <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>
          {isComplete ? '✅' : stages[currentStage]?.icon || '⚙️'}
        </div>

        <h2 style={{ fontSize: '1.3rem', marginBottom: '0.25rem', fontWeight: '700' }}>{title}</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '2rem' }}>
          {isComplete ? 'Operation complete!' : stages[currentStage]?.label}
        </p>

        {/* Stage Stepper */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0', marginBottom: '2rem', position: 'relative' }}>
          {/* Connector line behind steps */}
          <div style={{
            position: 'absolute',
            top: '16px',
            left: '15%',
            right: '15%',
            height: '2px',
            background: 'var(--border)',
            zIndex: 0
          }} />

          {stages.map((stage, i) => {
            const isDone = isComplete || i < currentStage
            const isActive = !isComplete && i === currentStage
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1 }}>
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.85rem',
                  fontWeight: 'bold',
                  border: '2px solid',
                  transition: 'all 0.4s ease',
                  background: isDone
                    ? 'var(--success)'
                    : isActive
                    ? 'var(--primary)'
                    : 'rgba(255,255,255,0.05)',
                  borderColor: isDone
                    ? 'var(--success)'
                    : isActive
                    ? 'var(--primary)'
                    : 'var(--border)',
                  color: isDone || isActive ? '#000' : 'var(--text-muted)',
                  boxShadow: isActive ? '0 0 16px var(--primary-glow)' : 'none',
                }}>
                  {isDone ? '✓' : i + 1}
                </div>
                <span style={{
                  marginTop: '0.5rem',
                  fontSize: '0.7rem',
                  color: isActive ? 'var(--primary)' : isDone ? 'var(--success)' : 'var(--text-muted)',
                  fontWeight: isActive ? '600' : '400',
                  transition: 'color 0.3s ease',
                  maxWidth: '80px',
                  lineHeight: '1.3'
                }}>
                  {stage.label}
                </span>
              </div>
            )
          })}
        </div>

        {/* Progress Bar */}
        {!isComplete && (
          <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: '999px', height: '8px', overflow: 'hidden', marginBottom: '1rem' }}>
            <div
              ref={fillRef}
              style={{
                height: '100%',
                width: '0%',
                background: 'linear-gradient(90deg, var(--primary), var(--secondary))',
                borderRadius: '999px',
                transition: 'width 0.3s ease',
                boxShadow: '0 0 12px var(--primary-glow)',
              }}
            />
          </div>
        )}
        {!isComplete && (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{progress}% complete</p>
        )}

        {/* Spinner when in early stages with no real progress yet */}
        {!isComplete && progress < 5 && (
          <div style={{ marginTop: '1rem' }}>
            <div className="spinner" />
          </div>
        )}
      </div>
    </div>
  )
}
