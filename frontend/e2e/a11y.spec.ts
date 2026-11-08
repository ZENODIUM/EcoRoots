import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

// Serious/critical WCAG A/AA violations on each page (the Cesium canvas itself is excluded).
for (const [page, ready] of [['explore', 'cases'], ['simulate', 'studio'], ['simulate/science', 'sim-result'], ['plan', 'plate'], ['plan/ops', 'harvestops'], ['evidence', 'runlist']] as const) {
  test(`a11y: ${page}`, async ({ page: p }) => {
    await p.goto(`/#/${page}`)
    await expect(p.getByTestId(ready)).toBeVisible()
    await p.waitForTimeout(1500)
    const r = await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa']).exclude('.globe-host').analyze()
    const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
    console.log(page, bad.map((v) => `${v.id} (${v.nodes.length}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`).join('\n'))
    expect(bad.map((v) => v.id)).toEqual([])
  })
}
