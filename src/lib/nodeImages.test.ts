import { describe, expect, it } from 'vitest'
import { MAX_IMAGE_DATA_LENGTH, validateNodeImage } from './nodeImages'
import { validateCatalog } from './catalog'
import seed from '../../public/catalog.json'

const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='
describe('portable node images', () => {
  it('preserves images through validation and leaves older catalogs unchanged', () => {
    const catalog = validateCatalog(seed)
    expect(catalog.sites[0].image).toBeUndefined()
    catalog.sites[1].image = png
    expect(validateCatalog(JSON.parse(JSON.stringify(catalog))).sites[1].image).toBe(png)
    catalog.sites[1].image = undefined
    expect(validateCatalog(catalog).sites[1].image).toBeUndefined()
  })
  it.each([
    'https://example.com/logo.png',
    'blob:local-image',
    'data:image/svg+xml;base64,PHN2Zz4=',
    'data:text/html;base64,PHN2Zz4=',
    'data:image/webp;base64,aGVsbG8=',
    'data:image/png;base64,@@@@',
    `data:image/png;base64,${'A'.repeat(MAX_IMAGE_DATA_LENGTH)}`,
  ])('rejects unsupported or oversized image data', (value) => {
    expect(() => validateNodeImage(value)).toThrow()
  })
})
