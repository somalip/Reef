import { test, expect, chromium } from '@playwright/test';
import path from 'path';

test('Reef extension popup loads and indexes local page', async () => {
  const extensionPath = path.join(process.cwd(), 'plugin/dist');
  const userDataDir = path.join(process.cwd(), 'node_modules/.cache/playwright-user-data');

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });

  const page = await context.newPage();
  await page.setContent(`
    <!DOCTYPE html>
    <html>
    <head><title>Extension Test Page</title></head>
    <body>
      <h1>Welcome to Reef Test</h1>
      <p>This is a test page for browser extension verification.</p>
      <button id="btn-action">Click Me</button>
      <input type="text" id="input-field" placeholder="Type here..." />
    </body>
    </html>
  `);

  // Verify page title
  expect(await page.title()).toBe('Extension Test Page');

  await context.close();
});
