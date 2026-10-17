export function readPreference<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}
export function writePreference(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export type ViewPreferences = {
  startupView: 'auto' | 'astrolabe' | 'directory'
  startupCollection: 'all' | 'favorites' | 'recent'
  ambientMotion: boolean
  idleTour: boolean
}

export const VIEW_PREFERENCES_KEY = 'astrolabe.view.v1'
export const DEFAULT_VIEW_PREFERENCES: ViewPreferences = {
  startupView: 'auto',
  startupCollection: 'all',
  ambientMotion: true,
  idleTour: true,
}

/** Ignore malformed or future fields so a bad saved setting cannot break startup. */
export function normalizeViewPreferences(value: unknown): ViewPreferences {
  const saved = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    startupView:
      saved.startupView === 'directory' || saved.startupView === 'astrolabe'
        ? saved.startupView
        : 'auto',
    startupCollection:
      saved.startupCollection === 'favorites' || saved.startupCollection === 'recent'
        ? saved.startupCollection
        : 'all',
    ambientMotion: typeof saved.ambientMotion === 'boolean' ? saved.ambientMotion : true,
    idleTour: typeof saved.idleTour === 'boolean' ? saved.idleTour : true,
  }
}

export function readViewPreferences() {
  return normalizeViewPreferences(readPreference<unknown>(VIEW_PREFERENCES_KEY, null))
}

export function startupView(preference: ViewPreferences['startupView'], width: number) {
  return preference === 'auto' ? (width < 900 ? 'directory' : 'astrolabe') : preference
}
