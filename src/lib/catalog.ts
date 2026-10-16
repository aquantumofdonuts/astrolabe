import { validateNodeImage } from './nodeImages.ts'

export type IconName =
  | 'radar'
  | 'network'
  | 'terminal'
  | 'bot'
  | 'activity'
  | 'shield'
  | 'workflow'
  | 'database'
  | 'code'
  | 'search'
  | 'globe'
  | 'sparkles'
export const iconNames: IconName[] = [
  'radar',
  'network',
  'terminal',
  'bot',
  'activity',
  'shield',
  'workflow',
  'database',
  'code',
  'search',
  'globe',
  'sparkles',
]
export type Category = {
  id: string
  name: string
  description: string
  color: string
  icon: IconName
}
export type Instrument = {
  image?: string
  id: string
  name: string
  description: string
  category: string
  icon: IconName
  url: string | null
  tags: string[]
  featured: boolean
}
export type Catalog = { version: 1; title: string; categories: Category[]; sites: Instrument[] }
export const LOCAL_CATALOG_KEY = 'astrolabe.catalog.v1'

export function validateCatalog(value: unknown): Catalog {
  const fail = (message: string): never => {
    throw new Error(message)
  }
  const record = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
  if (!record(value) || value.version !== 1)
    return fail('Expected an Astrolabe catalog with version: 1.')
  if (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 80)
    return fail('Catalog title must contain 1–80 characters.')
  if (
    !Array.isArray(value.categories) ||
    value.categories.length < 1 ||
    value.categories.length > 12
  )
    return fail('Include between 1 and 12 categories.')
  if (!Array.isArray(value.sites) || value.sites.length > 200)
    return fail('The catalog supports up to 200 instruments.')
  const ids = new Set<string>()
  const checkId = (id: unknown, label: string) => {
    if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(id))
      return fail(`${label}: use a lowercase ID containing letters, numbers, and hyphens.`)
    if (ids.has(id)) return fail(`Duplicate ID: ${id}.`)
    ids.add(id)
    return id
  }
  const string = (input: unknown, label: string, max = 300) => {
    if (typeof input !== 'string' || !input.trim() || input.length > max)
      return fail(`${label} must contain 1–${max} characters.`)
    return input.trim()
  }
  const icon = (input: unknown): IconName =>
    iconNames.includes(input as IconName) ? (input as IconName) : fail('Choose a supported icon.')
  const categories = value.categories.map((entry, index): Category => {
    if (!record(entry)) return fail(`Category ${index + 1} is invalid.`)
    if (typeof entry.color !== 'string' || !/^#[a-f0-9]{6}$/i.test(entry.color))
      return fail('Category colors must use six-digit hex values, such as #75cdd6.')
    return {
      id: checkId(entry.id, 'Category'),
      name: string(entry.name, 'Category name', 40),
      description: string(entry.description, 'Category description', 160),
      color: entry.color,
      icon: icon(entry.icon),
    }
  })
  const categoryIds = new Set(categories.map((category) => category.id))
  ids.clear()
  const sites = value.sites.map((entry, index): Instrument => {
    if (!record(entry)) return fail(`Instrument ${index + 1} is invalid.`)
    if (typeof entry.category !== 'string' || !categoryIds.has(entry.category))
      return fail(`Instrument ${index + 1} references an unknown category.`)
    if (
      !Array.isArray(entry.tags) ||
      entry.tags.length > 16 ||
      entry.tags.some((tag) => typeof tag !== 'string' || !tag.trim() || tag.length > 40)
    )
      return fail('Tags must be a list of up to 16 nonempty strings, each under 41 characters.')
    if (typeof entry.featured !== 'boolean')
      return fail('Each instrument must have a boolean featured field.')
    let url: string | null = null
    if (entry.url !== null) {
      if (typeof entry.url !== 'string' || entry.url.length > 2048)
        return fail('Use an absolute HTTP or HTTPS URL, or null for a demo.')
      try {
        const parsed = new URL(entry.url)
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password)
          return fail('Only HTTP/HTTPS links without embedded credentials are supported.')
        url = parsed.href
      } catch {
        return fail(
          `Invalid URL for ${String(entry.name)}. Use a full URL such as https://tools.example.com.`
        )
      }
    }
    return {
      id: checkId(entry.id, 'Instrument'),
      name: string(entry.name, 'Instrument name', 80),
      description: string(entry.description, 'Description'),
      category: entry.category,
      icon: icon(entry.icon),
      ...(validateNodeImage(entry.image) ? { image: validateNodeImage(entry.image) } : {}),
      url,
      tags: entry.tags.map((tag) => (tag as string).trim()),
      featured: entry.featured,
    }
  })
  return { version: 1, title: value.title.trim(), categories, sites }
}

export function searchSites(sites: Instrument[], query: string, categories: Category[] = []) {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean)
  return sites
    .filter((site) => {
      const categoryName = categories.find((category) => category.id === site.category)?.name || ''
      const content =
        `${site.name} ${site.description} ${site.tags.join(' ')} ${site.category} ${categoryName}`.toLocaleLowerCase()
      return terms.every((term) => content.includes(term))
    })
    .sort((a, b) => {
      if (!terms.length) return 0
      const rank = (site: Instrument) =>
        site.name.toLocaleLowerCase().startsWith(terms.join(' '))
          ? 0
          : terms.every((term) => site.name.toLocaleLowerCase().includes(term))
            ? 1
            : 2
      return rank(a) - rank(b)
    })
}

export function uniqueId(name: string, existing: string[]): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 55) || 'instrument'
  let id = base,
    counter = 2
  while (existing.includes(id)) id = `${base}-${counter++}`
  return id
}

export function downloadCatalog(catalog: Catalog) {
  const blob = new Blob([JSON.stringify(validateCatalog(catalog), null, 2) + '\n'], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'catalog.json'
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
