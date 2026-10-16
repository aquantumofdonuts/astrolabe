import { expect, test, type Page } from '@playwright/test'

async function delayCompilation(page: Page) {
  await page.addInitScript(() => {
    const state = window as Window & { releaseCompilation?: boolean }
    const getExtension = WebGL2RenderingContext.prototype.getExtension
    WebGL2RenderingContext.prototype.getExtension = function (name) {
      // Exercise asynchronous warm-up even on software renderers without this extension.
      if (name === 'KHR_parallel_shader_compile') return { COMPLETION_STATUS_KHR: 0x91b1 }
      return getExtension.call(this, name)
    }
    const original = WebGL2RenderingContext.prototype.getProgramParameter
    WebGL2RenderingContext.prototype.getProgramParameter = function (program, parameter) {
      if (parameter === 0x91b1) return !!state.releaseCompilation
      return original.call(this, program, parameter)
    }
  })
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('astrolabe.economical', 'true'))
})

for (const reducedMotion of [false, true]) {
  test(`slow scene download shows a ${reducedMotion ? 'static' : 'moving'} loader with a working Directory exit`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: reducedMotion ? 'reduce' : 'no-preference' })
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    await page.route(
      /\/(?:src\/components\/Observatory\.tsx|assets\/Observatory-[^/]+\.js)(?:\?.*)?$/,
      async (route) => {
        await gate
        await route.continue().catch(() => {}) // Leaving the view may cancel this request.
      }
    )
    try {
      await page.goto('/', { waitUntil: 'domcontentloaded' })
      const loader = page.locator('.scene-loading')
      await expect(loader).toBeVisible()
      await expect(page.getByRole('status')).toContainText('Opening the observatory')
      const orbit = page.locator('.loading-orbit').first()
      await expect(orbit).toHaveCSS('animation-name', reducedMotion ? 'none' : 'loading-orbit')
      if (!reducedMotion) {
        const transform = await orbit.evaluate((element) => getComputedStyle(element).transform)
        await expect
          .poll(() => orbit.evaluate((element) => getComputedStyle(element).transform))
          .not.toBe(transform)
        await page.screenshot({ path: '/tmp/astrolabe-loading.png' })
      }
      await page.getByRole('button', { name: 'Open Directory', exact: true }).click()
      await expect(page.locator('.directory-card')).toHaveCount(15)
      await expect(loader).toHaveCount(0)
      await expect(page.locator('canvas')).toHaveCount(0)
    } finally {
      release()
    }
  })
}

test('loader remains through shader warm-up and reveals only after the first rendered frame', async ({
  page,
}) => {
  test.setTimeout(60000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await delayCompilation(page)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas')).toHaveAttribute('data-camera-moving', 'false')
  const experience = page.locator('.scene-experience')
  await expect(experience).toHaveAttribute('data-scene-state', 'loading')
  await expect(page.locator('.scene-loading')).toBeVisible()
  await expect(page.locator('.scene-content')).toHaveAttribute('inert', '')
  await expect(page.locator('.scene-content')).toHaveCSS('opacity', '0')
  await page.evaluate(() => {
    ;(window as Window & { releaseCompilation: boolean }).releaseCompilation = true
  })
  await expect(experience).toHaveAttribute('data-scene-state', 'ready', { timeout: 30000 })
  await expect(page.locator('.scene-loading')).toHaveCount(0)
  await expect(page.locator('.scene-content')).toHaveCSS('opacity', '1')
  await expect(page.locator('.scene-content')).not.toHaveAttribute('inert', '')
  await expect(page.getByRole('button', { name: 'Select Sentinel', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('leaving during shader warm-up cancels work without late renderer errors', async ({
  page,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await delayCompilation(page)
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas')).toHaveAttribute('data-camera-moving', 'false')
  await page.getByRole('button', { name: 'Open Directory', exact: true }).click()
  await expect(page.locator('.directory-card')).toHaveCount(15)
  await expect(page.locator('canvas')).toHaveCount(0)
  // Shader completion remains stalled while the renderer and its programs are disposed.
  await page.waitForTimeout(300)
  expect(errors).toEqual([])
})
