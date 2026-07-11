# Changelog

## [Unreleased]

### Fixed
- Fixed `addToIndex` bug where label indexing only fired for labels of length exactly 2 (changed `labelLower.length >= 2 && labelLower.length < 3` to `labelLower.length >= 2`).
- Fixed `searchSections` body-word lookup that used confusing fallback logic `index.bodyIndex.get(word) ?? index.bodyIndex.get(q.toLowerCase().split(/\s+/).find(w => w.includes(word)) ?? '')`. Now uses clean `index.bodyIndex.get(word)`.

### Added
- **Web Worker support for indexing** (`useWorkerIndexing` config option). When enabled, page fetching happens on the main thread but HTML parsing and content extraction is offloaded to a Web Worker, reducing main-thread jank during large site crawls. The worker returns the serialized index which is then deserialized on the main thread.

- **Programmatic action execution API** (`reef.act(recordId)`). Returns `Promise<{ success: boolean; reason?: string }>` allowing external agents to execute actions without the modal being open. Respects `actionsMode` gating for destructive actions.

- **Field value filling API** (`reef.fillField(recordId, value)`). Sets input field values programmatically using native property setters with proper `input`/`change` event dispatch for React/Vue compatibility.

### Changed
- Updated `PARITY.md` to reflect completed features:
  - Marked Web Worker wiring as complete
  - Marked programmatic action execution (`act()`) as complete
  - Marked field value filling (`fillField()`) as complete
  - Updated suggested sequencing to prioritize remaining high-value features