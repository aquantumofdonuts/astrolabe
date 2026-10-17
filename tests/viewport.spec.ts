import { expect, test } from '@playwright/test'
import seed from '../public/catalog.json' with { type: 'json' }

for (const preview of [false, true]) {
  test(`view tabs keep their position on every switch at all sizes (${preview ? 'preview' : 'deployed'})`, async ({
    page,
  }) => {
    test.setTimeout(60000)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.addInitScript(
      ({ catalog, preview }) => {
        if (preview) localStorage.setItem('astrolabe.catalog.v1', JSON.stringify(catalog))
        localStorage.setItem('astrolabe.economical', 'true')
      },
      { catalog: seed, preview }
    )
    for (const width of [1440, 960, 390]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      const tabs = page.locator('.view-tabs')
      await expect(tabs).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      await expect(page.locator('.app-shell')).toHaveCSS('padding', '0px')
      const before = (await tabs.boundingBox())!
      expect(before.x + before.width).toBeGreaterThan(width - 40)
      await page.getByRole('button', { name: 'Catalog studio', exact: true }).click({ trial: true })
      for (const view of ['Directory', 'Astrolabe', 'Directory', 'Astrolabe']) {
        await page.getByRole('button', { name: view, exact: true }).click()
        const after = (await tabs.boundingBox())!
        expect(after).toEqual(before)
        await expect(tabs).toHaveCSS('opacity', '1')
      }
    }
  })
}

test('expanded Astrolabe fills the viewport, hides surrounding UI, and restores it on exit', async ({
  page,
}) => {
  test.setTimeout(60000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript((catalog) => {
    localStorage.setItem('astrolabe.catalog.v1', JSON.stringify(catalog))
    localStorage.setItem('astrolabe.economical', 'true')
  }, seed)
  for (const [width, height] of [
    [1440, 960],
    [960, 720],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height })
    await page.goto('/')
    if (width < 900) await page.getByRole('button', { name: 'Astrolabe', exact: true }).click()
    await expect(page.locator('.scene-experience')).toHaveAttribute('data-scene-state', 'ready', {
      timeout: 30000,
    })
    await page.getByRole('button', { name: 'Expand astrolabe', exact: true }).click()
    for (const selector of [
      '.topbar',
      '.sidebar',
      '.view-toolbar',
      '.launch-dock',
      '.local-preview-banner',
      '.mobile-scene-directory',
    ])
      await expect(page.locator(selector)).toBeHidden()
    await expect
      .poll(() =>
        page.locator('canvas').evaluate((el) => {
          const box = el.getBoundingClientRect()
          return { x: box.x, y: box.y, width: box.width, height: box.height }
        })
      )
      .toEqual({ x: 0, y: 0, width, height })
    await page.getByRole('button', { name: 'Reset camera', exact: true }).click({ trial: true })
    await page
      .getByRole('button', { name: 'Exit expanded view', exact: true })
      .click({ trial: true })
    await page.screenshot({ path: `/tmp/astrolabe-fullscreen-${width}.png` })
    if (width === 960) await page.keyboard.press('Escape')
    else await page.getByRole('button', { name: 'Exit expanded view', exact: true }).click()
    for (const selector of [
      '.topbar',
      '.sidebar',
      '.view-toolbar',
      '.launch-dock',
      '.local-preview-banner',
    ])
      await expect(page.locator(selector)).toBeVisible()
  }
})

test('mobile preview notice, catalog editing, and the launchpad remain reachable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(
    (catalog) => localStorage.setItem('astrolabe.catalog.v1', JSON.stringify(catalog)),
    seed
  )
  await page.goto('/')
  await expect(page.locator('.local-preview-banner')).toBeVisible()
  const banner = (await page.locator('.local-preview-banner').boundingBox())!
  const studio = (await page
    .getByRole('button', { name: 'Catalog studio', exact: true })
    .boundingBox())!
  expect(studio.y + studio.height).toBeLessThanOrEqual(banner.y)
  await page.getByRole('button', { name: 'Catalog studio', exact: true }).click({ trial: true })
  const dock = (await page.getByRole('region', { name: 'Quick launch' }).boundingBox())!
  expect(dock.y + dock.height).toBeLessThanOrEqual(844)
  await page.screenshot({ path: '/tmp/astrolabe-mobile-preview-final.png' })
})

test('camera controls stay inside desktop, scaled, short, and mobile viewports', async ({
  page,
}) => {
  test.setTimeout(60000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => localStorage.setItem('astrolabe.economical', 'true'))
  for (const [width, height] of [
    [1920, 969],
    [1536, 774],
    [1280, 650],
    [1080, 720],
    [390, 844],
  ]) {
    await page.setViewportSize({ width, height })
    await page.goto('/')
    if (width < 900) await page.getByRole('button', { name: 'Astrolabe', exact: true }).click()
    await expect(page.locator('canvas')).toHaveAttribute('data-camera-moving', 'false')
    await page.evaluate(() => document.fonts.ready)
    const metrics = await page.evaluate(() => {
      const root = document.documentElement
      const controls = document.querySelector('.scene-controls')!.getBoundingClientRect()
      return {
        width: root.clientWidth,
        height: root.clientHeight,
        scrollWidth: root.scrollWidth,
        scrollHeight: root.scrollHeight,
        controls: controls.toJSON(),
      }
    })
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width)
    if (width > 760) expect(metrics.scrollHeight).toBeLessThanOrEqual(height + 1)
    expect(metrics.controls.bottom).toBeLessThanOrEqual(metrics.height)
    expect(metrics.controls.right).toBeLessThanOrEqual(metrics.width)
    for (const name of ['Zoom in', 'Zoom out', 'Reset camera', 'Expand astrolabe'])
      await page.getByRole('button', { name, exact: true }).click({ trial: true })
  }
})

test('preview banners, long navigation, native scrollbars, and expanded mode keep controls reachable', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 650 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript((catalog) => {
    localStorage.setItem('astrolabe.economical', 'true')
    catalog.title = 'A long workspace title that must fit within a scaled desktop browser window'
    catalog.categories.forEach((category, i) => {
      category.name = `Department ${i + 1} enterprise applications`
    })
    localStorage.setItem('astrolabe.catalog.v1', JSON.stringify(catalog))
  }, seed)
  await page.goto('/')
  await expect(page.locator('canvas')).toHaveAttribute('data-camera-moving', 'false')
  await page.addStyleTag({
    content:
      'html { overflow: scroll; scrollbar-gutter: stable; } ::-webkit-scrollbar { width: 18px; height: 18px; }',
  })
  for (const expanded of [false, true]) {
    if (expanded) await page.getByRole('button', { name: 'Expand astrolabe', exact: true }).click()
    await expect
      .poll(() =>
        page.evaluate(() => {
          const root = document.documentElement,
            rect = document.querySelector('.scene-controls')!.getBoundingClientRect()
          return (
            root.scrollWidth <= root.clientWidth &&
            rect.right <= root.clientWidth &&
            rect.bottom <= root.clientHeight
          )
        })
      )
      .toBe(true)
    await page.getByRole('button', { name: 'Reset camera', exact: true }).click({ trial: true })
  }
})
