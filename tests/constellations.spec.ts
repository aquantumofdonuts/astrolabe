import { expect, test } from '@playwright/test'
import seed from '../public/catalog.json' with { type: 'json' }
import { Frustum, Matrix4, PerspectiveCamera } from 'three'
import { validateCatalog } from '../src/lib/catalog'
import { buildConstellationLayout } from '../src/lib/orbits'
import { systemOverview } from '../src/lib/overview'

for (const [width, height] of [
  [1920, 1080],
  [1920, 969],
  [1440, 960],
  [1280, 800],
  [1024, 768],
]) {
  test(`spherical overview keeps every destination legible and reachable at ${width}×${height}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.addInitScript(() => localStorage.setItem('astrolabe.economical', 'true'))
    await page.goto('/')
    await expect(page.locator('.scene-experience')).toHaveAttribute('data-scene-state', 'ready', {
      timeout: 30000,
    })
    await expect(page.locator('canvas')).toHaveAttribute('data-camera-moving', 'false')
    const canvas = page.locator('canvas')
    const rect = (await canvas.boundingBox())!
    const pose = await canvas.evaluate((element) => ({
      position: JSON.parse(element.dataset.cameraPosition!) as number[],
      quaternion: JSON.parse(element.dataset.cameraQuaternion!) as number[],
    }))
    const camera = new PerspectiveCamera(42, rect.width / rect.height, 0.035, 10000)
    camera.position.fromArray(pose.position)
    camera.quaternion.fromArray(pose.quaternion)
    camera.updateMatrixWorld()
    const frustum = new Frustum().setFromProjectionMatrix(
      new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    )
    const catalog = validateCatalog(seed)
    for (const body of systemOverview(catalog, buildConstellationLayout(catalog)).bodies)
      for (const plane of frustum.planes)
        expect(plane.distanceToPoint(body.position)).toBeGreaterThan(body.radius)
    await page.evaluate(() => document.fonts.ready)
    const labels = page.locator('.projected-label:not(.core-projected-label)')
    await expect(labels).toHaveCount(seed.sites.length + seed.categories.length)
    const problems = await labels.evaluateAll((elements) => {
      const issues: string[] = []
      for (const [i, element] of elements.entries()) {
        const button = element.querySelector('button')!
        const a = button.getBoundingClientRect()
        const hit = document.elementFromPoint(a.x + a.width / 2, a.y + a.height / 2)
        if (getComputedStyle(element).visibility !== 'visible' || !hit || !button.contains(hit))
          issues.push(`Unreachable: ${button.textContent}`)
        for (const other of elements.slice(i + 1)) {
          const b = other.querySelector('button')!.getBoundingClientRect()
          if (
            Math.min(a.right, b.right) > Math.max(a.left, b.left) &&
            Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top)
          )
            issues.push(`Overlap: ${button.textContent} / ${other.textContent}`)
        }
      }
      return issues
    })
    expect(problems).toEqual([])
  })
}

test('HUD names stay legible during approach, and targeting appears only for hover or selection', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => localStorage.setItem('astrolabe.economical', 'true'))
  await page.goto('/')
  await expect(page.locator('canvas')).toHaveAttribute('data-camera-moving', 'false')
  const label = page.getByRole('button', { name: 'Select Sentinel', exact: true })
  const marker = label.locator('..').locator('.hud-reticle')
  await expect(label).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await expect(label.locator('.node-name')).toHaveCSS('font-size', '14px')
  await expect(marker).toHaveCSS('opacity', '0')
  await label.hover()
  await expect(marker).toHaveCSS('opacity', '1')
  await label.click()
  await page.getByRole('button', { name: 'Recenter selected instrument' }).click()
  await expect(label).toBeVisible()
  await expect(label.locator('.node-name')).toHaveCSS('font-size', '14px')
  await expect(marker).toHaveCSS('opacity', '1')
  await page.getByRole('button', { name: 'Close instrument details' }).click()
  await expect(marker).toHaveCSS('opacity', '0')
})

test('living environment pauses cleanly and category lighting preserves the selected-node HUD', async ({
  page,
}) => {
  test.setTimeout(60000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.addInitScript(() => localStorage.setItem('astrolabe.economical', 'true'))
  await page.goto('/')
  const canvas = page.locator('canvas')
  await expect(canvas).toHaveAttribute('data-camera-moving', 'false')
  await page.getByRole('button', { name: 'Pause ambient motion', exact: true }).click()
  await page.mouse.move(20, 20)
  await page.waitForTimeout(800)
  const paused = await canvas.screenshot()
  await page.waitForTimeout(500)
  expect((await canvas.screenshot()).equals(paused)).toBe(true)
  await page.getByRole('button', { name: 'Focus Observe constellation', exact: true }).click()
  await expect(page.locator('.projected-label[data-category-active="true"]')).toHaveCount(3)
  await expect(page.getByRole('button', { name: 'Select Sentinel', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false'
  )
  await expect(canvas).toHaveAttribute('data-camera-moving', 'false')
  await page.getByRole('button', { name: 'Select Sentinel', exact: true }).click()
  await expect(canvas).toHaveAttribute('data-camera-moving', 'false')
  await expect(
    page
      .getByRole('button', { name: 'Select Sentinel', exact: true })
      .locator('..')
      .locator('.hud-reticle')
  ).toHaveCSS('opacity', '1')
  await page.mouse.move(20, 20)
  await page.waitForTimeout(500)
  const focused = await canvas.screenshot()
  expect(focused.equals(paused)).toBe(false)
  await page.getByRole('button', { name: 'Resume ambient motion', exact: true }).click()
  await page.waitForTimeout(600)
  expect((await canvas.screenshot()).equals(focused)).toBe(false)
  await page.getByRole('button', { name: /All instruments/ }).click()
  await expect(page.locator('.projected-label[data-category-active="true"]')).toHaveCount(0)
  expect(errors).toEqual([])
})
