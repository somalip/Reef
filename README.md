![reef_transparent](https://github.com/user-attachments/assets/a7c9f074-a61a-4f96-8bf4-f595df18f2f8)

# Reef Search

> **Notice:** This project is under active development. Expect new versions **daily**, and expect breaking changes between them.

Reef Search is a zero-build, single-script-tag search overlay for static sites. Paste in one `<script>` tag and visitors get a fast, keyboard-first search modal (**Cmd/Ctrl+K**) backed by an in-browser index — no server, no build step, no account.

It crawls your sitemap, extracts page content in the browser, and can optionally surface more than just page text: buttons, form fields, downloadable files, media captions, and structured FAQ data on the pages it indexes.

## Contents

- [Features](#features)
- [How it works](#how-it-works)
- [Install](#install)
- [Configuration](#configuration)
- [Result types](#result-types)
- [Runtime API](#runtime-api)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Safety and execution model](#safety-and-execution-model)
- [Current limitations](#current-limitations)
- [Roadmap](#roadmap)
- [Development](#development)

## Features

- **Single script-tag install** — no build step, no backend, no framework assumptions.
- **In-browser indexing** — pages are fetched, parsed with `DOMParser`, and indexed entirely client-side; nothing runs from fetched HTML.
- **Universal indexing model** — beyond page sections, the indexer can also surface:
  - **Actions** — buttons, `[role="button"]` elements, and `<summary>` toggles.
  - **Fields** — form inputs, textareas, and selects (indexed for focus, never auto-filled).
  - **Links** — external links, tracked as their own result type.
  - **Files** — downloadable links (PDF, Office docs, spreadsheets, archives, CSV).
  - **Media** — images with alt text/captions, and video/audio with a title or caption track.
  - **Structured data** — `application/ld+json` FAQ pages and other typed metadata, shown as inline answers.
- **Accessible, themeable modal** — rendered in a Shadow DOM root so host-page styles never leak in or out.
- **Typo-tolerant search** — falls back to a Levenshtein-based "did you mean" suggestion when there are no direct matches.

## How it works

1. The page loads the script with `defer`.
2. On boot, Reef looks for `sitemap.xml` (or your configured path) relative to the current page.
3. If a sitemap is found, it fetches the linked pages in parallel (concurrency-limited) and extracts sections, actions, fields, links, files, media, and structured data from each.
4. If no sitemap resolves, Reef falls back to indexing just the current page.
5. Everything is held in an in-memory index — no query ever leaves the browser.
6. Pressing **Cmd/Ctrl+K** opens the modal; typing filters the in-memory index and ranks results by field weight (heading matches score highest, body-word matches lower).
7. Selecting a result navigates to it, focuses a field, or runs a safe same-page action, depending on its type.

## Install

```html
<script type="module">
  import reefSearch from 'https://cdn.jsdelivr.net/npm/reef-search@0.1.0/+esm'
</script>
```

Press **Cmd/Ctrl+K** on the page to open the overlay.

## Configuration

Set these as attributes on the script tag (or `data-*` equivalents where noted).

| Attribute | Default | Purpose |
|---|---|---|
| `data-sitemap` | `/sitemap.xml` | Sitemap path override |
| `data-max-pages` | `500` | Maximum number of sitemap pages to fetch |
| `data-scope` | — | CSS selector limiting extraction to a specific content root |
| `data-index-actions` | `true` | Enable indexing of buttons/toggles (also gates field indexing) |
| `data-index-media` | `true` | Enable indexing of images, video, and audio |
| `data-index-structured-data` | `true` | Enable indexing of JSON-LD structured data |
| `data-actions-mode` | `execute` | `execute` or `navigate-only` — see [Safety](#safety-and-execution-model) |

The following attributes are read by the loader but are **not yet enforced** — they're reserved for a near-term release and currently have no effect: `data-index-hidden` (collapsed/accordion content is not yet expanded during extraction), `data-file-extensions` (the file-link classifier currently uses a fixed built-in list: `pdf, doc, docx, xls, xlsx, ppt, pptx, zip, csv`), and `data-exclude-action` (elements aren't yet stripped before extraction).

## Result types

| Type | Label | Behavior on select |
|---|---|---|
| `section` | Section | Navigates to the heading anchor |
| `action` | Action | Clicks the control if it's safe and on the current page, otherwise navigates first |
| `field` | Field | Focuses (and selects) the matching input |
| `link` | Link | Navigates to the external link |
| `file` | File | Navigates to the downloadable resource |
| `media` | Media | Navigates to the page containing the image/video/audio |
| `structured` | Answer | Shows an inline preview and navigates to the source page |

## Runtime API

- `window.Reef.open()` — opens the modal.
- `window.Reef.close()` — closes the modal.

## Keyboard shortcuts

- **Cmd/Ctrl+K** — open the modal.
- **↑ / ↓** — move between results.
- **Enter** — run or navigate to the selected result.
- **Escape** — close the modal.

## Safety and execution model

Because selecting a search result can trigger behavior on the page, execution is deliberately conservative:

- Forms are never auto-filled or auto-submitted — fields only receive focus.
- Labels matching destructive verbs (delete, remove, pay, checkout, confirm, etc.) are flagged as `destructive`.
- Actions on the current page are dispatched as a real click event against the matched element; if the element can't be found, the user sees a toast instead of a silent failure.
- Actions that target a different page are deferred: Reef stores the pending action and navigates there first, resolving it the next time the overlay initializes on that page rather than mutating anything before the destination has loaded.
- With the default `data-actions-mode="execute"`, a destructive action on the *current* page will still run when selected. Set `data-actions-mode="navigate-only"` if you want destructive actions to only scroll to and highlight the element instead of triggering it automatically.

## Current limitations

- **No persistent cache yet.** The index is rebuilt from the sitemap on every full page load; there is no IndexedDB (or other) persistence across sessions or navigations yet.
- **No worker offload yet.** Indexing and search both run on the main thread.
- **No same-origin crawl fallback.** If no sitemap resolves, Reef indexes only the current page rather than crawling outward from it.
- **No OCR** for images, and no indexing of client-rendered content that only appears after hydration on other pages (fetched HTML doesn't execute scripts).
- **Hotkey is fixed** to Cmd/Ctrl+K; there's no configuration attribute for a custom shortcut yet.
- Several `data-*` attributes described above are accepted but not yet wired up (see [Configuration](#configuration)).

## Roadmap

- Web Worker offload for indexing and querying.
- IndexedDB-backed persistent cache with version/TTL invalidation.
- Same-origin breadth-first fallback crawl when no sitemap is present.
- Wiring up `data-index-hidden`, `data-file-extensions`, and `data-exclude-action`.
- Configurable hotkey and CSS theme variables for accent, background, and radius.
- Deciding whether `answer`-type results should outrank `section` matches on exact queries.

## Development

Install dependencies and build:

```bash
npm install
npm run build
```

The generated bundle is written to `dist/reef.min.js`.

Run the test suite:

```bash
npm test
```
