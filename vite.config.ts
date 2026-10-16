import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { createCatalogService } from './server/catalog.mjs'

export default defineConfig({
  // The catalog service sends live updates; Vite must not reload away unsaved drafts.
  server: { watch: { ignored: [resolve(process.env.CATALOG_PATH || 'public/catalog.json')] } },
  plugins: [
    react(),
    {
      name: 'live-catalog',
      configureServer(server) {
        const service = createCatalogService(
          resolve(process.env.CATALOG_PATH || 'public/catalog.json')
        )
        server.middlewares.use(service.middleware)
        server.httpServer?.on('close', () => service.close())
      },
    },
  ],
})
