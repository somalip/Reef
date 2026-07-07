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
  // Customization fields
  primaryColor?: string;
  secondaryColor?: string;
  backgroundColor?: string;
  textColor?: string;
  borderColor?: string;
  radius?: number;
  theme?: 'light' | 'dark' | 'auto';
  fontFamily?: string;
  mode?: 'regular' | 'opaque' | 'high-contrast';
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
    this.applyConfigToUI(); // Apply initial styling
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
      // Customization fields
      primaryColor: dataset.primaryColor,
      secondaryColor: dataset.secondaryColor,
      backgroundColor: dataset.backgroundColor,
      textColor: dataset.textColor,
      borderColor: dataset.borderColor,
      radius: dataset.radius ? Number(dataset.radius) : 16,
      theme: dataset.theme as 'light' | 'dark' | 'auto' | undefined,
      fontFamily: dataset.fontFamily,
      mode: dataset.mode as 'regular' | 'opaque' | 'high-contrast' | undefined,
    };
  }

  private applyConfigToUI(): void {
    if (!this.host) return;
    const cfg = this.config;
    this.host.style.setProperty('--primary-color', cfg.primaryColor ?? '#43d9c8');
    this.host.style.setProperty('--secondary-color', cfg.secondaryColor ?? '#ff8562');
    this.host.style.setProperty('--background-color', cfg.backgroundColor ?? 'rgba(20,30,28,0.65)');
    this.host.style.setProperty('--text-color', cfg.textColor ?? '#edebe6');
    this.host.style.setProperty('--border-color', cfg.borderColor ?? 'rgba(67,217,200,0.25)');
    this.host.style.setProperty('--radius', cfg.radius?.toString() ?? '16');
    this.host.style.setProperty('--font-family', cfg.fontFamily ?? 'Inter, system-ui, sans-serif');

    // Apply mode class
    this.host.classList.remove('mode-regular', 'mode-opaque', 'mode-high-contrast');
    switch (cfg.mode) {
      case 'opaque':
        this.host.classList.add('mode-opaque');
        break;
      case 'high-contrast':
        this.host.classList.add('mode-high-contrast');
        break;
      default:
        this.host.classList.add('mode-regular');
    }
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

    let rootElement: Element | Document = doc;
    if (this.config.scope) {
      const scopeElement = doc.querySelector(this.config.scope);
      if (scopeElement) {
        rootElement = scopeElement;
      }
    }

    let htmlToProcess = new XMLSerializer().serializeToString(rootElement as Element);

    if (this.config.excludeAction) {
      // Exclusion logic would go here
    }

    const sections = extractSections(htmlToProcess, url);
    const actions = this.config.indexActions ? extractActions(htmlToProcess, url) : [];
    const fields = this.config.indexActions ? extractFields(htmlToProcess, url) : [];
    const links = extractLinks(htmlToProcess, url);
    const files = extractFiles(htmlToProcess, url);
    const media = this.config.indexMedia ? extractMedia(htmlToProcess, url) : [];
    const structured = this.config.indexStructuredData ? extractStructuredData(htmlToProcess, url) : [];

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

    // Apply current config styling
    this.applyConfigToUI();

    const shadow = host.attachShadow({ mode: 'open' });
    this.root = shadow;

    const currentMode = this.config.mode ?? 'regular';
    shadow.innerHTML = `
      <style>
        :host {
          position: fixed;
          inset: 0;
          z-index: 2147483647;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 12vh 1.25rem 0;
          background: var(--background-color, rgba(5,5,6,0.45));
          backdrop-filter: blur(10px);
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.14s ease;
        }
        :host(.is-hidden) { display: none; }
        :host(.open) { opacity: 1; pointer-events: auto; }

        :host(.mode-opaque) {
          background: rgba(5,5,6,0.2) !important;
        }
        :host(.mode-high-contrast) {
          --primary-color: #fff;
          --text-color: #000;
          --border-color: #000;
          background: rgba(255,255,255,0.9) !important;
        }

        .panel {
          width: 100%;
          max-width: 560px;
          background: var(--background-color, rgba(20,30,28,0.65));
          color: var(--text-color, #edebe6);
          border: 1px solid var(--border-color, rgba(67,217,200,0.25));
          border-radius: var(--radius, 16px);
          box-shadow: 0 8px 32px rgba(0,0,0,0.3), inset 0 0 0 1px rgba(255,255,255,0.05);
          overflow: hidden;
          transform: translateY(-8px) scale(0.98);
          transition: transform 0.14s ease;
        }
        :host(.open) .panel { transform: translateY(0) scale(1); }

        :host(.mode-high-contrast) .panel {
          background: rgba(255,255,255,0.95);
        }

        .input-row {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.95rem 1rem;
          border-bottom: 1px solid var(--border-color, rgba(67,217,200,0.15));
        }

        .icon {
          opacity: 0.6;
          flex-shrink: 0;
          stroke: var(--primary-color, #43d9c8);
        }

        .input {
          flex: 1;
          background: transparent;
          border: 0;
          outline: none;
          color: var(--text-color, #edebe6);
          font-size: 1rem;
          font-family: var(--font-family, Inter, system-ui, sans-serif);
        }
        .input::placeholder {
          color: #55555a;
        }

        .hint {
          font-family: ui-monospace, monospace;
          font-size: 0.72rem;
          color: #8a8a8f;
          border: 1px solid var(--border-color, rgba(67,217,200,0.2));
          border-radius: 6px;
          padding: 0.15rem 0.5rem;
        }

        .results {
          max-height: 340px;
          overflow-y: auto;
          padding: 0.5rem;
        }

        .result {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          width: 100%;
          text-align: left;
          padding: 0.8rem 0.75rem;
          border-radius: var(--radius, 10px);
          margin-top: 0.25rem;
          cursor: pointer;
          border: 0;
          background: transparent;
          color: inherit;
        }
        .result:hover, .result.is-selected {
          background: rgba(67,217,200,0.12);
        }
        .result-type {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 0.7rem;
          margin-bottom: 0.25rem;
        }
        .result-type-icon {
          font-size: 0.9rem;
        }
        .result-type-label {
          font-family: ui-monospace, monospace;
          font-size: 0.7rem;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: var(--primary-color, #43d9c8);
        }
        .result .breadcrumb {
          font-family: ui-monospace, monospace;
          font-size: 0.75rem;
          color: #8a8a8f;
        }
        .result .heading {
          font-size: 0.95rem;
          font-weight: 500;
          color: var(--text-color, #edebe6);
        }
        .result .snippet {
          font-size: 0.85rem;
          color: var(--text-color, #8a8a8f);
          line-height: 1.5;
        }
        .result mark {
          background: rgba(67,217,200,0.22);
          color: var(--primary-color, #43d9c8);
          border-radius: 2px;
          padding: 0 1px;
        }
        .result-action-hint {
          font-size: 0.75rem;
          font-family: ui-monospace, monospace;
          color: #55555a;
          margin-top: 0.25rem;
        }
        .result-action-hint.run-here { color: var(--primary-color, #43d9c8); }
        .result-action-hint.go-there { color: #8a8a8f; }
        .empty {
          padding: 2rem;
          color: #55555a;
          text-align: center;
          font-size: 0.9rem;
        }
        .footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.75rem 1rem;
          border-top: 1px solid var(--border-color, rgba(67,217,200,0.15));
          color: #55555a;
          font-size: 0.75rem;
          font-family: ui-monospace, monospace;
        }
        .k {
          border: 1px solid var(--border-color, rgba(67,217,200,0.2));
          border-radius: 4px;
          padding: 0.1rem 0.4rem;
          margin: 0 0.2rem;
        }
        @media (prefers-reduced-motion: reduce) {
          :host, .panel { transition: none; }
        }
      </style>
      <div class="panel" role="dialog" aria-modal="true" aria-label="Site search">
        <div class="input-row">
          <svg class="icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          <input class="input" type="text" placeholder="Search this site" autocomplete="off" />
          <span class="hint">ESC</span>
        </div>
        <div class="settings-row" style="padding:0.5rem 1rem;border-bottom:1px solid var(--border-color,rgba(67,217,200,0.15));font-size:0.75rem;color:var(--text-color,#8a8a8f);">
          <label for="modeSelect">Mode:</label>
          <select id="modeSelect" style="margin-left:0.5rem;background:transparent;border:1px solid var(--border-color,rgba(67,217,200,0.2));border-radius:4px;color:var(--text-color,#edebe6);font-family:ui-monospace,monospace;font-size:0.7rem;">
            <option value="regular" ${currentMode === 'regular' ? 'selected' : ''}>Regular</option>
            <option value="opaque" ${currentMode === 'opaque' ? 'selected' : ''}>Opaque</option>
            <option value="high-contrast" ${currentMode === 'high-contrast' ? 'selected' : ''}>High Contrast</option>
          </select>
        </div>
        <div class="results" aria-live="polite"></div>
        <div class="footer"><span><span class="k">↑↓</span> navigate <span class="k">↵</span> open</span><span id="count"></span></div>
      </div>
    `;

    this.input = shadow.querySelector('input') as HTMLInputElement | null;
    this.resultsList = shadow.querySelector('.results') as HTMLElement | null;

    // Mode selector event listener
    const modeSelect = shadow.querySelector('#modeSelect') as HTMLSelectElement | null;
    modeSelect?.addEventListener('change', (e) => {
      const mode = (e.target as HTMLSelectElement).value as 'regular' | 'opaque' | 'high-contrast';
      this.setMode(mode);
    });

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

          const isAction = result.type === 'action';
          const isSamePage = result.url === window.location.href.split('#')[0];
          const canExecuteHere = isAction && isSamePage && !result.destructive;
          const actionHint = canExecuteHere
            ? '<span class="result-action-hint run-here">↵ to run here</span>'
            : '<span class="result-action-hint go-there">↵ to go there</span>';

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
    const deferredActionStr = sessionStorage.getItem('reef-deferred-action');
    if (!deferredActionStr) return;

    try {
      const deferredAction = JSON.parse(deferredActionStr);
      sessionStorage.removeItem('reef-deferred-action');

      if (deferredAction.selector) {
        const element = document.querySelector(deferredAction.selector);
        if (element) {
          if (deferredAction.type === 'action' && !deferredAction.destructive) {
            const clickEvent = new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              view: window,
            });
            element.dispatchEvent(clickEvent);
          } else if (deferredAction.type === 'field') {
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
    const deferredAction = {
      selector: result.selector,
      type: result.type,
      label: result.label,
      destructive: result.destructive,
    };
    sessionStorage.setItem('reef-deferred-action', JSON.stringify(deferredAction));
    window.location.href = result.url;
  }

  private highlightAndNavigate(result: IndexRecord): void {
    window.location.href = result.url;
    if (result.selector) {
      const selector = result.selector;
      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector) as HTMLElement | null;
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.style.boxShadow = '0 0 0 3px rgba(108, 140, 255, 0.5)';
          element.style.borderRadius = '4px';
          observer.disconnect();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => observer.disconnect(), 5000);
    }
  }

  private setConfig(partial: Partial<ReefConfig>): void {
    Object.assign(this.config, partial);
    if (this.isOpen) {
      this.applyConfigToUI();
    }
  }

  public setColorScheme(scheme: {primary:string, secondary:string, background:string, text:string, border:string, radius:number}): void {
    this.config.primaryColor = scheme.primary;
    this.config.secondaryColor = scheme.secondary;
    this.config.backgroundColor = scheme.background;
    this.config.textColor = scheme.text;
    this.config.borderColor = scheme.border;
    this.config.radius = scheme.radius;
    if (this.isOpen) {
      this.applyConfigToUI();
    }
  }

  public setTheme(theme: 'light' | 'dark' | 'auto'): void {
    const schemes: Record<'light'|'dark'|'auto', {primary:string, secondary:string, background:string, text:string, border:string, radius:number}> = {
      light: {
        primary: '#ff8562',
        secondary: '#ffab8c',
        background: 'rgba(255,255,255,0.8)',
        text: '#111111',
        border: '#cccccc',
        radius: 8,
      },
      dark: {
        primary: '#43d9c8',
        secondary: '#ff8562',
        background: 'rgba(0,0,0,0.7)',
        text: '#f0f0f0',
        border: '#555555',
        radius: 8,
      },
      auto: {
        primary: '#43d9c8',
        secondary: '#ff8562',
        background: 'rgba(20,30,28,0.65)',
        text: '#edebe6',
        border: '#1e3634',
        radius: 16,
      },
    };
    this.config.theme = theme;
    if (this.isOpen) {
      this.applyConfigToUI();
    }
  }

  public setFontFamily(fontFamily:string): void {
    this.config.fontFamily = fontFamily;
    if (this.isOpen) {
      this.applyConfigToUI();
    }
  }

  public setMode(mode: 'regular' | 'opaque' | 'high-contrast'): void {
    this.config.mode = mode;
    if (this.isOpen) {
      this.applyConfigToUI();
    }
  }
}

export { ReefSearch };
export default ReefSearch;