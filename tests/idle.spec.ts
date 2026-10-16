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
  await page.setViewportSize(viewport)
  await page.addInitScript(() => localStorage.setItem('astrolabe.economical', 'true'))
  await page.goto('/')
  if (viewport.width < 900)
    await page.getByRole('button', { name: 'Astrolabe', exact: true }).click()
  await expect(page.locator('.scene-experience')).toHaveAttribute('data-scene-state', 'ready', {
    timeout: 30000,
  })
  await page.bringToFront()
  await page.clock.install()
  await page.mouse.move(8, 8) // Start a fresh inactivity timer controlled by Playwright's clock.
  return pose(page)
}

async function enterIdle(page: Page) {
  await page.clock.fastForward(46_000)
  await expect(page.locator('canvas')).toHaveAttribute('data-camera-idle', 'true')
  await page.clock.fastForward(1600)
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

test('idle starts after inactivity, clears selection, fits every body, and rotates without clipping', async ({
  page,
}) => {
  test.setTimeout(60000)
  const home = await load(page)
  const canvas = page.locator('canvas')
  await page.getByRole('button', { name: 'Select Sentinel', exact: true }).click()
  await page.clock.fastForward(44_000)
  await expect(canvas).toHaveAttribute('data-camera-idle', 'false')
  await page.clock.fastForward(2000)
  await expect(canvas).toHaveAttribute('data-camera-idle', 'true')
  await page.clock.fastForward(1600)
  await page.clock.runFor(30)
  await expect(page.getByRole('complementary', { name: 'Selected instrument' })).toBeHidden()
  await expect(page.locator('.projected-label[data-selection-active="true"]')).toHaveCount(0)
  const overview = systemOverview(
    validateCatalog(seed),
    buildConstellationLayout(validateCatalog(seed))
  )
  const rect = (await canvas.boundingBox())!
  const first = await pose(page)
  for (const elapsed of [2000, 60000, 120000]) {
    await page.clock.fastForward(elapsed)
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
    await page.clock.runFor(30)
    await expect(page.locator('canvas')).toHaveAttribute('data-camera-idle', 'false')
    expectHome(await pose(page), home)
    await page.clock.fastForward(44_000)
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
  await page.clock.fastForward(90_000)
  await expect(canvas).toHaveAttribute('data-camera-idle', 'false')
  await page.mouse.up()
  await page.keyboard.down('Shift')
  await page.clock.fastForward(90_000)
  await expect(canvas).toHaveAttribute('data-camera-idle', 'false')
  await page.keyboard.up('Shift')
  await page.getByRole('button', { name: 'Help', exact: true }).click()
  await page.clock.fastForward(90_000)
  await expect(canvas).toHaveAttribute('data-camera-idle', 'false')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Pause ambient motion', exact: true }).click()
  await page.clock.fastForward(90_000)
  await expect(canvas).toHaveAttribute('data-camera-idle', 'false')
  await page.getByRole('button', { name: 'Resume ambient motion', exact: true }).click()
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.clock.fastForward(90_000)
  await expect(canvas).toHaveAttribute('data-camera-idle', 'false')
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.fastForward(90_000)
  await expect(canvas).toHaveAttribute('data-camera-idle', 'false')
})

test('idle framing fits the visible mobile scene and resets on resize', async ({ page }) => {
  test.setTimeout(60000)
  const home = await load(page, { width: 390, height: 844 })
  await enterIdle(page)
  const canvas = page.locator('canvas')
  await page.screenshot({ path: '/tmp/astrolabe-idle-mobile.png' })
  await page.setViewportSize({ width: 400, height: 844 })
  await page.clock.runFor(30)
  await expect(canvas).toHaveAttribute('data-camera-idle', 'false')
  expectHome(await pose(page), home)
})
