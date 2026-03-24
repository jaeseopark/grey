import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './apps/demo/e2e',
  fullyParallel: true,
  retries: 1,
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry'
  },
  webServer: {
    command: 'pnpm --filter @grey/demo build && pnpm --filter @grey/demo preview --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 120_000
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium'
      }
    }
  ]
});
