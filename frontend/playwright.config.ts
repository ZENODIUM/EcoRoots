import { defineConfig } from '@playwright/test'

// Requires the backend on :8000 and `npm run dev` on :5173 (see README).
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 60_000 },
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE || 'http://localhost:5173',
    viewport: { width: 1600, height: 960 },
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  projects: [
    { name: 'desktop', testIgnore: /mobile\.spec\.ts/ },
    { name: 'mobile', testMatch: /mobile\.spec\.ts/, use: { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true } },
  ],
})
