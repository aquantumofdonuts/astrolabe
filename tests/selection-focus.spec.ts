import { expect, test } from '@playwright/test'
import { PerspectiveCamera, Vector3 } from 'three'
import seed from '../public/catalog.json' with { type: 'json' }
import { validateCatalog } from '../src/lib/catalog'
import { buildConstellationLayout } from '../src/lib/orbits'

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
