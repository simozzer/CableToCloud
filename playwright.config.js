// Browser tests for the user interface: npm run test:e2e
// Uses your installed Google Chrome. To use Playwright's own browser instead:
//   npx playwright install chromium   then   PW_CHANNEL=chromium npm run test:e2e
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'test/e2e',
  timeout: 30000,
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    channel: process.env.PW_CHANNEL || 'chrome',
    viewport: { width: 1500, height: 950 },
  },
});
