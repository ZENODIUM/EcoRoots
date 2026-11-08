import { expect, test, type Page } from '@playwright/test'

const shot = (page: Page, name: string) => page.screenshot({ path: `../docs/screenshots/evidence-${name}.png` })

test('live run streams over SSE, the graph settles, the report opens', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/#/evidence')
  await page.getByTestId('start-run').click()
  await expect(page).toHaveURL(/run=run_/)
  await expect(page.getByTestId('dag').locator('[data-node]')).toHaveCount(13)
  await expect(page.getByTestId('run-status')).toHaveText(/completed/, { timeout: 90_000 })
  await expect(page.locator('[data-node="report"]')).toHaveAttribute('data-state', 'completed')
  await expect(page.getByTestId('run-summary')).toContainText('study-backed scenario only')
  await expect(page.getByTestId('run-summary')).toContainText('Verification checks')
  await expect(page.getByTestId('event-log').locator('li').first()).toBeVisible()
  await shot(page, '01-run')
  await page.locator('[data-node="gate"]').click()
  await expect(page.getByTestId('node-inspector')).toContainText('quota_answer')
  const href = await page.getByTestId('report-link').getAttribute('href')
  expect((await page.request.get(href!)).ok()).toBeTruthy()
  expect(errors).toEqual([])
})

test('fault injection: provider failure is surfaced, never hidden', async ({ page }) => {
  await page.goto('/#/evidence')
  await page.locator('.launcher summary').click()
  await page.getByTestId('inject-provider_failure').check()
  await page.getByTestId('start-run').click()
  await expect(page.getByTestId('run-status')).toHaveText(/completed-with-failures/, { timeout: 90_000 })
  await expect(page.locator('[data-node="geo"]')).toHaveAttribute('data-state', 'failed')
  await expect(page.locator('[data-node="verify"]')).toHaveAttribute('data-state', 'human-review')
  await shot(page, '02-fault')
})

test('experiment registry shows negative results verbatim; sources list provenance', async ({ page }) => {
  await page.goto('/#/evidence')
  await page.getByTestId('tab-registry').click()
  const reg = page.getByTestId('registry')
  await expect(reg.locator('.exps > li')).toHaveCount(15)
  await expect(reg).toContainText('failed/negative')
  await expect(reg).toContainText('inconclusive')
  await expect(reg).toContainText('Spearman rho=-1.00')
  await shot(page, '03-registry')
  await page.getByTestId('tab-sources').click()
  await expect(page.getByTestId('sources')).toContainText('COMPADRE Plant Matrix Database v6.26.3.0')
  await expect(page.getByTestId('sources')).toContainText('raw file not redistributed')
})
