/**
 * @file Background Service Worker for Reef for Browsers.
 * Manages search index state per tab, storage persistence, message routing,
 * omnibox keyword handler, optional cross-tab site crawl, and the Library
 * (bookmarks / snippets / notes / recents) plus tab search.
 */

import { createSearchIndex, addToIndex, searchSections, searchWithPagination, suggest } from '../../src/search-index.js';
import type { SearchIndex } from '../../src/search-index.js';
import type { IndexRecord, SearchOptions } from '../../src/types.js';
import type { AgentManifest } from '../../src/agent-ready.js';
import { Indexer } from '../../src/indexing/indexer.js';
import {
  listBookmarks, createBookmark, updateBookmark, deleteBookmark,
  listSnippets, createSnippet, updateSnippet, deleteSnippet,
  getPageNote, setPageNote, deletePageNote, listPageNotes,
  listRecents, recordRecent, clearRecents,
  allBookmarkTags, allSnippetTags,
  type Bookmark, type Snippet, type PageNote,
} from './storage.js';

interface TabIndexState {
  index: SearchIndex;
  manifest?: AgentManifest;
  lastUpdated: number;
}

const tabIndices = new Map<number, TabIndexState>();
const siteIndices = new Map<string, SearchIndex>();

// ─── OPTIONS ─────────────────────────────────────────────
async function getOptions() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) {
    return {
      actionsMode: 'execute',
      allowDenyList: [],
      exclusionSelectors: [],
      telemetryEnabled: false,
      enableCrossTabCrawl: false,
    };
  }
  const data = await chrome.storage.local.get([
    'actionsMode', 'allowDenyList', 'exclusionSelectors',
    'telemetryEnabled', 'enableCrossTabCrawl',
  ]);
  return {
    actionsMode: data.actionsMode || 'execute',
    allowDenyList: data.allowDenyList || [],
    exclusionSelectors: data.exclusionSelectors || [],
    telemetryEnabled: data.telemetryEnabled || false,
    enableCrossTabCrawl: data.enableCrossTabCrawl || false,
  };
}

// ─── TAB INDEX ────────────────────────────────────────────
async function getOrFetchTabIndex(tabId: number, forceRefresh = false): Promise<TabIndexState | null> {
  if (!forceRefresh && tabIndices.has(tabId)) {
    return tabIndices.get(tabId)!;
  }

  try {
    const response: any = await chrome.tabs.sendMessage(tabId, { type: 'GET_MANIFEST' });
    if (response && response.success && response.manifest) {
      const index = createSearchIndex();
      addToIndex(index, response.manifest.records);

      const state: TabIndexState = {
        index,
        manifest: response.manifest,
        lastUpdated: Date.now(),
      };
      tabIndices.set(tabId, state);

      const options = await getOptions();
      if (options.enableCrossTabCrawl && response.manifest.url) {
        try {
          const urlObj = new URL(response.manifest.url);
          const origin = urlObj.origin;
          let siteIndex = siteIndices.get(origin);
          if (!siteIndex) {
            siteIndex = createSearchIndex();
            siteIndices.set(origin, siteIndex);
          }
          addToIndex(siteIndex, response.manifest.records);
        } catch {
          // Invalid URL
        }
      }

      // Record recent page
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab.url && tab.title) {
          await recordRecent({
            url: tab.url,
            title: tab.title,
            favicon: tab.favIconUrl,
            recordCount: response.manifest.records.length,
          });
        }
      } catch {
        // Tab may have closed
      }

      return state;
    }
  } catch (err) {
    console.warn(`[Reef Background] Failed to fetch manifest from tab ${tabId}:`, err);
  }

  return null;
}

// ─── CONTEXT MENU ────────────────────────────────────────
function ensureContextMenus() {
  if (typeof chrome === 'undefined' || !chrome.contextMenus) return;
  const api = (chrome as any).contextMenus;
  if (!api) return;

  const create = (id: string, title: string, contexts: chrome.contextMenus.ContextType[]) => {
    try {
      api.create({ id, title, contexts }, () => {
        // Ignore "already exists" errors when service worker wakes up
        void chrome.runtime.lastError;
      });
    } catch {
      // ignore
    }
  };

  create('reef-bookmark-selection', 'Bookmark selection in Reef', ['selection']);
  create('reef-snippet-selection', 'Save selection as snippet', ['selection']);
  create('reef-search-selection', 'Search "%s" in Reef', ['selection']);
  create('reef-note-page', 'Add note to this page', ['page', 'selection']);
  create('reef-bookmark-page', 'Bookmark this page in Reef', ['page']);
}

if (typeof chrome !== 'undefined') {
  if (chrome.runtime?.onInstalled) {
    chrome.runtime.onInstalled.addListener(() => ensureContextMenus());
  }
  if (chrome.runtime?.onStartup) {
    chrome.runtime.onStartup.addListener(() => ensureContextMenus());
  }
  // MV3 service workers may wake up without onInstalled firing
  ensureContextMenus();
}

if (typeof chrome !== 'undefined' && (chrome as any).contextMenus?.onClicked) {
  (chrome as any).contextMenus.onClicked.addListener(async (info: any, tab?: chrome.tabs.Tab) => {
    try {
      if (info.menuItemId === 'reef-bookmark-selection' && info.selectionText && tab?.id !== undefined) {
        await chrome.tabs.sendMessage(tab.id, { type: 'REEF_BOOKMARK_SELECTION', text: info.selectionText });
        return;
      }
      if (info.menuItemId === 'reef-snippet-selection' && info.selectionText && tab?.id !== undefined) {
        await chrome.tabs.sendMessage(tab.id, { type: 'REEF_SNIPPET_SELECTION', text: info.selectionText });
        return;
      }
      if (info.menuItemId === 'reef-search-selection' && info.selectionText && tab?.id !== undefined) {
        await chrome.tabs.sendMessage(tab.id, { type: 'REEF_OPEN_POPUP_QUERY', query: info.selectionText });
        chrome.action?.openPopup?.();
        return;
      }
      if (info.menuItemId === 'reef-note-page' && tab?.id !== undefined) {
        await chrome.tabs.sendMessage(tab.id, { type: 'REEF_OPEN_NOTE_FOR_PAGE' });
        chrome.action?.openPopup?.();
        return;
      }
      if (info.menuItemId === 'reef-bookmark-page' && tab?.id !== undefined) {
        await chrome.tabs.sendMessage(tab.id, { type: 'REEF_BOOKMARK_PAGE' });
        return;
      }
    } catch (err) {
      console.warn('[Reef Background] Context menu action failed:', err);
    }
  });
}

// ─── OMNIBOX ──────────────────────────────────────────────
if (typeof chrome !== 'undefined' && chrome.omnibox) {
  chrome.omnibox.onInputChanged.addListener(async (text, suggestCallback) => {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.id) return;

    const state = await getOrFetchTabIndex(activeTab.id);
    if (!state) return;

    const results = searchSections(text, state.index, { limit: 5 }) as IndexRecord[];
    const suggestions = results.map(r => ({
      content: r.url || r.headingText,
      description: `<match>${escapeXml(r.headingText)}</match> - ${escapeXml(r.bodyText?.slice(0, 60) || '')}`,
    }));
    suggestCallback(suggestions);
  });

  chrome.omnibox.onInputEntered.addListener(async (text, disposition) => {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.id) return;

    const state = await getOrFetchTabIndex(activeTab.id);
    if (!state) return;

    const results = searchSections(text, state.index, { limit: 1 }) as IndexRecord[];
    if (results.length > 0) {
      const record = results[0];
      await chrome.tabs.sendMessage(activeTab.id, {
        type: 'EXECUTE_ACTION',
        record,
        actionType: record.type === 'field' ? 'type' : 'click',
      });
    }
  });
}

function escapeXml(str: string): string {
  return str.replace(/[<>&'"]/g, c => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

// ─── TAB SEARCH ───────────────────────────────────────────
async function searchOpenTabs(query: string, limit = 25): Promise<any[]> {
  if (!query.trim() || typeof chrome === 'undefined' || !chrome.tabs) return [];
  const q = query.toLowerCase();
  const tabs = await chrome.tabs.query({});

  const matches: { tab: chrome.tabs.Tab; score: number; matchedRecords: IndexRecord[] }[] = [];

  for (const tab of tabs) {
    if (!tab.id || !tab.url || !tab.title) continue;
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('about:') || tab.url.startsWith('moz-extension:')) continue;

    let score = 0;
    const matchedRecords: IndexRecord[] = [];
    const title = tab.title.toLowerCase();
    const url = tab.url.toLowerCase();

    if (title.includes(q)) score += 10;
    if (url.includes(q)) score += 5;

    // Search cached index for tab
    const state = tabIndices.get(tab.id);
    if (state) {
      try {
        const hits = searchSections(query, state.index, { limit: 3 }) as IndexRecord[];
        if (hits.length) {
          score += 8;
          matchedRecords.push(...hits);
        }
      } catch {
        // ignore search errors
      }
    } else if (score === 0) {
      // Skip if we have no signal at all
      continue;
    }

    if (score > 0) {
      matches.push({ tab, score, matchedRecords });
    }
  }

  matches.sort((a, b) => b.score - a.score);

  return matches.slice(0, limit).map(m => ({
    tabId: m.tab.id,
    title: m.tab.title,
    url: m.tab.url,
    favIconUrl: m.tab.favIconUrl,
    windowId: m.tab.windowId,
    score: m.score,
    matchedRecords: m.matchedRecords.map(r => ({
      headingText: r.headingText,
      bodyText: (r.bodyText || '').slice(0, 120),
      selector: r.selector,
      type: r.type,
    })),
  }));
}

// ─── MESSAGE ROUTER ───────────────────────────────────────
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
      try {
        // Existing search
        if (message.type === 'SEARCH_CURRENT_TAB') {
          const tabId = message.tabId || sender.tab?.id;
          if (!tabId) { sendResponse({ success: false, error: 'no-tab-id' }); return; }

          const state = await getOrFetchTabIndex(tabId, message.forceRefresh);
          if (!state) { sendResponse({ success: false, error: 'failed-to-index-tab' }); return; }

          const options: SearchOptions = message.searchOptions || {};
          const paginated = searchWithPagination(message.query || '', state.index, options);
          const suggestions = suggest(message.query || '', state.index);
          const results = paginated.results.map((sr: any) => sr.record ?? sr);

          sendResponse({
            success: true,
            results,
            total: paginated.total,
            hasMore: paginated.hasMore,
            suggestions,
            manifest: state.manifest,
          });
          return;
        }

        if (message.type === 'EXECUTE_TAB_ACTION') {
          const tabId = message.tabId || sender.tab?.id;
          if (!tabId) { sendResponse({ success: false, error: 'no-tab-id' }); return; }
          const opts = await getOptions();
          const response = await chrome.tabs.sendMessage(tabId, {
            type: 'EXECUTE_ACTION',
            record: message.record,
            actionType: message.actionType,
            value: message.value,
            options: {
              actionsMode: opts.actionsMode,
              exclusionSelectors: opts.exclusionSelectors,
            },
          });
          sendResponse(response);
          return;
        }

        if (message.type === 'CRAWL_SITE_CROSS_TAB') {
          const tabId = message.tabId || sender.tab?.id;
          if (!tabId) { sendResponse({ success: false, error: 'no-tab-id' }); return; }
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab?.url) { sendResponse({ success: false, error: 'no-tab-url' }); return; }
          const indexer = new Indexer({ scope: 'body', indexActions: true });
          await indexer.crawlSameOrigin(() => {
            const crawledIndex = indexer.getIndex();
            siteIndices.set(new URL(tab.url!).origin, crawledIndex);
            sendResponse({ success: true });
          });
          return;
        }

        // Library — bookmarks
        if (message.type === 'LIBRARY_BOOKMARK_LIST') {
          sendResponse({ success: true, items: await listBookmarks(message.query || '', message.tags || []) });
          return;
        }
        if (message.type === 'LIBRARY_BOOKMARK_CREATE') {
          const bookmark = await createBookmark(message.data as Omit<Bookmark, 'id' | 'createdAt' | 'updatedAt'>);
          sendResponse({ success: true, item: bookmark });
          return;
        }
        if (message.type === 'LIBRARY_BOOKMARK_UPDATE') {
          const item = await updateBookmark(message.id, message.data || {});
          sendResponse({ success: !!item, item });
          return;
        }
        if (message.type === 'LIBRARY_BOOKMARK_DELETE') {
          sendResponse({ success: await deleteBookmark(message.id) });
          return;
        }

        // Library — snippets
        if (message.type === 'LIBRARY_SNIPPET_LIST') {
          sendResponse({ success: true, items: await listSnippets(message.query || '', message.tags || []) });
          return;
        }
        if (message.type === 'LIBRARY_SNIPPET_CREATE') {
          const snippet = await createSnippet(message.data as Omit<Snippet, 'id' | 'createdAt' | 'updatedAt'>);
          sendResponse({ success: true, item: snippet });
          return;
        }
        if (message.type === 'LIBRARY_SNIPPET_UPDATE') {
          const item = await updateSnippet(message.id, message.data || {});
          sendResponse({ success: !!item, item });
          return;
        }
        if (message.type === 'LIBRARY_SNIPPET_DELETE') {
          sendResponse({ success: await deleteSnippet(message.id) });
          return;
        }

        // Library — page notes
        if (message.type === 'LIBRARY_NOTE_GET') {
          sendResponse({ success: true, item: await getPageNote(message.url) });
          return;
        }
        if (message.type === 'LIBRARY_NOTE_LIST') {
          sendResponse({ success: true, items: await listPageNotes(message.query || '') });
          return;
        }
        if (message.type === 'LIBRARY_NOTE_SET') {
          const note = await setPageNote(message.url, message.text, message.title || '');
          sendResponse({ success: true, item: note });
          return;
        }
        if (message.type === 'LIBRARY_NOTE_DELETE') {
          sendResponse({ success: await deletePageNote(message.url) });
          return;
        }

        // Library — recents
        if (message.type === 'LIBRARY_RECENTS_LIST') {
          sendResponse({ success: true, items: await listRecents() });
          return;
        }
        if (message.type === 'LIBRARY_RECENTS_CLEAR') {
          await clearRecents();
          sendResponse({ success: true });
          return;
        }

        // Library — tags
        if (message.type === 'LIBRARY_TAGS') {
          sendResponse({
            success: true,
            bookmarkTags: await allBookmarkTags(),
            snippetTags: await allSnippetTags(),
          });
          return;
        }

        // Tab search
        if (message.type === 'TAB_SEARCH') {
          sendResponse({ success: true, items: await searchOpenTabs(message.query || '', message.limit || 25) });
          return;
        }

        // Switch to a specific tab (used from popup)
        if (message.type === 'TAB_SWITCH') {
          if (typeof message.tabId === 'number' && chrome.tabs) {
            await chrome.tabs.update(message.tabId, { active: true });
            if (typeof message.windowId === 'number' && chrome.windows) {
              await chrome.windows.update(message.windowId, { focused: true });
            }
            sendResponse({ success: true });
          } else {
            sendResponse({ success: false, error: 'invalid-tab-id' });
          }
          return;
        }

        sendResponse({ success: false, error: 'unsupported-background-message' });
      } catch (err: any) {
        sendResponse({ success: false, error: err?.message || String(err) });
      }
    })();
    return true;
  });
}

// ─── TAB CLEANUP ──────────────────────────────────────────
if (typeof chrome !== 'undefined' && chrome.tabs?.onRemoved) {
  chrome.tabs.onRemoved.addListener(tabId => {
    tabIndices.delete(tabId);
  });
}
