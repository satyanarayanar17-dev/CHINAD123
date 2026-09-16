import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
 testDir: './tests',
 testMatch: 'responsive.spec.ts',
 fullyParallel: false,
 workers: 1,
 timeout: 120000,
 reporter: [['list'], ['json', { outputFile: 'qa-evidence/05-responsive/responsive-results.json' }]],
 use: { baseURL: 'http://127.0.0.1:5179', screenshot: 'only-on-failure', trace: 'retain-on-failure' },
 projects: [
   { name: 'Desktop Chrome', use: { ...devices['Desktop Chrome'] } },
   { name: 'Desktop Safari', use: { ...devices['Desktop Safari'] } },
   { name: 'Tablet iOS', use: { ...devices['iPad Mini'] } },
   { name: 'Mobile Chrome', use: { ...devices['Pixel 5'] } },
   { name: 'Mobile Safari', use: { ...devices['iPhone 12 Mini'] } },
   { name: 'Mobile Small', use: { viewport: { width: 320, height: 568 }, browserName: 'chromium' } }
 ],
 webServer: [
  { command: 'node tests/start-responsive.cjs', url: 'http://127.0.0.1:3007/api/v1/auth/opd/config', timeout: 120000, reuseExistingServer: true },
  { command: 'VITE_DEV_API_PROXY_TARGET=http://127.0.0.1:3007 npx vite --host 127.0.0.1 --port 5179 --strictPort', url: 'http://127.0.0.1:5179', timeout: 60000, reuseExistingServer: true }
 ]
});
