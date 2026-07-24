import {
  extractSections,
  extractActions,
  extractFields,
  extractLinks,
  extractFiles,
  extractMedia,
  extractStructuredData,
  extractAccessibilityTree,
} from './extraction.js';
import type { IndexRecord } from './types.js';

export interface AgentReadyConfig {
  exclude?: string;
  mode?: 'execute' | 'navigate-only' | 'agent-ready';
  disableAriaBackfill?: boolean;
  disableLiveUpdates?: boolean;
  debounceMs?: number;
  maxRescansPerMinute?: number;
  debug?: boolean;
  publishWellKnown?: boolean;
}

export interface AgentManifest {
  version: 1;
  url: string;
  generatedAt: number;
  records: IndexRecord[];
  excludedCount: number;
}

export interface AgentReadyController {
  scan: () => AgentManifest;
  disconnect: () => void;
  config: AgentReadyConfig;
}

declare global {
  interface Window {
    __reefAgentManifest?: AgentManifest;
    Reef?: { addCustomRecords?: (records: IndexRecord[]) => void };
  }
}

const DEFAULTS: Required<Pick<AgentReadyConfig, 'mode' | 'disableAriaBackfill' | 'disableLiveUpdates' | 'debounceMs' | 'maxRescansPerMinute' | 'debug' | 'publishWellKnown'>> = {
  mode: 'execute', disableAriaBackfill: false, disableLiveUpdates: false, debounceMs: 150,
  maxRescansPerMinute: 30, debug: false, publishWellKnown: false,
};

function scriptConfig(): AgentReadyConfig {
  if (typeof document === 'undefined') return {};
  const script = Array.from(document.scripts).find(item => item.src.includes('reef-agent-ready'));
  if (!script) return {};
  const get = (name: string) => script.getAttribute(`data-${name}`) ?? undefined;
  return {
    exclude: get('exclude'), mode: (get('mode') as AgentReadyConfig['mode']) ?? undefined,
    disableAriaBackfill: get('disable-aria-backfill') === 'true', disableLiveUpdates: get('disable-live-updates') === 'true',
    debounceMs: Number(get('debounce-ms')) || undefined, maxRescansPerMinute: Number(get('max-rescans-per-minute')) || undefined,
    debug: get('debug') === 'true', publishWellKnown: get('publish-well-known') === 'true',
  };
}

function isExcluded(element: Element, selectors: string[]): boolean {
  if (element.closest('[data-reef-agent="off"]') || element.matches('[data-reef-agent="off"], [data-sensitive]')) return true;
  if (element.matches('input[type="password"], input[name*="card" i], input[autocomplete*="cc-" i], input[name*="ssn" i], input[name*="social-security" i]')) return true;
  return selectors.some(selector => { try { return element.matches(selector) || !!element.closest(selector); } catch { return false; } });
}

function accessibleLabel(element: Element): string {
  return element.getAttribute('aria-label') || element.getAttribute('title') || element.textContent?.trim() || '';
}

function stampAndBackfill(config: AgentReadyConfig, excluded: Set<Element>): void {
  const selectors = (config.exclude || '').split(',').map(item => item.trim()).filter(Boolean);
  let nextId = 0;
  const visit = (root: Document | Element | ShadowRoot) => {
    const interactive = root.querySelectorAll('a[href], button, input, textarea, select, summary, [role], [tabindex], [contenteditable]');
    for (const element of Array.from(interactive)) {
      if (isExcluded(element, selectors)) { excluded.add(element); continue; }
      if (!element.getAttribute('data-agent-id')) element.setAttribute('data-agent-id', `reef-agent-${nextId++}`);
      if (!config.disableAriaBackfill && !accessibleLabel(element) && (element.matches('button, a, [role="button"], [role="link"]'))) {
        const label = element.getAttribute('data-agent-label') || element.getAttribute('data-icon') || element.querySelector('svg')?.getAttribute('aria-label');
        if (label) element.setAttribute('aria-label', label);
      }
      if (element.shadowRoot) visit(element.shadowRoot);
      if (element.tagName.toLowerCase() === 'iframe') {
        try { if ((element as HTMLIFrameElement).contentDocument) visit((element as HTMLIFrameElement).contentDocument!); } catch { /* cross-origin */ }
      }
    }
  };
  visit(document);
}

function extractManifest(config: AgentReadyConfig): AgentManifest {
  const excluded = new Set<Element>();
  stampAndBackfill(config, excluded);
  const url = typeof location !== 'undefined' ? location.href : '';
  const html = document.documentElement.outerHTML;
  const records = [
    ...extractSections(html, url), ...extractActions(html, url), ...extractFields(html, url),
    ...extractLinks(html, url), ...extractFiles(html, url), ...extractMedia(html, url), ...extractStructuredData(html, url),
    ...extractAccessibilityTree(document),
  ];
  const selectors = (config.exclude || '').split(',').map(item => item.trim()).filter(Boolean);
  const filtered = records.filter(record => {
    if (record.selector) {
      try { const element = document.querySelector(record.selector); if (element && (excluded.has(element) || isExcluded(element, selectors))) return false; } catch { /* malformed generated selector */ }
    }
    if (config.mode === 'navigate-only' && record.type === 'action') record.destructive = true;
    return true;
  });
  const deduped = [...new Map(filtered.map(record => [`${record.type}:${record.headingText}:${record.selector || record.url}`, record])).values()];
  return { version: 1, url, generatedAt: Date.now(), records: deduped, excludedCount: records.length - deduped.length };
}

function publish(manifest: AgentManifest, config: AgentReadyConfig): void {
  window.__reefAgentManifest = manifest;
  const previous = document.querySelector('script[type="application/agent-manifest+json"]');
  if (previous) previous.remove();
  const node = document.createElement('script');
  node.type = 'application/agent-manifest+json'; node.textContent = JSON.stringify(manifest); document.head.appendChild(node);
  window.Reef?.addCustomRecords?.(manifest.records);
  document.dispatchEvent(new CustomEvent('reef:agent-ready', { detail: manifest }));
  if (config.debug) console.debug('[reef-agent-ready]', manifest);
  if (config.publishWellKnown && config.debug) console.info('[reef-agent-ready] export this manifest to /.well-known/agent-manifest.json during deployment');
}

export function initAgentReady(input?: AgentReadyConfig): AgentReadyController {
  if (typeof window === 'undefined' || typeof document === 'undefined') return { scan: () => ({ version: 1, url: '', generatedAt: Date.now(), records: [], excludedCount: 0 }), disconnect: () => {}, config: input || {} };
  const config = { ...DEFAULTS, ...scriptConfig(), ...input };
  let scans: number[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const rescan = () => {
    const now = Date.now(); scans = scans.filter(time => now - time < 60000);
    if (scans.length >= config.maxRescansPerMinute) return;
    scans.push(now); publish(extractManifest(config), config);
  };
  const scan = () => { const manifest = extractManifest(config); publish(manifest, config); return manifest; };
  const observer = config.disableLiveUpdates ? null : new MutationObserver(records => {
    const internalOnly = records.length > 0 && records.every(record => {
      if (record.type === 'attributes' && (record.attributeName === 'data-agent-id' || record.attributeName === 'aria-label')) return true;
      if (record.target instanceof HTMLScriptElement && record.target.type === 'application/agent-manifest+json') return true;
      if (record.target.parentElement instanceof HTMLScriptElement && record.target.parentElement.type === 'application/agent-manifest+json') return true;
      const nodes = [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)];
      return nodes.length > 0 && nodes.every(node => node instanceof HTMLScriptElement && node.type === 'application/agent-manifest+json');
    });
    if (internalOnly) return;
    clearTimeout(timer); timer = setTimeout(rescan, config.debounceMs);
  });
  observer?.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  const onRoute = () => { clearTimeout(timer); timer = setTimeout(rescan, config.debounceMs); };
  const originalPush: (...args: any[]) => any = (history.pushState as any).bind(history); const originalReplace: (...args: any[]) => any = (history.replaceState as any).bind(history);
  history.pushState = ((...args: any[]) => { const result = originalPush(...args); onRoute(); return result; }) as History['pushState'];
  history.replaceState = ((...args: any[]) => { const result = originalReplace(...args); onRoute(); return result; }) as History['replaceState'];
  addEventListener('popstate', onRoute); addEventListener('hashchange', onRoute);
  const controller = { scan, disconnect: () => { observer?.disconnect(); clearTimeout(timer); removeEventListener('popstate', onRoute); removeEventListener('hashchange', onRoute); }, config };
  scan();
  return controller;
}
