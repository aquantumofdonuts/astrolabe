import { expect, it } from 'vitest'
import { Euler, Quaternion, Vector3 } from 'three'
import { FlightController, panScale, wheelTravel } from './flight'

function controller(position = new Vector3(0, 0, 15)) {
  const flight = new FlightController(60)
  flight.reset(position, new Quaternion())
  return flight
}
function cameraSpace(flight: FlightController, point: Vector3) {
  return point.clone().sub(flight.position).applyQuaternion(flight.orientation.clone().invert())
}

it('flies through the core and turns back without changing position', () => {
  const flight = controller(new Vector3(0, 0, 5))
  flight.move(0, 0, 10)
  flight.turn(Math.PI, 0)
  expect(flight.position.toArray()).toEqual([0, 0, -5])
  expect(new Vector3(0, 0, -1).applyQuaternion(flight.orientation).z).toBeCloseTo(1)
})

it('completes repeated full orbits in either direction across both axes and the scene boundary', () => {
  for (const axis of [new Vector3(1, 0, 0), new Vector3(0, 1, 0)]) {
    for (const direction of [-1, 1]) {
      const flight = controller(new Vector3(0, 0, 59))
      const pivot = axis.x ? new Vector3(0, 30, 0) : new Vector3(30, 0, 0)
      const initial = cameraSpace(flight, pivot)
      let crossedBoundary = false
      const increment = (direction * Math.PI) / 24
      for (let step = 1; step <= 192; step++) {
        flight.orbit(pivot, axis.y * increment, axis.x * increment)
        const expected = new Quaternion().setFromAxisAngle(axis, step * increment)
        expect(flight.orientation.angleTo(expected)).toBeLessThan(0.000001)
        expect(cameraSpace(flight, pivot).distanceTo(initial)).toBeLessThan(0.000001)
        crossedBoundary ||= flight.position.length() > flight.radius
      }
      expect(crossedBoundary).toBe(true)
      expect(flight.position.distanceTo(new Vector3(0, 0, 59))).toBeLessThan(0.000001)
    }
  }
})

it('preserves an inverted orbit during zoom and starts reset from the visible orientation', () => {
  const flight = controller()
  flight.orbit(new Vector3(), 0.4, Math.PI)
  expect(flight.up.y).toBeLessThan(0)
  const inverted = flight.orientation.clone()
  flight.dolly(new Vector3(), 0.3)
  for (let i = 0; i < 20; i++) {
    flight.step(1 / 60)
    expect(flight.orientation.angleTo(inverted)).toBeLessThan(0.000001)
  }
  flight.transitionTo(new Vector3(0, 0, 15), new Quaternion(), new Vector3(), 0.65)
  flight.step(0)
  expect(flight.orientation.angleTo(inverted)).toBeLessThan(0.000001)
  for (let i = 0; i < 50; i++) flight.step(1 / 60)
  expect(flight.orientation.angleTo(new Quaternion())).toBeLessThan(0.000001)
})

it('continues panning and zooming smoothly after orbiting beyond the translation boundary', () => {
  const flight = controller(new Vector3(0, 0, 59))
  const pivot = new Vector3(30, 0, 0)
  flight.orbit(pivot, Math.PI, 0)
  expect(flight.position.length()).toBeGreaterThan(flight.radius)
  const initial = flight.position.clone()
  flight.pan(1, 0, 20, 42, 800)
  expect(flight.position.distanceTo(initial)).toBeLessThan(0.1)
  const beforeZoom = flight.position.clone()
  const anchor = cameraSpace(flight, pivot)
  flight.dolly(pivot, 0.001, true)
  expect(flight.position.distanceTo(beforeZoom)).toBeLessThan(0.1)
  const afterZoom = cameraSpace(flight, pivot)
  expect(afterZoom.x / afterZoom.z).toBeCloseTo(anchor.x / anchor.z)
  expect(afterZoom.y / afterZoom.z).toBeCloseTo(anchor.y / anchor.z)
})

it('holds an off-center picked point in the same screen position and has no release drift', () => {
  const flight = controller(new Vector3(0, 1, 15))
  const pivot = new Vector3(4, 2, 0)
  const initial = cameraSpace(flight, pivot)
  flight.orbit(pivot, 0.8, -0.35)
  expect(cameraSpace(flight, pivot).distanceTo(initial)).toBeLessThan(0.000001)
  const released = flight.position.clone()
  for (let i = 0; i < 100; i++) expect(flight.step(1 / 60)).toBe(false)
  expect(flight.position.equals(released)).toBe(true)
  expect(flight.focus.equals(pivot)).toBe(true)
})

it('pans exactly with the pointer at near and far focus distances', () => {
  for (const distance of [2, 10, 40]) {
    const flight = controller(new Vector3(0, 0, distance))
    flight.pan(100, 50, distance, 42, 800)
    const point = cameraSpace(flight, new Vector3())
    const pixelsPerUnit = 1 / panScale(distance, 42, 800)
    expect(point.x * pixelsPerUnit).toBeCloseTo(100)
    expect(-point.y * pixelsPerUnit).toBeCloseTo(50)
    expect(flight.focus.x).toBeCloseTo(flight.position.x)
  }
})

it('zooms toward an off-center point without moving it on screen or crossing its surface', () => {
  const flight = controller()
  const anchor = new Vector3(4, 2, 0)
  const initial = cameraSpace(flight, anchor)
  flight.dolly(anchor, 0.4)
  for (let i = 0; i < 20; i++) {
    flight.step(1 / 60)
    const point = cameraSpace(flight, anchor)
    expect(point.x / point.z).toBeCloseTo(initial.x / initial.z)
    expect(point.y / point.z).toBeCloseTo(initial.y / initial.z)
  }
  for (let i = 0; i < 100; i++) flight.dolly(anchor, 1, true)
  expect(flight.position.distanceTo(anchor)).toBeCloseTo(0.8)
  expect(flight.position.z).toBeGreaterThan(0)
})

it('reverses zoom immediately instead of completing queued forward movement', () => {
  const flight = controller()
  flight.dolly(new Vector3(), 1)
  flight.step(0.05)
  const reversedAt = flight.position.z
  flight.dolly(new Vector3(), -0.1)
  flight.step(0.03)
  expect(flight.position.z).toBeGreaterThan(reversedAt)
})

it('finishes transitions on time at different frame rates, without overshoot or roll', () => {
  for (const fps of [15, 30, 60, 144]) {
    const flight = controller()
    flight.transitionTo(
      new Vector3(5, 2, 6),
      new Quaternion().setFromEuler(new Euler(0.3, 1, 0, 'YXZ')),
      new Vector3(5, 2, 0),
      0.6
    )
    for (let i = 0; i < Math.ceil(fps * 0.6) + 1; i++) {
      flight.step(1 / fps)
      expect(flight.position.z).toBeGreaterThanOrEqual(6)
      expect(flight.position.z).toBeLessThanOrEqual(15)
      expect(new Vector3(1, 0, 0).applyQuaternion(flight.orientation).y).toBeCloseTo(0)
    }
    expect(flight.position.distanceTo(new Vector3(5, 2, 6))).toBeLessThan(1e-10)
    expect(flight.step(1 / fps)).toBe(false)
  }
})

it('cancels transitions at the visible pose and supports immediate reduced-motion travel', () => {
  const flight = controller()
  flight.transitionTo(new Vector3(4, 2, 6), new Quaternion(), new Vector3())
  flight.step(0.1)
  const stopped = flight.position.clone()
  flight.stop()
  flight.step(0.1)
  expect(flight.position.equals(stopped)).toBe(true)
  flight.transitionTo(new Vector3(0, 0, 21), new Quaternion(), new Vector3(), 0)
  expect(flight.position.toArray()).toEqual([0, 0, 21])
})

it('keeps translations and transitions inside the navigation sphere', () => {
  const flight = controller(new Vector3(0, 0, 59))
  for (let i = 0; i < 80; i++) {
    flight.move(40, 20, -30)
    expect(flight.position.length()).toBeLessThanOrEqual(60.000001)
    flight.transitionTo(new Vector3(100, 20, 90), new Quaternion(), new Vector3())
    flight.step(0.05)
    expect(flight.position.length()).toBeLessThanOrEqual(60.000001)
  }
})

it('normalizes mouse, trackpad, line, and page wheel units and limits extreme events', () => {
  expect(wheelTravel(-160, 0, 500)).toBeCloseTo(wheelTravel(-10, 1, 500))
  expect(wheelTravel(-160, 0, 500)).toBeCloseTo(wheelTravel(-10, 0, 500) * 16)
  expect(wheelTravel(1, 2, 100)).toBeCloseTo(wheelTravel(100, 0, 500))
  expect(wheelTravel(-100000, 0, 500)).toBe(0.48)
})
