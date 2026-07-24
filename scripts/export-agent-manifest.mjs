#!/usr/bin/env node
/* Optional deploy-time helper. Install Playwright separately, then run:
   npm run export-manifest -- https://example.com dist/.well-known/agent-manifest.json */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const [url, output = '.well-known/agent-manifest.json'] = process.argv.slice(2);
if (!url) throw new Error('Usage: npm run export-manifest -- <url> [output-path]');
let playwright;
try { playwright = await import('playwright'); } catch { throw new Error('This optional helper requires Playwright: npm install -D playwright'); }
const browser = await playwright.chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(window.__reefAgentManifest));
  const manifest = await page.evaluate(() => window.__reefAgentManifest);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(`Wrote ${output}`);
} finally { await browser.close(); }
