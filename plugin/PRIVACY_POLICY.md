# Privacy Policy — Reef for Browsers

**Last Updated**: July 23, 2026

Reef for Browsers is committed to protecting your privacy. This privacy policy outlines how our extension handles user data.

## 1. Local-Only Processing
Reef for Browsers operates **100% locally within your browser context**. 
- No web page content, search queries, DOM extractions, or index data are sent to external servers or third parties.
- All search indexing and action resolution are performed entirely on your device using JavaScript in the service worker and content script contexts.

## 2. Data Storage
The extension uses `chrome.storage.local` exclusively to store your explicit user settings (such as action execution mode and custom exclusion selectors). This data remains strictly on your local machine.

## 3. Sensitive Field Protection
Reef for Browsers incorporates hard-coded sensitive field exclusions. It never indexes, reads, or records:
- Password inputs (`input[type="password"]`)
- Credit card numbers (`input[name*="card"]`, `input[autocomplete*="cc-"]`)
- Social Security Numbers (`input[name*="ssn"]`)
- Custom elements flagged with `data-sensitive` or `data-reef-agent="off"`

## 4. Telemetry & Analytics
Telemetry is **OFF by default**. If you explicitly opt-in via the extension options page, only minimal anonymous event counters are kept locally in your browser storage.

## 5. Contact & Source Code
Reef for Browsers is open-source. You can inspect the source code and report issues at:
https://github.com/somalip/Reef
