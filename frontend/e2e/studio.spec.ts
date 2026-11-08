import { expect, test } from '@playwright/test'

test('studio: three-species plot, timeline, inspector agrees with the projection, save', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/#/simulate')
  await expect(page.getByTestId('studio')).toBeVisible()
  await expect(page.getByTestId('studio-banner')).toContainText('Independent species')
  await page.getByTestId('load-demo').click()
  await expect(page.getByTestId('inspector-card')).toHaveCount(3)
  await expect(page.locator('[data-testid=inspector-card] [data-testid=outlook]')).toHaveCount(3)
  const jat = page.getByTestId('inspector-card').first()
  const start = await jat.getByTestId('plants-now').innerText()
  await page.getByTestId('year').fill('10')
  await expect(jat.getByTestId('plants-now')).not.toHaveText(start)
  // scaling is applied once: shown total = API total(t) x start / API total(0), and the stage counts add up to it
  await expect(jat).toHaveAttribute('data-year', '10')
  const a = (k: string) => jat.getAttribute(k).then(Number)
  const [st, apiT, apiT0, shown] = [await a('data-start'), await a('data-api-total'), await a('data-api-total0'), await a('data-total')]
  expect(apiT0).toBeGreaterThan(0)
  expect(Math.abs(shown - Math.round((apiT * st) / apiT0))).toBeLessThanOrEqual(1)
  const stages = (await jat.getAttribute('data-stage-counts'))!.split(',').map(Number)
  expect(Math.abs(stages.reduce((x, y) => x + y, 0) - shown)).toBeLessThanOrEqual(stages.length)
  await expect(page.getByTestId('scale-legend')).toContainText('model')
  await expect(jat.getByTestId('start-passport')).toBeVisible()
  await page.getByPlaceholder('Name this plot').fill('e2e three-species plot')
  await page.getByTestId('save-scene').click()
  await expect(page.getByTestId('scene-msg')).toBeVisible()
  await page.screenshot({ path: '../docs/screenshots/v2-studio.png' })
  expect(errors).toEqual([])
})

test('studio: falls back to a 2D plot without WebGL', async ({ page }) => {
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext
    // @ts-expect-error test stub
    HTMLCanvasElement.prototype.getContext = function (t: string, ...a: unknown[]) { return /webgl/.test(t) ? null : orig.call(this, t, ...a) }
  })
  await page.goto('/#/simulate')
  await page.getByTestId('load-demo').click()
  await expect(page.getByTestId('plot-2d')).toBeVisible()
})

test('studio: small screens start in 2D', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 })
  await page.goto('/#/simulate')
  await page.getByTestId('load-demo').click()
  await expect(page.getByTestId('plot-2d')).toBeVisible()
})
