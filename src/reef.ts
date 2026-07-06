import {
  extractSections,
  extractActions,
  extractFields,
  extractLinks,
  extractFiles,
  extractMedia,
  extractStructuredData,
  resolveUrl,
  searchSections,
  addToIndex,
  type IndexRecord,
  createSearchIndex,
  findClosestWord,
} from './search.js';

export interface ReefConfig {
  sitemap?: string;
  maxPages?: number;
  scope?: string;
  indexActions?: boolean;
  indexMedia?: boolean;
  indexStructuredData?: boolean;
  indexHidden?: boolean;
  fileExtensions?: string;
  excludeAction?: string;
  actionsMode?: 'execute' | 'navigate-only';
}



function escapeHtml(s: string): string {
  const map: Record<string, string> = { '&': '&', '<': '<', '>': '>', '"': '"', "'": "'" };
  let result = '';
  for (let i = 0; i < s.length; i++) {
    result += map[s[i]] ?? s[i];
  }
  return result;
}

function highlight(text: string, query: string): string {
  if (!query.trim()) return escapeHtml(text);
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);
  if (idx === -1) return escapeHtml(text);
  const before = escapeHtml(text.slice(0, idx));
  const match = escapeHtml(text.slice(idx, idx + query.length));
  const after = escapeHtml(text.slice(idx + query.length));
  return `${before}<mark>${match}</mark>${after}`;
}

function getSnippet(text: string, query: string): string {
  if (!query.trim()) return text.slice(0, 90) + '…';
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);
  if (idx === -1) return text.slice(0, 90) + '…';
  const start = Math.max(0, idx - 30);
  const end = Math.min(text.length, idx + query.length + 40);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

function getResultTypeIcon(type: string): string {
  switch (type) {
    case 'section': return '📄';
    case 'action': return '⚡';
    case 'field': return '📝';
    case 'link': return '🔗';
    case 'file': return '📎';
    case 'media': return '🎵';
    case 'structured': return '🔍';
    default: return '📄';
  }
}

function getResultTypeLabel(type: string): string {
  switch (type) {
    case 'section': return 'Section';
    case 'action': return 'Action';
    case 'field': return 'Field';
    case 'link': return 'Link';
    case 'file': return 'File';
    case 'media': return 'Media';
    case 'structured': return 'Answer';
    default: return 'Section';
  }
}

class ReefSearch {
  private config: ReefConfig = {};
  private index = createSearchIndex();
  private root: ShadowRoot | null = null;
  private host: HTMLDivElement | null = null;
  private input: HTMLInputElement | null = null;
  private resultsList: HTMLElement | null = null;
  private isOpen = false;
  private selectedIndex = 0;
  private currentQuery = '';
  private searchDebounce = 0;
  private deferredActions: { action: IndexRecord; pageUrl: string }[] = [];

  constructor() {
    this.config = this.readConfig();
    this.registerHotkey();
    void this.boot();
  }

  private readConfig(): ReefConfig {
    const script = document.currentScript as HTMLScriptElement | null;
    const dataset = script?.dataset ?? {};
    return {
      sitemap: dataset.sitemap ?? '/sitemap.xml',
      maxPages: Number(dataset.maxPages ?? 500),
      scope: dataset.scope,
      indexActions: dataset.indexActions !== 'false',
      indexMedia: dataset.indexMedia !== 'false',
      indexStructuredData: dataset.indexStructuredData !== 'false',
      indexHidden: dataset.indexHidden !== 'false',
      fileExtensions: dataset.fileExtensions,
      excludeAction: dataset.excludeAction,
      actionsMode: dataset.actionsMode as 'execute' | 'navigate-only' || 'execute',
    };
  }

  private scrollSelectedIntoView(): void {
    if (!this.resultsList) return;

    const selected = this.resultsList.querySelector(
      `.result[data-index="${this.selectedIndex}"]`
    ) as HTMLElement | null;

    selected?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  }
  
  private registerHotkey() {
    document.addEventListener('keydown', (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k' && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        this.open();
      }
    });
  }

  private getSitemapCandidates(): string[] {
    const base = window.location.href;
    const configured = this.config.sitemap ?? 'sitemap.xml';
    const candidates = [resolveUrl(configured, base)];

    if (!configured.startsWith('/')) {
      candidates.push(resolveUrl('./sitemap.xml', base));
    } else if (configured === '/sitemap.xml') {
      candidates.push(resolveUrl('sitemap.xml', base));
    }

    return [...new Set(candidates)];
  }

  private async boot() {
    const candidates = this.getSitemapCandidates();

    for (const candidate of candidates) {
      try {
        const response = await fetch(candidate);
        if (!response.ok) {
          continue;
        }
        const xml = await response.text();
        const urls: string[] = [];
        const locRegex = /<loc>(.*?)<\/loc>/g;
        let match: RegExpExecArray | null;
        while ((match = locRegex.exec(xml)) !== null) {
          urls.push(match[1].trim());
        }

        const maxPages = this.config.maxPages ?? 500;
        const fetchedSections = await this.fetchPagesParallel(urls.slice(0, maxPages), candidate);

        if (fetchedSections.length) {
          addToIndex(this.index, fetchedSections);
          console.info(`[reef] indexed ${fetchedSections.length} sections`);
          return;
        }
      } catch (error) {
        console.warn('[reef] sitemap fetch failed', candidate, error);
      }
    }

    this.indexCurrentPage();
  }

  private async fetchPagesParallel(urls: string[], sitemapUrl: string): Promise<IndexRecord[]> {
    const concurrency = 6;
    const sections: IndexRecord[] = [];
    const results: (IndexRecord[] | null)[] = new Array(urls.length);

    let idx = 0;
    const fetchBatch = async () => {
      while (idx < urls.length) {
        const i = idx++;
        const pageUrl = resolveUrl(urls[i], sitemapUrl);
        try {
          const pageResponse = await fetch(pageUrl);
          if (pageResponse.ok) {
            const html = await pageResponse.text();
            const pageSections = await this.extractAllContent(html, pageUrl);
            results[i] = pageSections;
          }
        } catch {
          results[i] = null;
        }
      }
    };

    await Promise.all([...Array(concurrency)].map(() => fetchBatch()));

    for (let i = 0; i < results.length; i++) {
      if (results[i]) {
        sections.push(...(results[i] ?? []));
      }
    }

    return sections;
  }

  private async extractAllContent(html: string, url: string): Promise<IndexRecord[]> {
    const doc = new DOMParser().parseFromString(html, 'text/html');

    // Apply scope if specified
    let rootElement: Element | Document = doc;
    if (this.config.scope) {
      const scopeElement = doc.querySelector(this.config.scope);
      if (scopeElement) {
        rootElement = scopeElement;
      }
    }

    // Re-serialize the relevant part of the document
    let htmlToProcess = new XMLSerializer().serializeToString(rootElement as Element);

    // Apply exclusions if specified
    if (this.config.excludeAction) {
      // In a real implementation, we would remove elements matching the exclude selector
      // For simplicity, we'll skip this in the extraction functions
    }

    const sections = extractSections(htmlToProcess, url);
    const actions = this.config.indexActions ? extractActions(htmlToProcess, url) : [];
    const fields = this.config.indexActions ? extractFields(htmlToProcess, url) : []; // Fields are grouped with actions
    const links = extractLinks(htmlToProcess, url);
    const files = extractFiles(htmlToProcess, url);
    const media = this.config.indexMedia ? extractMedia(htmlToProcess, url) : [];
    const structured = this.config.indexStructuredData ? extractStructuredData(htmlToProcess, url) : [];

    // Combine all results
    const combined: IndexRecord[] = [];
    combined.push(...sections);
    combined.push(...actions);
    combined.push(...fields);
    combined.push(...links);
    combined.push(...files);
    combined.push(...media);
    combined.push(...structured);
    return combined;
  }

  private async indexCurrentPage() {
    try {
      const response = await fetch(window.location.href);
      if (!response.ok) return;
      const html = await response.text();
      const sections = await this.extractAllContent(html, window.location.href.split('#')[0]);
      addToIndex(this.index, sections);
      console.info(`[reef] indexed ${sections.length} sections from current page`);
    } catch (error) {
      console.warn('[reef] current page indexing failed', error);
    }
  }

  public open() {
    if (!this.root) {
      this.renderUI();
    }
    this.isOpen = true;
    this.selectedIndex = 0;
    this.host?.classList.remove('is-hidden');
    this.host?.classList.add('open');
    this.input?.focus();
    this.renderResults();
  }

  public close() {
    this.isOpen = false;
    this.host?.classList.remove('open');
    this.host?.classList.add('is-hidden');
  }

  private renderUI() {
    const host = document.createElement('div');
    host.className = 'reef-host is-hidden';
    document.body.appendChild(host);
    this.host = host;

    const shadow = host.attachShadow({ mode: 'open' });
    this.root = shadow;

    shadow.innerHTML = `
      <style>
        :host { position: fixed; inset: 0; z-index: 2147483647; display: flex; align-items: flex-start; justify-content: center; padding: 12vh 1.25rem 0; background: rgba(5, 5, 6, 0.45); backdrop-filter: blur(10px); opacity: 0; pointer-events: none; transition: opacity 0.14s ease; }
        :host(.is-hidden) { display: none; }
        :host(.open) { opacity: 1; pointer-events: auto; }
        .panel { width: 100%; max-width: 560px; background: rgba(20, 30, 28, 0.65); color: #edebe6; border: 1px solid rgba(67, 217, 200, 0.25); border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.3), inset 0 0 0 1px rgba(255,255,255,0.05); overflow: hidden; transform: translateY(-8px) scale(0.98); transition: transform 0.14s ease; }
        :host(.open) .panel { transform: translateY(0) scale(1); }
        .input-row { display: flex; align-items: center; gap: 0.75rem; padding: 0.95rem 1rem; border-bottom: 1px solid rgba(67, 217, 200, 0.15); }
        .icon { opacity: 0.6; flex-shrink: 0; stroke: #43d9c8; }
        .input { flex: 1; background: transparent; border: 0; outline: none; color: #edebe6; font-size: 1rem; font-family: Inter, system-ui, sans-serif; }
        .input::placeholder { color: #55555a; }
        .hint { font-family: ui-monospace, monospace; font-size: 0.72rem; color: #8a8a8f; border: 1px solid rgba(67, 217, 200, 0.2); border-radius: 6px; padding: 0.15rem 0.5rem; }
        .results { max-height: 340px; overflow-y: auto; padding: 0.5rem; }
        .result { display: flex; flex-direction: column; gap: 0.25rem; width: 100%; text-align: left; padding: 0.8rem 0.75rem; border-radius: 10px; margin-top: 0.25rem; cursor: pointer; border: 0; background: transparent; color: inherit; }
        .result:hover, .result.is-selected { background: rgba(67, 217, 200, 0.12); }
        .result-type { display: flex; align-items: center; gap: 0.25rem; font-size: 0.7rem; margin-bottom: 0.25rem; }
        .result-type-icon { font-size: 0.9rem; }
        .result-type-label { font-family: ui-monospace, monospace; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.5px; color: #43d9c8; }
        .result .breadcrumb { font-family: ui-monospace, monospace; font-size: 0.75rem; color: #8a8a8f; }
        .result .heading { font-size: 0.95rem; font-weight: 500; color: #edebe6; }
        .result .snippet { font-size: 0.85rem; color: #8a8a8f; line-height: 1.5; }
        .result mark { background: rgba(67, 217, 200, 0.22); color: #43d9c8; border-radius: 2px; padding: 0 1px; }
        .result-action-hint { font-size: 0.75rem; font-family: ui-monospace, monospace; color: #55555a; margin-top: 0.25rem; }
        .result-action-hint.run-here { color: #43d9c8; }
        .result-action-hint.go-there { color: #8a8a8f; }
        .empty { padding: 2rem; color: #55555a; text-align: center; font-size: 0.9rem; }
        .footer { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; border-top: 1px solid rgba(67, 217, 200, 0.15); color: #55555a; font-size: 0.75rem; font-family: ui-monospace, monospace; }
        .k { border: 1px solid rgba(67, 217, 200, 0.2); border-radius: 4px; padding: 0.1rem 0.4rem; margin: 0 0.2rem; }
        @media (prefers-reduced-motion: reduce) { :host, .panel { transition: none; } }
      </style>
      <div class="panel" role="dialog" aria-modal="true" aria-label="Site search">
        <div class="input-row">
          <svg class="icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input class="input" type="text" placeholder="Search this site" autocomplete="off" />
          <span class="hint">ESC</span>
        </div>
        <div class="results" aria-live="polite"></div>
        <div class="footer"><span><span class="k">↑↓</span> navigate <span class="k">↵</span> open</span><span id="count"></span></div>
      </div>
    `;

    this.input = shadow.querySelector('input') as HTMLInputElement | null;
    this.resultsList = shadow.querySelector('.results') as HTMLElement | null;

    this.input?.addEventListener('input', () => {
      this.currentQuery = this.input?.value ?? '';
      this.selectedIndex = 0;
      if (this.searchDebounce) cancelAnimationFrame(this.searchDebounce);
      this.searchDebounce = requestAnimationFrame(() => this.renderResults());
    });

    this.input?.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.selectedIndex = (this.selectedIndex + 1) % 8;
        this.renderResults();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.selectedIndex = (this.selectedIndex - 1 + 8) % 8;
        this.renderResults();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const match = this.getVisibleResults()[this.selectedIndex];
        if (match) {
          this.executeAction(match);
          this.close();
        }
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.close();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (this.isOpen && event.key === 'Escape') {
        event.preventDefault();
        this.close();
      }
    });

    shadow.querySelector('.panel')?.addEventListener('click', (event) => event.stopPropagation());
    host.addEventListener('click', () => this.close());

    // Handle deferred actions from sessionStorage
    this.handleDeferredActions();
  }

  private getVisibleResults(): IndexRecord[] {
    const query = this.currentQuery;
    return searchSections(query, this.index, 8);
  }

  private renderResults() {
    const query = this.currentQuery;
    const results = this.getVisibleResults();
    const countEl = this.root?.querySelector('#count');

    if (!this.resultsList) {
      return;
    }

    if (!results.length) {
      const suggestion = findClosestWord(query, this.index);
      if (suggestion) {
        this.resultsList.innerHTML = `<div class="empty">No sections match "${escapeHtml(query)}". Did you mean <strong>${escapeHtml(suggestion)}</strong>?</div>`;
      } else {
        this.resultsList.innerHTML = `<div class="empty">No sections match "${escapeHtml(query)}"</div>`;
      }
      if (countEl) countEl.textContent = '0 results';
      return;
    }

    if (countEl) {
      // Count by type for the footer
      const counts: Record<string, number> = {};
      for (const result of results) {
        const type = getResultTypeLabel(result.type);
        counts[type] = (counts[type] || 0) + 1;
      }

      const countParts = Object.entries(counts)
        .map(([type, count]) => `${count} ${type.toLowerCase()}${count !== 1 ? 's' : ''}`)
        .join(', ');

      countEl.textContent = countParts;
    }

    if (this.resultsList) {
      this.resultsList.innerHTML = results
        .map((result, index) => {
          const isSelected = index === this.selectedIndex;
          const snippet = getSnippet(result.bodyText, query);
          const typeIcon = getResultTypeIcon(result.type);
          const typeLabel = getResultTypeLabel(result.type);

          // Determine if this is an action that can be executed on the current page
          const isAction = result.type === 'action';
          const isSamePage = result.url === window.location.href.split('#')[0];
          const canExecuteHere = isAction && isSamePage && !result.destructive;
          const actionHint = canExecuteHere
            ? '<span class="result-action-hint run-here">↵ to run here</span>'
            : '<span class="result-action-hint go-there">↵ to go there</span>';

          // For structured data, show an inline answer preview
          let answerPreview = '';
          if (result.type === 'structured' && result.structuredData) {
            if (result.structuredData.answer) {
              answerPreview = `<div class="answer-preview">${escapeHtml(result.structuredData.answer.substring(0, 100))}${result.structuredData.answer.length > 100 ? '…' : ''}</div>`;
            } else if (result.structuredData.question && result.structuredData.answer) {
              answerPreview = `<div class="answer-preview"><strong>${escapeHtml(result.structuredData.question)}</strong>: ${escapeHtml(result.structuredData.answer.substring(0, 100))}${result.structuredData.answer.length > 100 ? '…' : ''}</div>`;
            }
          }

          return `
            <button class="result ${isSelected ? 'is-selected' : ''}" type="button" data-index="${index}">
              <div class="result-type">
                <span class="result-type-icon">${typeIcon}</span>
                <span class="result-type-label">${typeLabel}</span>
              </div>
              <div class="breadcrumb">${escapeHtml(result.breadcrumb)}</div>
              <div class="heading">${highlight(result.headingText, query)}</div>
              ${answerPreview}
              <div class="snippet">${highlight(snippet, query)}</div>
              ${isAction ? actionHint : ''}
            </button>
          `;
        })
        .join('');

      this.resultsList.querySelectorAll('button').forEach((button) => {
        button.addEventListener('mouseenter', () => {
          this.selectedIndex = Number(button.getAttribute('data-index')) ?? 0;
          this.renderResults();
        });
        button.addEventListener('click', (event) => {
          event.stopPropagation();
          const match = results[Number(button.getAttribute('data-index')) ?? 0];
          if (match) {
            this.executeAction(match);
            this.close();
          }
        });
      });
    }
  }

  private executeAction(result: IndexRecord): void {
    switch (result.type) {
      case 'action':
        this.executeActionResult(result);
        break;
      case 'field':
        this.focusField(result);
        break;
      case 'link':
      case 'file':
      case 'media':
      case 'section':
      case 'structured':
        window.location.href = result.url;
        break;
    }
  }

  private executeActionResult(result: IndexRecord): void {
    if (result.destructive && this.config.actionsMode !== 'execute') {
      this.highlightAndNavigate(result);
      return;
    }

    const currentUrl = window.location.href.split('#')[0];
    const targetUrl = result.url.split('#')[0];

    if (currentUrl === targetUrl) {
      this.executeActionOnCurrentPage(result);
    } else {
      this.setupDeferredAction(result);
    }
  }

  private executeActionOnCurrentPage(result: IndexRecord): void {
    if (!result.selector) {
      if (result.type === 'field') {
        this.focusField(result);
      }
      return;
    }

    try {
      const element = document.querySelector(result.selector);
      if (!element) {
        this.showToast('Could not find that element on the page. It may have changed.');
        return;
      }

      if (result.type === 'action') {
        const clickEvent = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window,
        });
        element.dispatchEvent(clickEvent);
      } else if (result.type === 'field') {
        (element as HTMLElement).focus();
      }
    } catch (error) {
      console.error('Failed to execute action:', error);
      this.showToast('Could not interact with that element. It may have changed or be unavailable.');
    }
  }

  private focusField(result: IndexRecord): void {
    if (!result.selector) return;

    try {
      const element = document.querySelector(result.selector);
      if (element) {
        (element as HTMLElement).focus();
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
          element.select();
        }
      }
    } catch (error) {
      console.error('Failed to focus field:', error);
    }
  }

  private showToast(message: string): void {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.right = '20px';
    toast.style.background = '#333';
    toast.style.color = '#fff';
    toast.style.padding = '10px 20px';
    toast.style.borderRadius = '4px';
    toast.style.zIndex = '9999';
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';

    document.body.appendChild(toast);

    void toast.offsetWidth;
    toast.style.opacity = '1';

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => {
        document.body.removeChild(toast);
      }, 300);
    }, 2000);
  }

  private handleDeferredActions(): void {
    // Check if we have a deferred action to execute
    const deferredActionStr = sessionStorage.getItem('reef-deferred-action');
    if (!deferredActionStr) return;

    try {
      const deferredAction = JSON.parse(deferredActionStr);
      // Clear the stored action
      sessionStorage.removeItem('reef-deferred-action');

      // Find the element and execute the action
      if (deferredAction.selector) {
        const element = document.querySelector(deferredAction.selector);
        if (element) {
          if (deferredAction.type === 'action' && !deferredAction.destructive) {
            // Execute the action
            const clickEvent = new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              view: window
            });
            element.dispatchEvent(clickEvent);
          } else if (deferredAction.type === 'field') {
            // Focus the field
            (element as HTMLElement).focus();
          }
        }
      }
    } catch (error) {
      console.error('Failed to handle deferred action:', error);
      sessionStorage.removeItem('reef-deferred-action');
    }
  }

  private setupDeferredAction(result: IndexRecord): void {
    // Store the action in sessionStorage to be executed on page load
    const deferredAction = {
      selector: result.selector,
      type: result.type,
      label: result.label,
      destructive: result.destructive
    };

    sessionStorage.setItem('reef-deferred-action', JSON.stringify(deferredAction));

    // Navigate to the target page
    window.location.href = result.url;
  }

  private highlightAndNavigate(result: IndexRecord): void {
    // Navigate to the page
    window.location.href = result.url;

    // If we have a selector, try to highlight the element after navigation
    if (result.selector) {
      const selector = result.selector;
      // We'll use a MutationObserver to check when the DOM is ready
      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector) as HTMLElement | null;
        if (element) {
          // Scroll the element into view
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });

          // Add a temporary highlight effect
          element.style.boxShadow = '0 0 0 3px rgba(108, 140, 255, 0.5)';
          element.style.borderRadius = '4px';

          // Remove the highlight after a short delay
          setTimeout(() => {
            element.style.boxShadow = '';
            element.style.borderRadius = '';
          }, 1500);

          observer.disconnect();
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      // Also set a timeout to disconnect the observer after a while
      setTimeout(() => {
        observer.disconnect();
      }, 5000);
    }
  }
}

export { ReefSearch };
export default ReefSearch;