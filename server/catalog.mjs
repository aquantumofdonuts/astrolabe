import { createHash, randomUUID } from 'node:crypto'
import { watch } from 'node:fs'
import { open, readFile, rename, stat, unlink } from 'node:fs/promises'
import { dirname, basename, join } from 'node:path'
import { validateCatalog } from '../src/lib/catalog.ts'
import { MAX_CATALOG_BYTES } from '../src/lib/nodeImages.ts'

const revisionOf = (text) => `"${createHash('sha256').update(text).digest('hex')}"`
const failure = (status, message) => Object.assign(new Error(message), { status })

// Shared by Vite and the production server. Writes are serialized and atomically replaced.
export function createCatalogService(file) {
  const clients = new Set()
  let pending = Promise.resolve()
  let watcher
  let debounce
  let closed = false
  const read = async () => {
    if ((await stat(file)).size > MAX_CATALOG_BYTES) throw failure(413, 'Catalog exceeds 28 MB.')
    const text = await readFile(file, 'utf8')
    return { catalog: validateCatalog(JSON.parse(text)), revision: revisionOf(text) }
  }
  const send = (client, revision) => client.write(`data: ${JSON.stringify(revision)}\n\n`)
  const broadcast = async () => {
    try {
      const { revision } = await read()
      for (const client of clients) send(client, revision)
    } catch {
      // An invalid external edit must not replace a valid catalog in open clients.
    }
  }
  const startWatcher = () => {
    if (watcher || closed) return
    try {
      watcher = watch(dirname(file), (_event, name) => {
        if (name && String(name) !== basename(file)) return
        clearTimeout(debounce)
        debounce = setTimeout(broadcast, 100)
      })
      watcher.on('error', () => {
        watcher?.close()
        watcher = undefined
      })
    } catch {
      /* Saves still broadcast when file watching is unavailable. */
    }
  }
  const json = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(body))
  }
  const save = async (catalog, expected) => {
    const current = await read()
    if (expected !== current.revision)
      throw failure(
        409,
        'The shared catalog changed. Export your draft, then restore the deployed catalog and merge your changes before saving.'
      )
    const text = `${JSON.stringify(catalog, null, 2)}\n`
    if (Buffer.byteLength(text) > MAX_CATALOG_BYTES) throw failure(413, 'Catalog exceeds 28 MB.')
    const temporary = join(dirname(file), `.${basename(file)}.${randomUUID()}.tmp`)
    let handle
    try {
      const { mode } = await stat(file)
      handle = await open(temporary, 'wx', mode & 0o777)
      await handle.writeFile(text)
      await handle.sync()
      await handle.close()
      handle = undefined
      await rename(temporary, file)
    } finally {
      await handle?.close()
      await unlink(temporary).catch(() => {})
    }
    const revision = revisionOf(text)
    for (const client of clients) send(client, revision)
    return { catalog, revision }
  }
  const middleware = async (req, res, next) => {
    const path = new URL(req.url, 'http://localhost').pathname
    if (!['/catalog.json', '/api/catalog', '/api/catalog/events'].includes(path)) return next()
    try {
      if (path === '/api/catalog/events' && req.method === 'GET') {
        const { revision } = await read()
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-store',
          'X-Accel-Buffering': 'no',
          Connection: 'keep-alive',
        })
        res.write('retry: 2000\n\n')
        send(res, revision)
        clients.add(res)
        startWatcher()
        const heartbeat = setInterval(() => res.write(': keepalive\n\n'), 15000)
        res.on('close', () => {
          clearInterval(heartbeat)
          clients.delete(res)
        })
        return
      }
      if (req.method === 'GET' || req.method === 'HEAD') {
        const result = await read()
        res.setHeader('ETag', result.revision)
        return json(
          res,
          200,
          req.method === 'HEAD' ? undefined : path === '/catalog.json' ? result.catalog : result
        )
      }
      if (path !== '/api/catalog' || req.method !== 'PUT') {
        res.setHeader('Allow', path === '/api/catalog' ? 'GET, HEAD, PUT' : 'GET, HEAD')
        throw failure(405, 'Method not allowed.')
      }
      // JSON plus same-origin checks prevent a third-party page from submitting writes.
      const origin = req.headers.origin
      if (
        req.headers['sec-fetch-site'] === 'cross-site' ||
        (origin && new URL(origin).host !== req.headers.host)
      )
        throw failure(403, 'Save requests must come from this application.')
      if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json')
        throw failure(415, 'Send an application/json catalog.')
      if (!req.headers['if-match']) throw failure(428, 'Reload the catalog before saving.')
      if (Number(req.headers['content-length']) > MAX_CATALOG_BYTES)
        throw failure(413, 'Catalog exceeds 28 MB.')
      const chunks = []
      let bytes = 0
      for await (const chunk of req) {
        bytes += chunk.length
        if (bytes > MAX_CATALOG_BYTES) throw failure(413, 'Catalog exceeds 28 MB.')
        chunks.push(chunk)
      }
      let catalog
      try {
        catalog = validateCatalog(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch (error) {
        throw failure(400, error.message)
      }
      const operation = pending.then(() => save(catalog, req.headers['if-match']))
      pending = operation.catch(() => {})
      json(res, 200, await operation)
    } catch (error) {
      if (res.headersSent) return res.end()
      const status = error.status || 500
      if (status === 500) console.error('Catalog service:', error)
      json(res, status, {
        error:
          status === 500
            ? 'Could not write or read the shared catalog. Check server file permissions and try again; your draft is still available to export.'
            : error.message,
      })
    }
  }
  return {
    middleware,
    close() {
      closed = true
      clearTimeout(debounce)
      watcher?.close()
      for (const client of clients) client.end()
      clients.clear()
    },
  }
}
