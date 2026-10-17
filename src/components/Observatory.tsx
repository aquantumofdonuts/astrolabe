import { Component, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { Catalog, Instrument } from '../lib/catalog'
import { ArrowUpRight } from 'lucide-react'
import LaunchLink from './LaunchLink'
import { buildConstellationLayout, HOME_DISTANCE } from '../lib/orbits'
import type { Constellation } from '../lib/orbits'
import type { Point3 } from '../lib/orbits'
import FreeFlightControls from './FreeFlightControls'
import { selectionTarget } from '../lib/focus'
import type { FocusRequest } from '../lib/focus'
import CelestialDestination from './CelestialBodies'
import InstrumentEmphasis from './InstrumentEmphasis'
import SystemLife, { DestinationGlow, StarField } from './SystemLife'
import { destinationRadius, projectDestination } from '../lib/hud'
import { DeepSpace, ObservatoryLighting, StellarEngine } from './OrbitalArchitecture'
import { systemOverview } from '../lib/overview'
import ConstellationField from './ConstellationField'
import { SurfaceMaterials } from './SurfaceMaterials'

type Props = {
  catalog: Catalog
  visibleIds: string[]
  selectedId: string | null
  category: string
  paused: boolean
  reducedMotion: boolean
  economical: boolean
  resetKey: number
  zoomRequest: number
  visit: FocusRequest | null
  onCategory: (id: string) => void
  onSelect: (id: string, keyboard?: boolean) => void
  onDeselect: () => void
  launchingId: string | null
  onLaunch: (site: Instrument) => void
  onRemember: (site: Instrument) => void
  onPreview: (id: string | null) => void
  onUnavailable: () => void
  onReady: () => void
  idleEnabled: boolean
  onIdleStart: () => void
}

class SceneBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: Error, _info: ErrorInfo) {
    console.error('Astrolabe scene unavailable:', error)
    this.props.onError()
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

function Scene({
  props,
  stations,
  labels,
  host,
  hovered,
}: {
  props: Props
  stations: Constellation[]
  labels: React.RefObject<Map<string, HTMLDivElement>>
  host: React.RefObject<HTMLDivElement | null>
  hovered: React.RefObject<string | null>
}) {
  const { camera, size, invalidate } = useThree()
  // Clear hover left behind by a camera flight, and refresh shaders even while paused.
  useEffect(() => {
    hovered.current = null
    invalidate()
  }, [props.category, props.selectedId, props.paused, props.reducedMotion, hovered, invalidate])
  const aspect = useRef(size.width / size.height).current
  // Leave the bottom-right navigation strip clear even on a narrow desktop overview.
  const homeDistance = HOME_DISTANCE / Math.min(1, aspect / 1.7)
  const point = useMemo(() => new THREE.Vector3(), [])
  const images = useMemo(
    () => new Map(props.catalog.sites.map((site) => [site.id, site.image])),
    [props.catalog.sites]
  )
  const selectedCategory = props.catalog.sites.find(
    (site) => site.id === props.selectedId
  )?.category
  const brightness = useMemo(
    () => new Map(props.catalog.sites.map((site) => [site.id, { value: 1 }])),
    [props.catalog.sites]
  )
  const target = useMemo(
    () => selectionTarget(props.catalog, stations, props.visit),
    [props.catalog, stations, props.visit]
  )
  const overview = useMemo(() => systemOverview(props.catalog, stations), [props.catalog, stations])
  const anchors = useMemo(
    () => [
      { id: '__core', position: [0, -4.7, -2] as Point3 },
      ...stations.flatMap((station, family) => [
        {
          id: '__category:' + station.categoryId,
          position: station.label,
        },
        ...station.instruments.map((instrument, variant) => ({
          id: instrument.id,
          position: instrument.position,
          radius:
            destinationRadius(family, variant, !!images.get(instrument.id)) * instrument.scale,
        })),
      ]),
    ],
    [stations, images]
  )
  useFrame((_, dt) => {
    const hasSelection =
      !!props.selectedId ||
      props.category !== 'all' ||
      props.visibleIds.length !== props.catalog.sites.length
    for (const site of props.catalog.sites) {
      const uniform = brightness.get(site.id)!
      const selected = props.selectedId
        ? props.selectedId === site.id
        : props.category === 'all'
          ? props.visibleIds.includes(site.id)
          : props.category === site.category
      const target = hasSelection && !selected ? 0.5 : 1
      uniform.value = props.reducedMotion
        ? target
        : THREE.MathUtils.damp(uniform.value, target, 8, Math.min(dt, 0.1))
      if (Math.abs(uniform.value - target) < 0.001) uniform.value = target
      else invalidate() // Selection transitions continue when ambient motion is paused.
    }
    for (const anchor of anchors) {
      const label = labels.current.get(anchor.id)
      if (!label) continue
      point.set(...anchor.position).project(camera)
      let x = ((point.x + 1) * size.width) / 2,
        y = ((1 - point.y) * size.height) / 2
      let visible =
        point.z > -1 &&
        point.z < 1 &&
        x > 20 &&
        x < size.width - 20 &&
        y > 30 &&
        y < size.height - 40
      if ('radius' in anchor) {
        const hud = projectDestination(
          camera,
          anchor.position,
          anchor.radius,
          size.width,
          size.height
        )
        x = hud.x
        y = hud.y
        visible = hud.visible
        label.style.setProperty('--target-x', `${hud.bodyX - x}px`)
        label.style.setProperty('--target-y', `${hud.bodyY - y}px`)
        label.style.setProperty('--target-size', `${hud.pixels * 2 + 12}px`)
        label.dataset.targeted = String(
          props.selectedId === anchor.id ||
            (!props.selectedId && props.category === 'all' && hovered.current === anchor.id)
        )
      }
      if (visible)
        label.style.transform = `translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) translate(-50%,-50%)`
      const dim = anchor.id.startsWith('__category:')
        ? props.category !== 'all' && props.category !== anchor.id.slice(11)
        : anchor.id !== '__core' && !props.visibleIds.includes(anchor.id)
      const emphasis = brightness.get(anchor.id)?.value ?? 1
      label.style.opacity = visible ? (dim ? '0.18' : String(0.3 + emphasis * 0.7)) : '0'
      label.style.visibility = visible ? 'visible' : 'hidden'
    }
  })
  return (
    <>
      <color attach="background" args={['#060d14']} />
      <fog attach="fog" args={['#060d14', 75, 230]} />
      <ObservatoryLighting
        economical={props.economical}
        onReady={props.onReady}
        onUnavailable={props.onUnavailable}
      />
      <StarField economical={props.economical} paused={props.paused || props.reducedMotion} />
      <DeepSpace radius={Math.max(240, homeDistance * 4)} />
      <StellarEngine paused={props.paused || props.reducedMotion} />
      <SystemLife
        paused={props.paused || props.reducedMotion}
        economical={props.economical}
        category={props.selectedId ? 'all' : props.category}
        subdued={!!props.selectedId || props.visibleIds.length !== props.catalog.sites.length}
      />
      {stations.map((station, family) => {
        const category = props.catalog.categories.find((cat) => cat.id === station.categoryId)!
        return (
          <group key={category.id}>
            <ConstellationField
              station={station}
              catalog={props.catalog}
              family={family}
              color={category.color}
              paused={props.paused || props.reducedMotion}
              dimmed={
                props.selectedId
                  ? selectedCategory !== category.id
                  : (props.category !== 'all' && props.category !== category.id) ||
                    (props.category === 'all' &&
                      props.visibleIds.length !== props.catalog.sites.length)
              }
              active={selectedCategory === category.id || props.category === category.id}
            />
            {station.instruments.map((instrument, variant) => (
              <InstrumentEmphasis
                key={`${instrument.id}:${family}:${variant}:${!!images.get(instrument.id)}`}
                brightness={brightness.get(instrument.id)!}
              >
                <group position={instrument.position}>
                  <DestinationGlow
                    color={category.color}
                    radius={
                      destinationRadius(family, variant, !!images.get(instrument.id)) *
                      instrument.scale
                    }
                    active={
                      props.selectedId
                        ? props.selectedId === instrument.id
                        : props.category === category.id
                    }
                    paused={props.paused || props.reducedMotion}
                    seed={family * 2.7 + variant * 1.9}
                  />
                </group>
                <CelestialDestination
                  key={instrument.id}
                  onSelect={() => props.onSelect(instrument.id)}
                  id={instrument.id}
                  image={images.get(instrument.id)}
                  position={instrument.position}
                  rotation={instrument.rotation}
                  scale={instrument.scale}
                  family={family}
                  variant={variant}
                  color={category.color}
                  hovered={hovered}
                  paused={props.paused || props.reducedMotion}
                />
              </InstrumentEmphasis>
            ))}
          </group>
        )
      })}
      <FreeFlightControls
        host={host}
        homeDistance={homeDistance}
        radius={Math.max(55, homeDistance * 1.8)}
        visitTarget={target}
        visitKey={props.visit?.key ?? 0}
        resetKey={props.resetKey}
        zoomRequest={props.zoomRequest}
        reducedMotion={props.reducedMotion}
        overview={overview}
        idleEnabled={props.idleEnabled}
        onIdleStart={props.onIdleStart}
        onEmptyClick={props.onDeselect}
      />
    </>
  )
}

export default function Observatory(props: Props) {
  const labels = useRef(new Map<string, HTMLDivElement>())
  const host = useRef<HTMLDivElement>(null)
  const hovered = useRef<string | null>(null)
  const stations = useMemo(() => buildConstellationLayout(props.catalog), [props.catalog])
  const [supported] = useState(() => {
    try {
      const context = document.createElement('canvas').getContext('webgl2')
      if (!context) return false
      context.getExtension('WEBGL_lose_context')?.loseContext()
      return true
    } catch {
      return false
    }
  })
  useEffect(() => {
    if (!supported) props.onUnavailable()
  }, [supported, props.onUnavailable])
  if (!supported) return null
  const ref = (id: string) => (element: HTMLDivElement | null) => {
    if (element) labels.current.set(id, element)
    else labels.current.delete(id)
  }
  return (
    <SceneBoundary onError={props.onUnavailable}>
      <>
        <div
          className="observatory-renderer"
          ref={host}
          role="region"
          aria-label="Free-flight camera"
          tabIndex={0}
        >
          <Canvas
            shadows={!props.economical}
            frameloop={props.paused || props.reducedMotion ? 'demand' : 'always'}
            camera={{ position: [0, 0.3, HOME_DISTANCE], fov: 42 }}
            dpr={props.economical ? 1 : [1, 1.5]}
            gl={{
              antialias: true,
              alpha: false,
              powerPreference: 'high-performance',
              toneMapping: THREE.ACESFilmicToneMapping,
            }}
            fallback={<span>Open Directory to access every instrument.</span>}
            onCreated={({ gl }) =>
              gl.domElement.setAttribute(
                'aria-label',
                'Orbital observatory. Drag to orbit. Right-drag or middle-drag to pan. Scroll to zoom toward the pointer. Select an instrument or category to focus. Click empty space or press Escape to close instrument details. Double-click a surface for a closer view. WASD to fly; Home to reset. All tools are also available in Directory.'
              )
            }
          >
            <Suspense fallback={null}>
              <SurfaceMaterials>
                <Scene
                  props={props}
                  stations={stations}
                  labels={labels}
                  host={host}
                  hovered={hovered}
                />
              </SurfaceMaterials>
            </Suspense>
          </Canvas>
          <div
            className="orbital-labels"
            data-selection-active={!!props.selectedId || props.category !== 'all'}
          >
            <div className="projected-label core-projected-label" ref={ref('__core')}>
              <div className="core-label">
                <span>ASTROLABE</span>
                <small>PRIMARY STAR</small>
              </div>
            </div>
            {stations.map((station) => {
              const cat = props.catalog.categories.find((cat) => cat.id === station.categoryId)!
              return (
                <div
                  key={cat.id}
                  className="projected-label system-projected-label"
                  data-constellation={cat.id}
                  ref={ref('__category:' + cat.id)}
                  style={{ '--node-color': cat.color } as React.CSSProperties}
                >
                  <button
                    className="system-label"
                    aria-pressed={!props.selectedId && props.category === cat.id}
                    aria-label={`Focus ${cat.name} constellation`}
                    onClick={() => props.onCategory(cat.id)}
                  >
                    <span>
                      {cat.name}
                      <small>{station.instruments.length} instruments</small>
                    </span>
                  </button>
                </div>
              )
            })}
            {props.catalog.sites.map((site) => {
              const cat = props.catalog.categories.find((cat) => cat.id === site.category)!
              const dim = !props.visibleIds.includes(site.id),
                active = props.selectedId === site.id
              return (
                <div
                  key={site.id}
                  className="projected-label"
                  data-category-active={!props.selectedId && props.category === site.category}
                  data-selection-active={
                    active || (!props.selectedId && props.category === site.category)
                  }
                  ref={ref(site.id)}
                  style={
                    {
                      pointerEvents: dim ? 'none' : 'auto',
                      '--node-color': cat.color,
                    } as React.CSSProperties
                  }
                  onPointerEnter={() => {
                    hovered.current = site.id
                    props.onPreview(site.id)
                  }}
                  onPointerLeave={(event) => {
                    if (event.currentTarget.contains(document.activeElement)) return
                    hovered.current = null
                    props.onPreview(null)
                  }}
                  onFocus={() => {
                    hovered.current = site.id
                    props.onPreview(site.id)
                  }}
                  onBlur={(event) => {
                    if (event.currentTarget.contains(event.relatedTarget as Node)) return
                    if (event.currentTarget.matches(':hover')) return
                    hovered.current = null
                    props.onPreview(null)
                  }}
                >
                  <button
                    className={`orbital-node ${active ? 'is-selected' : ''}`}
                    style={{ '--node-color': cat.color } as React.CSSProperties}
                    onClick={(event) => props.onSelect(site.id, event.detail === 0)}
                    aria-label={`Select ${site.name}`}
                    aria-pressed={active}
                    aria-describedby={`about-${site.id}`}
                    tabIndex={dim ? -1 : 0}
                  >
                    <span className="node-name">{site.name}</span>
                  </button>
                  <LaunchLink
                    site={site}
                    className="node-launch"
                    onRemember={props.onRemember}
                    onLaunch={props.onLaunch}
                    launching={props.launchingId === site.id}
                    title={site.url ? `Launch ${site.name}` : `Preview ${site.name}`}
                    tabIndex={dim ? -1 : 0}
                    descriptionId={`about-${site.id}`}
                  >
                    <ArrowUpRight size={14} className="launch-arrow" aria-hidden="true" />
                  </LaunchLink>
                  <span className="sr-only" id={`about-${site.id}`}>
                    {site.description}
                  </span>
                  <span className="hud-reticle" aria-hidden="true" />
                  <span className="hud-detail" aria-hidden="true">
                    {cat.name}
                    {active ? ' / Selected' : ''}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
        <nav className="mobile-scene-directory" aria-label="Visible scene instruments">
          {props.catalog.sites
            .filter((site) => props.visibleIds.includes(site.id))
            .map((site) => (
              <div className="mobile-tool" key={site.id}>
                <button
                  onClick={(event) => props.onSelect(site.id, event.detail === 0)}
                  aria-label={`Inspect ${site.name}`}
                >
                  {site.name}
                </button>
                <LaunchLink
                  site={site}
                  className="mobile-tool-launch"
                  onRemember={props.onRemember}
                  onLaunch={props.onLaunch}
                  launching={props.launchingId === site.id}
                >
                  <ArrowUpRight size={15} className="launch-arrow" aria-hidden="true" />
                </LaunchLink>
              </div>
            ))}
        </nav>
      </>
    </SceneBoundary>
  )
}
