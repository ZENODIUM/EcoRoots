import { expect, test, type Page } from '@playwright/test'

const shot = (page: Page, name: string) => page.screenshot({ path: `../docs/screenshots/simulate-${name}.png` })

test('flagship study: board, dose response, LTRE and blocked quota', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/#/simulate/science')
  const result = page.getByTestId('sim-result')
  await expect(result).toContainText('Study-backed')
  // values reproduced by the engine (E03): control 1.028, 75% harvest 0.737
  await expect(result).toContainText('1.028')
  await expect(result).toContainText('0.737')
  await expect(page.getByTestId('ltre')).toBeVisible()
  await expect(page.getByTestId('board').locator('circle')).toHaveCount(6)
  await expect(page.getByTestId('trajectory')).toBeVisible()
  await expect(page.getByTestId('sim-quota')).toContainText('study-backed scenario only')
  await shot(page, '01-flagship')
  expect(errors).toEqual([])
})

test('rotation is labelled as extrapolation and responds to the interval', async ({ page }) => {
  await page.goto('/#/simulate/science')
  await page.getByTestId('mode-rotation').click()
  const result = page.getByTestId('sim-result')
  await expect(result).toContainText('Study-matrix extrapolation, not a permitted rotation')
  await expect(result).toContainText('5–33 years')
  const first = await result.locator('.big b').textContent()
  await page.getByTestId('rest-years').fill('12')
  await expect(result.locator('.big b')).not.toHaveText(first!)
  await shot(page, '02-rotation')
})

test('hypothetical removal carries the E05 calibration warning', async ({ page }) => {
  await page.goto('/#/simulate/science')
  await page.getByTestId('mode-hypothetical').click()
  await page.locator('.stagepick input').last().check()
  await expect(page.getByTestId('calibration-warning')).toContainText('E05')
  await expect(page.getByTestId('sim-result')).toContainText('Hypothetical')
  await shot(page, '03-hypothetical')
})

test('quota opens only with all six local evidence items, never as a permit', async ({ page }) => {
  await page.goto('/#/simulate/science')
  const q = page.getByTestId('sim-quota')
  const boxes = q.locator('input[type=checkbox]')
  for (let i = 0; i < 5; i++) await boxes.nth(i).check()
  await expect(q.locator('.quota-answer')).toHaveText('study-backed scenario only')
  await boxes.nth(5).check()
  await expect(q.locator('.quota-answer')).toHaveText('conditional field assessment eligible')
  await expect(q).toContainText('never issues harvest permits')
})

test('observational species: rotation disabled, comparison caveated, scenario saves', async ({ page }) => {
  await page.goto('/#/simulate/science')
  await page.getByRole('button', { name: 'Khaya' }).click()
  await expect(page.getByTestId('mode-rotation')).toBeDisabled()
  await expect(page.getByTestId('sim-result')).toContainText('not a causal effect estimate')
  await expect(page.getByTestId('sim-result')).toContainText('Permutation test p =')
  await page.getByPlaceholder('Name this scenario').fill('e2e khaya')
  await page.getByTestId('save-scenario').click()
  await expect(page.locator('.saved')).toContainText('e2e khaya')
  await shot(page, '04-khaya')
})

test.afterAll(async ({ request }) => {
  // remove scenarios created by this suite so repeated runs do not accumulate
  const r = await request.get('/api/items/scenario')
  for (const it of (await r.json()).items as { id: string; name: string }[]) if (it.name === 'e2e khaya') await request.delete(`/api/items/scenario/${it.id}`)
})
