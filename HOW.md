# Reef Search Library: How It Works

This document provides a comprehensive explanation of the Reef search library, covering everything from the search algorithms to the UI modals.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Entry Point: browser.ts](#entry-point-browserts)
3. [Configuration System](#configuration-system)
4. [Indexing Pipeline](#indexing-pipeline)
5. [Content Extraction](#content-extraction)
6. [Search Index Structure](#search-index-structure)
7. [Search Algorithm](#search-algorithm)
8. [Action Execution](#action-execution)
9. [UI Rendering](#ui-rendering)
10. [Visual Inspector](#visual-inspector)
11. [Web Worker Support](#web-worker-support)
12. [IndexedDB Caching](#indexeddb-caching)

---

## Architecture Overview

Reef is a client-side search library that indexes web pages and provides an interactive search modal with keyboard navigation. The architecture follows a modular design:

```
┌─────────────────────────────────────────────────────────────────┐
│                    ReefSearch (reef.ts)                        │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌─────────────┐ │
│  │  Indexer  │  │   UI      │  │ Executor  │  │ Inspector   │ │
│  │           │  │ Renderer  │  │           │  │             │ │
│  └───────────┘  └───────────┘  └───────────┘  └─────────────┘ │
└─────────────────────────────────────────────────────────────────┘
         │                 │                │           │
         ▼                 ▼                ▼           ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐
│  indexing/   │  │    ui/     │  │   actions/   │  │   ui/       │
│  indexer.ts  │  │  renderer  │  │  action-     │  │  inspector  │
│              │  │    .ts     │  │  executor.ts │  │    .ts      │
└──────────────┘  └──────────────┘  └──────────────┘  └─────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    search-index.ts                             │
│  - Search index structure (Maps, arrays)                       │
│  - Search algorithms (BM25, fuzzy matching)                    │
│  - Query parsing (extended syntax)                             │
│  - Serialization/deserialization                                 │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                       extraction.ts                             │
│  - extractSections() - HTML headings to sections               │
│  - extractActions() - Button/action elements                     │
│  - extractFields() - Form inputs                               │
│  - extractLinks() - Anchor tags                                │
│  - extractFiles() - Downloadable files                         │
│  - extractMedia() - Images, video, audio                         │
│  - extractStructuredData() - JSON-LD FAQ, etc.                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Entry Point: browser.ts

The `browser.ts` file is the entry point that runs when the library is loaded in a browser:

```typescript
import { ReefSearch } from './reef';

const reef = new ReefSearch();
(window as Window & { Reef?: ReefSearch }).Reef = reef;
```

This:
1. Instantiates the main `ReefSearch` class
2. Exposes it globally as `window.Reef` for external access

When instantiated, `ReefSearch` constructor:
- Reads configuration from script data attributes
- Creates the search index
- Sets up the UI renderer
- Initializes the action executor
- Starts the indexing process asynchronously

---

## Configuration System

Configuration is read from HTML script tag data attributes via `ConfigReader` in `config/config-reader.ts`:

```typescript
static readConfig(): ReefConfig {
  const script = document.currentScript as HTMLScriptElement | null;
  const dataset = script?.dataset ?? {};
  // ... parse attributes
}
```

### Supported Configuration Options

| Attribute | Type | Default | Description |
|-----------|------|---------|-------------|
| `data-sitemap` | string | `/sitemap.xml` | URL to sitemap for crawling |
| `data-max-pages` | number | 500 | Maximum pages to index |
| `data-scope` | string | - | CSS selector to limit indexing scope |
| `data-index-actions` | boolean | true | Whether to index buttons/forms |
| `data-index-media` | boolean | true | Whether to index images/video/audio |
| `data-index-structured-data` | boolean | true | Whether to index JSON-LD |
| `data-index-hidden` | boolean | true | Whether to index hidden elements |
| `data-file-extensions` | string | pdf,doc,docx,xls,xlsx,ppt,pptx,zip,csv | File types to index |
| `data-exclude-action` | string | - | CSS selector for actions to exclude |
| `data-actions-mode` | string | 'execute' | 'execute' or 'navigate-only' |
| `data-theme` | string | 'auto' | 'light', 'dark', or 'auto' |
| `data-mode` | string | 'opaque' | 'regular', 'opaque', or 'high-contrast' |
| `data-hotkey` | string | 'ctrlk,cmdk' | Keyboard shortcut to open modal |
| `data-placeholder` | string | 'Search this site' | Input placeholder text |
| `data-headless` | boolean | false | Disable UI modal |
| `data-prebuilt-index-url` | string | - | URL to load pre-built index |
| `data-use-worker-indexing` | boolean | false | Use Web Worker for indexing |
| `data-ttl` | number | - | Cache TTL in milliseconds |

### Configuration Application

`ConfigApplier.applyConfigToUI()` applies visual configuration:
- Sets CSS custom properties for colors and radius
- Applies theme mode classes (mode-regular, mode-opaque, mode-high-contrast)
- Updates UI controls with current settings

---

## Indexing Pipeline

The `Indexer` class in `indexing/indexer.ts` manages the complete indexing lifecycle:

### Boot Process

```typescript
async boot(onReady: () => void): Promise<void> {
  // 1. Try prebuilt index first (if configured)
  if (this.config.prebuiltIndexUrl) {
    // fetch and deserialize
  }
  
  // 2. Try IndexedDB cache (if available and not expired)
  const cached = await loadIndex(ttl);
  
  // 3. Fetch sitemap and crawl pages
  const candidates = this.getSitemapCandidates();
  // ... fetch and process pages
  
  // 4. Fallback: same-origin crawl
  this.crawlSameOrigin(onReady);
}
```

### Sitemap Resolution

`getSitemapCandidates()` generates multiple possible sitemap URLs:
- The configured path (e.g., `/sitemap.xml`)
- Relative path from current page (`./sitemap.xml`)
- Standard location (`sitemap.xml`)

### Page Fetching Strategies

1. **Parallel Fetching** (default): Fetches up to 500 pages with concurrency of 6
2. **Web Worker Indexing**: Offloads indexing to a background worker

### Content Extraction

For each page, `extractAllContent()` extracts:
```typescript
const sections = extractSections(html, pageUrl);
const actions = extractActions(html, pageUrl, excludeSelector);
const fields = extractFields(html, pageUrl);
const links = extractLinks(html, pageUrl);
const files = extractFiles(html, pageUrl, fileExtensions);
const media = extractMedia(html, pageUrl);
const structured = extractStructuredData(html, pageUrl);
```

---

## Content Extraction

The `extraction.ts` module parses HTML and extracts various content types:

### HTML Cleaning

All extraction functions first clean the HTML:
```typescript
const cleanHtml = html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ');
```

### Selector Generation

`generateSelector()` creates stable CSS selectors:
```typescript
function generateSelector(element: Element): string {
  // Walk up DOM tree building selector
  // Uses ID if available (most stable)
  // Falls back to tag + classes + nth-child
}
```

Examples:
- Element with ID: `#submit-button`
- Element with classes: `button.primary`
- Complex path: `form > div.actions > button:nth-child(2)`

### Section Extraction (`extractSections`)

Extracts page sections from headings (h1-h6):

1. Finds all heading elements
2. Extracts heading text and generates unique IDs
3. For each heading, extracts content until the next heading
4. Builds breadcrumb trails from parent headings
5. Creates `IndexRecord` with type 'section'

```typescript
sections[i] = {
  id: `${url}#${heading.id}`,
  url: `${url}#${heading.id}`,
  headingText: heading.text,
  headingId: heading.id,
  breadcrumb: 'Parent › Current Heading',
  bodyText: 'Extracted content...',
  type: 'section',
  selector: '#section-id'
};
```

### Action Extraction (`extractActions`)

Finds interactive elements:
- `<button>` elements
- Elements with `role="button"`
- `<input type="button|submit">`
- `<summary>` elements
- Elements with `data-reef-action` attribute

For each action:
1. Gets label via `extractActionName()`:
   - `aria-label` attribute
   - `aria-labelledby` reference
   - `textContent`
   - `title` attribute
2. Determines if destructive (delete, pay, checkout, etc.)
3. Creates `IndexRecord` with type 'action'

### Field Extraction (`extractFields`)

Extracts form inputs:
1. Finds all `<form>` elements
2. For each input/textarea/select:
   - Skips hidden, button, submit, reset types
   - Gets label from `<label for="...">` or parent label
   - Falls back to placeholder or aria-label
3. Creates `IndexRecord` with type 'field'

### Link Extraction (`extractLinks`)

Extracts anchor tags:
- Skips `rel="nofollow"` links
- Skips `#` and `javascript:` URLs
- Resolves relative URLs to absolute
- Marks external links by type

### File Extraction (`extractFiles`)

Finds downloadable files:
- Checks href for configured extensions
- Default: pdf, doc, docx, xls, xlsx, ppt, pptx, zip, csv
- Creates `IndexRecord` with type 'file'

### Media Extraction (`extractMedia`)

Extracts images and media:
- Images: Uses `alt` text, optionally includes figcaption
- Video/Audio: Uses title/aria-label, includes track sources
- Creates `IndexRecord` with type 'media'

### Structured Data Extraction (`extractStructuredData`)

Parses JSON-LD script tags:
- FAQPage: Extracts question/answer pairs
- Other types: Uses name/headline and description

---

## Search Index Structure

The `SearchIndex` interface in `search-index.ts`:

```typescript
interface SearchIndex {
  headingIndex: Map<string, IndexRecord[]>;  // Prefix tree for headings
  headingIds: Map<string, IndexRecord[]>;    // Exact heading matches
  bodyIndex: Map<string, IndexRecord[]>;     // Body text word index
  allSections: IndexRecord[];                // All records array
  queryCache: Map<string, CacheEntry>;       // LRU query cache
  popularQueries: string[];                   // Query frequency tracking
  docFrequency: Map<string, number>;         // For BM25 scoring
  totalDocs: number;                         // Document count
}
```

### Indexing Process

`addToIndex()` processes each record:

1. **Heading Indexing**:
   - Lowercase heading text
   - Also index diacritic-normalized version (é → e)
   - Build prefix tree (h, he, hel, hell, hello...)

2. **Body Indexing**:
   - Split by whitespace
   - Filter words >= 3 characters
   - Index diacritic-normalized versions
   - Track document frequency for BM25

3. **Structured Data**:
   - Index question and answer words separately

4. **All Sections**:
   - Append to `allSections` array

---

## Search Algorithm

The `searchSections()` function implements a multi-stage search:

### Query Processing

1. **Empty Query**: Returns first N records from `allSections`
2. **Diacritic Normalization**: `é → e` matching
3. **Query Cache**: LRU cache stores recent results

### Matching Stages

The algorithm uses staged matching with descending scores:

| Stage | Match Type | Score | Description |
|-------|-----------|-------|-------------|
| 1 | Exact heading | 100 | Full heading text match |
| 2 | Prefix match | 50 | Heading starts with query |
| 3 | Body word match | 20 | Query word in body text |
| 4 | Fuzzy (1 typo) | 60→40 | Levenshtein distance 1 |
| 5 | Fuzzy (2 typos) | 30→20 | Levenshtein distance 2 |
| 6 | Extended syntax | 50 | Special query operators |

### BM25 Scoring

Optional BM25 algorithm for better ranking:

```typescript
function bm25Score(termFreq, docFreq, totalDocs, docLength, avgDocLength): number {
  const idf = Math.log((totalDocs - docFreq + 0.5) / (docFreq + 0.5) + 1);
  const norm = 1 - b + b * (docLength / avgDocLength);
  return idf * ((termFreq * (k1 + 1)) / (termFreq + k1 * norm));
}
```

### Extended Query Syntax

Special operators are parsed:
- `'exact phrase'` - Exact phrase match
- `!exclude` - Exclude terms
- `^prefix` - Prefix match
- `suffix$` - Suffix match
- `term1 | term2` - OR search

### Filtering and Sorting

- `filter` callback to exclude records
- `sortFn` for custom sorting
- `typeWeights` to boost specific types
- `weights` for field-specific boosting

### Result Formatting

Returns either:
- `IndexRecord[]` - Just the records
- `ScoredRecord[]` - Records with scores and match positions

---

## Action Execution

The `ActionExecutor` class in `actions/action-executor.ts` handles executing actions on search results:

### Navigation Types

```typescript
executeAction(result: IndexRecord): void {
  switch (result.type) {
    case 'action':
      // Click button or trigger event
      break;
    case 'field':
      // Focus input field
      break;
    case 'link':
    case 'file':
    case 'media':
    case 'structured':
      // Navigate to URL
      break;
    case 'section':
      // Scroll to section on page
      break;
  }
}
```

### Deferred Actions

When navigating away from a page with pending actions:
1. Store action in `sessionStorage` (`reef-deferred-action`)
2. Navigate to target page
3. On page load, execute the deferred action

### Scroll-to-Section

For same-page navigation:
1. Find element by selector or heading text
2. `scrollIntoView()` with smooth behavior
3. Apply temporary highlight (box-shadow)
4. Auto-remove highlight after 2 seconds

### Destructive Action Protection

Actions like "delete", "pay", "checkout" are marked `destructive`:
- In 'navigate-only' mode, prompts user before executing
- Highlights target element before navigation

---

## UI Rendering

The `UIRenderer` class in `ui/renderer.ts` manages the search modal:

### Shadow DOM Structure

```html
<div class="reef-host is-hidden">
  #shadow-root (open)
    <div class="panel" role="dialog" aria-modal="true">
      <div class="input-row">
        <svg class="icon">...</svg>
        <input class="input" type="text" placeholder="Search this site" />
        <span class="hint">ESC</span>
        <button class="settings-toggle-btn">...</button>
      </div>
      
      <div class="main-content-view">
        <div class="tabs-row">
          <button class="tab-chip active" data-cat="all">All</button>
          <button class="tab-chip" data-cat="pages">Pages</button>
          <button class="tab-chip" data-cat="actions">Actions</button>
          <button class="tab-chip" data-cat="files">Files</button>
          <button class="tab-chip" data-cat="links">Links</button>
        </div>
        <div class="results" aria-live="polite"></div>
        <div class="footer">
          <span><span class="k">↑↓</span> navigate <span class="k">↵</span> open</span>
          <span id="count">5 results</span>
        </div>
      </div>
      
      <div class="settings-view is-hidden">...</div>
    </div>
</div>
```

### Modal States

- `is-hidden`: `display: none` (completely removed from layout)
- `open`: Visible with fade-in animation
- Opacity transitions for smooth appearance

### Modes

1. **Regular Mode**: Transparent background
2. **Opaque Mode**: Dark semi-transparent overlay (default)
3. **High Contrast Mode**: Light background with dark text

### Result Rendering

Each result is rendered as:
```html
<button class="result is-selected" type="button" data-index="0">
  <div class="result-type">
    <span class="result-type-icon">...</span>
    <span class="result-type-label">Section</span>
  </div>
  <div class="breadcrumb">Parent › Current</div>
  <div class="heading">Highlighted Heading</div>
  <div class="snippet">...matching snippet...</div>
  <div class="result-action-hint run-here">↵ to run here</div>
</button>
```

### Result Types and Icons

| Type | Label | Icon Description |
|------|-------|-----------------|
| section | Section | Document with page icon |
| action | Action | Navigation arrow in circle |
| field | Field | Search/loupe icon |
| link | Link | Corner connection |
| file | File | Document with paperclip |
| media | Media | Rectangle with play button |
| structured | Answer | Circle with checkmark |

### Focus Management

- **Focus Trap**: Prevents focus from leaving modal
- **Tab Navigation**: Cycles through focusable elements
- **Keyboard Navigation**: Arrow keys for result selection

### Settings Panel

Accessible via settings button, includes:
- Theme selector (Auto/Light/Dark)
- Mode selector (Regular/Opaque/High Contrast)
- Hotkey selector
- Action mode selector
- Inspector toggle
- Diagnostics display
- Rebuild index button
- Copy config button

---

## Visual Inspector

The `VisualInspector` class in `ui/inspector.ts` provides debugging overlays:

### Activation

```typescript
toggleInspector(force?: boolean): void {
  const shouldActive = typeof force === 'boolean' ? force : !this.inspector.isActive();
  if (shouldActive) {
    this.inspector.activate();
  } else {
    this.inspector.deactivate();
  }
}
```

### Overlay Display

When active, shows overlays on all actions and fields:
- Dashed border around elements
- Floating badge with element type and ID
- Hover effects with glow

### Colors

- **Actions**: Pink dashed border (#ff007f)
- **Fields**: Cyan dashed border (#00e5ff)

### Coordinate Calculation

```typescript
const rect = element.getBoundingClientRect();
const top = rect.top + docScrollTop;
const left = rect.left + docScrollLeft;
```

### Refresh Handling

- Updates on scroll and resize
- Uses `ResizeObserver` for layout changes
- MutationObserver for dynamic content

---

## Web Worker Support

The `worker.ts` file enables background indexing:

### Worker Protocol

```typescript
self.onmessage = (e) => {
  const { id, action, payload } = e.data;
  
  switch (action) {
    case 'createIndex': ...
    case 'search': ...
    case 'indexPages': ...
    case 'serializeIndex': ...
    case 'deserializeIndex': ...
  }
};
```

### Index Pages Action

```typescript
case 'indexPages': {
  const { pages, config } = payload;
  // Process each page's HTML
  // Extract all content types
  // Build index
  // Return serialized JSON
}
```

### Main Thread Integration

```typescript
private async fetchPagesWithWorker(urls, sitemapUrl, onReady) {
  const worker = new Worker(workerUrl);
  
  // Fetch HTML for each page
  // Send to worker
  worker.postMessage({
    id: Date.now(),
    action: 'indexPages',
    payload: { pages: [...], config: {...} }
  });
  
  // Receive serialized index
  // Deserialize into SearchIndex
}
```

### Benefits

- Non-blocking UI during indexing
- Better performance for large sites
- Can index in background while user interacts

---

## IndexedDB Caching

The `cache.ts` module provides persistent storage:

### Database Structure

```typescript
const DB_NAME = 'reef-index';
const STORE_NAME = 'indices';
const CACHE_VERSION_KEY = 'version';
```

### Save Index

```typescript
async saveIndex(index: SearchIndex, metadata: CacheMetadata): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  
  const data = {
    version: metadata.versionHash,
    index: serializeIndex(index),
    metadata
  };
  
  await store.put(data);
}
```

### Load Index

```typescript
async loadIndex(ttl?: number): Promise<...> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  
  const allRecords = await store.getAll();
  
  if (!allRecords.length) return null;
  
  const record = allRecords[0];
  const cached = deserializeIndex(record.index);
  const metadata = record.metadata;
  
  // Check TTL
  if (ttl && metadata.buildTime) {
    const age = Date.now() - metadata.buildTime;
    if (age > ttl) return null;
  }
  
  return { index: cached, metadata };
}
```

### Version Hashing

```typescript
private computeVersionHash(urls: string[]): string {
  let hash = 0;
  for (const url of urls) {
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
  }
  return Math.abs(hash).toString(36);
}
```

### Clear Cache

```typescript
async clearCache(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  await store.clear();
}
```

---

## Public API

The `ReefSearch` class exposes the following public methods:

### UI Control

- `open()` - Open the search modal
- `close()` - Close the search modal
- `openWithQuery(query: string)` - Open with pre-filled query
- `isOpenState(): boolean` - Check if modal is open

### Search

- `search(query: string, limit?: number): IndexRecord[]` - Basic search
- `searchSections(query: string, options?: SearchOptions): ScoredRecord[]` - Advanced search
- `suggest(query: string, limit?: number): string[]` - Autocomplete suggestions
- `facets(): Record<string, number>` - Count by type
- `trackQuery(query: string)` - Track query for analytics
- `getPopularQueries(n?: number): string[]` - Get popular search terms

### Index Management

- `getIndex(): IndexRecord[]` - Get all indexed records
- `addCustomRecords(records: IndexRecord[])` - Add custom records
- `clearCustomRecords()` - Clear and rebuild index
- `rebuildIndex(): Promise<void>` - Rebuild from scratch

### Action Execution

- `act(recordId: string): Promise<{ success, reason }>` - Execute action by ID
- `fillField(recordId: string, value: string): Promise<{ success, reason }>` - Fill form field

### Inspection

- `getAgentTools(): Array<{ name, description, type, selector, id }>` - Get tools for AI agents
- `toggleInspector(force?: boolean)` - Toggle visual inspector

### Event Handling

- `onselect(callback: (result: IndexRecord) => void)` - Set select callback
- `offselect()` - Remove select callback
- `setOnReady(callback: (data) => void)` - Set ready callback

### Configuration

- `setTheme(theme: 'light' | 'dark' | 'auto')`
- `setMode(mode: 'regular' | 'opaque' | 'high-contrast')`
- `setHotkey(hotkey: string)`
- `setPlaceholder(placeholder: string)`
- `setColorScheme(scheme: { primary, secondary, background, text, border, radius })`
- `setHeadless(headless: boolean)`

---

## Data Flow Summary

1. **Initialization**:
   - `browser.ts` → `new ReefSearch()`
   - `ReefSearch` → reads config, creates index, initializes UI

2. **Indexing**:
   - `Indexer.boot()` → sitemap or crawl
   - Fetch pages → `extractAllContent()` → `addToIndex()`
   - Cache saved to IndexedDB

3. **Search**:
   - User types in input
   - `renderResults()` → `getVisibleResults()` → `searchSections()`
   - Results filtered by category tab
   - Rendered with highlighting

4. **Interaction**:
   - Keyboard: Arrow keys, Enter, Escape, Tab
   - Click: Navigate, select, open settings
   - Actions: Execute or navigate

5. **Action Execution**:
   - `executeAction()` based on result type
   - Deferred actions stored in sessionStorage
   - Visual feedback on scroll

6. **Inspector**:
   - Toggle via settings
   - Overlays actions/fields with badges
   - Updates on scroll/resize

This modular architecture allows Reef to provide fast, accurate search with a polished UI experience while supporting advanced features like fuzzy matching, BM25 scoring, and AI agent integration.