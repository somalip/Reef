const DEFAULTS = {
  actionsMode: 'execute',
  confirmDestructive: true,
  autoExecute: false,
  exclusionSelectors: [] as string[],
  blockedDomains: [] as string[],
  telemetryEnabled: false,
  enableCrossTabCrawl: false,
  pageSize: 20,
  scoringAlgorithm: 'default',
  fuzzyEnabled: true,
  diversifyResults: false,
  theme: 'light',
  compactMode: false,
  bookmarkStorageMode: 'reef',
  searchEngine: 'google',
  customSearchUrl: '',
  shortcutSpotlight: 'Ctrl+Shift+L',
  shortcutPopup: 'Ctrl+Shift+R',
};

document.addEventListener('DOMContentLoaded', async () => {
  const navItems = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('.settings-section');

  navItems.forEach((item) => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const target = (item as HTMLElement).dataset.section;
      if (!target) return;
      navItems.forEach((n) => n.classList.remove('active'));
      item.classList.add('active');
      sections.forEach((s) => s.classList.remove('visible'));
      const section = document.getElementById(`section-${target}`);
      if (section) section.classList.add('visible');
    });
  });

  const actionsModeControl = document.getElementById('actions-mode-control')!;
  const confirmDestructive = document.getElementById('confirm-destructive') as HTMLInputElement;
  const autoExecute = document.getElementById('auto-execute') as HTMLInputElement;
  const exclusionSelectorsInput = document.getElementById('exclusion-selectors') as HTMLTextAreaElement;
  const blockedDomainsInput = document.getElementById('blocked-domains') as HTMLTextAreaElement;
  const telemetryEnabled = document.getElementById('telemetry-enabled') as HTMLInputElement;
  const enableCrossTabCrawl = document.getElementById('enable-cross-tab-crawl') as HTMLInputElement;
  const pageSizeInput = document.getElementById('page-size') as HTMLInputElement;
  const scoringControl = document.getElementById('scoring-control')!;
  const themeControl = document.getElementById('theme-control')!;
  const compactMode = document.getElementById('compact-mode') as HTMLInputElement;
  const fuzzyEnabled = document.getElementById('fuzzy-enabled') as HTMLInputElement;
  const diversifyResults = document.getElementById('diversify-results') as HTMLInputElement;
  const bookmarkStorageControl = document.getElementById('bookmark-storage-control')!;
  const searchEngineSelect = document.getElementById('search-engine') as HTMLSelectElement;
  const customSearchUrlInput = document.getElementById('custom-search-url') as HTMLInputElement;
  const shortcutSpotlightInput = document.getElementById('shortcut-spotlight') as HTMLInputElement;
  const shortcutPopupInput = document.getElementById('shortcut-popup') as HTMLInputElement;
  const shortcutStatus = document.getElementById('shortcut-status') as HTMLSpanElement;
  const saveBtn = document.getElementById('btn-save')!;
  const exportBtn = document.getElementById('btn-export')!;
  const importBtn = document.getElementById('btn-import')!;
  const clearCacheBtn = document.getElementById('btn-clear-cache')!;
  const clearHistoryBtn = document.getElementById('btn-clear-history')!;
  const resetBtn = document.getElementById('btn-reset')!;
  const saveStatus = document.getElementById('save-status')!;

  function setupSegmented(control: HTMLElement, callback: (value: string) => void) {
    const buttons = control.querySelectorAll('.seg-btn');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        buttons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        callback((btn as HTMLElement).dataset.value || '');
      });
    });
  }

  let selectedActionsMode = DEFAULTS.actionsMode;
  let selectedScoring = DEFAULTS.scoringAlgorithm;
  let selectedTheme = DEFAULTS.theme;
  let selectedBookmarkStorageMode = DEFAULTS.bookmarkStorageMode;

  setupSegmented(actionsModeControl, (value) => { selectedActionsMode = value; });
  setupSegmented(scoringControl, (value) => { selectedScoring = value; });
  setupSegmented(themeControl, (value) => {
    selectedTheme = value;
    applyTheme(selectedTheme);
  });
  setupSegmented(bookmarkStorageControl, (value) => { selectedBookmarkStorageMode = value; });

  function applyTheme(theme: string) {
    document.body.setAttribute('data-theme', theme);
  }

  searchEngineSelect.addEventListener('change', () => {
    customSearchUrlInput.style.display = searchEngineSelect.value === 'custom' ? '' : 'none';
  });

  function validateShortcut(shortcut: string): boolean {
    const pattern = /^(Ctrl|Alt|Command|MacCtrl)(\+(Shift|Alt))?(\+[A-Z0-9])$/i;
    return pattern.test(shortcut);
  }

  function setupShortcutInput(input: HTMLInputElement, statusEl: HTMLSpanElement) {
    input.addEventListener('keydown', (e) => {
      e.preventDefault();
      const parts: string[] = [];
      if (e.ctrlKey) parts.push('Ctrl');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');
      if (e.metaKey) parts.push('Command');
      if (e.key && !['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
        parts.push(e.key.toUpperCase());
      }
      input.value = parts.join('+');
      const valid = validateShortcut(input.value);
      statusEl.textContent = valid ? 'Valid' : 'Invalid format';
      statusEl.style.color = valid ? '#16a34a' : '#dc2626';
    });
  }

  setupShortcutInput(shortcutSpotlightInput, shortcutStatus);
  setupShortcutInput(shortcutPopupInput, shortcutStatus);

  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const data = await chrome.storage.local.get(Object.keys(DEFAULTS));

    selectedActionsMode = data.actionsMode || DEFAULTS.actionsMode;
    actionsModeControl.querySelectorAll('.seg-btn').forEach((btn) => {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.value === selectedActionsMode);
    });

    confirmDestructive.checked = data.confirmDestructive ?? DEFAULTS.confirmDestructive;
    autoExecute.checked = data.autoExecute ?? DEFAULTS.autoExecute;
    exclusionSelectorsInput.value = (data.exclusionSelectors || DEFAULTS.exclusionSelectors).join(', ');
    blockedDomainsInput.value = (data.blockedDomains || DEFAULTS.blockedDomains).join('\n');
    telemetryEnabled.checked = data.telemetryEnabled ?? DEFAULTS.telemetryEnabled;
    enableCrossTabCrawl.checked = data.enableCrossTabCrawl ?? DEFAULTS.enableCrossTabCrawl;
    pageSizeInput.value = String(data.pageSize ?? DEFAULTS.pageSize);

    selectedScoring = data.scoringAlgorithm || DEFAULTS.scoringAlgorithm;
    scoringControl.querySelectorAll('.seg-btn').forEach((btn) => {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.value === selectedScoring);
    });

    fuzzyEnabled.checked = data.fuzzyEnabled ?? DEFAULTS.fuzzyEnabled;
    diversifyResults.checked = data.diversifyResults ?? DEFAULTS.diversifyResults;

    selectedTheme = data.theme || DEFAULTS.theme;
    themeControl.querySelectorAll('.seg-btn').forEach((btn) => {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.value === selectedTheme);
    });
    applyTheme(selectedTheme);

    compactMode.checked = data.compactMode ?? DEFAULTS.compactMode;

    selectedBookmarkStorageMode = data.bookmarkStorageMode || DEFAULTS.bookmarkStorageMode;
    bookmarkStorageControl.querySelectorAll('.seg-btn').forEach((btn) => {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.value === selectedBookmarkStorageMode);
    });

    searchEngineSelect.value = data.searchEngine || DEFAULTS.searchEngine;
    customSearchUrlInput.value = data.customSearchUrl || DEFAULTS.customSearchUrl;
    customSearchUrlInput.style.display = searchEngineSelect.value === 'custom' ? '' : 'none';

    shortcutSpotlightInput.value = data.shortcutSpotlight || DEFAULTS.shortcutSpotlight;
    shortcutPopupInput.value = data.shortcutPopup || DEFAULTS.shortcutPopup;
  }

  async function saveSettings() {
    const settings: Record<string, unknown> = {
      actionsMode: selectedActionsMode,
      confirmDestructive: confirmDestructive.checked,
      autoExecute: autoExecute.checked,
      exclusionSelectors: exclusionSelectorsInput.value.split(',').map((s) => s.trim()).filter(Boolean),
      blockedDomains: blockedDomainsInput.value.split('\n').map((s) => s.trim()).filter(Boolean),
      telemetryEnabled: telemetryEnabled.checked,
      enableCrossTabCrawl: enableCrossTabCrawl.checked,
      pageSize: parseInt(pageSizeInput.value, 10) || DEFAULTS.pageSize,
      scoringAlgorithm: selectedScoring,
      fuzzyEnabled: fuzzyEnabled.checked,
      diversifyResults: diversifyResults.checked,
      theme: selectedTheme,
      compactMode: compactMode.checked,
      bookmarkStorageMode: selectedBookmarkStorageMode,
      searchEngine: searchEngineSelect.value,
      customSearchUrl: customSearchUrlInput.value,
      shortcutSpotlight: shortcutSpotlightInput.value,
      shortcutPopup: shortcutPopupInput.value,
    };

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set(settings);

      if (validateShortcut(shortcutSpotlightInput.value)) {
        try {
          await chrome.runtime.sendMessage({
            type: 'UPDATE_SHORTCUT',
            command: 'open-spotlight',
            shortcut: shortcutSpotlightInput.value,
          });
        } catch {
          // commands.update may not be supported
        }
      }

      if (validateShortcut(shortcutPopupInput.value)) {
        try {
          await chrome.runtime.sendMessage({
            type: 'UPDATE_SHORTCUT',
            command: 'open-popup',
            shortcut: shortcutPopupInput.value,
          });
        } catch {
          // commands.update may not be supported
        }
      }

      showSaveStatus('Settings saved');
    }
  }

  saveBtn.addEventListener('click', saveSettings);

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveSettings();
    }
  });

  exportBtn.addEventListener('click', async () => {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    const data = await chrome.storage.local.get(null);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'reef-settings.json';
    a.click();
    URL.revokeObjectURL(url);
    showSaveStatus('Settings exported');
  });

  importBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (typeof chrome !== 'undefined' && chrome.storage?.local) {
          await chrome.storage.local.set(data);
          showSaveStatus('Settings imported — reload page to apply');
          setTimeout(() => location.reload(), 1500);
        }
      } catch {
        showSaveStatus('Import failed: invalid file');
      }
    });
    input.click();
  });

  clearCacheBtn.addEventListener('click', async () => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.remove(['cachedIndices', 'siteIndices']);
      showSaveStatus('Cache cleared');
    }
  });

  clearHistoryBtn.addEventListener('click', async () => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.remove(['queryHistory', 'popularQueries']);
      showSaveStatus('History cleared');
    }
  });

  resetBtn.addEventListener('click', async () => {
    if (!confirm('Reset all settings to defaults? This cannot be undone.')) return;
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.clear();
      await chrome.storage.local.set(DEFAULTS);
      showSaveStatus('Settings reset to defaults');
      setTimeout(() => location.reload(), 1000);
    }
  });

  function showSaveStatus(msg: string) {
    saveStatus.textContent = msg;
    saveStatus.classList.remove('hidden');
    setTimeout(() => saveStatus.classList.add('hidden'), 2500);
  }
});
