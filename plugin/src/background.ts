import {
  createSearchIndex,
  addToIndex,
  searchSections,
  suggest,
  type SearchIndex,
  type IndexRecord,
} from '../../src/search.js';
import {
  listBookmarks,
  createBookmark,
  listSnippets,
  createSnippet,
  getPageNote,
  setPageNote,
  listRecents,
  recordRecent,
  type Bookmark,
  type Snippet,
  type RecentPage,
} from './storage.js';

interface TabIndex {
  url: string;
  title: string;
  index: SearchIndex;
  records: IndexRecord[];
  lastUpdated: number;
}

const tabIndices = new Map<number, TabIndex>();
const siteIndices = new Map<string, SearchIndex>();

interface SpotlightSearchMessage {
  type: 'SPOTLIGHT_SEARCH';
  query: string;
  limit?: number;
}

interface TabSwitchMessage {
  type: 'TAB_SWITCH';
  tabId: number;
  windowId: number;
}

interface SpotlightOpenRecordMessage {
  type: 'SPOTLIGHT_OPEN_RECORD';
  tabId: number;
  record: IndexRecord;
}

interface SpotlightOpenNewTabMessage {
  type: 'SPOTLIGHT_OPEN_NEW_TAB';
  url: string;
}

interface BrowserActionExecuteMessage {
  type: 'BROWSER_ACTION_EXECUTE';
  action: string;
  downloadId?: number;
}

interface LibraryBookmarkCreateMessage {
  type: 'LIBRARY_BOOKMARK_CREATE';
  data: Omit<Bookmark, 'id' | 'createdAt' | 'updatedAt'>;
}

interface LibrarySnippetCreateMessage {
  type: 'LIBRARY_SNIPPET_CREATE';
  data: Omit<Snippet, 'id' | 'createdAt' | 'updatedAt'>;
}

interface LibraryPageNoteSetMessage {
  type: 'LIBRARY_PAGE_NOTE_SET';
  url: string;
  text: string;
  title: string;
}

interface LibraryRecentsListMessage {
  type: 'LIBRARY_RECENTS_LIST';
}

interface LibraryOpenRecentMessage {
  type: 'LIBRARY_OPEN_RECENT';
  url: string;
}

interface GetManifestMessage {
  type: 'GET_MANIFEST';
}

interface CrawlSiteMessage {
  type: 'SPOTLIGHT_CRAWL_SITE';
  origin: string;
}

interface UpdateShortcutMessage {
  type: 'UPDATE_SHORTCUT';
  command: string;
  shortcut: string;
}

type ExtensionMessage =
  | SpotlightSearchMessage
  | TabSwitchMessage
  | SpotlightOpenRecordMessage
  | SpotlightOpenNewTabMessage
  | BrowserActionExecuteMessage
  | LibraryBookmarkCreateMessage
  | LibrarySnippetCreateMessage
  | LibraryPageNoteSetMessage
  | LibraryRecentsListMessage
  | LibraryOpenRecentMessage
  | GetManifestMessage
  | CrawlSiteMessage
  | UpdateShortcutMessage;

function scoreTab(tab: chrome.tabs.Tab, query: string, tabIndex?: TabIndex): number {
  const q = query.toLowerCase();
  const title = (tab.title || '').toLowerCase();
  const url = (tab.url || '').toLowerCase();

  let score = 0;
  if (title === q) score += 100;
  else if (title.startsWith(q)) score += 60;
  else if (title.includes(q)) score += 30;

  if (url.includes(q)) score += 20;

  if (tabIndex) {
    const siteResults = searchSections(tabIndex.index, query, { limit: 5 });
    if (siteResults.length > 0) {
      score += 15;
    }
  }

  if (tab.active) score += 5;
  if (tab.lastAccessed) {
    const age = Date.now() - tab.lastAccessed;
    if (age < 3600000) score += 10;
    else if (age < 86400000) score += 5;
  }

  return score;
}

async function handleSpotlightSearch(
  message: SpotlightSearchMessage,
  sender: chrome.runtime.MessageSender
) {
  try {
    const query = message.query.trim();
    const limit = message.limit || 50;

    if (!query) {
      return { success: true, items: [], siteResults: [], actions: [], autocorrected: false };
    }

    const tabs = await chrome.tabs.query({});
    const tabResults: Array<{
      tabId: number;
      windowId: number;
      title: string;
      url: string;
      favIconUrl?: string;
      score: number;
      matchedRecords: IndexRecord[];
    }> = [];

    for (const tab of tabs) {
      if (!tab.id || !tab.url) continue;
      if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) continue;

      const tabIndex = tabIndices.get(tab.id);
      const score = scoreTab(tab, query, tabIndex);

      if (score > 0 || (tabIndex && searchSections(tabIndex.index, query, { limit: 1 }).length > 0)) {
        const matchedRecords = tabIndex
          ? searchSections(tabIndex.index, query, { limit: 5 }).map((r) => r.record)
          : [];

        tabResults.push({
          tabId: tab.id,
          windowId: tab.windowId,
          title: tab.title || tab.url,
          url: tab.url,
          favIconUrl: tab.favIconUrl,
          score,
          matchedRecords,
        });
      }
    }

    tabResults.sort((a, b) => b.score - a.score);
    const items = tabResults.slice(0, limit);

    const siteResults: Array<{
      url: string;
      headingText: string;
      bodyText: string;
      selector?: string;
      type: string;
      score: number;
      sourceOrigin: string;
    }> = [];

    for (const [origin, index] of siteIndices.entries()) {
      const results = searchSections(index, query, { limit: 10 });
      for (const result of results) {
        siteResults.push({
          url: result.record.url || '',
          headingText: result.record.headingText || '',
          bodyText: result.record.bodyText || '',
          selector: result.record.selector,
          type: result.record.type || 'section',
          score: result.score,
          sourceOrigin: origin,
        });
      }
    }

    siteResults.sort((a, b) => b.score - a.score);

    const suggestion = suggest(query, { limit: 1 })[0];
    const autocorrected = suggestion && suggestion !== query.toLowerCase();

    return {
      success: true,
      items,
      siteResults: siteResults.slice(0, 20),
      actions: [],
      suggestion,
      autocorrected: !!autocorrected,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      items: [],
      siteResults: [],
      actions: [],
      autocorrected: false,
    };
  }
}

async function handleTabSwitch(message: TabSwitchMessage) {
  try {
    await chrome.tabs.update(message.tabId, { active: true });
    await chrome.windows.update(message.windowId, { focused: true });
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function handleSpotlightOpenRecord(message: SpotlightOpenRecordMessage) {
  try {
    const tab = await chrome.tabs.get(message.tabId);
    if (message.record.selector) {
      await chrome.scripting.executeScript({
        target: { tabId: message.tabId },
        func: (selector: string) => {
          const el = document.querySelector(selector);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.focus();
          }
        },
        args: [message.record.selector],
      });
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function handleSpotlightOpenNewTab(message: SpotlightOpenNewTabMessage) {
  try {
    await chrome.tabs.create({ url: message.url });
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function handleBrowserActionExecute(message: BrowserActionExecuteMessage) {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.id) {
      return { success: false, error: 'no-active-tab' };
    }

    switch (message.action) {
      case 'mute-tab':
        await chrome.tabs.update(activeTab.id, { muted: !activeTab.mutedInfo?.muted });
        break;

      case 'pin-tab':
        await chrome.tabs.update(activeTab.id, { pinned: !activeTab.pinned });
        break;

      case 'duplicate-tab':
        await chrome.tabs.duplicate(activeTab.id);
        break;

      case 'reload-tab':
        await chrome.tabs.reload(activeTab.id);
        break;

      case 'close-other-tabs': {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        for (const tab of tabs) {
          if (tab.id !== activeTab.id && tab.id !== undefined) {
            await chrome.tabs.remove(tab.id);
          }
        }
        break;
      }

      case 'focus-mode': {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        for (const tab of tabs) {
          if (tab.id !== activeTab.id && tab.id !== undefined && !tab.pinned) {
            await chrome.tabs.remove(tab.id);
          }
        }
        break;
      }

      case 'save-session': {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        const sessionTabs = tabs
          .filter((t) => t.url && !t.url.startsWith('chrome://'))
          .map((t) => ({ url: t.url!, title: t.title || '' }));
        const sessions = await chrome.storage.local.get(['reef:sessions']);
        const sessionList = (sessions['reef:sessions'] as Array<{
          id: string;
          name: string;
          tabs: Array<{ url: string; title: string }>;
          savedAt: number;
        }>) || [];
        sessionList.unshift({
          id: `session-${Date.now()}`,
          name: `Session ${new Date().toLocaleString()}`,
          tabs: sessionTabs,
          savedAt: Date.now(),
        });
        await chrome.storage.local.set({ 'reef:sessions': sessionList.slice(0, 20) });
        break;
      }

      case 'bookmark-page': {
        const tab = await chrome.tabs.get(activeTab.id);
        if (tab.url) {
          await chrome.bookmarks.create({ url: tab.url, title: tab.title || tab.url });
        }
        break;
      }

      case 'remove-bookmark': {
        const tab = await chrome.tabs.get(activeTab.id);
        if (tab.url) {
          const results = await chrome.bookmarks.search(tab.url);
          for (const bookmark of results) {
            await chrome.bookmarks.remove(bookmark.id);
          }
        }
        break;
      }

      case 'new-tab':
        await chrome.tabs.create({});
        break;

      case 'close-tab':
        await chrome.tabs.remove(activeTab.id);
        break;

      case 'reopen-closed-tab':
        await chrome.tabs.undo();
        break;

      case 'go-back':
        await chrome.tabs.goBack(activeTab.id);
        break;

      case 'go-forward':
        await chrome.tabs.goForward(activeTab.id);
        break;

      case 'toggle-fullscreen':
        await chrome.tabs.sendMessage(activeTab.id, { type: 'TOGGLE_FULLSCREEN' });
        break;

      case 'new-window':
        await chrome.windows.create();
        break;

      case 'new-incognito':
        await chrome.windows.create({ incognito: true });
        break;

      case 'zoom-in': {
        const zoom = await chrome.tabs.getZoom(activeTab.id);
        await chrome.tabs.setZoom(activeTab.id, Math.min(zoom + 0.1, 5));
        break;
      }

      case 'zoom-out': {
        const zoom = await chrome.tabs.getZoom(activeTab.id);
        await chrome.tabs.setZoom(activeTab.id, Math.max(zoom - 0.1, 0.25));
        break;
      }

      case 'zoom-reset':
        await chrome.tabs.setZoom(activeTab.id, 0);
        break;

      case 'print-page':
        await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: () => window.print(),
        });
        break;

      case 'save-page':
        await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: () => {
            const a = document.createElement('a');
            a.href = window.location.href;
            a.download = '';
            a.click();
          },
        });
        break;

      case 'open-download':
        if (message.downloadId !== undefined) {
          await chrome.downloads.open(message.downloadId);
        }
        break;

      default:
        return { success: false, error: 'unknown-action' };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function handleLibraryBookmarkCreate(message: LibraryBookmarkCreateMessage) {
  try {
    const bookmark = await createBookmark(message.data);
    return { success: true, bookmark };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function handleLibrarySnippetCreate(message: LibrarySnippetCreateMessage) {
  try {
    const snippet = await createSnippet(message.data);
    return { success: true, snippet };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function handleLibraryPageNoteSet(message: LibraryPageNoteSetMessage) {
  try {
    const note = await setPageNote(message.url, message.text, message.title);
    return { success: true, note };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function handleLibraryRecentsList() {
  try {
    const items = await listRecents();
    return { success: true, items };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function handleLibraryOpenRecent(message: LibraryOpenRecentMessage) {
  try {
    await chrome.tabs.create({ url: message.url });
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function handleGetManifest(sender: chrome.runtime.MessageSender) {
  try {
    if (!sender.tab?.id) {
      return { success: false, error: 'no-tab-id' };
    }

    const tab = sender.tab;
    if (!tab.url) {
      return { success: false, error: 'no-url' };
    }

    const tabIndex = tabIndices.get(tab.id);
    if (tabIndex) {
      return {
        success: true,
        manifest: {
          url: tabIndex.url,
          title: tabIndex.title,
          records: tabIndex.records,
        },
      };
    }

    return { success: false, error: 'no-index' };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function handleCrawlSite(message: CrawlSiteMessage) {
  try {
    const allTabs = await chrome.tabs.query({});
    const seedTab = allTabs.find(
      (t) => t.url && t.id && new URL(t.url).origin === message.origin
    );

    if (!seedTab?.id) {
      return { success: false, error: 'no-tab-for-origin' };
    }

    const resp = await chrome.tabs.sendMessage(seedTab.id, { type: 'GET_MANIFEST' });
    if (resp?.success?.manifest) {
      let siteIndex = siteIndices.get(message.origin);
      if (!siteIndex) {
        siteIndex = createSearchIndex();
        siteIndices.set(message.origin, siteIndex);
      }
      addToIndex(siteIndex, resp.manifest.records);
      return { success: true, recordCount: resp.manifest.records.length };
    } else {
      return { success: false, error: 'no-manifest' };
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function handleUpdateShortcut(message: UpdateShortcutMessage) {
  try {
    if (chrome.commands?.update) {
      await chrome.commands.update({
        name: message.command,
        shortcut: message.shortcut,
      });
      return { success: true };
    } else {
      return {
        success: false,
        error: 'commands-update-not-supported',
        message: 'Please update shortcuts manually at chrome://extensions/shortcuts',
      };
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
    (async () => {
      try {
        switch (message.type) {
          case 'SPOTLIGHT_SEARCH':
            sendResponse(await handleSpotlightSearch(message, sender));
            break;

          case 'TAB_SWITCH':
            sendResponse(await handleTabSwitch(message));
            break;

          case 'SPOTLIGHT_OPEN_RECORD':
            sendResponse(await handleSpotlightOpenRecord(message));
            break;

          case 'SPOTLIGHT_OPEN_NEW_TAB':
            sendResponse(await handleSpotlightOpenNewTab(message));
            break;

          case 'BROWSER_ACTION_EXECUTE':
            sendResponse(await handleBrowserActionExecute(message));
            break;

          case 'LIBRARY_BOOKMARK_CREATE':
            sendResponse(await handleLibraryBookmarkCreate(message));
            break;

          case 'LIBRARY_SNIPPET_CREATE':
            sendResponse(await handleLibrarySnippetCreate(message));
            break;

          case 'LIBRARY_PAGE_NOTE_SET':
            sendResponse(await handleLibraryPageNoteSet(message));
            break;

          case 'LIBRARY_RECENTS_LIST':
            sendResponse(await handleLibraryRecentsList());
            break;

          case 'LIBRARY_OPEN_RECENT':
            sendResponse(await handleLibraryOpenRecent(message));
            break;

          case 'GET_MANIFEST':
            sendResponse(await handleGetManifest(sender));
            break;

          case 'SPOTLIGHT_CRAWL_SITE':
            sendResponse(await handleCrawlSite(message));
            break;

          case 'UPDATE_SHORTCUT':
            sendResponse(await handleUpdateShortcut(message));
            break;

          default:
            sendResponse({ success: false, error: 'unsupported-message-type' });
        }
      } catch (err) {
        sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) });
      }
    })();
    return true;
  });
}

if (typeof chrome !== 'undefined' && chrome.tabs?.onRemoved) {
  chrome.tabs.onRemoved.addListener((tabId) => {
    tabIndices.delete(tabId);
  });
}

if (typeof chrome !== 'undefined' && chrome.commands?.onCommand) {
  chrome.commands.onCommand.addListener(async (command) => {
    if (command === 'open-popup' || command === '_execute_action') {
      try {
        if (chrome.action?.openPopup) {
          await chrome.action.openPopup();
        } else {
          const views = chrome.extension?.getViews?.({ type: 'popup' }) || [];
          if (views[0]?.focus) views[0].focus();
          else if (chrome.windows?.create) {
            const url = chrome.runtime.getURL('src/popup/popup.html');
            await chrome.windows.create({ url, type: 'popup', width: 400, height: 560 });
          }
        }
      } catch {
        // ignore
      }
      return;
    }

    if (command !== 'open-spotlight') return;
    if (!chrome.tabs?.query) return;

    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab?.id) return;
      if (command === 'close-tab') {
        await chrome.tabs.remove(activeTab.id);
      } else if (command === 'reopen-closed-tab') {
        await chrome.tabs.undo();
      } else if (command === 'go-back') {
        await chrome.tabs.goBack(activeTab.id);
      } else if (command === 'go-forward') {
        await chrome.tabs.goForward(activeTab.id);
      } else if (command === 'toggle-fullscreen') {
        await chrome.tabs.sendMessage(activeTab.id, { type: 'TOGGLE_FULLSCREEN' });
      } else {
        await chrome.tabs.sendMessage(activeTab.id, { type: 'SHOW_SPOTLIGHT' });
      }
    } catch {
      // ignore
    }
  });
}
