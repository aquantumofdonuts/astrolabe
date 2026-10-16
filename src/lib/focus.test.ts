import { expect, it } from 'vitest'
import { Vector3 } from 'three'
import seed from '../../public/catalog.json'
import { validateCatalog } from './catalog'
import { buildConstellationLayout } from './orbits'
import { selectionTarget, focusDistance } from './focus'
import { destinationRadius } from './hud'

it('frames every category member including its physical silhouette', () => {
  const catalog = validateCatalog(seed)
  const stations = buildConstellationLayout(catalog)
  for (const [family, station] of stations.entries()) {
    const target = selectionTarget(catalog, stations, {
      kind: 'category',
      id: station.categoryId,
      key: 1,
    })!
    for (const [variant, item] of station.instruments.entries()) {
      const radius = destinationRadius(family, variant) * item.scale
      expect(
        new Vector3(...target.position).distanceTo(new Vector3(...item.position)) + radius
      ).toBeLessThanOrEqual(target.radius + 1e-6)
    }
    expect(target.group).toBe(true)
  }
})

it('targets uploaded image globes and handles empty or removed categories', () => {
  const catalog = validateCatalog(seed)
  catalog.sites[0].image = 'data:image/png;base64,AA=='
  catalog.categories.push({ ...catalog.categories[0], id: 'empty', name: 'Empty' })
  const stations = buildConstellationLayout(catalog)
  const item = stations
    .flatMap((s) => s.instruments)
    .find((item) => item.id === catalog.sites[0].id)!
  const target = selectionTarget(catalog, stations, { kind: 'node', id: item.id, key: 1 })!
  expect(target.position).toEqual(item.position)
  expect(target.radius).toBeCloseTo(1.12 * item.scale)
  expect(
    selectionTarget(catalog, stations, { kind: 'category', id: 'empty', key: 1 })?.radius
  ).toBeGreaterThan(0)
  expect(
    selectionTarget(catalog, stations, { kind: 'node', id: 'missing', key: 1 })
  ).toBeUndefined()
})

it('backs away to fit groups on portrait screens and keeps a safe node approach', () => {
  expect(focusDistance(8, 0.6, 42, true)).toBeGreaterThan(focusDistance(8, 1.8, 42, true))
  expect(focusDistance(2, 1.8, 42, false)).toBeGreaterThan(2)
  expect(focusDistance(0.1, 1.8, 42, false)).toBeGreaterThanOrEqual(6.5)
})
