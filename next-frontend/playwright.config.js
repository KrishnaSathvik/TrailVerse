import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  // Cold Next development compilation plus multi-page flows can exceed 30s in CI.
  timeout: 60000,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  webServer: process.env.PLAYWRIGHT_SKIP_WEB_SERVER === '1' ? undefined : [
    {
      command: 'cd ../server && node --require ./tests/e2eBootstrap.js server.js',
      env: { NODE_ENV: 'test', TRAILIE_TEST_PROVIDER_MODE: 'deny_live' },
      port: 5001,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev -- --port 3000',
      env: { NODE_ENV: 'development' },
      port: 3000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
