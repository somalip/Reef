![reef_transparent](https://github.com/user-attachments/assets/a7c9f074-a61a-4f96-8bf4-f595df18f2f8)
# Notice
this project is under active development. Expect new versions DAILY.

# Reef Search

Reef Search is a zero-build, single-script-tag search overlay for static sites. It crawls your sitemap, extracts page headings and content, builds a local search index in the browser, and opens a keyboard-first overlay when visitors press Cmd/Ctrl+K.

## How it works

1. The script reads the sitemap from the page that loads it.
2. It fetches the linked pages and extracts their section headings and body text.
3. A local in-browser index is built so search stays on the visitor's device.
4. Pressing Cmd/Ctrl+K opens a modal overlay with instant results and keyboard navigation.

## Usage

Simply include this line in your code:

```html
<script type="module"> import reefSearch from 'https://cdn.jsdelivr.net/npm/reef-search@0.1.0/+esm' </script>
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

The generated bundle will be written to `dist/reef.min.js`.

## Development

Run the test suite with:

```bash
npm test
```
