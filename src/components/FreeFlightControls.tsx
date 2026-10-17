import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Matrix4, PerspectiveCamera, Quaternion, Raycaster, Vector2, Vector3 } from 'three'
import type { RefObject } from 'react'
import { FlightController, wheelTravel } from '../lib/flight'
import { focusDistance } from '../lib/focus'
import type { FocusTarget } from '../lib/focus'
import { overviewPose } from '../lib/overview'
import type { Overview, ViewInsets } from '../lib/overview'

const IDLE_DELAY_MS = 45_000
const IDLE_ORBIT_SPEED = 0.025

function overviewInsets(element: HTMLElement): ViewInsets {
  const rect = element.getBoundingClientRect()
  const insets = {
    top: Math.max(40, -rect.top + 16),
    right: Math.max(70, rect.right - window.innerWidth + 16),
    bottom: Math.max(54, rect.bottom - window.innerHeight + 16),
    left: Math.max(70, -rect.left + 16),
  }
  for (const selector of [
    '.topbar',
    '.sidebar',
    '.view-toolbar',
    '.local-preview-banner',
    '.scene-controls',
    '.mobile-scene-directory',
    '.launch-dock',
  ]) {
    const overlay = document.querySelector(selector)?.getBoundingClientRect()
    if (
      !overlay ||
      !overlay.width ||
      !overlay.height ||
      overlay.bottom <= rect.top ||
      overlay.top >= rect.bottom ||
      overlay.right <= rect.left ||
      overlay.left >= rect.right
    )
      continue
    if (
      (selector === '.scene-controls' && overlay.top > rect.top + rect.height / 2) ||
      selector === '.mobile-scene-directory' ||
      selector === '.launch-dock'
    )
      insets.bottom = Math.max(insets.bottom, rect.bottom - overlay.top + 16)
    else insets.top = Math.max(insets.top, overlay.bottom - rect.top + 20)
  }
  return insets
}

type IdleOrbit = {
  startedAt: number
  position: Vector3
  orientation: Quaternion
  insets: ViewInsets
  focus: Vector3
}

type Props = {
  host: RefObject<HTMLDivElement | null>
  homeDistance: number
  radius: number
  resetKey: number
  zoomRequest: number
  reducedMotion: boolean
  visitTarget?: FocusTarget
  visitKey: number
  overview: Overview
  idleEnabled: boolean
  onIdleStart: () => void
  onEmptyClick: () => void
}

export default function FreeFlightControls({
  host,
  homeDistance,
  radius,
  resetKey,
  zoomRequest,
  reducedMotion,
  visitTarget,
  visitKey,
  overview,
  idleEnabled,
  onIdleStart,
  onEmptyClick,
}: Props) {
  const { camera, gl, invalidate, scene, size } = useThree()
  const flight = useMemo(() => new FlightController(radius), [radius])
  const keys = useRef(new Set<string>())
  const previousZoom = useRef(zoomRequest)
  const initialized = useRef(false)
  const gestureMode = useRef('idle')
  const keyVelocity = useRef(new Vector3())
  const forward = useMemo(() => new Vector3(), [])
  const idle = useRef<IdleOrbit | null>(null)
  const emptyClick = useRef(onEmptyClick)
  useEffect(() => {
    emptyClick.current = onEmptyClick
  }, [onEmptyClick])
  const travelScale = homeDistance / 22
  const homePose = useMemo(() => {
    const position = new Vector3(0, 0.3, homeDistance)
    const orientation = new Quaternion().setFromRotationMatrix(
      new Matrix4().lookAt(position, new Vector3(), new Vector3(0, 1, 0))
    )
    return { position, orientation }
  }, [homeDistance])

  const stopIdle = useCallback(() => {
    if (!idle.current) return
    const previous = idle.current
    idle.current = null
    keys.current.clear()
    keyVelocity.current.set(0, 0, 0)
    // Restore the exact orbit, including inverted poses and permitted travel outside
    // the translation sphere. reset() intentionally clamps and straightens a home view.
    flight.position.copy(previous.position)
    flight.orientation.copy(previous.orientation)
    flight.focus.copy(previous.focus)
    flight.stop()
    camera.position.copy(flight.position)
    camera.quaternion.copy(flight.orientation)
    camera.far = Math.max(240, radius * 4)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
    gl.domElement.dataset.cameraIdle = 'false'
    invalidate()
  }, [camera, flight, gl, invalidate, radius])

  useEffect(() => {
    if (!idleEnabled || reducedMotion) {
      stopIdle()
      return
    }
    let timer = 0
    const pointers = new Set<number>()
    const heldKeys = new Set<string>()
    const schedule = () => {
      window.clearTimeout(timer)
      if (document.hidden || !document.hasFocus() || pointers.size || heldKeys.size) return
      timer = window.setTimeout(() => {
        const element = host.current
        if (!element || document.hidden || !document.hasFocus() || pointers.size || heldKeys.size)
          return
        if (document.activeElement?.matches('input, textarea, select, [contenteditable="true"]'))
          return
        const rect = element.getBoundingClientRect()
        if (rect.bottom <= 0 || rect.top >= window.innerHeight) return
        flight.stop()
        keys.current.clear()
        keyVelocity.current.set(0, 0, 0)
        idle.current = {
          startedAt: performance.now(),
          position: flight.position.clone(),
          orientation: flight.orientation.clone(),
          focus: flight.focus.clone(),
          insets: overviewInsets(element),
        }
        onIdleStart()
        invalidate()
      }, IDLE_DELAY_MS)
    }
    const activity = (event: Event) => {
      if (event instanceof PointerEvent) {
        if (event.type === 'pointerdown') pointers.add(event.pointerId)
        if (event.type === 'pointerup' || event.type === 'pointercancel')
          pointers.delete(event.pointerId)
      }
      if (event instanceof KeyboardEvent) {
        if (event.type === 'keydown') heldKeys.add(event.code)
        else heldKeys.delete(event.code)
      }
      if ((event.type === 'blur' && event.target === window) || document.hidden) {
        pointers.clear()
        heldKeys.clear()
      }
      // Capture runs before camera picking or UI handlers, so the first new gesture
      // uses the restored camera rather than a stale point from the idle orbit.
      stopIdle()
      schedule()
    }
    const events = [
      'pointermove',
      'pointerdown',
      'pointerup',
      'pointercancel',
      'keydown',
      'keyup',
      'wheel',
      'click',
      'contextmenu',
      'scroll',
      'resize',
      'focus',
      'blur',
      'focusin',
      'focusout',
    ]
    for (const event of events)
      window.addEventListener(event, activity, { capture: true, passive: true })
    document.addEventListener('visibilitychange', activity)
    schedule()
    return () => {
      window.clearTimeout(timer)
      for (const event of events) window.removeEventListener(event, activity, true)
      document.removeEventListener('visibilitychange', activity)
      stopIdle()
    }
  }, [idleEnabled, reducedMotion, flight, host, invalidate, onIdleStart, stopIdle])

  const reset = () => {
    keys.current.clear()
    keyVelocity.current.set(0, 0, 0)
    flight.transitionTo(
      homePose.position,
      homePose.orientation,
      new Vector3(),
      reducedMotion ? 0 : 0.65
    )
    invalidate()
  }
  useEffect(() => {
    camera.near = 0.035
    camera.far = Math.max(240, radius * 4)
    camera.updateProjectionMatrix()
    if (!initialized.current) {
      flight.reset(homePose.position, homePose.orientation)
      camera.position.copy(flight.position)
      camera.quaternion.copy(flight.orientation)
      initialized.current = true
    } else reset()
    invalidate()
  }, [camera, flight, homePose, resetKey, radius, invalidate])

  useEffect(() => {
    if (!visitTarget || !visitKey) return
    const target = new Vector3(...visitTarget.position)
    const aspect = camera instanceof PerspectiveCamera ? camera.aspect : 1.5
    const fov = camera instanceof PerspectiveCamera ? camera.fov : 42
    const distance = focusDistance(visitTarget.radius, aspect, fov, visitTarget.group)
    // A modest oblique approach reveals depth while retaining a predictable upright landing.
    const bearing = Math.atan2(target.x, Math.abs(target.z) + 20) * 0.45
    const approach = new Vector3(Math.sin(bearing), 0.12, Math.cos(bearing)).normalize()
    const position = target.clone().addScaledVector(approach, distance)
    const orientation = new Quaternion().setFromRotationMatrix(
      new Matrix4().lookAt(position, target, new Vector3(0, 1, 0))
    )
    keys.current.clear()
    keyVelocity.current.set(0, 0, 0)
    const duration = Math.min(0.65, 0.35 + flight.position.distanceTo(position) * 0.006)
    flight.transitionTo(position, orientation, target, reducedMotion ? 0 : duration)
    invalidate()
  }, [visitKey, visitTarget, camera, flight, invalidate, reducedMotion, size.width, size.height])

  useEffect(() => {
    const difference = zoomRequest - previousZoom.current
    previousZoom.current = zoomRequest
    if (!difference) return
    flight.dolly(flight.focus.clone(), difference * 0.2, reducedMotion)
    invalidate()
  }, [flight, zoomRequest, reducedMotion, invalidate])

  useEffect(() => {
    const element = host.current
    const stage = element?.closest('.stage')
    if (!element || !stage) return
    const raycaster = new Raycaster()
    type Pointer = { x: number; y: number; startX: number; startY: number; pan: boolean }
    const pointers = new Map<number, Pointer>()
    let pivot = flight.focus.clone(),
      depth = homeDistance
    let dragging = false,
      suppressClick = false
    let wheelAnchor: Vector3 | null = null,
      wheelTime = -Infinity,
      wheelSign = 0
    let wheelX = 0,
      wheelY = 0
    const inputKeys = new Set([
      'KeyW',
      'KeyA',
      'KeyS',
      'KeyD',
      'KeyR',
      'KeyF',
      'KeyQ',
      'KeyE',
      'ShiftLeft',
      'ShiftRight',
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
    ])
    const fov = () => (camera instanceof PerspectiveCamera ? camera.fov : 42)
    const interactive = (target: EventTarget | null) =>
      target instanceof Element &&
      target.closest(
        'button, a, input, select, textarea, [contenteditable="true"], .mobile-scene-directory'
      )
    const setMode = (mode: string) => {
      gestureMode.current = mode
      element.dataset.navigationMode = mode
    }
    const pick = (x: number, y: number) => {
      const rect = gl.domElement.getBoundingClientRect()
      raycaster.setFromCamera(
        new Vector2(
          ((x - rect.left) / rect.width) * 2 - 1,
          -((y - rect.top) / rect.height) * 2 + 1
        ),
        camera
      )
      const hit = raycaster
        .intersectObjects(scene.children, true)
        .find((entry) => entry.object.userData.navigationSurface && entry.distance > 0.1)
      const direction = camera.getWorldDirection(new Vector3())
      const focusDepth = Math.max(0.8, flight.focus.clone().sub(flight.position).dot(direction))
      const planePoint = raycaster.ray.at(
        focusDepth / Math.max(0.1, direction.dot(raycaster.ray.direction)),
        new Vector3()
      )
      return {
        hit,
        planePoint,
        depth: hit
          ? Math.max(0.8, hit.point.clone().sub(flight.position).dot(direction))
          : focusDepth,
      }
    }
    const beginOrbitAt = (x: number, y: number) => {
      const picked = pick(x, y)
      // Pick once at the gesture origin. Empty space has no surface depth, so
      // intersect the cursor ray with the current focus plane instead of
      // reusing the old focus's screen position (often the sun).
      pivot = picked.hit?.point.clone() ?? picked.planePoint
      depth = picked.depth
      gl.domElement.dataset.orbitPivot = JSON.stringify(pivot.toArray())
      gl.domElement.dataset.orbitSurface = picked.hit ? 'surface' : 'cursor'
    }
    const pair = () => {
      const [a, b] = [...pointers.values()]
      return b
        ? {
            x: (a.x + b.x) / 2,
            y: (a.y + b.y) / 2,
            distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
          }
        : null
    }
    const wheel = (event: Event) => {
      const e = event as WheelEvent
      if (
        e.target instanceof Element &&
        e.target.closest('.mobile-scene-directory, .scene-controls')
      )
        return
      if (!e.deltaY || pointers.size) return
      e.preventDefault()
      e.stopImmediatePropagation()
      const sign = Math.sign(e.deltaY)
      if (
        !wheelAnchor ||
        e.timeStamp - wheelTime > 180 ||
        sign !== wheelSign ||
        Math.hypot(e.clientX - wheelX, e.clientY - wheelY) > 6
      ) {
        // Start a new zoom at the visible pose, never behind a queue of old wheel input.
        flight.stop()
        const picked = pick(e.clientX, e.clientY)
        wheelAnchor = picked.hit?.point.clone() ?? picked.planePoint
        wheelX = e.clientX
        wheelY = e.clientY
      }
      wheelTime = e.timeStamp
      wheelSign = sign
      flight.dolly(
        wheelAnchor,
        wheelTravel(e.deltaY, e.deltaMode, gl.domElement.clientHeight),
        reducedMotion
      )
      invalidate()
    }
    const down = (e: PointerEvent) => {
      if (interactive(e.target) || ![0, 1, 2].includes(e.button) || pointers.size >= 2) return
      e.preventDefault()
      element.focus({ preventScroll: true })
      flight.stop()
      wheelAnchor = null
      if (!pointers.size) {
        dragging = false
        suppressClick = false
        beginOrbitAt(e.clientX, e.clientY)
      }
      pointers.set(e.pointerId, {
        x: e.clientX,
        y: e.clientY,
        startX: e.clientX,
        startY: e.clientY,
        pan: e.button === 1 || e.button === 2 || e.shiftKey,
      })
      if (pointers.size === 2) {
        const center = pair()!
        const picked = pick(center.x, center.y)
        pivot = picked.hit?.point.clone() ?? picked.planePoint
        depth = picked.depth
        dragging = true
        suppressClick = true
        setMode('pan')
      }
      invalidate()
    }
    const move = (e: PointerEvent) => {
      const previous = pointers.get(e.pointerId)
      if (!previous) return
      const before = pair()
      if (!dragging && Math.hypot(e.clientX - previous.startX, e.clientY - previous.startY) < 4)
        return
      if (!dragging) {
        dragging = true
        suppressClick = true
        element.setPointerCapture(e.pointerId)
      }
      const dx = e.clientX - previous.x,
        dy = e.clientY - previous.y
      pointers.set(e.pointerId, { ...previous, x: e.clientX, y: e.clientY })
      const after = pair()
      const height = gl.domElement.clientHeight
      if (before && after) {
        setMode('pan')
        const start = flight.position.clone()
        flight.pan(after.x - before.x, after.y - before.y, depth, fov(), height)
        pivot.add(flight.position.clone().sub(start))
        flight.dolly(pivot, Math.log(after.distance / before.distance), true)
        depth = Math.max(0.8, (depth * before.distance) / after.distance)
      } else if (previous.pan || e.shiftKey) {
        setMode('pan')
        flight.pan(dx, dy, depth, fov(), height)
      } else {
        setMode('orbit')
        flight.orbit(pivot, (-dx * Math.PI) / height, (-dy * Math.PI) / height)
      }
      invalidate()
    }
    const up = (e: PointerEvent) => {
      const pointer = pointers.get(e.pointerId)
      if (!pointer) return
      const emptyTap =
        e.type === 'pointerup' &&
        e.pointerType === 'touch' &&
        pointers.size === 1 &&
        !dragging &&
        !suppressClick &&
        !pointer.pan &&
        Math.hypot(e.clientX - pointer.startX, e.clientY - pointer.startY) < 4 &&
        !pick(e.clientX, e.clientY).hit
      pointers.delete(e.pointerId)
      if (element.hasPointerCapture(e.pointerId)) element.releasePointerCapture(e.pointerId)
      if (pointers.size) {
        // Rebase the remaining finger: it must not inherit a two-finger delta.
        for (const [id, p] of pointers) pointers.set(id, { ...p, startX: p.x, startY: p.y })
        const remaining = [...pointers.values()][0]
        beginOrbitAt(remaining.x, remaining.y)
        dragging = false
      } else {
        dragging = false
        setMode('idle')
      }
      if (emptyTap) {
        // Touch navigation prevents compatibility mouse events. Dismiss on the
        // completed tap, and consume a click if the browser still synthesizes one.
        suppressClick = true
        emptyClick.current()
      }
      invalidate()
    }
    const click = (e: MouseEvent) => {
      if (suppressClick && !interactive(e.target)) {
        e.preventDefault()
        e.stopImmediatePropagation()
        suppressClick = false
        return
      }
      if (e.button !== 0 || e.shiftKey || interactive(e.target)) return
      if (!pick(e.clientX, e.clientY).hit) emptyClick.current()
    }
    const doubleClick = (e: MouseEvent) => {
      if (interactive(e.target) || suppressClick) return
      const hit = pick(e.clientX, e.clientY).hit
      if (!hit) return
      e.preventDefault()
      const direction = flight.position.clone().sub(hit.point).normalize()
      const position = hit.point.clone().addScaledVector(direction, 4.5)
      const orientation = new Quaternion().setFromRotationMatrix(
        new Matrix4().lookAt(position, hit.point, new Vector3(0, 1, 0))
      )
      flight.transitionTo(position, orientation, hit.point, reducedMotion ? 0 : 0.55)
      invalidate()
    }
    const keydown = (e: KeyboardEvent) => {
      if (interactive(e.target) || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.code === 'Home') {
        e.preventDefault()
        reset()
        return
      }
      if (e.code === 'Escape') {
        clear()
        return
      }
      if (!inputKeys.has(e.code)) return
      e.preventDefault()
      if (!keys.current.has(e.code)) flight.stop()
      keys.current.add(e.code)
      invalidate()
    }
    const keyup = (e: KeyboardEvent) => {
      keys.current.delete(e.code)
      if (![...keys.current].some((key) => key.startsWith('Key'))) keyVelocity.current.set(0, 0, 0)
    }
    const clear = () => {
      keys.current.clear()
      keyVelocity.current.set(0, 0, 0)
      for (const id of pointers.keys())
        if (element.hasPointerCapture(id)) element.releasePointerCapture(id)
      pointers.clear()
      dragging = false
      suppressClick = false
      wheelAnchor = null
      flight.stop()
      setMode('idle')
      invalidate()
    }
    const blur = (e: FocusEvent) => {
      if (!element.contains(e.relatedTarget as Node | null)) clear()
    }
    const visibility = () => {
      if (document.hidden) clear()
    }
    const contextmenu = (e: Event) => {
      if (!interactive(e.target)) e.preventDefault()
    }
    stage.addEventListener('wheel', wheel, { passive: false, capture: true })
    element.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    element.addEventListener('pointercancel', up)
    element.addEventListener('lostpointercapture', up)
    element.addEventListener('click', click, true)
    element.addEventListener('dblclick', doubleClick)
    element.addEventListener('contextmenu', contextmenu)
    element.addEventListener('keydown', keydown)
    element.addEventListener('focusout', blur)
    window.addEventListener('keyup', keyup)
    window.addEventListener('blur', clear)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      clear()
      stage.removeEventListener('wheel', wheel, true)
      element.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      element.removeEventListener('pointercancel', up)
      element.removeEventListener('lostpointercapture', up)
      element.removeEventListener('click', click, true)
      element.removeEventListener('dblclick', doubleClick)
      element.removeEventListener('contextmenu', contextmenu)
      element.removeEventListener('keydown', keydown)
      element.removeEventListener('focusout', blur)
      window.removeEventListener('keyup', keyup)
      window.removeEventListener('blur', clear)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [camera, flight, host, gl, scene, homeDistance, reducedMotion, invalidate])

  useFrame((_, delta) => {
    const tour = idle.current
    if (tour) {
      const elapsed = Math.max(0, (performance.now() - tour.startedAt) / 1000)
      const angle = Math.max(0, elapsed - 1.2) * IDLE_ORBIT_SPEED
      const pose = overviewPose(
        overview,
        size.width,
        size.height,
        camera instanceof PerspectiveCamera ? camera.fov : 42,
        angle,
        tour.insets
      )
      const t = Math.min(1, elapsed / 1.2)
      const eased = t * t * (3 - 2 * t)
      flight.position.lerpVectors(tour.position, pose.position, eased)
      flight.orientation.slerpQuaternions(tour.orientation, pose.orientation, eased)
      flight.focus.copy(pose.focus)
      flight.destination.copy(flight.position)
      flight.aim.copy(flight.orientation)
      const far = pose.distance + overview.radius * 2 + 100
      if (camera.far < far) {
        camera.far = far
        camera.updateProjectionMatrix()
      }
    }
    const pressed = (code: string) => (keys.current.has(code) ? 1 : 0)
    const dt = Math.min(Math.max(delta, 0), 0.1)
    const direction = new Vector3(
      pressed('KeyD') - pressed('KeyA'),
      pressed('KeyR') + pressed('KeyE') - pressed('KeyF') - pressed('KeyQ'),
      pressed('KeyW') - pressed('KeyS')
    )
    if (direction.lengthSq() && gestureMode.current === 'idle') {
      const speed = (pressed('ShiftLeft') || pressed('ShiftRight') ? 15 : 5) * travelScale
      const desired = direction.normalize().multiplyScalar(speed)
      keyVelocity.current.lerp(desired, reducedMotion ? 1 : 1 - Math.exp(-18 * dt))
      flight.move(
        keyVelocity.current.x * dt,
        keyVelocity.current.y * dt,
        keyVelocity.current.z * dt
      )
    } else keyVelocity.current.set(0, 0, 0)
    const yaw = pressed('ArrowLeft') - pressed('ArrowRight'),
      pitch = pressed('ArrowUp') - pressed('ArrowDown')
    if ((yaw || pitch) && gestureMode.current === 'idle')
      flight.turn(yaw * dt * 1.3, pitch * dt * 1.3)
    const moving = !!idle.current || flight.step(delta, reducedMotion)
    camera.position.copy(flight.position)
    camera.quaternion.copy(flight.orientation)
    camera.updateMatrixWorld()
    camera.getWorldDirection(forward)
    gl.domElement.dataset.cameraPosition = JSON.stringify(flight.position.toArray())
    gl.domElement.dataset.cameraForward = JSON.stringify(forward.toArray())
    gl.domElement.dataset.cameraQuaternion = JSON.stringify(flight.orientation.toArray())
    gl.domElement.dataset.cameraFocus = JSON.stringify(flight.focus.toArray())
    gl.domElement.dataset.cameraMoving = String(moving)
    gl.domElement.dataset.cameraIdle = String(!!idle.current)
    gl.domElement.dataset.navigationRadius = String(radius)
    if (moving || keys.current.size) invalidate()
  }, -1)
  return null
}
