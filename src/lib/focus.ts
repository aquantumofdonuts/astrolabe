import { Box3, MathUtils, Vector3 } from 'three'
import type { Catalog } from './catalog'
import type { Constellation, Point3 } from './orbits'
import { destinationRadius } from './hud'

export type FocusRequest = { kind: 'node' | 'category'; id: string; key: number }
export type FocusTarget = { position: Point3; radius: number; group: boolean }

/** Frame actual silhouettes, including rings and image globes, rather than arbitrary offsets. */
export function selectionTarget(
  catalog: Catalog,
  stations: Constellation[],
  request: FocusRequest | null
): FocusTarget | undefined {
  if (!request) return
  const family = stations.findIndex((station) =>
    request.kind === 'category'
      ? station.categoryId === request.id
      : station.instruments.some((item) => item.id === request.id)
  )
  if (family < 0) return
  const station = stations[family]
  const members = station.instruments.flatMap((item, variant) => {
    if (request.kind === 'node' && item.id !== request.id) return []
    const site = catalog.sites.find((site) => site.id === item.id)
    return [
      {
        position: new Vector3(...item.position),
        radius: destinationRadius(family, variant, !!site?.image) * item.scale,
      },
    ]
  })
  if (request.kind === 'node')
    return {
      position: members[0].position.toArray() as Point3,
      radius: members[0].radius,
      group: false,
    }
  // Include the category callout so the group's identity remains in the framing.
  members.push({ position: new Vector3(...station.label), radius: 1.5 })
  const bounds = new Box3()
  for (const member of members) {
    bounds.expandByPoint(member.position.clone().addScalar(member.radius))
    bounds.expandByPoint(member.position.clone().addScalar(-member.radius))
  }
  const center = bounds.getCenter(new Vector3())
  const radius = Math.max(
    3,
    ...members.map((member) => center.distanceTo(member.position) + member.radius)
  )
  return { position: center.toArray() as Point3, radius, group: true }
}

export function focusDistance(radius: number, aspect: number, verticalFov: number, group: boolean) {
  const vertical = MathUtils.degToRad(verticalFov) / 2
  const horizontal = Math.atan(Math.tan(vertical) * Math.max(0.25, aspect) * 0.76)
  // Leave space for the HUD and the inspector without letting either cover the destination.
  const halfAngle = Math.min(vertical, horizontal) * (group ? 0.78 : 0.52)
  return Math.max(6.5, radius / Math.sin(halfAngle))
}
