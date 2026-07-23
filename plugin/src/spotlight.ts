/**
 * @file Spotlight overlay for Reef for Browsers.
 *
 * A Spotlight-style (macOS) cross-tab search overlay injected into every page
 * by the content script. Opens on Ctrl+Shift+K (or Cmd+Shift+K on macOS) via
 * the `open-spotlight` browser command.
 *
 * - Shadow DOM (no page-style leakage; no extension CSS conflicts).
 * - Keyboard-first: ArrowUp/Down navigate, Enter opens, Esc closes,
 *   Ctrl+1..9 jumps, Tab cycles matches within a tab.
 * - Mouse is secondary: click a row to open, click backdrop to dismiss.
 * - Ranking is computed in the background service worker (see
 *   searchOpenTabs in background.ts); the overlay just renders.
 */

export interface SpotlightSearchHit {
  tabId: number;
  title: string;
  url: string;
  favIconUrl?: string;
  windowId: number;
  score: number;
  matchedRecords: Array<{
    headingText?: string;
    bodyText?: string;
    selector?: string;
    type?: string;
  }>;
}

export interface SpotlightRecent {
  url: string;
  title: string;
  favicon?: string;
  visitedAt: number;
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
  type: 'open-url' | 'search-web';
  title: string;
  url: string;
}

export interface SpotlightHandle {
  show(): Promise<void>;
  hide(): void;
  toggle(): Promise<void>;
  isOpen(): boolean;
  destroy(): void;
}

export interface SpotlightOptions {
  /** When provided, skip reading chrome.storage for theme. */
  theme?: 'light' | 'dark' | 'system';
  /** Override the chrome.runtime sender (used in tests). */
  sendMessage?: (msg: any) => Promise<any>;
  /** Maximum rows rendered; results beyond this still count toward the footer. */
  maxRows?: number;
  /** Debounce for keystroke-driven searches (ms). */
  debounceMs?: number;
  /** Maximum recents to show when the input is empty. */
  maxRecents?: number;
}

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
.empty .suggestion:hover {
  color: #1d4ed8;
}
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

/* Section headers */
.section-header {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: #9ca3af;
  padding: 8px 16px 4px;
  user-select: none;
}

/* Autocorrect banner */
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

/* Site result rows */
.row-site .site-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
  background: #f3f4f6;
  border-radius: 2px;
}
.row-site .site-icon svg { stroke: #6366f1; }

/* Action rows */
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
:host([data-theme="dark"]) .footer .brand { color: #e7e7ea; }
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

@keyframes reef-spotlight-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes reef-spotlight-slide { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) {
  .backdrop, .card { animation: none; }
}
`;

function defaultSendMessage(msg: any): Promise<any> {
  return new Promise((resolve) => {
    try {
      const result = (globalThis as any).chrome?.runtime?.sendMessage(msg, (res: any) => resolve(res));
      // Some chrome.runtime.sendMessage variants return a promise directly
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
    const chrome = (globalThis as any).chrome;
    if (chrome?.storage?.local?.get) {
      const data = await new Promise<any>((resolve) => {
        chrome.storage.local.get(['theme'], (d: any) => resolve(d));
      });
      const t = data?.theme;
      if (t === 'light' || t === 'dark' || t === 'system') return t;
    }
  } catch {
    /* ignore */
  }
  return 'system';
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
  // Case-insensitive replace
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

export function createSpotlight(opts: SpotlightOptions = {}): SpotlightHandle {
  const maxRows = opts.maxRows ?? MAX_ROWS_DEFAULT;
  const debounceMs = opts.debounceMs ?? DEBOUNCE_DEFAULT;
  const maxRecents = opts.maxRecents ?? MAX_RECENTS_DEFAULT;
  const send = opts.sendMessage ?? defaultSendMessage;

  let host: HTMLElement | null = null;
  let shadow: ShadowRoot | null = null;
  let card: HTMLElement | null = null;
  let input: HTMLInputElement | null = null;
  let results: HTMLElement | null = null;
  let footer: HTMLElement | null = null;
  let mounted = false;
  let open = false;

  // Internal unified result for keyboard navigation
  type UnifiedResult =
    | { kind: 'tab'; data: SpotlightSearchHit }
    | { kind: 'site'; data: SpotlightSiteResult }
    | { kind: 'action'; data: SpotlightAction };

  // State
  let currentResults: SpotlightSearchHit[] = [];
  let unifiedResults: UnifiedResult[] = [];
  let currentQuery = '';
  let currentSuggestion: string | undefined;
  let currentSiteResults: SpotlightSiteResult[] = [];
  let currentActions: SpotlightAction[] = [];
  let currentAutocorrected = false;
  let selectedIndex = 0;
  let perTabMatchIndex = new Map<number, number>(); // tabId -> matchedRecord index
  let debounceHandle: any = null;
  // Sentinel that no real query can match, so the first runQuery() always runs.
  let lastQueryKey = '\u0000never-queried\u0000';
  let inFlight = 0;

  function mount(): void {
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

    // Input row
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
    input.placeholder = 'Search tabs & page content\u2026';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-label', 'Search tabs and page content');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-controls', 'reef-spotlight-results');
    input.addEventListener('input', onInput);
    input.addEventListener('keydown', onKeyDown);
    inputRow.appendChild(input);

    const esc = document.createElement('span');
    esc.className = 'esc';
    esc.textContent = 'esc';
    inputRow.appendChild(esc);

    // Results container
    results = document.createElement('div');
    results.className = 'results';
    results.id = 'reef-spotlight-results';
    results.setAttribute('role', 'listbox');
    results.setAttribute('aria-label', 'Tabs');
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

    // Footer
    footer = document.createElement('div');
    footer.className = 'footer';
    const hints = document.createElement('span');
    hints.className = 'hints';
    hints.innerHTML =
      '<span class="hint"><kbd>\u2191</kbd><kbd>\u2193</kbd>navigate</span>' +
      '<span class="hint"><kbd>\u21B5</kbd>open</span>' +
      '<span class="hint"><kbd>esc</kbd>close</span>' +
      '<span class="hint"><kbd>tab</kbd>cycle matches</span>' +
      '<span class="hint"><kbd>Ctrl</kbd>+<kbd>1\u20139</kbd>jump</span>';
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

    // Capture-phase Esc handler at the host level so it works even if focus drifts
    host.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        hide();
      }
    }, true);

    document.documentElement.appendChild(host);
    mounted = true;
  }

  function setSelected(idx: number, scroll = false): void {
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

  function applySelection(scroll = false): void {
    if (!results) return;
    const rows = results.querySelectorAll<HTMLElement>('.row');
    rows.forEach((r) => r.setAttribute('aria-selected', 'false'));
    const sel = rows[selectedIndex];
    if (sel) {
      sel.setAttribute('aria-selected', 'true');
      if (scroll && typeof (sel as any).scrollIntoView === 'function') {
        try {
          sel.scrollIntoView({ block: 'nearest' });
        } catch {
          // ignore — scrollIntoView is not implemented in jsdom and some test envs
        }
      }
    }
  }

  function renderResults(
    items: SpotlightSearchHit[],
    query: string,
    suggestion?: string,
    autocorrected?: boolean,
    siteResults?: SpotlightSiteResult[],
    actions?: SpotlightAction[],
  ): void {
    if (!results) return;
    currentResults = items;
    unifiedResults = [];
    selectedIndex = 0;
    results.replaceChildren();

    const hasAny = items.length > 0 || (siteResults && siteResults.length > 0) || (actions && actions.length > 0);

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
        empty.textContent = query
          ? 'No matching tabs found.'
          : 'Start typing to search every open tab.';
      }
      // Still show actions even when no results
      if (actions && actions.length > 0) {
        const frag = document.createDocumentFragment();
        renderSectionHeader(frag, 'Actions');
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

    // Autocorrect banner
    if (autocorrected && suggestion) {
      const banner = document.createElement('div');
      banner.className = 'autocorrect-banner';
      banner.innerHTML = `Showing results for <strong>${escapeHtml(suggestion)}</strong> &mdash; <a class="autocorrect-orig" href="#">search for "${escapeHtml(query)}" instead</a>`;
      const origLink = banner.querySelector('.autocorrect-orig');
      if (origLink) {
        origLink.addEventListener('click', (e) => {
          e.preventDefault();
          // Force re-search with original query by resetting the sentinel
          lastQueryKey = '\u0000force-requery\u0000';
          if (input) {
            input.value = query;
            currentQuery = query;
            onInput();
          }
        });
      }
      fragment.appendChild(banner);
    }

    // Tab results
    if (items.length > 0) {
      if (siteResults?.length || autocorrected) {
        renderSectionHeader(fragment, 'Tabs');
      }
      const renderCount = Math.min(items.length, maxRows);
      for (let i = 0; i < renderCount; i++) {
        const item = items[i];
        const idx = unifiedResults.length;
        unifiedResults.push({ kind: 'tab', data: item });
        fragment.appendChild(createTabRow(item, query, idx));
      }
    }

    // Site content results
    if (siteResults && siteResults.length > 0) {
      renderSectionHeader(fragment, 'Site Content');
      for (const sr of siteResults) {
        const idx = unifiedResults.length;
        unifiedResults.push({ kind: 'site', data: sr });
        fragment.appendChild(createSiteRow(sr, query, idx));
      }
    }

    // Action items
    if (actions && actions.length > 0) {
      renderSectionHeader(fragment, 'New Tab');
      for (const action of actions) {
        const idx = unifiedResults.length;
        unifiedResults.push({ kind: 'action', data: action });
        fragment.appendChild(createActionRow(action, idx));
      }
    }

    results.appendChild(fragment);
    applySelection();
  }

  function renderSectionHeader(parent: DocumentFragment | HTMLElement, label: string): void {
    const header = document.createElement('div');
    header.className = 'section-header';
    header.textContent = label;
    parent.appendChild(header);
  }

  function createTabRow(item: SpotlightSearchHit, query: string, idx: number): HTMLElement {
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
    fav.addEventListener('error', () => { fav.src = FALLBACK_FAVICON; }, { once: true });
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
      const text = (match.headingText ? match.headingText + ' \u2014 ' : '') + (match.bodyText || '');
      snippet.textContent = truncate(text, 90);
      row.appendChild(snippet);
    } else {
      const placeholder = document.createElement('div');
      row.appendChild(placeholder);
    }
    return row;
  }

  function createSiteRow(sr: SpotlightSiteResult, query: string, idx: number): HTMLElement {
    const row = document.createElement('div');
    row.className = 'row row-site';
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', idx === selectedIndex ? 'true' : 'false');
    row.dataset.index = String(idx);
    row.title = sr.headingText;

    const icon = document.createElement('div');
    icon.className = 'favicon site-icon';
    icon.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2.5 2 9.5 0 12M8 2c-2 2.5-2 9.5 0 12"/></svg>';
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

  function createActionRow(action: SpotlightAction, idx: number): HTMLElement {
    const row = document.createElement('div');
    row.className = 'row row-action';
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', idx === selectedIndex ? 'true' : 'false');
    row.dataset.index = String(idx);
    row.title = action.title;

    const icon = document.createElement('div');
    icon.className = 'favicon action-icon';
    if (action.type === 'search-web') {
      icon.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="5"/><line x1="11" y1="11" x2="15" y2="15" stroke-linecap="round"/></svg>';
    } else {
      icon.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4"/></svg>';
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
    badge.textContent = 'new tab';
    row.appendChild(badge);

    return row;
  }

  function renderRecents(items: SpotlightRecent[]): void {
    if (!results) return;
    currentResults = items.map((r) => ({
      tabId: -1,
      windowId: -1,
      title: r.title,
      url: r.url,
      favIconUrl: r.favicon,
      score: 0,
      matchedRecords: [],
      _isRecent: true as any,
    }));
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
      fav.addEventListener('error', () => { fav.src = FALLBACK_FAVICON; }, { once: true });
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

  async function runQuery(query: string): Promise<void> {
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
    const reqId = ++inFlight;
    const res = await send({ type: 'SPOTLIGHT_SEARCH', query: key, limit: maxRows });
    if (reqId !== inFlight) return;
    const items: SpotlightSearchHit[] = (res && res.success && Array.isArray(res.items)) ? res.items : [];
    currentSuggestion = (res && res.suggestion) || undefined;
    currentAutocorrected = !!(res && res.autocorrected);
    currentSiteResults = (res && Array.isArray(res.siteResults)) ? res.siteResults : [];
    currentActions = (res && Array.isArray(res.actions)) ? res.actions : [];
    renderResults(items, key, currentSuggestion, currentAutocorrected, currentSiteResults, currentActions);
  }

  async function fetchRecents(): Promise<SpotlightRecent[]> {
    try {
      const res = await send({ type: 'LIBRARY_RECENTS_LIST' });
      const list = (res && res.success && Array.isArray(res.items)) ? res.items : [];
      return (list as any[]).slice(0, maxRecents).map((r) => ({
        url: r.url,
        title: r.title,
        favicon: r.favicon,
        visitedAt: r.visitedAt ?? 0,
      }));
    } catch {
      return [];
    }
  }

  function onInput(): void {
    if (!input) return;
    currentQuery = input.value;
    if (debounceHandle) clearTimeout(debounceHandle);
    debounceHandle = setTimeout(() => {
      debounceHandle = null;
      void runQuery(currentQuery);
    }, debounceMs);
  }

  function onKeyDown(e: KeyboardEvent): void {
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
          const row = results.querySelectorAll<HTMLElement>('.row')[selectedIndex];
          if (row) {
            const match = sel.data.matchedRecords[next];
            const snippetEl = row.querySelector('.match');
            if (snippetEl) {
              const text = (match.headingText ? match.headingText + ' \u2014 ' : '') + (match.bodyText || '');
              snippetEl.textContent = truncate(text, 90);
            }
          }
        }
      }
      return;
    }
    if (e.key === 'Backspace' && e.shiftKey && (mod)) {
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
    // Esc handled in capture listener
  }

  async function openSelected(): Promise<void> {
    const sel = unifiedResults[selectedIndex];
    if (!sel) return;

    if (sel.kind === 'action') {
      try {
        await send({ type: 'SPOTLIGHT_OPEN_NEW_TAB', url: sel.data.url });
      } catch { /* ignore */ }
      hide();
      return;
    }

    if (sel.kind === 'site') {
      try {
        await send({ type: 'SPOTLIGHT_OPEN_NEW_TAB', url: sel.data.url });
      } catch { /* ignore */ }
      hide();
      return;
    }

    // kind === 'tab'
    const tabHit = sel.data;
    if ((tabHit as any)._isRecent) {
      try {
        await send({ type: 'LIBRARY_OPEN_RECENT', url: tabHit.url });
      } catch { /* ignore */ }
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
    } catch { /* ignore */ }
    hide();
  }

  async function applyTheme(theme: 'light' | 'dark' | 'system'): Promise<void> {
    if (!host) return;
    const resolved = resolveTheme(theme);
    host.setAttribute('data-theme', resolved);
  }

  async function show(): Promise<void> {
    mount();
    if (!host || !input) return;
    open = true;
    host.style.display = 'block';
    const t = opts.theme ?? (await getStoredTheme());
    await applyTheme(t);
    lastQueryKey = '\u0000never-queried\u0000';
    perTabMatchIndex = new Map();
    currentSuggestion = undefined;
    currentSiteResults = [];
    currentActions = [];
    currentAutocorrected = false;
    unifiedResults = [];
    input.value = '';
    currentQuery = '';
    await runQuery('');
    // Focus the input after the host is visible
    requestAnimationFrame(() => {
      try { input?.focus(); } catch { /* ignore */ }
    });
  }

  function hide(): void {
    if (!host) return;
    open = false;
    host.style.display = 'none';
    if (debounceHandle) {
      clearTimeout(debounceHandle);
      debounceHandle = null;
    }
  }

  async function toggle(): Promise<void> {
    if (open) hide();
    else await show();
  }

  function isOpen(): boolean {
    return open;
  }

  function destroy(): void {
    if (debounceHandle) clearTimeout(debounceHandle);
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
