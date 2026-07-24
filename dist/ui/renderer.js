/**
 * @file UI rendering and focus management for the search modal.
 * Handles creating the modal DOM, focus trapping, and ARIA attributes.
 */
import { getResultTypeIcon, getResultTypeLabel, escapeHtml, highlight, getSnippet } from './ui-helpers.js';
export class UIRenderer {
    constructor() {
        this.host = null;
        this.root = null;
        this.input = null;
        this.resultsList = null;
        this.focusableElements = [];
        this.isOpen = false;
        this.modeChangeCallback = null;
        this.activeCategory = 'all';
        this.categoryChangeCallback = null;
        this.settingsChangeCallback = null;
        this.rebuildIndexCallback = null;
        this.toggleInspectorCallback = null;
        this.onOpenCallback = null;
        this.isSettingsOpen = false;
    }
    getHost() { return this.host; }
    getRoot() { return this.root; }
    getInput() { return this.input; }
    getResultsList() { return this.resultsList; }
    getIsOpen() { return this.isOpen; }
    getFocusableElements() { return this.focusableElements; }
    getActiveCategory() { return this.activeCategory; }
    getOnOpenCallback() { return this.onOpenCallback; }
    setIsOpen(open) { this.isOpen = open; }
    clearFocusableElements() { this.focusableElements = []; }
    setCategoryCallback(cb) { this.categoryChangeCallback = cb; }
    setSettingsCallback(cb) { this.settingsChangeCallback = cb; }
    setRebuildIndexCallback(cb) { this.rebuildIndexCallback = cb; }
    setToggleInspectorCallback(cb) { this.toggleInspectorCallback = cb; }
    setOnOpenCallback(cb) { this.onOpenCallback = cb; }
    renderUI(placeholder, currentMode, onModeChange) {
        this.modeChangeCallback = onModeChange;
        const host = document.createElement('div');
        host.className = 'reef-host is-hidden';
        // Defer to DOM ready if called from head before body exists
        if (document.body) {
            document.body.appendChild(host);
        }
        else {
            const appendHost = () => {
                if (document.body) {
                    document.body.appendChild(host);
                }
            };
            document.addEventListener('DOMContentLoaded', appendHost);
        }
        this.host = host;
        this.root = host.attachShadow({ mode: 'open' });
        const shadow = this.root;
        shadow.innerHTML = `
      <style>
        :host {
          position: fixed;
          inset: 0;
          z-index: 2147483647;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 12vh 1.25rem 0;
          background: rgba(0, 0, 0, 0.6);
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.14s ease;
        }
        :host(.is-hidden) { display: none; }
        :host(.open) { opacity: 1; pointer-events: auto; }

        :host(.mode-opaque) .panel {
          background: rgba(20,30,28,0.92) !important;
        }
        :host(.mode-high-contrast) .panel {
          background: rgba(255,255,255,0.98);
          --primary-color: #0066cc;
          --text-color: #111111;
          --border-color: #e0e0e0;
        }
        :host(.mode-high-contrast) .input {
          color: #111111;
        }
        :host(.mode-high-contrast) .result-type-label {
          color: #0066cc;
        }
        :host(.mode-high-contrast) .result .heading {
          color: #111111;
        }
        :host(.mode-high-contrast) .result .snippet {
          color: #444444;
        }

        .panel {
          width: 100%;
          max-width: 560px;
          background: rgba(20,30,28,0.88);
          color: var(--text-color, #edebe6);
          border: 1px solid var(--border-color, rgba(255,255,255,0.1));
          border-radius: 24px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.4);
          overflow: hidden;
          transform: translateY(-8px) scale(0.98);
          transition: transform 0.14s ease;
          position: relative;
        }
        :host(.open) .panel { transform: translateY(0) scale(1); }

        .input-row {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.95rem 1rem;
          border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.08));
        }

        .icon {
          opacity: 0.6;
          flex-shrink: 0;
          stroke: var(--primary-color, #66d9c8);
        }

        .input {
          flex: 1;
          background: transparent;
          border: 0;
          outline: none;
          color: var(--text-color, #edebe6);
          font-size: 1rem;
          font-family: var(--font-family, Inter, system-ui, sans-serif);
        }
        .input::placeholder {
          color: #8a8a8f;
        }

        .hint {
          font-family: ui-monospace, monospace;
          font-size: 0.72rem;
          color: #a0a0a5;
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 10px;
          padding: 0.2rem 0.6rem;
        }

        .settings-toggle-btn {
          background: transparent;
          border: 0;
          cursor: pointer;
          color: var(--text-color, #edebe6);
          opacity: 0.6;
          display: flex;
          align-items: center;
          padding: 0.25rem;
          border-radius: 6px;
          transition: opacity 0.15s, background-color 0.15s;
        }
        .settings-toggle-btn:hover {
          opacity: 1;
          background: rgba(255, 255, 255, 0.08);
        }

        .tabs-row {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.6rem 1rem;
          border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.08));
          overflow-x: auto;
          scrollbar-width: none;
        }
        .tabs-row::-webkit-scrollbar {
          display: none;
        }
        .tab-chip {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 9999px;
          padding: 0.3rem 0.75rem;
          font-size: 0.75rem;
          color: var(--text-color, #edebe6);
          opacity: 0.8;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.15s ease;
        }
        .tab-chip:hover {
          background: rgba(255, 255, 255, 0.08);
          opacity: 1;
        }
        .tab-chip.active {
          background: var(--primary-color, #66d9c8);
          color: #0c1412;
          opacity: 1;
          font-weight: 500;
          border-color: var(--primary-color, #66d9c8);
        }
        .tab-chip.active .tab-badge {
          background: rgba(0, 0, 0, 0.15);
          color: inherit;
        }
        .tab-badge {
          font-size: 0.65rem;
          background: rgba(255, 255, 255, 0.1);
          color: #a0a0a5;
          padding: 0.05rem 0.35rem;
          border-radius: 9999px;
        }

        .results {
          max-height: 340px;
          overflow-y: auto;
          padding: 0.5rem;
        }

        .result {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          width: 100%;
          text-align: left;
          padding: 0.8rem 1rem;
          border-radius: 16px;
          margin-top: 0.25rem;
          cursor: pointer;
          border: 0;
          background: transparent;
          color: inherit;
        }
        .result:hover, .result.is-selected {
          background: rgba(255,255,255,0.08);
        }
        .result-type {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 0.7rem;
          margin-bottom: 0.25rem;
        }
        .result-type-icon {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 16px;
          height: 16px;
          flex-shrink: 0;
        }
        .result-type-icon svg {
          width: 14px;
          height: 14px;
          stroke: var(--primary-color, #66d9c8);
        }
        .result-type-label {
          font-family: ui-monospace, monospace;
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--primary-color, #66d9c8);
        }
        .result .breadcrumb {
          font-family: ui-monospace, monospace;
          font-size: 0.75rem;
          color: #a0a0a5;
        }
        .result .heading {
          font-size: 0.95rem;
          font-weight: 500;
          color: var(--text-color, #edebe6);
        }
        .result .snippet {
          font-size: 0.85rem;
          color: var(--text-color, #a0a0a5);
          line-height: 1.5;
        }
        .result mark {
          background: rgba(255,255,255,0.2);
          color: var(--primary-color, #66d9c8);
          border-radius: 4px;
          padding: 0 2px;
        }
        .result-action-hint {
          font-size: 0.75rem;
          font-family: ui-monospace, monospace;
          color: #8a8a8f;
          margin-top: 0.25rem;
        }
        .result-action-hint.run-here { color: var(--primary-color, #66d9c8); }
        .result-action-hint.go-there { color: #a0a0a5; }
        .empty {
          padding: 2rem;
          color: #8a8a8f;
          text-align: center;
          font-size: 0.9rem;
        }
        .footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1rem;
          border-top: 1px solid rgba(255,255,255,0.08);
          color: #a0a0a5;
          font-size: 0.75rem;
          font-family: ui-monospace, monospace;
        }
        .k {
          border: 1px solid rgba(255,255,255,0.15);
          border-radius: 8px;
          padding: 0.15rem 0.5rem;
          margin: 0 0.2rem;
        }

        .is-hidden { display: none !important; }
        
        .settings-view {
          padding: 1.25rem;
          max-height: 380px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
        }

        .settings-section {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .settings-section h4 {
          margin: 0;
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--primary-color, #66d9c8);
          font-family: ui-monospace, monospace;
        }

        .settings-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.75rem;
        }

        .settings-item {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }

        .settings-item label {
          font-size: 0.75rem;
          color: #a0a0a5;
        }

        .settings-control {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 8px;
          color: var(--text-color, #edebe6);
          padding: 0.4rem 0.6rem;
          font-size: 0.8rem;
          font-family: inherit;
          outline: none;
          transition: border-color 0.15s ease;
        }

        .settings-control:focus {
          border-color: var(--primary-color, #66d9c8);
        }

        .checkbox-item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.8rem;
          cursor: pointer;
        }

        .checkbox-item input {
          cursor: pointer;
          accent-color: var(--primary-color, #66d9c8);
        }

        .btn-action {
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: var(--text-color, #edebe6);
          padding: 0.45rem 0.75rem;
          border-radius: 8px;
          font-size: 0.8rem;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.15s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
        }

        .btn-action:hover {
          background: rgba(255, 255, 255, 0.12);
          border-color: rgba(255, 255, 255, 0.25);
        }

        .btn-primary-action {
          background: var(--primary-color, #66d9c8);
          border-color: var(--primary-color, #66d9c8);
          color: #0c1412;
          font-weight: 500;
        }

        .btn-primary-action:hover {
          background: var(--primary-color, #66d9c8);
          opacity: 0.9;
        }

        .diagnostic-row {
          display: flex;
          justify-content: space-between;
          font-size: 0.75rem;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          padding-bottom: 0.35rem;
        }

        .diagnostic-value {
          font-family: ui-monospace, monospace;
          color: var(--primary-color, #66d9c8);
        }

        @media (prefers-reduced-motion: reduce) {
          :host, .panel { transition: none; }
        }
      </style>
      <div class="panel" role="dialog" aria-modal="true" aria-label="Site search">
        <div class="input-row">
          <svg class="icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input class="input" type="text" placeholder="${placeholder}" autocomplete="off" />
          <span class="hint">ESC</span>
          <button class="settings-toggle-btn" type="button" aria-label="Toggle settings">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
          </button>
        </div>

        <!-- MAIN VIEW (TABS + RESULTS + FOOTER) -->
        <div class="main-content-view">
          <div class="tabs-row">
            <button class="tab-chip active" type="button" data-cat="all">All <span class="tab-badge" id="badge-all">0</span></button>
            <button class="tab-chip" type="button" data-cat="pages">Pages <span class="tab-badge" id="badge-pages">0</span></button>
            <button class="tab-chip" type="button" data-cat="actions">Actions <span class="tab-badge" id="badge-actions">0</span></button>
            <button class="tab-chip" type="button" data-cat="files">Files <span class="tab-badge" id="badge-files">0</span></button>
            <button class="tab-chip" type="button" data-cat="links">Links <span class="tab-badge" id="badge-links">0</span></button>
          </div>
          <div class="results" aria-live="polite"></div>
          <div class="footer"><span><span class="k">↑↓</span> navigate <span class="k">↵</span> open</span><span id="count"></span></div>
        </div>

        <!-- SETTINGS VIEW (HIDDEN BY DEFAULT) -->
        <div class="settings-view is-hidden">
          <div class="settings-section">
            <h4>User Preferences</h4>
            <div class="settings-grid">
              <div class="settings-item">
                <label for="themeControl">Theme</label>
                <select id="themeControl" class="settings-control">
                  <option value="auto">Auto (System)</option>
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </div>
              <div class="settings-item">
                <label for="modeControl">Search Mode</label>
                <select id="modeControl" class="settings-control">
                  <option value="regular">Regular</option>
                  <option value="opaque">Opaque</option>
                  <option value="high-contrast">High Contrast</option>
                </select>
              </div>
              <div class="settings-item">
                <label for="hotkeyControl">Keyboard Shortcut</label>
                <select id="hotkeyControl" class="settings-control">
                  <option value="ctrlk,cmdk">Cmd/Ctrl + K</option>
                  <option value="altk">Alt + K</option>
                  <option value="ctrlshiftk">Ctrl + Shift + K</option>
                  <option value="f">Ctrl + F</option>
                </select>
              </div>
            </div>
          </div>

          <div class="settings-section">
            <h4>Developer & Agent Settings</h4>
            <div style="display:flex;flex-direction:column;gap:0.5rem;">
              <label class="checkbox-item">
                <input type="checkbox" id="agentInspectorToggle" />
                <span>Enable Visual AI Agent Inspector</span>
              </label>
              <div class="settings-grid" style="margin-top:0.25rem;">
                <div class="settings-item">
                  <label for="actionsModeControl">Action Mode</label>
                  <select id="actionsModeControl" class="settings-control">
                    <option value="execute">Execute (Interactive)</option>
                    <option value="navigate-only">Navigate only (Safe)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div class="settings-section">
            <h4>Diagnostics & Actions</h4>
            <div style="display:flex;flex-direction:column;gap:0.5rem;">
              <div class="diagnostic-row">
                <span>Pages Indexed:</span>
                <span class="diagnostic-value" id="diagPagesCount">0</span>
              </div>
              <div class="diagnostic-row">
                <span>Interactive Elements:</span>
                <span class="diagnostic-value" id="diagInteractiveCount">0</span>
              </div>
              <div class="diagnostic-row">
                <span>Files / Downloads:</span>
                <span class="diagnostic-value" id="diagFilesCount">0</span>
              </div>
              <div style="display:flex;gap:0.5rem;margin-top:0.25rem;">
                <button type="button" class="btn-action" id="btnCopyConfig">Copy Config JSON</button>
                <button type="button" class="btn-action btn-primary-action" id="btnRebuildIndex">Rebuild Index</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
        this.input = shadow.querySelector('input');
        this.resultsList = shadow.querySelector('.results');
        // Toggle Settings View
        const settingsToggle = shadow.querySelector('.settings-toggle-btn');
        const mainView = shadow.querySelector('.main-content-view');
        const settingsView = shadow.querySelector('.settings-view');
        settingsToggle?.addEventListener('click', () => {
            this.isSettingsOpen = !this.isSettingsOpen;
            if (this.isSettingsOpen) {
                mainView?.classList.add('is-hidden');
                settingsView?.classList.remove('is-hidden');
                settingsToggle.style.opacity = '1';
                settingsToggle.style.stroke = 'var(--primary-color)';
            }
            else {
                settingsView?.classList.add('is-hidden');
                mainView?.classList.remove('is-hidden');
                settingsToggle.style.opacity = '';
                settingsToggle.style.stroke = '';
                this.input?.focus();
            }
        });
        // Category Tabs Event Listeners
        const tabs = shadow.querySelectorAll('.tab-chip');
        tabs.forEach((tab) => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.activeCategory = tab.getAttribute('data-cat') || 'all';
                this.categoryChangeCallback?.(this.activeCategory);
            });
        });
        // Controls Event Handlers
        const themeControl = shadow.querySelector('#themeControl');
        themeControl?.addEventListener('change', () => {
            this.settingsChangeCallback?.('theme', themeControl.value);
        });
        const modeControl = shadow.querySelector('#modeControl');
        modeControl?.addEventListener('change', () => {
            this.settingsChangeCallback?.('mode', modeControl.value);
        });
        const hotkeyControl = shadow.querySelector('#hotkeyControl');
        hotkeyControl?.addEventListener('change', () => {
            this.settingsChangeCallback?.('hotkey', hotkeyControl.value);
        });
        const actionsModeControl = shadow.querySelector('#actionsModeControl');
        actionsModeControl?.addEventListener('change', () => {
            this.settingsChangeCallback?.('actionsMode', actionsModeControl.value);
        });
        const agentInspectorToggle = shadow.querySelector('#agentInspectorToggle');
        agentInspectorToggle?.addEventListener('change', () => {
            this.toggleInspectorCallback?.(!!agentInspectorToggle.checked);
        });
        const btnRebuildIndex = shadow.querySelector('#btnRebuildIndex');
        btnRebuildIndex?.addEventListener('click', () => {
            btnRebuildIndex.disabled = true;
            const originalText = btnRebuildIndex.textContent;
            btnRebuildIndex.textContent = 'Rebuilding...';
            this.rebuildIndexCallback?.();
            setTimeout(() => {
                btnRebuildIndex.disabled = false;
                btnRebuildIndex.textContent = originalText;
            }, 1000);
        });
        const btnCopyConfig = shadow.querySelector('#btnCopyConfig');
        btnCopyConfig?.addEventListener('click', () => {
            const config = {
                theme: themeControl?.value || 'auto',
                mode: modeControl?.value || 'regular',
                hotkey: hotkeyControl?.value || 'ctrlk,cmdk',
                actionsMode: actionsModeControl?.value || 'execute',
            };
            const json = JSON.stringify(config, null, 2);
            navigator.clipboard.writeText(json).then(() => {
                const originalText = btnCopyConfig.textContent;
                btnCopyConfig.textContent = 'Copied!';
                setTimeout(() => {
                    btnCopyConfig.textContent = originalText;
                }, 1500);
            });
        });
    }
    setupFocusTrap() {
        const focusInHandler = (event) => {
            if (!this.isOpen || !this.host)
                return;
            if (this.focusableElements.length === 0) {
                this.focusableElements = this.getAllFocusableElements();
            }
            if (this.focusableElements.length === 0)
                return;
            const first = this.focusableElements[0];
            const last = this.focusableElements[this.focusableElements.length - 1];
            const target = event.target;
            if (event.type === 'focusin' && target) {
                if (!this.isElementInModal(target)) {
                    const activeElement = document.activeElement;
                    if (activeElement === first) {
                        last?.focus();
                    }
                    else {
                        first?.focus();
                    }
                }
            }
        };
        document.addEventListener('focusin', focusInHandler);
    }
    getAllFocusableElements() {
        if (!this.host)
            return [];
        const focusableSelectors = [
            'button', 'input', 'select', 'textarea', 'a[href]',
            '[tabindex]:not([tabindex="-1"])', '[role="button"]'
        ];
        return Array.from(this.host.shadowRoot?.querySelectorAll(focusableSelectors.join(',')) ?? []);
    }
    isElementInModal(element) {
        if (!this.host)
            return false;
        return this.host.contains(element) || (this.host.shadowRoot?.contains(element) ?? false);
    }
    applyAriaHidden() {
        document.body.setAttribute('aria-hidden', 'true');
        const mainContent = document.querySelector('main, [role="main"], body > *:not(.reef-host)');
        if (mainContent) {
            mainContent.setAttribute('aria-hidden', 'true');
        }
    }
    restoreBodyAriaHidden() {
        document.body.removeAttribute('aria-hidden');
        const mainContent = document.querySelector('main, [role="main"], body > *:not(.reef-host)');
        if (mainContent) {
            mainContent.removeAttribute('aria-hidden');
        }
    }
    scrollSelectedIntoView(selectedIndex) {
        if (!this.resultsList)
            return;
        const selected = this.resultsList.querySelector(`.result[data-index="${selectedIndex}"]`);
        if (!selected)
            return;
        const allResults = this.resultsList.querySelectorAll('.result');
        if (!allResults.length)
            return;
        // For the first item, immediately scroll to top to avoid getting stuck
        if (selectedIndex === 0) {
            this.resultsList.scrollTop = 0;
            return;
        }
        const isLast = selectedIndex === allResults.length - 1;
        const block = isLast ? 'center' : 'nearest';
        selected.scrollIntoView({ block, inline: 'nearest' });
    }
    renderResults(query, results, selectedIndex, onResultMouseEnter, onResultClick) {
        const countEl = this.root?.querySelector('#count');
        if (!this.resultsList)
            return;
        this.clearFocusableElements();
        if (!results.length) {
            this.resultsList.innerHTML = `<div class="empty">No sections match "${escapeHtml(query)}"</div>`;
            if (countEl)
                countEl.textContent = '0 results';
            return;
        }
        if (countEl) {
            const counts = {};
            for (const result of results) {
                const type = getResultTypeLabel(result.type);
                counts[type] = (counts[type] || 0) + 1;
            }
            const countParts = Object.entries(counts)
                .map(([type, count]) => `${count} ${type.toLowerCase()}${count !== 1 ? 's' : ''}`)
                .join(', ');
            countEl.textContent = countParts;
        }
        if (this.resultsList) {
            this.resultsList.innerHTML = results
                .map((result, index) => {
                const isSelected = index === selectedIndex;
                const snippet = getSnippet(result.bodyText, query);
                const typeIcon = getResultTypeIcon(result.type);
                const typeLabel = getResultTypeLabel(result.type);
                const isAction = result.type === 'action';
                const isSamePage = result.url === window.location.href.split('#')[0];
                const canExecuteHere = isAction && isSamePage && !result.destructive;
                const actionHint = canExecuteHere
                    ? '<span class="result-action-hint run-here">↵ to run here</span>'
                    : '<span class="result-action-hint go-there">↵ to go there</span>';
                let answerPreview = '';
                if (result.type === 'structured' && result.structuredData) {
                    if (result.structuredData.answer) {
                        answerPreview = `<div class="answer-preview">${escapeHtml(result.structuredData.answer.substring(0, 100))}${result.structuredData.answer.length > 100 ? '…' : ''}</div>`;
                    }
                    else if (result.structuredData.question && result.structuredData.answer) {
                        answerPreview = `<div class="answer-preview"><strong>${escapeHtml(result.structuredData.question)}</strong>: ${escapeHtml(result.structuredData.answer.substring(0, 100))}${result.structuredData.answer.length > 100 ? '…' : ''}</div>`;
                    }
                }
                return `
            <button class="result ${isSelected ? 'is-selected' : ''}" type="button" data-index="${index}">
              <div class="result-type">
                <span class="result-type-icon">${typeIcon}</span>
                <span class="result-type-label">${typeLabel}</span>
              </div>
              <div class="breadcrumb">${escapeHtml(result.breadcrumb)}</div>
              <div class="heading">${highlight(result.headingText, query)}</div>
              ${answerPreview}
              <div class="snippet">${highlight(snippet, query)}</div>
              ${isAction ? actionHint : ''}
            </button>
          `;
            })
                .join('');
            this.resultsList.querySelectorAll('button').forEach((button) => {
                button.addEventListener('mouseenter', () => {
                    const idx = Number(button.getAttribute('data-index')) ?? 0;
                    onResultMouseEnter(idx);
                });
                button.addEventListener('click', (event) => {
                    const idx = Number(button.getAttribute('data-index')) ?? 0;
                    onResultClick(event, idx);
                });
            });
        }
    }
    showToast(message) {
        const toast = document.createElement('div');
        toast.textContent = message;
        toast.style.position = 'fixed';
        toast.style.bottom = '20px';
        toast.style.right = '20px';
        toast.style.background = '#333';
        toast.style.color = '#fff';
        toast.style.padding = '10px 20px';
        toast.style.borderRadius = '4px';
        toast.style.zIndex = '9999';
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s';
        document.body.appendChild(toast);
        void toast.offsetWidth;
        toast.style.opacity = '1';
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => {
                document.body.removeChild(toast);
            }, 300);
        }, 2000);
    }
    updateDiagnostics(data) {
        if (!this.root)
            return;
        const diagPages = this.root.querySelector('#diagPagesCount');
        const diagInteractive = this.root.querySelector('#diagInteractiveCount');
        const diagFiles = this.root.querySelector('#diagFilesCount');
        if (diagPages)
            diagPages.textContent = String(data.pages);
        if (diagInteractive)
            diagInteractive.textContent = String(data.interactive);
        if (diagFiles)
            diagFiles.textContent = String(data.files);
    }
    updateCategoryBadges(counts) {
        if (!this.root)
            return;
        for (const [cat, count] of Object.entries(counts)) {
            const badge = this.root.querySelector(`#badge-${cat}`);
            if (badge) {
                badge.textContent = String(count);
            }
        }
    }
    updateSettingsValues(config) {
        if (!this.root)
            return;
        const themeControl = this.root.querySelector('#themeControl');
        const modeControl = this.root.querySelector('#modeControl');
        const hotkeyControl = this.root.querySelector('#hotkeyControl');
        const actionsModeControl = this.root.querySelector('#actionsModeControl');
        const agentInspectorToggle = this.root.querySelector('#agentInspectorToggle');
        if (themeControl)
            themeControl.value = config.theme || 'auto';
        if (modeControl)
            modeControl.value = config.mode || 'regular';
        if (hotkeyControl)
            hotkeyControl.value = config.hotkey || 'ctrlk,cmdk';
        if (actionsModeControl)
            actionsModeControl.value = config.actionsMode || 'execute';
        if (agentInspectorToggle)
            agentInspectorToggle.checked = config.inspectorActive;
    }
}
