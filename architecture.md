# Reef Search — Architecture Document

A zero-build, single-`<script>`-tag search overlay for static sites with fast in-browser search, persistent caching, and optional safe action execution on the current site. It is designed to be lightweight, accessible, themeable, and easy to install on GitHub Pages, docs sites, blogs, portfolios, and other static properties.

## Table of Contents
- [1. Problem and Goals](#1-problem-and-goals)
- [2. System Overview](#2-system-overview)
- [3. Core Components](#3-core-components)
- [4. End-to-End Flow](#4-end-to-end-flow)
- [5. Discovery and Crawling](#5-discovery-and-crawling)
- [6. Content Extraction](#6-content-extraction)
- [7. Search Engine](#7-search-engine)
- [8. Storage and Cache Invalidation](#8-storage-and-cache-invalidation)
- [9. UI and Interaction](#9-ui-and-interaction)
- [10. Universal Indexing Model](#10-universal-indexing-model)
- [11. Safety and Execution Policy](#11-safety-and-execution-policy)
- [12. Configuration Reference](#12-configuration-reference)
- [13. Performance and Distribution](#13-performance-and-distribution)
- [14. Limitations and Open Questions](#14-limitations-and-open-questions)
- [15. Build Phases](#15-build-phases)
- [16. Fixture and Testing Guidance](#16-fixture-and-testing-guidance)

## 1. Problem and Goals

Static sites often need better search than browser find, but they should not require a back end, account, or build step. The primary goal is to let a site owner paste in one script tag and immediately provide fast, keyboard-first search with a minimal install surface.

### Goals
- Single script-tag install with zero build step and zero server requirements.
- Fast in-memory search once the index is loaded.
- Works on plain static HTML without framework assumptions.
- Small initial footprint and lazy loading of heavier logic.
- Accessible keyboard-first modal with theming support.

### Non-goals
- No semantic or vector search.
- No cross-domain or multi-site crawling.
- No execution of arbitrary JavaScript from crawled pages.
- No automatic form submission or field filling.

## 2. System Overview

The system is organized as a loader, crawler/indexer, index store, search engine, and UI layer. The loader is the only script the site owner includes directly; it coordinates initialization, hotkey handling, and lazy loading of the rest of the system.

The design favors same-origin crawling, safe text extraction, and client-side search so that no query data leaves the browser by default. For sites that need more than page text, the universal indexing model extends the base system to support actions, fields, media, files, and structured data while preserving the same install model.

## 3. Core Components

### Loader
The loader is the entry point published as a single minified bundle. It reads configuration from script attributes and optional runtime settings, registers the hotkey listener, injects the UI trigger or overlay, and starts background initialization during idle time.

### Crawler / Indexer
The crawler discovers pages from sitemap.xml or, if needed, a same-origin fallback crawl. The indexer parses fetched HTML as text only and extracts sections, metadata, and any enabled universal record types.

### Index Store
The index store uses IndexedDB for persistent caching. It stores the generated index together with version and timestamp metadata so unchanged sites can skip rebuilds.

### Search Engine
The search engine runs fully in the browser and keeps the active index in memory. It supports field weighting, fuzzy matching, and ranked result rendering.

### UI Layer
The UI layer renders the search modal in a Shadow DOM root so styles remain isolated. It handles keyboard navigation, result highlighting, focus management, and screen-reader announcements.

## 4. End-to-End Flow

1. The page loads the script with `defer`.
2. The loader reads configuration and registers the hotkey immediately.
3. Initialization continues in idle time so the page remains responsive.
4. The cache is checked in IndexedDB for a fresh index.
5. If the cache is valid, the index is loaded into memory.
6. If the cache is stale or missing, the crawler fetches pages and the indexer builds a new index.
7. The user opens the modal with Cmd+K or Ctrl+K and searches against the in-memory index.
8. Selecting a result navigates to the target or performs a safe same-page action.

## 5. Discovery and Crawling

### Primary discovery
The preferred source of truth is sitemap.xml. The crawler parses `<loc>` entries and uses `<lastmod>` when present to support incremental refreshes. If the site uses a sitemap index, the crawler follows one level of nesting.

### Fallback discovery
If no sitemap is available, the crawler can perform a same-origin breadth-first crawl starting from the current page. The crawl is capped by configuration so the system remains polite and bounded.

### Crawl rules
- Same-origin only.
- Fetch pages as text, never execute scripts.
- Honor `rel="nofollow"` and explicit ignore selectors.
- Limit parallel requests to avoid unnecessary load.
- Parse HTML with `DOMParser` rather than injecting fetched markup into the page.

## 6. Content Extraction

The base extraction model treats each page as a series of section documents. The crawler selects the main content root using a priority order, removes navigation and boilerplate, and walks headings to produce searchable sections.

### Base extraction fields
- Title.
- Meta description.
- Heading text.
- Breadcrumb context.
- Section body text.
- Image alt text as a lower-weight field.

### Section model
Each heading becomes a searchable section boundary. All text until the next heading belongs to that section, which gives the UI meaningful result snippets and direct anchors for navigation.

### Extraction boundaries
- Do not execute scripts.
- Do not depend on hydration.
- Do not insert crawled HTML into the live DOM.
- Treat fetched content as untrusted text.

## 7. Search Engine

The search engine is designed for lexical and fuzzy matching, not semantic retrieval. It ranks matches using field weights so titles and headings matter more than body text, while still allowing snippets from the full section body.

### Search behavior
- Debounced queries for responsiveness.
- Relevance ranking across weighted fields.
- Highlighted match snippets in the result list.
- In-memory querying for fast interactions.

### Implementation notes
The engine can run inside a Web Worker when available, which keeps indexing work off the main thread. When workers are not available, the system falls back to main-thread processing without changing the public behavior.

## 8. Storage and Cache Invalidation

IndexedDB stores the serialized index for each origin. The cache record includes a version hash, build time, page metadata, and the serialized index payload.

### Invalidation strategy
- Use sitemap content and `lastmod` data to compute a version hash.
- Rebuild if the version changes.
- Rebuild if the TTL expires.
- Reindex only changed pages when the site provides reliable timestamps.

### Storage limits
If the serialized index exceeds the configured size threshold, the system can skip persistence and keep the index in memory for the current session. This avoids filling browser storage quotas on large sites.

## 9. UI and Interaction

The search interface is a keyboard-first modal rendered in a Shadow DOM root. It should open instantly, remain responsive during typing, and close cleanly with Escape.

### UI requirements
- Cmd+K / Ctrl+K hotkey.
- Focus trap within the modal.
- Keyboard navigation with arrows, Enter, and Escape.
- Accessible roles and aria-live announcements.
- Theme variables for accent, background, and radius.

### Result presentation
Results should show type, title, breadcrumb context, and a short snippet. Grouping by result type improves scannability when the index contains sections, actions, fields, files, media, and structured answers.

## 10. Universal Indexing Model

The universal indexing model extends the base section-only system so the search overlay can surface more than pages and headings. It introduces typed records that represent actionable or structured content on the page.

### Record types
- Section: heading-based page content.
- Action: buttons, toggles, and other clickable controls.
- Field: form inputs, textareas, and selects, indexed for focus only.
- File: downloadable links such as PDFs, docs, spreadsheets, archives, and CSVs.
- Media: images, audio, video, captions, transcripts, and related metadata.
- Answer: structured data such as FAQ entries and other rich metadata records.

### Extraction scope
- Buttons and other labeled click targets.
- Form controls with accessible labels.
- Hidden or collapsed content such as accordions and details panels.
- Media captions and transcripts.
- Structured data from JSON-LD and supported metadata tags.
- File links and external links as distinct result types.

### Result behavior
- Sections navigate and scroll.
- Actions may click or toggle on the current page when safe.
- Fields focus the matching control.
- Files navigate to the resource.
- Media and answers surface as searchable records with inline context.

## 11. Safety and Execution Policy

Safety is a core design constraint, especially when indexed results can trigger behavior on the current page.

### Safety rules
1. Never auto-execute anything that mutates state, spends money, or is irreversible.
2. Same-page execution is limited to safe actions the user can see immediately.
3. Cross-page action results should navigate first and resolve only after the target page loads.
4. Forms are never auto-filled or submitted.
5. Unresolved targets should fail gracefully and fall back to navigation.
6. Site-owner configuration from the install-time script tag is the only trusted source for execution policy.

### Destructive handling
Labels matching destructive verbs are treated conservatively and excluded from direct execution. Site owners can disable auto-click behavior entirely by switching the action mode to navigation-only.

## 12. Configuration Reference

| Attribute | Default | Purpose |
|---|---|---|
| `data-scope` | auto | CSS selector for the root content area |
| `data-sitemap` | `/sitemap.xml` | Sitemap path override |
| `data-max-pages` | `500` | Crawl limit |
| `data-ttl` | `604800` | Cache TTL in seconds |
| `data-hotkey` | `ctrlk,cmdk` | Keyboard shortcut |
| `data-index-actions` | `true` | Enable action indexing |
| `data-index-media` | `true` | Enable media indexing |
| `data-index-structured-data` | `true` | Enable structured data indexing |
| `data-index-hidden` | `true` | Include collapsed content |
| `data-file-extensions` | `pdf,doc,docx,xls,xlsx,ppt,pptx,zip,csv` | File-link classification |
| `data-exclude-action` | — | CSS selectors excluded from executable results |
| `data-actions-mode` | `execute` | `execute` or `navigate-only` |
| `data-reef-action` | element-level only | Explicit site-owner label or override |

### Runtime API
- `window.Reef.open()` opens the modal.
- `window.Reef.reindex()` rebuilds the index.
- `window.Reef.onselect(fn)` registers a selection hook.

## 13. Performance and Distribution

The loader should stay small and defer heavy work until the user actually searches. Bundle the public entry point into a single minified file and lazy-load the larger indexing/search logic only when needed.

### Performance targets
- Keep the critical loader lightweight.
- Run crawling and indexing during idle time.
- Use a worker when available for indexing and query processing.
- Limit crawl concurrency and page count.

### Distribution
- Source in TypeScript.
- Bundle with esbuild or Rollup.
- Publish to npm and CDN mirrors such as jsDelivr or unpkg.
- Keep the build reproducible and semver versioned.

## 14. Limitations and Open Questions

### Known limitations
- Client-rendered SPA content is not indexed by the remote crawler because fetched HTML does not execute page scripts.
- Large sites may require an opt-in pre-generated index file.
- Image OCR is out of scope.
- JS-generated labels that appear only after hydration are not available from fetched HTML on other pages.

### Open questions
- Should answer-type results rank above sections for exact matches?
- Should action mode default to execute or navigate-only?
- Should a pre-generated index code path be stubbed early to reduce future diff size?

## 15. Build Phases

1. Repo scaffold with TypeScript, bundling, and a fixture static site.
2. Core crawler and section indexing.
3. IndexedDB cache and TTL/version invalidation.
4. Modal UI, hotkey handling, and Shadow DOM styling.
5. Configuration API and theming hooks.
6. Worker offload and performance tuning.
7. Universal indexing for actions, fields, media, files, and structured data.
8. Deferred action resolution and safety hardening.
9. Documentation, examples, publishing, and release packaging.

## 16. Fixture and Testing Guidance

The repository should include a fixture static site that exercises the full surface area of the architecture. Good coverage includes a sitemap, headings, a form, accordions, buttons, media with captions, structured FAQ data, and downloadable files.

### Suggested tests
- Sitemap discovery and fallback crawling.
- Section extraction and breadcrumb generation.
- Cache serialization and invalidation.
- Action indexing and safe resolution.
- Field focus behavior.
- Hidden content expansion.
- Structured data parsing.
- Keyboard navigation and accessibility checks.

### Repository notes
- Keep the document GitHub-ready and directly commitable.
- Prefer clear defaults over hidden behavior.
- Keep safety policy visible in the architecture, not buried in implementation.