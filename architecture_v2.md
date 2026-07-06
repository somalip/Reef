# Spotlight Search — Universal Indexing Extension

**Addendum to the base architecture (§1–§14). Extends the system from "search page text" to "search and act on everything on a website" — buttons, forms, media, structured data, and hidden/collapsed content — while preserving the zero-build, single-script-tag model.**

This document assumes the base spec as ground truth and only specifies deltas. Sections here are prefixed **A** and cross-reference the base spec's numbered sections where relevant.

---

## A1. Motivation

The base spec treats a page as a bag of headings and body text. A real Spotlight-like experience needs to surface and *act on* anything a user could otherwise only find by clicking around: nav buttons, a dark-mode toggle, accordion content collapsed behind a click, a contact form's fields, a linked PDF, a video's transcript. This addendum defines the taxonomy, extraction rules, execution model, and — critically — the safety boundary for letting search results *do things*, not just link to things.

**New goal:** the result list should mix "go here" (pages/sections) with "do this" (click, focus, toggle) the way macOS Spotlight mixes documents with app launches and quick actions.

**Still true (unchanged non-goals):** no semantic/vector search, no build step, no execution of arbitrary crawled JS, no cross-site search.

---

## A2. Entity Taxonomy

Base spec has one entity type: the **section document** (§5). This addendum adds five more. Every entity gets a `type` field so results can be grouped/iconified in the UI (§A7).

| Type | Source | Example | Result action |
|---|---|---|---|
| `section` (existing) | heading + body text | "Installation" heading | navigate + scroll |
| `action` | button / `role=button` / `input[type=button,submit]` | "Toggle dark mode" | synthetic click (§A5) |
| `field` | form input/textarea/select + its label | "Email address" input | navigate + focus |
| `link` | anchor not already inside a section's body | footer/nav links, external links | navigate |
| `file` | anchor pointing at a downloadable extension (pdf, zip, docx, csv…) | "2024-annual-report.pdf" | navigate (download) |
| `media` | video/audio/img with captions/transcript/alt | video with a `<track>` transcript | navigate + scroll; transcript text indexed as body |
| `structured` | JSON-LD / Open Graph / microdata | FAQ schema Q&A pair, Product price | navigate + scroll; each item its own indexable record |

Field weighting (extends base §5 table): `title > heading > action-label > structured-data > field-label > body > alt/transcript`.

---

## A3. Extraction Rules Per Type

### A3.1 Actions (buttons & clickables)
- Selectors: `button`, `[role="button"]`, `input[type="button"], input[type="submit"]`, `summary` (native disclosure), and anything with `data-spotlight-action="Label"`.
- Accessible name resolution order: `aria-label` → `aria-labelledby` → visible text content → `title` → skip (unlabeled buttons aren't indexed — nothing useful to show or say).
- Record: `{ label, selector/domPath, pageUrl, destructive: boolean }`.
- **`destructive` is opt-out, not opt-in-away:** a label matching a denylist of verbs (`delete`, `remove`, `cancel subscription`, `unsubscribe`, `pay`, `checkout`, `submit order`, `confirm`) is marked destructive by default (§A6) and excluded from direct execution.

### A3.2 Forms & fields
- Each `input`/`textarea`/`select` paired with its label via `<label for>`, wrapping `<label>`, `aria-label`, or `placeholder` (last resort, lowest weight).
- Indexed as `field` records scoped to the enclosing form's heading/section for breadcrumb context (e.g. `Contact > Message`).
- Result action is always **focus**, never fill or submit — see §A6.

### A3.3 Hidden & collapsed content
- Accordions, tabs, `<details>`/`<summary>`, anything toggled via `aria-expanded`/`hidden` — **index the content regardless of current visibility.** The text exists in fetched DOM even if CSS/JS hides it; this is one of the highest-value additions, since in-page find (Ctrl+F) already fails here.
- Selecting a result inside a collapsed panel must **expand it first** (dispatch a click on the associated toggle/summary) before scrolling — never just scroll to a hidden element.

### A3.4 Media
- `<img>`: `alt`, plus `figcaption` if wrapped in `<figure>`.
- `<video>`/`<audio>`: `title`, `aria-label`, and text tracks (`<track kind="captions|subtitles">` — fetch and parse the referenced `.vtt`, same-origin only, same fetch-as-text-never-execute rule as base §4).
- OCR of image content is explicitly out of scope (flagged as a v3-or-later limitation, not promised — see §A11).

### A3.5 Structured data
- Parse `<script type="application/ld+json">` and Open Graph/Twitter meta tags per page.
- `FAQPage` schema: each `Question`/`acceptedAnswer` pair becomes its own `structured` record — the single highest-leverage addition here, mirroring how macOS Spotlight surfaces a dictionary definition inline instead of just a document link.
- `Article`, `Product`, `HowTo`, `Event`: extract name/description/price/date as searchable, lower-weighted metadata attached to the page's top-level record.
- Malformed JSON-LD is skipped silently — never throw, never block indexing of the rest of the page.

### A3.6 Files & external links
- Anchors whose `href` extension matches a configurable list (default `pdf,doc,docx,xls,xlsx,ppt,pptx,zip,csv`) are indexed as `file` type with a distinct icon, wherever they appear in the DOM.
- Anchors to a different origin are indexed as `link` type with an "external" indicator; still zero levels deep (never fetched — base §4's no-CORS stance is unchanged).

---

## A4. New Component: Action Registry

Sits alongside the Search Engine (base §7) rather than replacing it — implementer's choice whether it's a separate FlexSearch index or one more `type`-filtered document set in the same index; default to the latter for simplicity.

Responsibilities:
- Holds every `action`/`field`/`media`/`structured` record plus a resolvable **locator**: for the *current* page, a live selector; for *other* pages, a `{ pageUrl, selectorHint }` pair that can't be resolved until that page loads.
- Exposes `resolve(record)`: on the current page, finds the live DOM node directly. On another page, queues a **deferred action** — stash the selector hint in `sessionStorage`, navigate, then on load the loader checks for a pending deferred action and executes it once the target page's DOM is ready (poll/`MutationObserver` for the selector, timeout ~3s, fail silently to a plain navigation if not found — never leave the user on a broken half-state).

---

## A5. Execution Model: Live vs. Cross-Page

Two distinct paths, since the base crawler never executes JS on fetched pages (base §4, §11) — that constraint doesn't change, so cross-page actions can never be pre-clicked. They're stored as labels + locator hints only, resolved on real DOM later.

**Current page** (user is already there):
- Result selection dispatches a synthetic `MouseEvent('click', { bubbles: true })` on the resolved element, or `.focus()` for fields.
- If the element can't be found (DOM changed since index build), fall back to a toast — "Couldn't find that on the page, it may have changed" — never a silent no-op.

**Other page:**
- Navigate to `pageUrl`, store the pending action, resolve + execute on load per §A4.
- If the action is `destructive` (§A6), skip auto-execution entirely — navigate and visually highlight the element instead, requiring the user's own click.

---

## A6. Safety Model (the part that actually matters)

Letting a search box click buttons on the user's behalf is powerful and dangerous if done naively. Rules, in priority order:

1. **Never auto-execute anything that mutates state, spends money, or is irreversible.** The denylist in §A3.1 is a floor, not a ceiling. Site owners can extend it via `data-exclude-action`, or mark an individual element explicitly safe via `data-spotlight-action="Toggle theme"` — an explicit label from the site owner is a stronger signal than a guessed one, so it can override the heuristic.
2. **Same-page instant execution is the only case where auto-click ever happens**, because the user is already looking at the consequence. Cross-page results always navigate-and-highlight (§A5) even when non-destructive.
3. **Forms are never filled or submitted programmatically.** Fields are search targets for *focus* only — full stop, no config flag to turn this on. This is a hard line, same category as base §11's "never `innerHTML` crawled content."
4. **No destructive-action allowlist can come from crawled HTML alone.** A page can't mark its own "Delete my account" button safe by embedding an attribute, because that data came from the same untrusted crawl. Safety-relevant config only comes from the *installing* script tag's own attributes — something the site owner controls directly at install time, never from arbitrary page content the crawler happens to fetch.

---

## A7. Result UI Changes (extends base §8)

- Results are grouped with a small type icon/label (Page, Section, Action, Field, File, Media, Answer) — closer to macOS Spotlight's category rows than a flat list.
- `structured`/FAQ results get an inline answer preview above the fold (the "instant answer" pattern), not just a snippet + link.
- `action` results show a small "↵ to run here" vs "↵ to go there" hint depending on same-page-executable vs cross-page-navigate-only, so the distinction from §A6 is visible to the user, not just silently different behavior.
- `aria-live` announcement (base §8) updates its phrasing per type ("3 pages, 2 actions, 1 answer found") so screen-reader users get the same category signal sighted users get visually.

---

## A8. Config API Additions (extends base §9)

| Attribute | Default | Purpose |
|---|---|---|
| `data-index-actions` | `true` | Master switch for buttons/actions indexing |
| `data-index-media` | `true` | Index alt text / transcripts / captions |
| `data-index-structured-data` | `true` | Parse JSON-LD / Open Graph / microdata |
| `data-index-hidden` | `true` | Index collapsed/hidden DOM content |
| `data-file-extensions` | `pdf,doc,docx,xls,xlsx,ppt,pptx,zip,csv` | Which link extensions count as `file` type |
| `data-exclude-action` | — | CSS selectors for buttons that must never be indexed as executable, regardless of label |
| `data-actions-mode` | `execute` | `execute` (default) vs `navigate-only` — a top-level kill switch for all auto-click behavior (see §A12) |
| `data-spotlight-action` *(element-level, not script-tag)* | — | Explicit accessible name + opt-in override for the §A6 rule-1 denylist |

---

## A9. Storage Schema Changes (extends base §6)

`pages[]` records grow additional arrays: `actions[]`, `fields[]`, `media[]`, `structured[]`, alongside the existing section text. Same version/TTL invalidation model — no new invalidation logic needed, just a wider payload per page. Re-check the 5MB memory-only fallback cap (base §6): sites rich in actions/structured records will hit it sooner, so this addendum lowers the *effective* page-count ceiling for on-disk caching, not the code path itself.

---

## A10. Performance Budget Impact

- Extra extraction work stays bounded by the same idle-scheduling model (base §11) — no new main-thread risk, just more Worker time per page.
- Keep the four new `data-index-*` switches **on by default**, but document that an unusually button/form-dense static page (an admin dashboard rendered as static HTML, say) should turn indexing granularity down explicitly rather than have the loader silently truncate — opt-out over silent degradation.
- No change to the ≤20kb loader budget (base §10); extraction logic ships inside the already-lazy-loaded indexing bundle, not the critical-path loader.

---

## A11. Known Limitations (extends base §12)

- **OCR / image content understanding:** out of scope through v2 as well as v1 — flagged as a hypothetical future item, not promised anywhere on the roadmap.
- **JS-computed accessible names** (a button whose label is set by a framework after hydration) are invisible to the fetch-only crawler for *other* pages — same root cause as the base spec's SPA limitation (§12). Only the current, live page gets full accuracy here.
- **Deferred cross-page actions are best-effort:** the 3-second resolve timeout (§A4) means a slow-loading target page can silently fall back to plain navigation — a deliberate trade favoring "never hang" over "always execute."

---

## A12. Open Questions (flag back, don't block on)

- Should `structured`/FAQ answer-style results ever rank above `section` results on an equal text match, the way Spotlight prioritizes a calculator/definition hit over a document hit?
- Is the `data-actions-mode="navigate-only"` kill switch (§A8) sufficient for security-conscious site owners who want search but zero click-on-my-behalf behavior, or should it be the *default* rather than opt-in?
- Should an explicit `data-spotlight-action` label be allowed to override the destructive denylist even when the label itself contains a denylisted verb (e.g. a genuinely safe "Delete draft" in a scratch-notes app)? Leaning yes per §A6 rule 1 — flagging since it's the one place this spec lets an opt-in override a safety heuristic.

---

## A13. Build Phase Additions (extends base §14)

8. Action/field/media/structured extractors (§A3) — console-only, added as new record types alongside existing section documents.
9. Action Registry + live-DOM resolve/execute path (§A4–§A5), current-page only first.
10. Destructive-action denylist + `data-spotlight-action` override wiring (§A6) — **before** any auto-execute UI ships, not after.
11. Deferred cross-page action flow (sessionStorage handoff + `MutationObserver` resolve).
12. UI: category grouping, instant-answer preview, "run here" vs "go there" hint (§A7).
13. Structured-data parsing (JSON-LD/OG) + FAQ instant-answer path.
14. Full-taxonomy pass on the fixture site — it needs buttons, a form, an accordion, a captioned video, and FAQ schema added for real test coverage.