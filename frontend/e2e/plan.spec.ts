import { expect, test, type Page } from '@playwright/test'

const shot = (page: Page, name: string) => page.screenshot({ path: `../docs/screenshots/plan-${name}.png` })

test('survey: ILP plate, baselines incl. withheld top-suitability, budget sweep', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/#/plan')
  await expect(page.getByTestId('plate')).toBeVisible()
  const cmp = page.getByTestId('plan-compare')
  await expect(cmp).toContainText('Optimal (ILP)')
  await expect(cmp).toContainText('greedy')
  await expect(cmp).toContainText('unavailable: no validated habitat model')
  await expect(page.locator('[data-testid=plate] g[data-selected]')).toHaveCount(12)
  await expect(page.getByTestId('sweep')).toBeVisible()
  await page.locator('[data-testid=plate] g[data-selected]').first().hover()
  await expect(page.getByTestId('plan-cell')).toContainText('cost (assumed)')
  await shot(page, '01-survey')
  await page.getByTestId('budget').fill('4')
  await expect(page.locator('[data-testid=plate] g[data-selected]')).toHaveCount(4)
  expect(errors).toEqual([])
})

test('re-verification and evidence planning', async ({ page }) => {
  await page.goto('/#/plan')
  await page.getByTestId('intent-reverify').click()
  await expect(page.getByTestId('reverify-head')).toContainText('(Optimal)')
  await page.getByTestId('intent-evidence').click()
  const g = page.getByTestId('evidence-graph')
  await expect(g).toContainText('item greedy')
  await expect(g).toContainText('Optimal (ILP)')
  await shot(page, '02-evidence')
  await page.getByTestId('save-plan').click()
  await expect(page.getByTestId('saved-msg')).toContainText('Saved as')
})
