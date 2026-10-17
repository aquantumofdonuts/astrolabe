import { expect, test } from '@playwright/test'
import seed from '../public/catalog.json' with { type: 'json' }
import formats from './fixtures/thumbnail-formats.json' with { type: 'json' }

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
