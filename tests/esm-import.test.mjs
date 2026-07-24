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

test('ConfigReader.mergeWithDefaults handles false boolean values', () => {
  const config = ConfigReader.mergeWithDefaults({
    indexActions: false,
    indexMedia: false,
    indexHidden: false,
  });
  
  assert.equal(config.indexActions, false);
  assert.equal(config.indexMedia, false);
  assert.equal(config.indexHidden, false);
});

test('ConfigReader.mergeWithDefaults handles actionsMode', () => {
  const config = ConfigReader.mergeWithDefaults({
    actionsMode: 'navigate-only',
  });
  
  assert.equal(config.actionsMode, 'navigate-only');
});

test('ConfigReader.mergeWithDefaults handles numeric radius', () => {
  const config = ConfigReader.mergeWithDefaults({
    radius: 8,
  });
  
  assert.equal(config.radius, 8);
});

test('ConfigReader.mergeWithDefaults handles colors', () => {
  const config = ConfigReader.mergeWithDefaults({
    primaryColor: '#ff0000',
    secondaryColor: '#00ff00',
    backgroundColor: '#000000',
    textColor: '#ffffff',
    borderColor: '#cccccc',
  });
  
  assert.equal(config.primaryColor, '#ff0000');
  assert.equal(config.secondaryColor, '#00ff00');
  assert.equal(config.backgroundColor, '#000000');
  assert.equal(config.textColor, '#ffffff');
  assert.equal(config.borderColor, '#cccccc');
});

test('ConfigReader.mergeWithDefaults handles scope', () => {
  const config = ConfigReader.mergeWithDefaults({
    scope: '/docs/',
  });
  
  assert.equal(config.scope, '/docs/');
});

test('ConfigReader.mergeWithDefaults handles fileExtensions', () => {
  const config = ConfigReader.mergeWithDefaults({
    fileExtensions: 'pdf,doc,xls',
  });
  
  assert.equal(config.fileExtensions, 'pdf,doc,xls');
});

test('ConfigReader.mergeWithDefaults handles excludeAction', () => {
  const config = ConfigReader.mergeWithDefaults({
    excludeAction: '.nav-link',
  });
  
  assert.equal(config.excludeAction, '.nav-link');
});

test('ConfigReader.mergeWithDefaults handles hotkey', () => {
  const config = ConfigReader.mergeWithDefaults({
    hotkey: 'k',
  });
  
  assert.equal(config.hotkey, 'k');
});

test('ConfigReader.mergeWithDefaults handles placeholder', () => {
  const config = ConfigReader.mergeWithDefaults({
    placeholder: 'Search docs...',
  });
  
  assert.equal(config.placeholder, 'Search docs...');
});

test('ConfigReader.mergeWithDefaults handles TTL', () => {
  const config = ConfigReader.mergeWithDefaults({
    ttl: 3600,
  });
  
  assert.equal(config.ttl, 3600);
});

test('ConfigReader.mergeWithDefaults handles undefined TTL', () => {
  const config = ConfigReader.mergeWithDefaults({
    ttl: undefined,
  });
  
  assert.equal(config.ttl, undefined);
});

test('ConfigReader.mergeWithDefaults handles prebuiltIndexUrl', () => {
  const config = ConfigReader.mergeWithDefaults({
    prebuiltIndexUrl: '/search-index.json',
  });
  
  assert.equal(config.prebuiltIndexUrl, '/search-index.json');
});

test('ConfigReader.mergeWithDefaults handles useWorkerIndexing', () => {
  const config = ConfigReader.mergeWithDefaults({
    useWorkerIndexing: true,
  });
  
  assert.equal(config.useWorkerIndexing, true);
});

test('ConfigReader.mergeWithDefaults handles fontFamily', () => {
  const config = ConfigReader.mergeWithDefaults({
    fontFamily: 'Inter, system-ui, sans-serif',
  });
  
  assert.equal(config.fontFamily, 'Inter, system-ui, sans-serif');
});

test('ConfigReader defaults for mode variants', () => {
  const config = ConfigReader.mergeWithDefaults({
    mode: 'regular',
  });
  
  assert.equal(config.mode, 'regular');
});

test('ConfigReader defaults for high-contrast mode', () => {
  const config = ConfigReader.mergeWithDefaults({
    mode: 'high-contrast',
  });
  
  assert.equal(config.mode, 'high-contrast');
});

test('ConfigReader handles theme variants', () => {
  const config = ConfigReader.mergeWithDefaults({
    theme: 'light',
  });
  
  assert.equal(config.theme, 'light');
});

test('ConfigReader handles auto theme', () => {
  const config = ConfigReader.mergeWithDefaults({
    theme: 'auto',
  });
  
  assert.equal(config.theme, 'auto');
});

test('ConfigReader readConfig after setConfig with multiple values', () => {
  ConfigReader.setConfig({
    sitemap: '/multi-sitemap.xml',
    maxPages: 42,
    headless: true,
  });
  
  const config = ConfigReader.readConfig();
  
  assert.equal(config.sitemap, '/multi-sitemap.xml');
  assert.equal(config.maxPages, 42);
  assert.equal(config.headless, true);
});

test('ConfigReader setConfig allows override then reset', () => {
  ConfigReader.setConfig({ maxPages: 100 });
  const config1 = ConfigReader.readConfig();
  assert.equal(config1.maxPages, 100);
  
  ConfigReader.setConfig({ maxPages: 200 });
  const config2 = ConfigReader.readConfig();
  assert.equal(config2.maxPages, 200);
  
  // After second read, should be back to defaults
  const config3 = ConfigReader.readConfig();
  assert.equal(config3.maxPages, 500);
});

test('ConfigReader mergeWithDefaults preserves partial override', () => {
  const config = ConfigReader.mergeWithDefaults({
    sitemap: '/custom.xml',
  });
  
  assert.equal(config.sitemap, '/custom.xml');
  assert.equal(config.maxPages, 500);
  assert.equal(config.indexActions, true);
});

test('ConfigReader mergeWithDefaults handles all boolean flags false', () => {
  const config = ConfigReader.mergeWithDefaults({
    indexActions: false,
    indexMedia: false,
    indexStructuredData: false,
    indexHidden: false,
    headless: true,
  });
  
  assert.equal(config.indexActions, false);
  assert.equal(config.indexMedia, false);
  assert.equal(config.indexStructuredData, false);
  assert.equal(config.indexHidden, false);
  assert.equal(config.headless, true);
});

test('ConfigReader mergeWithDefaults handles partial boolean override', () => {
  const config = ConfigReader.mergeWithDefaults({
    indexActions: false,
    indexMedia: false,
  });
  
  assert.equal(config.indexActions, false);
  assert.equal(config.indexMedia, false);
  assert.equal(config.indexStructuredData, true);
  assert.equal(config.indexHidden, true);
});