import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', timeout: 60000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:3100', headless: true, viewport: { width: 1600, height: 1000 }, launchOptions: { executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox'] } },
  webServer: { command: 'npm run build && NODE_ENV=production PORT=3100 MEDIA_DIR=/tmp/taledit-e2e-media npm start', url: 'http://127.0.0.1:3100/api/health', reuseExistingServer: false },
});
