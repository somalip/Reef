import test from 'node:test';
import assert from 'node:assert/strict';
import { ConfigReader } from '../src/config/config-reader.js';

test('ConfigReader.setConfig stores config for ESM usage', () => {
  ConfigReader.setConfig({ sitemap: '/custom-sitemap.xml', maxPages: 100 });
  
  const config = ConfigReader.readConfig();
  assert.equal(config.sitemap, '/custom-sitemap.xml');
  assert.equal(config.maxPages, 100);
});

test('ConfigReader.readConfig returns defaults when no config or script', () => {
  const config = ConfigReader.readConfig();
  
  assert.equal(config.sitemap, '/sitemap.xml');
  assert.equal(config.maxPages, 500);
  assert.equal(config.mode, 'opaque');
  assert.equal(config.headless, false);
  assert.equal(config.indexActions, true);
  assert.equal(config.indexMedia, true);
  assert.equal(config.indexStructuredData, true);
  assert.equal(config.indexHidden, true);
});

test('ConfigReader.setConfig clears after read', () => {
  ConfigReader.setConfig({ sitemap: '/test-sitemap.xml' });
  
  const firstRead = ConfigReader.readConfig();
  assert.equal(firstRead.sitemap, '/test-sitemap.xml');
  
  const secondRead = ConfigReader.readConfig();
  assert.equal(secondRead.sitemap, '/sitemap.xml');
});

test('ConfigReader.mergeWithDefaults preserves provided values', () => {
  const overrides = {
    sitemap: '/custom-path.xml',
    maxPages: 250,
    mode: 'high-contrast',
    theme: 'dark',
  };
  
  const config = ConfigReader.mergeWithDefaults(overrides);
  
  assert.equal(config.sitemap, '/custom-path.xml');
  assert.equal(config.maxPages, 250);
  assert.equal(config.mode, 'high-contrast');
  assert.equal(config.theme, 'dark');
  assert.equal(config.radius, 24);
  assert.equal(config.indexActions, true);
});

test('ConfigReader.mergeWithDefaults applies all defaults', () => {
  const config = ConfigReader.mergeWithDefaults({});
  
  assert.equal(config.sitemap, '/sitemap.xml');
  assert.equal(config.maxPages, 500);
  assert.equal(config.mode, 'opaque');
  assert.equal(config.headless, false);
  assert.equal(config.indexActions, true);
  assert.equal(config.indexMedia, true);
  assert.equal(config.indexStructuredData, true);
  assert.equal(config.indexHidden, true);
  assert.equal(config.radius, 24);
  assert.equal(config.useWorkerIndexing, false);
});