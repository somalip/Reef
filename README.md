# Spotlight Search

Spotlight Search is a zero-build, single-script-tag search overlay for static sites. It crawls your sitemap, extracts page headings and content, builds a local search index in the browser, and opens a keyboard-first overlay when visitors press Cmd/Ctrl+K.

## How it works

1. The script reads the sitemap from the page that loads it.
2. It fetches the linked pages and extracts their section headings and body text.
3. A local in-browser index is built so search stays on the visitor's device.
4. Pressing Cmd/Ctrl+K opens a modal overlay with instant results and keyboard navigation.

## Usage

Download the bundled file from the project site or build it yourself, then include it on any page:

```html
<script src="./dist/spotlight.min.js" data-sitemap="/sitemap.xml"></script>
```

Optional attributes:

- `data-sitemap`: override the sitemap URL
- `data-max-pages`: limit how many pages are indexed

Press Cmd/Ctrl+K to open the overlay.

## Build instructions

Install dependencies and create the final build output:

```bash
npm install
npm run build
```

The generated bundle will be written to `dist/spotlight.min.js`.

## Development

Run the test suite with:

```bash
npm test
```
