import { expect, it } from 'vitest'
import { DEFAULT_VIEW_PREFERENCES, normalizeViewPreferences, startupView } from './preferences'

it('recovers safe defaults from malformed preferences and ignores unknown fields', () => {
  for (const value of [
    null,
    false,
    3,
    'directory',
    [],
    { startupView: 'future', startupCollection: 'other', ambientMotion: 'false', idleTour: 0 },
  ])
    expect(normalizeViewPreferences(value)).toEqual(DEFAULT_VIEW_PREFERENCES)
  expect(
    normalizeViewPreferences({
      startupView: 'directory',
      startupCollection: 'favorites',
      ambientMotion: false,
      idleTour: false,
      unknown: true,
    })
  ).toEqual({
    startupView: 'directory',
    startupCollection: 'favorites',
    ambientMotion: false,
    idleTour: false,
  })
})

it('uses screen size for automatic startup and honors explicit personal choices', () => {
  expect(startupView('auto', 390)).toBe('directory')
  expect(startupView('auto', 899)).toBe('directory')
  expect(startupView('auto', 900)).toBe('astrolabe')
  expect(startupView('directory', 1440)).toBe('directory')
  expect(startupView('astrolabe', 390)).toBe('astrolabe')
})
