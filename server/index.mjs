import { createServer } from 'node:http'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { resolve, extname, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { createCatalogService } from './catalog.mjs'

const root = resolve(process.env.STATIC_DIR || 'dist')
const catalog = createCatalogService(resolve(process.env.CATALOG_PATH || 'public/catalog.json'))
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}
const server = createServer((req, res) => {
  void catalog.middleware(req, res, async () => {
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { Allow: 'GET, HEAD' })
        return res.end()
      }
      const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
      let file = resolve(root, `.${path}`)
      if (!file.startsWith(`${root}${sep}`) && file !== root) {
        res.writeHead(403)
        return res.end()
      }
      let info = await stat(file).catch(() => null)
      if (!info?.isFile()) {
        if (extname(path) || path.startsWith('/api/')) {
          res.writeHead(404)
          return res.end()
        }
        file = resolve(root, 'index.html')
        info = await stat(file)
      }
      res.writeHead(200, {
        'Content-Type': types[extname(file)] || 'application/octet-stream',
        'Content-Length': info.size,
        'Cache-Control': path.startsWith('/assets/')
          ? 'public, max-age=31536000, immutable'
          : 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      })
      if (req.method === 'HEAD') return res.end()
      await pipeline(createReadStream(file), res)
    } catch {
      if (!res.headersSent) res.writeHead(500)
      res.end()
    }
  })
})
server.listen(Number(process.env.PORT || 8080), process.env.HOST || '0.0.0.0', () => {
  console.log(`Astrolabe listening on port ${server.address().port}`)
})
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    catalog.close()
    server.close()
    server.closeIdleConnections()
  })
