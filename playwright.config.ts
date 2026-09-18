import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.PLAYWRIGHT_PORT ?? 3000)
const host = process.env.PLAYWRIGHT_HOST ?? '127.0.0.1'
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://${host}:${port}`
const webServer = process.env.PLAYWRIGHT_SKIP_WEB_SERVER === '1'
  ? undefined
  : {
      command: `next dev --hostname ${host} --port ${port}`,
      url: baseURL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    }

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer,
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
