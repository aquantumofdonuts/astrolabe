import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCatalogService } from './catalog.mjs'

const seed = JSON.parse(await readFile(new URL('../public/catalog.json', import.meta.url), 'utf8'))
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'astrolabe-api-'))
  const file = join(directory, 'catalog.json')
  await writeFile(file, JSON.stringify(seed))
  const service = createCatalogService(file)
  const server = createServer(
    (req, res) =>
      void service.middleware(req, res, () => {
        res.writeHead(404)
        res.end()
      })
  )
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const url = `http://127.0.0.1:${server.address().port}`
  t.after(async () => {
    service.close()
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
    await rm(directory, { recursive: true, force: true })
  })
  const get = () => fetch(`${url}/api/catalog`).then((response) => response.json())
  const put = (catalog, revision, headers = {}) =>
    fetch(`${url}/api/catalog`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': revision, ...headers },
      body: JSON.stringify(catalog),
    })
  return { directory, file, url, get, put }
}

test('validates and persists a complete catalog, with no temporary files left behind', async (t) => {
  const { directory, file, url, get, put } = await fixture(t)
  const before = await get()
  const next = { ...seed, title: 'Live universe' }
  next.sites = seed.sites.map((site, index) =>
    index === 0
      ? {
          ...site,
          image:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
        }
      : site
  )
  const response = await put(next, before.revision)
  assert.equal(response.status, 200)
  const saved = await response.json()
  assert.notEqual(saved.revision, before.revision)
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')), next)
  const runtime = await fetch(`${url}/catalog.json`)
  assert.equal(runtime.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await runtime.json(), next)
  assert.deepEqual(await readdir(directory), ['catalog.json'])
})

test('rejects invalid, oversized, cross-origin, and unversioned writes without changing the file', async (t) => {
  const { file, url, get, put } = await fixture(t)
  const before = await get()
  const original = await readFile(file, 'utf8')
  assert.equal(
    (
      await put(
        { ...seed, sites: [{ ...seed.sites[0], url: 'javascript:alert(1)' }] },
        before.revision
      )
    ).status,
    400
  )
  assert.equal(
    (await put(seed, before.revision, { Origin: 'https://elsewhere.example' })).status,
    403
  )
  assert.equal((await put(seed, before.revision, { 'Sec-Fetch-Site': 'cross-site' })).status, 403)
  assert.equal((await put(seed, before.revision, { 'Content-Type': 'text/plain' })).status, 415)
  assert.equal(
    (
      await fetch(`${url}/api/catalog`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
    ).status,
    428
  )
  assert.equal(
    (
      await fetch(`${url}/api/catalog`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'If-Match': before.revision },
        body: 'x'.repeat(28 * 1024 * 1024 + 1),
      })
    ).status,
    413
  )
  assert.equal(await readFile(file, 'utf8'), original)
})

test('serializes simultaneous saves and detects external changes before overwriting them', async (t) => {
  const { file, get, put } = await fixture(t)
  const before = await get()
  const results = await Promise.all([
    put({ ...seed, title: 'First writer' }, before.revision),
    put({ ...seed, title: 'Second writer' }, before.revision),
  ])
  assert.deepEqual(results.map((response) => response.status).sort(), [200, 409])
  const current = await get()
  await writeFile(file, JSON.stringify({ ...seed, title: 'External edit' }))
  assert.equal((await put(seed, current.revision)).status, 409)
  assert.equal((await get()).catalog.title, 'External edit')
})

test(
  'signals initial state, saves, and valid external file edits over SSE',
  { timeout: 5000 },
  async (t) => {
    const { file, url, get, put } = await fixture(t)
    const controller = new AbortController()
    t.after(() => controller.abort())
    const response = await fetch(`${url}/api/catalog/events`, { signal: controller.signal })
    assert.equal(response.headers.get('content-type'), 'text/event-stream')
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffered = ''
    const nextRevision = async () => {
      for (;;) {
        const end = buffered.indexOf('\n\n')
        if (end >= 0) {
          const event = buffered.slice(0, end)
          buffered = buffered.slice(end + 2)
          if (event.startsWith('data: ')) return JSON.parse(event.slice(6))
        } else {
          const result = await reader.read()
          assert.equal(result.done, false)
          buffered += decoder.decode(result.value)
        }
      }
    }
    const initial = await nextRevision()
    assert.equal(initial, (await get()).revision)
    const saved = await (await put({ ...seed, title: 'Broadcast save' }, initial)).json()
    assert.equal(await nextRevision(), saved.revision)
    // Drain any duplicate file-watch signal before waiting for the external edit.
    await writeFile(file, JSON.stringify({ ...seed, title: 'External live edit' }))
    const changed = (await get()).revision
    let signaled
    do {
      signaled = await nextRevision()
    } while (signaled !== changed)
    assert.notEqual(signaled, saved.revision)
    controller.abort()
  }
)
