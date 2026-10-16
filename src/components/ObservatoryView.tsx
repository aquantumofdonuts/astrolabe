import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import type { ComponentProps } from 'react'
import { Grid2X2 } from 'lucide-react'

const Observatory = lazy(() => import('./Observatory'))

export default function ObservatoryView({
  onDirectory,
  ...props
}: Omit<ComponentProps<typeof Observatory>, 'onReady'> & { onDirectory: () => void }) {
  const [started, setStarted] = useState(false)
  const [ready, setReady] = useState(false)
  const onReady = useCallback(() => setReady(true), [])
  useEffect(() => {
    // Paint the lightweight loader before module evaluation, geometry, or WebGL setup.
    let nextFrame = 0
    const firstFrame = requestAnimationFrame(() => {
      nextFrame = requestAnimationFrame(() => setStarted(true))
    })
    return () => {
      cancelAnimationFrame(firstFrame)
      cancelAnimationFrame(nextFrame)
    }
  }, [])
  return (
    <div className="scene-experience" data-scene-state={ready ? 'ready' : 'loading'}>
      <div className="scene-content" aria-busy={!ready} aria-hidden={!ready} inert={!ready}>
        {started && (
          <Suspense fallback={null}>
            <Observatory {...props} idleEnabled={props.idleEnabled && ready} onReady={onReady} />
          </Suspense>
        )}
      </div>
      {!ready && (
        <div className="scene-loading">
          <div className="loading-system" aria-hidden="true">
            <span className="loading-orbit" />
            <span className="loading-orbit" />
            <span className="loading-orbit" />
            <span className="loading-star" />
          </div>
          <div role="status" aria-live="polite" aria-atomic="true">
            <h2>Opening the observatory</h2>
            <p>Preparing your instruments. You can browse the Directory while you wait.</p>
          </div>
          <button className="secondary-button" onClick={onDirectory}>
            <Grid2X2 size={15} aria-hidden="true" />
            Open Directory
          </button>
        </div>
      )}
    </div>
  )
}
