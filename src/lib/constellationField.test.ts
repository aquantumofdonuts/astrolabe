import { expect, it } from 'vitest'
import { Vector3 } from 'three'
import seed from '../../public/catalog.json'
import { validateCatalog } from './catalog'
import { buildConstellationLayout } from './orbits'
import { constellationField } from './constellationField'

it('connects real tools sparsely, with endpoints clear of uploaded logo frames', () => {
  const catalog = validateCatalog(seed)
  catalog.sites.forEach((site) => {
    site.image = 'uploaded logo'
  })
  for (const [family, station] of buildConstellationLayout(catalog).entries()) {
    const field = constellationField(station, catalog, family)
    expect(field.threads.length).toBeLessThanOrEqual(station.instruments.length - 1)
    expect(field.threads.length).toBeGreaterThan(0)
    for (const thread of field.threads) {
      for (const endpoint of [thread.start, thread.end])
        for (const site of station.instruments)
          expect(
            new Vector3(...endpoint).distanceTo(new Vector3(...site.position))
          ).toBeGreaterThan(1.65 * site.scale)
      expect([...thread.start, ...thread.control, ...thread.end].every(Number.isFinite)).toBe(true)
    }
  }
})

it('adds no threads or synthetic destinations to empty and single-tool constellations', () => {
  const catalog = validateCatalog(seed)
  const station = buildConstellationLayout(catalog)[0]
  expect(constellationField({ ...station, instruments: [] }, catalog, 0).threads).toEqual([])
  expect(
    constellationField({ ...station, instruments: station.instruments.slice(0, 1) }, catalog, 0)
      .threads
  ).toEqual([])
})

it('keeps existing threads and the atmospheric phase stable when another site is added', () => {
  const catalog = validateCatalog(seed)
  const station = buildConstellationLayout(catalog)[0]
  const before = constellationField(station, catalog, 0)
  catalog.sites.push({ ...catalog.sites[0], id: 'new-site' })
  const after = constellationField(buildConstellationLayout(catalog)[0], catalog, 0)
  expect(after.threads.slice(0, before.threads.length)).toEqual(before.threads)
  expect(after.phase).toBe(before.phase)
})
