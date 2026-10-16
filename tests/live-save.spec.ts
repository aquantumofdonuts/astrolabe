import { test as base, expect } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import seed from '../public/catalog.json' with { type: 'json' }

// Every test writes only to an isolated temporary catalog, never the checkout/deployment.
const test = base.extend<{ deployment: { url: string; file: string } }>({
  deployment: async ({}, use) => {
    const directory = await mkdtemp(join(tmpdir(), 'astrolabe-save-'))
    const file = join(directory, 'catalog.json')
    await writeFile(file, JSON.stringify(seed))
    const child = spawn(process.execPath, ['--experimental-strip-types', 'server/index.mjs'], {
      cwd: resolve('.'),
      env: { ...process.env, PORT: '0', HOST: '127.0.0.1', CATALOG_PATH: file },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    try {
      const port = await new Promise<string>((resolvePort, reject) => {
        const timeout = setTimeout(
          () => reject(new Error('Live-save test server did not start.')),
          10000
        )
        child.once('error', reject)
        child.once('exit', (code) => {
          clearTimeout(timeout)
          reject(new Error(`Server exited (${code}).`))
        })
        child.stdout.on('data', (data) => {
          const match = data.toString().match(/listening on port (\d+)/)
          if (match) {
            clearTimeout(timeout)
            resolvePort(match[1])
          }
        })
      })
      await use({ url: `http://127.0.0.1:${port}`, file })
    } finally {
      child.kill('SIGTERM')
      await new Promise<void>((resolveExit) => {
        if (child.exitCode !== null) return resolveExit()
        child.once('exit', () => resolveExit())
      })
      await rm(directory, { recursive: true, force: true })
    }
  },
})

test.use({ viewport: { width: 800, height: 900 } })

test('Save persists JSON and immediately updates two browsers, reloads, and local previews', async ({
  page,
  browser,
  deployment,
}) => {
  const observer = await browser.newContext({ viewport: { width: 800, height: 900 } })
  const second = await observer.newPage()
  try {
    await page.goto(deployment.url)
    await second.goto(deployment.url)
    await page.getByRole('button', { name: 'Catalog studio', exact: true }).click()
    const dialog = page.getByRole('dialog')
    const save = dialog.getByRole('button', { name: 'Save', exact: true })
    await expect(save).toBeEnabled()
    await dialog.getByLabel('Name', { exact: true }).fill('Saved Atlas')
    await dialog.getByRole('button', { name: 'Apply local preview', exact: true }).click()
    await expect(
      page.getByText('Local catalog preview · visible only in this browser')
    ).toBeVisible()
    await save.click()
    await expect(dialog.getByRole('status')).toContainText('shared catalog is live', {
      timeout: 15000,
    })
    await expect(
      page.getByText('Local catalog preview · visible only in this browser')
    ).toHaveCount(0)
    await expect(second.locator('.directory-card').filter({ hasText: 'Saved Atlas' })).toBeVisible()
    expect(JSON.parse(await readFile(deployment.file, 'utf8')).sites[0].name).toBe('Saved Atlas')
    await dialog.getByRole('button', { name: 'Close dialog' }).click()
    await page.reload()
    await expect(page.locator('.directory-card').filter({ hasText: 'Saved Atlas' })).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('astrolabe.catalog.v1'))).toBeNull()
  } finally {
    await observer.close()
  }
})

test('a stale draft is preserved and cannot overwrite a newer save', async ({
  page,
  browser,
  deployment,
}) => {
  const other = await browser.newContext({ viewport: { width: 800, height: 900 } })
  const second = await other.newPage()
  try {
    await page.goto(deployment.url)
    await second.goto(deployment.url)
    for (const target of [page, second]) {
      await target.getByRole('button', { name: 'Catalog studio', exact: true }).click()
      await expect(target.getByRole('button', { name: 'Save', exact: true })).toBeEnabled()
    }
    await page.getByLabel('Name', { exact: true }).fill('My unsaved draft')
    await second.getByLabel('Name', { exact: true }).fill('Another browser saved this')
    await second.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(second.getByRole('status')).toContainText('shared catalog is live')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('shared catalog changed')
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('My unsaved draft')
    expect(JSON.parse(await readFile(deployment.file, 'utf8')).sites[0].name).toBe(
      'Another browser saved this'
    )
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export', exact: true }).click()
    expect((await download).suggestedFilename()).toBe('catalog.json')
  } finally {
    await other.close()
  }
})

test('server errors preserve drafts and static hosting retains preview/import/export', async ({
  page,
  deployment,
}) => {
  await page.goto(deployment.url)
  await page.getByRole('button', { name: 'Catalog studio', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled()
  await page.getByLabel('Name', { exact: true }).fill('Keep this draft')
  await page.route('**/api/catalog', (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Disk is full. Export your draft.' }),
        })
      : route.continue()
  )
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Disk is full')
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Keep this draft')
  expect(JSON.parse(await readFile(deployment.file, 'utf8')).sites[0].name).toBe(seed.sites[0].name)
  await page.unroute('**/api/catalog')
  await page.route('**/api/catalog', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html>Static fallback' })
  )
  page.once('dialog', (dialog) => void dialog.accept())
  await page.reload()
  await page.getByRole('button', { name: 'Catalog studio', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Import', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeEnabled()
  await expect(page.getByRole('button', { name: 'Apply local preview', exact: true })).toBeEnabled()
})

test('live updates preserve browser previews and restore uses the latest shared file', async ({
  page,
  deployment,
}) => {
  await page.goto(deployment.url)
  await page.getByRole('button', { name: 'Catalog studio', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled()
  await page.getByLabel('Name', { exact: true }).fill('My private preview')
  await page.getByRole('button', { name: 'Apply local preview', exact: true }).click()
  await page.getByRole('button', { name: 'Close dialog' }).click()
  const changed = structuredClone(seed)
  changed.sites[0].name = 'Latest shared instrument'
  const refresh = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/catalog') &&
      response.request().method() === 'GET' &&
      response.status() === 200
  )
  await writeFile(deployment.file, JSON.stringify(changed))
  await refresh
  await expect(
    page.locator('.directory-card').filter({ hasText: 'My private preview' })
  ).toBeVisible()
  await page.getByRole('button', { name: 'Catalog studio', exact: true }).click()
  await page.getByRole('button', { name: 'Restore deployed catalog', exact: true }).click()
  await page.getByRole('button', { name: 'Restore catalog', exact: true }).click()
  await expect(
    page.locator('.directory-card').filter({ hasText: 'Latest shared instrument' })
  ).toBeVisible()
})

test('removing an open demo and its category applies safely without a reload', async ({
  page,
  deployment,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(deployment.url)
  await page.getByRole('button', { name: 'Catalog studio', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Close dialog' }).click()
  await page
    .getByRole('region', { name: 'Instrument directory' })
    .getByRole('button', { name: `Preview ${seed.sites[0].name} demo`, exact: true })
    .click()
  await expect(page.getByRole('dialog')).toBeVisible()
  const changed = structuredClone(seed)
  changed.categories = changed.categories.filter(
    (category) => category.id !== seed.sites[0].category
  )
  changed.sites = changed.sites.filter((site) => site.category !== seed.sites[0].category)
  await writeFile(deployment.file, JSON.stringify(changed))
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.directory-card')).toHaveCount(changed.sites.length)
  expect(errors).toEqual([])
})
