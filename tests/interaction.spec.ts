import { expect, test } from '@playwright/test'
import seed from '../public/catalog.json' with { type: 'json' }

async function directory(
  page: import('@playwright/test').Page,
  url = 'https://tools.example.test/sentinel'
) {
  const catalog = structuredClone(seed)
  Object.assign(catalog.sites[0], { url })
  await page.addInitScript((catalog) => {
    localStorage.setItem('astrolabe.catalog.v1', JSON.stringify(catalog))
    localStorage.setItem('astrolabe.view.v1', JSON.stringify({ startupView: 'directory' }))
    localStorage.setItem('astrolabe.favorites.v1', JSON.stringify(['sentinel', 'atlas']))
  }, catalog)
  await page.goto('/')
}

test('native middle-click launches record history and show a brief shared acknowledgement', async ({
  page,
  context,
}) => {
  const target = new URL('/catalog.json', test.info().project.use.baseURL).href
  await directory(page, target)
  const link = page.locator('.directory-launch').first()
  const popup = context.waitForEvent('page')
  await link.click({ button: 'middle' })
  await expect(page.getByRole('region', { name: 'Quick launch' })).toContainText(
    'Opening Sentinel in a new tab'
  )
  await expect(link).toHaveAttribute('data-launching', 'true')
  const opened = await popup
  await expect(opened).toHaveURL(target)
  await opened.close()
  expect(
    await page.evaluate(() => JSON.parse(localStorage.getItem('astrolabe.recents.v1')!))
  ).toEqual(['sentinel'])
  await expect(page.locator('[data-launching]')).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('keyboard inspection focuses launch and returns to its origin, while mouse selection keeps its focus', async ({
  page,
}) => {
  await directory(page)
  const origin = page.locator('.directory-select').first()
  await origin.focus()
  await page.keyboard.press('Enter')
  const inspector = page.getByRole('complementary', { name: 'Selected instrument' })
  await expect(inspector.locator('.launch-button')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(inspector).toBeHidden()
  await expect(origin).toBeFocused()
  await origin.click()
  await expect(inspector).toBeVisible()
  await expect(origin).toBeFocused()
})

test('dock descriptions track hover independently of keyboard focus', async ({ page }) => {
  await directory(page)
  const dock = page.getByRole('region', { name: 'Quick launch' })
  const sentinel = dock.getByRole('link', { name: 'Launch Sentinel in a new tab' })
  await sentinel.focus()
  await page.mouse.move(8, 8)
  await expect(dock.locator('.dock-preview')).toContainText('Your infrastructure, at a glance')
  await dock.getByRole('button', { name: 'Preview Atlas demo' }).hover()
  await expect(dock.locator('.dock-preview')).toContainText('Know your network')
  await page.mouse.move(8, 8)
  await expect(dock.locator('.dock-preview')).toContainText('Your infrastructure, at a glance')
})

test('keyboard scene inspection returns to the selected name after closing its side panel', async ({
  page,
}) => {
  test.setTimeout(60000)
  await page.addInitScript(() => localStorage.setItem('astrolabe.economical', 'true'))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.locator('.scene-experience')).toHaveAttribute('data-scene-state', 'ready', {
    timeout: 30000,
  })
  const node = page.getByRole('button', { name: 'Select Sentinel', exact: true })
  await node.focus()
  await page.keyboard.press('Enter')
  await expect(page.locator('.inspector .launch-button')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.locator('.inspector')).toBeHidden()
  await expect(node).toBeFocused()
})
