# Reef for Browsers

**Reef for Browsers** is a cross-browser extension built using Manifest V3 (`manifest.json`) that turns any website into an interactive, searchable, and automatable environment using Reef's engine — without needing the site owner to install anything.

## Features

- **Authoritative & Dynamic Extraction**: Automatically uses pre-published `window.__reefAgentManifest` (from `agent-ready.ts`) if available on a site; otherwise extracts page sections, actions, fields, links, media, and files on the fly.
- **Keyboard-First Search**: Instant search popup (`Ctrl+Shift+K` / `MacCtrl+Shift+K`) grouped by record categories (`sections`, `actions`, `fields`, `files`, `links`, `media`).
- **In-Page Agent Automation**: Click buttons, fill forms, and navigate directly from the search popup using Reef's `Agent`.
- **Omnibox Keyword Integration**: Type `reef <query>` in your browser address bar to search the current site's index.
- **Privacy & Safety Guardrails**: Hard-excludes passwords, credit card numbers, SSN, and CVV inputs. Runs 100% locally in your browser.
- **Cross-Browser Support**: Single codebase targeting Chrome, Edge, and Firefox.

---

## Local Installation Guide

### Chrome / Edge / Chromium-Based Browsers
1. Run `npm run build:extension` in the root repository to build the extension into `plugin/dist/`.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** in the top right corner.
4. Click **Load unpacked**.
5. Select the `plugin/dist/` directory.

### Firefox
1. Run `npm run build:extension`.
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on...**.
4. Select the `manifest.json` file inside `plugin/dist/`.

---

## Build Scripts

From the repository root:

- `npm run build:extension` — Builds the production bundle into `plugin/dist/` and generates `reef-extension-chrome.zip` and `reef-extension-firefox.zip`.
- `npm run dev:extension` — Starts `esbuild` watch mode for extension development.
- `npm run test:extension` — Runs unit contract tests for extension messaging.

---

## Architecture Overview

- `plugin/src/content.ts`: Content script injected into host pages. Reads `window.__reefAgentManifest` or extracts records directly. Hosts page-level `Agent`.
- `plugin/src/background.ts`: Service Worker maintaining per-tab `SearchIndex` instances, handling omnibox requests, and routing extension messages.
- `plugin/src/popup/`: Search box and action execution UI.
- `plugin/src/options/`: Options page for per-site exclusion selectors and action execution guardrails.
