import { describe, expect, it } from 'vitest'
import seed from '../../public/catalog.json'
import { searchSites, uniqueId, validateCatalog } from './catalog'

describe('catalog import boundary', () => {
  it('accepts the demonstration catalog and preserves every instrument', () => {
    const catalog = validateCatalog(seed)
    expect(catalog.sites).toHaveLength(seed.sites.length)
    expect(catalog.categories).toHaveLength(seed.categories.length)
    expect(catalog.sites.every((site) => site.url === null)).toBe(true)
  })
  it.each([
    'javascript:alert(1)',
    'data:text/html,hello',
    'file:///etc/passwd',
    'https://user:password@example.com',
    '/relative-path',
    'not a url',
  ])('rejects unsafe or nonportable destination %s', (url) => {
    const input = structuredClone(seed)
    input.sites[0].url = url as never
    expect(() => validateCatalog(input)).toThrow()
  })
  it.each([
    'https://ncm.example.com/configs',
    'http://10.0.0.5:8080/tools',
    'https://tools.internal/?filter=switch#backup',
  ])('accepts a valid internal or external destination %s', (url) => {
    const input = structuredClone(seed)
    input.sites[0].url = url as never
    expect(validateCatalog(input).sites[0].url).toBe(url)
  })
  it('rejects a site whose category no longer exists', () => {
    const input = structuredClone(seed)
    input.sites[0].category = 'missing'
    expect(() => validateCatalog(input)).toThrow(/unknown category/)
  })
  it('rejects duplicate site IDs and malformed category colors', () => {
    const input = structuredClone(seed)
    input.sites[1].id = input.sites[0].id
    expect(() => validateCatalog(input)).toThrow(/Duplicate ID/)
    input.sites[1].id = 'pulse'
    input.categories[0].color = 'red'
    expect(() => validateCatalog(input)).toThrow(/six-digit hex/)
  })
  it('allows an empty catalog so an administrator can start from scratch', () => {
    expect(validateCatalog({ ...seed, sites: [] }).sites).toEqual([])
  })
  it('rejects unsupported versions, excessive catalogs, and malformed tags', () => {
    expect(() => validateCatalog({ ...seed, version: 2 })).toThrow(/version/)
    expect(() => validateCatalog({ ...seed, sites: Array(201).fill(seed.sites[0]) })).toThrow(/200/)
    const input = structuredClone(seed)
    input.sites[0].tags = ['']
    expect(() => validateCatalog(input)).toThrow(/Tags/)
  })
})

describe('discoverability', () => {
  const catalog = validateCatalog(seed)
  it('finds a tool through task-oriented keywords and requires all search terms', () => {
    expect(searchSites(catalog.sites, 'SWITCH backup').map((site) => site.id)).toEqual(['atlas'])
    expect(searchSites(catalog.sites, 'switch unicorn')).toEqual([])
  })
  it('prioritizes names and preserves the authored order for an empty search', () => {
    expect(searchSites(catalog.sites, 'pulse')[0].id).toBe('pulse')
    expect(searchSites(catalog.sites, '   ')).toEqual(catalog.sites)
  })
  it('finds instruments by their editable category display name', () => {
    const categories = catalog.categories.map((category) =>
      category.id === 'observe' ? { ...category, name: 'Observability' } : category
    )
    expect(searchSites(catalog.sites, 'observability', categories)).toHaveLength(3)
  })
  it('generates unique stable IDs from names', () => {
    expect(uniqueId('Network Atlas!', ['network-atlas', 'network-atlas-2'])).toBe('network-atlas-3')
    expect(uniqueId('✧', [])).toBe('instrument')
  })
})
