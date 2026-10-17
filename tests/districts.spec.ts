import { expect, test } from '@playwright/test'
import seed from '../public/catalog.json' with { type: 'json' }
import formats from './fixtures/thumbnail-formats.json' with { type: 'json' }
import { PerspectiveCamera, QuadraticBezierCurve3, Vector3 } from 'three'
import { validateCatalog } from '../src/lib/catalog'
import { buildConstellationLayout } from '../src/lib/orbits'
import { constellationField } from '../src/lib/constellationField'

test('each constellation frames its tools with uploaded logos and keeps side inspection available', async ({
  page,
}) => {
  test.setTimeout(120000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  // Use the same padded, square image contract as Catalog studio.
  await page.evaluate(
    async ({ seed, image }) => {
      const logo = new Image()
      logo.src = image
      await logo.decode()
      const surface = document.createElement('canvas')
      surface.width = surface.height = 128
      const context = surface.getContext('2d')!
      context.fillStyle = '#0b1925'
      context.fillRect(0, 0, 128, 128)
      const scale = 112 / Math.max(logo.width, logo.height)
      const width = logo.width * scale,
        height = logo.height * scale
      context.drawImage(logo, (128 - width) / 2, (128 - height) / 2, width, height)
      const catalog = {
        ...seed,
        sites: seed.sites.map((site) => ({ ...site, image: surface.toDataURL('image/png') })),
      }
      localStorage.setItem('astrolabe.catalog.v1', JSON.stringify(catalog))
    },
    { seed, image: `data:image/png;base64,${formats.png.data}` }
  )
  await page.reload()
  await expect(page.locator('.scene-experience')).toHaveAttribute('data-scene-state', 'ready', {
    timeout: 30000,
  })
  const canvas = page.locator('canvas')
  for (const category of seed.categories) {
    await page
      .locator('.category-nav')
      .getByRole('button', { name: new RegExp(category.name) })
      .click()
    await expect(canvas).toHaveAttribute('data-camera-moving', 'false')
    await expect(
      page.locator(`[data-constellation="${category.id}"] .system-label`)
    ).toHaveAttribute('aria-pressed', 'true')
    const members = seed.sites.filter((site) => site.category === category.id)
    for (const member of members)
      await page
        .getByRole('button', { name: `Select ${member.name}`, exact: true })
        .click({ trial: true })
    await page.screenshot({ path: `/tmp/astrolabe-district-${category.id}.png` })
    await page.getByRole('button', { name: `Select ${members[0].name}`, exact: true }).click()
    const inspector = page.getByRole('complementary', { name: 'Selected instrument' })
    await expect(inspector).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect
      .poll(async () => {
        const scene = (await canvas.boundingBox())!,
          panel = (await inspector.boundingBox())!
        return scene.x + scene.width <= panel.x
      })
      .toBe(true)
    await inspector.getByRole('button', { name: 'Close instrument details' }).click()
  }
  await page.getByRole('button', { name: /All instruments/ }).click()
  await page.getByRole('button', { name: 'Use lighter graphics' }).click()
  await expect(page.locator('[data-constellation]')).toHaveCount(5)
  await expect(canvas).toHaveAttribute('data-camera-moving', 'false')
  await page.screenshot({ path: '/tmp/astrolabe-districts-light.png' })
  expect(errors).toEqual([])
})

test('plasma fields and site animations freeze with ambient pause and resume without moving the camera', async ({
  page,
}) => {
  test.setTimeout(60000)
  await page.addInitScript(() => localStorage.setItem('astrolabe.economical', 'true'))
  await page.goto('/')
  await expect(page.locator('.scene-experience')).toHaveAttribute('data-scene-state', 'ready', {
    timeout: 30000,
  })
  await page
    .locator('.category-nav')
    .getByRole('button', { name: /Automate/ })
    .click()
  const canvas = page.locator('canvas')
  await expect(canvas).toHaveAttribute('data-camera-moving', 'false')
  await page.getByRole('button', { name: 'Pause ambient motion', exact: true }).click()
  // Camera/selection easing and the final queued WebGL frame may finish after the click.
  await expect
    .poll(
      async () => {
        const previous = await canvas.screenshot()
        await page.waitForTimeout(100)
        return (await canvas.screenshot()).equals(previous)
      },
      { timeout: 10000 }
    )
    .toBe(true)
  const frozen = await canvas.screenshot()
  const pose = await canvas.getAttribute('data-camera-position')
  await page.waitForTimeout(500)
  expect((await canvas.screenshot()).equals(frozen)).toBe(true)
  await page.getByRole('button', { name: 'Resume ambient motion', exact: true }).click()
  await page.waitForTimeout(500)
  expect((await canvas.screenshot()).equals(frozen)).toBe(false)
  expect(await canvas.getAttribute('data-camera-position')).toBe(pose)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(
    page.getByRole('button', { name: 'Pause ambient motion', exact: true })
  ).toBeDisabled()
  await page.waitForTimeout(100)
  const reduced = await canvas.screenshot()
  await page.waitForTimeout(500)
  expect((await canvas.screenshot()).equals(reduced)).toBe(true)
})

test('rendered plasma connections remain visible after repeated node selections and dismissals', async ({
  page,
}) => {
  test.setTimeout(90000)
  const catalog = validateCatalog(seed)
  catalog.sites.forEach((site) => {
    site.image = `data:image/png;base64,${formats.png.data}`
  })
  await page.addInitScript((catalog) => {
    localStorage.setItem('astrolabe.catalog.v1', JSON.stringify(catalog))
    localStorage.setItem('astrolabe.economical', 'true')
  }, catalog)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.locator('.scene-experience')).toHaveAttribute('data-scene-state', 'ready', {
    timeout: 30000,
  })
  const canvas = page.locator('canvas')
  const station = buildConstellationLayout(catalog)[0]
  const thread = constellationField(station, catalog, 0).threads[0]
  const curve = new QuadraticBezierCurve3(
    new Vector3(...thread.start),
    new Vector3(...thread.control),
    new Vector3(...thread.end)
  )
  const contrast = async () => {
    const bounds = (await canvas.boundingBox())!
    const camera = new PerspectiveCamera(42, bounds.width / bounds.height, 0.035, 500)
    camera.position.fromArray(JSON.parse((await canvas.getAttribute('data-camera-position'))!))
    camera.quaternion.fromArray(JSON.parse((await canvas.getAttribute('data-camera-quaternion'))!))
    camera.updateMatrixWorld()
    const project = (t: number) => {
      const point = curve.getPoint(t).project(camera)
      return { x: ((point.x + 1) * bounds.width) / 2, y: ((1 - point.y) * bounds.height) / 2 }
    }
    const samples = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]
      .map((t) => {
        const point = project(t)
        const next = project(t + 0.01)
        const length = Math.hypot(next.x - point.x, next.y - point.y)
        return { ...point, nx: -(next.y - point.y) / length, ny: (next.x - point.x) / length }
      })
      .filter(({ x, y }) => x > 12 && y > 12 && x < bounds.width - 12 && y < bounds.height - 12)
    expect(samples.length).toBeGreaterThan(0)
    const png = (await canvas.screenshot()).toString('base64')
    // Measure the actual rendered ribbons against their adjacent background,
    // rather than trusting a material-state flag that can diverge from the GPU.
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
        const pixels = context.getImageData(0, 0, image.width, image.height).data
        const brightness = (x: number, y: number) => {
          const index = (Math.round(y) * image.width + Math.round(x)) * 4
          return pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722
        }
        const contrasts = samples.map(({ x, y, nx, ny }) => {
          const peak = Math.max(
            ...[-4, -3, -2, -1, 0, 1, 2, 3, 4].map((offset) =>
              brightness(x + nx * offset, y + ny * offset)
            )
          )
          return (
            peak - (brightness(x + nx * 10, y + ny * 10) + brightness(x - nx * 10, y - ny * 10)) / 2
          )
        })
        return contrasts.sort((a, b) => a - b)[Math.floor(contrasts.length / 2)]
      },
      { png, samples }
    )
  }
  await page.mouse.move(8, 8)
  const before = await contrast()
  expect(before).toBeGreaterThan(8)
  for (const dismiss of ['close', 'escape', 'space']) {
    await page.getByRole('button', { name: 'Select Sentinel', exact: true }).click()
    await expect(page.locator('.inspector')).toBeVisible()
    await expect(canvas).toHaveAttribute('data-camera-moving', 'false')
    expect(await contrast()).toBeGreaterThan(8)
    if (dismiss === 'close')
      await page.getByRole('button', { name: 'Close instrument details', exact: true }).click()
    else if (dismiss === 'escape') await page.keyboard.press('Escape')
    else {
      const bounds = (await canvas.boundingBox())!
      await page.mouse.click(bounds.x + 24, bounds.y + bounds.height / 2)
    }
    await expect(page.locator('.inspector')).toBeHidden()
    await page.getByRole('button', { name: 'Reset camera', exact: true }).click()
    await expect(canvas).toHaveAttribute('data-camera-moving', 'false')
    await page.mouse.move(8, 8)
    expect(await contrast()).toBeGreaterThan(Math.max(8, before * 0.7))
  }
})
