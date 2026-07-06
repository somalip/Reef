# Spotlight Search — Architecture Document

**A zero-build, single-`<script>`-tag, Cmd+K search overlay for static sites.**

This document specifies the system for an implementing engineer/agent. Decisions below are defaults, not suggestions — deviate only where explicitly marked as open.

---

## 1. Problem & Goals

Static sites (docs, blogs, portfolios, Jamstack sites) have no real cross-site search. Options today are: pay for Algolia DocSearch, stand up a backend, or rely on browser-native page-only find. None of these fit a site owner who just wants to paste a script tag.

**Goals:**
- Single `<script>` tag, zero build step, zero server, zero account signup
- Feels instant once loaded (in-memory search, <50ms per query)
- Works on any static HTML — no framework assumption
- Small footprint: initial page-load cost should be near-zero
- Keyboard-first (`Cmd+K` / `Ctrl+K`), accessible, themeable

**Non-goals (v1):**
- No semantic/vector search — lexical + fuzzy matching only
- No build-time index generation (see §12 for the v2 escape hatch)
- No indexing of JS-rendered SPA content (fetched HTML only, not executed)
- No cross-domain / multi-site search

---

## 2. Components

1. **Loader** (`spotlight.min.js`) — the script tag entry point. Reads config, wires the hotkey listener, injects UI, lazy-loads the rest.
2. **Crawler/Indexer** — discovers pages and extracts indexable text.
3. **Index Store** — IndexedDB cache of the built index, versioned and TTL'd.
4. **Search Engine** — in-memory full-text index (FlexSearch — see §7).
5. **UI Layer** — Shadow DOM modal: input, results, keyboard nav.

---

## 3. Data Flow

1. Script executes on page load (use `defer`). Loader reads config from data attributes / `window.SpotlightConfig`.
2. Loader registers the hotkey listener immediately (cheap) but defers everything else to `requestIdleCallback` (fallback: `setTimeout`).
3. On first idle slot, check IndexedDB for a cached index for this origin.
   - **Cache hit + fresh** → deserialize into memory. Ready.
   - **Cache miss / stale** → crawl (§5) → build index → persist to IndexedDB.
4. User presses hotkey → modal opens → keystrokes query the in-memory index (debounced ~80ms) → ranked results render with heading breadcrumb + highlighted snippet.
5. Selecting a result navigates to `url#heading-id` (or smooth-scrolls if already on that page).

---

## 4. Discovery & Crawling

- **Primary:** fetch `/sitemap.xml`, parse `<loc>` (and `<lastmod>` where present). Follow one level of `<sitemapindex>` nesting if the site splits sitemaps.
- **Fallback (no sitemap):** breadth-first crawl from the current page via same-origin `<a href>` links. Cap at a configurable page count (default 500). Skip links with `rel="nofollow"` or a `data-spotlight-ignore` attribute.
- Fetch pages as **text only** via `fetch()`, parse with `DOMParser` — this never executes scripts, so it's safe and side-effect-free.
- Concurrency-limited (default 5 parallel fetches) to be polite to the visitor's connection.
- No CORS concerns: the crawler only ever fetches same-origin pages the script itself is already running on.

---

## 5. Content Extraction

Per fetched page:
- Root selection priority: `data-spotlight-scope` override → `<main>` → `[role=main]` → `<article>` → `<body>`.
- Strip `nav, footer, header, script, style, noscript` and anything matching `data-exclude` selectors, unless scope already excludes them.
- Walk `h1`–`h6`: each heading plus the text until the next heading becomes one indexable **section document**: `{ url, headingText, headingId, breadcrumb, bodyText }`.
- Also index `<title>`, meta description, and image `alt` text as lower-weight fields.
- Field weighting in the index: title > heading > body > alt text.

---

## 6. Storage & Cache Invalidation

- IndexedDB database `spotlight-search`, store `index-cache`, keyed by origin.
- Stored record: `{ version, builtAt, pages: [...], serializedIndex }`.
- `version` = hash of sitemap content / `lastmod` dates, so unchanged sites skip re-crawling entirely.
- TTL fallback (default 7 days) forces a re-crawl even if `lastmod` tracking is unreliable or absent.
- If a page's `lastmod` changed since last index, re-fetch and re-index only that page — not the whole site.
- Skip persisting (memory-only for the session) if the serialized index exceeds a size cap (default 5MB), to stay a good citizen of the visitor's storage quota.

---

## 7. Search Engine

- **FlexSearch** (MIT, dependency-free, small footprint) over Lunr — supports fuzzy matching, field weighting, relevance scoring, and async/worker-friendly indexing.
- Build and query the index inside a **Web Worker** when available (inlined as a Blob worker so it ships in the single bundle, no second network request). Falls back to main thread if Workers are unsupported.
- Lazy-load the indexing engine itself only when a search is actually going to happen (first hotkey press or idle prefetch) — keeps initial script weight minimal.

---

## 8. UI/UX

- **Hotkey:** `Cmd+K` / `Ctrl+K` (configurable). Ignore when focus is already in an input/textarea/contenteditable other than Spotlight's own. `preventDefault` carefully — some browsers bind Ctrl+K to the address bar (see §13 open questions).
- **Modal:** rendered in a Shadow DOM root for full style isolation. Exposes CSS custom properties (`--spotlight-accent`, `--spotlight-bg`, `--spotlight-radius`, etc.) for theming without piercing the shadow boundary.
- **Keyboard:** `↑/↓` navigate results, `Enter` selects, `Esc` closes.
- **Results:** breadcrumb (e.g. `Docs > Getting Started > Installation`), snippet with `<mark>`-highlighted match, ordered by relevance score.
- **States:** first-run "Indexing site…" progress indicator, empty state, network/crawl-failure state.
- **Accessibility:** `role="dialog"` + `aria-modal="true"`, focus trap, `aria-live` region announcing result count, full keyboard operability, default contrast meets WCAG AA.

---

## 9. Configuration API

Data attributes on the script tag:

| Attribute | Default | Purpose |
|---|---|---|
| `data-scope` | auto-detect | CSS selector for indexable root |
| `data-exclude` | — | CSS selectors to strip from indexing |
| `data-sitemap` | `/sitemap.xml` | Override sitemap path |
| `data-max-pages` | `500` | Crawl cap |
| `data-hotkey` | `ctrl+k` / `cmd+k` | Customize shortcut |
| `data-ttl` | `604800` (7 days) | Cache TTL in seconds |
| `data-trigger-selector` | — | Bind to an existing button instead of auto-injecting one |

Runtime JS API (once loaded): `window.Spotlight.open()`, `window.Spotlight.reindex()`, `window.Spotlight.on('select', callback)` for sites wanting programmatic control or their own analytics hook (no telemetry is sent anywhere by default).

---

## 10. Distribution & Build

- Single minified IIFE/UMD bundle published to npm and served via jsDelivr/unpkg:
  ```html
  <script src="https://cdn.jsdelivr.net/npm/spotlight-search@1/dist/spotlight.min.js"
          data-scope="main"></script>
  ```
- Source in TypeScript, bundled with esbuild or Rollup into one file. Worker code inlined as a `Blob` to avoid a second file request.
- Bundle budget: ≤20kb gzipped for loader + UI; FlexSearch lazy-loaded separately and only when needed.
- Semver published; `@1` tracks minor/patch, exact version pin available for stability.

---

## 11. Performance & Security Constraints

- All indexing work deferred off the critical rendering path (`requestIdleCallback`).
- Fetched HTML is parsed for text extraction only — never inserted via `innerHTML`, only `textContent` reads — to eliminate any XSS vector from crawled content.
- No user query data leaves the browser by default.
- Concurrency-limited fetches; incremental re-indexing keyed on `lastmod`.

---

## 12. Known Limitations & v2 Escape Hatch

- **SPAs / client-rendered content:** fetched HTML won't contain JS-injected content. Document as a known limitation; recommend prerendering.
- **Very large sites (10,000+ pages):** v1 caps crawl size. v2 should support an opt-in **pre-generated index file** (`/spotlight-index.json`) produced by a companion build-time CLI/plugin — the script checks for this file before falling back to a live crawl.
- **Multi-language sites:** index each page's `lang` attribute; support an optional `data-lang-filter`.

---

## 13. Open Questions (flag back, don't block on)

- Ship the visible trigger button on by default, or opt-in only?
- Confirm hotkey handling doesn't fight browser/OS shortcuts across Windows/Linux/Mac.
- Whether v1 should stub the pre-generated-index code path now (even if unused) to make v2 a smaller diff.

---

## 14. Suggested Build Phases

1. Repo scaffold: TS + esbuild, IIFE output, fixture static site with a `sitemap.xml` for testing.
2. Core crawler + text extraction + FlexSearch index build (console-only, no UI yet).
3. IndexedDB cache layer with version/TTL invalidation.
4. UI: modal, hotkey, result rendering, Shadow DOM styling.
5. Config API (data attributes + JS API) and CSS-variable theming.
6. Performance pass: Web Worker offload, idle scheduling, bundle size audit.
7. Edge cases: sitemap index nesting, SPA detection warning, pre-generated index stub.
8. Docs, npm/jsDelivr publish, example snippet, README.