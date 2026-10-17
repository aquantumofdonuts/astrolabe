import { useCallback, useEffect, useRef, useState } from 'react'
import type { Catalog } from './catalog'
import { hectorKey, type HectorSession, type HectorStatus } from './hector'

export function useHector({
  catalog,
  blocked,
  enabled,
  onStart,
  onReset,
}: {
  catalog: Catalog | null
  blocked: boolean
  enabled: boolean
  onStart: () => void
  onReset: () => void
}) {
  const [session, setSession] = useState<HectorSession | null>(null)
  const [status, setStatus] = useState<HectorStatus>({
    phase: 'loading',
    destroyed: 0,
    total: 0,
    message: 'Intercepting an incoming transmission…',
  })
  const serial = useRef(0)
  const buffer = useRef({ text: '', at: 0 })
  const reset = useCallback(() => {
    setSession((current) => (current?.mode === 'playing' ? { ...current, mode: 'wipe' } : current))
  }, [])
  const dismiss = useCallback(() => setSession(null), [])
  useEffect(() => {
    const forget = () => {
      buffer.current = { text: '', at: 0 }
    }
    const keydown = (event: KeyboardEvent) => {
      if (session) {
        const activatingExit =
          (event.key === 'Enter' || event.key === ' ') &&
          event.target instanceof Element &&
          event.target.closest('.hector-exit')
        if (activatingExit) return
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopImmediatePropagation()
          reset()
        } else if (event.key !== 'Tab' && !event.ctrlKey && !event.metaKey) {
          event.preventDefault()
          event.stopImmediatePropagation()
        }
        return
      }
      const editing =
        event.target instanceof Element &&
        event.target.closest(
          'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"]'
        )
      if (
        !catalog ||
        !enabled ||
        blocked ||
        editing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      ) {
        forget()
        return
      }
      if (event.repeat) return
      if (event.key === 'Shift' || event.key === 'CapsLock') return
      if (event.key.length !== 1) {
        forget()
        return
      }
      const next = hectorKey(buffer.current, event.key, performance.now())
      buffer.current = next
      if (next.consumed) {
        event.preventDefault()
        event.stopImmediatePropagation()
      }
      if (!next.matched) return
      setStatus({
        phase: 'loading',
        destroyed: 0,
        total: catalog.sites.length,
        message: 'Intercepting an incoming transmission…',
      })
      setSession({ id: ++serial.current, catalog, mode: 'playing' })
      onStart()
    }
    window.addEventListener('keydown', keydown, true)
    window.addEventListener('blur', forget)
    window.addEventListener('pointerdown', forget, true)
    window.addEventListener('focusin', forget)
    return () => {
      window.removeEventListener('keydown', keydown, true)
      window.removeEventListener('blur', forget)
      window.removeEventListener('pointerdown', forget, true)
      window.removeEventListener('focusin', forget)
    }
  }, [catalog, blocked, enabled, session, onStart, reset])
  useEffect(() => {
    if (!session) return
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
    }
  }, [!!session])
  useEffect(() => {
    if (session?.mode !== 'wipe') return
    const timer = window.setTimeout(() => {
      onReset()
      setSession((current) => (current ? { ...current, mode: 'reveal' } : null))
    }, 480)
    return () => window.clearTimeout(timer)
  }, [session?.mode, onReset])
  useEffect(() => {
    if (session?.mode !== 'reveal') return
    const timer = window.setTimeout(() => {
      setSession(null)
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>('.observatory-renderer')?.focus({ preventScroll: true })
      )
    }, 850)
    return () => window.clearTimeout(timer)
  }, [session?.mode])
  useEffect(() => {
    if (session?.mode !== 'playing') return
    // Loading failures or a lost WebGL context must never leave the portal locked.
    const timer = window.setTimeout(reset, 90_000)
    return () => window.clearTimeout(timer)
  }, [session?.id, session?.mode, reset])
  return { session, status, report: setStatus, reset, dismiss }
}
