/**
 * @file Contract tests for the Reef browser extension.
 * Verifies the manifest shape, required permissions, and that the new
 * open-spotlight keyboard command is declared with the correct shortcut.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function loadManifest() {
  const raw = readFileSync(join(root, 'manifest.json'), 'utf8');
  return JSON.parse(raw);
}

test('manifest is MV3', () => {
  const m = loadManifest();
  assert.equal(m.manifest_version, 3);
});

test('manifest declares the open-spotlight command with Ctrl+Shift+L', () => {
  const m = loadManifest();
  assert.ok(m.commands, 'commands object must exist');
  assert.ok(m.commands['open-spotlight'], 'open-spotlight command must be declared');
  assert.equal(m.commands['open-spotlight'].suggested_key.default, 'Ctrl+Shift+L');
  assert.equal(m.commands['open-spotlight'].suggested_key.mac, 'MacCtrl+Shift+L');
  assert.match(m.commands['open-spotlight'].description, /[Ss]potlight/);
});

test('popup shortcut is reassigned away from Ctrl+Shift+L', () => {
  const m = loadManifest();
  assert.equal(m.commands['_execute_action'].suggested_key.default, 'Ctrl+Shift+R');
  assert.equal(m.commands['_execute_action'].suggested_key.mac, 'MacCtrl+Shift+R');
  assert.notEqual(m.commands['_execute_action'].suggested_key.default, 'Ctrl+Shift+L',
    'Ctrl+Shift+L must belong to Spotlight, not the popup');
});

test('all required permissions are still declared', () => {
  const m = loadManifest();
  const required = ['activeTab', 'scripting', 'storage', 'tabs', 'contextMenus', 'unlimitedStorage'];
  for (const p of required) {
    assert.ok(m.permissions.includes(p), `permission ${p} must be present`);
  }
  assert.ok(Array.isArray(m.host_permissions) && m.host_permissions.includes('<all_urls>'),
    'host_permissions must include <all_urls> so Spotlight can be injected everywhere');
});

test('content script still runs on all URLs', () => {
  const m = loadManifest();
  assert.ok(Array.isArray(m.content_scripts) && m.content_scripts.length > 0);
  assert.deepEqual(m.content_scripts[0].matches, ['<all_urls>']);
  assert.ok(m.content_scripts[0].js.includes('content.js'));
});
