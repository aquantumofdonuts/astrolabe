import { expect, test } from '@playwright/test'
import seed from '../public/catalog.json' with { type: 'json' }

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
