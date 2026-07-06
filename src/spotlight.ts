import {
  extractSections,
  resolveUrl,
  searchSections,
  addSectionsToIndex,
  type SectionDocument,
  createSearchIndex,
} from './search.js';

interface SpotlightConfig {
  sitemap?: string;
  maxPages?: number;
  scope?: string;
}

function escapeHtml(s: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
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

class SpotlightSearch {
  private config: SpotlightConfig = {};
  private index = createSearchIndex();
  private root: ShadowRoot | null = null;
  private host: HTMLDivElement | null = null;
  private input: HTMLInputElement | null = null;
  private resultsList: HTMLElement | null = null;
  private isOpen = false;
  private selectedIndex = 0;
  private currentQuery = '';
  private searchDebounce = 0;

  constructor() {
    this.config = this.readConfig();
    this.registerHotkey();
    void this.boot();
  }

  private readConfig(): SpotlightConfig {
    const script = document.currentScript as HTMLScriptElement | null;
    const dataset = script?.dataset ?? {};
    return {
      sitemap: dataset.sitemap ?? '/sitemap.xml',
      maxPages: Number(dataset.maxPages ?? 500),
      scope: dataset.scope,
    };
  }

  private registerHotkey() {
    document.addEventListener('keydown', (event) => {
      const isHotkey = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
      if (isHotkey) {
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
          addSectionsToIndex(this.index, fetchedSections);
          console.info(`[spotlight] indexed ${fetchedSections.length} sections`);
          return;
        }
      } catch (error) {
        console.warn('[spotlight] sitemap fetch failed', candidate, error);
      }
    }

    this.indexCurrentPage();
  }

  private async fetchPagesParallel(urls: string[], sitemapUrl: string): Promise<SectionDocument[]> {
    const concurrency = 6;
    const sections: SectionDocument[] = [];
    const results: (SectionDocument[] | null)[] = new Array(urls.length);

    let idx = 0;
    const fetchBatch = async () => {
      while (idx < urls.length) {
        const i = idx++;
        const pageUrl = resolveUrl(urls[i], sitemapUrl);
        try {
          const pageResponse = await fetch(pageUrl);
          if (pageResponse.ok) {
            const html = await pageResponse.text();
            results[i] = extractSections(html, pageUrl);
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

  private async indexCurrentPage() {
    try {
      const response = await fetch(window.location.href);
      if (!response.ok) return;
      const html = await response.text();
      const sections = extractSections(html, window.location.href.split('#')[0]);
      addSectionsToIndex(this.index, sections);
      console.info(`[spotlight] indexed ${sections.length} sections from current page`);
    } catch (error) {
      console.warn('[spotlight] current page indexing failed', error);
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
    host.className = 'spotlight-host is-hidden';
    document.body.appendChild(host);
    this.host = host;

    const shadow = host.attachShadow({ mode: 'open' });
    this.root = shadow;

    shadow.innerHTML = `
      <style>
        :host { position: fixed; inset: 0; z-index: 2147483647; display: flex; align-items: flex-start; justify-content: center; padding: 12vh 1.25rem 0; background: rgba(5, 5, 6, 0.65); backdrop-filter: blur(3px); opacity: 0; pointer-events: none; transition: opacity 0.14s ease; }
        :host(.is-hidden) { display: none; }
        :host(.open) { opacity: 1; pointer-events: auto; }
        .panel { width: 100%; max-width: 560px; background: #131316; color: #edebe6; border: 1px solid #2a2a2e; border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.5); overflow: hidden; transform: translateY(-8px) scale(0.98); transition: transform 0.14s ease; }
        :host(.open) .panel { transform: translateY(0) scale(1); }
        .input-row { display: flex; align-items: center; gap: 0.75rem; padding: 0.95rem 1rem; border-bottom: 1px solid #232326; }
        .icon { opacity: 0.5; flex-shrink: 0; }
        .input { flex: 1; background: transparent; border: 0; outline: none; color: #edebe6; font-size: 1rem; font-family: Inter, system-ui, sans-serif; }
        .input::placeholder { color: #55555a; }
        .hint { font-family: ui-monospace, monospace; font-size: 0.72rem; color: #55555a; border: 1px solid #232326; border-radius: 5px; padding: 0.15rem 0.5rem; }
        .results { max-height: 340px; overflow-y: auto; padding: 0.5rem; }
        .result { display: flex; flex-direction: column; gap: 0.25rem; width: 100%; text-align: left; padding: 0.8rem 0.75rem; border-radius: 10px; margin-top: 0.25rem; cursor: pointer; border: 0; background: transparent; color: inherit; }
        .result:hover, .result.is-selected { background: rgba(108, 140, 255, 0.14); }
        .result .breadcrumb { font-family: ui-monospace, monospace; font-size: 0.75rem; color: #8a8a8f; }
        .result .heading { font-size: 0.95rem; font-weight: 500; color: #edebe6; }
        .result .snippet { font-size: 0.85rem; color: #8a8a8f; line-height: 1.5; }
        .result mark { background: rgba(255, 214, 102, 0.22); color: #ffd666; border-radius: 2px; padding: 0 1px; }
        .empty { padding: 2rem; color: #55555a; text-align: center; font-size: 0.9rem; }
        .footer { display: flex; justify-content: space-between; align-items: center; padding: 0.75rem 1rem; border-top: 1px solid #232326; color: #55555a; font-size: 0.75rem; font-family: ui-monospace, monospace; }
        .k { border: 1px solid #232326; border-radius: 4px; padding: 0.1rem 0.4rem; margin: 0 0.2rem; }
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
          window.location.href = match.url;
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
  }

  private getVisibleResults(): SectionDocument[] {
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
      this.resultsList.innerHTML = `<div class="empty">No sections match "${escapeHtml(query)}"</div>`;
      if (countEl) countEl.textContent = '0 results';
      return;
    }

    if (countEl) {
      countEl.textContent = `${results.length} result${results.length !== 1 ? 's' : ''}`;
    }

    this.resultsList.innerHTML = results
      .map((result, index) => {
        const isSelected = index === this.selectedIndex;
        const snippet = getSnippet(result.bodyText, query);
        return `
          <button class="result ${isSelected ? 'is-selected' : ''}" type="button" data-index="${index}">
            <div class="breadcrumb">${escapeHtml(result.breadcrumb)}</div>
            <div class="heading">${highlight(result.headingText, query)}</div>
            <div class="snippet">${highlight(snippet, query)}</div>
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
          window.location.href = match.url;
          this.close();
        }
      });
    });
  }
}

const spotlight = new SpotlightSearch();
(window as Window & { Spotlight?: SpotlightSearch }).Spotlight = spotlight;