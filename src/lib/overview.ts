import { Box3, MathUtils, Matrix4, Quaternion, Vector3 } from 'three'
import type { Catalog } from './catalog'
import type { Constellation } from './orbits'
import { destinationRadius } from './hud'

export type OverviewBody = { position: Vector3; radius: number }
export type Overview = { bodies: OverviewBody[]; center: Vector3; radius: number }
export type ViewInsets = { top: number; right: number; bottom: number; left: number }

export function systemOverview(catalog: Catalog, stations: Constellation[]): Overview {
  const bodies: OverviewBody[] = [{ position: new Vector3(0, 0.25, -2), radius: 3.6 }]
  for (const [family, station] of stations.entries()) {
    bodies.push({ position: new Vector3(...station.label), radius: 1.5 })
    for (const [variant, item] of station.instruments.entries()) {
      const site = catalog.sites.find((site) => site.id === item.id)
      bodies.push({
        position: new Vector3(...item.position),
        radius: destinationRadius(family, variant, !!site?.image) * item.scale,
      })
    }
  }
  const box = new Box3()
  for (const body of bodies) {
    box.expandByPoint(body.position.clone().addScalar(body.radius))
    box.expandByPoint(body.position.clone().addScalar(-body.radius))
  }
  const center = box.getCenter(new Vector3())
  const radius = Math.max(...bodies.map((body) => body.position.distanceTo(center) + body.radius))
  return { bodies, center, radius }
}

/** Fit every physical silhouette inside the usable viewport at any orbit bearing. */
export function overviewPose(
  overview: Overview,
  width: number,
  height: number,
  fov: number,
  yaw: number,
  insets: ViewInsets
) {
  const horizontalPadding = Math.min(
    1,
    Math.max(0, width - 64) / Math.max(1, insets.left + insets.right)
  )
  const verticalPadding = Math.min(
    1,
    Math.max(0, height - 64) / Math.max(1, insets.top + insets.bottom)
  )
  const limits = [
    [
      -1 + (2 * insets.left * horizontalPadding) / width,
      1 - (2 * insets.right * horizontalPadding) / width,
    ],
    [
      -1 + (2 * insets.bottom * verticalPadding) / height,
      1 - (2 * insets.top * verticalPadding) / height,
    ],
  ]
  const middle = limits.map(([low, high]) => (low + high) / 2)
  const tangent = [
    Math.tan(MathUtils.degToRad(fov) / 2) * (width / height),
    Math.tan(MathUtils.degToRad(fov) / 2),
  ]
  const direction = new Vector3(Math.sin(yaw), 0.08, Math.cos(yaw)).normalize()
  const orientation = new Quaternion().setFromRotationMatrix(
    new Matrix4().lookAt(direction, new Vector3(), new Vector3(0, 1, 0))
  )
  const inverse = orientation.clone().invert()
  let distance = 6
  // Fit bounding spheres against the cropped perspective frustum's four side
  // planes, then offset the aim to the center of the usable screen rectangle.
  for (const body of overview.bodies) {
    const local = body.position.clone().sub(overview.center).applyQuaternion(inverse)
    distance = Math.max(distance, local.z + body.radius + 1)
    for (const axis of [0, 1]) {
      for (const sign of [-1, 1]) {
        const limit = sign < 0 ? -limits[axis][0] : limits[axis][1]
        const slope = limit * tangent[axis]
        distance = Math.max(
          distance,
          (sign * local.getComponent(axis) +
            slope * local.z +
            body.radius * Math.sqrt(1 + slope * slope)) /
            ((limit - sign * middle[axis]) * tangent[axis])
        )
      }
    }
  }
  const offset = new Vector3(
    -middle[0] * distance * tangent[0],
    -middle[1] * distance * tangent[1],
    0
  ).applyQuaternion(orientation)
  const focus = overview.center.clone().add(offset)
  return {
    position: focus.clone().addScaledVector(direction, distance),
    orientation,
    focus,
    distance,
  }
}
