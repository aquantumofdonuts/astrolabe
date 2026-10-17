import { useLayoutEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  Clock3,
  Search,
  SlidersHorizontal,
  Star,
  X,
} from 'lucide-react'
import type { Catalog, Instrument } from '../lib/catalog'
import { InstrumentIcon } from './InstrumentIcon'
import LaunchLink, { type LaunchFeedback } from './LaunchLink'

export default function LaunchDock({
  catalog,
  favorites,
  recents,
  onFavorites,
  onLaunch,
  onRemember,
  onSearch,
  previewId,
  feedback,
}: {
  catalog: Catalog
  favorites: string[]
  recents: string[]
  onFavorites: (ids: string[]) => void
  onLaunch: (site: Instrument) => void
  onRemember: (site: Instrument) => void
  onSearch: () => void
  previewId: string | null
  feedback: LaunchFeedback | null
}) {
  const [editing, setEditing] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const preview = catalog.sites.find((site) => site.id === (hoveredId ?? focusedId ?? previewId))
  const dock = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const element = dock.current!
    const shell = element.closest<HTMLElement>('.app-shell')!
    const measure = () =>
      shell.style.setProperty(
        '--launch-dock-height',
        `${element.getBoundingClientRect().height + parseFloat(getComputedStyle(element).marginBottom)}px`
      )
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => {
      observer.disconnect()
      shell.style.removeProperty('--launch-dock-height')
    }
  }, [])
  const resolve = (ids: string[]) =>
    ids.flatMap((id) => {
      const site = catalog.sites.find((site) => site.id === id)
      return site ? [site] : []
    })
  const pinned = resolve(favorites)
  const sites = pinned.length ? pinned : catalog.sites.filter((site) => site.featured).slice(0, 6)
  const recent = resolve(recents)
    .filter((site) => !sites.some((pin) => pin.id === site.id))
    .slice(0, 2)
  const move = (id: string, direction: number) => {
    const ids = pinned.map((site) => site.id)
    const index = ids.indexOf(id)
    const target = index + direction
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    onFavorites(ids)
  }
  const link = (site: Instrument) => {
    const content = (
      <>
        <span className="dock-emblem">
          <InstrumentIcon site={site} size={24} />
        </span>
        <span className="dock-tool-name">{site.name}</span>
        <ArrowUpRight size={12} className="dock-launch-arrow launch-arrow" />
      </>
    )
    return (
      <LaunchLink
        site={site}
        className="dock-link"
        onRemember={onRemember}
        onLaunch={onLaunch}
        launching={feedback?.id === site.id}
        title={site.description}
        onPointerEnter={() => setHoveredId(site.id)}
        onPointerLeave={() => setHoveredId(null)}
        onFocus={() => setFocusedId(site.id)}
        onBlur={() => setFocusedId(null)}
      >
        {content}
      </LaunchLink>
    )
  }

  return (
    <section ref={dock} className="launch-dock" aria-label="Quick launch" data-editing={editing}>
      <div className="dock-heading">
        <span>
          <Star size={12} /> {pinned.length ? 'Your launchpad' : 'Featured tools'}
        </span>
        <span
          className={`dock-hint ${preview && !editing ? 'dock-preview' : ''} ${feedback ? 'dock-feedback' : ''}`}
          title={preview?.description}
        >
          {feedback
            ? feedback.label
            : editing
              ? 'Use the arrows to arrange favorites'
              : preview
                ? `${preview.name} · ${preview.description}`
                : 'Your tools. One click away.'}
        </span>
        <button
          onClick={() => setEditing(!editing)}
          aria-label={editing ? 'Finish arranging favorites' : 'Arrange favorites'}
          aria-pressed={editing}
        >
          {editing ? <Check size={13} /> : <SlidersHorizontal size={13} />}
          {editing ? 'Done' : 'Arrange'}
        </button>
      </div>
      <div className="dock-body">
        <button className="dock-search" onClick={onSearch} aria-label="Search all tools">
          <Search size={20} />
          <span>Find a tool</span>
          <kbd>/</kbd>
        </button>
        <div
          className="dock-tools"
          role="list"
          aria-label={pinned.length ? 'Pinned tools' : 'Featured tools'}
        >
          {sites.map((site, index) => (
            <div
              className="dock-item"
              role="listitem"
              key={site.id}
              style={
                {
                  '--dock-accent': catalog.categories.find((cat) => cat.id === site.category)
                    ?.color,
                } as React.CSSProperties
              }
            >
              {link(site)}
              {editing && pinned.length > 0 && (
                <div className="dock-arrange">
                  <button
                    disabled={index === 0}
                    onClick={() => move(site.id, -1)}
                    aria-label={`Move ${site.name} earlier`}
                  >
                    <ArrowLeft size={12} />
                  </button>
                  <button
                    onClick={() => onFavorites(favorites.filter((id) => id !== site.id))}
                    aria-label={`Unpin ${site.name}`}
                  >
                    <X size={12} />
                  </button>
                  <button
                    disabled={index === sites.length - 1}
                    onClick={() => move(site.id, 1)}
                    aria-label={`Move ${site.name} later`}
                  >
                    <ArrowRight size={12} />
                  </button>
                </div>
              )}
            </div>
          ))}
          {!sites.length && <p className="dock-empty">Star a tool to keep it here.</p>}
        </div>
        {recent.length > 0 && !editing && (
          <div className="dock-recents" aria-label="Recent tools">
            <span>
              <Clock3 size={11} /> Recent
            </span>
            <div>
              {recent.map((site) => (
                <div className="dock-item" key={site.id}>
                  {link(site)}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {editing && !pinned.length && (
        <p className="dock-empty">
          Star tools in their details or Directory to build your own launchpad.
        </p>
      )}
    </section>
  )
}
