import { createSpotlight } from './spotlight.js';
import {
  extractSections,
  extractActions,
  extractFields,
  extractLinks,
  extractFiles,
  extractMedia,
  extractStructuredData,
  generateStableSelector,
  type IndexRecord,
} from '../../src/search.js';

interface ShowSpotlightMessage {
  type: 'SHOW_SPOTLIGHT';
}

interface GetManifestMessage {
  type: 'GET_MANIFEST';
}

interface ExecuteActionMessage {
  type: 'EXECUTE_ACTION';
  record: IndexRecord;
}

interface ToggleFullscreenMessage {
  type: 'TOGGLE_FULLSCREEN';
}

type ContentMessage = ShowSpotlightMessage | GetManifestMessage | ExecuteActionMessage | ToggleFullscreenMessage;

let spotlight: ReturnType<typeof createSpotlight> | null = null;

function extractPageManifest(): {
  url: string;
  title: string;
  records: IndexRecord[];
} {
  const url = window.location.href;
  const title = document.title;
  const records: IndexRecord[] = [];

  try {
    const sections = extractSections(document.body);
    for (const section of sections) {
      const record: IndexRecord = {
        id: section.id || generateStableSelector(section.element),
        type: 'section',
        url,
        title,
        headingText: section.headingText,
        headingLevel: section.headingLevel,
        bodyText: section.bodyText,
        breadcrumbs: section.breadcrumbs,
        selector: section.selector,
      };
      records.push(record);
    }
  } catch (err) {
    console.error('[reef] failed to extract sections:', err);
  }

  try {
    const actions = extractActions(document.body);
    for (const action of actions) {
      const record: IndexRecord = {
        id: action.id || generateStableSelector(action.element),
        type: 'action',
        url,
        title,
        label: action.label,
        selector: action.selector,
      };
      records.push(record);
    }
  } catch (err) {
    console.error('[reef] failed to extract actions:', err);
  }

  try {
    const fields = extractFields(document.body);
    for (const field of fields) {
      const record: IndexRecord = {
        id: field.id || generateStableSelector(field.element),
        type: 'field',
        url,
        title,
        label: field.label,
        selector: field.selector,
      };
      records.push(record);
    }
  } catch (err) {
    console.error('[reef] failed to extract fields:', err);
  }

  try {
    const links = extractLinks(document.body);
    for (const link of links) {
      const record: IndexRecord = {
        id: link.id || generateStableSelector(link.element),
        type: 'link',
        url: link.href,
        title: link.text || link.href,
        label: link.text,
        selector: link.selector,
      };
      records.push(record);
    }
  } catch (err) {
    console.error('[reef] failed to extract links:', err);
  }

  try {
    const files = extractFiles(document.body);
    for (const file of files) {
      const record: IndexRecord = {
        id: file.id || generateStableSelector(file.element),
        type: 'file',
        url: file.href,
        title: file.text || file.href,
        label: file.text,
        selector: file.selector,
      };
      records.push(record);
    }
  } catch (err) {
    console.error('[reef] failed to extract files:', err);
  }

  try {
    const media = extractMedia(document.body);
    for (const item of media) {
      const record: IndexRecord = {
        id: item.id || generateStableSelector(item.element),
        type: 'media',
        url: item.src,
        title: item.alt || item.src,
        label: item.alt,
        selector: item.selector,
      };
      records.push(record);
    }
  } catch (err) {
    console.error('[reef] failed to extract media:', err);
  }

  try {
    const structured = extractStructuredData(document);
    for (const item of structured) {
      const record: IndexRecord = {
        id: `structured-${Math.random().toString(36).slice(2, 8)}`,
        type: 'structured-data',
        url,
        title: item.name || item.headline || 'Structured Data',
        bodyText: JSON.stringify(item),
      };
      records.push(record);
    }
  } catch (err) {
    console.error('[reef] failed to extract structured data:', err);
  }

  return { url, title, records };
}

function executeAction(record: IndexRecord): { success: boolean; reason?: string } {
  try {
    if (!record.selector) {
      return { success: false, reason: 'no-selector' };
    }

    const element = document.querySelector(record.selector);
    if (!element) {
      return { success: false, reason: 'element-not-found' };
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
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.focus();
      return { success: true };
    }

    return { success: false, reason: 'unsupported-element' };
  } catch (err) {
    return { success: false, reason: err instanceof Error ? err.message : String(err) };
  }
}

if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message: ContentMessage, sender, sendResponse) => {
    try {
      switch (message.type) {
        case 'SHOW_SPOTLIGHT':
          if (!spotlight) {
            spotlight = createSpotlight();
          }
          spotlight.toggle();
          sendResponse({ success: true });
          break;

        case 'GET_MANIFEST':
          const manifest = extractPageManifest();
          sendResponse({ success: true, manifest });
          break;

        case 'EXECUTE_ACTION':
          const result = executeAction(message.record);
          sendResponse(result);
          break;

        case 'TOGGLE_FULLSCREEN':
          if (document.fullscreenElement) {
            document.exitFullscreen();
          } else {
            document.documentElement.requestFullscreen();
          }
          sendResponse({ success: true });
          break;

        default:
          sendResponse({ success: false, error: 'unsupported-message-type' });
      }
    } catch (err) {
      sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) });
    }
    return true;
  });
}

if (typeof document !== 'undefined') {
  const observer = new MutationObserver(() => {
    if (spotlight?.isOpen()) {
      spotlight.hide();
      spotlight = null;
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, { childList: true, subtree: true });
    });
  } else {
    observer.observe(document.body, { childList: true, subtree: true });
  }
}
