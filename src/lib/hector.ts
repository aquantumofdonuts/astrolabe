import type { Catalog } from './catalog'

export type HectorPhase = 'loading' | 'warning' | 'arrival' | 'attack' | 'departure'
export type HectorStatus = {
  phase: HectorPhase
  destroyed: number
  total: number
  message: string
}
export type HectorSession = { id: number; catalog: Catalog; mode: 'playing' | 'wipe' | 'reveal' }

export const HECTOR_WARNING = 2.6
export const HECTOR_ARRIVAL = 2.2
export const HECTOR_DEPARTURE = 2.4

/** At most twelve volleys; large catalogs get simultaneous targets, never a longer movie. */
export function hectorPlan(ids: string[]) {
  const targets = [...new Set(ids)].sort((a, b) => hectorSeed(a) - hectorSeed(b))
  const batchSize = Math.max(1, Math.ceil(targets.length / 12))
  const batches = Array.from({ length: Math.ceil(targets.length / batchSize) }, (_, index) =>
    targets.slice(index * batchSize, (index + 1) * batchSize)
  )
  const attackDuration = batches.length ? Math.min(13.2, Math.max(5.5, batches.length * 1.3)) : 0.5
  const attackAt = HECTOR_WARNING + HECTOR_ARRIVAL
  const beat = attackDuration / Math.max(1, batches.length)
  const shots = batches.flatMap((ids, volley) =>
    ids.map((id, lane) => ({
      id,
      volley,
      lane,
      weapon: (volley + lane) % 3 === 1 ? ('missile' as const) : ('laser' as const),
      launchAt: attackAt + volley * beat + 0.12 + lane * 0.018,
      impactAt: attackAt + volley * beat + Math.min(0.95, beat * 0.76) + lane * 0.025,
    }))
  )
  return {
    batches,
    shots,
    attackAt,
    attackDuration,
    departAt: attackAt + attackDuration + 0.7,
    endAt: attackAt + attackDuration + 0.7 + HECTOR_DEPARTURE,
    beat,
  }
}

export function hectorSeed(id: string) {
  let hash = 2166136261
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  return (hash >>> 0) / 4294967296
}

/** Reset across editing, modifiers, or long gaps; don't accidentally combine separate typing. */
export function hectorKey(buffer: { text: string; at: number }, key: string, now: number) {
  const word = 'hector'
  const prefix = now - buffer.at > 1400 ? '' : buffer.text
  const candidate = prefix + key.toLowerCase()
  const text = word.startsWith(candidate) ? candidate : key.toLowerCase() === 'h' ? 'h' : ''
  return { text: text === word ? '' : text, at: now, matched: text === word, consumed: !!text }
}
