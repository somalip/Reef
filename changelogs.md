# Changelog

## [Unreleased]

### Added
- **Spotlight: Deep Browser Integration** (Reef for Browsers) — Enhanced Spotlight search with unified results across multiple data sources:
  - **Browser Actions**: Execute browser-level actions directly from Spotlight including mute/unmute tab, pin/unpin tab, duplicate tab, reload, close other tabs, focus mode, save session, bookmark page, new tab/window/incognito window, zoom in/out/reset, print page, and save page. Actions are scored by label match and appear in dedicated "Browser Actions" section.
  - **Native Bookmarks**: Search Chrome's native bookmarks via `chrome.bookmarks.search` and display results with bookmarks icon and badge.
  - **History**: Surface recent history items (last 30 days) with history icon and badge.
  - **Downloads**: Show recent downloads with download icon, filename, and state badge. Open downloads directly from Spotlight.
  - **Site Content**: Automatic indexing of active tab content into per-origin search indices. Results appear in "Site Content" section with origin badge.
  - **Search Previews**: When local results are empty, show configurable "Search with [Engine]" action row using user-selected search engine instead of immediately opening the engine.
  - **Unified Result Model**: All result types (tabs, site content, browser actions, bookmarks, history, downloads) rendered with section headers, icons, badges, and consistent keyboard navigation.

- **Search Engine Selection** — Choose default search engine for web searches from Spotlight and popup:
  - Built-in support for Google, Bing, DuckDuckGo, Brave, Ecosia, and Kagi.
  - Custom search engine via URL template (e.g., `https://example.com/search?q={query}`).
  - Setting available in Options → Search → Search Engine.
  - Custom URL input appears only when "Custom" is selected.

- **Customizable Shortcuts** — User-configurable keyboard shortcuts:
  - Spotlight shortcut (default: `Ctrl+Shift+L` / `Cmd+Shift+L`).
  - Popup shortcut (default: `Ctrl+Shift+R` / `Cmd+Shift+R`).
  - Interactive shortcut recorder in Options → Shortcuts with real-time validation.
  - Attempts runtime update via `chrome.commands.update` (Chromium 120+).
  - Falls back to manual update instructions at `chrome://extensions/shortcuts` for older browsers.

- **Spotlight: cross-tab search overlay** (Reef for Browsers) — Press `Ctrl+Shift+L` (or `Cmd+Shift+L` on macOS) from any page to open a Spotlight-style modal that ranks every open tab by title (exact > starts-with > contains, position-weighted), URL, and indexed page content. Keyboard-first: arrow keys to navigate, Enter to switch, Esc to close, Tab to cycle matches, Ctrl/⌘+1..9 to jump. Tabs in the current window get a small recency boost. Lazy-mounts on first invocation, 80 ms debounce, 50-row cap.
- **Agent-Ready Sites** (`reef-agent-ready.js`) — opt-in one-script instrumentation that publishes a live, accessibility-aware page manifest for browser agents, including stable IDs, Shadow DOM/iframe traversal, ARIA backfill, live route updates, exclusions, and rate limits. Includes an optional Playwright export helper for `/.well-known/agent-manifest.json`.
- **Agentic API - Chainable Methods** (`agent()`)
  - `agent().click(selector)` - Dispatch click events on elements with visual feedback
  - `agent().type(selector, value)` - Fill input/textarea/select values with proper event dispatch (React/Vue compatible)
  - `agent().submit(selector?)` - Submit forms or click submit buttons
  - `agent().navigate(url)` - Programmatic page navigation
  - `agent().back()` / `agent().forward()` - Browser history navigation  
  - `agent().wait(timeout)` - Pause execution for async operations
  - `agent().extract(selector)` - Extract text content or form values from elements

- **Workflow System** (`executeWorkflow(steps, options)`)
  - Multi-step JSON/YAML workflow execution with error handling
  - Retry logic via `maxRetries` and `retryDelay` options
  - Lifecycle callbacks: `onStepStart`, `onStepComplete`, `onStepError`
  - Supported step actions: `click`, `type`, `navigate`, `extract`, `submit`, `back`, `forward`, `wait`

- **Programmatic Action Execution** (`act(recordId)`)
  - Execute actions by record ID without modal open
  - Returns `{ success: boolean; reason?: string }`
  - Respects `actionsMode` gating for destructive actions

- **Field Value Filling** (`fillField(recordId, value)`)
  - Programmatically fill form fields using native property setters
  - Proper `input`/`change` event dispatch for React/Vue compatibility
  - Returns `{ success: boolean; reason?: string }`

- **Agent Tools & Session Management**
  - `getAgentTools()` - Return all actionable elements as tool descriptors for LLM agent consumption
  - `agent().getSession()` - Retrieve session snapshot with `{ id, url, timestamp, cookies?, localStorage? }`

### Changed
- New `actionsMode: 'execute' | 'navigate-only'` configuration option in `ReefConfig`
- `data-index-actions="true"` and `data-index-fields="true"` script attributes to enable action/field indexing
- **Reef for Browsers**: Popup shortcut moved from `Ctrl+Shift+L` to `Ctrl+Shift+R` (`Cmd+Shift+R` on macOS) so `Ctrl+Shift+L` (`Cmd+Shift+L`) can launch Spotlight

### Fixed
- Fixed `addToIndex` bug where label indexing only fired for labels of length exactly 2 (changed to `labelLower.length >= 2`)
- Fixed `searchSections` body-word lookup that used confusing fallback logic

### Demo
- Updated `agentic-demo.html` to use actual Reef API instead of simulated DOM manipulation
- Added interactive demonstrations for all agentic methods
