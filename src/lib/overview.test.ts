import { expect, it } from 'vitest'
import { Frustum, Matrix4, PerspectiveCamera, Vector3 } from 'three'
import seed from '../../public/catalog.json'
import { validateCatalog } from './catalog'
import { buildConstellationLayout } from './orbits'
import { overviewPose, systemOverview } from './overview'

it('fits the whole system tightly inside usable desktop, portrait, and expanded viewports for a full orbit', () => {
  const catalog = validateCatalog(seed)
  const overview = systemOverview(catalog, buildConstellationLayout(catalog))
  for (const viewport of [
    { width: 1440, height: 854, top: 68, right: 70, bottom: 76, left: 70 },
    { width: 1280, height: 544, top: 68, right: 70, bottom: 76, left: 70 },
    { width: 390, height: 560, top: 40, right: 70, bottom: 196, left: 70 },
    { width: 1920, height: 1080, top: 170, right: 70, bottom: 76, left: 70 },
  ]) {
    for (let step = 0; step <= 48; step++) {
      const { width, height, top, right, bottom, left } = viewport
      const pose = overviewPose(overview, width, height, 42, (step * Math.PI) / 24, viewport)
      const camera = new PerspectiveCamera(42, width / height, 0.1, 10000)
      camera.position.copy(pose.position)
      camera.quaternion.copy(pose.orientation)
      camera.setViewOffset(width, height, left, top, width - left - right, height - top - bottom)
      camera.updateMatrixWorld()
      const frustum = new Frustum().setFromProjectionMatrix(
        new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
      )
      let closestEdge = Infinity
      for (const body of overview.bodies) {
        for (const plane of frustum.planes) {
          const clearance = plane.distanceToPoint(body.position) - body.radius
          expect(clearance).toBeGreaterThanOrEqual(-0.000001)
          closestEdge = Math.min(closestEdge, clearance)
        }
      }
      // At least one silhouette reaches an edge of the usable frame instead of
      // shrinking the whole system into an unnecessarily distant bounding sphere.
      expect(closestEdge).toBeLessThan(0.000001)
    }
  }
})

it('includes uploaded logo frames, category callouts, and the sun in overview bounds', () => {
  const catalog = validateCatalog(seed)
  catalog.sites[1].image = 'embedded globe'
  const stations = buildConstellationLayout(catalog)
  const overview = systemOverview(catalog, stations)
  expect(overview.bodies).toHaveLength(catalog.sites.length + catalog.categories.length + 1)
  expect(overview.bodies[0].position.toArray()).toEqual([0, 0.25, -2])
  expect(overview.bodies[3].radius).toBeCloseTo(1.65 * stations[0].instruments[1].scale)
  for (const body of overview.bodies)
    expect(body.position.distanceTo(overview.center) + body.radius).toBeLessThanOrEqual(
      overview.radius
    )
})

it('can frame a large catalog beyond the manual camera boundary without clipping', () => {
  const catalog = validateCatalog(seed)
  for (let index = 0; index < 80; index++)
    catalog.sites.push({ ...catalog.sites[0], id: `extra-${index}` })
  const overview = systemOverview(catalog, buildConstellationLayout(catalog))
  const pose = overviewPose(overview, 390, 560, 42, 0, {
    top: 40,
    right: 70,
    bottom: 196,
    left: 70,
  })
  expect(pose.position.distanceTo(new Vector3())).toBeGreaterThan(80)
  expect(Number.isFinite(pose.distance)).toBe(true)
})
