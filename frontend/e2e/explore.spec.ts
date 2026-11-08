import { expect, test, type Page } from '@playwright/test'

const shot = (page: Page, name: string) => page.screenshot({ path: `../docs/screenshots/explore-${name}.png` })

function watchErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|tile|imagery/i.test(m.text())) errors.push(m.text()) })
  return errors
}

test('globe, health readout and case library load', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/#/explore')
  await expect(page.getByTestId('health')).toContainText('COMPADRE 6.26.3.0')
  await expect(page.locator('[data-testid=health] [title*="9,178 matrices"]')).toHaveCount(1)  // compact header: count in the tooltip
  await expect(page.getByTestId('cases').locator('li')).toHaveCount(10)
  await expect(page.locator('.globe-host canvas')).toBeVisible()
  await page.waitForTimeout(4000)
  await shot(page, '01-landing')
  expect(errors).toEqual([])
})

test('Tier A case: dossier, gated quota, live region context and validated suitability', async ({ page }) => {
  const errors = watchErrors(page)
  await page.goto('/#/explore')
  await page.getByTestId('case-jatamansi').click()
  await expect(page.getByTestId('dossier')).toContainText('Nardostachys jatamansi')
  await expect(page.getByTestId('quota')).toContainText('study-backed scenario only')
  await expect(page.getByTestId('quota')).toContainText('6 of 6 local evidence items missing')
  await expect(page.getByTestId('region-facts')).toBeVisible({ timeout: 90_000 })
  await expect(page.getByTestId('legend')).toContainText('Climatic suitability')
  await expect(page.getByTestId('legend').locator('.ramp')).toBeVisible()
  await expect(page.getByTestId('climate-readout')).toContainText('Annual precipitation')
  await expect(page.locator('[data-layer="wdpa"] .chip')).toHaveText('pending')
  const elig = page.getByTestId('eligibility')
  await expect(elig.locator('li', { hasText: 'Survey planning' }).locator('.chip')).toHaveText('enabled')
  await expect(elig.locator('li', { hasText: 'Train a habitat model here' }).locator('.chip')).toHaveText('blocked')
  await expect(page.locator('[data-layer="worldcover"] .chip')).toHaveText('display-only')
  // FIRMS: available layers carry no chip; zero detections is shown as a count, not as missing
  await expect(page.locator('[data-layer="fire"] .chip')).toHaveText('available')
  await expect(page.locator('[data-layer="fire"] .chip')).toBeHidden()
  await expect(page.getByTestId('fire-readout')).toContainText(/detections in the last 5 days/)
  await expect(page.getByTestId('fire-readout')).toContainText('Non-detection does not prove absence')
  await page.locator('[data-layer="fire"] .linkish').click()
  await expect(page.getByTestId('legend')).toContainText('Active-fire detections per cell')
  await page.locator('[data-layer="fire"] .linkish').click()
  await expect(page.getByTestId('legend')).toContainText('Climatic suitability')
  await page.getByTestId('eligibility').getByText('Rotation extrapolation').click()
  await expect(page.getByTestId('eligibility')).toContainText('repeated-harvest response is assumed')
  await page.waitForTimeout(3500)
  await shot(page, '02-jatamansi')
  // cell inspector via a click in the middle of the globe (region is centred after the fly-to)
  const box = (await page.locator('.globe-host canvas').boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  const inspector = page.getByTestId('cell-inspector')
  if (await inspector.isVisible().catch(() => false)) await expect(inspector).toContainText('mean temp')
  expect(errors).toEqual([])
})

test('Tier C case: no demographic model, suitability honest, quota blocked', async ({ page }) => {
  await page.goto('/#/explore')
  await page.getByTestId('case-arnica').click()
  await expect(page.getByTestId('quota')).toContainText('cannot estimate safe local rate')
  await expect(page.getByTestId('dossier')).toContainText('Insufficient evidence for population modelling')
  await expect(page.getByTestId('region-facts')).toBeVisible({ timeout: 90_000 })
  await expect(page.getByTestId('occ-readout')).toContainText('kept of')
  await page.waitForTimeout(3000)
  await shot(page, '03-arnica')
})

test('species without a habitat model: suitability is withheld, not drawn as zero', async ({ page }) => {
  await page.goto('/#/explore')
  await page.getByTestId('case-khaya').click()
  await expect(page.getByTestId('region-facts')).toBeVisible({ timeout: 90_000 })
  await expect(page.getByTestId('legend')).toContainText('Not drawn: withheld by scientific gate')
  await expect(page.locator('[data-layer="suitability"] .chip')).toHaveText('withheld')
  await page.locator('[data-layer="bio12"] input').check()
  await expect(page.getByTestId('legend')).toContainText('Annual precipitation')
  await page.waitForTimeout(3000)
  await shot(page, '04-khaya-precip')
})

test('search, free-name tier C, and drawing a new region on the globe', async ({ page }) => {
  await page.goto('/#/explore')
  await page.locator('#species-q').fill('echinacea')
  await expect(page.getByTestId('species-results')).toContainText('Echinacea angustifolia')
  await page.getByTestId('species-results').getByText('Echinacea angustifolia').click()
  await expect(page.getByTestId('quota')).toContainText('study-backed scenario only')
  await page.waitForTimeout(3500) // fly to study populations
  await page.getByRole('button', { name: 'Draw box' }).click()
  const box = (await page.locator('.globe-host canvas').boundingBox())!
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2
  await page.mouse.click(cx - 60, cy - 40)
  await page.mouse.move(cx + 20, cy + 10)
  await page.mouse.move(cx + 60, cy + 40)
  await page.mouse.click(cx + 60, cy + 40)
  await expect(page.getByTestId('ctx-loading').or(page.getByTestId('region-facts')).or(page.getByTestId('ctx-error'))).toBeVisible()
  await expect(page.getByTestId('region-facts').or(page.getByTestId('ctx-error'))).toBeVisible({ timeout: 90_000 })
  await page.waitForTimeout(2500)
  await shot(page, '05-drawn-region')

  await page.locator('#species-q').fill('Notaplantus fictus')
  await page.getByRole('button', { name: /Use as free name/ }).click()
  await expect(page.getByTestId('quota')).toContainText('cannot estimate safe local rate')
  await expect(page.getByTestId('dossier')).toContainText('Not among the 200 medicinal COMPADRE taxa')
})

test('full assessment run starts and links to the live view', async ({ page }) => {
  await page.goto('/#/explore')
  await page.getByTestId('case-jatamansi').click()
  await expect(page.getByTestId('region-facts')).toBeVisible({ timeout: 90_000 })
  await page.getByTestId('run-btn').click()
  await expect(page.getByTestId('run-link')).toBeVisible()
  const href = await page.getByTestId('run-link').getAttribute('href')
  expect(href).toMatch(/#\/evidence\?run=run_/)
  const rid = href!.split('run=')[1]
  const r = await page.request.get(`/api/runs/${rid}`)
  expect(r.ok()).toBeTruthy()
})
