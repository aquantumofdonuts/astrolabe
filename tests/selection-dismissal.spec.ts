import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => localStorage.setItem('astrolabe.economical', 'true'))
  await page.goto('/')
})

test('Directory closes details even with a search active, and returning does not restore selection', async ({
  page,
}) => {
  const inspector = page.getByRole('complementary', { name: 'Selected instrument' })
  const search = page.getByRole('combobox', { name: 'Search instruments' })
  const directory = page.getByRole('button', { name: 'Directory', exact: true })
  await expect(page.locator('canvas')).toHaveAttribute('data-camera-moving', 'false')
  await search.fill('Sentinel')
  await page.getByRole('button', { name: 'Inspect Sentinel', exact: true }).click()
  await expect(inspector).toBeVisible()
  await page.mouse.click(8, 8) // Dismiss the popover without clearing the query or selection.
  await directory.click()
  await expect(inspector).toBeHidden()
  await expect(search).toHaveValue('Sentinel')
  await expect(page.locator('.directory-card.selected')).toHaveCount(0)

  await search.fill('Pulse')
  await expect(inspector).toBeHidden()
  await page.locator('.directory-select').click()
  await expect(inspector.getByRole('heading', { name: 'Pulse', exact: true })).toBeVisible()
  await directory.click()
  await expect(inspector).toBeHidden()
  await page.getByRole('button', { name: 'Astrolabe', exact: true }).click()
  await expect(page.locator('canvas')).toHaveAttribute('data-camera-moving', 'false')
  await expect(inspector).toBeHidden()
  await expect(page.locator('.projected-label[data-selection-active="true"]')).toHaveCount(0)
})

test('category, collection, empty search, and home navigation dismiss old instrument details', async ({
  page,
}) => {
  const inspector = page.getByRole('complementary', { name: 'Selected instrument' })
  const search = page.getByRole('combobox', { name: 'Search instruments' })
  for (const destination of ['category', 'favorites', 'recent', 'empty search', 'home']) {
    await search.fill('Sentinel')
    await page.getByRole('button', { name: 'Inspect Sentinel', exact: true }).click()
    await expect(inspector).toBeVisible()
    if (destination === 'category')
      await page
        .locator('.category-nav')
        .getByRole('button', { name: /Automate/ })
        .click()
    else if (destination === 'favorites')
      await page.getByRole('button', { name: /^Favorites/ }).click()
    else if (destination === 'recent')
      await page.getByRole('button', { name: /^Recently launched/ }).click()
    else if (destination === 'empty search') await search.fill('no-such-instrument')
    else await page.getByRole('link', { name: 'Astrolabe home' }).click()
    await expect(inspector).toBeHidden()
    await expect(page.locator('.orbital-node[aria-pressed="true"]')).toHaveCount(0)
    await search.fill('')
    await page.getByRole('button', { name: /^All instruments/ }).click()
  }
})

test('mobile dismissal clears selection and cannot leave a stale dialog open for later searches', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  const directory = page.getByRole('button', { name: 'Directory', exact: true })
  await page.locator('.directory-select').first().click()
  await expect(page.getByRole('dialog', { name: 'Sentinel', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.directory-card.selected')).toHaveCount(0)
  const search = page.getByRole('combobox', { name: 'Search instruments' })
  await search.fill('Pulse')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.locator('.directory-select').click()
  await expect(page.getByRole('dialog', { name: 'Pulse', exact: true })).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'network', exact: true }).click()
  await expect(directory).toHaveClass('active')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.directory-card.selected')).toHaveCount(0)
})

test('removing the selected instrument or restoring the catalog closes details without selecting a replacement', async ({
  page,
}) => {
  const inspector = page.getByRole('complementary', { name: 'Selected instrument' })
  const search = page.getByRole('combobox', { name: 'Search instruments' })
  await search.fill('Sentinel')
  await page.getByRole('button', { name: 'Inspect Sentinel', exact: true }).click()
  await expect(inspector).toBeVisible()
  await search.fill('')
  await page.getByRole('button', { name: 'Catalog studio', exact: true }).click()
  const studio = page.getByRole('dialog', { name: 'Catalog studio', exact: true })
  await studio.getByRole('button', { name: 'Remove instrument', exact: true }).click()
  await studio.getByRole('button', { name: 'Remove', exact: true }).click()
  await studio.getByRole('button', { name: 'Apply local preview', exact: true }).click()
  await studio.getByRole('button', { name: 'Close dialog' }).click()
  await expect(inspector).toBeHidden()
  await search.fill('Pulse')
  await page.getByRole('button', { name: 'Inspect Pulse', exact: true }).click()
  await expect(inspector).toBeVisible()
  await search.fill('')
  await page.getByRole('button', { name: 'Catalog studio', exact: true }).click()
  await studio.getByRole('button', { name: 'Restore deployed catalog', exact: true }).click()
  await studio.getByRole('button', { name: 'Restore catalog', exact: true }).click()
  await expect(studio).toHaveCount(0)
  await expect(inspector).toBeHidden()
  await expect(page.locator('.orbital-node[aria-pressed="true"]')).toHaveCount(0)
})

test('empty-space clicks dismiss inspection, while body clicks and camera drags retain it', async ({
  page,
}) => {
  const canvas = page.locator('canvas')
  const inspector = page.getByRole('complementary', { name: 'Selected instrument' })
  await page.getByRole('button', { name: 'Select Sentinel', exact: true }).click()
  await expect(inspector).toBeVisible()
  await expect(canvas).toHaveAttribute('data-camera-moving', 'false')
  let bounds = (await canvas.boundingBox())!
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await expect(inspector).toBeVisible()
  await expect(canvas).toHaveAttribute('data-camera-moving', 'false')
  bounds = (await canvas.boundingBox())!
  const blank = { x: bounds.x + 24, y: bounds.y + bounds.height / 2 }
  await page.mouse.move(blank.x, blank.y)
  await page.mouse.down()
  await page.mouse.move(blank.x + 60, blank.y + 20, { steps: 6 })
  await page.mouse.up()
  await expect(inspector).toBeVisible()
  const pose = await canvas.getAttribute('data-camera-position')
  await page.mouse.click(blank.x, blank.y)
  await expect(inspector).toBeHidden()
  await expect(page.locator('.orbital-node[aria-pressed="true"]')).toHaveCount(0)
  expect(await canvas.getAttribute('data-camera-position')).toBe(pose)
  await expect(page.getByRole('region', { name: 'Free-flight camera', exact: true })).toBeFocused()
})

test('phone inspection survives pinch gestures and closes on an empty-space tap', async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    reducedMotion: 'reduce',
  })
  try {
    const phone = await context.newPage()
    await phone.addInitScript(() => localStorage.setItem('astrolabe.economical', 'true'))
    await phone.goto('/')
    await phone.getByRole('button', { name: 'Astrolabe', exact: true }).click()
    await phone.getByRole('button', { name: 'Inspect Sentinel', exact: true }).click()
    const inspector = phone.getByRole('complementary', { name: 'Selected instrument' })
    await expect(inspector).toBeVisible()
    const canvas = phone.locator('canvas')
    await expect(canvas).toHaveAttribute('data-camera-moving', 'false')
    const bounds = (await canvas.boundingBox())!
    const y = bounds.y + bounds.height / 2
    const before = await canvas.getAttribute('data-camera-position')
    const cdp = await context.newCDPSession(phone)
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 })
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { id: 1, x: bounds.x + 40, y },
        { id: 2, x: bounds.x + 100, y },
      ],
    })
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { id: 1, x: bounds.x + 32, y: y + 8 },
        { id: 2, x: bounds.x + 112, y: y + 8 },
      ],
    })
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [{ id: 1, x: bounds.x + 32, y: y + 8 }],
    })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await expect(canvas).not.toHaveAttribute('data-camera-position', before!)
    await expect(inspector).toBeVisible()
    await phone.touchscreen.tap(bounds.x + 24, bounds.y + bounds.height / 2)
    await expect(inspector).toBeHidden()
    await expect(phone.getByRole('dialog')).toHaveCount(0)
  } finally {
    await context.close()
  }
})
