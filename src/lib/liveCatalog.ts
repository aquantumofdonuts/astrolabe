import { validateCatalog, type Catalog } from './catalog'

export type SharedCatalog = { catalog: Catalog; revision: string }
export const catalogApi = `${import.meta.env.BASE_URL}api/catalog`

export async function readSharedCatalog(signal?: AbortSignal): Promise<SharedCatalog> {
  const response = await fetch(catalogApi, { cache: 'no-store', signal })
  if (!response.ok) throw new Error('Live saving is unavailable on this server.')
  const data = await response.json()
  if (typeof data.revision !== 'string')
    throw new Error('Live saving is unavailable on this server.')
  return { catalog: validateCatalog(data.catalog), revision: data.revision }
}

export async function saveSharedCatalog(
  catalog: Catalog,
  revision: string
): Promise<SharedCatalog> {
  const response = await fetch(catalogApi, {
    method: 'PUT',
    signal: AbortSignal.timeout(30000),
    headers: { 'Content-Type': 'application/json', 'If-Match': revision },
    body: JSON.stringify(catalog),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(
      data?.error || `Save failed (${response.status}). Your draft is still available to export.`
    )
  }
  const data = await response.json()
  if (typeof data.revision !== 'string')
    throw new Error(
      'The server returned an invalid save response. Reload to check the shared catalog.'
    )
  return { catalog: validateCatalog(data.catalog), revision: data.revision }
}
