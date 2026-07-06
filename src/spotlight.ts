import { extractSections, searchSections, type SectionDocument } from './search';

interface SpotlightConfig {
  sitemap?: string;
  maxPages?: number;
}

class SpotlightSearch {
  private config: SpotlightConfig = {};
  private index: SectionDocument[] = [];
  private root: ShadowRoot | null = null;
  private input: HTMLInputElement | null = null;
  private resultsList: HTMLElement | null = null;
  private status: HTMLElement | null = null;
  private isOpen = false;
  private selectedIndex = 0;

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

  private async boot() {
    const sitemapUrl = new URL(this.config.sitemap ?? '/sitemap.xml', window.location.href);
    try {
      const response = await fetch(sitemapUrl.href);
      if (!response.ok) {
        throw new Error('Failed to fetch sitemap');
      }
      const xml = await response.text();
      const matches = Array.from(xml.matchAll(/<loc>(.*?)<\/loc>/g));
      const urls = matches.map((match) => match[1].trim());
      const sections: SectionDocument[] = [];
      for (const pageUrl of urls.slice(0, this.config.maxPages ?? 500)) {
        const pageResponse = await fetch(pageUrl);
        if (!pageResponse.ok) {
          continue;
        }
        const html = await pageResponse.text();
        sections.push(...extractSections(html, pageUrl));
      }
      this.index = sections;
      console.info(`[spotlight] indexed ${this.index.length} sections`);
    } catch (error) {
      console.warn('[spotlight] indexing failed', error);
    }
  }

  public open() {
    if (!this.root) {
      this.renderUI();
    }
    this.isOpen = true;
    this.selectedIndex = 0;
    this.root?.host?.classList.remove('is-hidden');
    this.input?.focus();
    this.renderResults();
  }

  public close() {
    this.isOpen = false;
    this.root?.host?.classList.add('is-hidden');
  }

  private renderUI() {
    const host = document.createElement('div');
    host.className = 'spotlight-host is-hidden';
    document.body.appendChild(host);

    const shadow = host.attachShadow({ mode: 'open' });
    this.root = shadow;

    shadow.innerHTML = `
      <style>
        :host { position: fixed; inset: 0; z-index: 2147483647; display: flex; justify-content: center; padding-top: 6rem; background: rgba(15, 23, 42, 0.45); }
        :host.is-hidden { display: none; }
        .panel { width: min(640px, calc(100vw - 2rem)); background: white; color: #111827; border-radius: 16px; box-shadow: 0 24px 80px rgba(0,0,0,0.25); overflow: hidden; }
        .input { width: 100%; border: 0; padding: 1rem 1rem 0.85rem; font-size: 1rem; outline: none; }
        .results { max-height: 360px; overflow: auto; padding: 0 0.5rem 0.5rem; }
        .result { display: block; padding: 0.8rem 0.75rem; border-radius: 10px; margin-top: 0.25rem; cursor: pointer; }
        .result:hover, .result.is-selected { background: #f3f4f6; }
        .meta { color: #6b7280; font-size: 0.85rem; margin-top: 0.25rem; }
        .empty { padding: 1rem; color: #6b7280; }
      </style>
      <div class="panel" role="dialog" aria-modal="true" aria-label="Search">
        <input class="input" type="text" placeholder="Search this site" />
        <div class="results"></div>
      </div>
    `;

    this.input = shadow.querySelector('input') as HTMLInputElement | null;
    this.resultsList = shadow.querySelector('.results') as HTMLElement | null;
    this.status = shadow.querySelector('.results') as HTMLElement | null;

    this.input?.addEventListener('input', () => this.renderResults());
    this.input?.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, this.getVisibleResults().length - 1);
        this.renderResults();
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
        this.renderResults();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const match = this.getVisibleResults()[this.selectedIndex];
        if (match) {
          window.location.href = match.url;
          this.close();
        }
      } else if (event.key === 'Escape') {
        this.close();
      }
    });

    shadow.querySelector('.panel')?.addEventListener('click', (event) => event.stopPropagation());
    host.addEventListener('click', () => this.close());
  }

  private getVisibleResults(): SectionDocument[] {
    const query = this.input?.value ?? '';
    return searchSections(query, this.index).slice(0, 8);
  }

  private renderResults() {
    const results = this.getVisibleResults();
    if (!this.resultsList) {
      return;
    }

    if (!results.length) {
      this.resultsList.innerHTML = '<div class="empty">No results yet.</div>';
      return;
    }

    this.resultsList.innerHTML = results
      .map((result, index) => {
        const isSelected = index === this.selectedIndex;
        return `
          <button class="result ${isSelected ? 'is-selected' : ''}" type="button" data-index="${index}">
            <strong>${result.headingText}</strong>
            <div class="meta">${result.bodyText.slice(0, 120)}</div>
          </button>
        `;
      })
      .join('');

    this.resultsList.querySelectorAll('button').forEach((button) => {
      button.addEventListener('click', () => {
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
