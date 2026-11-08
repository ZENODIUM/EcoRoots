// Visual check: screenshot pages of the running app (dev server on :5173 + API on :8000). Not a test suite.
// Usage: node scripts/shoot.mjs <outDir> <name>=<hash>[@action] ...
//   actions: btn:<button name>, tid:<testid>, click:<css>, demo (Studio demo plants), studio:<Species>|<Species> (add these species to the Studio), wait:<ms>
import { chromium } from '../frontend/node_modules/playwright/index.mjs'
import { mkdirSync } from 'node:fs'

const [outDir, ...shots] = process.argv.slice(2)
mkdirSync(outDir, { recursive: true })
const base = process.env.SHOOT_BASE || 'http://localhost:5173'
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: Number(process.env.SHOOT_W || 1600), height: Number(process.env.SHOOT_H || 960) } })
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
for (const spec of shots) {
  const [name, rest] = spec.split('=')
  const [hash, ...actions] = rest.split('@')
  await page.goto("about:blank")
  await page.goto(`${base}/${hash}`)
  await page.waitForLoadState('networkidle').catch(() => {})
  for (const a of actions) {
    if (a === 'demo') await page.getByTestId('load-demo').click()
    else if (a.startsWith('studio:')) {
      for (const sp of a.slice(7).split('|')) {
        await page.getByPlaceholder(/search/i).first().fill(sp)
        await page.locator('.st-add li button').first().click({ timeout: 20000 })
        await page.waitForTimeout(800)
      }
    } else if (a.startsWith('wait:')) await page.waitForTimeout(Number(a.slice(5)))
    else if (a.startsWith('click:')) await page.locator(a.slice(6)).first().click()
    else if (a.startsWith('btn:')) await page.getByRole('button', { name: a.slice(4), exact: true }).first().click()
    else if (a.startsWith('tid:')) await page.getByTestId(a.slice(4)).first().click()
    else if (a.startsWith('scroll:')) await page.locator(a.slice(7)).first().scrollIntoViewIfNeeded()
  }
  await page.waitForTimeout(Number(process.env.SHOOT_WAIT || 4000))
  await page.screenshot({ path: `${outDir}/${name}.png` })
  console.log('shot', name)
}
console.log(errors.length ? 'page errors:\n' + [...new Set(errors)].slice(0, 12).join('\n') : 'no page errors')
await browser.close()
