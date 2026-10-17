import { useEffect, useRef, type CSSProperties } from 'react'
import { Crosshair, ShieldAlert, X } from 'lucide-react'
import {
  HECTOR_WIPE_MS,
  HECTOR_REVEAL_MS,
  type HectorSession,
  type HectorStatus,
} from '../lib/hector'

export default function HectorOverlay({
  session,
  status,
  onCancel,
}: {
  session: HectorSession
  status: HectorStatus
  onCancel: () => void
}) {
  const exit = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    exit.current?.focus({ preventScroll: true })
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      event.preventDefault()
      exit.current?.focus({ preventScroll: true })
    }
    window.addEventListener('keydown', trap, true)
    return () => window.removeEventListener('keydown', trap, true)
  }, [])
  return (
    <div
      className="hector-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Captain Hector cinematic"
      data-mode={session.mode}
      data-phase={status.phase}
      data-destroyed={status.destroyed}
      style={
        {
          '--hector-wipe-duration': `${HECTOR_WIPE_MS}ms`,
          '--hector-reveal-duration': `${HECTOR_REVEAL_MS}ms`,
        } as CSSProperties
      }
    >
      <div className="hector-letterbox hector-letterbox-top" aria-hidden="true" />
      <header className="hector-hud">
        <div className="hector-transponder">
          <ShieldAlert size={24} />
          <div>
            <span>UNAUTHORIZED VESSEL</span>
            <strong>CAP’N HECTOR</strong>
            <small>Unscheduled orbital inspection</small>
          </div>
        </div>
        <button
          ref={exit}
          onClick={onCancel}
          className="hector-exit"
          aria-label="Cancel Hector cinematic and reset view"
        >
          <X size={17} />
          <span>Escape / cancel</span>
          <kbd>Esc</kbd>
        </button>
      </header>
      <footer className="hector-telemetry">
        <Crosshair size={20} aria-hidden="true" />
        <div>
          <span>HECTOR / COMPLIANCE LOG</span>
          <p aria-live="polite" aria-atomic="true">
            {session.mode === 'playing'
              ? status.message
              : 'Reconstituting the observatory. Nothing to see here.'}
          </p>
        </div>
        <div className="hector-tally">
          <strong>
            {String(status.destroyed).padStart(2, '0')}
            <span> / {String(status.total).padStart(2, '0')}</span>
          </strong>
          <small>TARGETS NEUTRALIZED</small>
          <progress
            value={status.destroyed}
            max={status.total || 1}
            aria-label="Hector attack progress"
          />
        </div>
      </footer>
      <div className="hector-wipe" aria-hidden="true">
        <span>OBSERVATORY RECONSTRUCTION</span>
        <strong>RESTORING ORBITAL ORDER</strong>
        <i />
      </div>
    </div>
  )
}
