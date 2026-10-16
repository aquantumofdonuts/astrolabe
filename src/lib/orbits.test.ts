import { expect, it } from 'vitest'
import { Vector3 } from 'three'
import seed from '../../public/catalog.json'
import { validateCatalog } from './catalog'
import { buildConstellationLayout } from './orbits'

it('spreads constellations across both hemispheres with different distances and elevations', () => {
  const systems = buildConstellationLayout(validateCatalog(seed))
  const points = systems.map((system) => new Vector3(...system.center))
  expect(Math.min(...points.map((point) => point.length()))).toBeGreaterThan(12)
  expect(
    Math.max(...points.map((point) => point.z)) - Math.min(...points.map((point) => point.z))
  ).toBeGreaterThan(24)
  expect(
    Math.max(...points.map((point) => point.y)) - Math.min(...points.map((point) => point.y))
  ).toBeGreaterThan(20)
  expect(new Set(points.map((point) => point.length().toFixed(2))).size).toBe(systems.length)
  // A nonzero tetrahedral volume rules out merely tilting a flat disc.
  const [a, b, c, d] = points
  expect(Math.abs(b.clone().sub(a).cross(c.clone().sub(a)).dot(d.clone().sub(a)))).toBeGreaterThan(
    1000
  )
})

it('keeps every instrument in a spaced, irregular local group', () => {
  const catalog = validateCatalog(seed)
  const systems = buildConstellationLayout(catalog)
  expect(systems.flatMap((system) => system.instruments)).toHaveLength(catalog.sites.length)
  for (const system of systems) {
    const distances = system.instruments.map((item) =>
      new Vector3(...item.position).distanceTo(new Vector3(...system.center))
    )
    expect(Math.max(...distances) - Math.min(...distances)).toBeGreaterThan(0.5)
    for (const [i, item] of system.instruments.entries()) {
      expect(catalog.sites.find((site) => site.id === item.id)?.category).toBe(system.categoryId)
      expect(item.position.every(Number.isFinite)).toBe(true)
      for (const other of system.instruments.slice(i + 1))
        expect(
          new Vector3(...item.position).distanceTo(new Vector3(...other.position))
        ).toBeGreaterThan(4)
    }
  }
})

it('keeps existing positions stable when categories and instruments are appended', () => {
  const catalog = validateCatalog(seed)
  const before = buildConstellationLayout(catalog)
  catalog.categories.push({ ...catalog.categories[0], id: 'research', name: 'Research' })
  catalog.sites.push({ ...catalog.sites[0], id: 'new-tool', name: 'New tool' })
  const after = buildConstellationLayout(catalog)
  for (const [i, system] of before.entries()) {
    expect(after[i].center).toEqual(system.center)
    expect(after[i].instruments.slice(0, system.instruments.length)).toEqual(system.instruments)
  }
  expect(after.at(-1)?.center.every(Number.isFinite)).toBe(true)
})
