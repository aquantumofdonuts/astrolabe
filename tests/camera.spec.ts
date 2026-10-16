import { expect, test, type Page } from '@playwright/test'
import { PerspectiveCamera, Quaternion, Vector3 } from 'three'

async function pose(page: Page) {
  return page.locator('canvas').evaluate((canvas) => ({
    position: JSON.parse(canvas.dataset.cameraPosition!) as number[],
    quaternion: JSON.parse(canvas.dataset.cameraQuaternion!) as number[],
    focus: JSON.parse(canvas.dataset.cameraFocus!) as number[],
  }))
}
async function frame(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  )
}

test.beforeEach(async ({ page }) => {
  // Input timing is exercised without software-rendered shadows/postprocessing.
  await page.addInitScript(() => localStorage.setItem('astrolabe.economical', 'true'))
  await page.goto('/')
  await expect(page.locator('canvas')).toHaveAttribute('data-camera-moving', 'false')
})

test('one held left drag completes full rotations in either direction on both axes', async ({
  page,
}) => {
  test.setTimeout(60000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(
    page.getByRole('button', { name: 'Pause ambient motion', exact: true })
  ).toBeDisabled()
  const canvas = page.locator('canvas')
  const region = page.getByRole('region', { name: 'Free-flight camera', exact: true })
  const bounds = (await canvas.boundingBox())!
  const start = { x: bounds.x + bounds.width / 2 + 25, y: bounds.y + bounds.height / 2 - 20 }
  for (const axis of ['horizontal', 'vertical']) {
    for (const direction of [-1, 1]) {
      await page.getByRole('button', { name: 'Reset camera', exact: true }).click()
      await expect(canvas).toHaveAttribute('data-camera-moving', 'false')
      const initial = await pose(page)
      await region.evaluate((element) => {
        element.addEventListener(
          'pointerdown',
          (event) => (element.dataset.testPointerId = String((event as PointerEvent).pointerId)),
          { once: true }
        )
      })
      await page.mouse.move(start.x, start.y)
      await page.mouse.down()
      const pivot = JSON.parse((await canvas.getAttribute('data-orbit-pivot'))!) as number[]
      const initialAnchor = new Vector3()
        .fromArray(pivot)
        .sub(new Vector3().fromArray(initial.position))
        .applyQuaternion(new Quaternion().fromArray(initial.quaternion).invert())
      for (let step = 1; step <= 8; step++) {
        const angle = (direction * step * Math.PI) / 2
        // Extend the same drag beyond the viewport without releasing or repicking its pivot.
        await region.evaluate(
          (element, { x, y }) => {
            element.dispatchEvent(
              new PointerEvent('pointermove', {
                bubbles: true,
                pointerId: Number(element.dataset.testPointerId),
                pointerType: 'mouse',
                buttons: 1,
                clientX: x,
                clientY: y,
              })
            )
          },
          {
            x: start.x - (axis === 'horizontal' ? (angle * bounds.height) / Math.PI : 0),
            y: start.y - (axis === 'vertical' ? (angle * bounds.height) / Math.PI : 0),
          }
        )
        await frame(page)
        const current = await pose(page)
        const expected = new Quaternion()
          .setFromAxisAngle(new Vector3(0, 1, 0), axis === 'horizontal' ? angle : 0)
          .multiply(new Quaternion().fromArray(initial.quaternion))
          .multiply(
            new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), axis === 'vertical' ? angle : 0)
          )
        expect(new Quaternion().fromArray(current.quaternion).angleTo(expected)).toBeLessThan(
          0.000001
        )
        const anchor = new Vector3()
          .fromArray(pivot)
          .sub(new Vector3().fromArray(current.position))
          .applyQuaternion(new Quaternion().fromArray(current.quaternion).invert())
        expect(anchor.distanceTo(initialAnchor)).toBeLessThan(0.000001)
      }
      await page.mouse.up()
      await frame(page)
      const released = await pose(page)
      await page.waitForTimeout(100)
      expect(await pose(page)).toEqual(released)
    }
  }
})

test('empty-space orbit starts beneath each press, locks its pivot, and stops without drift', async ({
  page,
}) => {
  const canvas = page.locator('canvas'),
    bounds = (await canvas.boundingBox())!
  const project = (current: Awaited<ReturnType<typeof pose>>, point: number[]) => {
    const camera = new PerspectiveCamera(42, bounds.width / bounds.height, 0.035, 300)
    camera.position.fromArray(current.position)
    camera.quaternion.fromArray(current.quaternion)
    camera.updateMatrixWorld()
    const projected = new Vector3().fromArray(point).project(camera)
    return {
      x: bounds.x + ((projected.x + 1) * bounds.width) / 2,
      y: bounds.y + ((1 - projected.y) * bounds.height) / 2,
    }
  }
  for (const [x, y] of [
    [80, 110],
    [bounds.width - 80, 110],
    [90, 180],
  ]) {
    const start = { x: bounds.x + x, y: bounds.y + y }
    const before = await pose(page)
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await expect(canvas).toHaveAttribute('data-orbit-surface', 'cursor')
    const pivot = JSON.parse((await canvas.getAttribute('data-orbit-pivot'))!) as number[]
    expect(
      new Vector3().fromArray(pivot).distanceTo(new Vector3().fromArray(before.focus))
    ).toBeGreaterThan(1)
    const screen = project(before, pivot)
    expect(Math.hypot(screen.x - start.x, screen.y - start.y)).toBeLessThan(0.1)
    await frame(page)
    expect(await pose(page)).toEqual(before) // No camera snap on press.
    for (const offset of [25, 50]) {
      await page.mouse.move(start.x + offset, start.y + offset / 2, { steps: 4 })
      await frame(page)
      const during = await pose(page)
      expect(during.focus).toEqual(pivot) // Never repick beneath the moving cursor.
      const anchored = project(during, pivot)
      expect(Math.hypot(anchored.x - start.x, anchored.y - start.y)).toBeLessThan(0.1)
    }
    await expect(page.locator('.camera-focus-marker')).toHaveCount(0)
    await page.mouse.up()
    await frame(page)
    const current = await pose(page)
    expect(
      new Vector3(1, 0, 0).applyQuaternion(new Quaternion().fromArray(current.quaternion)).y
    ).toBeCloseTo(0, 6)
    await expect(canvas).toHaveAttribute('data-camera-moving', 'false')
    await page.waitForTimeout(200)
    expect((await pose(page)).position).toEqual(current.position)
  }
})

test('wheel zoom holds its cursor anchor in place and reverses without queued motion', async ({
  page,
}) => {
  const canvas = page.locator('canvas'),
    bounds = (await canvas.boundingBox())!
  const cursor = { x: bounds.x + bounds.width * 0.68, y: bounds.y + bounds.height * 0.43 }
  const before = await pose(page)
  await page.mouse.move(cursor.x, cursor.y)
  await page.mouse.wheel(0, -120)
  await frame(page)
  await expect(canvas).toHaveAttribute('data-camera-moving', 'false')
  const after = await pose(page)
  const project = (cameraPose: typeof before, point: number[]) => {
    const camera = new PerspectiveCamera(42, bounds.width / bounds.height, 0.035, 300)
    camera.position.fromArray(cameraPose.position)
    camera.quaternion.fromArray(cameraPose.quaternion)
    camera.updateMatrixWorld()
    const projected = new Vector3().fromArray(point).project(camera)
    return {
      x: bounds.x + ((projected.x + 1) * bounds.width) / 2,
      y: bounds.y + ((1 - projected.y) * bounds.height) / 2,
    }
  }
  const originalScreen = project(before, after.focus),
    newScreen = project(after, after.focus)
  expect(Math.hypot(originalScreen.x - cursor.x, originalScreen.y - cursor.y)).toBeLessThan(1)
  expect(Math.hypot(newScreen.x - cursor.x, newScreen.y - cursor.y)).toBeLessThan(1)
  const distance = new Vector3()
    .fromArray(after.position)
    .distanceTo(new Vector3().fromArray(after.focus))
  await page.mouse.wheel(0, -200)
  await frame(page)
  const reversedAt = await pose(page)
  await page.mouse.wheel(0, 120)
  await frame(page)
  await expect(canvas).toHaveAttribute('data-camera-moving', 'false')
  const reversed = await pose(page)
  const anchor = new Vector3().fromArray(reversed.focus)
  expect(new Vector3().fromArray(reversed.position).distanceTo(anchor)).toBeGreaterThan(
    new Vector3().fromArray(reversedAt.position).distanceTo(anchor)
  )
  expect(
    new Vector3().fromArray(after.position).distanceTo(new Vector3().fromArray(before.position))
  ).toBeGreaterThan(1)
  expect(distance).toBeGreaterThan(0.8)
})

test('double-click focuses a surface and a fresh drag interrupts travel at the visible pose', async ({
  page,
}) => {
  const canvas = page.locator('canvas'),
    bounds = (await canvas.boundingBox())!
  const home = await pose(page)
  await page.mouse.dblclick(bounds.x + bounds.width / 2 + 25, bounds.y + bounds.height / 2 - 20)
  await expect
    .poll(async () => {
      const current = await pose(page)
      return new Vector3()
        .fromArray(current.position)
        .distanceTo(new Vector3().fromArray(current.focus))
    })
    .toBeCloseTo(4.5, 2)
  await expect(canvas).toHaveAttribute('data-camera-moving', 'false')
  const focused = await pose(page)
  expect(
    new Vector3().fromArray(focused.position).distanceTo(new Vector3().fromArray(focused.focus))
  ).toBeCloseTo(4.5, 2)
  await page.getByRole('button', { name: 'Reset camera', exact: true }).click()
  await expect(canvas).toHaveAttribute('data-camera-moving', 'true')
  await page.mouse.move(bounds.x + 50, bounds.y + 110)
  await page.mouse.down()
  await frame(page)
  const interrupted = await pose(page)
  await page.mouse.up()
  await page.waitForTimeout(700)
  expect((await pose(page)).position).toEqual(interrupted.position)
  expect(interrupted.position[2]).toBeLessThan(home.position[2])
})

test('UI keys do not move the camera and losing window focus stops movement', async ({ page }) => {
  const canvas = page.locator('canvas')
  await page.getByRole('button', { name: 'Select Sentinel', exact: true }).focus()
  const initial = await pose(page)
  await page.keyboard.press('w')
  await frame(page)
  expect((await pose(page)).position).toEqual(initial.position)
  await page.getByRole('region', { name: 'Free-flight camera', exact: true }).focus()
  await page.keyboard.down('w')
  await expect
    .poll(async () => (await pose(page)).position[2])
    .toBeLessThan(initial.position[2] - 0.2)
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await frame(page)
  const stopped = await pose(page)
  await page.keyboard.up('w')
  await page.waitForTimeout(200)
  expect((await pose(page)).position).toEqual(stopped.position)
  await expect(canvas).toHaveAttribute('data-camera-moving', 'false')
})

test('native two-finger pan and pinch preserve orientation and end without drift', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  await page.getByRole('button', { name: 'Astrolabe', exact: true }).click()
  await expect(page.locator('canvas')).toHaveAttribute('data-camera-moving', 'false')
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 })
  const bounds = (await page.locator('canvas').boundingBox())!
  const x = bounds.x + bounds.width / 2,
    y = bounds.y + 115
  const initial = await pose(page)
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { id: 1, x: x - 45, y },
      { id: 2, x: x + 45, y },
    ],
  })
  for (let i = 1; i <= 8; i++) {
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { id: 1, x: x - 45 - i * 2, y: y + i },
        { id: 2, x: x + 45 + i * 5, y: y + i },
      ],
    })
  }
  // Lift only the second finger; the remaining one must rebase without a jump.
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [{ id: 1, x: x - 61, y: y + 8 }],
  })
  await frame(page)
  const released = await pose(page)
  expect(
    new Vector3().fromArray(released.position).distanceTo(new Vector3().fromArray(initial.position))
  ).toBeGreaterThan(1)
  expect(released.quaternion).toEqual(initial.quaternion)
  await page.waitForTimeout(200)
  expect((await pose(page)).position).toEqual(released.position)
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ id: 1, x: x - 26, y: y + 23 }],
  })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await frame(page)
  const final = await pose(page)
  expect(
    new Vector3(1, 0, 0).applyQuaternion(new Quaternion().fromArray(final.quaternion)).y
  ).toBeCloseTo(0)
})
