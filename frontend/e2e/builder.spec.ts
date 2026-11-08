import { expect, test } from '@playwright/test'

test('workflow builder: drag, remove, presets, checks and a custom run', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/#/evidence')
  await page.getByTestId('tab-builder').click()
  const canvas = page.getByTestId('wfb-canvas')
  await expect(canvas.getByTestId('node-jev_triage')).toBeVisible()
  // required steps are locked
  await expect(canvas.getByTestId('remove-query_plan')).toHaveCount(0)

  // drag a step out to the palette, then back in
  await canvas.getByTestId('node-stochastic_lambda').dragTo(page.getByTestId('wfb-palette'))
  await expect(page.getByTestId('palette-stochastic_lambda')).toBeVisible()
  await expect(page.getByTestId('graph-stochastic_lambda')).toHaveCount(0)
  await page.getByTestId('palette-stochastic_lambda').dragTo(canvas)
  await expect(canvas.getByTestId('node-stochastic_lambda')).toBeVisible()
  await expect(page.getByTestId('graph-stochastic_lambda')).toHaveCount(1)

  // removing a dependency surfaces a check and greys out the dependant
  await page.getByTestId('remove-extract_claims').click()
  await expect(page.getByTestId('wfb-checks')).toContainText('Second-model check will be skipped')
  await expect(canvas.getByTestId('node-claim_verify')).toHaveClass(/skipped/)
  await page.getByTestId('remove-jev_triage').click()
  await expect(page.getByTestId('wfb-checks')).toContainText('keyword rules only')

  // preset: matrices only, run it
  await page.getByTestId('preset-matrices').click()
  await expect(canvas.getByTestId('node-jev_triage')).toHaveCount(0)
  await page.getByTestId('wfb-species').fill('Prunus africana')
  await page.getByTestId('wfb-organ').selectOption('bark')
  await page.getByTestId('wfb-country').fill('Cameroon')
  await page.getByTestId('wfb-run').click()
  await expect(page).toHaveURL(/run=run_/)
  await expect(page.getByTestId('run-status')).toHaveText(/completed/, { timeout: 110_000 })
  await expect(page.locator('[data-node="matrix_sensitivity"]')).toHaveAttribute('data-state', 'completed')
  await expect(page.locator('[data-node="jev_triage"]')).toHaveCount(0)
  const summary = page.getByTestId('agent-summary')
  await expect(summary).toContainText('Prunus africana')
  await expect(summary.getByTestId('agent-finding').first()).toBeVisible()
  await expect(summary).toContainText('computed here')
  await page.screenshot({ path: '../docs/screenshots/evidence-builder-run.png' })
  expect(errors).toEqual([])
})
