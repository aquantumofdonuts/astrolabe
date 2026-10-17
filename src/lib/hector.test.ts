import { expect, it } from 'vitest'
import { hectorKey, hectorPlan } from './hector'

it('gives every destination exactly one impact and caps the duration of large catalogs', () => {
  for (const count of [0, 1, 3, 15, 50, 200]) {
    const ids = Array.from({ length: count }, (_, i) => `tool-${i}`)
    const plan = hectorPlan(ids)
    expect(plan.shots.map((shot) => shot.id).sort()).toEqual([...ids].sort())
    expect(plan.batches.length).toBeLessThanOrEqual(12)
    expect(plan.endAt).toBeLessThanOrEqual(22)
    expect(plan.shots.every((shot) => shot.impactAt > shot.launchAt)).toBe(true)
    expect(plan.shots.every((shot) => shot.impactAt < plan.departAt)).toBe(true)
    if (count > 12) expect(plan.batches.some((batch) => batch.length > 1)).toBe(true)
  }
})

it('keeps the same attack order across rerenders and mixes missiles with lasers', () => {
  const ids = Array.from({ length: 15 }, (_, i) => `tool-${i}`)
  const before = [...ids]
  const plan = hectorPlan(ids)
  expect(hectorPlan([...ids].reverse())).toEqual(plan)
  expect(ids).toEqual(before)
  expect(new Set(plan.shots.map((shot) => shot.weapon))).toEqual(new Set(['missile', 'laser']))
})

it('recognizes a deliberate case-insensitive sequence but forgets interrupted typing', () => {
  let buffer = { text: '', at: 0 }
  for (const [index, key] of [...'hEcToR'].entries()) {
    const next = hectorKey(buffer, key, index * 200)
    expect(next.matched).toBe(index === 5)
    buffer = next
  }
  expect(buffer.text).toBe('')
  expect(hectorKey({ text: 'hec', at: 10 }, 't', 2000).text).toBe('')
  expect(hectorKey({ text: 'hec', at: 10 }, 'x', 100).text).toBe('')
  expect(hectorKey({ text: 'hec', at: 10 }, 'h', 100).text).toBe('h')
})
