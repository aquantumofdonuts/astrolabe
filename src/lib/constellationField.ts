import { Vector3 } from 'three'
import type { Catalog } from './catalog'
import type { Constellation, Point3 } from './orbits'
import { destinationRadius } from './hud'

export type PlasmaThread = { start: Point3; control: Point3; end: Point3 }

/** A sparse tree connects actual sites. Threads stop outside their silhouettes. */
export function constellationField(station: Constellation, catalog: Catalog, family: number) {
  const members = station.instruments.map((item, variant) => ({
    id: item.id,
    point: new Vector3(...item.position),
    radius:
      destinationRadius(
        family,
        variant,
        !!catalog.sites.find((site) => site.id === item.id)?.image
      ) * item.scale,
  }))
  const center = members.length
    ? members.reduce((sum, item) => sum.add(item.point), new Vector3()).divideScalar(members.length)
    : new Vector3(...station.center)
  const radius = Math.max(1, ...members.map((item) => center.distanceTo(item.point) + item.radius))
  const threads: PlasmaThread[] = []
  for (let index = 1; index < members.length; index++) {
    const a = members[index]
    let b = members[0]
    for (const candidate of members.slice(1, index))
      if (a.point.distanceToSquared(candidate.point) < a.point.distanceToSquared(b.point))
        b = candidate
    const distance = a.point.distanceTo(b.point)
    if (distance <= a.radius + b.radius + 0.5) continue
    const start = a.point.clone().lerp(b.point, (a.radius + 0.25) / distance)
    const end = b.point.clone().lerp(a.point, (b.radius + 0.25) / distance)
    const control = start
      .clone()
      .add(end)
      .multiplyScalar(0.5)
      .add(new Vector3(0, Math.min(0.9, distance * 0.08), -0.55))
    threads.push({
      start: start.toArray() as Point3,
      control: control.toArray() as Point3,
      end: end.toArray() as Point3,
    })
  }
  let hash = 2166136261
  for (const char of station.categoryId) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  return {
    center: center.toArray() as Point3,
    radius,
    threads,
    phase: ((hash >>> 0) / 4294967296) * 60,
  }
}
