# Reef feature inventory

This document describes the capabilities currently implemented in `src/`. Public functions are exported from the package root unless noted otherwise.

## User-facing capabilities

- Keyboard-first site search with configurable hotkeys, placeholders, themes, light/dark/automatic appearance, opaque and high-contrast modes, and a shadow-DOM modal.
- Search result categories for pages, actions and fields, files, links, media, and structured answers.
- Fuzzy matching, typo suggestions, stemming, diacritic normalization, synonyms, exact phrases, exclusions, prefix/suffix queries, OR queries, field filters, weighted ranking, BM25/BM25F, popularity boosts, and MMR diversity.
- Autocomplete suggestions and bounded-memory prefix lookup through the regular trie and `CompressedTrie`.
- Stable cursor pagination with `searchWithPagination()` and total-match counts with `getTotalResultCount()`.
- Query history with local persistence, prefix suggestions, pinning, removal, clearing, and favorites-ready history records.
- Optional live result previews and a relevance-tuning helper for adjusting weights and comparing ranking experiments.
- Configurable keyboard manager for custom shortcuts and vim-style bindings.
- Navigation and interaction through indexed links, buttons, forms, fields, files, media, and structured data; destructive actions can be blocked or switched to navigate-only behavior.
- Agent workflows for click, type, navigate, extract, submit, back, forward, and wait, including retries, validation, lifecycle callbacks, chaining, conditions, loops, templates, export, and recording.
- Universal live-DOM grounding for dynamic sites: semantic multi-selector candidates, fuzzy label fallback, accessibility-tree extraction, open shadow-root traversal, and same-origin iframe paths.
- `Agent.observe()` and `waitForStable()` for current in-viewport actions and debounced DOM-settle waits; visibility checks auto-scroll targets into view before interaction.
- SPA-aware navigation through history/hash route changes, live re-observation, lightweight action-change verification, one-candidate retry, action budgets, rate limits, and destructive-action guardrails.
- `Agent.exhaustPagination()` for bounded next-control and infinite-scroll traversal without automatically submitting forms or destructive controls.
- Visual inspector overlay for identifying indexed actions and fields on the current page.
- Offline-ready cache helpers for service-worker registration, URL caching, cache clearing, and background-sync integration points.

## Technical capabilities

### Indexing and extraction

- Heading-based section extraction with breadcrumbs, selectors, stable IDs, body chunks, and nested-section support.
- Extraction of actions, form fields, links, downloadable files, media, hidden content, and JSON-LD/structured answers.
- `generateStableSelector()` returns ordered semantic, ARIA, structural, and XPath candidates; `IndexRecord.selectors` and `iframePath` preserve robust grounding metadata.
- `extractAccessibilityTree()` indexes custom role-based controls, contenteditable elements, and tabindex-focusable widgets across open shadow DOM and same-origin iframes.
- Sitemap and sitemap-index crawling, same-origin discovery, robots.txt handling, crawl delay, parallel fetching, worker-based indexing, incremental ETag/Last-Modified/content-hash checks, IndexedDB persistence, gzip compression, and prebuilt-index loading.
- `DynamicIndexer` for debounced MutationObserver re-indexing, `ContentWatcher` for batched DOM diffs, and viewport/lazy-content integration points.
- Language detection and language-aware tokenization for English, Spanish, French, and German.
- Document and OCR provider interfaces for PDF/Office text and image text extraction; integrations can supply PDF.js or Tesseract.js without making them mandatory dependencies.
- Cross-origin index merging with duplicate-ID conflict resolution and static JSON/Hugo/Jekyll index export for SSR/build-time generation.

### Search and ranking

- In-memory inverted indexes for headings, body terms, labels, breadcrumbs, structured data, and document frequencies.
- Query caching with targeted invalidation, serialization/deserialization, record insertion/update/removal, facets, query popularity tracking, and total-document accounting.
- `semanticSearch()` with pluggable embeddings, cosine similarity, hybrid-ready scoring, and vector quantization helpers.
- Query expansion using configured synonyms, search history, Soundex phonetic alternatives, and field syntax such as `title:api body:authentication`.

### Agents and integrations

- Local agent sessions with cookies/local-storage snapshots where available, selector resolution by selector or index record, action safety checks, and workflow execution.
- `crawlAndBuildGraph()` produces serializable same-origin `SiteGraph` nodes and action edges for multi-page planning, with optional IndexedDB persistence through `saveSiteGraph()` / `loadSiteGraph()`.
- `agentTools` and `createAgentTools()` expose JSON-schema tool definitions for observe, click, type, navigate, extract, stability waits, and history back operations.
- **Agent-Ready Sites**: the standalone `reef-agent-ready.js` entry point instruments any site from one script tag, publishes `window.__reefAgentManifest`, an `application/agent-manifest+json` script, and a `reef:agent-ready` event. It supports stable `data-agent-id` stamps, ARIA backfill, open Shadow DOM and same-origin iframe traversal, live SPA updates, sensitive-field exclusions, and bounded rescans.
- `createRemoteAgent()` WebSocket transport for server-side execution and state-sync protocols.
- CMS adapter interface plus a fetch-based endpoint adapter suitable for WordPress, Ghost, Notion, or webhook-backed services.
- Privacy-by-default analytics tracker: event collection is disabled unless explicitly enabled, with query/click events, export, and clearing.

### Developer experience

- Hook-based `PluginManager` with before-search, after-search, and indexing hooks, plus exportable plugin metadata.
- Index inspection and search timing helpers for development tooling.
- Test harness utilities for mock indexes and deterministic action replay.
- TypeScript-first interfaces for records, search options, caching, workflows, sessions, plugins, analytics, embedding providers, CMS adapters, and OCR providers.

## Main entry points

| Entry point | Purpose |
| --- | --- |
| `createReef()` / `ReefSearch` | Full browser search instance and UI orchestration |
| `searchSections()` / `searchWithPagination()` | Search and cursor pagination |
| `createSearchIndex()` / `addToIndex()` | Build and mutate an index |
| `extract*()` | Extract indexable content from HTML |
| `Agent` / workflow helpers | Execute browser actions and workflows |
| `crawlAndBuildGraph()` / `SiteGraph` | Build bounded, same-origin traversal graphs |
| `agentTools` / `createAgentTools()` | Connect Agent methods to LLM tool-use loops |
| `initAgentReady()` / `reef-agent-ready.js` | Publish a live manifest for external browser agents |
| `QueryHistory`, `VirtualList`, `RelevanceTuner` | UI and result experience helpers |
| `DynamicIndexer`, `ContentWatcher`, `mergeIndexes` | Advanced indexing workflows |
| `AnalyticsTracker`, `PluginManager`, `createCMSAdapter` | Optional integrations |

Optional providers are deliberately dependency-free: applications can connect their preferred semantic model, OCR engine, document parser, CMS, or remote agent transport through the exported interfaces.
