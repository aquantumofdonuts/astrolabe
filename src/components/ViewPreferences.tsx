import { useEffect, useId, useRef } from 'react'
import { Settings2, X } from 'lucide-react'
import { DEFAULT_VIEW_PREFERENCES, type ViewPreferences as Preferences } from '../lib/preferences'

export default function ViewPreferences({
  value,
  onChange,
  open,
  onOpen,
  economical,
  onQuality,
  reducedMotion,
}: {
  value: Preferences
  onChange: (patch: Partial<Preferences>) => void
  open: boolean
  onOpen: (open: boolean) => void
  economical: boolean
  onQuality: (economical: boolean) => void
  reducedMotion: boolean
}) {
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const id = useId()
  useEffect(() => {
    if (!open) return
    root.current?.querySelector<HTMLSelectElement>('select')?.focus({ preventScroll: true })
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) onOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onOpen(false)
      trigger.current?.focus({ preventScroll: true })
    }
    const leave = (event: FocusEvent) => {
      if (event.relatedTarget instanceof Node && !root.current?.contains(event.relatedTarget))
        onOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    root.current?.addEventListener('focusout', leave)
    const element = root.current
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', escape)
      element?.removeEventListener('focusout', leave)
    }
  }, [open, onOpen])
  return (
    <div className="view-preferences" ref={root}>
      <button
        ref={trigger}
        className="preferences-trigger"
        aria-label="View preferences"
        title="View preferences"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => onOpen(!open)}
      >
        <Settings2 size={17} aria-hidden="true" />
      </button>
      {open && (
        <section className="preferences-panel" id={id} aria-label="View preferences">
          <header>
            <div>
              <h2>Your observatory</h2>
              <p>Personal settings for this browser.</p>
            </div>
            <button
              aria-label="Close view preferences"
              onClick={() => {
                onOpen(false)
                trigger.current?.focus()
              }}
            >
              <X size={17} />
            </button>
          </header>
          <label className="preference-field">
            <span>Start in</span>
            <select
              value={value.startupView}
              onChange={(event) =>
                onChange({ startupView: event.target.value as Preferences['startupView'] })
              }
            >
              <option value="auto">Automatic · Directory on small screens</option>
              <option value="astrolabe">Astrolabe</option>
              <option value="directory">Directory</option>
            </select>
          </label>
          <label className="preference-field">
            <span>Start with</span>
            <select
              value={value.startupCollection}
              onChange={(event) =>
                onChange({
                  startupCollection: event.target.value as Preferences['startupCollection'],
                })
              }
            >
              <option value="all">All instruments</option>
              <option value="favorites">Favorites</option>
              <option value="recent">Recently launched</option>
            </select>
          </label>
          <p className="preference-note">Startup choices apply the next time you open Astrolabe.</p>
          <label className="preference-field">
            <span>Graphics</span>
            <select
              value={economical ? 'light' : 'full'}
              onChange={(event) => onQuality(event.target.value === 'light')}
            >
              <option value="full">Full · lighting and environmental details</option>
              <option value="light">Light · simpler graphics</option>
            </select>
          </label>
          <label className="preference-toggle">
            <span>
              <strong>Ambient motion</strong>
              <small>Slow orbital motion and faint constellation plasma.</small>
            </span>
            <input
              type="checkbox"
              checked={value.ambientMotion}
              disabled={reducedMotion}
              onChange={(event) => onChange({ ambientMotion: event.target.checked })}
            />
          </label>
          <label className="preference-toggle">
            <span>
              <strong>Idle tour</strong>
              <small>Orbit the system after 45 seconds of inactivity.</small>
            </span>
            <input
              type="checkbox"
              checked={value.idleTour}
              disabled={reducedMotion || !value.ambientMotion}
              onChange={(event) => onChange({ idleTour: event.target.checked })}
            />
          </label>
          {reducedMotion && (
            <p className="preference-note">
              System reduced motion is active. Ambient animation and idle tours are suspended.
            </p>
          )}
          <button
            className="preference-reset"
            onClick={() => {
              onChange(DEFAULT_VIEW_PREFERENCES)
              onQuality(false)
            }}
          >
            Reset view preferences
          </button>
        </section>
      )}
    </div>
  )
}
