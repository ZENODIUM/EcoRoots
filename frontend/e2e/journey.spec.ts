import { expect, test } from '@playwright/test'
import path from 'node:path'

// One uninterrupted journey: Explore → Studio → Passport → real PDF upload → task → collect → dry → Evidence → export,
// then the Prunus bark contrast. Live AI providers are used when keys exist; assertions accept the rules fallback too.
test('flagship journey: Jatamansi end to end, Prunus bark contrast', async ({ page, request }) => {
  test.setTimeout(420_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  // 1. Explore
  await page.goto('/#/explore')
  await page.locator('#species-q').fill('jatamansi')
  await page.getByTestId('species-results').getByText('Nardostachys jatamansi').first().click()
  await expect(page.getByTestId('dossier')).toContainText('Nardostachys jatamansi')

  // 2. Studio at year 10, inspector agrees with the projection
  await page.getByTestId('simulate-this').click()
  const card = page.getByTestId('inspector-card').first()
  await expect(card).toBeVisible({ timeout: 60_000 })
  await page.getByTestId('year').fill('10')
  await expect(card).toHaveAttribute('data-year', '10')
  const n = (k: string) => card.getAttribute(k).then(Number)
  if ((await card.getAttribute('data-api-total0')) !== '') {
    expect(Math.abs((await n('data-total')) - Math.round(((await n('data-api-total')) * (await n('data-start'))) / (await n('data-api-total0'))))).toBeLessThanOrEqual(1)
  }

  // 3. Harvest Passport (demo workspace) with research cautions
  await page.goto('/#/plan/ops')
  await page.getByTestId('ws-demo').click()
  await page.getByTestId('new-passport').click()
  await page.getByTestId('np-species').fill('Nardostachys jatamansi')
  await page.getByTestId('np-organ').selectOption('rhizome')
  await page.getByTestId('np-jurisdiction').fill('Nepal')
  await page.getByTestId('np-create').click()
  await expect(page.getByTestId('passport')).toBeVisible()
  await expect(page.getByTestId('demo-access-banner')).toBeVisible()
  await expect(page.getByTestId('caution-card').first()).toBeVisible({ timeout: 180_000 })
  const jatCautions = await page.getByTestId('caution-card').allInnerTexts()
  const researchRun = await page.getByTestId('cautions-run').getAttribute('href')  // cached cautions point at the run that produced them

  // 4. Real upload through the file input → issue → task
  await page.getByTestId('tab-documents').click()
  await page.getByTestId('doc-upload').setInputFiles(path.resolve('../tests/fixtures/harvestops/pdfs/P04-wrong-organ/authorisation.pdf'))
  await page.getByTestId('doc-upload-btn').click()
  await expect(page.getByTestId('document')).toHaveCount(1, { timeout: 60_000 })
  await expect(page.getByTestId('issues')).not.toBeEmpty()
  await page.getByTestId('tab-prepare').click()
  const task = page.getByTestId('task').first()
  await expect(task).toBeVisible()

  // 5. Resolve the task (manager, with a reason)
  await task.getByTestId('task-resolve').click()
  await task.getByTestId('task-why').fill('Checked the authorisation with the issuing office')
  await task.getByRole('button', { name: 'Resolve', exact: true }).click()
  await expect(page.getByText('Task resolved')).toBeVisible()

  // 6. Collect 10 kg fresh, then dry 8 kg → 2 kg with 6 kg water lost
  await page.getByTestId('tab-collect').click()
  await page.getByTestId('harvest-form').getByLabel('Collector').fill('Journey collector')
  await page.getByTestId('harvest-qty').fill('10')
  await page.getByTestId('harvest-submit').click()
  await expect(page.getByText('Collection recorded')).toBeVisible()
  await page.getByTestId('tab-process').click()
  await page.getByTestId('process-form').getByLabel('From lot').selectOption({ index: 1 })
  await page.getByTestId('proc-in').fill('8')
  await page.getByTestId('proc-out').fill('2')
  await page.getByTestId('proc-moist').fill('6')
  await page.getByTestId('proc-submit').click()
  await expect(page.getByTestId('mass-balance')).toContainText('All mass accounted for')
  await expect(page.getByTestId('tolerance-label')).toContainText('not a scientific or legal standard')

  // 7. Export a valid PDF
  const href = await page.getByTestId('export-passport').getAttribute('href')
  const pdf = await request.get(href!)
  expect(pdf.ok()).toBeTruthy()
  expect((await pdf.body()).subarray(0, 4).toString()).toBe('%PDF')

  // 7b. Lineage: fresh lot → dried lot; a trace hold quarantines both and adds recall tasks
  await page.locator('[data-testid^="lineage-"]').first().click()
  const tree = page.getByTestId('lot-lineage')
  await expect(tree.locator('.ops-lnode')).toHaveCount(2)
  await expect(tree).toContainText('drying')
  await tree.getByLabel('Reason for trace hold').fill('journey test: contamination reported')
  await tree.getByTestId('trace-hold').click()
  await expect(page.getByTestId('trace-held')).toContainText('A recall review task was added')
  await expect(page.getByTestId('lots')).toContainText('on hold')
  await expect(tree.locator('.ops-lnode.held')).toHaveCount(2)

  // 8. Evidence: the research run shows the agent nodes
  expect(researchRun).toMatch(/run=run_/)
  await page.goto('/' + researchRun!)
  await expect(page.locator('[data-node="matrix_sensitivity"]')).toBeVisible({ timeout: 60_000 })

  // 9. Prunus bark (Cameroon): a different set of cautions
  await page.goto('/#/plan/ops')
  await page.getByTestId('new-passport').click()
  await page.getByTestId('np-species').fill('Prunus africana')
  await page.getByTestId('np-organ').selectOption('bark')
  await page.getByTestId('np-jurisdiction').fill('Cameroon')
  await page.getByTestId('np-create').click()
  await expect(page.getByTestId('caution-card').first()).toBeVisible({ timeout: 180_000 })
  const prunus = await page.getByTestId('caution-card').allInnerTexts()
  expect(prunus.join('|')).not.toEqual(jatCautions.join('|'))
  expect(prunus.join(' ')).toMatch(/bark/i)
  await page.screenshot({ path: '../docs/screenshots/journey-prunus.png' })
  expect(errors).toEqual([])
})
