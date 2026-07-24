import type { SearchIndexRecord } from '../../src/types.js';

export interface SpotlightTabResult {
  tabId: number;
  windowId: number;
  title: string;
  url: string;
  favIconUrl?: string;
  score: number;
  matchedRecords: SearchIndexRecord[];
}

export interface SpotlightSiteResult {
  url: string;
  headingText: string;
  bodyText: string;
  selector?: string;
  type: string;
  score: number;
  sourceOrigin: string;
}

export interface SpotlightAction {
  type: string;
  title: string;
  url?: string;
  payload?: unknown;
}

export interface SpotlightSearchResponse {
  success: boolean;
  items: SpotlightTabResult[];
  suggestion?: string;
  autocorrected: boolean;
  siteResults: SpotlightSiteResult[];
  actions: SpotlightAction[];
}

export interface SpotlightOptions {
  maxRows?: number;
  debounceMs?: number;
  maxRecents?: number;
  theme?: 'light' | 'dark' | 'system';
  sendMessage?: (msg: unknown) => Promise<unknown>;
}

type UnifiedResult =
  | { kind: 'tab'; data: SpotlightTabResult }
  | { kind: 'site'; data: SpotlightSiteResult }
  | { kind: 'action'; data: SpotlightAction }
  | { kind: 'browser-action'; data: SpotlightAction }
  | { kind: 'bookmark'; data: chrome.bookmarks.BookmarkTreeNode }
  | { kind: 'history'; data: chrome.history.HistoryItem }
  | { kind: 'download'; data: chrome.downloads.DownloadItem }
  | { kind: 'recent'; data: { url: string; title: string; favicon?: string; visitedAt: number } };

const HOST_ID = 'reef-spotlight-host';
const MAX_ROWS_DEFAULT = 50;
const DEBOUNCE_DEFAULT = 80;
const MAX_RECENTS_DEFAULT = 8;

const STYLES = `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }

.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 17, 21, 0.42);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  z-index: 2147483647;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 14vh;
  animation: reef-spotlight-fade 120ms ease-out;
}
.card {
  width: min(640px, 92vw);
  max-height: min(560px, 70vh);
  background: #ffffff;
  color: #111111;
  border-radius: 14px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.32), 0 4px 12px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: reef-spotlight-slide 140ms cubic-bezier(0.2, 0.8, 0.2, 1);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
}
.input-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  border-bottom: 1px solid #ececec;
}
.input-row .glyph {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  color: #6b7280;
}
.input-row input {
  flex: 1 1 auto;
  font-size: 18px;
  line-height: 24px;
  border: none;
  outline: none;
  background: transparent;
  color: inherit;
  font-family: inherit;
  min-width: 0;
}
.input-row input::placeholder { color: #9ca3af; }
.input-row .esc {
  font-size: 11px;
  color: #6b7280;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  padding: 1px 6px;
  background: #fafafa;
  user-select: none;
}
.results {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 6px 0;
  scrollbar-width: thin;
}
.empty {
  padding: 28px 20px;
  text-align: center;
  color: #6b7280;
  font-size: 14px;
  line-height: 1.5;
}
.empty .suggestion {
  color: #2563eb;
  font-weight: 600;
  text-decoration: underline;
  cursor: pointer;
}
.empty .suggestion:hover { color: #1d4ed8; }
.row {
  display: grid;
  grid-template-columns: 18px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  cursor: pointer;
  border-left: 2px solid transparent;
  user-select: none;
}
.row[aria-selected="true"] {
  background: #f3f4f6;
  border-left-color: #111111;
}
.row .favicon {
  width: 16px;
  height: 16px;
  border-radius: 2px;
  background: #f3f4f6;
  object-fit: contain;
}
.row .main { min-width: 0; }
.row .title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
  color: #111111;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.row .title mark {
  background: #fde68a;
  color: inherit;
  padding: 0 1px;
  border-radius: 2px;
}
.row .url {
  font-size: 12px;
  color: #6b7280;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 1px;
}
.row .match {
  font-size: 11px;
  color: #6b7280;
  max-width: 180px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 14px;
  border-top: 1px solid #ececec;
  font-size: 11px;
  color: #6b7280;
  background: #fafafa;
}
.footer .hints { display: flex; gap: 10px; flex-wrap: wrap; }
.footer .hint kbd {
  font-family: inherit;
  font-size: 10px;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  border-radius: 3px;
  padding: 0 4px;
  margin-right: 2px;
}
.footer .brand { font-weight: 600; color: #111111; }
.section-header {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: #9ca3af;
  padding: 8px 16px 4px;
  user-select: none;
}
.autocorrect-banner {
  padding: 8px 16px;
  font-size: 12px;
  color: #6b7280;
  background: #fefce8;
  border-bottom: 1px solid #fde68a;
}
.autocorrect-banner strong { color: #111111; }
.autocorrect-banner .autocorrect-orig {
  color: #2563eb;
  text-decoration: none;
  cursor: pointer;
}
.autocorrect-banner .autocorrect-orig:hover { text-decoration: underline; }
.row-site .site-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
  background: #f3f4f6;
  border-radius: 2px;
}
.row-site .site-icon svg { stroke: #6366f1; }
.row-action { opacity: 0.85; }
.row-action:hover { opacity: 1; }
.row-action .action-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f0fdf4;
  border-radius: 2px;
}
.row-action .action-icon svg { stroke: #16a34a; }
.row-action .action-title { font-style: italic; }
.row-action .action-badge {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #16a34a;
  font-weight: 600;
}
.row-browser-action .action-icon { background: #eff6ff; }
.row-browser-action .action-icon svg { stroke: #2563eb; }
.row-browser-action .action-badge { color: #2563eb; }
.row-bookmark .action-icon { background: #fffbeb; }
.row-bookmark .action-icon svg { stroke: #d97706; }
.row-bookmark .action-badge { color: #d97706; }
.row-history .action-icon { background: #f5f3ff; }
.row-history .action-icon svg { stroke: #7c3aed; }
.row-history .action-badge { color: #7c3aed; }
.row-download .action-icon { background: #f0fdfa; }
.row-download .action-icon svg { stroke: #0d9488; }
.row-download .action-badge { color: #0d9488; }

.reef-suggestion-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: center;
  margin-top: 8px;
}
.reef-suggestion-chip {
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  background: #fafafa;
  color: #6b7280;
  cursor: pointer;
}
.reef-suggestion-chip:hover { background: #f3f4f6; }

/* Dark theme */
:host([data-theme="dark"]) .card { background: #1f2024; color: #e7e7ea; box-shadow: 0 24px 64px rgba(0, 0, 0, 0.55), 0 4px 12px rgba(0, 0, 0, 0.35); }
:host([data-theme="dark"]) .input-row { border-bottom-color: #2c2d31; }
:host([data-theme="dark"]) .input-row .glyph,
:host([data-theme="dark"]) .input-row input::placeholder,
:host([data-theme="dark"]) .row .url,
:host([data-theme="dark"]) .row .match,
:host([data-theme="dark"]) .footer { color: #a1a1aa; }
:host([data-theme="dark"]) .input-row .esc { background: #2c2d31; border-color: #3a3b40; color: #a1a1aa; }
:host([data-theme="dark"]) .row[aria-selected="true"] { background: #2c2d31; border-left-color: #ffffff; }
:host([data-theme="dark"]) .row .title { color: #e7e7ea; }
:host([data-theme="dark"]) .row .favicon { background: #2c2d31; }
:host([data-theme="dark"]) .row .title mark { background: #facc15; color: #111111; }
:host([data-theme="dark"]) .footer { background: #161719; border-top-color: #2c2d31; }
:host([data-theme="dark"]) .footer .hint kbd { background: #2c2d31; border-color: #3a3b40; color: #e7e7ea; }
:host([data-theme="dark"]) .empty .suggestion { color: #60a5fa; }
:host([data-theme="dark"]) .empty .suggestion:hover { color: #93bbfd; }
:host([data-theme="dark"]) .section-header { color: #71717a; }
:host([data-theme="dark"]) .autocorrect-banner { background: #422006; border-bottom-color: #854d0e; color: #a1a1aa; }
:host([data-theme="dark"]) .autocorrect-banner strong { color: #e7e7ea; }
:host([data-theme="dark"]) .autocorrect-banner .autocorrect-orig { color: #60a5fa; }
:host([data-theme="dark"]) .row-site .site-icon { background: #2c2d31; }
:host([data-theme="dark"]) .row-action .action-icon { background: #1a2e1a; }
:host([data-theme="dark"]) .row-action .action-badge { color: #4ade80; }
:host([data-theme="dark"]) .row-browser-action .action-icon { background: #172554; }
:host([data-theme="dark"]) .row-browser-action .action-badge { color: #93bbfd; }
:host([data-theme="dark"]) .reef-suggestion-chip { background: #27272a; border-color: #3f3f46; color: #a1a1aa; }

@keyframes reef-spotlight-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes reef-spotlight-slide { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) {
  .backdrop, .card { animation: none; }
}
`;

function defaultSendMessage(msg: unknown): Promise<unknown> {
  return new Promise((resolve) => {
    try {
      const result = (globalThis as any).chrome?.runtime?.sendMessage(msg, (res: unknown) => resolve(res));
      if (result && typeof result.then === 'function') {
        result.then(resolve, () => resolve(undefined));
      }
    } catch {
      resolve(undefined);
    }
  });
}

async function getStoredTheme(): Promise<'light' | 'dark' | 'system'> {
  try {
    const chrome2 = (globalThis as any).chrome;
    if (chrome2?.storage?.local?.get) {
      const data = await new Promise<Record<string, any>>((resolve) => {
        chrome2.storage.local.get(['theme'], (d: Record<string, any>) => resolve(d));
      });
      const t = data?.theme;
      if (t === 'light' || t === 'dark' || t === 'system') return t;
    }
  } catch {
    // ignore
  }
  return 'system';
}

async function getSearchEngine(): Promise<{ id: string; name: string; urlTemplate: string }> {
  try {
    const chrome2 = (globalThis as any).chrome;
    if (chrome2?.storage?.local?.get) {
      const data = await new Promise<Record<string, any>>((resolve) => {
        chrome2.storage.local.get(['searchEngine', 'customSearchUrl'], (d: Record<string, any>) => resolve(d));
      });
      const engine = data?.searchEngine || 'google';
      return resolveSearchEngine(engine, data?.customSearchUrl);
    }
  } catch {
    // ignore
  }
  return resolveSearchEngine('google');
}

function resolveSearchEngine(
  id: string,
  customUrl?: string
): { id: string; name: string; urlTemplate: string } {
  const engines: Record<string, { name: string; urlTemplate: string }> = {
    google: { name: 'Google', urlTemplate: 'https://www.google.com/search?q={query}' },
    bing: { name: 'Bing', urlTemplate: 'https://www.bing.com/search?q={query}' },
    duckduckgo: { name: 'DuckDuckGo', urlTemplate: 'https://duckduckgo.com/?q={query}' },
    brave: { name: 'Brave', urlTemplate: 'https://search.brave.com/search?q={query}' },
    ecosia: { name: 'Ecosia', urlTemplate: 'https://www.ecosia.org/search?q={query}' },
    kagi: { name: 'Kagi', urlTemplate: 'https://kagi.com/search?q={query}' },
    custom: { name: 'Custom', urlTemplate: customUrl || 'https://www.google.com/search?q={query}' },
  };
  const found = engines[id] || engines.google;
  return { id, name: found.name, urlTemplate: found.urlTemplate };
}

function resolveTheme(t: 'light' | 'dark' | 'system'): 'light' | 'dark' {
  if (t === 'system') {
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  }
  return t;
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function highlight(text: string, query: string): string {
  if (!query) return escapeHtml(text);
  const safe = escapeHtml(text);
  const q = escapeHtml(query);
  try {
    const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig');
    return safe.replace(re, '<mark>$1</mark>');
  } catch {
    return safe;
  }
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '\u2026';
}

const FALLBACK_FAVICON =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><circle cx='8' cy='8' r='6' fill='none' stroke='%23999' stroke-width='1.4'/><path d='M2 8h12M8 2c2.5 2.5 2.5 9.5 0 12M8 2c-2.5 2.5-2.5 9.5 0 12' fill='none' stroke='%23999' stroke-width='1.4'/></svg>";

function scoreTitle(title: string, q: string): number {
  if (!q) return 0;
  const t = title.toLowerCase();
  if (t === q) return 60;
  if (t.startsWith(q)) return 35;
  const idx = t.indexOf(q);
  if (idx >= 0) return 15 + Math.max(0, 10 - Math.floor(idx / 8));
  if (new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(title)) return 12;
  return 0;
}

function scoreBrowserAction(label: string, q: string): number {
  if (!q) return 0;
  const l = label.toLowerCase();
  const lowerQ = q.toLowerCase();
  const words = lowerQ.split(/\s+/).filter(Boolean);
  let score = 0;
  if (l === lowerQ) score += 50;
  else if (l.startsWith(lowerQ)) score += 30;
  else if (l.includes(lowerQ)) score += 15;
  for (const w of words) {
    if (l.includes(w)) score += 5;
  }
  return score;
}

function looksLikeUrl(q: string): boolean {
  return (
    /^(https?:\/\/|www\.)/i.test(q) ||
    (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(q) && q.includes('.'))
  );
}

export function createSpotlight(opts: SpotlightOptions = {}) {
  const maxRows = opts.maxRows ?? MAX_ROWS_DEFAULT;
  const debounceMs = opts.debounceMs ?? DEBOUNCE_DEFAULT;
  const maxRecents = opts.maxRecents ?? MAX_RECENTS_DEFAULT;
  const send = opts.sendMessage ?? defaultSendMessage;

  let host: HTMLDivElement | null = null;
  let shadow: ShadowRoot | null = null;
  let card: HTMLDivElement | null = null;
  let input: HTMLInputElement | null = null;
  let results: HTMLDivElement | null = null;
  let footer: HTMLDivElement | null = null;
  let mounted = false;
  let open = false;
  let currentResults: SpotlightTabResult[] = [];
  let unifiedResults: UnifiedResult[] = [];
  let currentQuery = '';
  let currentSuggestion: string | undefined;
  let currentSiteResults: SpotlightSiteResult[] = [];
  let currentActions: SpotlightAction[] = [];
  let currentAutocorrected = false;
  let currentReefSuggestions: string[] = [];
  let selectedIndex = 0;
  let perTabMatchIndex = new Map<number, number>();
  let debounceHandle: number | null = null;
  let lastQueryKey = '\0never-queried\0';
  let inFlight = 0;

    const browserActions: SpotlightAction[] = [
      { type: 'browser-action', title: 'Mute/unmute current tab', payload: 'mute-tab' },
      { type: 'browser-action', title: 'Pin/unpin current tab', payload: 'pin-tab' },
      { type: 'browser-action', title: 'Duplicate current tab', payload: 'duplicate-tab' },
      { type: 'browser-action', title: 'Reload current tab', payload: 'reload-tab' },
      { type: 'browser-action', title: 'Close all other tabs', payload: 'close-other-tabs' },
      { type: 'browser-action', title: 'Focus mode (close other tabs)', payload: 'focus-mode' },
      { type: 'browser-action', title: 'Save all open tabs as session', payload: 'save-session' },
      { type: 'browser-action', title: 'Bookmark current page', payload: 'bookmark-page' },
      { type: 'browser-action', title: 'Remove bookmark for current page', payload: 'remove-bookmark' },
      { type: 'browser-action', title: 'Close current tab', payload: 'close-tab' },
      { type: 'browser-action', title: 'Reopen closed tab', payload: 'reopen-closed-tab' },
      { type: 'browser-action', title: 'Go back', payload: 'go-back' },
      { type: 'browser-action', title: 'Go forward', payload: 'go-forward' },
      { type: 'browser-action', title: 'Toggle fullscreen', payload: 'toggle-fullscreen' },
      { type: 'browser-action', title: 'Open new tab', payload: 'new-tab' },
    { type: 'browser-action', title: 'Open new window', payload: 'new-window' },
    { type: 'browser-action', title: 'Open incognito window', payload: 'new-incognito' },
    { type: 'browser-action', title: 'Zoom in', payload: 'zoom-in' },
    { type: 'browser-action', title: 'Zoom out', payload: 'zoom-out' },
    { type: 'browser-action', title: 'Reset zoom', payload: 'zoom-reset' },
    { type: 'browser-action', title: 'Print page', payload: 'print-page' },
    { type: 'browser-action', title: 'Save page', payload: 'save-page' },
  ];

  function mount() {
    if (mounted) return;
    host = document.createElement('div');
    host.id = HOST_ID;
    host.style.position = 'fixed';
    host.style.inset = '0';
    host.style.zIndex = '2147483647';
    host.style.display = 'none';
    shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = STYLES;
    shadow.appendChild(style);

    const backdrop = document.createElement('div');
    backdrop.className = 'backdrop';
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) hide();
    });

    card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', 'Reef Spotlight');
    card.addEventListener('mousedown', (e) => e.stopPropagation());

    const inputRow = document.createElement('div');
    inputRow.className = 'input-row';
    const glyph = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    glyph.setAttribute('class', 'glyph');
    glyph.setAttribute('viewBox', '0 0 20 20');
    glyph.setAttribute('fill', 'none');
    glyph.setAttribute('stroke', 'currentColor');
    glyph.setAttribute('stroke-width', '2');
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '9');
    circle.setAttribute('cy', '9');
    circle.setAttribute('r', '6');
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '13.5');
    line.setAttribute('y1', '13.5');
    line.setAttribute('x2', '18');
    line.setAttribute('y2', '18');
    line.setAttribute('stroke-linecap', 'round');
    glyph.appendChild(circle);
    glyph.appendChild(line);
    inputRow.appendChild(glyph);

    input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Search tabs, bookmarks, history & browser actions…';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-label', 'Search tabs, bookmarks, history and browser actions');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', 'reef-spotlight-results');
    input.addEventListener('input', onInput);
    input.addEventListener('keydown', onKeyDown);
    inputRow.appendChild(input);

    const esc = document.createElement('span');
    esc.className = 'esc';
    esc.textContent = 'esc';
    inputRow.appendChild(esc);

    results = document.createElement('div');
    results.className = 'results';
    results.id = 'reef-spotlight-results';
    results.setAttribute('role', 'listbox');
    results.setAttribute('aria-label', 'Results');
    results.addEventListener('mousedown', (e) => {
      const target = e.target as HTMLElement;
      const row = target.closest('.row') as HTMLElement | null;
      if (!row) return;
      e.preventDefault();
      const idx = Number(row.dataset.index);
      if (Number.isFinite(idx)) {
        selectedIndex = idx;
        applySelection();
        openSelected();
      }
    });

    footer = document.createElement('div');
    footer.className = 'footer';
    const hints = document.createElement('span');
    hints.className = 'hints';
    hints.innerHTML =
      '<span class="hint"><kbd>↑</kbd><kbd>↓</kbd>navigate</span><span class="hint"><kbd>↵</kbd>open</span><span class="hint"><kbd>esc</kbd>close</span><span class="hint"><kbd>tab</kbd>cycle matches</span><span class="hint"><kbd>Ctrl</kbd>+<kbd>1–9</kbd>jump</span>';
    footer.appendChild(hints);
    const brand = document.createElement('span');
    brand.className = 'brand';
    brand.textContent = 'Reef Spotlight';
    footer.appendChild(brand);

    card.appendChild(inputRow);
    card.appendChild(results);
    card.appendChild(footer);
    backdrop.appendChild(card);
    shadow.appendChild(backdrop);

    host.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          hide();
        }
      },
      true
    );

    document.documentElement.appendChild(host);
    mounted = true;
  }

  function setSelected(idx: number, scroll = false) {
    if (!results) return;
    if (unifiedResults.length === 0) {
      selectedIndex = 0;
      return;
    }
    if (idx < 0) idx = unifiedResults.length - 1;
    if (idx >= unifiedResults.length) idx = 0;
    selectedIndex = idx;
    applySelection(scroll);
  }

  function applySelection(scroll = false) {
    if (!results) return;
    const rows = results.querySelectorAll('.row');
    rows.forEach((r) => r.setAttribute('aria-selected', 'false'));
    const sel = rows[selectedIndex];
    if (sel) {
      sel.setAttribute('aria-selected', 'true');
      if (scroll && typeof sel.scrollIntoView === 'function') {
        try {
          sel.scrollIntoView({ block: 'nearest' });
        } catch {
          // ignore
        }
      }
    }
  }

  function renderSectionHeader(parent: DocumentFragment | HTMLDivElement, label: string) {
    const header = document.createElement('div');
    header.className = 'section-header';
    header.textContent = label;
    parent.appendChild(header);
  }

  function createTabRow(item: SpotlightTabResult, query: string, idx: number): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'row';
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', idx === selectedIndex ? 'true' : 'false');
    row.dataset.index = String(idx);
    row.dataset.tabId = String(item.tabId);
    row.dataset.windowId = String(item.windowId);
    row.title = item.title;

    const fav = document.createElement('img');
    fav.className = 'favicon';
    fav.alt = '';
    fav.width = 16;
    fav.height = 16;
    fav.src = item.favIconUrl || FALLBACK_FAVICON;
    fav.addEventListener(
      'error',
      () => {
        fav.src = FALLBACK_FAVICON;
      },
      { once: true }
    );
    row.appendChild(fav);

    const main = document.createElement('div');
    main.className = 'main';
    const title = document.createElement('div');
    title.className = 'title';
    title.innerHTML = highlight(truncate(item.title, 60), query);
    const url = document.createElement('div');
    url.className = 'url';
    url.textContent = hostFromUrl(item.url);
    main.appendChild(title);
    main.appendChild(url);
    row.appendChild(main);

    const match = item.matchedRecords?.[perTabMatchIndex.get(item.tabId) ?? 0];
    if (match && (match.headingText || match.bodyText)) {
      const snippet = document.createElement('div');
      snippet.className = 'match';
      const text = (match.headingText ? match.headingText + ' — ' : '') + (match.bodyText || '');
      snippet.textContent = truncate(text, 90);
      row.appendChild(snippet);
    } else {
      const placeholder = document.createElement('div');
      row.appendChild(placeholder);
    }
    return row;
  }

  function createSiteRow(sr: SpotlightSiteResult, query: string, idx: number): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'row row-site';
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', idx === selectedIndex ? 'true' : 'false');
    row.dataset.index = String(idx);
    row.title = sr.headingText;

    const icon = document.createElement('div');
    icon.className = 'favicon site-icon';
    icon.innerHTML =
      '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2.5 2 9.5 0 12M8 2c-2 2.5-2 9.5 0 12"/></svg>';
    row.appendChild(icon);

    const main = document.createElement('div');
    main.className = 'main';
    const title = document.createElement('div');
    title.className = 'title';
    title.innerHTML = highlight(truncate(sr.headingText, 60), query);
    const url = document.createElement('div');
    url.className = 'url';
    url.textContent = sr.sourceOrigin;
    main.appendChild(title);
    main.appendChild(url);
    row.appendChild(main);

    const snippet = document.createElement('div');
    snippet.className = 'match';
    snippet.textContent = truncate(sr.bodyText, 90);
    row.appendChild(snippet);
    return row;
  }

  function createActionRow(action: SpotlightAction, idx: number, variant: 'action' | 'browser-action' = 'action'): HTMLDivElement {
    const row = document.createElement('div');
    row.className = `row row-${variant}`;
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', idx === selectedIndex ? 'true' : 'false');
    row.dataset.index = String(idx);
    row.title = action.title;

    const icon = document.createElement('div');
    icon.className = 'favicon action-icon';
    if (action.type === 'search-web') {
      icon.innerHTML =
        '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="5"/><line x1="11" y1="11" x2="15" y2="15" stroke-linecap="round"/></svg>';
    } else {
      icon.innerHTML =
        '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4"/></svg>';
    }
    row.appendChild(icon);

    const main = document.createElement('div');
    main.className = 'main';
    const title = document.createElement('div');
    title.className = 'title action-title';
    title.textContent = action.title;
    main.appendChild(title);
    row.appendChild(main);

    const badge = document.createElement('div');
    badge.className = 'match action-badge';
    badge.textContent = variant === 'browser-action' ? 'action' : 'new tab';
    row.appendChild(badge);
    return row;
  }

  function createBookmarkRow(bm: chrome.bookmarks.BookmarkTreeNode, query: string, idx: number): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'row row-bookmark';
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', idx === selectedIndex ? 'true' : 'false');
    row.dataset.index = String(idx);
    row.title = bm.title || bm.url || '';

    const icon = document.createElement('div');
    icon.className = 'favicon action-icon';
    icon.innerHTML =
      '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 2h8a1 1 0 0 1 1 1v11l-5-3-5 3V3a1 1 0 0 1 1-1z"/></svg>';
    row.appendChild(icon);

    const main = document.createElement('div');
    main.className = 'main';
    const title = document.createElement('div');
    title.className = 'title';
    title.innerHTML = highlight(truncate(bm.title || bm.url || '', 60), query);
    const url = document.createElement('div');
    url.className = 'url';
    url.textContent = hostFromUrl(bm.url || '');
    main.appendChild(title);
    main.appendChild(url);
    row.appendChild(main);

    const badge = document.createElement('div');
    badge.className = 'match action-badge';
    badge.textContent = 'bookmark';
    row.appendChild(badge);
    return row;
  }

  function createHistoryRow(h: chrome.history.HistoryItem, query: string, idx: number): HTMLDivElement {
    const row = document.createElement('div');
    row.className = 'row row-history';
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', idx === selectedIndex ? 'true' : 'false');
    row.dataset.index = String(idx);
    row.title = h.title || h.url || '';

    const icon = document.createElement('div');
    icon.className = 'favicon action-icon';
    icon.innerHTML =
      '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M8 4v4l3 2" stroke-linecap="round"/></svg>';
    row.appendChild(icon);

    const main = document.createElement('div');
    main.className = 'main';
    const title = document.createElement('div');
    title.className = 'title';
    title.innerHTML = highlight(truncate(h.title || h.url || '', 60), query);
    const url = document.createElement('div');
    url.className = 'url';
    url.textContent = hostFromUrl(h.url || '');
    main.appendChild(title);
    main.appendChild(url);
    row.appendChild(main);

    const badge = document.createElement('div');
    badge.className = 'match action-badge';
    badge.textContent = 'history';
    row.appendChild(badge);
    return row;
  }

  function createDownloadRow(d: chrome.downloads.DownloadItem, query: string, idx: number): HTMLDivElement {
    const filename = d.filename ? d.filename.split(/[/\\]/).pop() : 'Unknown file';
    const row = document.createElement('div');
    row.className = 'row row-download';
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', idx === selectedIndex ? 'true' : 'false');
    row.dataset.index = String(idx);
    row.title = filename;

    const icon = document.createElement('div');
    icon.className = 'favicon action-icon';
    icon.innerHTML =
      '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 1v8m0 0 3-3m-3 3-3-3"/><path d="M2 11v2a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-2"/></svg>';
    row.appendChild(icon);

    const main = document.createElement('div');
    main.className = 'main';
    const title = document.createElement('div');
    title.className = 'title';
    title.innerHTML = highlight(truncate(filename, 60), query);
    const url = document.createElement('div');
    url.className = 'url';
    url.textContent = d.state || '';
    main.appendChild(title);
    main.appendChild(url);
    row.appendChild(main);

    const badge = document.createElement('div');
    badge.className = 'match action-badge';
    badge.textContent = 'download';
    row.appendChild(badge);
    return row;
  }

  function renderResults(
    items: SpotlightTabResult[],
    query: string,
    suggestion: string | undefined,
    autocorrected: boolean,
    siteResults: SpotlightSiteResult[],
    actions: SpotlightAction[],
    reefSuggestions: string[],
    bookmarks: chrome.bookmarks.BookmarkTreeNode[],
    historyItems: chrome.history.HistoryItem[],
    downloads: chrome.downloads.DownloadItem[]
  ) {
    if (!results) return;
    currentResults = items;
    unifiedResults = [];
    selectedIndex = 0;
    results.replaceChildren();

    const hasAny =
      items.length > 0 ||
      siteResults.length > 0 ||
      actions.length > 0 ||
      bookmarks.length > 0 ||
      historyItems.length > 0 ||
      downloads.length > 0;

    if (!hasAny) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      if (suggestion && suggestion !== query.toLowerCase() && !autocorrected) {
        empty.innerHTML = `No matching tabs found. Did you mean <a class="suggestion" href="#">${escapeHtml(suggestion)}</a>?`;
        const link = empty.querySelector('.suggestion');
        if (link) {
          link.addEventListener('click', (e) => {
            e.preventDefault();
            if (input) {
              input.value = suggestion;
              currentQuery = suggestion;
              onInput();
            }
          });
        }
      } else {
        empty.textContent = query ? 'No results. Try a web search below.' : 'Start typing to search every open tab.';
      }
      if (reefSuggestions.length > 0) {
        const chips = document.createElement('div');
        chips.className = 'reef-suggestion-chips';
        for (const s of reefSuggestions) {
          const chip = document.createElement('button');
          chip.className = 'reef-suggestion-chip';
          chip.textContent = s;
          chip.addEventListener('click', () => {
            if (input) {
              input.value = s;
              currentQuery = s;
              onInput();
            }
          });
          chips.appendChild(chip);
        }
        empty.appendChild(chips);
      }
      if (actions.length > 0) {
        const frag = document.createDocumentFragment();
        renderSectionHeader(frag, 'Search');
        for (const action of actions) {
          const idx = unifiedResults.length;
          unifiedResults.push({ kind: 'action', data: action });
          frag.appendChild(createActionRow(action, idx));
        }
        results.appendChild(frag);
      }
      results.appendChild(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    if (autocorrected && suggestion) {
      const banner = document.createElement('div');
      banner.className = 'autocorrect-banner';
      banner.innerHTML = `Showing results for <strong>${escapeHtml(suggestion)}</strong> &mdash; <a class="autocorrect-orig" href="#">search for "${escapeHtml(query)}" instead</a>`;
      const origLink = banner.querySelector('.autocorrect-orig');
      if (origLink) {
        origLink.addEventListener('click', (e) => {
          e.preventDefault();
          lastQueryKey = '\0force-requery\0';
          if (input) {
            input.value = query;
            currentQuery = query;
            onInput();
          }
        });
      }
      fragment.appendChild(banner);
    }

    if (actions.length > 0) {
      renderSectionHeader(fragment, 'Search');
      for (const action of actions) {
        const idx = unifiedResults.length;
        unifiedResults.push({ kind: 'action', data: action });
        fragment.appendChild(createActionRow(action, idx));
      }
    }

    const scoredBrowserActions = query
      ? browserActions
          .map((a) => ({ action: a, score: scoreBrowserAction(a.title, query) }))
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 6)
      : [];
    if (scoredBrowserActions.length > 0) {
      renderSectionHeader(fragment, 'Browser Actions');
      for (const { action } of scoredBrowserActions) {
        const idx = unifiedResults.length;
        unifiedResults.push({ kind: 'browser-action', data: action });
        fragment.appendChild(createActionRow(action, idx, 'browser-action'));
      }
    }

    if (items.length > 0) {
      renderSectionHeader(fragment, 'Tabs');
      const renderCount = Math.min(items.length, maxRows);
      for (let i = 0; i < renderCount; i++) {
        const item = items[i];
        const idx = unifiedResults.length;
        unifiedResults.push({ kind: 'tab', data: item });
        fragment.appendChild(createTabRow(item, query, idx));
      }
    }

    if (bookmarks.length > 0) {
      renderSectionHeader(fragment, 'Bookmarks');
      for (const bm of bookmarks.slice(0, 10)) {
        const idx = unifiedResults.length;
        unifiedResults.push({ kind: 'bookmark', data: bm });
        fragment.appendChild(createBookmarkRow(bm, query, idx));
      }
    }

    if (historyItems.length > 0) {
      renderSectionHeader(fragment, 'History');
      for (const h of historyItems.slice(0, 10)) {
        const idx = unifiedResults.length;
        unifiedResults.push({ kind: 'history', data: h });
        fragment.appendChild(createHistoryRow(h, query, idx));
      }
    }

    if (downloads.length > 0) {
      renderSectionHeader(fragment, 'Downloads');
      for (const d of downloads.slice(0, 10)) {
        const idx = unifiedResults.length;
        unifiedResults.push({ kind: 'download', data: d });
        fragment.appendChild(createDownloadRow(d, query, idx));
      }
    }

    if (siteResults.length > 0) {
      renderSectionHeader(fragment, 'Site Content');
      for (const sr of siteResults) {
        const idx = unifiedResults.length;
        unifiedResults.push({ kind: 'site', data: sr });
        fragment.appendChild(createSiteRow(sr, query, idx));
      }
    }

    results.appendChild(fragment);
    applySelection();
  }

  function renderRecents(items: { url: string; title: string; favicon?: string; visitedAt: number }[]) {
    if (!results) return;
    currentResults = items.map((r) => ({
      tabId: -1,
      windowId: -1,
      title: r.title,
      url: r.url,
      favIconUrl: r.favicon,
      score: 0,
      matchedRecords: [],
    })) as SpotlightTabResult[];
    unifiedResults = [];
    selectedIndex = 0;
    results.replaceChildren();
    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'Start typing to search every open tab.';
      results.appendChild(empty);
      return;
    }
    const fragment = document.createDocumentFragment();
    items.forEach((r, i) => {
      const row = document.createElement('div');
      row.className = 'row';
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
      row.dataset.index = String(i);
      row.dataset.recent = '1';
      row.title = r.title;

      const fav = document.createElement('img');
      fav.className = 'favicon';
      fav.alt = '';
      fav.width = 16;
      fav.height = 16;
      fav.src = r.favicon || FALLBACK_FAVICON;
      fav.addEventListener(
        'error',
        () => {
          fav.src = FALLBACK_FAVICON;
        },
        { once: true }
      );
      row.appendChild(fav);

      const main = document.createElement('div');
      main.className = 'main';
      const title = document.createElement('div');
      title.className = 'title';
      title.textContent = truncate(r.title, 60);
      const url = document.createElement('div');
      url.className = 'url';
      url.textContent = hostFromUrl(r.url);
      main.appendChild(title);
      main.appendChild(url);
      row.appendChild(main);

      const tag = document.createElement('div');
      tag.className = 'match';
      tag.textContent = 'recent';
      row.appendChild(tag);
      fragment.appendChild(row);
    });
    results.appendChild(fragment);
  }

  async function runQuery(query: string) {
    const key = query.trim();
    if (key === lastQueryKey) return;
    lastQueryKey = key;
    perTabMatchIndex = new Map();

    if (!key) {
      currentSuggestion = undefined;
      currentSiteResults = [];
      currentActions = [];
      currentAutocorrected = false;
      const recents = await fetchRecents();
      renderRecents(recents);
      return;
    }

    const engine = await getSearchEngine();
    const reqId = ++inFlight;
    const res = (await send({ type: 'SPOTLIGHT_SEARCH', query: key, limit: maxRows })) as SpotlightSearchResponse | undefined;
    if (reqId !== inFlight) return;

    const items = res && res.success && Array.isArray(res.items) ? res.items : [];
    currentSuggestion = res && res.suggestion;
    currentAutocorrected = !!(res && res.autocorrected);
    currentSiteResults = res && Array.isArray(res.siteResults) ? res.siteResults : [];
    currentActions = [];

    if (looksLikeUrl(key)) {
      let navUrl = key;
      if (!/^https?:\/\//i.test(navUrl)) navUrl = 'https://' + navUrl;
      currentActions.push({ type: 'open-url', title: `Open ${navUrl}`, url: navUrl });
    }
    currentActions.push({
      type: 'search-web',
      title: `Search ${engine.name} for "${key}"`,
      url: engine.urlTemplate.replace('{query}', encodeURIComponent(key)),
    });

    const [bookmarks, historyItems, downloads] = await Promise.all([
      searchBookmarks(key),
      searchHistory(key),
      searchDownloads(key),
    ]);

    currentReefSuggestions = items.length === 0 ? [] : [];
    renderResults(
      items,
      key,
      currentSuggestion,
      currentAutocorrected,
      currentSiteResults,
      currentActions,
      currentReefSuggestions,
      bookmarks,
      historyItems,
      downloads
    );
  }

  async function fetchRecents(): Promise<{ url: string; title: string; favicon?: string; visitedAt: number }[]> {
    try {
      const res = (await send({ type: 'LIBRARY_RECENTS_LIST' })) as { success?: boolean; items?: RecentPage[] } | undefined;
      const list = res && res.success && Array.isArray(res.items) ? res.items : [];
      return list.slice(0, maxRecents).map((r) => ({
        url: r.url,
        title: r.title,
        favicon: r.favicon,
        visitedAt: r.visitedAt ?? 0,
      }));
    } catch {
      return [];
    }
  }

  async function searchBookmarks(query: string): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
    try {
      if (!(globalThis as any).chrome?.bookmarks?.search) return [];
      return await new Promise<chrome.bookmarks.BookmarkTreeNode[]>((resolve) => {
        chrome.bookmarks.search(query, (results2) => resolve(results2 || []));
      });
    } catch {
      return [];
    }
  }

  async function searchHistory(query: string): Promise<chrome.history.HistoryItem[]> {
    try {
      if (!(globalThis as any).chrome?.history?.search) return [];
      return await new Promise<chrome.history.HistoryItem[]>((resolve) => {
        chrome.history.search({ text: query, maxResults: 20, startTime: Date.now() - 30 * 86400000 }, (results2) =>
          resolve(results2 || [])
        );
      });
    } catch {
      return [];
    }
  }

  async function searchDownloads(query: string): Promise<chrome.downloads.DownloadItem[]> {
    try {
      if (!(globalThis as any).chrome?.downloads?.search) return [];
      return await new Promise<chrome.downloads.DownloadItem[]>((resolve) => {
        chrome.downloads.search({ query: [query], limit: 20 }, (results2) => resolve(results2 || []));
      });
    } catch {
      return [];
    }
  }

  function onInput() {
    if (!input) return;
    currentQuery = input.value;
    if (debounceHandle) window.clearTimeout(debounceHandle);
    debounceHandle = window.setTimeout(() => {
      debounceHandle = null;
      void runQuery(currentQuery);
    }, debounceMs);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!input) return;
    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
    const mod = isMac ? e.metaKey : e.ctrlKey;

    if (e.key === 'ArrowDown' || (mod && (e.key === 'n' || e.key === 'N'))) {
      e.preventDefault();
      setSelected(selectedIndex + 1, true);
      return;
    }
    if (e.key === 'ArrowUp' || (mod && (e.key === 'p' || e.key === 'P'))) {
      e.preventDefault();
      setSelected(selectedIndex - 1, true);
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      setSelected(0, true);
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      setSelected(unifiedResults.length - 1, true);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      openSelected();
      return;
    }
    if (e.key === 'Tab') {
      const sel = unifiedResults[selectedIndex];
      if (sel && sel.kind === 'tab' && sel.data.matchedRecords && sel.data.matchedRecords.length > 1) {
        e.preventDefault();
        const next = ((perTabMatchIndex.get(sel.data.tabId) ?? 0) + 1) % sel.data.matchedRecords.length;
        perTabMatchIndex.set(sel.data.tabId, next);
        applySelection();
        if (results) {
          const row = results.querySelectorAll('.row')[selectedIndex];
          if (row) {
            const match = sel.data.matchedRecords[next];
            const snippetEl = row.querySelector('.match');
            if (snippetEl) {
              const text = (match.headingText ? match.headingText + ' — ' : '') + (match.bodyText || '');
              snippetEl.textContent = truncate(text, 90);
            }
          }
        }
      }
      return;
    }
    if (e.key === 'Backspace' && e.shiftKey && mod) {
      e.preventDefault();
      if (input) {
        input.value = '';
        currentQuery = '';
        onInput();
      }
      return;
    }
    if (mod && e.key >= '1' && e.key <= '9') {
      e.preventDefault();
      const idx = Number(e.key) - 1;
      if (idx < unifiedResults.length) {
        setSelected(idx, true);
        openSelected();
      }
      return;
    }
  }

  async function openSelected() {
    const sel = unifiedResults[selectedIndex];
    if (!sel) return;

    if (sel.kind === 'browser-action') {
      try {
        await send({ type: 'BROWSER_ACTION_EXECUTE', action: sel.data.payload });
      } catch {
        // ignore
      }
      hide();
      return;
    }

    if (sel.kind === 'bookmark') {
      try {
        if (sel.data.url) {
          await send({ type: 'SPOTLIGHT_OPEN_NEW_TAB', url: sel.data.url });
        }
      } catch {
        // ignore
      }
      hide();
      return;
    }

    if (sel.kind === 'history') {
      try {
        if (sel.data.url) {
          await send({ type: 'SPOTLIGHT_OPEN_NEW_TAB', url: sel.data.url });
        }
      } catch {
        // ignore
      }
      hide();
      return;
    }

    if (sel.kind === 'download') {
      try {
        await send({ type: 'BROWSER_ACTION_EXECUTE', action: 'open-download', downloadId: sel.data.id });
      } catch {
        // ignore
      }
      hide();
      return;
    }

    if (sel.kind === 'action') {
      try {
        if (sel.data.url) {
          await send({ type: 'SPOTLIGHT_OPEN_NEW_TAB', url: sel.data.url });
        }
      } catch {
        // ignore
      }
      hide();
      return;
    }

    if (sel.kind === 'site') {
      try {
        if (sel.data.url) {
          await send({ type: 'SPOTLIGHT_OPEN_NEW_TAB', url: sel.data.url });
        }
      } catch {
        // ignore
      }
      hide();
      return;
    }

    const tabHit = sel.data as SpotlightTabResult;
    if ('_isRecent' in tabHit) {
      try {
        await send({ type: 'LIBRARY_OPEN_RECENT', url: tabHit.url });
      } catch {
        // ignore
      }
      hide();
      return;
    }

    const matchIdx = perTabMatchIndex.get(tabHit.tabId) ?? 0;
    const record = tabHit.matchedRecords?.[matchIdx];
    try {
      await send({ type: 'TAB_SWITCH', tabId: tabHit.tabId, windowId: tabHit.windowId });
      if (record) {
        await send({ type: 'SPOTLIGHT_OPEN_RECORD', tabId: tabHit.tabId, record });
      }
    } catch {
      // ignore
    }
    hide();
  }

  async function applyTheme(theme: 'light' | 'dark' | 'system') {
    if (!host) return;
    const resolved = resolveTheme(theme);
    host.setAttribute('data-theme', resolved);
  }

  async function show() {
    mount();
    if (!host || !input) return;
    open = true;
    host.style.display = 'block';
    const t = opts.theme ?? (await getStoredTheme());
    await applyTheme(t);
    lastQueryKey = '\0never-queried\0';
    perTabMatchIndex = new Map();
    currentSuggestion = undefined;
    currentSiteResults = [];
    currentActions = [];
    currentAutocorrected = false;
    unifiedResults = [];
    input.value = '';
    currentQuery = '';
    await runQuery('');
    requestAnimationFrame(() => {
      try {
        input?.focus();
      } catch {
        // ignore
      }
    });
  }

  function hide() {
    if (!host) return;
    open = false;
    host.style.display = 'none';
    if (debounceHandle) {
      window.clearTimeout(debounceHandle);
      debounceHandle = null;
    }
  }

  async function toggle() {
    if (open) hide();
    else await show();
  }

  function isOpen() {
    return open;
  }

  function destroy() {
    if (debounceHandle) window.clearTimeout(debounceHandle);
    if (host && host.parentNode) host.parentNode.removeChild(host);
    host = null;
    shadow = null;
    card = null;
    input = null;
    results = null;
    footer = null;
    mounted = false;
    open = false;
  }

  return { show, hide, toggle, isOpen, destroy };
}
