import { expect, test } from '@playwright/test'
import { PerspectiveCamera, Vector3 } from 'three'
import { buildConstellationLayout } from '../src/lib/orbits'
import { validateCatalog } from '../src/lib/catalog'
import { destinationRadius } from '../src/lib/hud'
import seed from '../public/catalog.json' with { type: 'json' }

test('renders the 3D astrolabe, selects nodes, and resets the view without runtime errors', async ({
  page,
}) => {
  test.setTimeout(60000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.goto('/')
  await expect(page.locator('.scene-experience')).toHaveAttribute('data-scene-state', 'ready', {
    timeout: 30000,
  })
  await expect(page.locator('.page-heading')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Free-flight camera', exact: true })).toBeVisible()
  await expect(page.locator('canvas')).toHaveCount(1)
  await expect(page.locator('.orbital-node')).toHaveCount(seed.sites.length)
  const atlas = page.getByRole('button', { name: 'Select Atlas', exact: true })
  await expect.poll(() => atlas.locator('..').getAttribute('style')).toContain('translate3d')
  // Steady callouts remain selectable while their satellite systems animate.
  await atlas.hover()
  await page.getByRole('button', { name: 'Select Atlas', exact: true }).click()
  await expect(
    page
      .getByRole('complementary', { name: 'Selected instrument' })
      .getByRole('heading', { name: 'Atlas' })
  ).toBeVisible()
  await page.getByRole('button', { name: 'Pause ambient motion', exact: true }).click()
  await page.evaluate(() => document.fonts.ready)
  await page.locator('.observatory-renderer').evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished))
  })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: '/tmp/astrolabe-desktop.png', fullPage: true })
  const label = page
    .locator('.projected-label')
    .filter({ has: page.getByRole('button', { name: 'Select Atlas', exact: true }) })
  const beforeDrag = await label.getAttribute('style')
  const canvasBounds = await page.locator('canvas').boundingBox()
  if (!canvasBounds) throw new Error('The scene canvas must be visible.')
  await page.mouse.move(
    canvasBounds.x + canvasBounds.width / 2,
    canvasBounds.y + canvasBounds.height / 2
  )
  await page.mouse.down()
  await page.mouse.move(
    canvasBounds.x + canvasBounds.width / 2 + 110,
    canvasBounds.y + canvasBounds.height / 2 + 30,
    { steps: 12 }
  )
  await page.mouse.up()
  await expect.poll(() => label.getAttribute('style')).not.toBe(beforeDrag)
  await expect(page.locator('canvas')).toHaveAttribute('data-camera-moving', 'false')
  const poseBeforeExpand = await page.locator('canvas').getAttribute('data-camera-position')
  await page.getByRole('button', { name: 'Expand astrolabe', exact: true }).click()
  await expect(page.locator('.app-shell')).toHaveClass(/scene-expanded/)
  await expect(page.getByRole('combobox', { name: 'Search instruments' })).toBeVisible()
  await expect(page.locator('.inspector h2')).toBeVisible()
  expect(await page.locator('canvas').getAttribute('data-camera-position')).toBe(poseBeforeExpand)
  await page.keyboard.press('Escape')
  await expect(page.locator('.app-shell')).not.toHaveClass(/scene-expanded/)
  await page.getByRole('button', { name: 'Reset camera', exact: true }).click()
  expect(errors).toEqual([])
})

test('zooms over labels without scrolling and keeps the complete directory reachable', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.locator('.system-label')).toHaveCount(seed.categories.length)
  const canvas = page.locator('canvas')
  await expect(canvas).toHaveAttribute('data-camera-moving', 'false')
  const pose = () =>
    canvas.evaluate((element) => ({
      position: JSON.parse(element.dataset.cameraPosition!) as [number, number, number],
      focus: JSON.parse(element.dataset.cameraFocus!) as [number, number, number],
    }))
  const distance = (position: number[], target: number[]) =>
    new Vector3().fromArray(position).distanceTo(new Vector3().fromArray(target))
  const focusDistance = async () => {
    const current = await pose()
    return distance(current.position, current.focus)
  }
  const before = await pose()
  const initialScroll = await page.evaluate(() => window.scrollY)
  await page.getByRole('button', { name: 'Select Atlas', exact: true }).hover()
  await page.mouse.wheel(0, -160)
  // Measure camera travel; offscreen HUD labels deliberately retain their last transform.
  await expect
    .poll(async () => distance((await pose()).position, before.position))
    .toBeGreaterThan(1)
  const zoomed = await pose()
  const zoomedDistance = distance(zoomed.position, zoomed.focus)
  expect(zoomedDistance).toBeLessThan(distance(before.position, zoomed.focus) * 0.8)
  expect(await page.evaluate(() => window.scrollY)).toBe(initialScroll)
  await page.mouse.wheel(0, 160)
  await expect
    .poll(async () => distance((await pose()).position, zoomed.focus))
    .toBeGreaterThan(zoomedDistance * 1.1)
  expect(await page.evaluate(() => window.scrollY)).toBe(initialScroll)
  const outDistance = await focusDistance()
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await expect.poll(focusDistance).toBeLessThan(outDistance * 0.9)
  const inDistance = await focusDistance()
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click()
  await expect.poll(focusDistance).toBeGreaterThan(inDistance * 1.1)
  await page.getByRole('button', { name: 'Directory', exact: true }).click()
  await expect(page.locator('.directory-card')).toHaveCount(seed.sites.length)
  await page.locator('.directory-card').first().hover()
  await page.mouse.wheel(0, 400)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(initialScroll)
})

test('flies through the sun, turns back 180 degrees, and stays inside the scene sphere', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  // Software-rendered CI uses light graphics for the sustained flight timing check.
  await page.addInitScript(() => localStorage.setItem('astrolabe.economical', 'true'))
  await page.goto('/')
  const canvas = page.locator('canvas')
  const pose = () =>
    canvas.evaluate((element) => ({
      position: JSON.parse(element.dataset.cameraPosition || '[]') as number[],
      forward: JSON.parse(element.dataset.cameraForward || '[]') as number[],
      radius: Number(element.dataset.navigationRadius),
    }))
  await expect.poll(async () => (await pose()).position.length).toBe(3)
  const camera = page.getByRole('region', { name: 'Free-flight camera', exact: true })
  await camera.focus()
  await page.keyboard.down('Shift')
  await page.keyboard.down('w')
  try {
    await expect.poll(async () => (await pose()).position[2], { timeout: 15000 }).toBeLessThan(-10)
  } finally {
    await page.keyboard.up('w')
    await page.keyboard.up('Shift')
  }
  await expect(page.locator('.core-projected-label')).toBeHidden()
  const beforeTurn = (await pose()).position
  // Keyboard aiming still rotates in place; pointer dragging now orbits a picked surface.
  await page.keyboard.down('ArrowRight')
  try {
    await expect
      .poll(async () => (await pose()).forward[2], { intervals: [30], timeout: 8000 })
      .toBeGreaterThan(0.995)
  } finally {
    await page.keyboard.up('ArrowRight')
  }
  await expect(page.locator('.core-projected-label')).toBeVisible()
  const afterTurn = (await pose()).position
  afterTurn.forEach((coordinate, index) => expect(coordinate).toBeCloseTo(beforeTurn[index], 4))
  // Wheel zoom now stops at its focus surface; free flight still crosses the whole scene.
  await camera.focus()
  await page.keyboard.down('Shift')
  await page.keyboard.down('w')
  try {
    await expect
      .poll(
        async () => {
          const p = await pose()
          return Math.hypot(...p.position) - p.radius
        },
        { timeout: 15000 }
      )
      .toBeGreaterThan(-0.01)
  } finally {
    await page.keyboard.up('w')
    await page.keyboard.up('Shift')
  }
  const atBoundary = await pose()
  expect(Math.hypot(...atBoundary.position)).toBeLessThanOrEqual(atBoundary.radius + 0.00001)
  await page.getByRole('button', { name: 'Reset camera', exact: true }).click()
  await expect.poll(async () => (await pose()).position[2]).toBeGreaterThan(20)
  await expect.poll(async () => (await pose()).forward[2]).toBeLessThan(-0.99)
})

test('keeps callouts stable during ambient motion and synchronized with the camera during flight', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('astrolabe.economical', 'true'))
  await page.goto('/')
  await expect
    .poll(() => page.locator('canvas').getAttribute('data-camera-position'))
    .not.toBeNull()
  await page.evaluate(() => document.fonts.ready)
  const sample = () =>
    page.evaluate(async () => {
      const frames: {
        points: { x: number; y: number }[]
        position: number[]
        quaternion: number[]
        atlas: { x: number; y: number }
      }[] = []
      for (let i = 0; i < 35; i++) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        const points = [
          ...document.querySelectorAll<HTMLElement>('.projected-label:not(.core-projected-label)'),
        ].map((element) => {
          const values = /translate3d\(([-\d.]+)px,\s*([-\d.]+)px/.exec(element.style.transform)
          return { x: Number(values?.[1]), y: Number(values?.[2]) }
        })
        const atlas = document.querySelector('[aria-label="Select Atlas"]')!.parentElement!
        const values = /translate3d\(([-\d.]+)px,\s*([-\d.]+)px/.exec(atlas.style.transform)
        const canvas = document.querySelector('canvas')!
        frames.push({
          points,
          position: JSON.parse(canvas.dataset.cameraPosition!),
          quaternion: JSON.parse(canvas.dataset.cameraQuaternion!),
          atlas: { x: Number(values?.[1]), y: Number(values?.[2]) },
        })
      }
      return frames
    })
  const idle = await sample()
  for (const frame of idle)
    frame.points.forEach((point, index) => {
      expect(point.x).toBeCloseTo(idle[0].points[index].x, 2)
      expect(point.y).toBeCloseTo(idle[0].points[index].y, 2)
    })
  const canvas = page.locator('canvas')
  const initialPose = await canvas.getAttribute('data-camera-position')
  await page.getByRole('button', { name: 'Select Atlas', exact: true }).click()
  expect(await canvas.getAttribute('data-camera-position')).toBe(initialPose)
  await page.getByRole('button', { name: 'Pause ambient motion', exact: true }).click()
  const bounds = (await canvas.boundingBox())!
  const recording = sample()
  await page.locator('.stage').evaluate((element) => {
    const bounds = element.getBoundingClientRect()
    return element.dispatchEvent(
      new WheelEvent('wheel', {
        deltaY: -60,
        clientX: bounds.x + bounds.width / 2,
        clientY: bounds.y + bounds.height / 2,
        bubbles: true,
        cancelable: true,
      })
    )
  })
  const frames = await recording
  let totalTravel = 0
  const camera = new PerspectiveCamera(42, bounds.width / bounds.height, 0.035, 300)
  const atlasAnchor = buildConstellationLayout(validateCatalog(seed))
    .flatMap((system) => system.instruments)
    .find((item) => item.id === 'atlas')!
  // The HUD follows the stable body silhouette, independently of surface rotation.
  // Compare against the actual rendered pose rather than assuming a software GPU's FPS.
  for (const [i, frame] of frames.entries()) {
    camera.position.fromArray(frame.position)
    camera.quaternion.fromArray(frame.quaternion)
    camera.updateMatrixWorld()
    const center = new Vector3(...atlasAnchor.position)
    const depth = -center.clone().applyMatrix4(camera.matrixWorldInverse).z
    const projected = center.project(camera)
    const radius =
      (destinationRadius(2, 0) *
        atlasAnchor.scale *
        camera.projectionMatrix.elements[5] *
        bounds.height) /
      (2 * depth)
    expect(frame.atlas.x).toBeCloseTo(((projected.x + 1) * bounds.width) / 2, 1)
    expect(frame.atlas.y).toBeCloseTo(((1 - projected.y) * bounds.height) / 2 + radius + 24, 1)
    if (i)
      totalTravel += Math.hypot(
        frame.atlas.x - frames[i - 1].atlas.x,
        frame.atlas.y - frames[i - 1].atlas.y
      )
  }
  expect(totalTravel).toBeGreaterThan(10)
  const stage = await page.locator('.stage').boundingBox()
  expect(stage?.y).toBeLessThan(190)
  expect(stage?.height).toBeGreaterThan(650)
})

test('category hubs filter their own planetary system', async ({ page }) => {
  await page.goto('/')
  await page
    .getByRole('button', { name: 'Focus Line of business constellation', exact: true })
    .click()
  await expect(page.locator('.results-count')).toContainText('3 instruments')
  await expect(page.locator('.category-nav button.active')).toContainText('Line of business')
  await page.getByRole('button', { name: 'Directory', exact: true }).click()
  await expect(page.locator('.directory-card')).toHaveCount(3)
})

test('searches by task, launches via keyboard, filters categories, and manages favorites', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Directory', exact: true }).click()
  await expect(page.locator('.directory-card')).toHaveCount(seed.sites.length)
  await page.keyboard.press('Control+k')
  await page.getByRole('combobox', { name: 'Search instruments' }).fill('switch backup')
  await expect(page.locator('.directory-card')).toHaveCount(1)
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: 'Atlas', exact: true, level: 2 })
  ).toBeVisible()
  await expect(page.getByText('Demo instrument · no live data')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Favorite Atlas', exact: true }).first().click()
  await page.getByRole('button', { name: /^Favorites/ }).click()
  await expect(page.locator('.directory-card')).toHaveCount(1)
  await expect(page.locator('.directory-card h2')).toHaveText('Atlas')
  await page.reload()
  await page.getByRole('button', { name: 'Directory', exact: true }).click()
  await page.getByRole('button', { name: /^Favorites/ }).click()
  await expect(page.locator('.directory-card')).toHaveCount(1)
  await page
    .getByRole('navigation')
    .filter({ has: page.getByRole('button', { name: /^Automate/ }) })
    .getByRole('button', { name: /^Automate/ })
    .click()
  await expect(page.locator('.directory-card')).toHaveCount(3)
})

test('authors a real instrument, persists a local preview, exports it, and restores the deployed catalog', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Catalog studio', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Add instrument', exact: true }).click()
  await dialog.getByLabel('Name', { exact: true }).fill('Real NCM')
  await dialog.getByLabel('Website URL', { exact: true }).fill('https://ncm.example.com/')
  await dialog.getByLabel('Search keywords', { exact: true }).fill('switch, backup, production')
  await dialog.getByRole('button', { name: 'Apply local preview', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('Preview applied')
  await page.screenshot({ path: '/tmp/astrolabe-studio.png' })
  const download = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Export', exact: true }).click()
  expect((await download).suggestedFilename()).toBe('catalog.json')
  await dialog.getByRole('button', { name: 'Close dialog' }).click()
  await page.reload()
  await expect(page.getByText('Local catalog preview · visible only in this browser')).toBeVisible()
  await page.getByRole('button', { name: 'Directory', exact: true }).click()
  await expect(page.locator('.directory-card')).toHaveCount(seed.sites.length + 1)
  await expect(page.getByRole('link', { name: 'Launch Real NCM in a new tab' })).toHaveAttribute(
    'href',
    'https://ncm.example.com/'
  )
  await expect(page.getByRole('link', { name: 'Launch Real NCM in a new tab' })).toHaveAttribute(
    'rel',
    'noopener noreferrer'
  )
  await context.route('https://ncm.example.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<h1>NCM launch verified</h1>' })
  )
  const newTab = page.waitForEvent('popup')
  await page.getByRole('link', { name: 'Launch Real NCM in a new tab' }).click()
  const launched = await newTab
  await expect(launched.getByRole('heading', { name: 'NCM launch verified' })).toBeVisible()
  await launched.close()
  await page.getByRole('button', { name: 'Catalog studio', exact: true }).click()
  await dialog.getByRole('button', { name: 'Restore deployed catalog', exact: true }).click()
  await dialog.getByRole('button', { name: 'Restore catalog', exact: true }).click()
  await expect(page.locator('.directory-card')).toHaveCount(seed.sites.length)
  await expect(page.getByText('Local catalog preview · visible only in this browser')).toHaveCount(
    0
  )
})

test('creates and edits categories and prevents removal of a populated category', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('astrolabe.economical', 'true'))
  await page.goto('/')
  await page.getByRole('button', { name: 'Catalog studio', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Categories', exact: true }).click()
  await dialog.getByRole('button', { name: 'Add category', exact: true }).click()
  await dialog.getByLabel('Category name', { exact: true }).fill('Research')
  await dialog.getByRole('button', { name: /^Instruments/ }).click()
  await dialog.getByLabel('Category', { exact: true }).selectOption({ label: 'Research' })
  await dialog.getByRole('button', { name: 'Categories', exact: true }).click()
  await dialog.getByRole('button', { name: 'Research', exact: true }).click()
  await dialog.getByRole('button', { name: 'Remove category', exact: true }).click()
  await dialog.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('Move this category')
  await dialog.getByRole('button', { name: /^Instruments/ }).click()
  await dialog.getByLabel('Category', { exact: true }).selectOption({ label: 'Observe' })
  await dialog.getByRole('button', { name: 'Remove instrument', exact: true }).click()
  await dialog.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(dialog.locator('.studio-entry')).toHaveCount(seed.sites.length - 1)
  await dialog.getByRole('button', { name: 'Categories', exact: true }).click()
  await dialog.getByRole('button', { name: 'Remove category', exact: true }).click()
  await dialog.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(dialog.locator('.studio-entry')).toHaveCount(seed.categories.length)
  await dialog.getByRole('button', { name: 'Apply local preview', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('Preview applied')
})

test('validates imported catalogs and rejects unsafe URLs without replacing existing data', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Catalog studio', exact: true }).click()
  const dialog = page.getByRole('dialog')
  const invalid = structuredClone(seed)
  invalid.sites[0].url = 'javascript:alert(1)' as never
  await dialog.getByLabel('Import catalog', { exact: true }).setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(invalid)),
  })
  await expect(dialog.getByRole('alert')).toBeVisible()
  await expect(dialog.locator('.studio-entry')).toHaveCount(seed.sites.length)
  const valid = structuredClone(seed)
  valid.title = 'My wizard tools'
  valid.sites = valid.sites.slice(0, 2)
  await dialog.getByLabel('Import catalog', { exact: true }).setInputFiles({
    name: 'catalog.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(valid)),
  })
  await expect(dialog.locator('.studio-entry')).toHaveCount(2)
  await dialog.getByRole('button', { name: 'Apply local preview', exact: true }).click()
  await dialog.getByRole('button', { name: 'Close dialog' }).click()
  await expect(page.locator('.workspace-breadcrumb')).toContainText('My wizard tools')
})

test('provides a responsive directory on mobile and respects reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.locator('.directory-card')).toHaveCount(seed.sites.length)
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(
    false
  )
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: '/tmp/astrolabe-mobile.png', fullPage: true })
  await page.locator('.directory-select').first().click()
  await expect(page.getByRole('dialog', { name: 'Sentinel' })).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: 'Preview Sentinel demo' }).click()
  await expect(page.getByText('Demo instrument · no live data')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Astrolabe', exact: true }).click()
  await expect(page.locator('.orbital-node')).toHaveCount(seed.sites.length)
  await expect(
    page.getByRole('button', { name: 'Pause ambient motion', exact: true })
  ).toBeDisabled()
  await page.getByRole('button', { name: 'Inspect Prism', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Prism', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Catalog studio', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(
    false
  )
})

test('falls back to the full directory when WebGL is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      if (type.includes('webgl')) return null
      return original.apply(this, [type, ...args] as never)
    } as typeof original
  })
  await page.goto('/')
  await expect(page.locator('.directory-card')).toHaveCount(seed.sites.length)
  await expect(page.getByRole('button', { name: 'Astrolabe', exact: true })).toBeDisabled()
})

test('left drag picks the surface under the pointer while right drag only strafes', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const canvas = page.locator('canvas')
  await expect(canvas).toHaveAttribute('data-camera-moving', 'false')
  const bounds = await canvas.boundingBox()
  if (!bounds) throw new Error('Scene must have a canvas')
  const start = { x: bounds.x + bounds.width / 2 + 25, y: bounds.y + bounds.height / 2 - 20 }
  const pose = () =>
    canvas.evaluate((element) => ({
      position: JSON.parse(element.dataset.cameraPosition!),
      forward: JSON.parse(element.dataset.cameraForward!),
      pivot: JSON.parse(element.dataset.orbitPivot || '[]'),
    }))
  const before = await pose()
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await expect(canvas).toHaveAttribute('data-orbit-surface', 'surface')
  const firstPivot = (await pose()).pivot
  await page.mouse.move(start.x + 95, start.y + 35, { steps: 8 })
  await page.mouse.up()
  await expect
    .poll(async () => JSON.stringify((await pose()).forward))
    .not.toBe(JSON.stringify(before.forward))
  await expect
    .poll(async () => JSON.stringify((await pose()).position))
    .not.toBe(JSON.stringify(before.position))
  await page.getByRole('button', { name: 'Reset camera', exact: true }).click()
  await expect.poll(async () => (await pose()).position[2]).toBeCloseTo(before.position[2])
  await page.mouse.move(start.x - 50, start.y)
  await page.mouse.down()
  await expect(canvas).toHaveAttribute('data-orbit-surface', 'surface')
  expect((await pose()).pivot).not.toEqual(firstPivot)
  await page.mouse.up()
  const beforePan = await pose()
  await page.mouse.move(bounds.x + 120, bounds.y + 120)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(bounds.x + 220, bounds.y + 155, { steps: 8 })
  await page.mouse.up({ button: 'right' })
  await expect
    .poll(async () => JSON.stringify((await pose()).position))
    .not.toBe(JSON.stringify(beforePan.position))
  expect((await pose()).forward).toEqual(beforePan.forward)
})

test('selection focuses immediately with reduced motion and graphics changes preserve it', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const canvas = page.locator('canvas')
  await expect(canvas).toHaveAttribute('data-camera-moving', 'false')
  const initial = await canvas.getAttribute('data-camera-position')
  await page.getByRole('button', { name: 'Select Sentinel', exact: true }).click()
  await expect(canvas).toHaveAttribute('data-camera-moving', 'false')
  await expect.poll(() => canvas.getAttribute('data-camera-position')).not.toBe(initial)
  await page.getByRole('button', { name: 'Use lighter graphics' }).click()
  await expect(page.getByRole('button', { name: 'Use lighter graphics' })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await expect(page.locator('.inspector h2')).toHaveText('Sentinel')
  await page.getByRole('button', { name: 'Close instrument details' }).click()
  await expect(page.locator('.inspector')).toBeHidden()
})
