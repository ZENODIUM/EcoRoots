import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('harvest methods: yellow theme, organ switch, open-licence photos, AI analysis with proof', async ({ page }) => {
  test.setTimeout(240_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.emulateMedia({ reducedMotion: 'reduce' })  // axe must not sample mid-fade
  await page.goto('/#/plan/methods?organ=bark')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'ops')
  await expect(page.getByTestId('organ-bark')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('organ-process')).toContainText('survival')
  await expect(page.getByTestId('method-card')).toHaveCount(3)
  await page.getByTestId('organ-resin').click()
  await expect(page.getByTestId('organ-process')).toContainText('reproduction')
  // a photo is either shown with its credit, or its absence is stated
  const strip = page.getByTestId('photo-strip')
  await expect(strip.getByTestId('method-photo').or(strip.getByText('No open-licence photo'))).toBeVisible({ timeout: 60_000 })
  await expect(strip).toContainText('not expert-checked')
  const a11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(a11y.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? '')).map((v) => v.id)).toEqual([])
  await page.screenshot({ path: '../docs/screenshots/methods-resin.png' })

  await page.getByTestId('mt-species').fill('Boswellia papyrifera')
  await page.getByTestId('mt-analyse').click()
  await expect(page.getByTestId('mt-findings')).toBeVisible({ timeout: 200_000 })
  await expect(page.getByTestId('mt-finding').first()).toBeVisible()
  await page.getByTestId('mt-proof').first().click()
  await expect(page.locator('.mt-proof blockquote').first()).toBeVisible()
  await page.screenshot({ path: '../docs/screenshots/methods-analysis.png' })

  await page.goto('/#/explore')
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'ops')
  expect(errors).toEqual([])
})
