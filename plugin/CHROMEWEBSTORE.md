# Chrome Web Store & Firefox Add-ons Listing Document

**Extension Name**: Reef for Browsers  
**Short Description**: In-page search, site indexing, and intelligent action automation for any website.  
**Detailed Description**:  
Reef for Browsers brings powerful in-page search and action execution to any web page. Built upon the Reef engine, it indexes page sections, buttons, form fields, links, and media files directly in your browser.

Key Features:
- Keyboard-first search popup (`Ctrl+Shift+K` / `MacCtrl+Shift+K`)
- Direct execution of in-page actions and form filling
- Support for site-published agent manifests (`agent-ready.ts`) with dynamic DOM fallback
- Omnibox support (`reef <query>`)
- 100% local processing — no page data leaves your browser
- Hard-excluded sensitive inputs (passwords, payment cards, SSN)

---

## Permission Justifications

| Permission | Justification |
|------------|---------------|
| `activeTab` | Required to inspect the current tab's DOM for section/action extraction when the user opens the search popup or uses the omnibox shortcut. |
| `scripting` | Required to execute in-page agent click/type actions and scroll highlighted elements into view upon user interaction. |
| `storage` | Required to persist user options (exclusion selectors, execution mode) locally via `chrome.storage.local`. |
| `<all_urls>` | Host permission required so the content script can run on any site the user navigates to in order to extract page structure and actions locally. |

---

## Store Listing Media Assets Checklist

- [x] **Icons**: 16x16, 32x32, 48x48, 128x128 PNGs created in `plugin/icons/`
- [ ] **Store Screenshots**: (Placeholder — to be supplied by maintainer: 1280x800 or 640x400 PNGs showing search popup and options UI)
- [x] **Privacy Policy URL**: Link to `PRIVACY_POLICY.md` hosted on GitHub repo / site
