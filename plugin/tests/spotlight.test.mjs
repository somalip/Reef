/**
 * @file Unit test for the Spotlight overlay component.
 * Mounts the overlay in a JSDOM environment, stubs chrome.runtime.sendMessage,
 * and verifies keyboard navigation, search rendering, and tab-switch behavior.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const spotlightPath = join(__dirname, '..', 'src', 'spotlight.ts');

function setupDom() {
  const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', {
    url: 'https://example.com/page',
    pretendToBeVisual: true,
  });
  const { window } = dom;

  // Bridge window globals into the Node global so the spotlight module sees them.
  // Use defineProperty because newer Node treats some of these as non-writable getters.
  function setGlobal(key, value) {
    try {
      Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    } catch {
      // fall back to direct assignment
      try { globalThis[key] = value; } catch { /* ignore */ }
    }
  }
  setGlobal('window', window);
  setGlobal('document', window.document);
  setGlobal('HTMLElement', window.HTMLElement);
  setGlobal('SVGElement', window.SVGElement);
  setGlobal('Node', window.Node);
  setGlobal('Element', window.Element);
  setGlobal('Event', window.Event);
  setGlobal('KeyboardEvent', window.KeyboardEvent);
  setGlobal('requestAnimationFrame', (cb) => setTimeout(() => cb(Date.now()), 0));
  setGlobal('cancelAnimationFrame', (id) => clearTimeout(id));
  // jsdom's Navigator exposes `platform` as a non-writable getter; use defineProperty
  try {
    Object.defineProperty(window.navigator, 'platform', { configurable: true, value: 'MacIntel' });
  } catch {
    // ignore — some jsdom versions already make it writable
  }
  setGlobal('navigator', window.navigator);

  return { dom, window };
}

function teardownDom() {
  for (const key of ['window', 'document', 'HTMLElement', 'SVGElement', 'Node', 'Element', 'Event', 'KeyboardEvent', 'requestAnimationFrame', 'cancelAnimationFrame', 'navigator']) {
    try { delete globalThis[key]; } catch { /* ignore */ }
  }
}

function makeFakeSender(handler) {
  // Returns a (msg, cb?) => Promise that records every message.
  const sent = [];
  const send = (msg) => {
    sent.push(msg);
    const result = handler(msg);
    return Promise.resolve(result);
  };
  send.sent = sent;
  return send;
}

function findShadowInput(window) {
  const host = window.document.getElementById('reef-spotlight-host');
  assert.ok(host, 'host element must be in the DOM');
  const input = host.shadowRoot.querySelector('input');
  assert.ok(input, 'input must be inside the shadow DOM');
  return { host, input, shadow: host.shadowRoot };
}

async function flush() {
  // Two microtask cycles + rAF to let debounced queries resolve.
  await new Promise((r) => setTimeout(r, 5));
  await new Promise((r) => setTimeout(r, 5));
  await new Promise((r) => setTimeout(r, 5));
}

test('spotlight mounts Shadow DOM with input and results container', async () => {
  setupDom();
  try {
    const { createSpotlight } = await import(`../src/spotlight.ts?m=${Date.now()}-mount`);
    const send = makeFakeSender((msg) => {
      if (msg.type === 'LIBRARY_RECENTS_LIST') return { success: true, items: [] };
      if (msg.type === 'SPOTLIGHT_SEARCH') return { success: true, items: [] };
      return { success: true };
    });
    const sp = createSpotlight({ sendMessage: send, theme: 'light', debounceMs: 0 });
    await sp.show();
    assert.equal(sp.isOpen(), true);
    const { host, input, shadow } = findShadowInput(globalThis.window);
    assert.equal(host.getAttribute('data-theme'), 'light');
    assert.ok(input.placeholder.includes('Search'));
    assert.ok(shadow.querySelector('.results'), 'results container must exist');
    assert.ok(shadow.querySelector('.footer'), 'footer must exist');
    sp.destroy();
  } finally {
    teardownDom();
  }
});

test('spotlight renders recents on empty input', async () => {
  setupDom();
  try {
    const { createSpotlight } = await import(`../src/spotlight.ts?m=${Date.now()}-recents`);
    const recents = [
      { url: 'https://github.com/foo', title: 'Foo repo', favicon: '', visitedAt: 1 },
      { url: 'https://news.ycombinator.com', title: 'Hacker News', favicon: '', visitedAt: 2 },
    ];
    const send = makeFakeSender((msg) => {
      if (msg.type === 'LIBRARY_RECENTS_LIST') return { success: true, items: recents };
      if (msg.type === 'SPOTLIGHT_SEARCH') return { success: true, items: [] };
      return { success: true };
    });
    const sp = createSpotlight({ sendMessage: send, theme: 'light', debounceMs: 0 });
    await sp.show();
    await flush();
    const { shadow } = findShadowInput(globalThis.window);
    const rows = shadow.querySelectorAll('.row');
    assert.equal(rows.length, 2, 'should render one row per recent');
    assert.equal(rows[0].getAttribute('aria-selected'), 'true', 'first row selected by default');
    assert.match(rows[0].querySelector('.title').textContent, /Foo repo/);
    sp.destroy();
  } finally {
    teardownDom();
  }
});

test('typing a query triggers SPOTLIGHT_SEARCH and renders results', async () => {
  setupDom();
  try {
    const { createSpotlight } = await import(`../src/spotlight.ts?m=${Date.now()}-search`);
    const items = [
      { tabId: 11, windowId: 1, title: 'TypeScript handbook', url: 'https://www.typescriptlang.org/docs', favIconUrl: '', score: 60, matchedRecords: [] },
      { tabId: 22, windowId: 1, title: 'TypeScript playground', url: 'https://www.typescriptlang.org/play', favIconUrl: '', score: 40, matchedRecords: [] },
    ];
    const send = makeFakeSender((msg) => {
      if (msg.type === 'LIBRARY_RECENTS_LIST') return { success: true, items: [] };
      if (msg.type === 'SPOTLIGHT_SEARCH') return { success: true, items };
      return { success: true };
    });
    const sp = createSpotlight({ sendMessage: send, theme: 'light', debounceMs: 0 });
    await sp.show();
    await flush();
    const { input, shadow } = findShadowInput(globalThis.window);
    input.value = 'typescript';
    input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    await flush();
    const sentQueries = send.sent.filter((m) => m.type === 'SPOTLIGHT_SEARCH').map((m) => m.query);
    assert.ok(sentQueries.includes('typescript'), 'should send SPOTLIGHT_SEARCH with the query');
    const rows = shadow.querySelectorAll('.row');
    assert.equal(rows.length, 2);
    assert.equal(rows[0].getAttribute('aria-selected'), 'true');
    assert.equal(rows[0].dataset.tabId, '11');
    sp.destroy();
  } finally {
    teardownDom();
  }
});

test('ArrowDown moves selection, Enter sends TAB_SWITCH and closes', async () => {
  setupDom();
  try {
    const { createSpotlight } = await import(`../src/spotlight.ts?m=${Date.now()}-arrow`);
    const items = [
      { tabId: 11, windowId: 1, title: 'One', url: 'https://a.example', favIconUrl: '', score: 60, matchedRecords: [] },
      { tabId: 22, windowId: 1, title: 'Two', url: 'https://b.example', favIconUrl: '', score: 50, matchedRecords: [] },
      { tabId: 33, windowId: 1, title: 'Three', url: 'https://c.example', favIconUrl: '', score: 40, matchedRecords: [] },
    ];
    const send = makeFakeSender((msg) => {
      if (msg.type === 'LIBRARY_RECENTS_LIST') return { success: true, items: [] };
      if (msg.type === 'SPOTLIGHT_SEARCH') return { success: true, items };
      return { success: true };
    });
    const sp = createSpotlight({ sendMessage: send, theme: 'light', debounceMs: 0 });
    await sp.show();
    await flush();
    const { input, shadow } = findShadowInput(globalThis.window);
    input.value = 'x';
    input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    await flush();

    const down = new globalThis.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    input.dispatchEvent(down);
    const rows = shadow.querySelectorAll('.row');
    assert.equal(rows[1].getAttribute('aria-selected'), 'true', 'ArrowDown should select second row');

    const enter = new globalThis.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    input.dispatchEvent(enter);
    await flush();
    const switchMsgs = send.sent.filter((m) => m.type === 'TAB_SWITCH');
    assert.equal(switchMsgs.length, 1, 'should send exactly one TAB_SWITCH');
    assert.equal(switchMsgs[0].tabId, 22, 'should switch to the selected tab');
    assert.equal(switchMsgs[0].windowId, 1);
    assert.equal(sp.isOpen(), false, 'overlay should close after Enter');
    sp.destroy();
  } finally {
    teardownDom();
  }
});

test('Escape closes the overlay without sending TAB_SWITCH', async () => {
  setupDom();
  try {
    const { createSpotlight } = await import(`../src/spotlight.ts?m=${Date.now()}-esc`);
    const send = makeFakeSender((msg) => {
      if (msg.type === 'LIBRARY_RECENTS_LIST') return { success: true, items: [] };
      if (msg.type === 'SPOTLIGHT_SEARCH') return { success: true, items: [] };
      return { success: true };
    });
    const sp = createSpotlight({ sendMessage: send, theme: 'light', debounceMs: 0 });
    await sp.show();
    assert.equal(sp.isOpen(), true);
    const { input, host } = findShadowInput(globalThis.window);
    const esc = new globalThis.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    input.dispatchEvent(esc);
    // The capture-phase listener is on the host
    host.dispatchEvent(esc);
    await flush();
    assert.equal(sp.isOpen(), false, 'overlay should close on Escape');
    const switchMsgs = send.sent.filter((m) => m.type === 'TAB_SWITCH');
    assert.equal(switchMsgs.length, 0, 'should not send TAB_SWITCH on Escape');
    sp.destroy();
  } finally {
    teardownDom();
  }
});

test('Ctrl+1 jumps to and opens the first row', async () => {
  setupDom();
  try {
    const { createSpotlight } = await import(`../src/spotlight.ts?m=${Date.now()}-ctrl1`);
    const items = [
      { tabId: 11, windowId: 1, title: 'A', url: 'https://a', favIconUrl: '', score: 60, matchedRecords: [] },
      { tabId: 22, windowId: 1, title: 'B', url: 'https://b', favIconUrl: '', score: 50, matchedRecords: [] },
    ];
    const send = makeFakeSender((msg) => {
      if (msg.type === 'LIBRARY_RECENTS_LIST') return { success: true, items: [] };
      if (msg.type === 'SPOTLIGHT_SEARCH') return { success: true, items };
      return { success: true };
    });
    const sp = createSpotlight({ sendMessage: send, theme: 'light', debounceMs: 0 });
    await sp.show();
    await flush();
    const { input, shadow } = findShadowInput(globalThis.window);
    input.value = 'q';
    input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    await flush();
    const ev = new globalThis.KeyboardEvent('keydown', { key: '1', metaKey: true, bubbles: true, cancelable: true });
    input.dispatchEvent(ev);
    await flush();
    const switchMsgs = send.sent.filter((m) => m.type === 'TAB_SWITCH');
    assert.equal(switchMsgs.length, 1);
    assert.equal(switchMsgs[0].tabId, 11, 'Cmd+1 should open the first row');
    assert.equal(sp.isOpen(), false);
    sp.destroy();
  } finally {
    teardownDom();
  }
});

test('Tab cycles matchedRecords within a row', async () => {
  setupDom();
  try {
    const { createSpotlight } = await import(`../src/spotlight.ts?m=${Date.now()}-tab`);
    const items = [
      {
        tabId: 11, windowId: 1, title: 'Docs', url: 'https://docs',
        favIconUrl: '', score: 60,
        matchedRecords: [
          { headingText: 'Intro', bodyText: 'Welcome to the docs' },
          { headingText: 'API', bodyText: 'Reference for all functions' },
        ],
      },
    ];
    const send = makeFakeSender((msg) => {
      if (msg.type === 'LIBRARY_RECENTS_LIST') return { success: true, items: [] };
      if (msg.type === 'SPOTLIGHT_SEARCH') return { success: true, items };
      return { success: true };
    });
    const sp = createSpotlight({ sendMessage: send, theme: 'light', debounceMs: 0 });
    await sp.show();
    await flush();
    const { input, shadow } = findShadowInput(globalThis.window);
    input.value = 'd';
    input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
    await flush();
    const row = shadow.querySelector('.row');
    const snippetEl = row.querySelector('.match');
    assert.match(snippetEl.textContent, /Intro/, 'first match should be shown initially');
    const tab = new globalThis.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    input.dispatchEvent(tab);
    assert.match(snippetEl.textContent, /API/, 'Tab should cycle to the next match');
    sp.destroy();
  } finally {
    teardownDom();
  }
});
