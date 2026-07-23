/**
 * @file Options page script for Reef for Browsers.
 * Manages user preferences in chrome.storage.local.
 */

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
  theme: 'light' as 'light' | 'dark' | 'system',
  compactMode: false,
};

document.addEventListener('DOMContentLoaded', async () => {
  // ─── NAV ───
  const navItems = document.querySelectorAll('.nav-item');
  const sections = document.querySelectorAll('.settings-section');

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const target = item.dataset.section;
      if (!target) return;

      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');

      sections.forEach(s => s.classList.remove('visible'));
      const section = document.getElementById(`section-${target}`);
      if (section) section.classList.add('visible');
    });
  });

  // ─── ELEMENTS ───
  const actionsModeControl = document.getElementById('actions-mode-control');
  const confirmDestructive = document.getElementById('confirm-destructive') as HTMLInputElement;
  const autoExecute = document.getElementById('auto-execute') as HTMLInputElement;
  const exclusionSelectorsInput = document.getElementById('exclusion-selectors') as HTMLTextAreaElement;
  const blockedDomainsInput = document.getElementById('blocked-domains') as HTMLTextAreaElement;
  const telemetryEnabled = document.getElementById('telemetry-enabled') as HTMLInputElement;
  const enableCrossTabCrawl = document.getElementById('enable-cross-tab-crawl') as HTMLInputElement;
  const pageSizeInput = document.getElementById('page-size') as HTMLInputElement;
  const scoringControl = document.getElementById('scoring-control');
  const themeControl = document.getElementById('theme-control');
  const compactMode = document.getElementById('compact-mode') as HTMLInputElement;
  const fuzzyEnabled = document.getElementById('fuzzy-enabled') as HTMLInputElement;
  const diversifyResults = document.getElementById('diversify-results') as HTMLInputElement;
  const saveBtn = document.getElementById('btn-save') as HTMLButtonElement;
  const exportBtn = document.getElementById('btn-export') as HTMLButtonElement;
  const importBtn = document.getElementById('btn-import') as HTMLButtonElement;
  const clearCacheBtn = document.getElementById('btn-clear-cache') as HTMLButtonElement;
  const clearHistoryBtn = document.getElementById('btn-clear-history') as HTMLButtonElement;
  const resetBtn = document.getElementById('btn-reset') as HTMLButtonElement;
  const saveStatus = document.getElementById('save-status') as HTMLDivElement;

  // ─── SEGMENTED CONTROLS ───
  function setupSegmented(control: HTMLElement, callback: (value: string) => void) {
    const buttons = control.querySelectorAll('.seg-btn');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        buttons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        callback((btn as HTMLElement).dataset.value || '');
      });
    });
  }

  let selectedActionsMode = DEFAULTS.actionsMode;
  let selectedScoring = DEFAULTS.scoringAlgorithm;
  let selectedTheme = DEFAULTS.theme;

  setupSegmented(actionsModeControl!, (value) => { selectedActionsMode = value; });
  setupSegmented(scoringControl!, (value) => { selectedScoring = value; });
  setupSegmented(themeControl!, (value) => {
    selectedTheme = value as 'light' | 'dark' | 'system';
    applyTheme(selectedTheme);
  });

  // ─── THEME ───
  function applyTheme(theme: 'light' | 'dark' | 'system') {
    document.body.setAttribute('data-theme', theme);
  }

  // ─── LOAD ───
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const data = await chrome.storage.local.get(Object.keys(DEFAULTS));

    // Actions mode
    selectedActionsMode = data.actionsMode || DEFAULTS.actionsMode;
    actionsModeControl!.querySelectorAll('.seg-btn').forEach(btn => {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.value === selectedActionsMode);
    });

    confirmDestructive.checked = data.confirmDestructive ?? DEFAULTS.confirmDestructive;
    autoExecute.checked = data.autoExecute ?? DEFAULTS.autoExecute;

    exclusionSelectorsInput.value = ((data.exclusionSelectors as string[]) || DEFAULTS.exclusionSelectors).join(', ');
    blockedDomainsInput.value = ((data.blockedDomains as string[]) || DEFAULTS.blockedDomains).join('\n');

    telemetryEnabled.checked = data.telemetryEnabled ?? DEFAULTS.telemetryEnabled;
    enableCrossTabCrawl.checked = data.enableCrossTabCrawl ?? DEFAULTS.enableCrossTabCrawl;

    pageSizeInput.value = String(data.pageSize ?? DEFAULTS.pageSize);

    selectedScoring = data.scoringAlgorithm || DEFAULTS.scoringAlgorithm;
    scoringControl!.querySelectorAll('.seg-btn').forEach(btn => {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.value === selectedScoring);
    });

    fuzzyEnabled.checked = data.fuzzyEnabled ?? DEFAULTS.fuzzyEnabled;
    diversifyResults.checked = data.diversifyResults ?? DEFAULTS.diversifyResults;

    selectedTheme = (data.theme as 'light' | 'dark' | 'system') || DEFAULTS.theme;
    themeControl!.querySelectorAll('.seg-btn').forEach(btn => {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.value === selectedTheme);
    });
    applyTheme(selectedTheme);

    compactMode.checked = data.compactMode ?? DEFAULTS.compactMode;
  }

  // ─── SAVE ───
  async function saveSettings() {
    const settings = {
      actionsMode: selectedActionsMode,
      confirmDestructive: confirmDestructive.checked,
      autoExecute: autoExecute.checked,
      exclusionSelectors: exclusionSelectorsInput.value.split(',').map(s => s.trim()).filter(Boolean),
      blockedDomains: blockedDomainsInput.value.split('\n').map(s => s.trim()).filter(Boolean),
      telemetryEnabled: telemetryEnabled.checked,
      enableCrossTabCrawl: enableCrossTabCrawl.checked,
      pageSize: parseInt(pageSizeInput.value, 10) || DEFAULTS.pageSize,
      scoringAlgorithm: selectedScoring,
      fuzzyEnabled: fuzzyEnabled.checked,
      diversifyResults: diversifyResults.checked,
      theme: selectedTheme,
      compactMode: compactMode.checked,
    };

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set(settings);
      showSaveStatus('Settings saved');
    }
  }

  saveBtn.addEventListener('click', saveSettings);

  // Ctrl+S / Cmd+S to save
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      saveSettings();
    }
  });

  // ─── EXPORT ───
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

  // ─── IMPORT ───
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

  // ─── CLEAR CACHE ───
  clearCacheBtn.addEventListener('click', async () => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.remove(['cachedIndices', 'siteIndices']);
      showSaveStatus('Cache cleared');
    }
  });

  // ─── CLEAR HISTORY ───
  clearHistoryBtn.addEventListener('click', async () => {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.remove(['queryHistory', 'popularQueries']);
      showSaveStatus('History cleared');
    }
  });

  // ─── RESET ───
  resetBtn.addEventListener('click', async () => {
    if (!confirm('Reset all settings to defaults? This cannot be undone.')) return;
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.clear();
      await chrome.storage.local.set(DEFAULTS);
      showSaveStatus('Settings reset to defaults');
      setTimeout(() => location.reload(), 1000);
    }
  });

  // ─── STATUS ───
  function showSaveStatus(msg: string) {
    saveStatus.textContent = msg;
    saveStatus.classList.remove('hidden');
    setTimeout(() => saveStatus.classList.add('hidden'), 2500);
  }
});
