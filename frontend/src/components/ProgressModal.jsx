import { useEffect, useRef } from 'react'
import GlassSurface from './GlassSurface'

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
      <div style={{ position: 'relative', borderRadius: '24px', overflow: 'hidden', width: '480px' }}>
        <GlassSurface
          width="100%"
          height="100%"
          borderRadius={24}
          blur={20}
          opacity={0.35}
          brightness={40}
          saturation={1.5}
        >
          <div style={{ padding: '2.5rem', textAlign: 'center', width: '100%', boxSizing: 'border-box' }}>
        
        {/* Animated Icon */}
        <div style={{ fontSize: '3rem', marginBottom: '1rem', display: 'flex', justifyContent: 'center' }}>
          {isComplete ? (
            <span style={{ 
              width: '50px', 
              height: '50px', 
              background: '#ffffff', 
              color: '#000000', 
              borderRadius: '50%', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              fontSize: '24px'
            }}>✔</span>
          ) : <span style={{ filter: 'brightness(0) invert(1)' }}>{stages[currentStage]?.icon || '⚙️'}</span>}
        </div>

        <h2 style={{ fontSize: '1.4rem', marginBottom: '0.5rem', fontWeight: '700', color: '#ffffff' }}>{title}</h2>
        <p style={{ color: '#ffffff', fontSize: '0.95rem', marginBottom: '2.5rem', fontWeight: 700 }}>
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
            background: 'rgba(255,255,255,0.2)',
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
                  background: isDone || isActive ? '#ffffff' : 'rgba(255,255,255,0.05)',
                  borderColor: '#ffffff',
                  color: isDone || isActive ? '#000000' : '#ffffff',
                  boxShadow: isActive ? '0 0 16px rgba(255,255,255,0.3)' : 'none',
                }}>
                  {isDone ? '✓' : i + 1}
                </div>
                <span style={{
                  marginTop: '0.5rem',
                  fontSize: '0.75rem',
                  color: '#ffffff',
                  fontWeight: '700',
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
                background: '#ffffff',
                borderRadius: '999px',
                transition: 'width 0.3s ease',
                boxShadow: '0 0 12px rgba(255,255,255,0.3)',
              }}
            />
          </div>
        )}
        {!isComplete && (
          <p style={{ fontSize: '0.85rem', color: '#ffffff', fontWeight: 700 }}>{progress}% complete</p>
        )}

        {/* Spinner when in early stages with no real progress yet */}
        {!isComplete && progress < 5 && (
          <div style={{ marginTop: '1rem' }}>
            <div className="spinner" />
          </div>
        )}
          </div>
        </GlassSurface>
      </div>
    </div>
  )
}
