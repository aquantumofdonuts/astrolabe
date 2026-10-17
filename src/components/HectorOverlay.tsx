import { useEffect, useRef } from 'react'
import { Crosshair, ShieldAlert, X } from 'lucide-react'
import type { HectorSession, HectorStatus } from '../lib/hector'

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
    >
      <div className="hector-letterbox hector-letterbox-top" aria-hidden="true" />
      <header className="hector-hud">
        <div className="hector-transponder">
          <ShieldAlert size={24} />
          <div>
            <span>UNAUTHORIZED VESSEL</span>
            <strong>CAP’N HECTOR</strong>
            <small>Shareware enforcement division</small>
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
      {(status.phase === 'loading' || status.phase === 'warning') && session.mode === 'playing' && (
        <div className="hector-transmission">
          <span>INCOMING TRANSMISSION</span>
          <h2>
            Your trial period
            <br />
            has expired.
          </h2>
          <p>Please remain perfectly still.</p>
          <small>Resistance is… adorable.</small>
        </div>
      )}
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
