import { searchSections, addToIndex, createSearchIndex, getAllSections, findClosestWord, suggest, facets, trackQuery, getPopularQueries, searchWithPagination, getTotalResultCount, type IndexRecord, type ScoredRecord, type SearchOptions } from './search.js';
import { UIRenderer, VisualInspector } from './ui/index.js';
import { Indexer } from './indexing/index.js';
import { ActionExecutor } from './actions/index.js';
import { ConfigReader, ConfigApplier } from './config/config-reader.js';
import { Agent } from './agent.js';
import type { ReefConfig, WorkflowStep, WorkflowOptions } from './types.js';

class ReefSearch {
  private config: ReefConfig;
  private index = createSearchIndex();
  private ui: UIRenderer;
  private indexer: Indexer;
  private executor: ActionExecutor;
  private inspector = new VisualInspector();
  private selectCallback: ((result: IndexRecord) => void) | null = null;
  private hotkeyHandler: ((event: KeyboardEvent) => void) | null = null;
  private currentQuery = '';
  private searchDebounce = 0;
  private selectedIndex = 0;

  constructor() {
    this.config = ConfigReader.readConfig();
    this.indexer = new Indexer(this.config);
    this.ui = new UIRenderer();
    this.executor = new ActionExecutor();
    
    // Set up category tab callback
    this.ui.setCategoryCallback(() => {
      this.selectedIndex = 0;
      this.renderResults();
    });

    // Set up settings callbacks
    this.ui.setSettingsCallback((key, val) => {
      if (key === 'theme') {
        this.setTheme(val as 'light' | 'dark' | 'auto');
      } else if (key === 'mode') {
        this.setMode(val as 'regular' | 'opaque' | 'high-contrast');
      } else if (key === 'hotkey') {
        this.setHotkey(val as string);
      } else if (key === 'actionsMode') {
        this.config.actionsMode = val as 'execute' | 'navigate-only';
      }
    });

    this.ui.setRebuildIndexCallback(() => {
      void this.rebuildIndex().then(() => {
        this.updateDiagnosticsAndBadges();
      });
    });

    this.ui.setToggleInspectorCallback((active) => {
      this.toggleInspector(active);
    });

    if (!this.config.headless) {
      this.renderUI();
      this.registerHotkey();
    }
    this.executor.handleDeferredScroll();
    void this.boot();
  }

  private renderUI() {
    const placeholder = this.config.placeholder || 'Search this site';
    const currentMode = this.config.mode ?? 'opaque';
    this.ui.renderUI(placeholder, currentMode as 'regular' | 'opaque' | 'high-contrast', (mode) => {
      this.setMode(mode as 'regular' | 'opaque' | 'high-contrast');
    });
    this.setupEventListeners();
  }

  private setupEventListeners() {
    const input = this.ui.getInput();
    const host = this.ui.getHost()!;
    const root = this.ui.getRoot();

    input?.addEventListener('input', () => {
      this.currentQuery = input?.value ?? '';
      this.selectedIndex = 0;
      if (this.searchDebounce) cancelAnimationFrame(this.searchDebounce);
      this.searchDebounce = requestAnimationFrame(() => this.renderResults());
    });

    // Keyboard navigation at document level - works regardless of which element has focus
    document.addEventListener('keydown', (event) => {
      if (!this.ui.getIsOpen()) return;
      // Events crossing a shadow root are retargeted to the host. Use the
      // composed path to identify keystrokes that originated in the input.
      const originatedInInput = input ? event.composedPath().includes(input) : false;
      if (originatedInInput && !['ArrowDown', 'ArrowUp', 'Enter', 'Escape', 'Tab'].includes(event.key)) {
        return;
      }

      const results = this.getVisibleResults();
      
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (results.length) {
          this.selectedIndex = (this.selectedIndex + 1) % results.length;
          this.renderResults();
          this.ui.scrollSelectedIntoView(this.selectedIndex);
        }
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (results.length) {
          this.selectedIndex = (this.selectedIndex - 1 + results.length) % results.length;
          this.renderResults();
          this.ui.scrollSelectedIntoView(this.selectedIndex);
        }
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const match = results[this.selectedIndex];
        if (match) {
          this.runSelectCallback(match);
          this.executeAction(match);
          this.close();
        }
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.close();
      } else if (event.key === 'Tab') {
        // Only handle Tab if input has focus - otherwise let normal tab navigation work
        if (originatedInInput) {
          event.preventDefault();
          const categories = ['all', 'pages', 'actions', 'files', 'links'];
          const currentCat = this.ui.getActiveCategory();
          const idx = categories.indexOf(currentCat);
          const nextIdx = event.shiftKey
            ? (idx - 1 + categories.length) % categories.length
            : (idx + 1) % categories.length;
          const nextCat = categories[nextIdx];
          
          // Update active tab chip
          const tabEl = root?.querySelector(`.tab-chip[data-cat="${nextCat}"]`) as HTMLElement | null;
          if (tabEl) {
            tabEl.click();
          }
        }
      }
    });

    // Also handle Escape key globally
    document.addEventListener('keydown', (event) => {
      if (this.ui.getIsOpen() && event.key === 'Escape') {
        event.preventDefault();
        this.close();
      }
    });

    host?.addEventListener('click', (event) => {
      const path = event.composedPath();
      const clickedInsidePanel = path.some(
        (el) => el instanceof Element && el.classList.contains('panel')
      );
      if (!clickedInsidePanel) {
        this.close();
      }
    });

    // Focus input when modal opens
    this.ui.setOnOpenCallback(() => {
      input?.focus();
    });

    this.ui.setupFocusTrap();
    this.executor.handleDeferredActions();
  }

  private async boot() {
    await this.indexer.boot(() => this.callOnReady());
    this.index = this.indexer.getIndex();
    this.inspector.setRecords(this.index.allSections);
    this.updateDiagnosticsAndBadges();
  }

  private callOnReady(): void {
    if (this.config.onReady) {
      try {
        this.config.onReady({ index: this.getIndex() });
      } catch (error) {
        console.error('[reef] onReady callback error:', error);
      }
    }
  }

  private updateDiagnosticsAndBadges() {
    const all = this.index.allSections;
    const pages = all.filter(r => r.type === 'section' || r.type === 'structured').length;
    const interactive = all.filter(r => r.type === 'action' || r.type === 'field').length;
    const files = all.filter(r => r.type === 'file').length;
    const links = all.filter(r => r.type === 'link' || r.type === 'media').length;

    this.ui.updateDiagnostics({
      pages: all.filter(r => r.type === 'section').length,
      interactive,
      files
    });

    this.ui.updateCategoryBadges({
      all: all.length,
      pages,
      actions: interactive,
      files,
      links
    });
  }

  private getVisibleResults(): IndexRecord[] {
    const rawResults = searchSections(this.currentQuery, this.index, 100) as IndexRecord[];
    const category = this.ui.getActiveCategory();

    let filtered = rawResults;
    if (category === 'pages') {
      filtered = rawResults.filter(r => r.type === 'section' || r.type === 'structured');
    } else if (category === 'actions') {
      filtered = rawResults.filter(r => r.type === 'action' || r.type === 'field');
    } else if (category === 'files') {
      filtered = rawResults.filter(r => r.type === 'file');
    } else if (category === 'links') {
      filtered = rawResults.filter(r => r.type === 'link' || r.type === 'media');
    }

    return filtered.slice(0, 8);
  }

  private renderResults() {
    const query = this.currentQuery;
    const results = this.getVisibleResults();
    
    // Ensure selectedIndex is within valid bounds
    if (this.selectedIndex >= results.length) {
      this.selectedIndex = Math.max(0, results.length - 1);
    }

    if (!this.ui.getResultsList()) return;

    if (!results.length) {
      const suggestion = findClosestWord(query, this.index);
      if (suggestion) {
        this.ui.getResultsList()!.innerHTML = `<div class="empty">No sections match "${this.escapeHtml(query)}". Did you mean <strong>${this.escapeHtml(suggestion)}</strong>?</div>`;
      } else {
        this.ui.getResultsList()!.innerHTML = `<div class="empty">No sections match "${this.escapeHtml(query)}"</div>`;
      }
      const countEl = this.ui.getRoot()?.querySelector('#count');
      if (countEl) countEl.textContent = '0 results';
      return;
    }

    this.ui.renderResults(query, results, this.selectedIndex,
      (index) => {
        this.selectedIndex = index;
      },
(event, index) => {
          event.preventDefault();
          event.stopPropagation();
          const match = results[index] ?? results[0];
        if (match) {
          this.runSelectCallback(match);
          this.executeAction(match);
          this.close();
        }
      }
    );
  }

  private escapeHtml(s: string): string {
    const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    let result = '';
    for (let i = 0; i < s.length; i++) {
      result += map[s[i]] ?? s[i];
    }
    return result;
  }

  private executeAction(result: IndexRecord): void {
    this.executor.executeAction(result, this.config.actionsMode, (msg) => this.ui.showToast(msg));
  }

  private runSelectCallback(result: IndexRecord): void {
    if (this.selectCallback) {
      try {
        this.selectCallback(result);
      } catch (error) {
        console.error('[reef] select callback error:', error);
      }
    }
  }

  public open() {
    if (this.config.headless) {
      console.warn('[reef] Cannot open modal in headless mode. Use getIndex() instead.');
      return;
    }
    if (!this.ui.getRoot()) {
      this.renderUI();
    }
    const placeholder = this.config.placeholder || 'Search this site';
    if (this.ui.getInput()) {
      this.ui.getInput()!.placeholder = placeholder;
    }
    this.ui.setIsOpen(true);
    this.selectedIndex = 0;
    this.ui.getHost()?.classList.remove('is-hidden');
    this.ui.getHost()?.classList.add('open');
    this.applyConfigToUI();
    this.ui.updateSettingsValues({
      theme: this.config.theme || 'auto',
      mode: this.config.mode || 'regular',
      hotkey: this.config.hotkey || 'ctrlk,cmdk',
      actionsMode: this.config.actionsMode || 'execute',
      inspectorActive: this.inspector.isActive()
    });
    this.updateDiagnosticsAndBadges();
    this.ui.getInput()?.focus();
    this.ui.applyAriaHidden();
    this.renderResults();
    this.ui.getOnOpenCallback()?.();
  }

  private closeInternal(): void {
    this.ui.setIsOpen(false);
    this.ui.getHost()?.classList.remove('open');
    this.ui.getHost()?.classList.add('is-hidden');
  }

  public close() {
    this.ui.restoreBodyAriaHidden();
    this.closeInternal();
  }

  private applyConfigToUI(): void {
    const host = this.ui.getHost();
    if (!host) return;
    ConfigApplier.applyConfigToUI(host, { ...this.config, mode: this.config.mode });
  }

  private registerHotkey() {
    this.unregisterHotkey();
    this.hotkeyHandler = (event) => {
      const hotkey = this.config.hotkey || 'ctrlk,cmdk';
      const handlers: Record<string, boolean> = {
        'ctrlk': event.ctrlKey && event.key === 'k' && !event.shiftKey && !event.altKey && !event.metaKey,
        'cmdk': event.metaKey && event.key === 'k' && !event.shiftKey && !event.altKey && !event.ctrlKey,
        'ctrlshiftk': event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'k',
        'altk': event.altKey && event.key === 'k',
        'f': event.ctrlKey && event.key === 'f',
      };

      const matched = hotkey.split(',').some(k => handlers[k.trim()]);

      if (matched) {
        event.preventDefault();
        this.open();
      }
    };
    document.addEventListener('keydown', this.hotkeyHandler);
  }

  private unregisterHotkey() {
    if (this.hotkeyHandler) {
      document.removeEventListener('keydown', this.hotkeyHandler);
    }
  }

  public setHeadless(headless: boolean): void {
    this.config.headless = headless;
    if (headless) {
      this.unregisterHotkey();
      if (this.ui.getHost()) {
        this.ui.getHost()!.remove();
      }
    }
  }

  public setColorScheme(scheme: { primary: string, secondary: string, background: string, text: string, border: string, radius: number }): void {
    this.config.primaryColor = scheme.primary;
    this.config.secondaryColor = scheme.secondary;
    this.config.backgroundColor = scheme.background;
    this.config.textColor = scheme.text;
    this.config.borderColor = scheme.border;
    this.config.radius = scheme.radius;
    if (this.ui.getIsOpen()) {
      this.applyConfigToUI();
    }
  }

  public setTheme(theme: 'light' | 'dark' | 'auto'): void {
    this.config.theme = theme;
    if (this.ui.getIsOpen()) {
      this.applyConfigToUI();
    }
  }

  public setFontFamily(fontFamily: string): void {
    this.config.fontFamily = fontFamily;
    if (this.ui.getIsOpen()) {
      this.applyConfigToUI();
    }
  }

  public setMode(mode: 'regular' | 'opaque' | 'high-contrast'): void {
    this.config.mode = mode;
    if (this.ui.getIsOpen()) {
      this.applyConfigToUI();
    }
  }

  public setHotkey(hotkey: string): void {
    this.config.hotkey = hotkey;
    this.registerHotkey();
  }

  public setPlaceholder(placeholder: string): void {
    this.config.placeholder = placeholder;
    if (this.ui.getInput()) {
      this.ui.getInput()!.placeholder = placeholder;
    }
  }

  public onselect(callback: (result: IndexRecord) => void): void {
    this.selectCallback = callback;
  }

  public offselect(): void {
    this.selectCallback = null;
  }

  public reindex(): void {
    this.index = createSearchIndex();
    this.indexer.setIndex(this.index);
    void this.boot();
  }

  public rebuildIndex(): Promise<void> {
    return new Promise((resolve) => {
      this.index = createSearchIndex();
      this.indexer.setIndex(this.index);
      const originalOnReady = this.config.onReady;
      this.config.onReady = ({ index }) => {
        originalOnReady?.({ index });
        resolve();
      };
      void this.boot();
    });
  }

  public getIndex(): IndexRecord[] {
    return getAllSections(this.index);
  }

  public addCustomRecords(records: IndexRecord[]): void {
    addToIndex(this.index, records);
  }

  public clearCustomRecords(): void {
    this.index = createSearchIndex();
    this.indexer.setIndex(this.index);
    void this.boot();
  }

  public openWithQuery(query: string): void {
    if (this.config.headless) {
      console.warn('[reef] openWithQuery not available in headless mode. Use search() instead.');
      return;
    }
    if (!this.ui.getRoot()) {
      this.renderUI();
    }
    this.currentQuery = query;
    this.ui.setIsOpen(true);
    this.selectedIndex = 0;
    this.ui.getHost()?.classList.remove('is-hidden');
    this.ui.getHost()?.classList.add('open');
    if (this.ui.getInput()) {
      this.ui.getInput()!.value = query;
    }
    this.ui.getInput()?.focus();
    this.renderResults();
  }

  public getHotkey(): string {
    return this.config.hotkey || 'ctrlk,cmdk';
  }

  public isOpenState(): boolean {
    return this.ui.getIsOpen();
  }

  public getConfig(): ReefConfig {
    return { ...this.config };
  }

  public search(query: string, limit: number = 8): IndexRecord[] {
    return searchSections(query, this.index, limit) as IndexRecord[];
  }

  public searchSections(query: string, options?: SearchOptions | number): ScoredRecord[] {
    return searchSections(query, this.index, options ?? 8) as ScoredRecord[];
  }

  public searchWithPagination(query: string, options: SearchOptions & { cursor?: string; pageSize?: number } = {}) {
    return searchWithPagination(query, this.index, options);
  }

  public getTotalResultCount(query: string, options: SearchOptions = {}): number {
    return getTotalResultCount(query, this.index, options);
  }

  public suggest(query: string, limit: number = 10): string[] {
    return suggest(query, this.index, limit);
  }

  public facets(): Record<string, number> {
    return facets(this.index);
  }

  public trackQuery(query: string): void {
    trackQuery(this.index, query);
  }

  public getPopularQueries(n: number = 10): string[] {
    return getPopularQueries(this.index, n);
  }

  public setOnReady(callback: (data: { index: IndexRecord[] }) => void): void {
    this.config.onReady = callback;
    if (this.index.allSections.length > 0) {
      try {
        callback({ index: this.getIndex() });
      } catch (error) {
        console.error('[reef] onReady callback error:', error);
      }
    }
  }

  public getSitemapUrls(): Promise<string[]> {
    return this.indexer.fetchSitemapUrls();
  }

  public act(recordId: string): Promise<{ success: boolean; reason?: string }> {
    return new Promise((resolve) => {
      const record = this.index.allSections.find(r => r.id === recordId);
      if (!record) {
        resolve({ success: false, reason: 'not-found' });
        return;
      }

      if (record.type === 'action' && record.destructive && this.config.actionsMode !== 'execute') {
        resolve({ success: false, reason: 'blocked-destructive' });
        return;
      }

      try {
        this.executor.executeAction(record, this.config.actionsMode, (msg) => this.ui.showToast(msg));
        resolve({ success: true });
      } catch (error) {
        console.error('[reef] act() error:', error);
        resolve({ success: false, reason: 'error' });
      }
    });
  }

  public fillField(recordId: string, value: string): Promise<{ success: boolean; reason?: string }> {
    return new Promise((resolve) => {
      const record = this.index.allSections.find(r => r.id === recordId);
      if (!record) {
        resolve({ success: false, reason: 'not-found' });
        return;
      }

      if (record.type !== 'field') {
        resolve({ success: false, reason: 'not-a-field' });
        return;
      }

      if (!record.selector) {
        resolve({ success: false, reason: 'no-selector' });
        return;
      }

      try {
        const element = document.querySelector(record.selector);
        if (!element) {
          resolve({ success: false, reason: 'element-not-found' });
          return;
        }

        const inputElement = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

        const descriptor = Object.getOwnPropertyDescriptor(inputElement, 'value');
        if (descriptor && descriptor.set) {
          descriptor.set.call(inputElement, value);
        } else {
          inputElement.value = value;
        }

        const event = new Event('input', { bubbles: true });
        inputElement.dispatchEvent(event);
        const changeEvent = new Event('change', { bubbles: true });
        inputElement.dispatchEvent(changeEvent);

        resolve({ success: true });
      } catch (error) {
        console.error('[reef] fillField() error:', error);
        resolve({ success: false, reason: 'error' });
      }
    });
  }

  public getInteractiveRecords(): IndexRecord[] {
    return this.index.allSections.filter(r => r.type === 'action' || r.type === 'field');
  }

  public getAgentTools(): Array<{ name: string; description: string; type: string; selector?: string; id: string }> {
    return this.getInteractiveRecords().map(r => ({
      name: r.headingText || r.label || r.id,
      description: r.bodyText || '',
      type: r.type,
      selector: r.selector,
      id: r.id
    }));
  }

  public agent(): Agent {
    return new Agent(this.index, this.inspector, this.config.actionsMode || 'execute');
  }

  public async executeWorkflow(definition: WorkflowStep[] | { steps: WorkflowStep[]; options?: WorkflowOptions }, options?: WorkflowOptions): Promise<void> {
    const agent = this.agent();
    const steps = Array.isArray(definition) ? definition : definition.steps;
    await agent.executeWorkflow(steps, options ?? (Array.isArray(definition) ? undefined : definition.options));
  }

  public toggleInspector(force?: boolean): void {
    const shouldActive = typeof force === 'boolean' ? force : !this.inspector.isActive();
    if (shouldActive) {
      this.inspector.activate();
    } else {
      this.inspector.deactivate();
    }
  }
}


export { ReefSearch };
export default ReefSearch;
