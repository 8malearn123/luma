// إعداد سويت لوما — يشغّل خادماً ثابتاً محلياً ويختبر عليه
const { defineConfig } = require('@playwright/test');
module.exports = defineConfig({
  testDir: 'tests',
  timeout: 45000,
  retries: 1,
  use: {
    baseURL: 'http://127.0.0.1:8899',
    headless: true,
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: {
    command: 'python3 -m http.server 8899',
    port: 8899,
    reuseExistingServer: true,
  },
});
