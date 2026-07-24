import type { IndexRecord, WorkflowStep, AgentSession, WorkflowOptions, ActionResult, AgentOptions, ObservationOptions, StableWaitOptions, PaginationOptions } from './types.js';
import type { SearchIndex } from './search-index.js';
import { extractAccessibilityTree } from './extraction.js';

type InspectorInterface = {
  activate: () => void;
  deactivate: () => void;
  isActive: () => boolean;
  setRecords: (records: IndexRecord[]) => void;
};

export { type WorkflowStep, type WorkflowOptions, type AgentSession, type ActionResult };

export class Agent {
  private index: SearchIndex;
  private inspector: InspectorInterface;
  private actionsMode: 'execute' | 'navigate-only';
  private options: AgentOptions;
  private actionCount = 0;
  private lastRoute = typeof window !== 'undefined' ? window.location.href : '';
  private lastAction: ActionResult = { success: false, reason: 'no-action' };

  constructor(index: SearchIndex, inspector: InspectorInterface, actionsMode: 'execute' | 'navigate-only' | AgentOptions = 'execute') {
    this.index = index;
    this.inspector = inspector;
    this.options = typeof actionsMode === 'string' ? { actionsMode } : actionsMode;
    this.actionsMode = this.options.actionsMode ?? 'execute';
    this.installRouteObserver();
  }

  async click(selector: string | IndexRecord): Promise<this> {
    if (typeof selector !== 'string' && selector.destructive && (this.actionsMode === 'navigate-only' || this.options.destructive === false)) throw new Error('destructive-action-blocked');
    this.guardAction();
    const resolved = await this.resolveSelector(selector);
    if (!resolved.success) {
      if (typeof selector !== 'string' && this.actionsMode === 'navigate-only') return this;
      throw new Error(resolved.reason || 'Click failed');
    }

    const element = resolved.element;
    this.ensureVisible(element ?? null);
    const before = this.fingerprint();
    if (element && typeof MouseEvent !== 'undefined') {
      const clickEvent = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: typeof window !== 'undefined' ? window : undefined,
      });
      element.dispatchEvent(clickEvent);
    }
    await this.waitForStable({ quietMs: 50, timeout: 1000 });
    if (!this.changedSince(before) && typeof selector !== 'string' && selector.selectors?.length) {
      const retry = await this.resolveSelector({ ...selector, selectors: selector.selectors.slice(1) });
      if (retry.success && retry.element && retry.element !== element) retry.element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }
    this.lastAction = { success: true, changed: this.changedSince(before), url: typeof window !== 'undefined' ? window.location.href : undefined, element };
    return this;
  }

  async type(selector: string | IndexRecord, value: string): Promise<this> {
    this.guardAction();
    const resolved = await this.resolveSelector(selector);
    if (!resolved.success) {
      throw new Error(resolved.reason || 'Type failed');
    }

    const element = resolved.element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
    this.ensureVisible(element);
    if (element && ('value' in element)) {
      const descriptor = Object.getOwnPropertyDescriptor(element, 'value');
      if (descriptor && descriptor.set) {
        descriptor.set.call(element, value);
      } else {
        element.value = value;
      }
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }
    this.lastAction = { success: true, changed: true, url: typeof window !== 'undefined' ? window.location.href : undefined, element: element ?? undefined };
    return this;
  }

  async submit(selector?: string | IndexRecord): Promise<this> {
    let element: Element | null = null;

    if (selector) {
      const resolved = await this.resolveSelector(selector);
      if (resolved.success && resolved.element) {
        element = resolved.element;
      }
    } else if (typeof document !== 'undefined') {
      element = document.querySelector('form') || document.querySelector('button[type="submit"]') ||
                document.querySelector('input[type="submit"]');
    }

    if (element) {
      if (element instanceof HTMLFormElement) {
        element.dispatchEvent(new Event('submit', { bubbles: true }));
      } else {
        const clickEvent = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: typeof window !== 'undefined' ? window : undefined,
        });
        element.dispatchEvent(clickEvent);
      }
      this.lastAction = { success: true, changed: true, url: typeof window !== 'undefined' ? window.location.href : undefined, element };
    }
    return this;
  }

  getLastActionResult(): ActionResult { return { ...this.lastAction }; }

  async navigate(url: string): Promise<this> {
    if ((url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/')) && typeof window !== 'undefined') {
      const target = new URL(url, window.location.href).toString();
      const sameOrigin = new URL(target).origin === window.location.origin;
      if (sameOrigin && target.split('#')[0] === window.location.href.split('#')[0] && window.history.pushState) {
        window.history.pushState({}, '', target);
        window.dispatchEvent(new PopStateEvent('popstate'));
        await this.waitForStable();
      } else window.location.href = target;
    }
    return this;
  }

  async back(): Promise<this> {
    if (typeof window !== 'undefined') {
      window.history.back();
    }
    return this;
  }

  async forward(): Promise<this> {
    if (typeof window !== 'undefined') {
      window.history.forward();
    }
    return this;
  }

  async wait(timeout: number = 1000): Promise<this> {
    await new Promise(resolve => setTimeout(resolve, timeout));
    return this;
  }

  async extract(selector: string | IndexRecord): Promise<any> {
    const resolved = await this.resolveSelector(selector);
    if (!resolved.success) {
      throw new Error(resolved.reason || 'Extract failed');
    }

    const element = resolved.element;
    if (!element) {
      throw new Error('Element not found');
    }

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
      return element.value;
    }

    return element.textContent?.trim() || '';
  }

  async observe(options?: ObservationOptions): Promise<IndexRecord[]> {
    if (typeof document === 'undefined') return [];
    const records = extractAccessibilityTree(options?.root ?? document).filter(record => {
      if (options?.includeHidden) return true;
      const element = this.resolveRecordElement(record);
      return !!element && (!options?.inViewport && options?.inViewport !== false ? this.isVisible(element) : this.isVisible(element));
    });
    this.inspector.setRecords(records);
    return records;
  }

  async waitForStable(options?: StableWaitOptions): Promise<this> {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return this;
    const quietMs = options?.quietMs ?? 250;
    const timeout = options?.timeout ?? 5000;
    await new Promise<void>(resolve => {
      let quietTimer: ReturnType<typeof setTimeout>;
      const observer = new MutationObserver(() => { clearTimeout(quietTimer); quietTimer = setTimeout(done, quietMs); });
      const done = () => { clearTimeout(quietTimer); observer.disconnect(); resolve(); };
      observer.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
      quietTimer = setTimeout(done, quietMs);
      setTimeout(done, timeout);
    });
    return this;
  }

  isVisible(element: Element | null): boolean {
    if (!element) return false;
    const style = typeof window !== 'undefined' ? window.getComputedStyle(element) : null;
    if (style && (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0')) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && (typeof window === 'undefined' || (rect.bottom >= 0 && rect.right >= 0 && rect.top <= window.innerHeight && rect.left <= window.innerWidth));
  }

  async exhaustPagination(options?: PaginationOptions): Promise<IndexRecord[]> {
    const maxPages = options?.maxPages ?? 10;
    const nextText = (options?.nextText ?? ['next', 'older', 'more']).map(v => v.toLowerCase());
    const merged = new Map<string, IndexRecord>();
    for (let page = 0; page < maxPages && this.actionCount < (options?.maxActionsPerRun ?? this.options.maxActionsPerRun ?? Infinity); page++) {
      const records = await this.observe({ inViewport: false, includeHidden: true });
      records.forEach(record => merged.set(`${record.label}:${record.type}`, record));
      const next = records.find(record => record.type === 'action' && !record.destructive && nextText.some(text => (record.label || '').toLowerCase().includes(text)));
      if (next) await this.click(next);
      else if (options?.scroll !== false && typeof window !== 'undefined') { window.scrollTo(0, document.body.scrollHeight); await this.waitForStable(); }
      else break;
      if (!next && options?.scroll === false) break;
    }
    return [...merged.values()];
  }

  private async resolveSelector(selector: string | IndexRecord): Promise<ActionResult> {
    let element: Element | null = null;

    if (typeof selector === 'string') {
      element = this.queryComposed(selector);
    } else if (selector) {
      const record = this.index.allSections.find(r => r.id === selector.id);
      const candidates = record?.selectors?.length ? record.selectors : (record?.selector ? [record.selector] : []);
      for (const candidate of candidates) { element = this.queryComposed(candidate, record?.iframePath); if (element) break; }
      if (!element) element = this.resolveRecordElement(selector);
      if (!element && selector.headingText) { const match = await this.findActionable(selector.headingText); if (match && match.id !== selector.id) return this.resolveSelector(match); }
    }

    if (!element) {
      return { success: false, reason: 'element-not-found' };
    }

    return { success: true, element };
  }

  private queryComposed(selector: string, iframePath?: number[]): Element | null {
    if (typeof document === 'undefined') return null;
    const find = (root: Document | ShadowRoot): Element | null => {
      if (selector.startsWith('xpath=')) { try { return document.evaluate(selector.slice(6), root, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue as Element | null; } catch { return null; } }
      const direct = root.querySelector(selector); if (direct) return direct;
      for (const host of Array.from(root.querySelectorAll('*'))) if (host.shadowRoot) { const found = find(host.shadowRoot); if (found) return found; }
      return null;
    };
    if (!iframePath?.length) return find(document);
    let current: Document | null = document;
    for (const position of iframePath) { const frame = current?.querySelectorAll('iframe')[position] as HTMLIFrameElement | undefined; current = frame?.contentDocument ?? null; }
    return current ? find(current) : null;
  }

  private resolveRecordElement(record: IndexRecord): Element | null { const candidates = record.selectors?.length ? record.selectors : (record.selector ? [record.selector] : []); for (const selector of candidates) { const found = this.queryComposed(selector, record.iframePath); if (found) return found; } return null; }
  private ensureVisible(element: Element | null): void { if (element && !this.isVisible(element)) element.scrollIntoView({ block: 'center', inline: 'nearest' }); }
  private fingerprint(): string { return `${typeof window !== 'undefined' ? window.location.href : ''}|${typeof document !== 'undefined' ? document.body?.textContent?.length : 0}`; }
  private changedSince(before: string): boolean { return this.fingerprint() !== before; }
  private guardAction(): void { this.actionCount++; if (this.actionCount > (this.options.maxActionsPerRun ?? Infinity)) throw new Error('max-actions-per-run-exceeded'); if (this.options.rateLimitMs) return; }
  private installRouteObserver(): void {
    if (typeof window === 'undefined') return;
    const onRoute = () => { this.lastRoute = window.location.href; void this.observe({ inViewport: false }); };
    window.addEventListener('popstate', onRoute); window.addEventListener('hashchange', onRoute);
    for (const method of ['pushState', 'replaceState'] as const) {
      const historyMethod: (...args: any[]) => any = (window.history[method] as any).bind(window.history);
      (window.history as any)[method] = (...args: any[]) => { const result = historyMethod(...args); onRoute(); return result; };
    }
  }

  async findActionable(text: string): Promise<IndexRecord | null> {
    const results = this.index.allSections.filter(r =>
      r.type === 'action' || r.type === 'field'
    );

    const normalized = text.toLowerCase().trim();
    for (const record of results) {
      if (record.headingText.toLowerCase().includes(normalized) ||
          record.label?.toLowerCase().includes(normalized)) {
        return record;
      }
    }
    return null;
  }

  async executeWorkflow(steps: WorkflowStep[], options?: WorkflowOptions): Promise<void> {
    const maxRetries = options?.maxRetries ?? 0;
    const retryDelay = options?.retryDelay ?? 500;
    const stopOnError = options?.stopOnError ?? true;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      options?.onStepStart?.(step, i);

      let attempt = 0;
      let success = false;

      while (attempt <= maxRetries && !success) {
        try {
switch (step.action) {
            case 'click':
              if (step.selector) {
                await this.click(step.selector);
              } else if (step.recordId) {
                const record = this.index.allSections.find(r => r.id === step.recordId);
                if (record) await this.click(record);
              }
              success = true;
              break;
            case 'type':
              if (step.selector) {
                await this.type(step.selector, step.value || '');
              } else if (step.recordId) {
                const record = this.index.allSections.find(r => r.id === step.recordId);
                if (record) await this.type(record, step.value || '');
              }
              success = true;
              break;
            case 'navigate':
              if (step.url) {
                await this.navigate(step.url);
                await this.waitForNavigation();
              }
              success = true;
              break;
            case 'extract':
              success = true;
              break;
            case 'submit':
              await this.submit(step.selector);
              success = true;
              break;
            case 'back':
              await this.back();
              success = true;
              break;
            case 'forward':
              await this.forward();
              success = true;
              break;
            case 'wait':
              if (step.timeout) {
                await this.wait(step.timeout);
              }
              success = true;
              break;
          }
          options?.onStepComplete?.(step, i, success);
        } catch (error) {
          attempt++;
          if (attempt > maxRetries) {
            options?.onStepError?.(step, i, error as Error);
            if (stopOnError) {
              throw error;
            }
          } else {
            await new Promise(resolve => setTimeout(resolve, retryDelay));
          }
        }
      }
    }
  }

  private async waitForNavigation(): Promise<void> {
    await new Promise<void>(resolve => {
      if (typeof document !== 'undefined') {
        const checkReady = () => {
          if (document.readyState === 'complete') {
            resolve();
          } else {
            setTimeout(checkReady, 100);
          }
        };
        checkReady();
      } else {
        resolve();
      }
    });
  }

  getSession(): AgentSession {
    return {
      id: this.generateSessionId(),
      url: typeof window !== 'undefined' ? window.location.href : 'about:blank',
      timestamp: Date.now(),
      cookies: this.getCookies(),
      localStorage: this.getLocalStorageSnapshot(),
    };
  }

  private generateSessionId(): string {
    return Math.random().toString(36).substring(2, 15) +
           Math.random().toString(36).substring(2, 15);
  }

  private getCookies(): Record<string, string> {
    const cookies: Record<string, string> = {};
    if (typeof document !== 'undefined') {
      document.cookie.split(';').forEach(cookie => {
        const [name, value] = cookie.trim().split('=');
        if (name) cookies[name] = value || '';
      });
    }
    return cookies;
  }

  private getLocalStorageSnapshot(): Record<string, string> {
    const storage: Record<string, string> = {};
    try {
      if (typeof localStorage !== 'undefined') {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key) {
            storage[key] = localStorage.getItem(key) || '';
          }
        }
      }
    } catch (e) {
      // localStorage may not be available
    }
    return storage;
  }
}
