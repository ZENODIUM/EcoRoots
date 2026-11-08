import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// Phone-width smoke test (412×915): each page renders, nothing scrolls sideways, no serious a11y issues.
for (const [path, ready] of [['explore', 'cases'], ['simulate', 'studio'], ['plan/ops', 'harvestops'], ['plan/methods', 'methods'], ['evidence', 'runlist']] as const) {
  test(`mobile: ${path}`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(`/#/${path}`)
    await expect(page.getByTestId(ready)).toBeVisible()
    if (path === 'simulate') await expect(page.getByTestId('plot-2d')).toBeVisible()
    await page.waitForTimeout(1000)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(1)
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).exclude('.globe-host').analyze()
    expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([])
    await page.screenshot({ path: `../docs/screenshots/mobile-${path.replace('/', '-')}.png` })
    expect(errors).toEqual([])
  })
}
