import { Euler, MathUtils, Vector3 } from 'three'
import type { Catalog } from './catalog'

export type Point3 = [number, number, number]
export type Constellation = {
  categoryId: string
  center: Point3
  label: Point3
  instruments: { id: string; position: Point3; rotation: Point3; scale: number }[]
}

export const HOME_DISTANCE = 52

// Longitude, latitude, and radius: uneven inner, middle, and outer groups fill
// both hemispheres without collecting on one shell. Slots stay fixed as the catalog grows.
const sectors = [
  [-65, 16, 12.8],
  [128, 20, 25],
  [52, -25, 18.5],
  [-126, -26, 31],
  [175, 26, 36],
]
const tilts: Point3[] = [
  [0.18, -0.3, -0.12],
  [-0.3, 0.22, 0.2],
  [0.32, 0.35, -0.24],
  [-0.24, -0.4, 0.16],
  [0.38, -0.2, -0.18],
]

function fraction(id: string) {
  let hash = 2166136261
  for (const character of id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619)
  return (hash >>> 0) / 4294967296
}

export function buildConstellationLayout(catalog: Catalog): Constellation[] {
  return catalog.categories.map((category, index) => {
    // Extra categories follow a golden-angle sphere instead of stacking into a disc.
    const [longitude, latitude, radius] = sectors[index] ?? [
      index * 137.508 + 23,
      Math.asin(2 * fraction(category.id) - 1) * MathUtils.RAD2DEG,
      13 + fraction(category.id + ':radius') * 24,
    ]
    const azimuth = longitude * MathUtils.DEG2RAD,
      elevation = latitude * MathUtils.DEG2RAD
    const center = new Vector3(
      radius * Math.cos(elevation) * Math.sin(azimuth),
      radius * Math.sin(elevation),
      radius * Math.cos(elevation) * Math.cos(azimuth)
    )
    const tilt = tilts[index % tilts.length]
    // Give distant groups more physical room, so their labels remain separable.
    const spread = (HOME_DISTANCE - center.z) / HOME_DISTANCE
    const members = catalog.sites.filter((site) => site.category === category.id)
    const instruments = members.map((site, i) => {
      const seed = fraction(site.id)
      const angle =
        ([168, 18, 276][i % 3] + Math.floor(i / 3) * 39 + (seed - 0.5) * 16) * MathUtils.DEG2RAD
      const distance = [4.8, 4.4, 4.1][i % 3] + Math.floor(i / 3) * 3.2 + seed * 0.45
      const offset = new Vector3(
        Math.cos(angle) * distance,
        Math.sin(angle) * distance,
        [-1.3, 1.6, 0.5][i % 3] + (seed - 0.5) * 1.8
      )
        .applyEuler(new Euler(...tilt))
        .multiplyScalar(spread)
      const position = center.clone().add(offset)
      const scale = MathUtils.clamp(Math.sqrt(spread), 0.95, 1.2)
      return {
        id: site.id,
        position: position.toArray() as Point3,
        rotation: [tilt[0] * 0.4, (seed - 0.5) * 0.6, tilt[2] * 0.7] as Point3,
        scale,
      }
    })
    return {
      categoryId: category.id,
      center: center.toArray() as Point3,
      label: [
        center.x + (index === 3 ? -7.2 * spread : index === 2 ? -4.5 * spread : 0),
        index === 3
          ? center.y + 1.7 * spread
          : Math.max(center.y, ...instruments.map((item) => item.position[1])) + 3 * spread,
        center.z,
      ] as Point3,
      instruments,
    }
  })
}
