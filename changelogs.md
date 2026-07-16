# Changelog

## [Unreleased]

### Added
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

### Fixed
- Fixed `addToIndex` bug where label indexing only fired for labels of length exactly 2 (changed to `labelLower.length >= 2`)
- Fixed `searchSections` body-word lookup that used confusing fallback logic

### Demo
- Updated `agentic-demo.html` to use actual Reef API instead of simulated DOM manipulation
- Added interactive demonstrations for all agentic methods