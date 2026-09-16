import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: 'security-browser.spec.ts', fullyParallel: false,
  workers: 1, timeout: 60000, outputDir: 'test-results/security',
  reporter: [['list'], ['json', { outputFile: 'qa-evidence/01-auth/security-browser-results.json' }]],
  use: { actionTimeout: 10000, baseURL: 'http://127.0.0.1:5175', viewport: { width: 1440, height: 900 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: [
    { command: 'node tests/start-security.cjs', url: 'http://127.0.0.1:3003/api/v1/auth/opd/config', timeout: 120000, reuseExistingServer: false },
    { command: 'VITE_DEV_API_PROXY_TARGET=http://127.0.0.1:3003 npx vite --host 127.0.0.1 --port 5175 --strictPort', url: 'http://127.0.0.1:5175', timeout: 60000, reuseExistingServer: false },
  ],
});
