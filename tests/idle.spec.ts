import { expect, test, type Page } from '@playwright/test'
import { Frustum, Matrix4, PerspectiveCamera, Quaternion, Vector3 } from 'three'
import seed from '../public/catalog.json' with { type: 'json' }
import { validateCatalog } from '../src/lib/catalog'
import { buildConstellationLayout } from '../src/lib/orbits'
import { systemOverview } from '../src/lib/overview'

async function pose(page: Page) {
  return page.locator('canvas').evaluate((canvas) => ({
    position: JSON.parse(canvas.dataset.cameraPosition!) as number[],
    quaternion: JSON.parse(canvas.dataset.cameraQuaternion!) as number[],
  }))
}

async function load(page: Page, viewport = { width: 1440, height: 960 }) {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') })
  await page.setViewportSize(viewport)
  await page.addInitScript(() => localStorage.setItem('astrolabe.economical', 'true'))
  await page.goto('/')
  if (viewport.width < 900)
    await page.getByRole('button', { name: 'Astrolabe', exact: true }).click()
  await expect(page.locator('.scene-experience')).toHaveAttribute('data-scene-state', 'ready', {
    timeout: 30000,
  })
  await page.bringToFront()
  // Keep GPU/rendering wall time out of the 45-second inactivity boundary.
  await page.clock.pauseAt(new Date('2026-01-01T00:10:00Z'))
  await page.mouse.move(8, 8) // Start a fresh inactivity timer controlled by Playwright's clock.
  await page.clock.runFor(32)
  return pose(page)
}

async function advance(page: Page, milliseconds: number) {
  await page.clock.fastForward(milliseconds)
  await page.clock.runFor(32)
}

async function enterIdle(page: Page) {
  await advance(page, 46_000)
  await expect(page.locator('canvas')).toHaveAttribute('data-camera-idle', 'true')
  await advance(page, 1600)
  await page.clock.runFor(30)
}

function expectHome(
  current: Awaited<ReturnType<typeof pose>>,
  home: Awaited<ReturnType<typeof pose>>
) {
  expect(new Vector3(...current.position).distanceTo(new Vector3(...home.position))).toBeLessThan(
    0.000001
  )
  expect(
    new Quaternion(...current.quaternion).angleTo(new Quaternion(...home.quaternion))
  ).toBeLessThan(0.000001)
}

test('idle fits every body and rotates without clipping', async ({ page }) => {
  test.setTimeout(60000)
  const home = await load(page)
  const canvas = page.locator('canvas')
  await enterIdle(page)
  await expect(page.getByRole('complementary', { name: 'Selected instrument' })).toBeHidden()
  const overview = systemOverview(
    validateCatalog(seed),
    buildConstellationLayout(validateCatalog(seed))
  )
  const rect = (await canvas.boundingBox())!
  const first = await pose(page)
  for (const elapsed of [2000, 60000, 120000]) {
    await advance(page, elapsed)
    await page.clock.runFor(30)
    const current = await pose(page)
    const camera = new PerspectiveCamera(42, rect.width / rect.height, 0.035, 10000)
    camera.position.fromArray(current.position)
    camera.quaternion.fromArray(current.quaternion)
    camera.updateMatrixWorld()
    const frustum = new Frustum().setFromProjectionMatrix(
      new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    )
    for (const body of overview.bodies)
      for (const plane of frustum.planes)
        expect(plane.distanceToPoint(body.position)).toBeGreaterThanOrEqual(body.radius - 0.000001)
  }
  expect(
    new Vector3(...(await pose(page)).position).distanceTo(new Vector3(...first.position))
  ).toBeGreaterThan(1)
  await page.screenshot({ path: '/tmp/astrolabe-idle.png' })
  await page.mouse.move(12, 12)
  await page.clock.runFor(30)
  await expect(canvas).toHaveAttribute('data-camera-idle', 'false')
  expectHome(await pose(page), home)
})

test('mouse, keyboard, wheel, and touch immediately stop idle and restore the initial view', async ({
  page,
}) => {
  test.setTimeout(60000)
  const home = await load(page)
  for (const input of ['mouse', 'keyboard', 'wheel', 'touch']) {
    await enterIdle(page)
    if (input === 'mouse') await page.mouse.move(12, 12)
    else if (input === 'keyboard') await page.keyboard.press('Shift')
    else if (input === 'wheel') await page.mouse.wheel(0, 10)
    else
      await page.evaluate(() => {
        document.body.dispatchEvent(
          new PointerEvent('pointerdown', { pointerId: 9, pointerType: 'touch', bubbles: true })
        )
        document.body.dispatchEvent(
          new PointerEvent('pointerup', { pointerId: 9, pointerType: 'touch', bubbles: true })
        )
      })
    // Native wheel delivery can wait for a frame while the test clock is paused.
    // Advance that frame before checking the event's effect on the camera.
    await page.clock.runFor(32)
    await expect(page.locator('canvas')).toHaveAttribute('data-camera-idle', 'false')
    // Publish the restored pose after the asynchronously delivered event.
    await page.clock.runFor(32)
    expectHome(await pose(page), home)
    await advance(page, 44_000)
    await expect(page.locator('canvas')).toHaveAttribute('data-camera-idle', 'false')
  }
})

test('held input, dialogs, pause, hidden tabs, and reduced motion prevent idle tours', async ({
  page,
}) => {
  test.setTimeout(60000)
  await load(page)
  const canvas = page.locator('canvas')
  await page.mouse.down()
  await advance(page, 90_000)
  await expect(canvas).toHaveAttribute('data-camera-idle', 'false')
  await page.mouse.up()
  await page.keyboard.down('Shift')
  await advance(page, 90_000)
  await expect(canvas).toHaveAttribute('data-camera-idle', 'false')
  await page.keyboard.up('Shift')
  await page.getByRole('button', { name: 'Help', exact: true }).click()
  await advance(page, 90_000)
  await expect(canvas).toHaveAttribute('data-camera-idle', 'false')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Pause ambient motion', exact: true }).click()
  await advance(page, 90_000)
  await expect(canvas).toHaveAttribute('data-camera-idle', 'false')
  await page.getByRole('button', { name: 'Resume ambient motion', exact: true }).click()
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await advance(page, 90_000)
  await expect(canvas).toHaveAttribute('data-camera-idle', 'false')
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await advance(page, 90_000)
  await expect(canvas).toHaveAttribute('data-camera-idle', 'false')
})

test('idle framing fits the visible mobile scene and resets on resize', async ({ page }) => {
  test.setTimeout(60000)
  const home = await load(page, { width: 390, height: 844 })
  await enterIdle(page)
  const canvas = page.locator('canvas')
  await page.screenshot({ path: '/tmp/astrolabe-idle-mobile.png' })
  await page.setViewportSize({ width: 400, height: 844 })
  await expect(canvas).toHaveAttribute('data-camera-idle', 'false')
  await page.clock.runFor(32)
  expectHome(await pose(page), home)
})

test('inspection and filtered views retain their context after prolonged inactivity', async ({
  page,
}) => {
  await load(page)
  const canvas = page.locator('canvas')
  await page.getByRole('button', { name: 'Select Sentinel', exact: true }).click()
  await advance(page, 90_000)
  await expect(canvas).toHaveAttribute('data-camera-idle', 'false')
  await expect(page.getByRole('complementary', { name: 'Selected instrument' })).toBeVisible()
  await page.getByRole('button', { name: 'Close instrument details' }).click()
  await page
    .locator('.category-nav')
    .getByRole('button', { name: /Observe/ })
    .click()
  await advance(page, 90_000)
  await expect(canvas).toHaveAttribute('data-camera-idle', 'false')
  await expect(
    page.locator('.category-nav').getByRole('button', { name: /Observe/ })
  ).toHaveAttribute('aria-pressed', 'true')
})

test('leaving idle restores an inverted, manually panned camera and its focus', async ({
  page,
}) => {
  test.setTimeout(60000)
  await load(page)
  const bounds = (await page.locator('canvas').boundingBox())!
  await page.mouse.move(bounds.x + 100, bounds.y + 200)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(bounds.x + 180, bounds.y + 230, { steps: 3 })
  await page.mouse.up({ button: 'right' })
  await page.clock.runFor(30)
  await page.mouse.move(bounds.x + 100, bounds.y + 120)
  await page.mouse.down()
  await page.mouse.move(bounds.x + 130, bounds.y + 120 + bounds.height * 0.65, { steps: 6 })
  await page.mouse.up()
  await page.clock.runFor(30)
  const previous = await pose(page)
  expect(
    new Vector3(0, 1, 0).applyQuaternion(new Quaternion().fromArray(previous.quaternion)).y
  ).toBeLessThan(0)
  const focus = await page.locator('canvas').getAttribute('data-camera-focus')
  await enterIdle(page)
  await page.mouse.move(8, 8)
  await page.clock.runFor(30)
  expectHome(await pose(page), previous)
  expect(await page.locator('canvas').getAttribute('data-camera-focus')).toBe(focus)
})

test('personal idle-tour preference disables tours until explicitly enabled again', async ({
  page,
}) => {
  test.setTimeout(60000)
  await load(page)
  const configure = async (enabled: boolean) => {
    await page.getByRole('button', { name: 'View preferences', exact: true }).click()
    await page
      .getByRole('region', { name: 'View preferences', exact: true })
      .getByRole('checkbox', { name: /^Idle tour/ })
      .setChecked(enabled)
    await page.keyboard.press('Escape')
  }
  await configure(false)
  await advance(page, 90_000)
  await expect(page.locator('canvas')).toHaveAttribute('data-camera-idle', 'false')
  await configure(true)
  await enterIdle(page)
})
