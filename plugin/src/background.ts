/**
 * @file Background Service Worker for Reef for Browsers.
 * Manages search index state per tab, storage persistence, message routing,
 * omnibox keyword handler, and optional cross-tab site crawl.
 */

import { createSearchIndex, addToIndex, searchSections, searchWithPagination, suggest } from '../../src/search-index.js';
import type { SearchIndex } from '../../src/search-index.js';
import type { IndexRecord, SearchOptions } from '../../src/types.js';
import type { AgentManifest } from '../../src/agent-ready.js';
import { Indexer } from '../../src/indexing/indexer.js';

interface TabIndexState {
  index: SearchIndex;
  manifest?: AgentManifest;
  lastUpdated: number;
}

const tabIndices = new Map<number, TabIndexState>();
const siteIndices = new Map<string, SearchIndex>(); // Phase 2 cross-tab origin index

// Helper to get extension options from chrome.storage.local
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
    'actionsMode',
    'allowDenyList',
    'exclusionSelectors',
    'telemetryEnabled',
    'enableCrossTabCrawl',
  ]);
  return {
    actionsMode: data.actionsMode || 'execute',
    allowDenyList: data.allowDenyList || [],
    exclusionSelectors: data.exclusionSelectors || [],
    telemetryEnabled: data.telemetryEnabled || false,
    enableCrossTabCrawl: data.enableCrossTabCrawl || false,
  };
}

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

      // Phase 2: Index origin cross-tab if enabled
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

      return state;
    }
  } catch (err) {
    console.warn(`[Reef Background] Failed to fetch manifest from tab ${tabId}:`, err);
  }

  return null;
}

// Omnibox keyword search setup ("reef <query>")
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

// Handle messaging from Popup / Options
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
      try {
        if (message.type === 'SEARCH_CURRENT_TAB') {
          const tabId = message.tabId || sender.tab?.id;
          if (!tabId) {
            sendResponse({ success: false, error: 'no-tab-id' });
            return;
          }

          const state = await getOrFetchTabIndex(tabId, message.forceRefresh);
          if (!state) {
            sendResponse({ success: false, error: 'failed-to-index-tab' });
            return;
          }

          const options: SearchOptions = message.searchOptions || {};
          const paginated = searchWithPagination(message.query || '', state.index, options);
          const suggestions = suggest(message.query || '', state.index);

          // Unwrap ScoredRecord[] → IndexRecord[] for the popup
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
          if (!tabId) {
            sendResponse({ success: false, error: 'no-tab-id' });
            return;
          }

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
          if (!tabId) {
            sendResponse({ success: false, error: 'no-tab-id' });
            return;
          }
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab?.url) {
            sendResponse({ success: false, error: 'no-tab-url' });
            return;
          }

          const indexer = new Indexer({ scope: 'body', indexActions: true });
          await indexer.crawlSameOrigin(() => {
            const crawledIndex = indexer.getIndex();
            siteIndices.set(new URL(tab.url!).origin, crawledIndex);
            sendResponse({ success: true });
          });
          return;
        }

        sendResponse({ success: false, error: 'unsupported-background-message' });
      } catch (err: any) {
        sendResponse({ success: false, error: err?.message || String(err) });
      }
    })();
    return true; // Keep async channel open
  });
}

// Clean up stored tab indices when a tab is closed
if (typeof chrome !== 'undefined' && chrome.tabs?.onRemoved) {
  chrome.tabs.onRemoved.addListener(tabId => {
    tabIndices.delete(tabId);
  });
}
