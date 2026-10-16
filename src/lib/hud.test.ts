import { expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { projectDestination } from './hud'

it('keeps a HUD label outside the visible limb as the camera approaches', () => {
  for (const distance of [44, 16, 6]) {
    const camera = new PerspectiveCamera(42, 1.8, 0.035, 300)
    camera.position.set(0, 0, distance)
    camera.updateMatrixWorld()
    const label = projectDestination(camera, [0, 0, 0], 1.12, 1440, 800)
    const limb = new Vector3(0, -1.12, 0).project(camera)
    expect(label.y - (1 - limb.y) * 400).toBeGreaterThan(20)
    expect(label.visible).toBe(true)
    expect(label.x).toBe(720)
  }
})

it('keeps close-up labels inside the viewport and hides destinations behind the camera', () => {
  const camera = new PerspectiveCamera(42, 1.8, 0.035, 300)
  camera.position.set(0, 0, 6)
  camera.updateMatrixWorld()
  const near = projectDestination(camera, [0, -1, 0], 1.95, 1440, 800)
  expect(near.y).toBeLessThanOrEqual(758)
  expect(projectDestination(camera, [0, 0, 20], 1, 1440, 800).visible).toBe(false)
})
