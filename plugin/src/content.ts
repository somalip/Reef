/**
 * @file Content script for Reef for Browsers.
 * Inspects live DOM for window.__reefAgentManifest or extracts on-the-fly,
 * and hosts the Agent instance for executing in-page actions.
 */

import {
  extractSections,
  extractActions,
  extractFields,
  extractLinks,
  extractFiles,
  extractMedia,
  extractStructuredData,
  extractAccessibilityTree,
} from '../../src/extraction.js';
import { Agent } from '../../src/agent.ts';
import { createSearchIndex, addToIndex } from '../../src/search-index.js';
import type { IndexRecord } from '../../src/types.js';
import type { AgentManifest } from '../../src/agent-ready.js';

export interface ExtensionMessage {
  type: 'PING' | 'GET_MANIFEST' | 'RESCAN' | 'EXECUTE_ACTION' | 'HIGHLIGHT_RECORD';
  record?: IndexRecord;
  actionType?: 'click' | 'type' | 'navigate';
  value?: string;
  options?: {
    actionsMode?: 'execute' | 'navigate-only';
    exclusionSelectors?: string[];
  };
}

export interface ExtensionResponse {
  success: boolean;
  manifest?: AgentManifest;
  error?: string;
  url?: string;
}

const HARD_EXCLUSION_SELECTOR =
  'input[type="password"], input[name*="card" i], input[autocomplete*="cc-" i], input[name*="ssn" i], input[name*="social-security" i], [data-reef-agent="off"], [data-sensitive]';

function isSensitiveElement(element: Element, customExclusions: string[] = []): boolean {
  if (element.matches(HARD_EXCLUSION_SELECTOR) || element.closest('[data-reef-agent="off"], [data-sensitive]')) {
    return true;
  }
  return customExclusions.some(selector => {
    try {
      return element.matches(selector) || !!element.closest(selector);
    } catch {
      return false;
    }
  });
}

function getAuthoritativeManifest(): AgentManifest | null {
  if (typeof window !== 'undefined' && window.__reefAgentManifest) {
    return window.__reefAgentManifest;
  }

  const scriptTag = document.querySelector('script[type="application/agent-manifest+json"]');
  if (scriptTag?.textContent) {
    try {
      return JSON.parse(scriptTag.textContent) as AgentManifest;
    } catch {
      // Invalid JSON tag
    }
  }
  return null;
}

export function extractPageManifest(customExclusions: string[] = []): AgentManifest {
  const authoritative = getAuthoritativeManifest();
  if (authoritative) {
    // Filter authoritative manifest against per-site custom exclusions & sensitive guardrails
    const filteredRecords = authoritative.records.filter(record => {
      if (!record.selector) return true;
      try {
        const el = document.querySelector(record.selector);
        return el ? !isSensitiveElement(el, customExclusions) : true;
      } catch {
        return true;
      }
    });
    return {
      ...authoritative,
      records: filteredRecords,
    };
  }

  const url = location.href;
  const html = document.documentElement.outerHTML;

  const rawRecords: IndexRecord[] = [
    ...extractSections(html, url),
    ...extractActions(html, url),
    ...extractFields(html, url),
    ...extractLinks(html, url),
    ...extractFiles(html, url),
    ...extractMedia(html, url),
    ...extractStructuredData(html, url),
    ...extractAccessibilityTree(document),
  ];

  const filtered = rawRecords.filter(record => {
    if (record.selector) {
      try {
        const element = document.querySelector(record.selector);
        if (element && isSensitiveElement(element, customExclusions)) return false;
      } catch {
        // Invalid selector string
      }
    }
    return true;
  });

  const deduped = [
    ...new Map(
      filtered.map(record => [`${record.type}:${record.headingText}:${record.selector || record.url}`, record])
    ).values(),
  ];

  return {
    version: 1,
    url,
    generatedAt: Date.now(),
    records: deduped,
    excludedCount: rawRecords.length - deduped.length,
  };
}

// Dummy inspector interface for Agent instantiation
const dummyInspector = {
  activate: () => {},
  deactivate: () => {},
  isActive: () => false,
  setRecords: () => {},
};

let currentAgent: Agent | null = null;
function getOrCreateAgent(actionsMode: 'execute' | 'navigate-only' = 'execute'): Agent {
  const index = createSearchIndex();
  currentAgent = new Agent(index, dummyInspector, { actionsMode });
  return currentAgent;
}

// Global message listener for Chrome extension runtime
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
    (async () => {
      try {
        if (message.type === 'PING') {
          sendResponse({ success: true, url: location.href });
          return;
        }

        if (message.type === 'GET_MANIFEST' || message.type === 'RESCAN') {
          const manifest = extractPageManifest(message.options?.exclusionSelectors || []);
          sendResponse({ success: true, manifest });
          return;
        }

        if (message.type === 'EXECUTE_ACTION' && message.record) {
          const actionsMode = message.options?.actionsMode || 'execute';
          const agent = getOrCreateAgent(actionsMode);

          if (message.record.destructive && actionsMode === 'navigate-only') {
            sendResponse({ success: false, error: 'destructive-action-blocked-by-mode' });
            return;
          }

          if (message.actionType === 'click' || message.record.type === 'action' || message.record.type === 'link') {
            if (message.record.selector) {
              await agent.click(message.record);
            } else if (message.record.url) {
              location.href = message.record.url;
            }
            sendResponse({ success: true, url: location.href });
            return;
          }

          if (message.actionType === 'type' || message.record.type === 'field') {
            const valueToType = message.value ?? message.record.value ?? '';
            await agent.type(message.record, valueToType);
            sendResponse({ success: true });
            return;
          }

          sendResponse({ success: false, error: 'unknown-action-type' });
          return;
        }

        if (message.type === 'HIGHLIGHT_RECORD' && message.record?.selector) {
          const el = document.querySelector(message.record.selector);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const origOutline = (el as HTMLElement).style.outline;
            (el as HTMLElement).style.outline = '3px solid #00a8b5';
            setTimeout(() => {
              (el as HTMLElement).style.outline = origOutline;
            }, 2000);
          }
          sendResponse({ success: true });
          return;
        }

        sendResponse({ success: false, error: 'unsupported-message-type' });
      } catch (err: any) {
        sendResponse({ success: false, error: err?.message || String(err) });
      }
    })();
    return true; // Keep response channel open for async execution
  });
}
