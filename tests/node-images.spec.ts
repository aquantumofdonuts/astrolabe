import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import formats from './fixtures/thumbnail-formats.json' with { type: 'json' }

const imageInput = 'Upload destination image'
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => localStorage.setItem('astrolabe.economical', 'true'))
  await page.goto('/')
  await page.getByRole('button', { name: 'Catalog studio', exact: true }).click()
})

test('normalizes common thumbnails, rejects invalid uploads, and retains the last good image', async ({
  page,
}) => {
  test.setTimeout(60000)
  const dialog = page.getByRole('dialog')
  for (const [extension, fixture] of Object.entries(formats)) {
    await dialog.getByLabel(imageInput, { exact: true }).setInputFiles({
      name: `icon.${extension}`,
      mimeType: fixture.mime,
      buffer: Buffer.from(fixture.data, 'base64'),
    })
    await expect(dialog.getByRole('status')).toContainText('Image ready')
    const image = dialog.getByRole('img', { name: 'Sentinel destination image', exact: true })
    await expect(image).toHaveJSProperty('naturalWidth', 512)
    expect((await image.getAttribute('src'))!.length).toBeLessThanOrEqual(128 * 1024)
  }
  await dialog.getByLabel(imageInput, { exact: true }).setInputFiles('tests/fixtures/too-wide.png')
  await expect(dialog.getByRole('alert')).toContainText('8192')
  const previous = await dialog
    .getByRole('img', { name: 'Sentinel destination image', exact: true })
    .getAttribute('src')
  for (const fixture of [
    { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not an image') },
    { name: 'script.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg/>') },
    { name: 'huge.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(10 * 1024 * 1024 + 1) },
  ]) {
    await dialog.getByLabel(imageInput, { exact: true }).setInputFiles(fixture)
    await expect(dialog.getByRole('alert')).toBeVisible()
    expect(
      await dialog
        .getByRole('img', { name: 'Sentinel destination image', exact: true })
        .getAttribute('src')
    ).toBe(previous)
  }
})

test('assigns an image to a station, persists and exports it, reuses it, and restores its original model', async ({
  page,
}) => {
  test.setTimeout(60000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  const dialog = page.getByRole('dialog')
  await dialog.locator('.studio-entry').filter({ hasText: 'Pulse' }).click()
  await dialog.getByLabel(imageInput, { exact: true }).setInputFiles('tests/fixtures/node-icon.png')
  await expect(dialog.getByRole('status')).toContainText('Image ready')
  const normalized = await dialog
    .getByRole('img', { name: 'Pulse destination image', exact: true })
    .getAttribute('src')
  await dialog.getByRole('button', { name: 'Apply local preview', exact: true }).click()
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await page.reload()
  const saved = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem('astrolabe.catalog.v1')!).sites.find(
        (site: { id: string }) => site.id === 'pulse'
      ).image
  )
  expect(saved).toBe(normalized)
  await page.getByRole('button', { name: 'Select Pulse', exact: true }).click()
  await page.getByRole('button', { name: 'Recenter selected instrument' }).click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: '/tmp/astrolabe-image-beacon.png' })
  await expect(page.getByRole('button', { name: 'Select Pulse', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Catalog studio', exact: true }).click()
  await dialog.locator('.studio-entry').filter({ hasText: 'Sentinel' }).click()
  await dialog.getByLabel('Use another node’s image', { exact: true }).selectOption('pulse')
  await expect(
    dialog.getByRole('img', { name: 'Sentinel destination image', exact: true })
  ).toHaveAttribute('src', normalized!)
  const downloading = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Export', exact: true }).click()
  const download = await downloading
  const bytes = await readFile((await download.path())!)
  const exported = JSON.parse(bytes.toString())
  expect(exported.sites.find((site: { id: string }) => site.id === 'pulse').image).toBe(normalized)
  await dialog
    .getByLabel('Import catalog', { exact: true })
    .setInputFiles({ name: 'catalog.json', mimeType: 'application/json', buffer: bytes })
  await dialog.locator('.studio-entry').filter({ hasText: 'Pulse' }).click()
  await dialog.getByRole('button', { name: 'Remove destination image', exact: true }).click()
  await expect(
    dialog.getByRole('img', { name: 'Pulse destination image', exact: true })
  ).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Apply local preview', exact: true }).click()
  await dialog.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await page.getByRole('button', { name: 'Select Pulse', exact: true }).click()
  await page.getByRole('button', { name: 'Recenter selected instrument' }).click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: '/tmp/astrolabe-restored-station.png' })
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('astrolabe.catalog.v1')!).sites.find(
          (site: { id: string }) => site.id === 'pulse'
        ).image
    )
  ).toBeUndefined()
  expect(errors).toEqual([])
})

test('reports session-only image previews when browser storage is full', async ({ page }) => {
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel(imageInput, { exact: true }).setInputFiles('tests/fixtures/node-icon.png')
  await expect(dialog.getByRole('status')).toContainText('Image ready')
  await page.evaluate(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'astrolabe.catalog.v1')
        throw new DOMException('Storage full', 'QuotaExceededError')
      return original.call(this, key, value)
    }
  })
  await dialog.getByRole('button', { name: 'Apply local preview', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('session only')
  await expect(dialog.getByRole('status')).toContainText('export')
  const downloading = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Export', exact: true }).click()
  const exported = JSON.parse(await readFile((await (await downloading).path())!, 'utf8'))
  expect(exported.sites[0].image).toMatch(/^data:image\/webp;base64,/)
})
