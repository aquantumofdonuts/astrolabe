import { expect, test } from '@playwright/test'
import { PerspectiveCamera, Vector3 } from 'three'
import seed from '../public/catalog.json' with { type: 'json' }
import formats from './fixtures/thumbnail-formats.json' with { type: 'json' }
import { validateCatalog } from '../src/lib/catalog'
import { buildConstellationLayout } from '../src/lib/orbits'

for (const width of [1440, 960, 390]) {
  test(`scene inspection leaves the mapped node visible and interactive at ${width}px`, async ({
    page,
  }) => {
    test.setTimeout(60000)
    await page.setViewportSize({ width, height: 900 })
    const catalog = structuredClone(seed)
    Object.assign(catalog.sites[0], { image: `data:image/png;base64,${formats.png.data}` })
    await page.addInitScript((catalog) => {
      localStorage.setItem('astrolabe.catalog.v1', JSON.stringify(catalog))
      localStorage.setItem('astrolabe.economical', 'true')
    }, catalog)
    await page.goto('/')
    if (width < 900) await page.getByRole('button', { name: 'Astrolabe', exact: true }).click()
    await expect(page.locator('.scene-experience')).toHaveAttribute('data-scene-state', 'ready', {
      timeout: 30000,
    })
    const canvas = page.locator('canvas')
    const inspector = page.getByRole('complementary', { name: 'Selected instrument' })
    await page
      .getByRole('button', {
        name: width < 761 ? 'Inspect Sentinel' : 'Select Sentinel',
        exact: true,
      })
      .click()
    await expect(inspector).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    const target = buildConstellationLayout(validateCatalog(catalog))[0].instruments[0].position
    for (const expanded of [false, true]) {
      if (expanded)
        await page.getByRole('button', { name: 'Expand astrolabe', exact: true }).click()
      await expect
        .poll(async () => {
          const scene = (await canvas.boundingBox())!
          const panel = (await inspector.boundingBox())!
          return width > 760 ? scene.x + scene.width <= panel.x : scene.y + scene.height <= panel.y
        })
        .toBe(true)
      await expect(canvas).toHaveAttribute('data-camera-moving', 'false')
      const scene = (await canvas.boundingBox())!
      const pose = await canvas.evaluate((el) => ({
        position: JSON.parse(el.dataset.cameraPosition!),
        quaternion: JSON.parse(el.dataset.cameraQuaternion!),
      }))
      const camera = new PerspectiveCamera(42, scene.width / scene.height, 0.035, 1000)
      camera.position.fromArray(pose.position)
      camera.quaternion.fromArray(pose.quaternion)
      camera.updateMatrixWorld()
      const projected = new Vector3(...target).project(camera)
      expect(Math.abs(projected.x)).toBeLessThan(0.1)
      expect(Math.abs(projected.y)).toBeLessThan(0.1)
      const x = scene.x + ((projected.x + 1) * scene.width) / 2
      const y = scene.y + ((1 - projected.y) * scene.height) / 2
      expect(
        await page.evaluate(
          ({ x, y }) => !!document.elementFromPoint(x, y)?.closest('.scene-canvas'),
          { x, y }
        )
      ).toBe(true)
      await page.screenshot({
        path: `/tmp/astrolabe-inspection-${width}-${expanded ? 'expanded' : 'normal'}.png`,
      })
      const before = await canvas.getAttribute('data-camera-quaternion')
      await page.mouse.move(x, y)
      await page.mouse.down()
      await page.mouse.move(x + 35, y + 12, { steps: 3 })
      await page.mouse.up()
      await expect.poll(() => canvas.getAttribute('data-camera-quaternion')).not.toBe(before)
      await inspector.getByRole('button', { name: 'Recenter selected instrument' }).click()
    }
    await page.keyboard.press('Escape')
    await expect(inspector).toBeHidden()
  })
}
