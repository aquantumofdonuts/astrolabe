import { expect, test, type Page } from '@playwright/test'
import seed from '../public/catalog.json' with { type: 'json' }
import formats from './fixtures/thumbnail-formats.json' with { type: 'json' }
import { hectorPlan, HECTOR_DEPARTURE, HECTOR_WIPE_MS, HECTOR_REVEAL_MS } from '../src/lib/hector'

const logo = `data:image/png;base64,${formats.png.data}`
const movie = (page: Page) => page.getByRole('dialog', { name: 'Captain Hector cinematic' })
const cancel = (page: Page) =>
  movie(page).getByRole('button', { name: 'Cancel Hector cinematic and reset view' })

async function load(page: Page, directory = false) {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.addInitScript(
    ({ seed, logo, directory }) => {
      seed.sites.forEach((site: { image?: string }) => {
        site.image = logo
      })
      localStorage.setItem('astrolabe.catalog.v1', JSON.stringify(seed))
      localStorage.setItem('astrolabe.favorites.v1', JSON.stringify(['sentinel', 'atlas']))
      localStorage.setItem('astrolabe.recents.v1', JSON.stringify(['pulse']))
      localStorage.setItem('astrolabe.economical', 'true')
      localStorage.setItem(
        'astrolabe.view.v1',
        JSON.stringify({
          startupView: directory ? 'directory' : 'astrolabe',
          ambientMotion: false,
          idleTour: false,
        })
      )
    },
    { seed: structuredClone(seed), logo, directory }
  )
  await page.goto('/')
  await expect(page.getByRole('region', { name: 'Quick launch' })).toBeVisible()
  if (!directory)
    await expect(page.locator('.scene-experience')).toHaveAttribute('data-scene-state', 'ready', {
      timeout: 30000,
    })
  await page.bringToFront()
  await page.clock.pauseAt(new Date('2026-01-01T00:10:00Z'))
}

async function advance(page: Page, milliseconds: number) {
  await page.clock.fastForward(milliseconds)
  await page.clock.runFor(64)
}

async function summon(page: Page) {
  await page.keyboard.type('hector')
  await expect(movie(page)).toBeVisible()
  await expect
    .poll(
      async () => {
        await page.clock.runFor(32)
        return movie(page).getAttribute('data-phase')
      },
      { timeout: 30000 }
    )
    .toBe('arrival')
  await expect(movie(page).locator('.hector-transponder')).toBeHidden()
  await expect(movie(page).locator('.hector-telemetry')).toBeHidden()
  await expect(movie(page)).not.toContainText(/trial|expired|transmission/i)
}

async function restored(page: Page) {
  await advance(page, 500)
  await expect(movie(page)).toHaveAttribute('data-mode', 'wipe')
  await advance(page, HECTOR_WIPE_MS - 500 + 20)
  await expect(movie(page)).toHaveAttribute('data-mode', 'reveal')
  await advance(page, 900)
  await expect(movie(page)).toHaveAttribute('data-mode', 'reveal')
  await advance(page, HECTOR_REVEAL_MS - 900 + 50)
  await expect(movie(page)).toHaveCount(0)
  await expect(page.locator('.app-shell')).not.toHaveAttribute('inert')
  await expect(page.locator('.app-shell')).not.toHaveClass(/scene-expanded|hector-active/)
  await expect(page.locator('canvas')).toHaveAttribute('data-camera-moving', 'false')
}

test('Hector destroys the mapped destinations, locks interaction, and restores an unchanged catalog and preferences', async ({
  page,
}) => {
  test.setTimeout(90000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await load(page)
  const before = await page.evaluate(() => ({ ...localStorage }))
  await page.locator('.observatory-renderer').focus()
  await summon(page)
  await expect(page.locator('.app-shell')).toHaveAttribute('inert', '')
  await expect(cancel(page)).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(cancel(page)).toBeFocused()
  await page.keyboard.press('/')
  await page.keyboard.press('?')
  await expect(movie(page)).toHaveCount(1)
  await expect(page.locator('.help-modal')).toHaveCount(0)
  await advance(page, 6900)
  await expect(movie(page)).toHaveAttribute('data-phase', 'attack')
  expect(Number(await movie(page).getAttribute('data-destroyed'))).toBeGreaterThan(0)
  const held = await movie(page).getAttribute('data-destroyed')
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await advance(page, 30_000)
  await expect(movie(page)).toHaveAttribute('data-destroyed', held!)
  await page.evaluate(() => {
    Reflect.deleteProperty(document, 'hidden')
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.screenshot({ path: '/tmp/astrolabe-hector-attack-test.png' })
  const plan = hectorPlan(seed.sites.map((site) => site.id))
  await advance(page, (plan.departAt - 6.9) * 1000 + 100)
  await expect(movie(page)).toHaveAttribute('data-destroyed', String(seed.sites.length))
  await expect(movie(page)).toHaveAttribute('data-phase', 'departure')
  await page.screenshot({ path: '/tmp/astrolabe-hector-cleared-test.png' })
  await advance(page, 2600)
  await expect(movie(page)).toHaveAttribute('data-phase', 'departure')
  await expect(movie(page)).toHaveAttribute('data-mode', 'playing')
  await advance(page, HECTOR_DEPARTURE * 1000 - 2600 + 100)
  await expect(movie(page)).toHaveAttribute('data-mode', 'wipe')
  await restored(page)
  await expect(page.locator('.orbital-node')).toHaveCount(seed.sites.length)
  expect(await page.evaluate(() => ({ ...localStorage }))).toEqual(before)
  await page.getByRole('button', { name: 'Directory', exact: true }).click()
  await expect(page.locator('.directory-card')).toHaveCount(seed.sites.length)
  expect(errors).toEqual([])
})

test('typing in editors never summons Hector; Escape and the cancel control both restore the view', async ({
  page,
}) => {
  test.setTimeout(90000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await load(page)
  const search = page.getByRole('combobox', { name: 'Search instruments' })
  await search.focus()
  await page.keyboard.type('hector')
  await advance(page, 3000)
  await expect(movie(page)).toHaveCount(0)
  await search.fill('')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Catalog studio', exact: true }).click()
  const name = page
    .getByRole('dialog', { name: 'Catalog studio' })
    .getByLabel('Name', { exact: true })
  await name.fill('')
  await name.focus()
  await page.keyboard.type('hector')
  await expect(movie(page)).toHaveCount(0)
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click()
  await page.locator('.observatory-renderer').focus()
  await summon(page)
  await page.keyboard.press('Escape')
  await expect(movie(page)).toHaveAttribute('data-mode', 'wipe')
  await restored(page)
  await summon(page)
  await advance(page, 7200)
  await cancel(page).click()
  await restored(page)
  await summon(page)
  await cancel(page).press('Enter')
  await restored(page)
  await expect(page.locator('.orbital-node')).toHaveCount(seed.sites.length)
})

test('Directory can summon the cinematic on a phone and cancel before scene loading finishes', async ({
  page,
}) => {
  test.setTimeout(60000)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await load(page, true)
  await page.keyboard.type('hector')
  await expect(movie(page)).toBeVisible()
  const bounds = (await cancel(page).boundingBox())!
  expect(bounds.x).toBeGreaterThanOrEqual(0)
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390)
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(844)
  await cancel(page).click()
  await advance(page, HECTOR_WIPE_MS + 20)
  await expect(movie(page)).toHaveAttribute('data-mode', 'reveal')
  await advance(page, HECTOR_REVEAL_MS + 50)
  await expect(movie(page)).toHaveCount(0)
  await expect(page.locator('.app-shell')).not.toHaveAttribute('inert')
  await page.getByRole('button', { name: 'Directory', exact: true }).click()
  await expect(page.locator('.directory-card')).toHaveCount(seed.sites.length)
})

test('a failed cinematic download releases the UI and leaves every tool reachable in Directory', async ({
  page,
}) => {
  test.setTimeout(60000)
  await load(page)
  await page.route('**/HectorAttack-*.js', (route) => route.abort())
  await page.locator('.observatory-renderer').focus()
  await page.keyboard.type('hector')
  await expect
    .poll(
      async () => {
        await page.clock.runFor(32)
        return page.locator('.directory-card').count()
      },
      { timeout: 30000 }
    )
    .toBe(seed.sites.length)
  await expect(movie(page)).toHaveCount(0)
  await expect(page.locator('.app-shell')).not.toHaveAttribute('inert')
})
