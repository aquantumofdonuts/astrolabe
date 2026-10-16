import { expect, test } from '@playwright/test'
import { PerspectiveCamera, Vector3 } from 'three'
import seed from '../public/catalog.json' with { type: 'json' }
import { validateCatalog } from '../src/lib/catalog'
import { buildConstellationLayout } from '../src/lib/orbits'

test('selection dims rendered planets, habitats, and rings while preserving the selected body and sun', async ({
  page,
}) => {
  test.setTimeout(60000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => localStorage.setItem('astrolabe.economical', 'true'))
  await page.goto('/')
  const canvas = page.locator('canvas')
  await expect(page.locator('.scene-experience')).toHaveAttribute('data-scene-state', 'ready', {
    timeout: 30000,
  })
  await expect(canvas).toHaveAttribute('data-camera-moving', 'false')
  const initialPose = await canvas.getAttribute('data-camera-position')
  const bounds = (await canvas.boundingBox())!
  const positions = buildConstellationLayout(validateCatalog(seed)).flatMap(
    (group) => group.instruments
  )
  const camera = new PerspectiveCamera(42, bounds.width / bounds.height, 0.035, 300)
  camera.position.fromArray(JSON.parse(initialPose!))
  camera.quaternion.fromArray(JSON.parse((await canvas.getAttribute('data-camera-quaternion'))!))
  camera.updateMatrixWorld()
  const samples = ['sentinel', 'watchtower', 'pulse', 'dispatch', 'sun'].map((id) => {
    const position = id === 'sun' ? [0, 0, 0] : positions.find((item) => item.id === id)!.position
    const point = new Vector3(...position).project(camera)
    return { x: ((point.x + 1) * bounds.width) / 2, y: ((1 - point.y) * bounds.height) / 2 }
  })
  const capture = async () => {
    // Keep the search popover from covering the sampled bodies.
    await page.mouse.click(8, 8)
    const png = (await canvas.screenshot()).toString('base64')
    return page.evaluate(
      async ({ png, samples }) => {
        const image = new Image()
        image.src = `data:image/png;base64,${png}`
        await image.decode()
        const surface = document.createElement('canvas')
        surface.width = image.width
        surface.height = image.height
        const context = surface.getContext('2d')!
        context.drawImage(image, 0, 0)
        return samples.map(({ x, y }) => {
          const pixels = context.getImageData(Math.round(x) - 18, Math.round(y) - 18, 36, 36).data
          let total = 0
          for (let i = 0; i < pixels.length; i += 4)
            total += pixels[i] * 0.2126 + pixels[i + 1] * 0.7152 + pixels[i + 2] * 0.0722
          return total / (pixels.length / 4)
        })
      },
      { png, samples }
    )
  }
  const before = await capture()
  // Search changes selection without moving the camera, making pixels directly comparable.
  const search = page.getByRole('combobox', { name: 'Search instruments' })
  await search.fill('Sentinel')
  await expect(page.locator('.projected-label[data-selection-active="true"]')).toHaveCount(1)
  const after = await capture()
  expect(await canvas.getAttribute('data-camera-position')).toBe(initialPose)
  expect(after[0]).toBeGreaterThanOrEqual(before[0] * 0.98)
  for (const index of [1, 2, 3]) expect(after[index]).toBeLessThan(before[index] * 0.9)
  expect(after[4]).toBeCloseTo(before[4], 1)
  await page.getByRole('button', { name: 'Close instrument details' }).click()
  await search.fill('')
  const restored = await capture()
  for (const index of [1, 2, 3, 4]) expect(restored[index]).toBeCloseTo(before[index], 1)
  await page
    .locator('.category-nav')
    .getByRole('button', { name: /Observe/ })
    .click()
  await page.getByRole('button', { name: 'Reset camera', exact: true }).click()
  await expect(canvas).toHaveAttribute('data-camera-moving', 'false')
  const group = await capture()
  for (const index of [0, 1, 2]) expect(group[index]).toBeGreaterThanOrEqual(before[index] * 0.98)
  expect(group[3]).toBeLessThan(before[3] * 0.9)
  expect(group[4]).toBeCloseTo(before[4], 1)
  await page.getByRole('button', { name: /All instruments/ }).click()
  const overview = await capture()
  for (const index of [0, 1, 2, 3, 4]) expect(overview[index]).toBeCloseTo(before[index], 1)
  expect(errors).toEqual([])
})

test('every category flies to a framing that keeps its destinations on screen', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => localStorage.setItem('astrolabe.economical', 'true'))
  await page.goto('/')
  const canvas = page.locator('canvas')
  await expect(canvas).toHaveAttribute('data-camera-moving', 'false')
  const stations = buildConstellationLayout(validateCatalog(seed))
  for (const [i, category] of seed.categories.entries()) {
    const before = await canvas.getAttribute('data-camera-position')
    await page
      .locator('.category-nav')
      .getByRole('button', { name: new RegExp(category.name) })
      .click()
    await expect.poll(() => canvas.getAttribute('data-camera-position')).not.toBe(before)
    await expect(canvas).toHaveAttribute('data-camera-moving', 'false')
    await expect(page.locator('.inspector')).toBeHidden()
    const pose = await canvas.evaluate((el) => ({
      position: JSON.parse(el.dataset.cameraPosition!),
      quaternion: JSON.parse(el.dataset.cameraQuaternion!),
    }))
    const rect = (await canvas.boundingBox())!
    const camera = new PerspectiveCamera(42, rect.width / rect.height, 0.035, 500)
    camera.position.fromArray(pose.position)
    camera.quaternion.fromArray(pose.quaternion)
    camera.updateMatrixWorld()
    for (const item of stations[i].instruments) {
      const projected = new Vector3(...item.position).project(camera)
      expect(Math.abs(projected.x)).toBeLessThan(0.85)
      expect(Math.abs(projected.y)).toBeLessThan(0.85)
      await page
        .getByRole('button', {
          name: `Select ${seed.sites.find((site) => site.id === item.id)!.name}`,
          exact: true,
        })
        .click({ trial: true })
    }
  }
})

test('selection uses a smooth flight, repeated selections recenter, and dragging interrupts', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('astrolabe.economical', 'true'))
  await page.goto('/')
  const canvas = page.locator('canvas')
  await expect(canvas).toHaveAttribute('data-camera-moving', 'false')
  const home = await canvas.getAttribute('data-camera-position')
  const node = page.getByRole('button', { name: 'Select Sentinel', exact: true })
  await node.click()
  await expect(canvas).toHaveAttribute('data-camera-moving', 'true')
  const midway = await canvas.getAttribute('data-camera-position')
  await expect(canvas).toHaveAttribute('data-camera-moving', 'false')
  const destination = await canvas.getAttribute('data-camera-position')
  expect(destination).not.toBe(home)
  expect(destination).not.toBe(midway)
  await page.getByRole('button', { name: 'Reset camera', exact: true }).click()
  await expect(canvas).toHaveAttribute('data-camera-moving', 'true')
  await expect(canvas).toHaveAttribute('data-camera-moving', 'false')
  await node.click()
  await expect(canvas).toHaveAttribute('data-camera-moving', 'true')
  const box = (await canvas.boundingBox())!
  await page.mouse.move(box.x + 90, box.y + 130)
  await page.mouse.down()
  await page.mouse.move(box.x + 180, box.y + 160, { steps: 4 })
  await page.mouse.up()
  await expect(canvas).toHaveAttribute('data-camera-moving', 'false')
  const interrupted = await canvas.getAttribute('data-camera-position')
  await page.waitForTimeout(1200)
  expect(await canvas.getAttribute('data-camera-position')).toBe(interrupted)
  expect(interrupted).not.toBe(destination)
  await page.getByRole('button', { name: 'Recenter selected instrument' }).click()
  await expect(canvas).toHaveAttribute('data-camera-moving', 'true')
  await expect(canvas).toHaveAttribute('data-camera-moving', 'false')
  expect(await canvas.getAttribute('data-camera-position')).toBe(destination)
})

test('node, group, and search selections replace previous halos and reticles while paused', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => localStorage.setItem('astrolabe.economical', 'true'))
  await page.goto('/')
  const canvas = page.locator('canvas')
  await expect(canvas).toHaveAttribute('data-camera-moving', 'false')
  const highlighted = page.locator('.projected-label[data-selection-active="true"]')
  const node = (name: string) =>
    page.getByRole('button', { name: `Select ${name}`, exact: true, includeHidden: true })
  const reticle = (name: string) => node(name).locator('..').locator('.hud-reticle')
  const category = (name: string) =>
    page.locator('.category-nav').getByRole('button', { name: new RegExp(name) })
  const search = page.getByRole('combobox', { name: 'Search instruments' })

  await category('Observe').click()
  await expect(highlighted).toHaveCount(3)
  await node('Sentinel').click()
  await expect(highlighted).toHaveCount(1)
  await expect(highlighted).toContainText('Sentinel')
  await expect(page.locator('.projected-label[data-category-active="true"]')).toHaveCount(0)
  await expect(reticle('Sentinel')).toHaveCSS('opacity', '1')

  // Search must replace both the node's glow and its targeting corners, even without a flight.
  await search.fill('Pulse')
  await expect(highlighted).toHaveCount(1)
  await expect(highlighted).toContainText('Pulse')
  await expect(reticle('Sentinel')).toHaveCSS('opacity', '0')
  await expect(reticle('Pulse')).toHaveCSS('opacity', '1')

  await category('Automate').click()
  await expect(search).toHaveValue('')
  await expect(highlighted).toHaveCount(3)
  await expect(reticle('Pulse')).toHaveCSS('opacity', '0')
  await expect(reticle('Sentinel')).toHaveCSS('opacity', '0')
  await expect(page.locator('.orbital-node[aria-pressed="true"]')).toHaveCount(0)

  await category('Configure').click()
  await expect(highlighted).toHaveCount(3)
  await expect(highlighted).toHaveText([/Atlas/, /Vault/, /Waypoint/])
  await search.fill('Sentinel')
  await expect(highlighted).toHaveCount(1)
  await expect(highlighted).toContainText('Sentinel')
  await expect(page.locator('.projected-label[data-category-active="true"]')).toHaveCount(0)
  await search.fill('no-such-instrument')
  await expect(highlighted).toHaveCount(0)
  await expect(reticle('Sentinel')).toHaveCSS('opacity', '0')
})
