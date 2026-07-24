"use strict";
(() => {
  // plugin/src/spotlight.ts
  var HOST_ID = "reef-spotlight-host";
  var MAX_ROWS_DEFAULT = 50;
  var DEBOUNCE_DEFAULT = 80;
  var MAX_RECENTS_DEFAULT = 8;
  var STYLES = `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }

.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 17, 21, 0.42);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  z-index: 2147483647;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 14vh;
  animation: reef-spotlight-fade 120ms ease-out;
}
.card {
  width: min(640px, 92vw);
  max-height: min(560px, 70vh);
  background: #ffffff;
  color: #111111;
  border-radius: 14px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.32), 0 4px 12px rgba(0, 0, 0, 0.18);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: reef-spotlight-slide 140ms cubic-bezier(0.2, 0.8, 0.2, 1);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
}
.input-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px;
  border-bottom: 1px solid #ececec;
}
.input-row .glyph {
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  color: #6b7280;
}
.input-row input {
  flex: 1 1 auto;
  font-size: 18px;
  line-height: 24px;
  border: none;
  outline: none;
  background: transparent;
  color: inherit;
  font-family: inherit;
  min-width: 0;
}
.input-row input::placeholder { color: #9ca3af; }
.input-row .esc {
  font-size: 11px;
  color: #6b7280;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
  padding: 1px 6px;
  background: #fafafa;
  user-select: none;
}
.results {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 6px 0;
  scrollbar-width: thin;
}
.empty {
  padding: 28px 20px;
  text-align: center;
  color: #6b7280;
  font-size: 14px;
  line-height: 1.5;
}
.empty .suggestion {
  color: #2563eb;
  font-weight: 600;
  text-decoration: underline;
  cursor: pointer;
}
.empty .suggestion:hover { color: #1d4ed8; }
.row {
  display: grid;
  grid-template-columns: 18px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  cursor: pointer;
  border-left: 2px solid transparent;
  user-select: none;
}
.row[aria-selected="true"] {
  background: #f3f4f6;
  border-left-color: #111111;
}
.row .favicon {
  width: 16px;
  height: 16px;
  border-radius: 2px;
  background: #f3f4f6;
  object-fit: contain;
}
.row .main { min-width: 0; }
.row .title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.3;
  color: #111111;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.row .title mark {
  background: #fde68a;
  color: inherit;
  padding: 0 1px;
  border-radius: 2px;
}
.row .url {
  font-size: 12px;
  color: #6b7280;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 1px;
}
.row .match {
  font-size: 11px;
  color: #6b7280;
  max-width: 180px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 14px;
  border-top: 1px solid #ececec;
  font-size: 11px;
  color: #6b7280;
  background: #fafafa;
}
.footer .hints { display: flex; gap: 10px; flex-wrap: wrap; }
.footer .hint kbd {
  font-family: inherit;
  font-size: 10px;
  border: 1px solid #e5e7eb;
  background: #ffffff;
  border-radius: 3px;
  padding: 0 4px;
  margin-right: 2px;
}
.footer .brand { font-weight: 600; color: #111111; }
.section-header {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: #9ca3af;
  padding: 8px 16px 4px;
  user-select: none;
}
.autocorrect-banner {
  padding: 8px 16px;
  font-size: 12px;
  color: #6b7280;
  background: #fefce8;
  border-bottom: 1px solid #fde68a;
}
.autocorrect-banner strong { color: #111111; }
.autocorrect-banner .autocorrect-orig {
  color: #2563eb;
  text-decoration: none;
  cursor: pointer;
}
.autocorrect-banner .autocorrect-orig:hover { text-decoration: underline; }
.row-site .site-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
  background: #f3f4f6;
  border-radius: 2px;
}
.row-site .site-icon svg { stroke: #6366f1; }
.row-action { opacity: 0.85; }
.row-action:hover { opacity: 1; }
.row-action .action-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f0fdf4;
  border-radius: 2px;
}
.row-action .action-icon svg { stroke: #16a34a; }
.row-action .action-title { font-style: italic; }
.row-action .action-badge {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #16a34a;
  font-weight: 600;
}
.row-browser-action .action-icon { background: #eff6ff; }
.row-browser-action .action-icon svg { stroke: #2563eb; }
.row-browser-action .action-badge { color: #2563eb; }
.row-bookmark .action-icon { background: #fffbeb; }
.row-bookmark .action-icon svg { stroke: #d97706; }
.row-bookmark .action-badge { color: #d97706; }
.row-history .action-icon { background: #f5f3ff; }
.row-history .action-icon svg { stroke: #7c3aed; }
.row-history .action-badge { color: #7c3aed; }
.row-download .action-icon { background: #f0fdfa; }
.row-download .action-icon svg { stroke: #0d9488; }
.row-download .action-badge { color: #0d9488; }

.reef-suggestion-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: center;
  margin-top: 8px;
}
.reef-suggestion-chip {
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 12px;
  border: 1px solid #e5e7eb;
  background: #fafafa;
  color: #6b7280;
  cursor: pointer;
}
.reef-suggestion-chip:hover { background: #f3f4f6; }

/* Dark theme */
:host([data-theme="dark"]) .card { background: #1f2024; color: #e7e7ea; box-shadow: 0 24px 64px rgba(0, 0, 0, 0.55), 0 4px 12px rgba(0, 0, 0, 0.35); }
:host([data-theme="dark"]) .input-row { border-bottom-color: #2c2d31; }
:host([data-theme="dark"]) .input-row .glyph,
:host([data-theme="dark"]) .input-row input::placeholder,
:host([data-theme="dark"]) .row .url,
:host([data-theme="dark"]) .row .match,
:host([data-theme="dark"]) .footer { color: #a1a1aa; }
:host([data-theme="dark"]) .input-row .esc { background: #2c2d31; border-color: #3a3b40; color: #a1a1aa; }
:host([data-theme="dark"]) .row[aria-selected="true"] { background: #2c2d31; border-left-color: #ffffff; }
:host([data-theme="dark"]) .row .title { color: #e7e7ea; }
:host([data-theme="dark"]) .row .favicon { background: #2c2d31; }
:host([data-theme="dark"]) .row .title mark { background: #facc15; color: #111111; }
:host([data-theme="dark"]) .footer { background: #161719; border-top-color: #2c2d31; }
:host([data-theme="dark"]) .footer .hint kbd { background: #2c2d31; border-color: #3a3b40; color: #e7e7ea; }
:host([data-theme="dark"]) .empty .suggestion { color: #60a5fa; }
:host([data-theme="dark"]) .empty .suggestion:hover { color: #93bbfd; }
:host([data-theme="dark"]) .section-header { color: #71717a; }
:host([data-theme="dark"]) .autocorrect-banner { background: #422006; border-bottom-color: #854d0e; color: #a1a1aa; }
:host([data-theme="dark"]) .autocorrect-banner strong { color: #e7e7ea; }
:host([data-theme="dark"]) .autocorrect-banner .autocorrect-orig { color: #60a5fa; }
:host([data-theme="dark"]) .row-site .site-icon { background: #2c2d31; }
:host([data-theme="dark"]) .row-action .action-icon { background: #1a2e1a; }
:host([data-theme="dark"]) .row-action .action-badge { color: #4ade80; }
:host([data-theme="dark"]) .row-browser-action .action-icon { background: #172554; }
:host([data-theme="dark"]) .row-browser-action .action-badge { color: #93bbfd; }
:host([data-theme="dark"]) .reef-suggestion-chip { background: #27272a; border-color: #3f3f46; color: #a1a1aa; }

@keyframes reef-spotlight-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes reef-spotlight-slide { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) {
  .backdrop, .card { animation: none; }
}
`;
  function defaultSendMessage(msg) {
    return new Promise((resolve) => {
      try {
        const result = globalThis.chrome?.runtime?.sendMessage(msg, (res) => resolve(res));
        if (result && typeof result.then === "function") {
          result.then(resolve, () => resolve(void 0));
        }
      } catch {
        resolve(void 0);
      }
    });
  }
  async function getStoredTheme() {
    try {
      const chrome2 = globalThis.chrome;
      if (chrome2?.storage?.local?.get) {
        const data = await new Promise((resolve) => {
          chrome2.storage.local.get(["theme"], (d) => resolve(d));
        });
        const t = data?.theme;
        if (t === "light" || t === "dark" || t === "system") return t;
      }
    } catch {
    }
    return "system";
  }
  async function getSearchEngine() {
    try {
      const chrome2 = globalThis.chrome;
      if (chrome2?.storage?.local?.get) {
        const data = await new Promise((resolve) => {
          chrome2.storage.local.get(["searchEngine", "customSearchUrl"], (d) => resolve(d));
        });
        const engine = data?.searchEngine || "google";
        return resolveSearchEngine(engine, data?.customSearchUrl);
      }
    } catch {
    }
    return resolveSearchEngine("google");
  }
  function resolveSearchEngine(id, customUrl) {
    const engines = {
      google: { name: "Google", urlTemplate: "https://www.google.com/search?q={query}" },
      bing: { name: "Bing", urlTemplate: "https://www.bing.com/search?q={query}" },
      duckduckgo: { name: "DuckDuckGo", urlTemplate: "https://duckduckgo.com/?q={query}" },
      brave: { name: "Brave", urlTemplate: "https://search.brave.com/search?q={query}" },
      ecosia: { name: "Ecosia", urlTemplate: "https://www.ecosia.org/search?q={query}" },
      kagi: { name: "Kagi", urlTemplate: "https://kagi.com/search?q={query}" },
      custom: { name: "Custom", urlTemplate: customUrl || "https://www.google.com/search?q={query}" }
    };
    const found = engines[id] || engines.google;
    return { id, name: found.name, urlTemplate: found.urlTemplate };
  }
  function resolveTheme(t) {
    if (t === "system") {
      try {
        return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      } catch {
        return "light";
      }
    }
    return t;
  }
  function hostFromUrl(url) {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  }
  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function highlight(text, query) {
    if (!query) return escapeHtml(text);
    const safe = escapeHtml(text);
    const q = escapeHtml(query);
    try {
      const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig");
      return safe.replace(re, "<mark>$1</mark>");
    } catch {
      return safe;
    }
  }
  function truncate(s, n) {
    if (s.length <= n) return s;
    return s.slice(0, n - 1) + "\u2026";
  }
  var FALLBACK_FAVICON = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><circle cx='8' cy='8' r='6' fill='none' stroke='%23999' stroke-width='1.4'/><path d='M2 8h12M8 2c2.5 2.5 2.5 9.5 0 12M8 2c-2.5 2.5-2.5 9.5 0 12' fill='none' stroke='%23999' stroke-width='1.4'/></svg>";
  function scoreBrowserAction(label, q) {
    if (!q) return 0;
    const l = label.toLowerCase();
    const lowerQ = q.toLowerCase();
    const words = lowerQ.split(/\s+/).filter(Boolean);
    let score = 0;
    if (l === lowerQ) score += 50;
    else if (l.startsWith(lowerQ)) score += 30;
    else if (l.includes(lowerQ)) score += 15;
    for (const w of words) {
      if (l.includes(w)) score += 5;
    }
    return score;
  }
  function looksLikeUrl(q) {
    return /^(https?:\/\/|www\.)/i.test(q) || /^[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(q) && q.includes(".");
  }
  function createSpotlight(opts = {}) {
    const maxRows = opts.maxRows ?? MAX_ROWS_DEFAULT;
    const debounceMs = opts.debounceMs ?? DEBOUNCE_DEFAULT;
    const maxRecents = opts.maxRecents ?? MAX_RECENTS_DEFAULT;
    const send = opts.sendMessage ?? defaultSendMessage;
    let host = null;
    let shadow = null;
    let card = null;
    let input = null;
    let results = null;
    let footer = null;
    let mounted = false;
    let open = false;
    let currentResults = [];
    let unifiedResults = [];
    let currentQuery = "";
    let currentSuggestion;
    let currentSiteResults = [];
    let currentActions = [];
    let currentAutocorrected = false;
    let currentReefSuggestions = [];
    let selectedIndex = 0;
    let perTabMatchIndex = /* @__PURE__ */ new Map();
    let debounceHandle = null;
    let lastQueryKey = "\0never-queried\0";
    let inFlight = 0;
    const browserActions = [
      { type: "browser-action", title: "Mute/unmute current tab", payload: "mute-tab" },
      { type: "browser-action", title: "Pin/unpin current tab", payload: "pin-tab" },
      { type: "browser-action", title: "Duplicate current tab", payload: "duplicate-tab" },
      { type: "browser-action", title: "Reload current tab", payload: "reload-tab" },
      { type: "browser-action", title: "Close all other tabs", payload: "close-other-tabs" },
      { type: "browser-action", title: "Focus mode (close other tabs)", payload: "focus-mode" },
      { type: "browser-action", title: "Save all open tabs as session", payload: "save-session" },
      { type: "browser-action", title: "Bookmark current page", payload: "bookmark-page" },
      { type: "browser-action", title: "Remove bookmark for current page", payload: "remove-bookmark" },
      { type: "browser-action", title: "Close current tab", payload: "close-tab" },
      { type: "browser-action", title: "Reopen closed tab", payload: "reopen-closed-tab" },
      { type: "browser-action", title: "Go back", payload: "go-back" },
      { type: "browser-action", title: "Go forward", payload: "go-forward" },
      { type: "browser-action", title: "Toggle fullscreen", payload: "toggle-fullscreen" },
      { type: "browser-action", title: "Open new tab", payload: "new-tab" },
      { type: "browser-action", title: "Open new window", payload: "new-window" },
      { type: "browser-action", title: "Open incognito window", payload: "new-incognito" },
      { type: "browser-action", title: "Zoom in", payload: "zoom-in" },
      { type: "browser-action", title: "Zoom out", payload: "zoom-out" },
      { type: "browser-action", title: "Reset zoom", payload: "zoom-reset" },
      { type: "browser-action", title: "Print page", payload: "print-page" },
      { type: "browser-action", title: "Save page", payload: "save-page" }
    ];
    function mount() {
      if (mounted) return;
      host = document.createElement("div");
      host.id = HOST_ID;
      host.style.position = "fixed";
      host.style.inset = "0";
      host.style.zIndex = "2147483647";
      host.style.display = "none";
      shadow = host.attachShadow({ mode: "open" });
      const style = document.createElement("style");
      style.textContent = STYLES;
      shadow.appendChild(style);
      const backdrop = document.createElement("div");
      backdrop.className = "backdrop";
      backdrop.addEventListener("mousedown", (e) => {
        if (e.target === backdrop) hide();
      });
      card = document.createElement("div");
      card.className = "card";
      card.setAttribute("role", "dialog");
      card.setAttribute("aria-label", "Reef Spotlight");
      card.addEventListener("mousedown", (e) => e.stopPropagation());
      const inputRow = document.createElement("div");
      inputRow.className = "input-row";
      const glyph = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      glyph.setAttribute("class", "glyph");
      glyph.setAttribute("viewBox", "0 0 20 20");
      glyph.setAttribute("fill", "none");
      glyph.setAttribute("stroke", "currentColor");
      glyph.setAttribute("stroke-width", "2");
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", "9");
      circle.setAttribute("cy", "9");
      circle.setAttribute("r", "6");
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", "13.5");
      line.setAttribute("y1", "13.5");
      line.setAttribute("x2", "18");
      line.setAttribute("y2", "18");
      line.setAttribute("stroke-linecap", "round");
      glyph.appendChild(circle);
      glyph.appendChild(line);
      inputRow.appendChild(glyph);
      input = document.createElement("input");
      input.type = "text";
      input.placeholder = "Search tabs, bookmarks, history & browser actions\u2026";
      input.autocomplete = "off";
      input.spellcheck = false;
      input.setAttribute("aria-label", "Search tabs, bookmarks, history and browser actions");
      input.setAttribute("aria-autocomplete", "list");
      input.setAttribute("aria-controls", "reef-spotlight-results");
      input.addEventListener("input", onInput);
      input.addEventListener("keydown", onKeyDown);
      inputRow.appendChild(input);
      const esc = document.createElement("span");
      esc.className = "esc";
      esc.textContent = "esc";
      inputRow.appendChild(esc);
      results = document.createElement("div");
      results.className = "results";
      results.id = "reef-spotlight-results";
      results.setAttribute("role", "listbox");
      results.setAttribute("aria-label", "Results");
      results.addEventListener("mousedown", (e) => {
        const target = e.target;
        const row = target.closest(".row");
        if (!row) return;
        e.preventDefault();
        const idx = Number(row.dataset.index);
        if (Number.isFinite(idx)) {
          selectedIndex = idx;
          applySelection();
          openSelected();
        }
      });
      footer = document.createElement("div");
      footer.className = "footer";
      const hints = document.createElement("span");
      hints.className = "hints";
      hints.innerHTML = '<span class="hint"><kbd>\u2191</kbd><kbd>\u2193</kbd>navigate</span><span class="hint"><kbd>\u21B5</kbd>open</span><span class="hint"><kbd>esc</kbd>close</span><span class="hint"><kbd>tab</kbd>cycle matches</span><span class="hint"><kbd>Ctrl</kbd>+<kbd>1\u20139</kbd>jump</span>';
      footer.appendChild(hints);
      const brand = document.createElement("span");
      brand.className = "brand";
      brand.textContent = "Reef Spotlight";
      footer.appendChild(brand);
      card.appendChild(inputRow);
      card.appendChild(results);
      card.appendChild(footer);
      backdrop.appendChild(card);
      shadow.appendChild(backdrop);
      host.addEventListener(
        "keydown",
        (e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            hide();
          }
        },
        true
      );
      document.documentElement.appendChild(host);
      mounted = true;
    }
    function setSelected(idx, scroll = false) {
      if (!results) return;
      if (unifiedResults.length === 0) {
        selectedIndex = 0;
        return;
      }
      if (idx < 0) idx = unifiedResults.length - 1;
      if (idx >= unifiedResults.length) idx = 0;
      selectedIndex = idx;
      applySelection(scroll);
    }
    function applySelection(scroll = false) {
      if (!results) return;
      const rows = results.querySelectorAll(".row");
      rows.forEach((r) => r.setAttribute("aria-selected", "false"));
      const sel = rows[selectedIndex];
      if (sel) {
        sel.setAttribute("aria-selected", "true");
        if (scroll && typeof sel.scrollIntoView === "function") {
          try {
            sel.scrollIntoView({ block: "nearest" });
          } catch {
          }
        }
      }
    }
    function renderSectionHeader(parent, label) {
      const header = document.createElement("div");
      header.className = "section-header";
      header.textContent = label;
      parent.appendChild(header);
    }
    function createTabRow(item, query, idx) {
      const row = document.createElement("div");
      row.className = "row";
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", idx === selectedIndex ? "true" : "false");
      row.dataset.index = String(idx);
      row.dataset.tabId = String(item.tabId);
      row.dataset.windowId = String(item.windowId);
      row.title = item.title;
      const fav = document.createElement("img");
      fav.className = "favicon";
      fav.alt = "";
      fav.width = 16;
      fav.height = 16;
      fav.src = item.favIconUrl || FALLBACK_FAVICON;
      fav.addEventListener(
        "error",
        () => {
          fav.src = FALLBACK_FAVICON;
        },
        { once: true }
      );
      row.appendChild(fav);
      const main = document.createElement("div");
      main.className = "main";
      const title = document.createElement("div");
      title.className = "title";
      title.innerHTML = highlight(truncate(item.title, 60), query);
      const url = document.createElement("div");
      url.className = "url";
      url.textContent = hostFromUrl(item.url);
      main.appendChild(title);
      main.appendChild(url);
      row.appendChild(main);
      const match = item.matchedRecords?.[perTabMatchIndex.get(item.tabId) ?? 0];
      if (match && (match.headingText || match.bodyText)) {
        const snippet = document.createElement("div");
        snippet.className = "match";
        const text = (match.headingText ? match.headingText + " \u2014 " : "") + (match.bodyText || "");
        snippet.textContent = truncate(text, 90);
        row.appendChild(snippet);
      } else {
        const placeholder = document.createElement("div");
        row.appendChild(placeholder);
      }
      return row;
    }
    function createSiteRow(sr, query, idx) {
      const row = document.createElement("div");
      row.className = "row row-site";
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", idx === selectedIndex ? "true" : "false");
      row.dataset.index = String(idx);
      row.title = sr.headingText;
      const icon = document.createElement("div");
      icon.className = "favicon site-icon";
      icon.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c2 2.5 2 9.5 0 12M8 2c-2 2.5-2 9.5 0 12"/></svg>';
      row.appendChild(icon);
      const main = document.createElement("div");
      main.className = "main";
      const title = document.createElement("div");
      title.className = "title";
      title.innerHTML = highlight(truncate(sr.headingText, 60), query);
      const url = document.createElement("div");
      url.className = "url";
      url.textContent = sr.sourceOrigin;
      main.appendChild(title);
      main.appendChild(url);
      row.appendChild(main);
      const snippet = document.createElement("div");
      snippet.className = "match";
      snippet.textContent = truncate(sr.bodyText, 90);
      row.appendChild(snippet);
      return row;
    }
    function createActionRow(action, idx, variant = "action") {
      const row = document.createElement("div");
      row.className = `row row-${variant}`;
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", idx === selectedIndex ? "true" : "false");
      row.dataset.index = String(idx);
      row.title = action.title;
      const icon = document.createElement("div");
      icon.className = "favicon action-icon";
      if (action.type === "search-web") {
        icon.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="5"/><line x1="11" y1="11" x2="15" y2="15" stroke-linecap="round"/></svg>';
      } else {
        icon.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4"/></svg>';
      }
      row.appendChild(icon);
      const main = document.createElement("div");
      main.className = "main";
      const title = document.createElement("div");
      title.className = "title action-title";
      title.textContent = action.title;
      main.appendChild(title);
      row.appendChild(main);
      const badge = document.createElement("div");
      badge.className = "match action-badge";
      badge.textContent = variant === "browser-action" ? "action" : "new tab";
      row.appendChild(badge);
      return row;
    }
    function createBookmarkRow(bm, query, idx) {
      const row = document.createElement("div");
      row.className = "row row-bookmark";
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", idx === selectedIndex ? "true" : "false");
      row.dataset.index = String(idx);
      row.title = bm.title || bm.url || "";
      const icon = document.createElement("div");
      icon.className = "favicon action-icon";
      icon.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 2h8a1 1 0 0 1 1 1v11l-5-3-5 3V3a1 1 0 0 1 1-1z"/></svg>';
      row.appendChild(icon);
      const main = document.createElement("div");
      main.className = "main";
      const title = document.createElement("div");
      title.className = "title";
      title.innerHTML = highlight(truncate(bm.title || bm.url || "", 60), query);
      const url = document.createElement("div");
      url.className = "url";
      url.textContent = hostFromUrl(bm.url || "");
      main.appendChild(title);
      main.appendChild(url);
      row.appendChild(main);
      const badge = document.createElement("div");
      badge.className = "match action-badge";
      badge.textContent = "bookmark";
      row.appendChild(badge);
      return row;
    }
    function createHistoryRow(h, query, idx) {
      const row = document.createElement("div");
      row.className = "row row-history";
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", idx === selectedIndex ? "true" : "false");
      row.dataset.index = String(idx);
      row.title = h.title || h.url || "";
      const icon = document.createElement("div");
      icon.className = "favicon action-icon";
      icon.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M8 4v4l3 2" stroke-linecap="round"/></svg>';
      row.appendChild(icon);
      const main = document.createElement("div");
      main.className = "main";
      const title = document.createElement("div");
      title.className = "title";
      title.innerHTML = highlight(truncate(h.title || h.url || "", 60), query);
      const url = document.createElement("div");
      url.className = "url";
      url.textContent = hostFromUrl(h.url || "");
      main.appendChild(title);
      main.appendChild(url);
      row.appendChild(main);
      const badge = document.createElement("div");
      badge.className = "match action-badge";
      badge.textContent = "history";
      row.appendChild(badge);
      return row;
    }
    function createDownloadRow(d, query, idx) {
      const filename = d.filename ? d.filename.split(/[/\\]/).pop() : "Unknown file";
      const row = document.createElement("div");
      row.className = "row row-download";
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", idx === selectedIndex ? "true" : "false");
      row.dataset.index = String(idx);
      row.title = filename;
      const icon = document.createElement("div");
      icon.className = "favicon action-icon";
      icon.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 1v8m0 0 3-3m-3 3-3-3"/><path d="M2 11v2a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-2"/></svg>';
      row.appendChild(icon);
      const main = document.createElement("div");
      main.className = "main";
      const title = document.createElement("div");
      title.className = "title";
      title.innerHTML = highlight(truncate(filename, 60), query);
      const url = document.createElement("div");
      url.className = "url";
      url.textContent = d.state || "";
      main.appendChild(title);
      main.appendChild(url);
      row.appendChild(main);
      const badge = document.createElement("div");
      badge.className = "match action-badge";
      badge.textContent = "download";
      row.appendChild(badge);
      return row;
    }
    function renderResults(items, query, suggestion, autocorrected, siteResults, actions, reefSuggestions, bookmarks, historyItems, downloads) {
      if (!results) return;
      currentResults = items;
      unifiedResults = [];
      selectedIndex = 0;
      results.replaceChildren();
      const hasAny = items.length > 0 || siteResults.length > 0 || actions.length > 0 || bookmarks.length > 0 || historyItems.length > 0 || downloads.length > 0;
      if (!hasAny) {
        const empty = document.createElement("div");
        empty.className = "empty";
        if (suggestion && suggestion !== query.toLowerCase() && !autocorrected) {
          empty.innerHTML = `No matching tabs found. Did you mean <a class="suggestion" href="#">${escapeHtml(suggestion)}</a>?`;
          const link = empty.querySelector(".suggestion");
          if (link) {
            link.addEventListener("click", (e) => {
              e.preventDefault();
              if (input) {
                input.value = suggestion;
                currentQuery = suggestion;
                onInput();
              }
            });
          }
        } else {
          empty.textContent = query ? "No results. Try a web search below." : "Start typing to search every open tab.";
        }
        if (reefSuggestions.length > 0) {
          const chips = document.createElement("div");
          chips.className = "reef-suggestion-chips";
          for (const s of reefSuggestions) {
            const chip = document.createElement("button");
            chip.className = "reef-suggestion-chip";
            chip.textContent = s;
            chip.addEventListener("click", () => {
              if (input) {
                input.value = s;
                currentQuery = s;
                onInput();
              }
            });
            chips.appendChild(chip);
          }
          empty.appendChild(chips);
        }
        if (actions.length > 0) {
          const frag = document.createDocumentFragment();
          renderSectionHeader(frag, "Search");
          for (const action of actions) {
            const idx = unifiedResults.length;
            unifiedResults.push({ kind: "action", data: action });
            frag.appendChild(createActionRow(action, idx));
          }
          results.appendChild(frag);
        }
        results.appendChild(empty);
        return;
      }
      const fragment = document.createDocumentFragment();
      if (autocorrected && suggestion) {
        const banner = document.createElement("div");
        banner.className = "autocorrect-banner";
        banner.innerHTML = `Showing results for <strong>${escapeHtml(suggestion)}</strong> &mdash; <a class="autocorrect-orig" href="#">search for "${escapeHtml(query)}" instead</a>`;
        const origLink = banner.querySelector(".autocorrect-orig");
        if (origLink) {
          origLink.addEventListener("click", (e) => {
            e.preventDefault();
            lastQueryKey = "\0force-requery\0";
            if (input) {
              input.value = query;
              currentQuery = query;
              onInput();
            }
          });
        }
        fragment.appendChild(banner);
      }
      if (actions.length > 0) {
        renderSectionHeader(fragment, "Search");
        for (const action of actions) {
          const idx = unifiedResults.length;
          unifiedResults.push({ kind: "action", data: action });
          fragment.appendChild(createActionRow(action, idx));
        }
      }
      const scoredBrowserActions = query ? browserActions.map((a) => ({ action: a, score: scoreBrowserAction(a.title, query) })).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 6) : [];
      if (scoredBrowserActions.length > 0) {
        renderSectionHeader(fragment, "Browser Actions");
        for (const { action } of scoredBrowserActions) {
          const idx = unifiedResults.length;
          unifiedResults.push({ kind: "browser-action", data: action });
          fragment.appendChild(createActionRow(action, idx, "browser-action"));
        }
      }
      if (items.length > 0) {
        renderSectionHeader(fragment, "Tabs");
        const renderCount = Math.min(items.length, maxRows);
        for (let i = 0; i < renderCount; i++) {
          const item = items[i];
          const idx = unifiedResults.length;
          unifiedResults.push({ kind: "tab", data: item });
          fragment.appendChild(createTabRow(item, query, idx));
        }
      }
      if (bookmarks.length > 0) {
        renderSectionHeader(fragment, "Bookmarks");
        for (const bm of bookmarks.slice(0, 10)) {
          const idx = unifiedResults.length;
          unifiedResults.push({ kind: "bookmark", data: bm });
          fragment.appendChild(createBookmarkRow(bm, query, idx));
        }
      }
      if (historyItems.length > 0) {
        renderSectionHeader(fragment, "History");
        for (const h of historyItems.slice(0, 10)) {
          const idx = unifiedResults.length;
          unifiedResults.push({ kind: "history", data: h });
          fragment.appendChild(createHistoryRow(h, query, idx));
        }
      }
      if (downloads.length > 0) {
        renderSectionHeader(fragment, "Downloads");
        for (const d of downloads.slice(0, 10)) {
          const idx = unifiedResults.length;
          unifiedResults.push({ kind: "download", data: d });
          fragment.appendChild(createDownloadRow(d, query, idx));
        }
      }
      if (siteResults.length > 0) {
        renderSectionHeader(fragment, "Site Content");
        for (const sr of siteResults) {
          const idx = unifiedResults.length;
          unifiedResults.push({ kind: "site", data: sr });
          fragment.appendChild(createSiteRow(sr, query, idx));
        }
      }
      results.appendChild(fragment);
      applySelection();
    }
    function renderRecents(items) {
      if (!results) return;
      currentResults = items.map((r) => ({
        tabId: -1,
        windowId: -1,
        title: r.title,
        url: r.url,
        favIconUrl: r.favicon,
        score: 0,
        matchedRecords: []
      }));
      unifiedResults = [];
      selectedIndex = 0;
      results.replaceChildren();
      if (items.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "Start typing to search every open tab.";
        results.appendChild(empty);
        return;
      }
      const fragment = document.createDocumentFragment();
      items.forEach((r, i) => {
        const row = document.createElement("div");
        row.className = "row";
        row.setAttribute("role", "option");
        row.setAttribute("aria-selected", i === 0 ? "true" : "false");
        row.dataset.index = String(i);
        row.dataset.recent = "1";
        row.title = r.title;
        const fav = document.createElement("img");
        fav.className = "favicon";
        fav.alt = "";
        fav.width = 16;
        fav.height = 16;
        fav.src = r.favicon || FALLBACK_FAVICON;
        fav.addEventListener(
          "error",
          () => {
            fav.src = FALLBACK_FAVICON;
          },
          { once: true }
        );
        row.appendChild(fav);
        const main = document.createElement("div");
        main.className = "main";
        const title = document.createElement("div");
        title.className = "title";
        title.textContent = truncate(r.title, 60);
        const url = document.createElement("div");
        url.className = "url";
        url.textContent = hostFromUrl(r.url);
        main.appendChild(title);
        main.appendChild(url);
        row.appendChild(main);
        const tag = document.createElement("div");
        tag.className = "match";
        tag.textContent = "recent";
        row.appendChild(tag);
        fragment.appendChild(row);
      });
      results.appendChild(fragment);
    }
    async function runQuery(query) {
      const key = query.trim();
      if (key === lastQueryKey) return;
      lastQueryKey = key;
      perTabMatchIndex = /* @__PURE__ */ new Map();
      if (!key) {
        currentSuggestion = void 0;
        currentSiteResults = [];
        currentActions = [];
        currentAutocorrected = false;
        const recents = await fetchRecents();
        renderRecents(recents);
        return;
      }
      const engine = await getSearchEngine();
      const reqId = ++inFlight;
      const res = await send({ type: "SPOTLIGHT_SEARCH", query: key, limit: maxRows });
      if (reqId !== inFlight) return;
      const items = res && res.success && Array.isArray(res.items) ? res.items : [];
      currentSuggestion = res && res.suggestion;
      currentAutocorrected = !!(res && res.autocorrected);
      currentSiteResults = res && Array.isArray(res.siteResults) ? res.siteResults : [];
      currentActions = [];
      if (looksLikeUrl(key)) {
        let navUrl = key;
        if (!/^https?:\/\//i.test(navUrl)) navUrl = "https://" + navUrl;
        currentActions.push({ type: "open-url", title: `Open ${navUrl}`, url: navUrl });
      }
      currentActions.push({
        type: "search-web",
        title: `Search ${engine.name} for "${key}"`,
        url: engine.urlTemplate.replace("{query}", encodeURIComponent(key))
      });
      const [bookmarks, historyItems, downloads] = await Promise.all([
        searchBookmarks(key),
        searchHistory(key),
        searchDownloads(key)
      ]);
      currentReefSuggestions = items.length === 0 ? [] : [];
      renderResults(
        items,
        key,
        currentSuggestion,
        currentAutocorrected,
        currentSiteResults,
        currentActions,
        currentReefSuggestions,
        bookmarks,
        historyItems,
        downloads
      );
    }
    async function fetchRecents() {
      try {
        const res = await send({ type: "LIBRARY_RECENTS_LIST" });
        const list = res && res.success && Array.isArray(res.items) ? res.items : [];
        return list.slice(0, maxRecents).map((r) => ({
          url: r.url,
          title: r.title,
          favicon: r.favicon,
          visitedAt: r.visitedAt ?? 0
        }));
      } catch {
        return [];
      }
    }
    async function searchBookmarks(query) {
      try {
        if (!globalThis.chrome?.bookmarks?.search) return [];
        return await new Promise((resolve) => {
          chrome.bookmarks.search(query, (results2) => resolve(results2 || []));
        });
      } catch {
        return [];
      }
    }
    async function searchHistory(query) {
      try {
        if (!globalThis.chrome?.history?.search) return [];
        return await new Promise((resolve) => {
          chrome.history.search(
            { text: query, maxResults: 20, startTime: Date.now() - 30 * 864e5 },
            (results2) => resolve(results2 || [])
          );
        });
      } catch {
        return [];
      }
    }
    async function searchDownloads(query) {
      try {
        if (!globalThis.chrome?.downloads?.search) return [];
        return await new Promise((resolve) => {
          chrome.downloads.search({ query: [query], limit: 20 }, (results2) => resolve(results2 || []));
        });
      } catch {
        return [];
      }
    }
    function onInput() {
      if (!input) return;
      currentQuery = input.value;
      if (debounceHandle) window.clearTimeout(debounceHandle);
      debounceHandle = window.setTimeout(() => {
        debounceHandle = null;
        void runQuery(currentQuery);
      }, debounceMs);
    }
    function onKeyDown(e) {
      if (!input) return;
      const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (e.key === "ArrowDown" || mod && (e.key === "n" || e.key === "N")) {
        e.preventDefault();
        setSelected(selectedIndex + 1, true);
        return;
      }
      if (e.key === "ArrowUp" || mod && (e.key === "p" || e.key === "P")) {
        e.preventDefault();
        setSelected(selectedIndex - 1, true);
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        setSelected(0, true);
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        setSelected(unifiedResults.length - 1, true);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        openSelected();
        return;
      }
      if (e.key === "Tab") {
        const sel = unifiedResults[selectedIndex];
        if (sel && sel.kind === "tab" && sel.data.matchedRecords && sel.data.matchedRecords.length > 1) {
          e.preventDefault();
          const next = ((perTabMatchIndex.get(sel.data.tabId) ?? 0) + 1) % sel.data.matchedRecords.length;
          perTabMatchIndex.set(sel.data.tabId, next);
          applySelection();
          if (results) {
            const row = results.querySelectorAll(".row")[selectedIndex];
            if (row) {
              const match = sel.data.matchedRecords[next];
              const snippetEl = row.querySelector(".match");
              if (snippetEl) {
                const text = (match.headingText ? match.headingText + " \u2014 " : "") + (match.bodyText || "");
                snippetEl.textContent = truncate(text, 90);
              }
            }
          }
        }
        return;
      }
      if (e.key === "Backspace" && e.shiftKey && mod) {
        e.preventDefault();
        if (input) {
          input.value = "";
          currentQuery = "";
          onInput();
        }
        return;
      }
      if (mod && e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        const idx = Number(e.key) - 1;
        if (idx < unifiedResults.length) {
          setSelected(idx, true);
          openSelected();
        }
        return;
      }
    }
    async function openSelected() {
      const sel = unifiedResults[selectedIndex];
      if (!sel) return;
      if (sel.kind === "browser-action") {
        try {
          await send({ type: "BROWSER_ACTION_EXECUTE", action: sel.data.payload });
        } catch {
        }
        hide();
        return;
      }
      if (sel.kind === "bookmark") {
        try {
          if (sel.data.url) {
            await send({ type: "SPOTLIGHT_OPEN_NEW_TAB", url: sel.data.url });
          }
        } catch {
        }
        hide();
        return;
      }
      if (sel.kind === "history") {
        try {
          if (sel.data.url) {
            await send({ type: "SPOTLIGHT_OPEN_NEW_TAB", url: sel.data.url });
          }
        } catch {
        }
        hide();
        return;
      }
      if (sel.kind === "download") {
        try {
          await send({ type: "BROWSER_ACTION_EXECUTE", action: "open-download", downloadId: sel.data.id });
        } catch {
        }
        hide();
        return;
      }
      if (sel.kind === "action") {
        try {
          if (sel.data.url) {
            await send({ type: "SPOTLIGHT_OPEN_NEW_TAB", url: sel.data.url });
          }
        } catch {
        }
        hide();
        return;
      }
      if (sel.kind === "site") {
        try {
          if (sel.data.url) {
            await send({ type: "SPOTLIGHT_OPEN_NEW_TAB", url: sel.data.url });
          }
        } catch {
        }
        hide();
        return;
      }
      const tabHit = sel.data;
      if ("_isRecent" in tabHit) {
        try {
          await send({ type: "LIBRARY_OPEN_RECENT", url: tabHit.url });
        } catch {
        }
        hide();
        return;
      }
      const matchIdx = perTabMatchIndex.get(tabHit.tabId) ?? 0;
      const record = tabHit.matchedRecords?.[matchIdx];
      try {
        await send({ type: "TAB_SWITCH", tabId: tabHit.tabId, windowId: tabHit.windowId });
        if (record) {
          await send({ type: "SPOTLIGHT_OPEN_RECORD", tabId: tabHit.tabId, record });
        }
      } catch {
      }
      hide();
    }
    async function applyTheme(theme) {
      if (!host) return;
      const resolved = resolveTheme(theme);
      host.setAttribute("data-theme", resolved);
    }
    async function show() {
      mount();
      if (!host || !input) return;
      open = true;
      host.style.display = "block";
      const t = opts.theme ?? await getStoredTheme();
      await applyTheme(t);
      lastQueryKey = "\0never-queried\0";
      perTabMatchIndex = /* @__PURE__ */ new Map();
      currentSuggestion = void 0;
      currentSiteResults = [];
      currentActions = [];
      currentAutocorrected = false;
      unifiedResults = [];
      input.value = "";
      currentQuery = "";
      await runQuery("");
      requestAnimationFrame(() => {
        try {
          input?.focus();
        } catch {
        }
      });
    }
    function hide() {
      if (!host) return;
      open = false;
      host.style.display = "none";
      if (debounceHandle) {
        window.clearTimeout(debounceHandle);
        debounceHandle = null;
      }
    }
    async function toggle() {
      if (open) hide();
      else await show();
    }
    function isOpen() {
      return open;
    }
    function destroy() {
      if (debounceHandle) window.clearTimeout(debounceHandle);
      if (host && host.parentNode) host.parentNode.removeChild(host);
      host = null;
      shadow = null;
      card = null;
      input = null;
      results = null;
      footer = null;
      mounted = false;
      open = false;
    }
    return { show, hide, toggle, isOpen, destroy };
  }

  // src/extraction.ts
  function stripTags(value) {
    let result = "";
    let inTag = false;
    for (let i = 0; i < value.length; i++) {
      const char = value[i];
      if (char === "<" && inTag === false) {
        inTag = true;
      } else if (char === ">" && inTag === true) {
        inTag = false;
      } else if (inTag === false) {
        result += char;
      }
    }
    return result.replace(/\s+/g, " ").trim();
  }
  function generateSelector(element) {
    const path = [];
    let current = element;
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        selector += `#${current.id}`;
        path.unshift(selector);
        break;
      } else if (current.className) {
        const classes = current.className.trim().split(/\s+/);
        if (classes.length) {
          selector += `.${classes.join(".")}`;
        }
      }
      let siblingIndex = 1;
      let sibling = current.previousElementSibling;
      while (sibling) {
        if (sibling.tagName === current.tagName) {
          siblingIndex++;
        }
        sibling = sibling.previousElementSibling;
      }
      if (siblingIndex > 1) {
        selector += `:nth-child(${siblingIndex})`;
      }
      path.unshift(selector);
      current = current.parentElement;
    }
    return path.length > 0 ? path.join(" > ") : element.tagName.toLowerCase();
  }
  function generateStableSelector(element) {
    const candidates = [];
    const push = (value) => {
      if (value && !candidates.includes(value)) candidates.push(value);
    };
    const escape = (value) => typeof CSS !== "undefined" && CSS.escape ? CSS.escape(value) : value.replace(/(["\\])/g, "\\$1");
    for (const attr of ["data-testid", "data-test", "data-agent-id", "id"]) {
      const value = element.getAttribute(attr);
      if (value) push(attr === "id" ? `#${escape(value)}` : `[${attr}="${escape(value)}"]`);
    }
    const aria = element.getAttribute("aria-label");
    if (aria) push(`[aria-label="${escape(aria)}"]`);
    const role = element.getAttribute("role");
    const name = extractActionName(element);
    if (role && name) push(`[role="${escape(role)}"][aria-label="${escape(name)}"]`);
    if (role) push(`[role="${escape(role)}"]`);
    push(generateSelector(element));
    let sibling = element.previousElementSibling;
    let position = 1;
    while (sibling) {
      if (sibling.tagName === element.tagName) position++;
      sibling = sibling.previousElementSibling;
    }
    push(`xpath=//${element.tagName.toLowerCase()}[${position}]`);
    return candidates;
  }
  function extractHeadingId(fullMatch, text) {
    const idMatch = fullMatch.match(/\bid=["']([^"']+)['"]/i);
    if (idMatch?.[1]) return idMatch[1];
    const stripped = text.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return stripped || Math.random().toString(36).slice(2);
  }
  function hasExplicitId(fullMatch) {
    return /\bid=["'][^"']+["']/i.test(fullMatch);
  }
  function findParentSectionId(html, headingMatchEnd) {
    const afterHeading = html.slice(headingMatchEnd, headingMatchEnd + 500);
    const idMatch = afterHeading.match(/<section[^>]*id="([^"]+)"/i);
    if (idMatch?.[1]) return idMatch[1];
    const articleMatch = afterHeading.match(/<article[^>]*id="([^"]+)"/i);
    if (articleMatch?.[1]) return articleMatch[1];
    return null;
  }
  var headingCache = /* @__PURE__ */ new Map();
  function extractSections(html, url) {
    if (headingCache.has(url)) {
      return headingCache.get(url);
    }
    const cleanHtml = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<noscript[\s\S]*?<\/noscript>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ");
    const matches = [];
    const headingRegexGlobal = /<(h[1-6])[^>]*>([\s\S]*?)<\/h[1-6]>/gi;
    let match;
    headingRegexGlobal.lastIndex = 0;
    while ((match = headingRegexGlobal.exec(cleanHtml)) !== null) {
      const [, tag, text] = match;
      const headingText = stripTags(text);
      const level = parseInt(tag[1], 10);
      matches.push({
        level,
        index: match.index,
        text: headingText,
        id: extractHeadingId(match[0], headingText),
        hasRealId: hasExplicitId(match[0])
      });
    }
    const len = matches.length;
    const sections = new Array(len);
    for (let i = 0; i < len; i++) {
      const heading = matches[i];
      const nextHeading = matches[i + 1];
      const start = heading.index + heading.text.length;
      const end = nextHeading?.index ?? cleanHtml.length;
      const content = cleanHtml.slice(start, end);
      const bodyText = stripTags(content).replace(/\s+/g, " ").trim();
      let breadcrumb = "";
      for (let j = 0; j <= i; j++) {
        if (j > 0) breadcrumb += " \u203A ";
        breadcrumb += matches[j].text;
      }
      const parentSectionId = heading.hasRealId ? null : findParentSectionId(cleanHtml, heading.index + heading.text.length);
      const selector = heading.hasRealId ? "#" + heading.id : parentSectionId ? "#" + parentSectionId : void 0;
      sections[i] = {
        id: `${url}#${heading.id}`,
        url: `${url}#${heading.id}`,
        headingText: heading.text,
        headingId: heading.id,
        breadcrumb,
        bodyText,
        type: "section",
        selector
      };
    }
    headingCache.set(url, sections);
    return sections;
  }
  function extractActionName(element) {
    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel?.trim()) return ariaLabel.trim();
    const ariaLabelledBy = element.getAttribute("aria-labelledby");
    if (ariaLabelledBy) {
      const labelledElement = document.getElementById(ariaLabelledBy);
      if (labelledElement?.textContent?.trim()) {
        return labelledElement.textContent.trim();
      }
    }
    const textContent = element.textContent?.trim();
    if (textContent) return textContent;
    const title = element.getAttribute("title");
    if (title?.trim()) return title.trim();
    return null;
  }
  function isDestructiveAction(label) {
    const destructiveVerbs = [
      "delete",
      "remove",
      "cancel subscription",
      "unsubscribe",
      "pay",
      "checkout",
      "submit order",
      "confirm"
    ];
    const lowerLabel = label.toLowerCase();
    return destructiveVerbs.some((verb) => lowerLabel.includes(verb));
  }
  function extractActions(html, url, excludeSelectors) {
    const actions = [];
    const doc = new DOMParser().parseFromString(html, "text/html");
    const selectors = [
      "button",
      '[role="button"]',
      'input[type="button"]',
      'input[type="submit"]',
      "summary",
      "[data-reef-action]"
    ];
    const elements = Array.from(doc.querySelectorAll(selectors.join(",")));
    for (const element of elements) {
      if (excludeSelectors && element.matches(excludeSelectors)) continue;
      const label = extractActionName(element);
      if (!label) continue;
      const selectors2 = generateStableSelector(element);
      actions.push({
        id: `${url}#action-${actions.length}`,
        url,
        headingText: label,
        headingId: `action-${actions.length}`,
        breadcrumb: "",
        bodyText: label,
        type: "action",
        selector: selectors2[0],
        selectors: selectors2,
        destructive: isDestructiveAction(label),
        label
      });
    }
    return actions;
  }
  function extractFields(html, url) {
    const fields = [];
    const doc = new DOMParser().parseFromString(html, "text/html");
    const formElements = Array.from(doc.querySelectorAll("form"));
    for (const form of formElements) {
      let breadcrumb = "";
      let current = form.parentElement;
      while (current && current !== doc.body) {
        if (current.matches('h1, h2, h3, h4, h5, h6, article, section, [role="main"], main')) {
          const headingText = current.textContent?.trim() || "";
          if (headingText) {
            breadcrumb = headingText;
          }
          break;
        }
        current = current.parentElement;
      }
      const inputs = Array.from(form.querySelectorAll("input, textarea, select"));
      for (const input of inputs) {
        if (input.matches('input[type="hidden"], input[type="button"], input[type="submit"], input[type="reset"]')) {
          continue;
        }
        let label = "";
        const id = input.id;
        if (id) {
          const labelElement = doc.querySelector(`label[for="${id}"]`);
          if (labelElement) {
            label = labelElement.textContent?.trim() || "";
          }
        }
        if (!label) {
          const parentLabel = input.closest("label");
          if (parentLabel) {
            label = parentLabel.textContent?.trim() || "";
            const inputElement2 = input;
            if (label && inputElement2.value && label.includes(inputElement2.value)) {
              label = label.replace(inputElement2.value, "").trim();
            }
          }
        }
        if (!label) {
          const inputElement2 = input;
          const placeholder = "placeholder" in inputElement2 ? inputElement2.placeholder : "";
          label = placeholder || input.getAttribute("aria-label") || "";
        }
        if (!label) continue;
        const selectors = generateStableSelector(input);
        const inputElement = input;
        fields.push({
          id: `${url}#field-${fields.length}`,
          url,
          headingText: label,
          headingId: `field-${fields.length}`,
          breadcrumb,
          bodyText: label,
          type: "field",
          selector: selectors[0],
          selectors,
          label,
          value: inputElement.value
        });
      }
    }
    return fields;
  }
  function extractLinks(html, url) {
    const links = [];
    const doc = new DOMParser().parseFromString(html, "text/html");
    const anchors = Array.from(doc.querySelectorAll("a[href]"));
    for (const anchor of anchors) {
      if (anchor.hasAttribute("rel") && anchor.getAttribute("rel")?.toLowerCase().includes("nofollow")) continue;
      const href = anchor.getAttribute("href");
      if (!href) continue;
      if (href === "#" || href.startsWith("javascript:")) continue;
      const linkText = anchor.textContent?.trim() || "";
      if (!linkText) continue;
      const resolvedUrl = resolveUrl(href, url);
      const isExternal = !resolvedUrl.startsWith(window.location.origin);
      const selectors = generateStableSelector(anchor);
      links.push({
        id: `${url}#link-${links.length}`,
        url: resolvedUrl,
        headingText: linkText,
        headingId: `link-${links.length}`,
        breadcrumb: "",
        bodyText: linkText,
        type: isExternal ? "link" : "section",
        selector: selectors[0],
        selectors
      });
    }
    return links;
  }
  function extractFiles(html, url, extensions) {
    const files = [];
    const doc = new DOMParser().parseFromString(html, "text/html");
    const fileExtensions = extensions?.split(",").map((e) => e.trim().toLowerCase()) ?? ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "zip", "csv"];
    const anchors = Array.from(doc.querySelectorAll("a[href]"));
    for (const anchor of anchors) {
      const href = anchor.getAttribute("href");
      if (!href) continue;
      const isFile = fileExtensions.some(
        (ext) => href.toLowerCase().endsWith(`.${ext}`) || href.toLowerCase().endsWith(`.${ext}?`) || href.toLowerCase().endsWith(`.${ext}#`)
      );
      if (!isFile) continue;
      const linkText = anchor.textContent?.trim() || href.split("/").pop() || "";
      if (!linkText) continue;
      const resolvedUrl = resolveUrl(href, url);
      const selectors = generateStableSelector(anchor);
      files.push({
        id: `${url}#file-${files.length}`,
        url: resolvedUrl,
        headingText: linkText,
        headingId: `file-${files.length}`,
        breadcrumb: "",
        bodyText: linkText,
        type: "file",
        selector: selectors[0],
        selectors
      });
    }
    return files;
  }
  function extractMedia(html, url) {
    const media = [];
    const doc = new DOMParser().parseFromString(html, "text/html");
    const images = Array.from(doc.querySelectorAll("img"));
    for (const img of images) {
      const alt = img.alt.trim();
      if (!alt) continue;
      let caption = "";
      const figure = img.closest("figure");
      if (figure) {
        const figcaption = figure.querySelector("figcaption");
        if (figcaption) {
          caption = figcaption.textContent?.trim() || "";
        }
      }
      const textToIndex = caption ? `${alt} ${caption}` : alt;
      if (!textToIndex.trim()) continue;
      const selectors = generateStableSelector(img);
      media.push({
        id: `${url}#media-image-${media.length}`,
        url,
        headingText: alt,
        headingId: `media-image-${media.length}`,
        breadcrumb: "",
        bodyText: textToIndex,
        type: "media",
        selector: selectors[0],
        selectors
      });
    }
    const mediaElements = Array.from(doc.querySelectorAll("video, audio"));
    for (const element of mediaElements) {
      const title = element.getAttribute("title") || element.getAttribute("aria-label") || "";
      if (!title) continue;
      let transcript = "";
      const tracks = Array.from(element.querySelectorAll('track[kind="captions"], track[kind="subtitles"]'));
      for (const track of tracks) {
        const src = track.getAttribute("src");
        if (src) {
          transcript += `[Transcript available: ${src}] `;
        }
      }
      const textToIndex = transcript ? `${title} ${transcript}` : title;
      if (!textToIndex.trim()) continue;
      const selectors = generateStableSelector(element);
      media.push({
        id: `${url}#media-${media.length}`,
        url,
        headingText: title,
        headingId: `media-${media.length}`,
        breadcrumb: "",
        bodyText: textToIndex,
        type: "media",
        selector: selectors[0],
        selectors,
        transcript: transcript.trim()
      });
    }
    return media;
  }
  function extractStructuredData(html, url) {
    const structured = [];
    const doc = new DOMParser().parseFromString(html, "text/html");
    const jsonLdScripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
    for (const script of jsonLdScripts) {
      try {
        const data = JSON.parse(script.textContent || "{}");
        if (Array.isArray(data) ? data.some((item) => item["@type"] === "FAQPage") : data["@type"] === "FAQPage") {
          const faqItems = Array.isArray(data) ? data.flatMap((item) => item.mainEntity || []) : data.mainEntity || [];
          for (const [index, question] of faqItems.entries()) {
            if (!question || !question.name) continue;
            const answer = question.acceptedAnswer?.text || question.suggestedAnswer?.text || "";
            if (!answer) continue;
            const textToIndex = `${question.name} ${answer}`;
            structured.push({
              id: `${url}#structured-faq-${index}`,
              url,
              headingText: question.name,
              headingId: `structured-faq-${index}`,
              breadcrumb: "",
              bodyText: textToIndex,
              type: "structured",
              structuredData: { question: question.name, answer }
            });
          }
        } else if (data["@type"]) {
          const type = data["@type"];
          const name = data.name || data.headline || "";
          const description = data.description || "";
          if (!name && !description) continue;
          const textToIndex = `${name} ${description}`.trim();
          if (!textToIndex) continue;
          structured.push({
            id: `${url}#structured-${type.toLowerCase()}-${structured.length}`,
            url,
            headingText: name || "Structured Data",
            headingId: `structured-${type.toLowerCase()}-${structured.length}`,
            breadcrumb: "",
            bodyText: textToIndex,
            type: "structured",
            structuredData: data
          });
        }
      } catch (e) {
        continue;
      }
    }
    return structured;
  }
  function resolveUrl(value, base) {
    if (!value) return base;
    try {
      return new URL(value, base).toString();
    } catch {
      return value;
    }
  }

  // plugin/src/content.ts
  var spotlight = null;
  function extractPageManifest() {
    const url = window.location.href;
    const title = document.title;
    const records = [];
    try {
      const sections = extractSections(document.body);
      for (const section of sections) {
        const record = {
          id: section.id || generateStableSelector(section.element),
          type: "section",
          url,
          title,
          headingText: section.headingText,
          headingLevel: section.headingLevel,
          bodyText: section.bodyText,
          breadcrumbs: section.breadcrumbs,
          selector: section.selector
        };
        records.push(record);
      }
    } catch (err) {
      console.error("[reef] failed to extract sections:", err);
    }
    try {
      const actions = extractActions(document.body);
      for (const action of actions) {
        const record = {
          id: action.id || generateStableSelector(action.element),
          type: "action",
          url,
          title,
          label: action.label,
          selector: action.selector
        };
        records.push(record);
      }
    } catch (err) {
      console.error("[reef] failed to extract actions:", err);
    }
    try {
      const fields = extractFields(document.body);
      for (const field of fields) {
        const record = {
          id: field.id || generateStableSelector(field.element),
          type: "field",
          url,
          title,
          label: field.label,
          selector: field.selector
        };
        records.push(record);
      }
    } catch (err) {
      console.error("[reef] failed to extract fields:", err);
    }
    try {
      const links = extractLinks(document.body);
      for (const link of links) {
        const record = {
          id: link.id || generateStableSelector(link.element),
          type: "link",
          url: link.href,
          title: link.text || link.href,
          label: link.text,
          selector: link.selector
        };
        records.push(record);
      }
    } catch (err) {
      console.error("[reef] failed to extract links:", err);
    }
    try {
      const files = extractFiles(document.body);
      for (const file of files) {
        const record = {
          id: file.id || generateStableSelector(file.element),
          type: "file",
          url: file.href,
          title: file.text || file.href,
          label: file.text,
          selector: file.selector
        };
        records.push(record);
      }
    } catch (err) {
      console.error("[reef] failed to extract files:", err);
    }
    try {
      const media = extractMedia(document.body);
      for (const item of media) {
        const record = {
          id: item.id || generateStableSelector(item.element),
          type: "media",
          url: item.src,
          title: item.alt || item.src,
          label: item.alt,
          selector: item.selector
        };
        records.push(record);
      }
    } catch (err) {
      console.error("[reef] failed to extract media:", err);
    }
    try {
      const structured = extractStructuredData(document);
      for (const item of structured) {
        const record = {
          id: `structured-${Math.random().toString(36).slice(2, 8)}`,
          type: "structured-data",
          url,
          title: item.name || item.headline || "Structured Data",
          bodyText: JSON.stringify(item)
        };
        records.push(record);
      }
    } catch (err) {
      console.error("[reef] failed to extract structured data:", err);
    }
    return { url, title, records };
  }
  function executeAction(record) {
    try {
      if (!record.selector) {
        return { success: false, reason: "no-selector" };
      }
      const element = document.querySelector(record.selector);
      if (!element) {
        return { success: false, reason: "element-not-found" };
      }
      if (element instanceof HTMLAnchorElement) {
        element.click();
        return { success: true };
      }
      if (element instanceof HTMLButtonElement || element instanceof HTMLInputElement) {
        element.click();
        return { success: true };
      }
      if (element instanceof HTMLElement) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        element.focus();
        return { success: true };
      }
      return { success: false, reason: "unsupported-element" };
    } catch (err) {
      return { success: false, reason: err instanceof Error ? err.message : String(err) };
    }
  }
  if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      try {
        switch (message.type) {
          case "SHOW_SPOTLIGHT":
            if (!spotlight) {
              spotlight = createSpotlight();
            }
            spotlight.toggle();
            sendResponse({ success: true });
            break;
          case "GET_MANIFEST":
            const manifest = extractPageManifest();
            sendResponse({ success: true, manifest });
            break;
          case "EXECUTE_ACTION":
            const result = executeAction(message.record);
            sendResponse(result);
            break;
          case "TOGGLE_FULLSCREEN":
            if (document.fullscreenElement) {
              document.exitFullscreen();
            } else {
              document.documentElement.requestFullscreen();
            }
            sendResponse({ success: true });
            break;
          default:
            sendResponse({ success: false, error: "unsupported-message-type" });
        }
      } catch (err) {
        sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) });
      }
      return true;
    });
  }
  if (typeof document !== "undefined") {
    const observer = new MutationObserver(() => {
      if (spotlight?.isOpen()) {
        spotlight.hide();
        spotlight = null;
      }
    });
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        observer.observe(document.body, { childList: true, subtree: true });
      });
    } else {
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }
})();
//# sourceMappingURL=content.js.map
