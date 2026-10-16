import { Euler, MathUtils, Quaternion, Vector3 } from 'three'

const UP = new Vector3(0, 1, 0)
const MAX_PITCH = Math.PI / 2 - 0.06
const MIN_DISTANCE = 0.8

/** Normalize wheel units before applying distance-proportional zoom. */
export function wheelTravel(deltaY: number, deltaMode: number, height: number) {
  const pixels = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? height : 1)
  return -MathUtils.clamp(pixels, -240, 240) * 0.002
}

export function panScale(depth: number, verticalFov: number, viewportHeight: number) {
  return (
    (2 * Math.max(MIN_DISTANCE, depth) * Math.tan(MathUtils.degToRad(verticalFov) / 2)) /
    Math.max(1, viewportHeight)
  )
}

function angles(orientation: Quaternion) {
  const euler = new Euler().setFromQuaternion(orientation, 'YXZ')
  return { yaw: euler.y, pitch: MathUtils.clamp(euler.x, -MAX_PITCH, MAX_PITCH) }
}

function upright(yaw: number, pitch: number) {
  return new Quaternion().setFromEuler(
    new Euler(MathUtils.clamp(pitch, -MAX_PITCH, MAX_PITCH), yaw, 0, 'YXZ')
  )
}

type Transition = {
  start: Vector3
  yaw: number
  pitch: number
  yawDelta: number
  pitchDelta: number
  elapsed: number
  duration: number
}

/** Upright free travel with a persistent inspection focus and bounded, finite transitions. */
export class FlightController {
  readonly position = new Vector3()
  readonly orientation = new Quaternion()
  readonly destination = new Vector3()
  readonly aim = new Quaternion()
  readonly focus = new Vector3()
  private transition: Transition | null = null
  private zoomDirection = 0

  constructor(readonly radius: number) {}

  reset(position: Vector3, orientation: Quaternion, focus = new Vector3()) {
    this.position.copy(position).clampLength(0, this.radius)
    const view = angles(orientation)
    this.orientation.copy(upright(view.yaw, view.pitch))
    this.focus.copy(focus)
    this.stop()
  }

  /** Interrupt at the visible pose, without completing queued movement. */
  stop() {
    this.transition = null
    this.zoomDirection = 0
    this.destination.copy(this.position)
    this.aim.copy(this.orientation)
  }

  get focusDistance() {
    return MathUtils.clamp(this.position.distanceTo(this.focus), MIN_DISTANCE, this.radius)
  }

  move(right: number, up: number, forward: number) {
    this.stop()
    const translation = new Vector3(right, up, -forward).applyQuaternion(this.orientation)
    const next = this.position.clone().add(translation).clampLength(0, this.radius)
    this.focus.add(next.clone().sub(this.position))
    this.position.copy(next)
    this.destination.copy(next)
  }

  pan(dx: number, dy: number, depth: number, fov: number, height: number) {
    const scale = panScale(depth, fov, height)
    this.move(-dx * scale, dy * scale, 0)
  }

  turn(yaw: number, pitch: number) {
    this.stop()
    const distance = this.focusDistance
    const view = angles(this.orientation)
    this.orientation.copy(upright(view.yaw + yaw, view.pitch + pitch))
    this.aim.copy(this.orientation)
    this.focus
      .copy(this.position)
      .add(new Vector3(0, 0, -distance).applyQuaternion(this.orientation))
  }

  orbit(pivot: Vector3, yaw: number, pitch: number) {
    this.stop()
    const view = angles(this.orientation)
    const pitchDelta = MathUtils.clamp(view.pitch + pitch, -MAX_PITCH, MAX_PITCH) - view.pitch
    const offset = this.position.clone().sub(pivot)
    const inverse = this.orientation.clone().invert()
    const pose = (fraction: number) => {
      const orientation = upright(view.yaw + yaw * fraction, view.pitch + pitchDelta * fraction)
      const worldRotation = orientation.clone().multiply(inverse)
      return { orientation, position: offset.clone().applyQuaternion(worldRotation).add(pivot) }
    }
    let result = pose(1)
    if (result.position.length() > this.radius) {
      // Approach the boundary continuously rather than rejecting an entire drag.
      let low = 0,
        high = 1
      for (let i = 0; i < 16; i++) {
        const middle = (low + high) / 2
        if (pose(middle).position.length() <= this.radius) low = middle
        else high = middle
      }
      result = pose(low)
    }
    this.position.copy(result.position).clampLength(0, this.radius)
    this.orientation.copy(result.orientation)
    this.destination.copy(this.position)
    this.aim.copy(this.orientation)
    this.focus.copy(pivot)
  }

  dolly(anchor: Vector3, amount: number, immediate = false) {
    const direction = Math.sign(amount)
    if (!direction) return
    if (this.zoomDirection && this.zoomDirection !== direction) this.stop()
    const offset = this.destination.clone().sub(anchor)
    const distance = offset.length()
    if (distance < 0.0001) return
    const nextDistance = Math.max(Math.min(MIN_DISTANCE, distance), distance * Math.exp(-amount))
    const next = offset
      .multiplyScalar(nextDistance / distance)
      .add(anchor)
      .clampLength(0, this.radius)
    this.transitionTo(next, this.orientation, anchor, immediate ? 0 : 0.18)
    this.zoomDirection = direction
  }

  transitionTo(position: Vector3, orientation: Quaternion, focus: Vector3, duration = 0.65) {
    const start = angles(this.orientation),
      end = angles(orientation)
    const yawDelta = Math.atan2(Math.sin(end.yaw - start.yaw), Math.cos(end.yaw - start.yaw))
    this.destination.copy(position).clampLength(0, this.radius)
    this.aim.copy(upright(end.yaw, end.pitch))
    this.focus.copy(focus)
    this.zoomDirection = 0
    this.transition = {
      start: this.position.clone(),
      yaw: start.yaw,
      pitch: start.pitch,
      yawDelta,
      pitchDelta: end.pitch - start.pitch,
      elapsed: 0,
      duration,
    }
    if (duration === 0) this.step(0, true)
  }

  step(delta: number, immediate = false) {
    if (!this.transition) return false
    const transition = this.transition
    transition.elapsed += Math.min(Math.max(delta, 0), 0.1)
    const t = immediate ? 1 : Math.min(1, transition.elapsed / transition.duration)
    const eased = t * t * (3 - 2 * t)
    this.position.lerpVectors(transition.start, this.destination, eased)
    this.orientation.copy(
      upright(
        transition.yaw + transition.yawDelta * eased,
        transition.pitch + transition.pitchDelta * eased
      )
    )
    if (t === 1) {
      this.position.copy(this.destination)
      this.orientation.copy(this.aim)
      this.transition = null
      return false
    }
    return true
  }

  /** Exposed for horizon regression tests and consumers that need the world-up direction. */
  get up() {
    return UP.clone().applyQuaternion(this.orientation)
  }
}
