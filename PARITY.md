# Reef — Codebase Handoff Doc

**Audience:** an engineer (or agent) picking up this codebase to add features.
**Goal of this doc:** get you from zero to "I know exactly where to make my change" without having to read all ~3,200 lines first.

---

## 1. What Reef is, in one paragraph

Reef is a drop-in, zero-backend search widget for static/server-rendered sites. One `<script>` tag crawls the site (via sitemap or same-origin link-following), extracts not just headings/body text but *interactive surface area* — buttons, form fields, links, files, media, JSON-LD — into a typed index, and serves a fuzzy, keyboard-first command-palette-style search UI (Shadow DOM, `Cmd/Ctrl+K`). Selecting a result doesn't just navigate: for actions and fields it can **click the button** or **focus the input** for the user (or for an agent driving the page), including deferring that click across a page navigation. That extraction + action-execution layer is the differentiator — it's what makes Reef interesting as an "AI agents acting on websites" primitive, not just a search box.

---

## 2. File map

| File | Role |
|---|---|
| `types.ts` | All shared interfaces/types. Start here to understand the data model. No logic. |
| `extraction.ts` | Pure(-ish) DOM/HTML → `IndexRecord[]` extractors. One function per content type (sections, actions, fields, links, files, media, structured data). Also selector generation (`generateSelector`) and HTML stripping. |
| `search-index.ts` | The `SearchIndex` data structure (inverted indices as `Map`s) + everything about querying it: tokenization, fuzzy (Levenshtein) matching, BM25 vs. classic scoring, extended query syntax (`'exact'`, `!exclude`, `^prefix`, `suffix$`, `\|` for OR), serialize/deserialize, suggest/autocomplete, facets, query analytics. |
| `cache.ts` | IndexedDB persistence for the built index (TTL-based invalidation), so repeat visits skip re-crawling. |
| `reef.ts` | The `ReefSearch` class — the orchestrator. Config parsing from `data-*` attributes, crawling/booting, Shadow-DOM UI rendering, keyboard nav, and — importantly — **action execution** (clicking buttons, focusing fields, cross-page deferred actions via `sessionStorage`). This is the biggest file (~1500 lines) and the one most feature work will touch. |
| `worker.ts` | A Web Worker wrapper for offloading page extraction. `indexPages` action accepts `[url, html]` pairs for processing without main-thread jank. Used when `useWorkerIndexing` config is enabled. |
| `browser.ts` | Entry point: `new ReefSearch()` on `window.Reef`. |
| `search.ts` | Barrel file re-exporting the public surface of `search-index.ts` + `extraction.ts`. |

**Import direction (respect this when adding code):**
`types.ts` ← `extraction.ts`, `search-index.ts` ← `search.ts` ← `reef.ts`, `worker.ts` ← `browser.ts`. `cache.ts` imports from `search-index.ts` and `types.ts` directly (not through the barrel). `reef.ts` is the only file that touches the DOM's *global* state (document, sessionStorage, window) beyond what extraction needs — extraction functions take `html`/`Element` and are otherwise side-effect-light.

---

## 3. The data model (read `types.ts` first)

Everything is an `IndexRecord`:

```ts
interface IndexRecord extends SectionDocument {   // id, url, headingText, headingId, breadcrumb, bodyText
  type: 'section' | 'action' | 'field' | 'link' | 'file' | 'media' | 'structured';
  selector?: string;       // CSS selector back to the live DOM element (for action/field/section)
  destructive?: boolean;   // actions only — gates auto-execution
  label?: string;          // actions/fields
  value?: string;          // fields — current input value at index time
  transcript?: string;     // media — caption/transcript text if found
  structuredData?: any;    // JSON-LD payload
}
```

Every extractor in `extraction.ts` produces `IndexRecord[]` of one `type`. `reef.ts#extractAllContent` fans out to all of them per page and concatenates. The `selector` field (built by `generateSelector`, a tag+id+class+nth-child path) is what lets Reef find the *same* element again later, possibly after a full page reload — this is the crux of the "act on things" capability.

`SearchIndex` (in `search-index.ts`) is **not** just an array — it's several `Map`s (`headingIndex` = prefix trie-ish via string-key map, `headingIds` = exact heading lookup, `bodyIndex` = word → records) built for O(1)-ish lookups, plus `allSections` (flat array, source of truth for serialize/mutate), plus a small query-result LRU cache (`queryCache`) and `docFrequency`/`totalDocs` for BM25.

---

## 4. Life of a page load (control flow)

1. `browser.ts` constructs `new ReefSearch()`.
2. Constructor: `readConfig()` parses `data-*` attributes off the `<script>` tag into `ReefConfig`, wires the hotkey listener, and calls `handleDeferredScroll()` (resumes a cross-page scroll-to that was queued before a navigation), then kicks off `boot()` (fire-and-forget async).
3. `boot()` tries, **in order**, first-match-wins:
    - `prebuiltIndexUrl` fetch + `deserializeIndex` (skip crawling entirely)
    - IndexedDB cache (`cache.ts#loadIndex`, respecting `ttl`)
    - sitemap.xml discovery + parallel fetch (`fetchPagesParallel` or worker-based via `useWorkerIndexing`), then **save to cache**
    - same-origin BFS crawl (`crawlSameOrigin`) as the last-resort fallback, no caching
4. User hits hotkey (default `Ctrl/Cmd+K`) → `open()` → lazily `renderUI()` builds the Shadow DOM modal once → `renderResults()` runs `searchSections()` against the in-memory index on every keystroke (debounced).
5. User selects a result → `executeAction(result)` switches on `result.type`:
   - `action` → `executeActionResult` → same-page: synthesize a `MouseEvent('click')` on the resolved selector. Cross-page: stash `{selector, type, label, destructive}` in `sessionStorage['reef-deferred-action']` and navigate; the *next* page's constructor calls `handleDeferredActions()` to replay it. Destructive actions are **never** auto-clicked cross-page unless `actionsMode === 'execute'` — they get `highlightAndNavigate` (scroll + highlight only) instead.
   - `field` → focus (+select text) via `focusField`.
   - `link`/`file`/`media`/`structured` → straight `window.location.href` navigation.
   - `section` → `navigateToSection`: same-page scroll+highlight if the selector/heading is present in the current DOM, else defer via `sessionStorage['reef-deferred-scroll']` and navigate.

Both deferred mechanisms use a `MutationObserver` with a 5s timeout as a fallback for content that renders async after navigation.

---

## 5. Known gaps / rough edges (useful "first PR" candidates)

Called out explicitly because a new agent will otherwise burn time rediscovering these:

- **`worker.ts` is wired up.** `ReefConfig.useWorkerIndexing` now triggers worker-based indexing when set to `true`. The main thread fetches pages and sends HTML to the worker for extraction, avoiding main-thread jank during large crawls.
- **`synonymExpanded` is computed but never read.** `extractAllContent` computes `synonymExpanded` on records from `config.synonyms` and stores it as a dynamic property (not declared in `types.ts`), but nothing in `search-index.ts#searchSections` ever uses this field — synonyms currently do nothing at query time.
- **`search-index.ts` bug fixes applied:**
  - Fixed `addToIndex`: label indexing now correctly uses `labelLower.length >= 2` (removed erroneous `< 3` upper bound).
  - Fixed `searchSections`: body-word lookup now uses clean `index.bodyIndex.get(word)` instead of confusing fallback.
- **`headingCache` in `extraction.ts` is a module-level `Map` keyed by `url` with no eviction/invalidation** — fine for a single crawl, but if you add a "watch for DOM changes and re-extract" or live-reindex feature, this cache will silently serve stale sections. `reindex()`/`rebuildIndex()` on `ReefSearch` don't clear it.
- **`extractLinks` misclassifies internal links as `type: 'section'`** (see the ternary at the bottom of `extractLinks`) rather than a distinct internal-link type — currently harmless because `executeAction`'s `section` case falls back to `navigateToSection`, which works for plain URLs too, but worth knowing if you add link-specific behavior (e.g. a `destructive` flag for links, or distinguishing "jump to heading" vs "go to another page" in the UI).
- **Actions/fields matched by CSS selector are inherently fragile** if a site's markup changes between index time and click time — `showToast` surfaces a "could not find that element" failure, but there's no re-extraction/re-matching fallback (e.g. falling back to label text matching the way `navigateToSection` falls back to heading text). Worth considering for robustness work.
- **A test suite exists in `/tests/`.** Tests cover core extraction, search functionality, headless mode, and feature parity. See `tests/parity.test.mjs`, `tests/search.test.mjs`, and `tests/headless.test.mjs`. When adding features, add coverage for `extraction.ts` (easiest to unit test — mostly pure functions over HTML strings) and `search-index.ts` (pure functions over `SearchIndex`). Run with `npm test`.

---

## 6. Where the "AI agent acting on a page" story lives

If your feature is about the agentic/action-execution angle specifically (as opposed to search quality), the surface area is:
- `IndexRecord.type === 'action' | 'field'`, `.selector`, `.destructive`, `.label` (types.ts)
- `extractActions` / `extractFields` / `isDestructiveAction` / `extractActionName` (extraction.ts) — this is where you'd add new actionable-element detection (e.g. `<select>` dropdowns as a distinct interactable type, drag targets, custom elements with `[data-reef-action]` — note that hook already exists as a selector).
- `executeAction`, `executeActionResult`, `executeActionOnCurrentPage`, `setupDeferredAction`, `handleDeferredActions`, `focusField`, `highlightAndNavigate` (reef.ts) — this is where you'd add new execution semantics (e.g. filling a field's value, not just focusing it; multi-step action sequences; a programmatic API like `reef.performAction(id)` that doesn't require the UI to be open at all).
- Public API on `ReefSearch` now includes `act(recordId)` and `fillField(recordId, value)` for programmatic action execution without the modal. The `act()` method returns `{ success: boolean, reason?: string }` and respects `actionsMode` gating for destructive actions.

---

## 7. Conventions to follow when extending

- Extraction functions: pure-ish, take `(html: string, url: string, ...)`, parse with `new DOMParser()`, return `IndexRecord[]`, always guard on empty/falsy label text before pushing a record (every existing extractor does `if (!label) continue;`).
- New `IndexRecord.type` values must be added to: the `type` union in `types.ts`, `getResultTypeIcon`/`getResultTypeLabel` in `reef.ts`, `facets()`'s result object in `search-index.ts`, and the `executeAction` switch in `reef.ts`.
- New `ReefConfig` fields: parsed from `data-*` kebab-case attributes in `readConfig()` (dataset auto-camelCases them), applied in `applyConfigToUI()` if visual, and should get a corresponding `public setX()` method on `ReefSearch` mirroring the existing `setTheme`/`setMode`/etc. pattern if it's runtime-mutable.
- Any new persisted/serialized index field must be added to both `serializeIndex` and `deserializeIndex` in `search-index.ts` — they're hand-written, not automatic.
- Cross-page state (deferred scroll/action) goes through `sessionStorage` with a `reef-` prefix and is always read-once-then-removed on the next page.

---

## 8. Feature ideas to make Reef stand out

These are organized by theme and roughly prioritized within each (earliest = highest leverage / most on-brand for "search that can also act"). Each entry says *why it's differentiating* and *where it hooks into the existing code*, so whoever picks one up can go straight to implementation instead of re-deriving the design.

### 8.1 Agent-facing / automation (the core differentiator — invest here first)

1. **Programmatic action execution API: `reef.act(recordId)` — DONE.**
   The `act()` method is now public, returns `{ success: boolean, reason?: string }`, and works in headless mode.

2. **Action manifest export for LLM tool-use / MCP.**
   Add `reef.getActionManifest()` that walks the current index's `action`/`field` records and emits an LLM-function-calling-style schema.

3. **Field value filling, not just focus — DONE.**
   `reef.fillField(recordId, value)` now uses native setter + event dispatch for React/Vue compatibility.

4. **Action macros / recipes.** Let a site define a named multi-step sequence (fill field X, click button Y, wait for Z) either via grouped `data-reef-action` attributes or a small JSON config, and expose it as one callable unit (`reef.runRecipe('checkout')`). Turns Reef into a light RPA layer for whole workflows, not single clicks — the natural next step after (1)–(3).

5. **Natural-language intent matching.** Right now a query has to lexically match a label/heading. Add an optional layer where a query like "cancel my subscription" can match an action labeled "Unsubscribe" via a small synonym/intent table (ties directly into fixing the synonym-expansion stub in §5) or an optional pluggable embedding-similarity scorer (see 8.2.3). Big usability win for both human users and agents issuing free-text instructions instead of exact button labels.

### 8.2 Search quality

1. **Fix + activate synonym expansion at query time.** Currently computed but unused (§5). Cheapest high-value fix: when scoring, expand the query's own tokens through `config.synonyms` and OR them into the term/body match, not just tag records with `synonymExpanded`.

2. **Click-through learning-to-rank.** `trackQuery`/`getPopularQueries` already log query strings; extend to log `(query, selectedRecordId)` pairs and maintain a small per-record boost multiplier applied in `searchSections`'s scoring step. Over time, popular selections for a given query float to the top — a lightweight, no-ML "learning" layer that's cheap to explain and ship.

3. **Pluggable scoring backends beyond BM25/classic.** `SearchOptions.scoringAlgorithm` already has a two-way switch; add a third `'vector'` option where `reef.ts` can optionally call an embedding function (site-supplied, e.g. via `config.embedFn`, or a small on-device model) to catch semantic matches classic/BM25 miss entirely (synonyms, paraphrases, typos beyond edit-distance-2). Keep it optional/pluggable so the zero-dependency, no-backend promise still holds by default.

4. **Faceted filter UI.** `facets()` already computes counts per `IndexRecord.type` and `SearchOptions.filter`/`typeWeights` already exist — there's just no UI exposing them. Add filter chips ("Sections · Actions · Files · Media") to the modal so users/agents can narrow by type without writing extended-query syntax.

### 8.3 Scale & performance

1. **Wire up the Web Worker — DONE.**
   `useWorkerIndexing` config now offloads page extraction to a Web Worker, avoiding main-thread jank during large crawls.

2. **Build-time prebuilt-index CLI.** `prebuiltIndexUrl` + `serializeIndex`/`deserializeIndex` already support consuming a prebuilt index — there's no producer. Ship a small Node CLI (e.g. `npx reef-build ./dist --out reef-index.json`) that runs the same extraction pipeline against a static build's output at deploy time. This eliminates client-side crawling entirely for static sites — a meaningful perf/reliability win (no more "the visitor's browser has to crawl your whole site on first load") and a natural companion to the existing runtime crawler rather than a replacement for it.

3. **SPA / client-rendered site support.** Today, crawling does `fetch(url)` and parses the *raw server HTML* — this silently under-indexes any content a JS framework renders client-side after hydration. Add a mode that indexes the live `document` directly on route change (listening to `pushState`/`popstate`, or a manual `reef.indexRoute()` call) instead of re-fetching HTML, so SPA and hybrid sites get accurate indexes. This is probably the most common real-world failure mode for a "drop in one script tag" pitch, so worth prioritizing alongside the CLI.

4. **Incremental re-indexing via `MutationObserver`.** For long-lived SPA sessions, watch the DOM for structural changes and re-run extraction on changed subtrees only (bounded by `config.scope`), invalidating just the affected `IndexRecord`s via `removeFromIndex`/`updateRecord` (already implemented in `search-index.ts`, just unused for this purpose) instead of a full `reindex()`.

### 8.4 Safety & trust (important once §8.1's public `act()` ships)

1. **Capability-gated action execution.** Exposing `reef.act()`/`fillField()`/`runRecipe()` publicly means *any* script on the page (or an embedded ad, or an XSS payload) could invoke destructive actions. Add an opt-in permission model — e.g. `config.allowedActors` (origins or signed tokens) that must be presented to call the programmatic API — while the visual-modal path (a real user pressing Enter) stays unrestricted. This turns "look how easy it is for agents to act on this site" from a liability into a selling point: "and here's how site owners stay in control of what agents are allowed to do."

2. **Dry-run / describe-before-execute.** `reef.act(id, { dryRun: true })` returns a human-readable description of what the action would do (label, destructive flag, target URL/selector) without performing it — lets an agent (or a confirmation UI) show the user what's about to happen, especially for `destructive` actions where `actionsMode !== 'execute'` already partially gates this today.

3. **Action audit log.** Every programmatic `act()`/`fillField()` call gets appended to an in-memory (or callback-emitted, mirroring the existing `onReady` pattern) log with timestamp, record id, and result — so a site owner can see what an agent actually did, which matters a lot once Reef is marketed as an automation surface rather than "just search."

### 8.5 Integration & DX

1. **Framework adapters.** Thin wrappers — a React hook (`useReef()`), a Vue plugin, a Web Component (`<reef-search>`) — around the existing vanilla `ReefSearch` class, so framework-heavy teams don't have to hand-roll the `document.currentScript` dataset wiring themselves.
2. **Standalone TypeScript types package.** `types.ts` is already clean and dependency-free; publishing it separately means consumers (and agents writing integrations) get full IntelliSense on `IndexRecord`/`ReefConfig`/`SearchOptions` without pulling in the whole bundle.
3. **Insights panel.** Surface the already-collected-but-unexposed `getPopularQueries()`/`facets()` data as a small built-in admin view (or a documented recipe for building one), giving site owners a "what are people searching for that they can't find" report for free.

---

### Suggested sequencing

If picking one thread to pull first: **8.1.2 → 8.4.1/8.4.2** (ship action manifest/MCP export, then safety gating) now that 8.1.1 and 8.3.1 are complete. **8.3.2 (prebuilt-index CLI)** and **8.3.3 (SPA support)** are the two most likely to be blocking real adoption today, independent of the agent story, and can be worked on in parallel by a second contributor.