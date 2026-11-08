import { expect, test } from '@playwright/test'

// Uses the demo workspace (synthetic only) and creates its own passport so it does not depend on seeded data.
test('harvestops: passport → synthetic document packet → cross-document finding → task → export', async ({ page, request }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/#/plan/ops')
  await page.getByTestId('ws-demo').click()
  await page.getByTestId('new-passport').click()
  await page.getByTestId('np-species').fill('Prunus africana')
  await page.getByTestId('np-organ').selectOption('bark')
  await page.getByTestId('np-jurisdiction').fill('Cameroon')
  await page.getByTestId('np-create').click()
  await expect(page.getByTestId('passport')).toBeVisible()
  await expect(page.getByTestId('passport')).toContainText('SYNTHETIC DEMO')
  await expect(page.getByTestId('cautions')).toBeVisible()
  await expect(page.getByTestId('caution-card').first()).toBeVisible()

  await page.getByTestId('tab-documents').click()
  await page.getByTestId('sample-select').selectOption('P04-wrong-organ')
  await page.getByTestId('sample-load').click()
  await expect(page.getByTestId('issues')).toContainText('Harvested part')
  await expect(page.getByTestId('document')).toHaveCount(2)
  await page.screenshot({ path: '../docs/screenshots/v2-harvestops-documents.png', fullPage: true })

  await page.getByTestId('tab-prepare').click()
  await expect(page.getByTestId('task').filter({ hasText: 'Harvested part' })).toHaveCount(1)

  const href = await page.getByTestId('export-passport').getAttribute('href')
  const pdf = await request.get(href!)
  expect(pdf.status()).toBe(200)
  expect((await pdf.body()).subarray(0, 4).toString()).toBe('%PDF')
  expect(errors).toEqual([])
})

test('harvestops: roles are enforced by the server', async ({ request }) => {
  const h = (role: string) => ({ 'X-EH-Role': role, 'X-EH-Workspace': 'demo', 'content-type': 'application/json' })
  const r = await request.post('/api/ops/passports', { headers: h('quality-reviewer'), data: { species: 'Prunus africana', organ: 'bark' } })
  expect(r.status()).toBe(403)
  const bad = await request.get('/api/ops/overview', { headers: { 'X-EH-Role': 'superuser', 'X-EH-Workspace': 'demo' } })
  expect(bad.status()).toBe(400)
})
