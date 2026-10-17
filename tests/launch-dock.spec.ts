import { expect, test } from '@playwright/test'
import seed from '../public/catalog.json' with { type: 'json' }
import formats from './fixtures/thumbnail-formats.json' with { type: 'json' }

test('dock launches before the scene loads, preserves favorite order, and works in Directory', async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem('astrolabe.favorites.v1', JSON.stringify(['atlas', 'sentinel', 'pulse']))
  )
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(/\/src\/components\/Observatory\.tsx/, async (route) => {
    await gate
    await route.continue().catch(() => {})
  })
  try {
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const dock = page.getByRole('region', { name: 'Quick launch' })
    await expect(dock).toBeVisible()
    await expect(page.locator('.scene-loading')).toBeVisible()
    await expect(dock.locator('.dock-tools .dock-tool-name')).toHaveText([
      'Atlas',
      'Sentinel',
      'Pulse',
    ])
    await dock.getByRole('button', { name: 'Arrange favorites' }).click()
    await dock.getByRole('button', { name: 'Move Sentinel earlier' }).click()
    await expect(dock.locator('.dock-tools .dock-tool-name')).toHaveText([
      'Sentinel',
      'Atlas',
      'Pulse',
    ])
    await dock.getByRole('button', { name: 'Finish arranging favorites' }).click()
    await dock.getByRole('button', { name: 'Preview Atlas demo' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Open Directory', exact: true }).click()
    await expect(dock).toBeVisible()
    await expect(dock.locator('.dock-tools .dock-tool-name')).toHaveText([
      'Sentinel',
      'Atlas',
      'Pulse',
    ])
    expect(
      await page.evaluate(() => JSON.parse(localStorage.getItem('astrolabe.favorites.v1')!))
    ).toEqual(['sentinel', 'atlas', 'pulse'])
  } finally {
    release()
  }
})

test('search launches by name or Enter, while inspection is an explicit separate action', async ({
  page,
  context,
}) => {
  const catalog = structuredClone(seed)
  catalog.sites[0].url = 'https://tools.example.test/sentinel' as never
  await page.addInitScript((catalog) => {
    localStorage.setItem('astrolabe.catalog.v1', JSON.stringify(catalog))
    localStorage.setItem('astrolabe.economical', 'true')
  }, catalog)
  await context.route('https://tools.example.test/**', (route) =>
    route.fulfill({ body: '<title>Tool</title>' })
  )
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const search = page.getByRole('combobox', { name: 'Search instruments' })
  await search.fill('sentienl')
  await expect(page.locator('.search-result-primary')).toContainText(catalog.sites[0].description)
  await expect(page.locator('.inspector')).toBeHidden()
  const popup = page.waitForEvent('popup')
  await page.locator('.search-result-primary').click()
  const opened = await popup
  await expect(opened).toHaveURL('https://tools.example.test/sentinel')
  await opened.close()
  await search.click()
  const keyboardPopup = page.waitForEvent('popup')
  await search.press('Enter')
  const keyboardOpened = await keyboardPopup
  await expect(keyboardOpened).toHaveURL('https://tools.example.test/sentinel')
  await keyboardOpened.close()
  await search.click()
  await page.getByRole('button', { name: 'Inspect Sentinel', exact: true }).click()
  await expect(page.locator('.inspector')).toBeVisible()
})

test('an image on every destination remains selectable and the dock fits a compact viewport', async ({
  page,
}) => {
  test.setTimeout(60000)
  const catalog = structuredClone(seed) as typeof seed & {
    sites: ((typeof seed.sites)[number] & { image?: string })[]
  }
  const image = `data:image/png;base64,${formats.png.data}`
  catalog.sites.forEach((site) => {
    site.image = image
  })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.addInitScript((catalog) => {
    localStorage.setItem('astrolabe.catalog.v1', JSON.stringify(catalog))
    localStorage.setItem('astrolabe.economical', 'true')
  }, catalog)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/')
  await expect(page.locator('.scene-experience')).toHaveAttribute('data-scene-state', 'ready', {
    timeout: 30000,
  })
  await expect(page.locator('.orbital-node:visible')).toHaveCount(catalog.sites.length)
  await page.getByRole('button', { name: 'Select Sentinel', exact: true }).click()
  await expect(page.locator('.inspector')).toBeVisible()
  const dock = page.getByRole('region', { name: 'Quick launch' })
  const box = (await dock.boundingBox())!
  expect(box.y + box.height).toBeLessThanOrEqual(720)
  await expect(dock.locator('.dock-emblem img')).toHaveCount(
    catalog.sites.filter((site) => site.featured).length
  )
  await dock.getByRole('button', { name: 'Arrange favorites' }).click()
  const editingBox = (await dock.boundingBox())!
  const controls = (await page.locator('.scene-controls').boundingBox())!
  expect(controls.y + controls.height).toBeLessThanOrEqual(editingBox.y)
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click({ trial: true })
  await dock.getByRole('button', { name: 'Finish arranging favorites' }).click()
  await page.getByRole('button', { name: 'Close instrument details' }).click()
  await page.getByRole('button', { name: 'Reset camera', exact: true }).click()
  await page.getByRole('button', { name: 'Expand astrolabe', exact: true }).click()
  await expect
    .poll(() =>
      page.locator('.orbital-node').evaluateAll((elements) =>
        elements
          .filter((element) => {
            const rect = element.getBoundingClientRect()
            const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
            return !hit || !element.contains(hit)
          })
          .map((element) => element.textContent)
      )
    )
    .toEqual([])
  await page.screenshot({ path: '/tmp/astrolabe-logo-launchpad.png' })
  expect(errors).toEqual([])
})

test('keyboard search keeps the active result visible without scrolling the page', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Directory', exact: true }).click()
  await page
    .getByRole('region', { name: 'Quick launch' })
    .getByRole('button', { name: 'Search all tools' })
    .click()
  const search = page.getByRole('combobox', { name: 'Search instruments' })
  const scroll = await page.evaluate(() => window.scrollY)
  for (let i = 1; i < seed.sites.length; i++) await search.press('ArrowDown')
  const visibility = await page
    .locator('[role="option"][aria-selected="true"]')
    .evaluate((option) => {
      const row = option.getBoundingClientRect()
      const list = option.parentElement!.getBoundingClientRect()
      return row.top >= list.top - 1 && row.bottom <= list.bottom + 1
    })
  expect(visibility).toBe(true)
  expect(await page.evaluate(() => window.scrollY)).toBe(scroll)
  await search.press('Enter')
  await expect(page.getByRole('dialog')).toContainText(seed.sites.at(-1)!.name)
})
