/**
 * @file Content script for Reef for Browsers.
 * Inspects live DOM for window.__reefAgentManifest or extracts on-the-fly,
 * and hosts the Agent instance for executing in-page actions.
 */

import {
  extractSections,
  extractActions,
  extractFields,
  extractLinks,
  extractFiles,
  extractMedia,
  extractStructuredData,
  extractAccessibilityTree,
} from '../../src/extraction.js';
import { Agent } from '../../src/agent.ts';
import { createSearchIndex, addToIndex } from '../../src/search-index.js';
import type { IndexRecord } from '../../src/types.js';
import type { AgentManifest } from '../../src/agent-ready.js';
import { createSpotlight, type SpotlightHandle } from './spotlight.js';

export interface ExtensionMessage {
  type:
    | 'PING' | 'GET_MANIFEST' | 'RESCAN' | 'EXECUTE_ACTION' | 'HIGHLIGHT_RECORD'
    | 'REEF_BOOKMARK_SELECTION' | 'REEF_SNIPPET_SELECTION' | 'REEF_BOOKMARK_PAGE'
    | 'REEF_OPEN_POPUP_QUERY' | 'REEF_OPEN_NOTE_FOR_PAGE' | 'REEF_SHOW_TOAST'
    | 'SHOW_SPOTLIGHT' | 'HIDE_SPOTLIGHT';
  record?: IndexRecord;
  actionType?: 'click' | 'type' | 'navigate';
  value?: string;
  text?: string;
  message?: string;
  toastType?: 'info' | 'success' | 'error';
  query?: string;
  options?: {
    actionsMode?: 'execute' | 'navigate-only';
    exclusionSelectors?: string[];
  };
}

export interface ExtensionResponse {
  success: boolean;
  manifest?: AgentManifest;
  error?: string;
  url?: string;
}

const HARD_EXCLUSION_SELECTOR =
  'input[type="password"], input[name*="card" i], input[autocomplete*="cc-" i], input[name*="ssn" i], input[name*="social-security" i], [data-reef-agent="off"], [data-sensitive]';

function isSensitiveElement(element: Element, customExclusions: string[] = []): boolean {
  if (element.matches(HARD_EXCLUSION_SELECTOR) || element.closest('[data-reef-agent="off"], [data-sensitive]')) {
    return true;
  }
  return customExclusions.some(selector => {
    try {
      return element.matches(selector) || !!element.closest(selector);
    } catch {
      return false;
    }
  });
}

function getAuthoritativeManifest(): AgentManifest | null {
  if (typeof window !== 'undefined' && window.__reefAgentManifest) {
    return window.__reefAgentManifest;
  }

  const scriptTag = document.querySelector('script[type="application/agent-manifest+json"]');
  if (scriptTag?.textContent) {
    try {
      return JSON.parse(scriptTag.textContent) as AgentManifest;
    } catch {
      // Invalid JSON tag
    }
  }
  return null;
}

export function extractPageManifest(customExclusions: string[] = []): AgentManifest {
  const authoritative = getAuthoritativeManifest();
  if (authoritative) {
    // Filter authoritative manifest against per-site custom exclusions & sensitive guardrails
    const filteredRecords = authoritative.records.filter(record => {
      if (!record.selector) return true;
      try {
        const el = document.querySelector(record.selector);
        return el ? !isSensitiveElement(el, customExclusions) : true;
      } catch {
        return true;
      }
    });
    return {
      ...authoritative,
      records: filteredRecords,
    };
  }

  const url = location.href;
  const html = document.documentElement.outerHTML;

  const rawRecords: IndexRecord[] = [
    ...extractSections(html, url),
    ...extractActions(html, url),
    ...extractFields(html, url),
    ...extractLinks(html, url),
    ...extractFiles(html, url),
    ...extractMedia(html, url),
    ...extractStructuredData(html, url),
    ...extractAccessibilityTree(document),
  ];

  const filtered = rawRecords.filter(record => {
    if (record.selector) {
      try {
        const element = document.querySelector(record.selector);
        if (element && isSensitiveElement(element, customExclusions)) return false;
      } catch {
        // Invalid selector string
      }
    }
    return true;
  });

  const deduped = [
    ...new Map(
      filtered.map(record => [`${record.type}:${record.headingText}:${record.selector || record.url}`, record])
    ).values(),
  ];

  return {
    version: 1,
    url,
    generatedAt: Date.now(),
    records: deduped,
    excludedCount: rawRecords.length - deduped.length,
  };
}

// Dummy inspector interface for Agent instantiation
const dummyInspector = {
  activate: () => {},
  deactivate: () => {},
  isActive: () => false,
  setRecords: () => {},
};

let currentAgent: Agent | null = null;
function getOrCreateAgent(actionsMode: 'execute' | 'navigate-only' = 'execute'): Agent {
  const index = createSearchIndex();
  currentAgent = new Agent(index, dummyInspector, { actionsMode });
  return currentAgent;
}

// ─── SPOTLIGHT HOTKEY (Cmd+Shift+L / Meta+Shift+L) ───────
// Chrome manifest commands cannot bind to the Meta (Cmd) key,
// so we listen at the content-script level for Cmd+Shift+L.
if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
    if (!isMac) return;
    if (e.metaKey && e.shiftKey && (e.key === 'l' || e.key === 'L') && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      ensureSpotlight().show();
    }
  }, true);
}

// ─── SPOTLIGHT (lazy) ─────────────────────────────────────
let spotlightHandle: SpotlightHandle | null = null;
function ensureSpotlight(): SpotlightHandle {
  if (!spotlightHandle) spotlightHandle = createSpotlight();
  return spotlightHandle;
}

// Global message listener for Chrome extension runtime
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
    (async () => {
      try {
        if (message.type === 'PING') {
          sendResponse({ success: true, url: location.href });
          return;
        }

        if (message.type === 'GET_MANIFEST' || message.type === 'RESCAN') {
          const manifest = extractPageManifest(message.options?.exclusionSelectors || []);
          sendResponse({ success: true, manifest });
          return;
        }

        if (message.type === 'EXECUTE_ACTION' && message.record) {
          const actionsMode = message.options?.actionsMode || 'execute';
          const agent = getOrCreateAgent(actionsMode);

          if (message.record.destructive && actionsMode === 'navigate-only') {
            sendResponse({ success: false, error: 'destructive-action-blocked-by-mode' });
            return;
          }

          if (message.actionType === 'click' || message.record.type === 'action' || message.record.type === 'link') {
            if (message.record.selector) {
              await agent.click(message.record);
            } else if (message.record.url) {
              location.href = message.record.url;
            }
            sendResponse({ success: true, url: location.href });
            return;
          }

          if (message.actionType === 'type' || message.record.type === 'field') {
            const valueToType = message.value ?? message.record.value ?? '';
            await agent.type(message.record, valueToType);
            sendResponse({ success: true });
            return;
          }

          sendResponse({ success: false, error: 'unknown-action-type' });
          return;
        }

        if (message.type === 'HIGHLIGHT_RECORD' && message.record?.selector) {
          const el = document.querySelector(message.record.selector);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const origOutline = (el as HTMLElement).style.outline;
            (el as HTMLElement).style.outline = '3px solid #00a8b5';
            setTimeout(() => {
              (el as HTMLElement).style.outline = origOutline;
            }, 2000);
          }
          sendResponse({ success: true });
          return;
        }

        // Selection toolbar requests from background context-menu
        if (message.type === 'REEF_BOOKMARK_SELECTION' && message.text) {
          const created = await createBookmarkFromSelection(message.text);
          showReefToast(created ? 'Bookmarked in Reef' : 'Bookmark failed', created ? 'success' : 'error');
          sendResponse({ success: !!created });
          return;
        }
        if (message.type === 'REEF_SNIPPET_SELECTION' && message.text) {
          const created = await createSnippetFromSelection(message.text);
          showReefToast(created ? 'Saved as snippet' : 'Snippet failed', created ? 'success' : 'error');
          sendResponse({ success: !!created });
          return;
        }
        if (message.type === 'REEF_BOOKMARK_PAGE') {
          const created = await createBookmarkFromPage();
          showReefToast(created ? 'Page bookmarked' : 'Bookmark failed', created ? 'success' : 'error');
          sendResponse({ success: !!created });
          return;
        }
        if (message.type === 'REEF_SHOW_TOAST' && message.message) {
          showReefToast(message.message, message.toastType || 'info');
          sendResponse({ success: true });
          return;
        }
        if (message.type === 'REEF_OPEN_POPUP_QUERY' || message.type === 'REEF_OPEN_NOTE_FOR_PAGE') {
          // Background opens popup; nothing extra to do here
          sendResponse({ success: true });
          return;
        }

        // Spotlight overlay
        if (message.type === 'SHOW_SPOTLIGHT') {
          try {
            await ensureSpotlight().show();
            sendResponse({ success: true });
          } catch (err: any) {
            sendResponse({ success: false, error: err?.message || String(err) });
          }
          return;
        }
        if (message.type === 'HIDE_SPOTLIGHT') {
          spotlightHandle?.hide();
          sendResponse({ success: true });
          return;
        }

        sendResponse({ success: false, error: 'unsupported-message-type' });
      } catch (err: any) {
        sendResponse({ success: false, error: err?.message || String(err) });
      }
    })();
    return true; // Keep response channel open for async execution
  });
}

// ──────────────────────────────────────────────────────────
// Reef Selection Toolbar — a lightweight floating mini-toolbar
// that surfaces quick actions whenever the user selects text.
// It does not modify the page, only attaches a Shadow DOM host.
// ──────────────────────────────────────────────────────────

const TOOLBAR_HOST_ID = 'reef-selection-toolbar-host';

function isInsideEditable(target: Node | null): boolean {
  if (!target) return false;
  const el = target as Element;
  if (!el || !el.closest) return false;
  return !!el.closest('input, textarea, [contenteditable="true"], [contenteditable=""], [data-reef-agent="off"], [data-sensitive]');
}

function getSelectionContext(): { text: string; rect: DOMRect | null; range: Range | null } {
  const sel = typeof window !== 'undefined' ? window.getSelection() : null;
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
    return { text: '', rect: null, range: null };
  }
  const text = sel.toString().trim();
  if (text.length < 1) return { text: '', rect: null, range: null };
  const range = sel.getRangeAt(0);
  const rect = range.getBoundingClientRect();
  return { text, rect, range };
}

function ensureToolbarHost(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  let host = document.getElementById(TOOLBAR_HOST_ID) as HTMLElement | null;
  if (host && host.shadowRoot) return host;
  if (!host) {
    host = document.createElement('div');
    host.id = TOOLBAR_HOST_ID;
    host.setAttribute('data-reef-agent', 'on');
    host.style.cssText = 'position: fixed; z-index: 2147483646; top: 0; left: 0; display: none; pointer-events: auto;';
    (document.body || document.documentElement).appendChild(host);
  }
  if (!host.shadowRoot) {
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = REEF_TOOLBAR_CSS;
    const bar = document.createElement('div');
    bar.className = 'bar';
    // Static SVG icons only — no user data, network input, or storage values flow into this markup.
    bar.innerHTML = `
      <button class="btn" data-action="bookmark" title="Bookmark selection">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M4 2h8a1 1 0 0 1 1 1v11l-5-3-5 3V3a1 1 0 0 1 1-1z"/></svg>
        <span>Bookmark</span>
      </button>
      <button class="btn" data-action="snippet" title="Save as snippet">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M3 3h10v2H3V3zm0 4h10v2H3V7zm0 4h7v2H3v-2z"/></svg>
        <span>Snippet</span>
      </button>
      <button class="btn" data-action="search" title="Search in Reef">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M11.5 11.5 14 14M12.5 7a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>
        <span>Search</span>
      </button>
      <button class="btn" data-action="copy" title="Copy text">
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M5 2h7a1 1 0 0 1 1 1v9h-1V3H5V2zM3 4h7a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm0 1v9h7V5H3z"/></svg>
        <span>Copy</span>
      </button>
    `;
    root.appendChild(style);
    root.appendChild(bar);

    bar.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });
    bar.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;
      const btn = target.closest('.btn') as HTMLElement | null;
      if (!btn) return;
      const action = btn.dataset.action;
      const text = (host as any)._reefText as string || '';
      hideToolbar();
      if (action === 'bookmark') {
        const ok = await createBookmarkFromSelection(text);
        showReefToast(ok ? 'Bookmarked in Reef' : 'Bookmark failed', ok ? 'success' : 'error');
      } else if (action === 'snippet') {
        const ok = await createSnippetFromSelection(text);
        showReefToast(ok ? 'Saved as snippet' : 'Snippet failed', ok ? 'success' : 'error');
      } else if (action === 'search') {
        if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
          chrome.runtime.sendMessage({ type: 'TAB_SEARCH_PROMPT', query: text });
        }
        try {
          (chrome as any)?.action?.openPopup?.();
        } catch {
          // ignore
        }
      } else if (action === 'copy') {
        try {
          await navigator.clipboard.writeText(text);
          showReefToast('Copied to clipboard', 'success');
        } catch {
          showReefToast('Copy failed', 'error');
        }
      }
    });
  }
  return host;
}

const REEF_TOOLBAR_CSS = `
:host { all: initial; }
.bar {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: #111;
  color: #fff;
  border-radius: 8px;
  padding: 4px;
  box-shadow: 0 6px 20px rgba(0,0,0,.25);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  font-size: 12px;
  line-height: 1;
  user-select: none;
}
.btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  background: transparent;
  color: #fff;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
  font: inherit;
  white-space: nowrap;
  transition: background .12s;
}
.btn:hover { background: rgba(255,255,255,.12); }
.btn:active { background: rgba(255,255,255,.2); }
.btn svg { display: block; }
`;

function showToolbarAt(rect: DOMRect, text: string) {
  const host = ensureToolbarHost();
  if (!host) return;
  (host as any)._reefText = text;
  host.style.display = 'block';

  // Position above the selection if there's room, otherwise below
  const bar = host.shadowRoot!.querySelector('.bar') as HTMLElement;
  const margin = 8;
  const barHeight = bar ? bar.offsetHeight : 36;
  const barWidth = bar ? bar.offsetWidth : 280;

  let top = window.scrollY + rect.top - barHeight - margin;
  let left = window.scrollX + rect.left + rect.width / 2 - barWidth / 2;

  if (rect.top - barHeight - margin < 0) {
    top = window.scrollY + rect.bottom + margin;
  }
  const maxLeft = window.scrollX + window.innerWidth - barWidth - 8;
  if (left > maxLeft) left = maxLeft;
  if (left < window.scrollX + 8) left = window.scrollX + 8;

  host.style.transform = `translate(${left}px, ${top}px)`;
}

function hideToolbar() {
  const host = document.getElementById(TOOLBAR_HOST_ID) as HTMLElement | null;
  if (host) {
    host.style.display = 'none';
    (host as any)._reefText = '';
  }
}

let toolbarTimer: number | null = null;

function onSelectionChange() {
  if (typeof document === 'undefined') return;
  const active = document.activeElement;
  if (active && isInsideEditable(active)) {
    hideToolbar();
    return;
  }
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
    hideToolbar();
    return;
  }
  if (isInsideEditable(sel.anchorNode)) {
    hideToolbar();
    return;
  }
  const { text, rect } = getSelectionContext();
  if (!text || text.length < 1 || !rect || rect.width === 0) {
    hideToolbar();
    return;
  }
  if (toolbarTimer) window.clearTimeout(toolbarTimer);
  toolbarTimer = window.setTimeout(() => {
    const ctx = getSelectionContext();
    if (ctx.text && ctx.rect) showToolbarAt(ctx.rect, ctx.text);
  }, 220) as unknown as number;
}

function dismissOnOutside() {
  document.addEventListener('mousedown', (e) => {
    const host = document.getElementById(TOOLBAR_HOST_ID) as HTMLElement | null;
    if (!host || host.style.display === 'none') return;
    if (host.contains(e.target as Node)) return;
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    hideToolbar();
  }, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideToolbar();
  });
  window.addEventListener('scroll', () => hideToolbar(), { passive: true });
  window.addEventListener('resize', () => hideToolbar());
}

if (typeof document !== 'undefined') {
  document.addEventListener('selectionchange', onSelectionChange);
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    dismissOnOutside();
  } else {
    document.addEventListener('DOMContentLoaded', dismissOnOutside);
  }
}

// ─── TOAST ────────────────────────────────────────────────
const TOAST_HOST_ID = 'reef-toast-host';
function showReefToast(message: string, type: 'info' | 'success' | 'error' = 'info') {
  if (typeof document === 'undefined') return;
  let host = document.getElementById(TOAST_HOST_ID) as HTMLElement | null;
  if (!host) {
    host = document.createElement('div');
    host.id = TOAST_HOST_ID;
    host.setAttribute('data-reef-agent', 'on');
    host.style.cssText = 'position: fixed; z-index: 2147483647; top: 16px; right: 16px; display: flex; flex-direction: column; gap: 6px; pointer-events: none;';
    (document.body || document.documentElement).appendChild(host);
  }
  const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
  if (!shadow.querySelector('style')) {
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      .toast {
        background: ${type === 'error' ? '#b91c1c' : type === 'success' ? '#047857' : '#111'};
        color: #fff;
        padding: 8px 12px;
        border-radius: 8px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
        font-size: 12px;
        line-height: 1.3;
        max-width: 320px;
        box-shadow: 0 8px 24px rgba(0,0,0,.25);
        animation: reef-in .18s ease-out;
        pointer-events: auto;
      }
      @keyframes reef-in {
        from { opacity: 0; transform: translateY(-4px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `;
    shadow.appendChild(style);
  }
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  shadow.appendChild(el);
  window.setTimeout(() => {
    el.style.transition = 'opacity .2s';
    el.style.opacity = '0';
    window.setTimeout(() => el.remove(), 220);
  }, 2200);
}

// ─── LIBRARY HELPERS (via background) ─────────────────────
async function createBookmarkFromSelection(text: string): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return false;
  const { selectionContext } = captureSelectionContext();
  return new Promise(resolve => {
    chrome.runtime.sendMessage({
      type: 'LIBRARY_BOOKMARK_CREATE',
      data: {
        url: location.href,
        title: document.title,
        selectedText: text.slice(0, 4000),
        note: '',
        tags: [],
        contextBefore: selectionContext.before,
        contextAfter: selectionContext.after,
        favicon: getFavicon(),
      },
    }, (res: any) => resolve(!!(res && res.success)));
  });
}

async function createSnippetFromSelection(text: string): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return false;
  return new Promise(resolve => {
    chrome.runtime.sendMessage({
      type: 'LIBRARY_SNIPPET_CREATE',
      data: {
        text: text.slice(0, 4000),
        title: text.slice(0, 80),
        tags: [],
        source: { url: location.href, title: document.title },
      },
    }, (res: any) => resolve(!!(res && res.success)));
  });
}

async function createBookmarkFromPage(): Promise<boolean> {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return false;
  return new Promise(resolve => {
    chrome.runtime.sendMessage({
      type: 'LIBRARY_BOOKMARK_CREATE',
      data: {
        url: location.href,
        title: document.title,
        note: '',
        tags: [],
        favicon: getFavicon(),
      },
    }, (res: any) => resolve(!!(res && res.success)));
  });
}

function captureSelectionContext(): { before: string; after: string } {
  try {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return { before: '', after: '' };
    const range = sel.getRangeAt(0);
    const beforeRange = document.createRange();
    beforeRange.setStart(document.body, 0);
    beforeRange.setEnd(range.startContainer, range.startOffset);
    const afterRange = document.createRange();
    afterRange.setStart(range.endContainer, range.endOffset);
    afterRange.setEndAfter(document.body.lastChild || document.body);
    return {
      before: (beforeRange.toString() || '').slice(-160).trim(),
      after: (afterRange.toString() || '').slice(0, 160).trim(),
    };
  } catch {
    return { before: '', after: '' };
  }
}

function getFavicon(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const link = document.querySelector('link[rel*="icon"]') as HTMLLinkElement | null;
  return link?.href || undefined;
}
