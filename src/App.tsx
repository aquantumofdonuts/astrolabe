import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Command,
  Compass,
  ExternalLink,
  FlaskConical,
  Grid2X2,
  CircleHelp,
  Maximize2,
  Minimize2,
  Minus,
  Orbit,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Search,
  Settings2,
  Sparkles,
  Star,
  X,
} from 'lucide-react'
import { InstrumentIcon } from './components/InstrumentIcon'
import type { FocusRequest } from './lib/focus'
import type { Catalog, Instrument } from './lib/catalog'
import { LOCAL_CATALOG_KEY, searchSites, validateCatalog } from './lib/catalog'
import { readPreference, writePreference } from './lib/preferences'
import { AstrolabeMark, Icon } from './components/Icon'
import { Modal } from './components/Modal'
import CatalogStudio from './components/CatalogStudio'
import { catalogApi, readSharedCatalog, saveSharedCatalog } from './lib/liveCatalog'
import DemoPreview from './components/DemoPreview'
import ObservatoryView from './components/ObservatoryView'
const FAVORITES_KEY = 'astrolabe.favorites.v1'
const RECENTS_KEY = 'astrolabe.recents.v1'

function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReduced(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  return reduced
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : []
}

export default function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [deployedCatalog, setDeployedCatalog] = useState<Catalog | null>(null)
  const [loadError, setLoadError] = useState('')
  const [localPreview, setLocalPreview] = useState(false)
  const localPreviewRef = useRef(false)
  const [catalogRevision, setCatalogRevision] = useState<string | null>(null)
  const sharedRevision = useRef<string | null>(null)
  const sharedRequest = useRef(0)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [collection, setCollection] = useState<'all' | 'favorites' | 'recent'>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [view, setView] = useState<'astrolabe' | 'directory'>(() =>
    window.innerWidth < 900 ? 'directory' : 'astrolabe'
  )
  const [paused, setPaused] = useState(false)
  const [economical, setEconomical] = useState(
    () => readPreference<boolean>('astrolabe.economical', false) === true
  )
  const reducedMotion = useReducedMotion()
  const [resetKey, setResetKey] = useState(0)
  const [zoomRequest, setZoomRequest] = useState(0)
  const [visit, setVisit] = useState<FocusRequest | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchIndex, setSearchIndex] = useState(0)
  const [studioOpen, setStudioOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false)
  const [demo, setDemo] = useState<Instrument | null>(null)
  const [toast, setToast] = useState('')
  const [webglUnavailable, setWebglUnavailable] = useState(false)
  const [favorites, setFavorites] = useState<string[]>(() =>
    stringList(readPreference(FAVORITES_KEY, []))
  )
  const [recents, setRecents] = useState<string[]>(() =>
    stringList(readPreference(RECENTS_KEY, []))
  )
  const searchRef = useRef<HTMLInputElement>(null)
  const stageRef = useRef<HTMLElement>(null)
  const searchContainer = useRef<HTMLDivElement>(null)
  const searchView = useRef(view)

  const clearSelection = useCallback(() => {
    setSelectedId(null)
    setMobileDetailsOpen(false)
    setVisit(null)
  }, [])

  const changeView = useCallback(
    (next: 'astrolabe' | 'directory') => {
      clearSelection()
      setView(next)
      setExpanded(false)
    },
    [clearSelection]
  )

  useEffect(() => {
    if (view === 'directory') setExpanded(false)
  }, [view])

  useEffect(() => {
    const abort = new AbortController()
    let events: EventSource | undefined
    const refreshShared = async () => {
      const request = ++sharedRequest.current
      const shared = await readSharedCatalog(abort.signal)
      if (abort.signal.aborted || request !== sharedRequest.current) return
      if (shared.revision === sharedRevision.current) return
      sharedRevision.current = shared.revision
      setDeployedCatalog(shared.catalog)
      setCatalogRevision(shared.revision)
      if (!localPreviewRef.current) setCatalog(shared.catalog)
    }
    readSharedCatalog(abort.signal)
      .then((shared) => {
        sharedRevision.current = shared.revision
        setCatalogRevision(shared.revision)
        return shared.catalog
      })
      .catch(async (error) => {
        if (abort.signal.aborted) throw error
        const response = await fetch(`${import.meta.env.BASE_URL}catalog.json`, {
          signal: abort.signal,
          cache: 'no-cache',
        })
        if (!response.ok) throw new Error(`Catalog request failed (${response.status}).`)
        return response.json()
      })
      .then((data) => {
        const deployed = validateCatalog(data)
        setDeployedCatalog(deployed)
        let current = deployed
        try {
          const saved = localStorage.getItem(LOCAL_CATALOG_KEY)
          if (saved) {
            current = validateCatalog(JSON.parse(saved))
            localPreviewRef.current = true
            setLocalPreview(true)
          }
        } catch {
          setToast('The saved local preview could not be read. Showing the deployed catalog.')
        }
        setCatalog(current)
        setSelectedId(null)
        // Static deployments retain the existing local preview/import/export workflow.
        if (sharedRevision.current && !abort.signal.aborted) {
          events = new EventSource(`${catalogApi}/events`)
          events.onmessage = (event) => {
            if (JSON.parse(event.data) !== sharedRevision.current)
              void refreshShared().catch(() => {})
          }
        }
      })
      .catch((error) => {
        if (error.name !== 'AbortError') setLoadError(error.message)
      })
    return () => {
      abort.abort()
      events?.close()
    }
  }, [])
  useEffect(() => {
    if (!toast) return
    const timeout = window.setTimeout(() => setToast(''), 6000)
    return () => clearTimeout(timeout)
  }, [toast])
  useEffect(() => {
    setSearchIndex(0)
  }, [query])
  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      if (!searchContainer.current?.contains(event.target as Node)) setSearchOpen(false)
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (studioOpen || demo || helpOpen || mobileDetailsOpen) return
      const input =
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement ||
        (event.target instanceof HTMLElement && event.target.isContentEditable)
      if (
        (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) ||
        (!input && event.key === '/')
      ) {
        event.preventDefault()
        searchRef.current?.focus()
        setSearchOpen(true)
      }
      if (event.key === 'Escape') {
        setQuery('')
        setSearchOpen(false)
        setExpanded(false)
        searchRef.current?.blur()
      }
      if (!input && event.key === '?') setHelpOpen(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [studioOpen, demo, helpOpen, mobileDetailsOpen])

  const allMatches = useMemo(
    () => (catalog ? searchSites(catalog.sites, query, catalog.categories) : []),
    [catalog, query]
  )
  useEffect(() => {
    const viewChanged = searchView.current !== view
    searchView.current = view
    if (!query.trim()) return
    setCategory('all')
    setCollection('all')
    // Returning to the scene must not reopen details for the previous search preview.
    if (view === 'astrolabe' && !viewChanged) setSelectedId(allMatches[searchIndex]?.id ?? null)
    else clearSelection()
  }, [query, allMatches, searchIndex, view, clearSelection])
  const visibleSites = useMemo(() => {
    let sites = allMatches.filter((site) => category === 'all' || site.category === category)
    if (collection === 'favorites') sites = sites.filter((site) => favorites.includes(site.id))
    if (collection === 'recent')
      sites = sites
        .filter((site) => recents.includes(site.id))
        .sort((a, b) => recents.indexOf(a.id) - recents.indexOf(b.id))
    return sites
  }, [allMatches, category, collection, favorites, recents])
  const selected = catalog?.sites.find((site) => site.id === selectedId)
  const activeDemo = catalog?.sites.find((site) => site.id === demo?.id)
  useEffect(() => {
    if (!catalog) return
    if (category !== 'all' && !catalog.categories.some((entry) => entry.id === category))
      setCategory('all')
    if (demo && !activeDemo) setDemo(null)
  }, [catalog, category, demo, activeDemo])
  useEffect(() => {
    if (!selected) {
      setMobileDetailsOpen(false)
      if (selectedId) clearSelection()
    } else if (!query.trim() && !visibleSites.some((site) => site.id === selected.id))
      clearSelection()
  }, [selected, selectedId, visibleSites, query, clearSelection])
  const selectedCategory = catalog?.categories.find((entry) => entry.id === selected?.category)
  const activeCategory = catalog?.categories.find((entry) => entry.id === category)
  const favoritesCount = catalog?.sites.filter((site) => favorites.includes(site.id)).length || 0
  const recentsCount = catalog?.sites.filter((site) => recents.includes(site.id)).length || 0
  const launchpad = catalog?.sites.filter((site) => favorites.includes(site.id)).slice(0, 4) || []
  if (launchpad.length === 0)
    launchpad.push(...(catalog?.sites.filter((site) => site.featured).slice(0, 4) || []))
  const toggleFavorite = (id: string) => {
    const next = favorites.includes(id)
      ? favorites.filter((entry) => entry !== id)
      : [...favorites, id]
    setFavorites(next)
    if (!writePreference(FAVORITES_KEY, next))
      setToast('Favorites changed for this session. Browser storage is unavailable.')
  }
  const rememberLaunch = (site: Instrument) => {
    setMobileDetailsOpen(false)
    const next = [site.id, ...recents.filter((entry) => entry !== site.id)].slice(0, 20)
    setRecents(next)
    writePreference(RECENTS_KEY, next)
    setSearchOpen(false)
  }
  const launch = (site: Instrument) => {
    rememberLaunch(site)
    if (site.url) window.open(site.url, '_blank', 'noopener,noreferrer')
    else setDemo(site)
  }
  const select = (id: string) => {
    setCategory('all')
    setSelectedId(id)
    setVisit((current) => ({ kind: 'node', id, key: (current?.key ?? 0) + 1 }))
    setSearchOpen(false)
    if (window.matchMedia('(max-width: 1000px)').matches) setMobileDetailsOpen(true)
  }
  const changeCategory = (id: string) => {
    setQuery('')
    setCategory(id)
    setCollection('all')
    clearSelection()
    if (id === 'all') {
      setVisit(null)
      setResetKey((key) => key + 1)
    } else setVisit((current) => ({ kind: 'category', id, key: (current?.key ?? 0) + 1 }))
  }
  const resetFilters = () => {
    setQuery('')
    setCategory('all')
    setCollection('all')
  }
  const onUnavailable = useCallback(() => {
    setWebglUnavailable(true)
    changeView('directory')
    setToast(
      '3D rendering is unavailable in this browser. All instruments are available in the directory.'
    )
  }, [changeView])

  const startIdle = useCallback(() => {
    clearSelection()
    setQuery('')
    setCategory('all')
    setCollection('all')
    setSearchOpen(false)
  }, [clearSelection])

  if (!catalog)
    return (
      <div className="loading-screen">
        <AstrolabeMark size={60} />
        <h1>Astrolabe</h1>
        {loadError ? (
          <>
            <p role="alert">{loadError}</p>
            <p>Check that catalog.json is available and uses the documented format.</p>
            <button className="secondary-button" onClick={() => window.location.reload()}>
              Try again
            </button>
          </>
        ) : (
          <p>
            Opening the observatory<span className="loading-dots">…</span>
          </p>
        )}
      </div>
    )

  const LaunchLink = ({
    site,
    className = '',
    children,
  }: {
    site: Instrument
    className?: string
    children: React.ReactNode
  }) =>
    site.url ? (
      <a
        className={className}
        href={site.url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => rememberLaunch(site)}
        aria-label={`Launch ${site.name} in a new tab`}
      >
        {children}
      </a>
    ) : (
      <button
        className={className}
        onClick={() => launch(site)}
        aria-label={`Preview ${site.name} demo`}
      >
        {children}
      </button>
    )

  return (
    <div
      className={`app-shell cinematic ${view === 'astrolabe' ? 'world-view' : 'catalog-view'} ${selected ? 'has-selection' : ''} ${expanded ? 'scene-expanded' : ''}`}
    >
      <a className="skip-link" href="#instruments">
        Skip to instruments
      </a>
      <header className="topbar">
        <a
          href="#"
          className="brand"
          aria-label="Astrolabe home"
          onClick={(event) => {
            event.preventDefault()
            resetFilters()
            changeView(webglUnavailable ? 'directory' : 'astrolabe')
            setResetKey((key) => key + 1)
          }}
        >
          <span className="brand-monogram" aria-hidden="true">
            <AstrolabeMark size={28} />
          </span>
          <div>ASTROLABE</div>
        </a>
        <div className="workspace-breadcrumb">
          <span>WORKSPACE</span>
          <ChevronRight size={12} />
          <span>{catalog.title}</span>
        </div>
        <div className="search-container" ref={searchContainer}>
          <div className={`search-box ${searchOpen ? 'search-focused' : ''}`}>
            <Search size={17} />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setSearchOpen(true)
              }}
              onFocus={() => setSearchOpen(true)}
              placeholder="Search instruments…"
              aria-label="Search instruments"
              aria-expanded={searchOpen}
              aria-controls="search-results"
              aria-autocomplete="list"
              role="combobox"
              aria-activedescendant={
                searchOpen && allMatches[searchIndex]
                  ? `search-${allMatches[searchIndex].id}`
                  : undefined
              }
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault()
                  setSearchOpen(true)
                  setSearchIndex((index) => Math.min(index + 1, allMatches.length - 1))
                }
                if (event.key === 'ArrowUp') {
                  event.preventDefault()
                  setSearchIndex((index) => Math.max(index - 1, 0))
                }
                if (event.key === 'Enter' && allMatches[searchIndex]) {
                  event.preventDefault()
                  launch(allMatches[searchIndex])
                }
              }}
            />
            {query ? (
              <button
                className="clear-search"
                onClick={() => {
                  setQuery('')
                  searchRef.current?.focus()
                }}
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            ) : (
              <kbd>
                <Command size={11} /> K
              </kbd>
            )}
          </div>
          {searchOpen && (
            <div className="search-popover">
              <div className="search-popover-heading">
                <span>
                  {query
                    ? `${allMatches.length} matching ${allMatches.length === 1 ? 'instrument' : 'instruments'}`
                    : 'ALL INSTRUMENTS'}
                </span>
                <small>↑ ↓ to navigate · ↵ to launch</small>
              </div>
              <div role="listbox" id="search-results" aria-label="Search results">
                {allMatches.map((site, index) => (
                  <div
                    key={site.id}
                    id={`search-${site.id}`}
                    role="option"
                    aria-selected={index === searchIndex}
                    className={`search-result ${index === searchIndex ? 'active' : ''}`}
                  >
                    <button onClick={() => select(site.id)}>
                      <span
                        style={{
                          color: catalog.categories.find((entry) => entry.id === site.category)!
                            .color,
                        }}
                      >
                        <InstrumentIcon site={site} size={19} />
                      </span>
                      <div>
                        <strong>{site.name}</strong>
                        <small>
                          {catalog.categories.find((entry) => entry.id === site.category)!.name}
                        </small>
                      </div>
                    </button>
                    <LaunchLink site={site} className="search-launch">
                      <ArrowUpRight size={16} />
                    </LaunchLink>
                  </div>
                ))}
              </div>
              {!allMatches.length && (
                <p className="search-empty">
                  No instruments found. Try “network”, “scripts”, or “chat”.
                </p>
              )}
              <div className="search-popover-footer">
                Search names, descriptions, and keywords across the whole catalog.
              </div>
            </div>
          )}
        </div>
        <button
          className="secondary-button help-button"
          aria-haspopup="dialog"
          onClick={() => {
            setSearchOpen(false)
            setHelpOpen(true)
          }}
        >
          <CircleHelp size={17} aria-hidden="true" />
          Help
        </button>
      </header>

      <aside className="sidebar" aria-label="Workspace navigation">
        <div className="sidebar-top">
          <span className="eyebrow">COLLECTION</span>
          <nav className="collection-nav">
            <button
              className={collection === 'all' && category === 'all' ? 'active' : ''}
              aria-pressed={collection === 'all' && category === 'all'}
              onClick={() => {
                changeCategory('all')
              }}
            >
              <Compass size={18} />
              <span>All instruments</span>
              <small>{catalog.sites.length}</small>
            </button>
            <button
              className={collection === 'favorites' ? 'active' : ''}
              aria-pressed={collection === 'favorites'}
              onClick={() => {
                clearSelection()
                setCollection('favorites')
                setCategory('all')
              }}
            >
              <Star size={17} />
              <span>Favorites</span>
              <small>{favoritesCount}</small>
            </button>
            <button
              className={collection === 'recent' ? 'active' : ''}
              aria-pressed={collection === 'recent'}
              onClick={() => {
                clearSelection()
                setCollection('recent')
                setCategory('all')
              }}
            >
              <RotateCcw size={16} />
              <span>Recently launched</span>
              <small>{recentsCount}</small>
            </button>
          </nav>
          <div className="sidebar-divider" />
          <span className="eyebrow">DESTINATIONS</span>
          <nav className="category-nav">
            {catalog.categories.map((entry) => (
              <button
                key={entry.id}
                className={category === entry.id ? 'active' : ''}
                aria-pressed={category === entry.id}
                onClick={() => changeCategory(entry.id)}
                style={{ '--category-color': entry.color } as React.CSSProperties}
              >
                <Icon name={entry.icon} size={18} />
                <span>{entry.name}</span>
                <small>{catalog.sites.filter((site) => site.category === entry.id).length}</small>
              </button>
            ))}
          </nav>
        </div>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <span className="mini-orbit">✧</span>
            <p>
              A little order.
              <br />
              <em>A little magic.</em>
            </p>
          </div>
          <button
            className="studio-button"
            aria-label="Catalog studio"
            onClick={() => setStudioOpen(true)}
          >
            <Settings2 size={16} />
            <span>Catalog studio</span>
            <ArrowUpRight size={14} />
          </button>
          <div className="sidebar-version">
            <span className="tiny-dot" />
            {localPreview ? 'LOCAL PREVIEW' : 'EXPLORER EDITION'}
            <span>01</span>
          </div>
        </div>
      </aside>

      <main className="main-content" id="main">
        <h1 className="sr-only">Astrolabe observatory</h1>
        {localPreview && (
          <div className="local-preview-banner">
            <FlaskConical size={14} />
            <span>Local catalog preview · visible only in this browser</span>
            <button onClick={() => setStudioOpen(true)}>
              Export or restore
              <ArrowUpRight size={13} />
            </button>
          </div>
        )}
        <div className="view-toolbar">
          <div className="view-tabs" aria-label="Instrument view">
            <button
              className={view === 'astrolabe' ? 'active' : ''}
              aria-pressed={view === 'astrolabe'}
              onClick={() => changeView('astrolabe')}
              disabled={webglUnavailable}
            >
              <Orbit size={16} />
              Astrolabe
            </button>
            <button
              className={view === 'directory' ? 'active' : ''}
              aria-pressed={view === 'directory'}
              onClick={() => changeView('directory')}
            >
              <Grid2X2 size={15} />
              Directory
            </button>
          </div>
          <span className="results-count" aria-live="polite">
            {visibleSites.length} {visibleSites.length === 1 ? 'instrument' : 'instruments'}
            {category !== 'all' || collection !== 'all' || query ? ' in view' : ' available'}
            {(category !== 'all' || collection !== 'all' || query) && (
              <button onClick={resetFilters}>
                Clear filters
                <X size={11} />
              </button>
            )}
          </span>
        </div>
        <section
          ref={stageRef}
          className={`stage ${view === 'directory' ? 'directory-stage' : ''}`}
          id="instruments"
          aria-label={view === 'astrolabe' ? 'Interactive astrolabe' : 'Instrument directory'}
          tabIndex={-1}
        >
          {view === 'astrolabe' ? (
            <>
              <div className="scene-canvas">
                <ObservatoryView
                  catalog={catalog}
                  visibleIds={visibleSites.map((site) => site.id)}
                  selectedId={selectedId}
                  category={category}
                  paused={paused}
                  reducedMotion={reducedMotion}
                  economical={economical}
                  resetKey={resetKey}
                  zoomRequest={zoomRequest}
                  visit={visit}
                  onCategory={changeCategory}
                  onSelect={select}
                  onUnavailable={onUnavailable}
                  onDirectory={() => changeView('directory')}
                  idleEnabled={
                    !paused &&
                    !reducedMotion &&
                    !studioOpen &&
                    !helpOpen &&
                    !demo &&
                    !mobileDetailsOpen
                  }
                  onIdleStart={startIdle}
                />
              </div>
              {!visibleSites.length && (
                <div className="scene-empty">
                  <h3>
                    {collection === 'favorites' ? 'No favorites yet' : 'No matching instruments'}
                  </h3>
                  <p>
                    {collection === 'favorites'
                      ? 'Star an instrument to keep it close.'
                      : collection === 'recent'
                        ? 'Launch an instrument to start your history.'
                        : 'Try another keyword or clear your filters.'}
                  </p>
                  <button className="secondary-button" onClick={resetFilters}>
                    Show all instruments
                  </button>
                </div>
              )}
              <div className="stage-bottom">
                <div className="scene-controls">
                  <button
                    className="quality-button"
                    aria-label="Use lighter graphics"
                    aria-pressed={economical}
                    onClick={() => {
                      setEconomical(!economical)
                      writePreference('astrolabe.economical', !economical)
                    }}
                  >
                    {economical ? 'Quality: light' : 'Quality: full'}
                  </button>
                  <button
                    className="icon-button"
                    onClick={() => setZoomRequest((value) => value + 1)}
                    aria-label="Zoom in"
                    title="Fly forward"
                  >
                    <Plus size={15} />
                  </button>
                  <button
                    className="icon-button"
                    onClick={() => setZoomRequest((value) => value - 1)}
                    aria-label="Zoom out"
                    title="Fly backward"
                  >
                    <Minus size={15} />
                  </button>
                  <button
                    className="icon-button"
                    onClick={() => setPaused((value) => !value)}
                    disabled={reducedMotion}
                    aria-label={paused ? 'Resume ambient motion' : 'Pause ambient motion'}
                    aria-pressed={paused || reducedMotion}
                    title={
                      reducedMotion
                        ? 'System reduced-motion preference is active'
                        : paused
                          ? 'Resume ambient motion'
                          : 'Pause ambient motion'
                    }
                  >
                    {paused || reducedMotion ? <Play size={15} /> : <Pause size={15} />}
                  </button>
                  <button
                    className="icon-button"
                    onClick={() => {
                      setResetKey((key) => key + 1)
                      setToast('Camera reset to overview.')
                    }}
                    aria-label="Reset camera"
                    title="Reset camera"
                  >
                    <RotateCcw size={15} />
                  </button>
                  <button
                    className="icon-button"
                    onClick={() => setExpanded((value) => !value)}
                    aria-label={expanded ? 'Exit expanded view' : 'Expand astrolabe'}
                    aria-pressed={expanded}
                    title={expanded ? 'Exit expanded view' : 'Expand astrolabe'}
                  >
                    {expanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
                  </button>
                </div>
              </div>
              <div className="astrolabe-legend">
                {catalog.categories.map((entry) => (
                  <button
                    key={entry.id}
                    onClick={() => changeCategory(category === entry.id ? 'all' : entry.id)}
                    className={category === entry.id ? 'active' : ''}
                  >
                    <span className="category-dot" style={{ background: entry.color }} />
                    {entry.name}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="directory-heading">
                <h2>{activeCategory ? activeCategory.name : 'Instrument directory'}</h2>
              </div>
              <div className="directory-grid">
                {visibleSites.map((site) => {
                  const cat = catalog.categories.find((entry) => entry.id === site.category)!
                  return (
                    <article
                      key={site.id}
                      className={`directory-card ${site.id === selectedId ? 'selected' : ''}`}
                      style={{ '--accent': cat.color } as React.CSSProperties}
                    >
                      <div className="directory-card-top">
                        <span className="instrument-icon">
                          <InstrumentIcon site={site} size={22} />
                        </span>
                        <button
                          className={`favorite-button ${favorites.includes(site.id) ? 'is-favorite' : ''}`}
                          aria-label={`${favorites.includes(site.id) ? 'Unfavorite' : 'Favorite'} ${site.name}`}
                          aria-pressed={favorites.includes(site.id)}
                          onClick={() => toggleFavorite(site.id)}
                        >
                          <Star size={16} />
                        </button>
                      </div>
                      <button className="directory-select" onClick={() => select(site.id)}>
                        <small>{cat.name}</small>
                        <h2>{site.name}</h2>
                        <p>{site.description}</p>
                      </button>
                      <div className="directory-card-footer">
                        <span>{site.url ? 'Website' : 'Demo instrument'}</span>
                        <LaunchLink site={site} className="directory-launch">
                          {site.url ? 'Launch' : 'Preview'}
                          <ArrowUpRight size={15} />
                        </LaunchLink>
                      </div>
                    </article>
                  )
                })}
              </div>
              {!visibleSites.length && (
                <div className="empty-state">
                  <h3>
                    {collection === 'favorites' ? 'No favorites yet' : 'No matching instruments'}
                  </h3>
                  <p>
                    {collection === 'favorites'
                      ? 'Star any instrument to add it to your favorites.'
                      : collection === 'recent'
                        ? 'Launch an instrument and it will appear here.'
                        : 'Try another search or explore the complete collection.'}
                  </p>
                  <button className="secondary-button" onClick={resetFilters}>
                    Show all instruments
                  </button>
                </div>
              )}
            </>
          )}
        </section>
        {view === 'directory' && (
          <section className="launchpad" aria-label="Quick launch">
            <div className="launchpad-heading">
              <h2>
                <Star size={14} />
                Quick launch
              </h2>
              <span>{favoritesCount ? 'Favorites' : 'Featured'}</span>
            </div>
            <div className="launchpad-grid">
              {launchpad.map((site) => {
                const cat = catalog.categories.find((entry) => entry.id === site.category)!
                return (
                  <div
                    className="launchpad-card"
                    key={site.id}
                    style={{ '--accent': cat.color } as React.CSSProperties}
                  >
                    <LaunchLink site={site} className="launchpad-link">
                      <span className="launchpad-icon">
                        <InstrumentIcon site={site} size={19} />
                      </span>
                      <div>
                        <strong>{site.name}</strong>
                        <span>{cat.name}</span>
                      </div>
                      <ArrowUpRight size={15} />
                    </LaunchLink>
                  </div>
                )
              })}
              {!launchpad.length && (
                <p>Add featured instruments in Catalog studio or star a tool.</p>
              )}
            </div>
          </section>
        )}
      </main>

      <aside
        className="inspector"
        aria-label="Selected instrument"
        aria-live="polite"
        style={{ '--accent': selectedCategory?.color } as React.CSSProperties}
      >
        {selected && selectedCategory ? (
          <div
            className="inspector-inner"
            style={{ '--accent': selectedCategory.color } as React.CSSProperties}
          >
            <div className="inspector-heading">
              <span className="eyebrow">INSTRUMENT DETAILS</span>
              <button
                className="inspector-close"
                aria-label="Close instrument details"
                onClick={clearSelection}
              >
                Close <X size={14} />
              </button>
              <button
                className={`favorite-button ${favorites.includes(selected.id) ? 'is-favorite' : ''}`}
                aria-label={`${favorites.includes(selected.id) ? 'Unfavorite' : 'Favorite'} ${selected.name}`}
                aria-pressed={favorites.includes(selected.id)}
                onClick={() => toggleFavorite(selected.id)}
              >
                <Star size={17} />
              </button>
            </div>
            <div className="inspector-identity">
              <span className="instrument-emblem" aria-hidden="true">
                <InstrumentIcon site={selected} size={28} />
              </span>
              <div>
                <span className="category-label">
                  <span className="category-dot" style={{ background: selectedCategory.color }} />
                  {selectedCategory.name}
                </span>
                <h2>{selected.name}</h2>
              </div>
            </div>
            <p className="inspector-description">{selected.description}</p>
            {view === 'astrolabe' && (
              <button
                className="visit-button"
                aria-label="Recenter selected instrument"
                onClick={() =>
                  setVisit((current) => ({
                    kind: 'node',
                    id: selected.id,
                    key: (current?.key ?? 0) + 1,
                  }))
                }
              >
                Recenter <span>↗</span>
              </button>
            )}
            <LaunchLink site={selected} className="launch-button">
              {selected.url ? 'Launch instrument' : 'Preview demo'}
              {selected.url ? <ArrowUpRight size={18} /> : <ArrowRight size={18} />}
            </LaunchLink>
            <div className="launch-note">
              {selected.url ? (
                <>
                  <ExternalLink size={11} />
                  Opens in a new tab
                </>
              ) : (
                <>
                  <FlaskConical size={12} />
                  Demo instrument · no URL assigned
                </>
              )}
            </div>
            <div className="inspector-divider" />
            <div className="inspector-section">
              <span className="eyebrow">KEYWORDS</span>
              <div className="tags">
                {selected.tags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => {
                      setQuery(tag)
                      setCategory('all')
                      setCollection('all')
                      changeView('directory')
                    }}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
            <div className="inspector-section instrument-location">
              <span className="eyebrow">DESTINATION</span>
              {selected.url ? (
                <a
                  href={selected.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => rememberLaunch(selected)}
                >
                  {new URL(selected.url).hostname}
                  <ArrowUpRight size={13} />
                </a>
              ) : (
                <span>Awaiting a real-world connection</span>
              )}
            </div>
            <div className="inspector-tip">
              <Sparkles size={15} />
              <p>
                {selected.url
                  ? 'Try searching for what you want to do. Keywords connect you to the right instrument.'
                  : 'Make this universe yours. Add your own sites in Catalog studio.'}
              </p>
              {!selected.url && (
                <button onClick={() => setStudioOpen(true)}>
                  Connect your tools
                  <ArrowUpRight size={13} />
                </button>
              )}
            </div>
            <div className="inspector-index">
              <span>INSTRUMENT {String(catalog.sites.indexOf(selected) + 1).padStart(2, '0')}</span>
              <span>OF {String(catalog.sites.length).padStart(2, '0')}</span>
            </div>
          </div>
        ) : (
          <div className="inspector-empty">
            <AstrolabeMark size={64} />
            <h2>No instrument selected</h2>
            <p>Select an instrument to learn what it can do.</p>
            <button className="secondary-button" onClick={() => setStudioOpen(true)}>
              Add an instrument
            </button>
          </div>
        )}
      </aside>

      {studioOpen && (
        <CatalogStudio
          catalog={catalog}
          revision={catalogRevision}
          onSave={async (next, revision) => {
            const shared = await saveSharedCatalog(next, revision)
            sharedRequest.current++
            sharedRevision.current = shared.revision
            try {
              localStorage.removeItem(LOCAL_CATALOG_KEY)
            } catch {
              /* Session-only preview. */
            }
            localPreviewRef.current = false
            setLocalPreview(false)
            setDeployedCatalog(shared.catalog)
            setCatalogRevision(shared.revision)
            setCatalog(shared.catalog)
            clearSelection()
            resetFilters()
            return shared
          }}
          onClose={() => setStudioOpen(false)}
          onApply={(next) => {
            const persisted = writePreference(LOCAL_CATALOG_KEY, next)
            setCatalog(next)
            localPreviewRef.current = true
            setLocalPreview(true)
            setSelectedId(next.sites.find((site) => site.id === selectedId)?.id || null)
            resetFilters()
            if (!persisted)
              setToast(
                'Preview applied for this session. Browser storage is full or unavailable; export to keep your catalog.'
              )
            return persisted
          }}
          onReset={() => {
            try {
              localStorage.removeItem(LOCAL_CATALOG_KEY)
            } catch {
              /* Session-only preview. */
            }
            if (deployedCatalog) {
              setCatalog(deployedCatalog)
              clearSelection()
            }
            setLocalPreview(false)
            localPreviewRef.current = false
            setStudioOpen(false)
            resetFilters()
            setToast('Restored the deployed catalog.')
          }}
        />
      )}
      {demo && activeDemo && (
        <DemoPreview
          site={activeDemo}
          category={catalog.categories.find((entry) => entry.id === activeDemo.category)!}
          onClose={() => setDemo(null)}
          onEdit={() => {
            setDemo(null)
            setStudioOpen(true)
          }}
        />
      )}
      {mobileDetailsOpen && selected && selectedCategory && (
        <Modal
          title={selected.name}
          subtitle={`${selectedCategory.name} / Instrument details`}
          onClose={clearSelection}
          className="mobile-details-modal"
        >
          <div
            className="mobile-details-content"
            style={{ '--accent': selectedCategory.color } as React.CSSProperties}
          >
            <div className="mobile-details-heading">
              <span className="instrument-icon">
                <InstrumentIcon site={selected} size={25} />
              </span>
              <button
                className={`favorite-button ${favorites.includes(selected.id) ? 'is-favorite' : ''}`}
                aria-label={`${favorites.includes(selected.id) ? 'Unfavorite' : 'Favorite'} ${selected.name}`}
                aria-pressed={favorites.includes(selected.id)}
                onClick={() => toggleFavorite(selected.id)}
              >
                <Star size={19} />
              </button>
            </div>
            <p>{selected.description}</p>
            <div className="tags">
              {selected.tags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => {
                    setQuery(tag)
                    setCategory('all')
                    setCollection('all')
                    changeView('directory')
                    setMobileDetailsOpen(false)
                  }}
                >
                  {tag}
                </button>
              ))}
            </div>
            <LaunchLink site={selected} className="launch-button">
              {selected.url ? 'Launch instrument' : 'Preview demo'}
              <ArrowUpRight size={18} />
            </LaunchLink>
            <div className="launch-note">
              {selected.url ? 'Opens in a new tab' : 'Demo instrument · no URL assigned'}
            </div>
          </div>
        </Modal>
      )}
      {helpOpen && (
        <Modal
          title="Astrolabe camera help"
          subtitle="Move the view and select instruments."
          onClose={() => setHelpOpen(false)}
          className="help-modal"
        >
          <dl className="camera-help">
            <div>
              <dt>Orbit</dt>
              <dd>
                Left-drag around the point where you press. Rotate freely, including over the poles.
              </dd>
            </div>
            <div>
              <dt>Pan</dt>
              <dd>Right-drag, middle-drag, or Shift-drag.</dd>
            </div>
            <div>
              <dt>Zoom</dt>
              <dd>Scroll toward the pointer; use + / − to zoom at the current focus.</dd>
            </div>
            <div>
              <dt>Select</dt>
              <dd>
                Click an instrument or its name to focus and inspect it. Click a category name to
                frame its group. Double-click a surface to move closer.
              </dd>
            </div>
            <div>
              <dt>Reset</dt>
              <dd>Use Reset camera or Home to return to the overview.</dd>
            </div>
          </dl>
          <p className="help-note">
            <strong>Keyboard:</strong> Click empty space in the scene first. WASD flies; R / F (or E
            / Q) moves up / down; arrow keys aim; Shift boosts.
          </p>
          <p className="help-note">
            <strong>Touch:</strong> One finger orbits; two fingers pan and pinch to zoom. Tap an
            instrument’s name to select it.
          </p>
          <p className="help-note">
            <strong>Idle tour:</strong> After 45 seconds without input, the whole system slowly
            orbits in view. Any input returns to the initial overview.
          </p>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          <span>{toast}</span>
          <button onClick={() => setToast('')} aria-label="Dismiss notification">
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
