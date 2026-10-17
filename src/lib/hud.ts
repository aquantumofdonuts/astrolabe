import { Camera, Vector3 } from 'three'
import type { Point3 } from './orbits'

/** Conservative silhouette radius; HUD stays outside the body, even during a close approach. */
export function destinationRadius(family: number, variant: number, hasImage = false) {
  if (hasImage) return 1.65
  return variant % 3 === 1 ? 1.35 : variant % 3 === 2 && family % 2 === 1 ? 1.95 : 1.12
}

export function projectDestination(
  camera: Camera,
  position: Point3,
  radius: number,
  width: number,
  height: number
) {
  const center = new Vector3(...position)
  const depth = -center.clone().applyMatrix4(camera.matrixWorldInverse).z
  const projected = center.project(camera)
  const bodyX = ((projected.x + 1) * width) / 2
  const bodyY = ((1 - projected.y) * height) / 2
  const pixels = Math.min(
    height * 0.42,
    (radius * camera.projectionMatrix.elements[5] * height) / (2 * Math.max(0.1, depth))
  )
  const x = Math.max(75, Math.min(width - 75, bodyX))
  const y = Math.max(46, Math.min(height - 42, bodyY + pixels + 24))
  return {
    x,
    y,
    bodyX,
    bodyY,
    pixels,
    visible:
      projected.z > -1 &&
      projected.z < 1 &&
      bodyX > 15 &&
      bodyX < width - 15 &&
      bodyY > 20 &&
      bodyY < height - 30,
  }
}
