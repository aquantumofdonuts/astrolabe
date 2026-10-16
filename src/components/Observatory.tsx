import { Component, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { Catalog } from '../lib/catalog'
import { buildConstellationLayout, HOME_DISTANCE } from '../lib/orbits'
import type { Constellation } from '../lib/orbits'
import type { Point3 } from '../lib/orbits'
import FreeFlightControls from './FreeFlightControls'
import { selectionTarget } from '../lib/focus'
import type { FocusRequest } from '../lib/focus'
import CelestialDestination from './CelestialBodies'
import SystemLife, { DestinationGlow, StarField } from './SystemLife'
import { destinationRadius, projectDestination } from '../lib/hud'
import { DeepSpace, ObservatoryLighting, StellarEngine } from './OrbitalArchitecture'

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
  onSelect: (id: string) => void
  onUnavailable: () => void
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
  const colors = useMemo(
    () =>
      stations.map(
        (station) => props.catalog.categories.find((cat) => cat.id === station.categoryId)!.color
      ),
    [stations, props.catalog.categories]
  )
  const images = useMemo(
    () => new Map(props.catalog.sites.map((site) => [site.id, site.image])),
    [props.catalog.sites]
  )
  const target = useMemo(
    () => selectionTarget(props.catalog, stations, props.visit),
    [props.catalog, stations, props.visit]
  )
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
  useFrame(() => {
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
      label.style.opacity = visible ? (dim ? '0.18' : '1') : '0'
      label.style.visibility = visible ? 'visible' : 'hidden'
    }
  })
  return (
    <>
      <color attach="background" args={['#060d14']} />
      <fog attach="fog" args={['#060d14', 75, 230]} />
      <ObservatoryLighting economical={props.economical} />
      <StarField economical={props.economical} paused={props.paused || props.reducedMotion} />
      <DeepSpace radius={Math.max(240, homeDistance * 4)} />
      <StellarEngine paused={props.paused || props.reducedMotion} />
      <SystemLife
        stations={stations}
        colors={colors}
        paused={props.paused || props.reducedMotion}
        economical={props.economical}
        category={props.selectedId ? 'all' : props.category}
      />
      {stations.map((station, family) => {
        const category = props.catalog.categories.find((cat) => cat.id === station.categoryId)!
        return (
          <group key={category.id}>
            {station.instruments.map((instrument, variant) => (
              <group key={instrument.id}>
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
              </group>
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
                'Orbital observatory. Drag to orbit. Right-drag or middle-drag to pan. Scroll to zoom toward the pointer. Select an instrument or category to focus. Double-click a surface for a closer view. WASD to fly; Home to reset. All tools are also available in Directory.'
              )
            }
          >
            <Suspense fallback={null}>
              <Scene
                props={props}
                stations={stations}
                labels={labels}
                host={host}
                hovered={hovered}
              />
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
                  }}
                  onPointerLeave={() => {
                    hovered.current = null
                  }}
                  onFocus={() => {
                    hovered.current = site.id
                  }}
                  onBlur={() => {
                    hovered.current = null
                  }}
                >
                  <button
                    className={`orbital-node ${active ? 'is-selected' : ''}`}
                    style={{ '--node-color': cat.color } as React.CSSProperties}
                    onClick={() => props.onSelect(site.id)}
                    aria-label={`Select ${site.name}`}
                    aria-pressed={active}
                    tabIndex={dim ? -1 : 0}
                  >
                    <span className="node-name">{site.name}</span>
                  </button>
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
              <button
                key={site.id}
                onClick={() => props.onSelect(site.id)}
                aria-label={`Inspect ${site.name}`}
              >
                {site.name}
                <span aria-hidden="true">↗</span>
              </button>
            ))}
        </nav>
      </>
    </SceneBoundary>
  )
}
