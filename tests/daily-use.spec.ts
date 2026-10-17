import { expect, test, type Page } from '@playwright/test'
import seed from '../public/catalog.json' with { type: 'json' }
import formats from './fixtures/thumbnail-formats.json' with { type: 'json' }

const settings = (page: Page) => page.getByRole('region', { name: 'View preferences', exact: true })

test('personal startup, motion, and graphics settings persist while reset retains favorites and history', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('astrolabe.view.v1', JSON.stringify({ startupView: 'directory' }))
    localStorage.setItem('astrolabe.favorites.v1', JSON.stringify(['atlas']))
    localStorage.setItem('astrolabe.recents.v1', JSON.stringify(['pulse']))
  })
  await page.goto('/')
  const trigger = page.getByRole('button', { name: 'View preferences', exact: true })
  const preferencesBounds = (await trigger.boundingBox())!
  const helpBounds = (await page.getByRole('button', { name: 'Help', exact: true }).boundingBox())!
  expect(preferencesBounds.x + preferencesBounds.width).toBeLessThanOrEqual(helpBounds.x)
  await trigger.click()
  const panel = settings(page)
  await expect(panel.getByRole('combobox', { name: 'Start in', exact: true })).toBeFocused()
  await panel.getByRole('combobox', { name: 'Start with', exact: true }).selectOption('favorites')
  await panel.getByRole('checkbox', { name: /^Idle tour/ }).uncheck()
  await panel.getByRole('checkbox', { name: /^Ambient motion/ }).uncheck()
  await panel.getByRole('combobox', { name: 'Graphics', exact: true }).selectOption('light')
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  // A fresh tab shares storage without replaying the original page's seed hook.
  const reopened = await page.context().newPage()
  await reopened.goto('/')
  await expect(reopened.getByRole('button', { name: 'Directory', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await expect(reopened.locator('.directory-card')).toHaveCount(1)
  await expect(reopened.locator('.directory-card h2')).toHaveText('Atlas')
  await reopened.getByRole('button', { name: 'View preferences', exact: true }).click()
  const saved = settings(reopened)
  await expect(saved.getByRole('combobox', { name: 'Graphics', exact: true })).toHaveValue('light')
  await expect(saved.getByRole('checkbox', { name: /^Ambient motion/ })).not.toBeChecked()
  await expect(saved.getByRole('checkbox', { name: /^Idle tour/ })).not.toBeChecked()
  await saved.getByRole('button', { name: 'Reset view preferences' }).click()
  await expect(saved.getByRole('combobox', { name: 'Start in', exact: true })).toHaveValue('auto')
  await expect(saved.getByRole('combobox', { name: 'Graphics', exact: true })).toHaveValue('full')
  expect(
    await reopened.evaluate(() => JSON.parse(localStorage.getItem('astrolabe.favorites.v1')!))
  ).toEqual(['atlas'])
  expect(
    await reopened.evaluate(() => JSON.parse(localStorage.getItem('astrolabe.recents.v1')!))
  ).toEqual(['pulse'])
  await reopened.close()
})

test('the preference popout fits a phone and dismisses without stealing outside focus', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.getByRole('button', { name: 'View preferences', exact: true }).click()
  const panel = settings(page)
  const box = (await panel.boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(390)
  expect(box.y + box.height).toBeLessThanOrEqual(844)
  await page.screenshot({ path: '/tmp/astrolabe-personal-view-mobile.png' })
  const search = page.getByRole('combobox', { name: 'Search instruments' })
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+Tab')
  await expect(panel).toHaveCount(0)
  await expect(search).toBeFocused()
  await page.getByRole('button', { name: 'View preferences', exact: true }).click()
  await page.getByRole('button', { name: 'Help', exact: true }).click()
  await expect(panel).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Astrolabe camera help' })).toBeVisible()
})

test('preferences stay usable for the session when browser storage rejects writes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException('Unavailable', 'QuotaExceededError')
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'View preferences', exact: true }).click()
  await settings(page)
    .getByRole('combobox', { name: 'Start in', exact: true })
    .selectOption('astrolabe')
  await expect(settings(page).getByRole('combobox', { name: 'Start in', exact: true })).toHaveValue(
    'astrolabe'
  )
  await expect(page.getByRole('status')).toContainText('changed for this session')
})

for (const width of [1440, 390]) {
  test(`scene tools launch directly without inspection at ${width}px`, async ({
    page,
    context,
  }) => {
    test.setTimeout(60000)
    await page.setViewportSize({ width, height: 960 })
    const catalog = structuredClone(seed)
    Object.assign(catalog.sites[0], {
      url: 'https://tools.example.test/sentinel',
      image: `data:image/png;base64,${formats.png.data}`,
    })
    await page.addInitScript((catalog) => {
      localStorage.setItem('astrolabe.catalog.v1', JSON.stringify(catalog))
      localStorage.setItem('astrolabe.economical', 'true')
    }, catalog)
    await context.route('https://tools.example.test/**', (route) =>
      route.fulfill({ body: '<title>Sentinel</title>' })
    )
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/')
    if (width < 900) await page.getByRole('button', { name: 'Astrolabe', exact: true }).click()
    await expect(page.locator('.scene-experience')).toHaveAttribute('data-scene-state', 'ready', {
      timeout: 30000,
    })
    const scope =
      width > 760
        ? page.getByRole('region', { name: 'Free-flight camera' })
        : page.getByRole('navigation', { name: 'Visible scene instruments' })
    const link = scope.getByRole('link', { name: 'Launch Sentinel in a new tab', exact: true })
    const pose = await page.locator('canvas').getAttribute('data-camera-position')
    if (width > 760) {
      const name = scope.getByRole('button', { name: 'Select Sentinel', exact: true })
      await name.hover()
      await expect(page.locator('.dock-preview')).toContainText(catalog.sites[0].description)
      expect(await page.locator('canvas').getAttribute('data-camera-position')).toBe(pose)
      await name.focus()
      await page.keyboard.press('Tab')
      await expect(link).toBeFocused()
      await expect(link).toHaveCSS('opacity', '1')
      await page.screenshot({ path: '/tmp/astrolabe-direct-launch.png' })
    }
    await expect(link).toHaveAttribute('href', 'https://tools.example.test/sentinel')
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    const popup = page.waitForEvent('popup')
    if (width > 760) await page.keyboard.press('Enter')
    else await link.click()
    const opened = await popup
    await expect(opened).toHaveURL('https://tools.example.test/sentinel')
    await opened.close()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.locator('.inspector')).toBeHidden()
    expect(
      await page.evaluate(() => JSON.parse(localStorage.getItem('astrolabe.recents.v1')!)[0])
    ).toBe('sentinel')
    expect(await page.locator('canvas').getAttribute('data-camera-position')).toBe(pose)
    if (width < 761) {
      await page.getByRole('button', { name: 'Expand astrolabe', exact: true }).click()
      await expect(link).toBeHidden()
      await page.getByRole('button', { name: 'Exit expanded view', exact: true }).click()
      await link.click({ trial: true })
      await page.screenshot({ path: '/tmp/astrolabe-direct-launch-mobile.png' })
    }
    if (width > 760) {
      await scope.getByRole('button', { name: 'Select Sentinel', exact: true }).click()
      await expect(page.locator('.inspector')).toBeVisible()
      await page.getByRole('button', { name: 'View preferences', exact: true }).click()
      await page.keyboard.press('Escape')
      await expect(page.locator('.inspector')).toBeVisible()
    }
  })
}
