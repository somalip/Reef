import {
  createSearchIndex,
  addToIndex,
  searchSections,
  type SearchIndex,
  type IndexRecord,
} from '../../../src/search.js';

interface PopupTab {
  id: number;
  url: string;
  title: string;
  favIconUrl?: string;
}

let activeTabId: number | null = null;
let activeTabInfo: chrome.tabs.Tab | null = null;
let currentMode = 'page';
let pageFilter = 'all';
let pageQuery = '';
let pageResults: IndexRecord[] = [];
let allPageRecords: IndexRecord[] = [];
let tabQuery = '';
let tabResults: Array<{ tab: PopupTab; score: number; matchedRecords: IndexRecord[] }> = [];
let libFilter = 'bookmarks';
let libQuery = '';
let bookmarksCache: any[] = [];
let snippetsCache: any[] = [];
let notesCache: any[] = [];
let recentsCache: any[] = [];
let browserSubFilter = 'history';
let browserQuery = '';
let historyCache: chrome.history.HistoryItem[] = [];
let downloadsCache: chrome.downloads.DownloadItem[] = [];
let sessionsCache: any[] = [];

let pageSelectedIndex = -1;
let tabSelectedIndex = -1;
let libSelectedIndex = -1;
let browserSelectedIndex = -1;

let bookmarkStorageMode = 'reef';
let searchEngine = 'google';
let customSearchUrl = '';

document.addEventListener('DOMContentLoaded', async () => {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const stored = await chrome.storage.local.get([
      'theme',
      'bookmarkStorageMode',
      'searchEngine',
      'customSearchUrl',
    ]);
    document.body.setAttribute('data-theme', stored.theme || 'light');
    bookmarkStorageMode = stored.bookmarkStorageMode || 'reef';
    searchEngine = stored.searchEngine || 'google';
    customSearchUrl = stored.customSearchUrl || '';
  }

  const searchInput = document.getElementById('search-input') as HTMLInputElement;
  const clearBtn = document.getElementById('btn-clear') as HTMLButtonElement;
  const optionsBtn = document.getElementById('btn-options') as HTMLButtonElement;
  const filterTabs = document.getElementById('filter-tabs') as HTMLDivElement;
  const resultsContainer = document.getElementById('results-container') as HTMLDivElement;
  const manifestBadge = document.getElementById('manifest-badge') as HTMLSpanElement;
  const statsLabel = document.getElementById('stats-label') as HTMLSpanElement;
  const footerHint = document.getElementById('footer-hint') as HTMLSpanElement;
  const modeTabs = document.getElementById('mode-tabs') as HTMLDivElement;
  const panels = document.querySelectorAll('.mode-panel');
  const tabSearchInput = document.getElementById('tab-search-input') as HTMLInputElement;
  const tabSearchClear = document.getElementById('tab-search-clear') as HTMLButtonElement;
  const tabsContainer = document.getElementById('tabs-container') as HTMLDivElement;
  const libSearchInput = document.getElementById('library-search-input') as HTMLInputElement;
  const libSearchClear = document.getElementById('library-search-clear') as HTMLButtonElement;
  const libTabs = document.getElementById('library-tabs') as HTMLDivElement;
  const libContainer = document.getElementById('library-container') as HTMLDivElement;
  const btnBookmarkTab = document.getElementById('btn-bookmark-tab') as HTMLButtonElement;
  const browserSearchInput = document.getElementById('browser-search-input') as HTMLInputElement;
  const browserSearchClear = document.getElementById('browser-search-clear') as HTMLButtonElement;
  const browserTools = document.getElementById('browser-tools') as HTMLDivElement;
  const browserSubTabs = document.getElementById('browser-sub-tabs') as HTMLDivElement;
  const browserContainer = document.getElementById('browser-container') as HTMLDivElement;

  optionsBtn.addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage();
    else window.open(chrome.runtime.getURL('src/options/options.html'));
  });

  modeTabs.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (!target.classList.contains('mode-tab')) return;
    const mode = target.dataset.mode;
    if (mode === currentMode) return;
    currentMode = mode!;
    modeTabs.querySelectorAll('.mode-tab').forEach((b) => {
      const active = b === target;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    panels.forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== mode));
    if (mode === 'page') {
      renderPageResults();
      searchInput.focus();
    } else if (mode === 'tabs') {
      runTabSearch();
      tabSearchInput.focus();
    } else if (mode === 'library') {
      loadLibrary();
      libSearchInput.focus();
    } else if (mode === 'browser') {
      loadBrowserPanel();
      browserSearchInput.focus();
    }
  });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    activeTabId = tab.id;
    activeTabInfo = tab;
    await performPageSearch();
  } else {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = 'No active tab accessible.';
    resultsContainer.appendChild(empty);
  }

  searchInput.addEventListener('input', () => {
    pageQuery = searchInput.value;
    clearBtn.classList.toggle('hidden', !pageQuery);
    if (pageQuery.trim()) {
      performPageSearch();
    } else {
      pageResults = allPageRecords.slice();
      pageSelectedIndex = pageSelectedIndex >= 0 ? Math.min(pageSelectedIndex, pageResults.length - 1) : -1;
      renderPageResults();
    }
  });

  searchInput.addEventListener('keydown', (e) => handleNavKey(e, 'page'));

  document.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
    handleNavKey(e, currentMode);
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    pageQuery = '';
    clearBtn.classList.add('hidden');
    searchInput.focus();
    performPageSearch();
  });

  filterTabs.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('tab-btn')) {
      filterTabs.querySelectorAll('.tab-btn').forEach((btn) => btn.classList.remove('active'));
      target.classList.add('active');
      pageFilter = target.dataset.type || 'all';
      pageSelectedIndex = -1;
      renderPageResults();
    }
  });

  async function performPageSearch() {
    if (!activeTabId) return;
    if (!pageQuery.trim() && allPageRecords.length > 0) {
      pageResults = allPageRecords.slice();
      pageSelectedIndex = pageSelectedIndex >= 0 && pageSelectedIndex < pageResults.length ? pageSelectedIndex : -1;
      renderPageResults();
      return;
    }
    const loading = document.createElement('div');
    loading.className = 'loading-state';
    loading.textContent = 'Indexing current page...';
    resultsContainer.replaceChildren(loading);

    const renderResults = (response: any) => {
      if (!response || !response.success) {
        resultsContainer.replaceChildren();
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = `Failed to index page. ${response?.error || ''}`;
        resultsContainer.appendChild(empty);
        return;
      }
      if (response.manifest?.version) {
        manifestBadge.textContent = 'Agent-Ready Site';
        manifestBadge.classList.add('authoritative');
      } else {
        manifestBadge.textContent = 'Dynamic Extract';
        manifestBadge.classList.remove('authoritative');
      }
      pageResults = response.results || [];
      allPageRecords = pageResults.slice();
      pageSelectedIndex = pageSelectedIndex >= 0 && pageSelectedIndex < pageResults.length ? pageSelectedIndex : -1;

      if (pageQuery.trim() && pageResults.length === 0 && currentMode === 'page') {
        switchToTabSearch(pageQuery);
        return;
      }

      renderPageResults();
    };

    chrome.runtime.sendMessage(
      { type: 'SEARCH_CURRENT_TAB', query: pageQuery, filter: pageFilter },
      renderResults
    );
  }

  function renderPageResults() {
    resultsContainer.replaceChildren();
    const filtered = pageFilter === 'all' ? pageResults : pageResults.filter((r) => r.type === pageFilter);
    statsLabel.textContent = `${filtered.length} items found`;

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = pageQuery ? 'No results. Try a different search.' : 'Start typing to search this page.';
      resultsContainer.appendChild(empty);
      return;
    }

    filtered.forEach((record, idx) => {
      const card = document.createElement('div');
      card.className = 'result-card';
      card.dataset.index = String(idx);
      if (idx === pageSelectedIndex) card.classList.add('keyboard-selected');

      const title = document.createElement('div');
      title.className = 'result-title';
      title.textContent = record.headingText || record.label || record.title || 'Untitled';
      card.appendChild(title);

      if (record.bodyText) {
        const snippet = document.createElement('div');
        snippet.className = 'result-snippet';
        snippet.textContent = record.bodyText.slice(0, 120);
        card.appendChild(snippet);
      }

      const meta = document.createElement('div');
      meta.className = 'result-meta';
      const pill = document.createElement('span');
      pill.className = `type-pill ${record.type}`;
      pill.textContent = record.type;
      meta.appendChild(pill);
      card.appendChild(meta);

      card.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'EXECUTE_TAB_ACTION', record });
        window.close();
      });

      card.addEventListener('mouseenter', () => {
        pageSelectedIndex = idx;
        applySelection('page', idx, false);
      });

      resultsContainer.appendChild(card);
    });
  }

  function switchToTabSearch(query: string) {
    currentMode = 'tabs';
    modeTabs.querySelectorAll('.mode-tab').forEach((b) => {
      const active = b.dataset.mode === 'tabs';
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    panels.forEach((p) => p.classList.toggle('hidden', p.dataset.panel !== 'tabs'));
    tabSearchInput.value = query;
    tabQuery = query;
    runTabSearch();
  }

  tabSearchInput.addEventListener('input', () => {
    tabQuery = tabSearchInput.value;
    tabSearchClear.classList.toggle('hidden', !tabQuery);
    runTabSearch();
  });

  tabSearchInput.addEventListener('keydown', (e) => handleNavKey(e, 'tabs'));

  tabSearchClear.addEventListener('click', () => {
    tabSearchInput.value = '';
    tabQuery = '';
    tabSearchClear.classList.add('hidden');
    tabSearchInput.focus();
    runTabSearch();
  });

  async function runTabSearch() {
    const loading = document.createElement('div');
    loading.className = 'loading-state';
    loading.textContent = 'Searching tabs...';
    tabsContainer.replaceChildren(loading);
    const res = await chrome.runtime.sendMessage({ type: 'TAB_SEARCH', query: tabQuery });
    if (!res?.success) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = 'Failed to search tabs.';
      tabsContainer.replaceChildren(empty);
      return;
    }
    tabResults = res.items || [];
    tabSelectedIndex = -1;
    renderTabResults();
  }

  function renderTabResults() {
    tabsContainer.replaceChildren();
    statsLabel.textContent = `${tabResults.length} tabs found`;

    if (tabResults.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = tabQuery ? 'No matching tabs.' : 'Type to search all open tabs.';
      tabsContainer.appendChild(empty);
      return;
    }

    tabResults.forEach((item, idx) => {
      const card = document.createElement('div');
      card.className = 'result-card';
      card.dataset.index = String(idx);
      if (idx === tabSelectedIndex) card.classList.add('keyboard-selected');

      const topRow = document.createElement('div');
      topRow.className = 'card-top';
      const favicon = document.createElement('img');
      favicon.className = 'favicon';
      favicon.src = item.tab.favIconUrl || '';
      favicon.width = 16;
      favicon.height = 16;
      topRow.appendChild(favicon);
      const title = document.createElement('span');
      title.className = 'card-title';
      title.textContent = item.tab.title || item.tab.url;
      topRow.appendChild(title);
      card.appendChild(topRow);

      const url = document.createElement('div');
      url.className = 'card-url';
      url.textContent = item.tab.url;
      card.appendChild(url);

      if (item.matchedRecords.length > 0) {
        const match = item.matchedRecords[0];
        const snippet = document.createElement('div');
        snippet.className = 'card-snippet';
        snippet.textContent = (match.headingText || '') + ' — ' + (match.bodyText || '').slice(0, 80);
        card.appendChild(snippet);
      }

      card.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'TAB_SWITCH', tabId: item.tab.id, windowId: (activeTabInfo as any)?.windowId });
        window.close();
      });

      card.addEventListener('mouseenter', () => {
        tabSelectedIndex = idx;
        applySelection('tabs', idx, false);
      });

      tabsContainer.appendChild(card);
    });
  }

  async function loadLibrary() {
    const loading = document.createElement('div');
    loading.className = 'loading-state';
    loading.textContent = 'Loading library...';
    libContainer.replaceChildren(loading);
    const [bookmarks, snippets, recents] = await Promise.all([
      chrome.runtime.sendMessage({ type: 'LIBRARY_BOOKMARKS_LIST', query: libQuery }),
      chrome.runtime.sendMessage({ type: 'LIBRARY_SNIPPETS_LIST', query: libQuery }),
      chrome.runtime.sendMessage({ type: 'LIBRARY_RECENTS_LIST' }),
    ]);
    bookmarksCache = bookmarks?.items || [];
    snippetsCache = snippets?.items || [];
    recentsCache = recents?.items || [];
    libSelectedIndex = -1;
    renderLibraryResults();
  }

  libSearchInput.addEventListener('input', () => {
    libQuery = libSearchInput.value;
    libSearchClear.classList.toggle('hidden', !libQuery);
    loadLibrary();
  });

  libSearchInput.addEventListener('keydown', (e) => handleNavKey(e, 'library'));

  libSearchClear.addEventListener('click', () => {
    libSearchInput.value = '';
    libQuery = '';
    libSearchClear.classList.add('hidden');
    libSearchInput.focus();
    loadLibrary();
  });

  libTabs.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('tab-btn')) {
      libTabs.querySelectorAll('.tab-btn').forEach((btn) => btn.classList.remove('active'));
      target.classList.add('active');
      libFilter = target.dataset.lib || 'bookmarks';
      libSelectedIndex = -1;
      renderLibraryResults();
    }
  });

  btnBookmarkTab.addEventListener('click', async () => {
    if (!activeTabInfo?.url) return;
    await chrome.runtime.sendMessage({
      type: 'LIBRARY_BOOKMARK_CREATE',
      data: {
        url: activeTabInfo.url,
        title: activeTabInfo.title || activeTabInfo.url,
        tags: [],
      },
    });
    loadLibrary();
  });

  function renderLibraryResults() {
    libContainer.replaceChildren();
    let items: any[] = [];
    if (libFilter === 'bookmarks') items = bookmarksCache;
    else if (libFilter === 'snippets') items = snippetsCache;
    else if (libFilter === 'recents') items = recentsCache;

    statsLabel.textContent = `${items.length} items`;

    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = `No ${libFilter} found.`;
      libContainer.appendChild(empty);
      return;
    }

    items.forEach((item, idx) => {
      const card = document.createElement('div');
      card.className = 'result-card';
      card.dataset.index = String(idx);
      if (idx === libSelectedIndex) card.classList.add('keyboard-selected');

      const title = document.createElement('div');
      title.className = 'result-title';
      title.textContent = item.title || item.text?.slice(0, 60) || 'Untitled';
      card.appendChild(title);

      if (item.url) {
        const url = document.createElement('div');
        url.className = 'card-url';
        url.textContent = item.url;
        card.appendChild(url);
      }

      card.addEventListener('click', () => {
        if (item.url) {
          chrome.tabs.create({ url: item.url });
          window.close();
        }
      });

      card.addEventListener('mouseenter', () => {
        libSelectedIndex = idx;
        applySelection('library', idx, false);
      });

      libContainer.appendChild(card);
    });
  }

  async function loadBrowserPanel() {
    const loading = document.createElement('div');
    loading.className = 'loading-state';
    loading.textContent = 'Loading...';
    browserContainer.replaceChildren(loading);
    const [history, downloads, sessions] = await Promise.all([
      chrome.runtime.sendMessage({ type: 'BROWSER_HISTORY_SEARCH', query: browserQuery }),
      chrome.runtime.sendMessage({ type: 'BROWSER_DOWNLOADS_SEARCH', query: browserQuery }),
      chrome.storage.local.get(['reef:sessions']),
    ]);
    historyCache = history?.items || [];
    downloadsCache = downloads?.items || [];
    sessionsCache = (sessions as any)['reef:sessions'] || [];
    browserSelectedIndex = -1;
    renderBrowserResults();
  }

  browserSearchInput.addEventListener('input', () => {
    browserQuery = browserSearchInput.value;
    browserSearchClear.classList.toggle('hidden', !browserQuery);
    loadBrowserPanel();
  });

  browserSearchInput.addEventListener('keydown', (e) => handleNavKey(e, 'browser'));

  browserSearchClear.addEventListener('click', () => {
    browserSearchInput.value = '';
    browserQuery = '';
    browserSearchClear.classList.add('hidden');
    browserSearchInput.focus();
    loadBrowserPanel();
  });

  browserTools.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('.tool-btn') as HTMLElement;
    if (!btn) return;
    const action = btn.dataset.action;
    if (action) {
      chrome.runtime.sendMessage({ type: 'BROWSER_ACTION_EXECUTE', action });
      window.close();
    }
  });

  browserSubTabs.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (target.classList.contains('tab-btn')) {
      browserSubTabs.querySelectorAll('.tab-btn').forEach((btn) => btn.classList.remove('active'));
      target.classList.add('active');
      browserSubFilter = target.dataset.browser || 'history';
      browserSelectedIndex = -1;
      renderBrowserResults();
    }
  });

  function renderBrowserResults() {
    browserContainer.replaceChildren();
    let items: any[] = [];
    if (browserSubFilter === 'history') items = historyCache;
    else if (browserSubFilter === 'downloads') items = downloadsCache;
    else if (browserSubFilter === 'sessions') items = sessionsCache;

    statsLabel.textContent = `${items.length} items`;

    if (items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = `No ${browserSubFilter} found.`;
      browserContainer.appendChild(empty);
      return;
    }

    items.forEach((item, idx) => {
      const card = document.createElement('div');
      card.className = 'result-card';
      card.dataset.index = String(idx);
      if (idx === browserSelectedIndex) card.classList.add('keyboard-selected');

      const title = document.createElement('div');
      title.className = 'result-title';
      title.textContent = item.title || item.filename || item.name || 'Untitled';
      card.appendChild(title);

      if (item.url) {
        const url = document.createElement('div');
        url.className = 'card-url';
        url.textContent = item.url;
        card.appendChild(url);
      }

      card.addEventListener('click', () => {
        if (item.url) {
          chrome.tabs.create({ url: item.url });
          window.close();
        }
      });

      card.addEventListener('mouseenter', () => {
        browserSelectedIndex = idx;
        applySelection('browser', idx, false);
      });

      browserContainer.appendChild(card);
    });
  }

  function getActiveContainer() {
    if (currentMode === 'page') return resultsContainer;
    if (currentMode === 'tabs') return tabsContainer;
    if (currentMode === 'library') return libContainer;
    if (currentMode === 'browser') return browserContainer;
    return null;
  }

  function getSelectedIndex() {
    if (currentMode === 'page') return pageSelectedIndex;
    if (currentMode === 'tabs') return tabSelectedIndex;
    if (currentMode === 'library') return libSelectedIndex;
    if (currentMode === 'browser') return browserSelectedIndex;
    return -1;
  }

  function setSelectedIndex(idx: number) {
    if (currentMode === 'page') pageSelectedIndex = idx;
    else if (currentMode === 'tabs') tabSelectedIndex = idx;
    else if (currentMode === 'library') libSelectedIndex = idx;
    else if (currentMode === 'browser') browserSelectedIndex = idx;
  }

  function handleNavKey(e: KeyboardEvent, panel: string) {
    if (panel !== currentMode) return;
    const container = getActiveContainer();
    if (!container) return;
    const cards = Array.from(container.querySelectorAll('.result-card[data-index]'));
    if (cards.length === 0) return;
    let idx = getSelectedIndex();

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      idx = idx < cards.length - 1 ? idx + 1 : 0;
      setSelectedIndex(idx);
      applySelection(panel, idx, true);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      idx = idx > 0 ? idx - 1 : cards.length - 1;
      setSelectedIndex(idx);
      applySelection(panel, idx, true);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setSelectedIndex(0);
      applySelection(panel, 0, true);
    } else if (e.key === 'End') {
      e.preventDefault();
      setSelectedIndex(cards.length - 1);
      applySelection(panel, cards.length - 1, true);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (idx >= 0 && idx < cards.length) {
        (cards[idx] as HTMLElement).click();
      }
    }
  }

  function applySelection(panel: string, idx: number, scroll: boolean) {
    let container: HTMLElement | null;
    if (panel === 'page') container = resultsContainer;
    else if (panel === 'tabs') container = tabsContainer;
    else if (panel === 'library') container = libContainer;
    else if (panel === 'browser') container = browserContainer;
    else return;

    const cards = Array.from(container.querySelectorAll('.result-card[data-index]'));
    cards.forEach((c) => c.classList.remove('keyboard-selected'));
    if (idx >= 0 && idx < cards.length) {
      cards[idx].classList.add('keyboard-selected');
      if (scroll) cards[idx].scrollIntoView({ block: 'nearest' });
    }
  }
});
