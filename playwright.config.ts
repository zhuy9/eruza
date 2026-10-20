import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node --import tsx server/dev.ts',
    url: 'http://127.0.0.1:5173',
    env: { MOCK: '1', ADO_ORG: '', ADO_DEFAULT_PROJECT: '', PORT: '3001' },
    reuseExistingServer: false,
  },
});
