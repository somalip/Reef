/**
 * Reef Engine - Pure Vanilla JavaScript Application
 * Zero Dependencies | Zero Frameworks
 */

document.addEventListener('DOMContentLoaded', () => {
  // Application State
  const state = {
    activeTab: 'overview',
    selectedArchPhase: 0,
    selectedApiMethod: 'agent()',
    apiMethodQuery: '',
    apiLogs: [],
    benchmarkVisibleTools: ['Reef', 'Pagefind', 'Stork', 'Algolia', 'Meilisearch'],
    installActionsMode: 'execute',
    installSitemap: '/sitemap.xml',
    installShortcut: 'cmdk',
    faqSelectedCategory: 'All',
    faqSearchQuery: '',
    faqOpenIds: new Set(['1']),
    searchModalOpen: false,
    searchCategory: 'All',
    searchQuery: '',
    searchSelectedIndex: 0
  };

  // Static Data
  const ARCHITECTURE_PHASES = [
    {
      step: '01',
      title: 'Sitemap Discovery & Crawling',
      tag: 'INDEXER',
      description: 'The Indexer reads data-sitemap (default: /sitemap.xml) and parses <loc> + <lastmod> entries. Falls back to same-origin breadth-first crawl if no sitemap is available. Pages are fetched as text and parsed with DOMParser — no scripts execute.',
      points: [
        'Parses sitemap.xml <loc> entries; follows one level of sitemap index nesting',
        'Fallback same-origin crawl capped by data-max-pages (default 500)',
        'Respects crawlDelay, honors rel="nofollow", excludes same-page anchors',
        'Worker-based indexing off main thread when data-use-worker-indexing="true"'
      ],
      code: `// Phase 1: Sitemap Discovery (indexer.ts)\nconst urls = await this.fetchSitemapUrls();\n// Falls back to breadth-first crawl if sitemap returns 404\nfor (const url of urls) {\n  const html = await fetch(url).then(r => r.text());\n  const doc = new DOMParser().parseFromString(html, 'text/html');\n  await extractSections(doc, url, this.index);\n}`
    },
    {
      step: '02',
      title: 'Content Extraction & Section Splitting',
      tag: 'EXTRACTION',
      description: 'extraction.ts walks the parsed DOM, selects the main content root, strips nav/boilerplate, and splits the document at each heading boundary to produce SectionDocument records with breadcrumb context and anchor IDs.',
      points: [
        'Heading-based section splitting: each <h1>–<h6> creates a SectionDocument',
        'Universal record types: section, action, field, file, media, structured',
        'data-index-actions / data-index-fields attributes enable action+field indexing',
        'Structured data extracted from JSON-LD; media captions and alt text indexed'
      ],
      code: `// Phase 2: Section Extraction (extraction.ts)\nconst sections = extractSections(doc, url);\n// Each heading → { id, url, headingText, headingId,\n//   breadcrumb, bodyText } as SectionDocument`
    },
    {
      step: '03',
      title: 'IndexedDB Cache & Invalidation',
      tag: 'CACHE',
      description: 'cache.ts persists the serialized index in IndexedDB keyed by origin. Cache validity is checked using a versionHash computed from sitemap <lastmod> values, ETags, and content hashes. Expired or stale entries trigger a full rebuild.',
      points: [
        'Stores versionHash, buildTime, and per-page ETag/lastModified/contentHash',
        'TTL configurable via data-ttl attribute (seconds); defaults to 7 days',
        'rebuildIndex() forces a fresh crawl and cache write',
        'If index exceeds size threshold it stays in-memory only for the session'
      ],
      code: `// Phase 3: Cache Lookup (cache.ts)\nconst cached = await cache.load(origin);\nif (cached && !isStale(cached, sitemapHash)) {\n  return deserialize(cached.payload); // skip crawl\n}`
    },
    {
      step: '04',
      title: 'BM25F Search Engine & Result Ranking',
      tag: 'SEARCH_ENGINE',
      description: 'search-index.ts maintains an in-memory inverted index with per-field BM25F scoring across headingText, bodyText, label, and breadcrumb fields. MMR diversity re-ranking and popularity-based boosting can be layered on top.',
      points: [
        'Multi-field BM25F with configurable k1, b parameters (default k1=1.2, b=0.75)',
        'MMR (Maximal Marginal Relevance) diversity parameter mmrLambda (0–1, default 0.5)',
        'Popularity tracking: trackQuery() logs queries; getPopularQueries() returns top-N',
        'Fuzzy fallback using Levenshtein distance; suggest() for autocomplete prefix trie'
      ],
      code: `// Phase 4: BM25F Search (search-index.ts)\nconst results = searchSections(query, index, {\n  scoringAlgorithm: 'bm25f',\n  diversify: true,\n  mmrLambda: 0.5,\n  trackPopularity: true\n});`
    },
    {
      step: '05',
      title: 'Shadow DOM UI & Keyboard Navigation',
      tag: 'UI_LAYER',
      description: 'renderer.ts mounts a Shadow DOM host so all modal styles are isolated from the host page. The search overlay supports keyboard-first navigation (↑↓ Enter Esc Tab), focus trapping, aria-live announcements, and full theming via CSS variables.',
      points: [
        'Shadow DOM root prevents style bleed in both directions',
        'Hotkey registration via data-hotkey (default: ctrlk,cmdk)',
        'Configurable visual mode: regular, opaque, high-contrast',
        'Visual Inspector overlay highlights indexed interactive elements on-page'
      ],
      code: `// Phase 5: Shadow DOM UI (renderer.ts)\nconst host = document.createElement('div');\nconst shadow = host.attachShadow({ mode: 'open' });\n// Injects modal markup + scoped styles into shadow root`
    },
    {
      step: '06',
      title: 'Agent & Action Execution Layer',
      tag: 'AGENT',
      description: 'agent.ts provides a fluent chainable Agent class. action-executor.ts resolves IndexRecord selectors to live DOM elements and dispatches synthetic events. actionsMode gates destructive operations: "execute" allows all indexed actions; "navigate-only" falls back to page navigation.',
      points: [
        'agent().click / .type / .submit / .navigate / .extract / .wait / .back / .forward',
        'act(recordId) executes an indexed action by ID without opening the modal',
        'fillField(recordId, value) fills a form field using native property setters (React/Vue safe)',
        'executeWorkflow(steps, options) runs multi-step JSON/YAML workflows with retry logic'
      ],
      code: `// Phase 6: Agent Chain (agent.ts)\nawait window.Reef.agent()\n  .type('#email', 'user@example.com')\n  .click('#submit-btn');\n// Or low-level: await window.Reef.act('action_rec_1');`
    }
  ];

  const API_METHODS = [
    {
      name: 'open()',
      signature: 'window.Reef.open(): void',
      description: 'Opens the search modal overlay. No-op in headless mode.',
      safety: 'Safe'
    },
    {
      name: 'close()',
      signature: 'window.Reef.close(): void',
      description: 'Closes the search modal and restores focus.',
      safety: 'Safe'
    },
    {
      name: 'search()',
      signature: 'window.Reef.search(query: string, limit?: number): IndexRecord[]',
      description: 'Runs a synchronous BM25F query against the in-memory index and returns matching IndexRecord objects.',
      safety: 'Safe'
    },
    {
      name: 'searchSections()',
      signature: 'window.Reef.searchSections(query: string, options?: SearchOptions | number): ScoredRecord[]',
      description: 'Extended search returning ScoredRecord objects with score and match spans. Supports BM25F options, diversify, and popularity boosting.',
      safety: 'Safe'
    },
    {
      name: 'suggest()',
      signature: 'window.Reef.suggest(query: string, limit?: number): string[]',
      description: 'Returns autocomplete suggestions for a partial query prefix using the internal trie.',
      safety: 'Safe'
    },
    {
      name: 'facets()',
      signature: 'window.Reef.facets(): Record<string, number>',
      description: 'Returns a map of record type → count for the current index (section, action, field, file, etc.).',
      safety: 'Safe'
    },
    {
      name: 'trackQuery()',
      signature: 'window.Reef.trackQuery(query: string): void',
      description: 'Logs a query to the popularity tracker. High-frequency queries receive a relevance boost in subsequent searches.',
      safety: 'Safe'
    },
    {
      name: 'getPopularQueries()',
      signature: 'window.Reef.getPopularQueries(n?: number): string[]',
      description: 'Returns the top-N most frequently tracked query strings.',
      safety: 'Safe'
    },
    {
      name: 'act()',
      signature: 'window.Reef.act(recordId: string): Promise<{ success: boolean; reason?: string }>',
      description: 'Executes an indexed action by record ID without opening the modal. Respects actionsMode gating for destructive actions.',
      safety: 'actionsMode'
    },
    {
      name: 'fillField()',
      signature: 'window.Reef.fillField(recordId: string, value: string): Promise<{ success: boolean; reason?: string }>',
      description: 'Programmatically fills a form field using native property setters with input+change event dispatch. React/Vue compatible.',
      safety: 'actionsMode'
    },
    {
      name: 'agent()',
      signature: 'window.Reef.agent(): Agent',
      description: 'Returns a chainable Agent instance. Chain: .click(sel), .type(sel, val), .submit(sel?), .navigate(url), .back(), .forward(), .wait(ms), .extract(sel), .findActionable(text), .getSession(), .executeWorkflow(steps, opts).',
      safety: 'actionsMode'
    },
    {
      name: 'executeWorkflow()',
      signature: 'window.Reef.executeWorkflow(steps: WorkflowStep[] | WorkflowDefinition, opts?: WorkflowOptions): Promise<void>',
      description: 'Runs a multi-step JSON/YAML workflow. Supports maxRetries, retryDelay, stopOnError, and lifecycle callbacks onStepStart/onStepComplete/onStepError.',
      safety: 'actionsMode'
    },
    {
      name: 'getAgentTools()',
      signature: 'window.Reef.getAgentTools(): AgentTool[]',
      description: 'Returns all indexed actionable elements as LLM tool descriptors: { name, description, type, selector, id }.',
      safety: 'Safe'
    },
    {
      name: 'getInteractiveRecords()',
      signature: 'window.Reef.getInteractiveRecords(): IndexRecord[]',
      description: 'Returns all indexed action and field records from the current index.',
      safety: 'Safe'
    },
    {
      name: 'addCustomRecords()',
      signature: 'window.Reef.addCustomRecords(records: IndexRecord[]): void',
      description: 'Injects custom IndexRecord objects into the live index without triggering a full rebuild.',
      safety: 'Safe'
    },
    {
      name: 'openWithQuery()',
      signature: 'window.Reef.openWithQuery(query: string): void',
      description: 'Opens the search modal pre-populated with a query string.',
      safety: 'Safe'
    },
    {
      name: 'reindex()',
      signature: 'window.Reef.reindex(): void',
      description: 'Clears the in-memory index and triggers a fresh crawl and rebuild.',
      safety: 'Safe'
    },
    {
      name: 'rebuildIndex()',
      signature: 'window.Reef.rebuildIndex(): Promise<void>',
      description: 'Clears and rebuilds the index, resolving the promise when the rebuild completes.',
      safety: 'Safe'
    },
    {
      name: 'getIndex()',
      signature: 'window.Reef.getIndex(): IndexRecord[]',
      description: 'Returns all records currently in the index.',
      safety: 'Safe'
    },
    {
      name: 'getSitemapUrls()',
      signature: 'window.Reef.getSitemapUrls(): Promise<string[]>',
      description: 'Fetches and parses the sitemap, returning the list of discovered URLs.',
      safety: 'Safe'
    },
    {
      name: 'onselect()',
      signature: 'window.Reef.onselect(fn: (record: IndexRecord) => void): void',
      description: 'Registers a callback fired when the user selects a result in the modal.',
      safety: 'Safe'
    },
    {
      name: 'toggleInspector()',
      signature: 'window.Reef.toggleInspector(force?: boolean): void',
      description: 'Toggles the visual Inspector overlay which highlights all indexed interactive elements on the page.',
      safety: 'Safe'
    },
    {
      name: 'setTheme()',
      signature: 'window.Reef.setTheme(theme: "light" | "dark" | "auto"): void',
      description: 'Switches the modal color theme at runtime.',
      safety: 'Safe'
    },
    {
      name: 'setMode()',
      signature: 'window.Reef.setMode(mode: "regular" | "opaque" | "high-contrast"): void',
      description: 'Switches the visual mode of the modal overlay.',
      safety: 'Safe'
    },
    {
      name: 'setHotkey()',
      signature: 'window.Reef.setHotkey(hotkey: string): void',
      description: 'Re-registers the keyboard shortcut (e.g. "cmdk", "ctrlk", "ctrlshiftk"). Accepts comma-separated combos.',
      safety: 'Safe'
    },
    {
      name: 'getConfig()',
      signature: 'window.Reef.getConfig(): ReefConfig',
      description: 'Returns a snapshot of the current runtime configuration object.',
      safety: 'Safe'
    }
  ];

  const BENCHMARK_TOOLS = [
    {
      name: 'Reef',
      isPinned: true,
      latency: { text: '38ms (Client)', score: 'good' },
      cost: { text: '$0.00 / Mo', score: 'good' },
      setup: { text: '1 Line Tag', score: 'good' },
      agentic: { text: 'Native Primitives', score: 'good' },
      offline: { text: '100% Offline', score: 'good' },
      privacy: { text: 'Zero Telemetry', score: 'good' }
    },
    {
      name: 'Pagefind',
      isPinned: false,
      latency: { text: '85ms (Client)', score: 'good' },
      cost: { text: '$0.00 / Mo', score: 'good' },
      setup: { text: 'Build Step', score: 'neutral' },
      agentic: { text: 'None', score: 'bad' },
      offline: { text: '100% Offline', score: 'good' },
      privacy: { text: 'Zero Telemetry', score: 'good' }
    },
    {
      name: 'Stork',
      isPinned: false,
      latency: { text: '120ms (WASM)', score: 'neutral' },
      cost: { text: '$0.00 / Mo', score: 'good' },
      setup: { text: 'Cargo Build Step', score: 'neutral' },
      agentic: { text: 'None', score: 'bad' },
      offline: { text: '100% Offline', score: 'good' },
      privacy: { text: 'Zero Telemetry', score: 'good' }
    },
    {
      name: 'Algolia',
      isPinned: false,
      latency: { text: '140ms (Server API)', score: 'neutral' },
      cost: { text: 'Usage Tier Pricing', score: 'bad' },
      setup: { text: 'API Key Setup', score: 'neutral' },
      agentic: { text: 'None', score: 'bad' },
      offline: { text: 'No Offline', score: 'bad' },
      privacy: { text: 'Server Tracked', score: 'bad' }
    },
    {
      name: 'Meilisearch',
      isPinned: false,
      latency: { text: '95ms (Server API)', score: 'neutral' },
      cost: { text: 'Self-Hosted Server', score: 'bad' },
      setup: { text: 'Docker Container', score: 'bad' },
      agentic: { text: 'API Only', score: 'neutral' },
      offline: { text: 'No Offline', score: 'bad' },
      privacy: { text: 'Self Telemetry', score: 'neutral' }
    }
  ];

  const FAQ_ITEMS = [
    {
      id: '1',
      category: 'Architecture',
      question: 'How does Reef achieve fast search without a backend server?',
      answer: 'Reef crawls your sitemap.xml on page load, parses each page with DOMParser (no scripts executed), and builds a multi-field BM25F inverted index in browser memory. Searches run entirely in the client JS thread with no network round-trip. Subsequent visits restore the index from IndexedDB cache, skipping the crawl entirely.'
    },
    {
      id: '2',
      category: 'Architecture',
      question: 'What record types does Reef index beyond page sections?',
      answer: 'Reef supports six record types: section (heading-based page content), action (buttons and clickable controls), field (form inputs, textareas, selects), file (PDF, docx, zip, etc. download links), media (images, audio, video with captions), and structured (JSON-LD and FAQ schema data). Action and field indexing are controlled by data-index-actions and data-index-fields script attributes.'
    },
    {
      id: '3',
      category: 'Architecture',
      question: 'How does the IndexedDB cache work and when does it rebuild?',
      answer: 'On first load, Reef crawls your site and serializes the index into IndexedDB. On subsequent loads it reads the cached index unless: (1) the sitemap lastmod hash has changed, (2) a page ETag or content-hash differs, or (3) the TTL has expired (data-ttl, default 7 days). Call window.Reef.rebuildIndex() to force an immediate rebuild. If the index exceeds the storage threshold it stays in-memory only for the session.'
    },
    {
      id: '4',
      category: 'Architecture',
      question: 'What does Worker-based indexing do?',
      answer: 'When data-use-worker-indexing="true" is set, Reef offloads the crawl and index-build work to a Web Worker via worker.ts. This keeps the main thread free during the initial indexing phase. On browsers that do not support workers, it falls back to main-thread processing with identical behavior.'
    },
    {
      id: '5',
      category: 'Automation',
      question: 'What is data-actions-mode and what values does it accept?',
      answer: 'data-actions-mode controls whether Reef will execute indexed actions on the page. The two valid values are "execute" (default) — allows act(), fillField(), and agent() to dispatch DOM events — and "navigate-only" — falls back to page navigation for all actionable results. Destructive actions (buttons with destructive labels) are always blocked in navigate-only mode and require actionsMode: "execute" to run.'
    },
    {
      id: '6',
      category: 'Automation',
      question: 'How does the agent() chain work and what methods does it expose?',
      answer: 'window.Reef.agent() returns an Agent instance with a fully async chainable API: .click(selector) dispatches a MouseEvent, .type(selector, value) sets the value via native property setters and fires input+change events (React and Vue compatible), .submit(selector?) submits a form or clicks a submit button, .navigate(url) changes location, .back() / .forward() call history, .wait(ms) pauses execution, .extract(selector) returns text or input value, .findActionable(text) fuzzy-matches against the index, and .getSession() returns a snapshot with URL, timestamp, cookies, and localStorage.'
    },
    {
      id: '7',
      category: 'Automation',
      question: 'How does executeWorkflow() differ from the agent() chain?',
      answer: 'executeWorkflow() accepts a declarative JSON or YAML array of WorkflowStep objects (action, selector, value, url, timeout, recordId) instead of imperative method chains. It adds retry logic via maxRetries and retryDelay options, a stopOnError flag, and lifecycle callbacks onStepStart, onStepComplete, and onStepError. It is designed for LLM-generated or user-defined automation scripts.'
    },
    {
      id: '8',
      category: 'Privacy',
      question: 'Is any search query or analytics data transmitted to external servers?',
      answer: 'None whatsoever. Reef operates with zero telemetry. All index scoring, tokenization, caching, and queries occur entirely in local browser memory and IndexedDB. The only external network requests are fetches to the same-origin pages listed in your sitemap — no query data, index data, or behavioral analytics ever leave the browser.'
    },
    {
      id: '9',
      category: 'Performance',
      question: 'What is the memory and script size footprint?',
      answer: 'The gzipped script delivery size is approximately 28 KB. For a site with ~100 pages the in-memory inverted index occupies approximately 140–160 KB depending on content density. For very large sites you can set data-max-pages to cap the crawl or provide a pre-built index via data-prebuilt-index-url to skip client-side crawling entirely.'
    },
    {
      id: '10',
      category: 'Performance',
      question: 'How does BM25F differ from standard BM25, and what is MMR?',
      answer: 'Standard BM25 scores a single text field. BM25F (BM25 with field weighting) scores multiple fields independently — headingText, bodyText, label, breadcrumb — and combines them with configurable per-field weights. This means a query match in the heading ranks higher than the same match buried in body text. MMR (Maximal Marginal Relevance) re-ranks the result list to balance relevance and diversity: the mmrLambda parameter (0–1, default 0.5) controls how strongly diversity is penalized.'
    },
    {
      id: '11',
      category: 'Performance',
      question: 'Does Reef support fuzzy search and spelling corrections?',
      answer: 'Yes. Reef uses Levenshtein edit distance for typo tolerance. When no results are found for an exact term, findClosestWord() scans the vocabulary and suggests the nearest match (displayed as "Did you mean …?" in the modal). The suggest() method uses a prefix trie for fast autocomplete suggestions as the user types.'
    }
  ];

  const SEARCH_INDEX_ITEMS = [
    { id: '1', title: 'BM25F Search Engine', type: 'CORE', section: 'Architecture', description: 'Multi-field BM25F scoring with MMR diversity re-ranking and query popularity boosting.', tab: 'architecture', codeSnippet: 'window.Reef.search("query")' },
    { id: '2', title: 'Agentic Browser Automation API', type: 'API', section: 'Agentic API', description: 'act(), fillField(), agent() chain, executeWorkflow() — full DOM automation primitives.', tab: 'api', codeSnippet: 'Reef.agent().click("#btn").type("#input", "val")' },
    { id: '3', title: 'Script Embed Configurator', type: 'INSTALL', section: 'Install', description: 'Generate script tags with data-actions-mode (execute/navigate-only) and data-hotkey bindings.', tab: 'install', codeSnippet: '<script data-actions-mode="execute" data-hotkey="cmdk">' },
    { id: '4', title: 'Engine Comparison Matrix', type: 'BENCHMARK', section: 'Benchmarks', description: 'Compare Reef against Pagefind, Stork, Algolia, and Meilisearch.', tab: 'benchmarks', codeSnippet: 'Latency: 38ms | Cost: $0.00 | IndexedDB Cache' },
    { id: '5', title: 'Security & Privacy Specifications', type: 'FAQ', section: 'FAQ', description: 'Zero-telemetry policy, actionsMode (execute/navigate-only), IndexedDB cache, BM25F scoring.', tab: 'faq', codeSnippet: '100% Private — Zero Telemetry' }
  ];

  // DOM Elements
  const navTabsContainer = document.getElementById('navTabsContainer');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const openSearchBtn = document.getElementById('openSearchBtn');
  const closeSearchBtn = document.getElementById('closeSearchBtn');
  const searchModal = document.getElementById('searchModal');
  const footerCommandBtn = document.getElementById('footerCommandBtn');
  const brandLogoBtn = document.getElementById('brandLogoBtn');

  // Overview Elements
  const exploreApiBtn = document.getElementById('exploreApiBtn');
  const copySnippetBtn = document.getElementById('copySnippetBtn');
  const copySnippetText = document.getElementById('copySnippetText');

  // Architecture Elements
  const archPhasesGrid = document.getElementById('archPhasesGrid');
  const archDetailPanel = document.getElementById('archDetailPanel');

  // API Elements
  const apiMethodsTableBody = document.getElementById('apiMethodsTableBody');
  const apiMethodButtons = document.getElementById('apiMethodButtons');
  const apiMethodSearch = document.getElementById('apiMethodSearch');
  const apiMethodCount = document.getElementById('apiMethodCount');
  const apiParamInput = document.getElementById('apiParamInput');
  const executeApiBtn = document.getElementById('executeApiBtn');
  const apiSandboxConsole = document.getElementById('apiSandboxConsole');
  const clearApiLogsBtn = document.getElementById('clearApiLogsBtn');

  // Benchmarks Elements
  const benchmarkFilterChips = document.getElementById('benchmarkFilterChips');
  const benchmarkTableHead = document.getElementById('benchmarkTableHead');
  const benchmarkTableBody = document.getElementById('benchmarkTableBody');

  // Install Elements
  const modeExecuteBtn = document.getElementById('modeExecuteBtn');
  const modeNavigateOnlyBtn = document.getElementById('modeNavigateOnlyBtn');
  const sitemapInput = document.getElementById('sitemapInput');
  const shortcutInput = document.getElementById('shortcutInput');
  const genScriptCodeOutput = document.getElementById('genScriptCodeOutput');
  const copyGenScriptBtn = document.getElementById('copyGenScriptBtn');
  const copyNpmBtn = document.getElementById('copyNpmBtn');

  // FAQ Elements
  const faqSearchInput = document.getElementById('faqSearchInput');
  const faqCategoryChips = document.getElementById('faqCategoryChips');
  const faqAccordionList = document.getElementById('faqAccordionList');

  // Modal Elements
  const modalSearchInput = document.getElementById('modalSearchInput');
  const modalCategoryFilter = document.getElementById('modalCategoryFilter');
  const modalResultsList = document.getElementById('modalResultsList');
  const modalRecordsCount = document.getElementById('modalRecordsCount');

  // --- TAB SWITCHER LOGIC ---
  function switchTab(tabId) {
    state.activeTab = tabId;

    // Update nav tab buttons
    const buttons = navTabsContainer.querySelectorAll('.tab-btn');
    buttons.forEach((btn) => {
      if (btn.getAttribute('data-tab') === tabId) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // Update tab panes
    tabPanes.forEach((pane) => {
      if (pane.id === `tab-${tabId}`) {
        pane.style.display = 'flex';
      } else {
        pane.style.display = 'none';
      }
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  navTabsContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (btn) {
      const tabId = btn.getAttribute('data-tab');
      switchTab(tabId);
    }
  });

  brandLogoBtn.addEventListener('click', () => switchTab('overview'));
  exploreApiBtn.addEventListener('click', () => switchTab('api'));

  // --- OVERVIEW SNIPPET COPY ---
  copySnippetBtn.addEventListener('click', () => {
    const text = document.getElementById('overviewSnippetCode').innerText;
    navigator.clipboard.writeText(text);
    copySnippetText.innerText = 'Copied!';
    setTimeout(() => {
      copySnippetText.innerText = 'Copy Tag';
    }, 2000);
  });

  // --- ARCHITECTURE TAB RENDER ---
  function renderArchitectureTab() {
    // Phases Grid
    archPhasesGrid.innerHTML = ARCHITECTURE_PHASES.map((p, idx) => {
      const isActive = state.selectedArchPhase === idx;
      return `
        <button class="card-panel arch-phase-btn" data-idx="${idx}" style="padding: 1rem; text-align: left; cursor: pointer; transition: all 0.15s ease; border-color: ${isActive ? '#FFFFFF' : 'var(--border-color)'}; background-color: ${isActive ? 'rgba(255,255,255,0.08)' : 'var(--bg-card)'};">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
            <span style="font-family: var(--font-mono); font-weight: 800; font-size: 0.875rem; color: #FFFFFF;">${p.step}</span>
            <span style="font-family: var(--font-mono); font-size: 0.625rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-dim);">${p.tag}</span>
          </div>
          <div style="font-size: 0.8125rem; font-weight: 700; color: #FFFFFF; line-height: 1.3;">${p.title}</div>
        </button>
      `;
    }).join('');

    // Detail Panel
    const phase = ARCHITECTURE_PHASES[state.selectedArchPhase];
    archDetailPanel.innerHTML = `
      <div>
        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
          <span class="card-title-badge">PHASE ${phase.step} // ${phase.tag}</span>
        </div>
        <h3 style="font-size: 1.25rem; font-weight: 700; color: #FFFFFF;">${phase.title}</h3>
        <p style="font-size: 0.875rem; color: var(--text-muted); margin-top: 0.5rem; line-height: 1.6;">${phase.description}</p>
      </div>

      <div>
        <div style="font-size: 0.75rem; font-family: var(--font-mono); font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-dim); margin-bottom: 0.5rem;">
          Execution Specifications:
        </div>
        <ul style="display: flex; flex-direction: column; gap: 0.375rem; font-size: 0.8125rem; color: rgba(255,255,255,0.8); padding-left: 1rem;">
          ${phase.points.map((pt) => `<li>${pt}</li>`).join('')}
        </ul>
      </div>

      <div>
        <div style="font-size: 0.75rem; font-family: var(--font-mono); font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--text-dim); margin-bottom: 0.5rem;">
          Core Implementation Fragment:
        </div>
        <div class="code-block">${phase.code}</div>
      </div>
    `;

  }

  // Single delegated listener — survives innerHTML replacement on every render
  archPhasesGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('.arch-phase-btn');
    if (!btn) return;
    const idx = parseInt(btn.getAttribute('data-idx'), 10);
    if (!isNaN(idx) && idx !== state.selectedArchPhase) {
      state.selectedArchPhase = idx;
      renderArchitectureTab();
    }
  });

  // --- AGENTIC API TAB RENDER ---
  function renderApiTab() {
    const query = state.apiMethodQuery.trim().toLowerCase();
    const visibleMethods = API_METHODS.filter((m) => {
      if (!query) return true;
      return [m.name, m.signature, m.description, m.safety]
        .some((value) => value.toLowerCase().includes(query));
    });

    apiMethodCount.textContent = `${visibleMethods.length} of ${API_METHODS.length} method calls shown`;

    // Table Body
    apiMethodsTableBody.innerHTML = visibleMethods.length ? visibleMethods.map((m) => `
      <tr>
        <td><code style="font-weight: 700; color: #FFFFFF;">${m.name}</code></td>
        <td><code>${m.signature}</code></td>
        <td style="font-family: var(--font-sans); font-size: 0.75rem;">${m.description}</td>
        <td><code style="font-size: 0.6875rem; color: var(--accent-white);">${getMethodExample(m.name)}</code></td>
        <td>
          <span style="display: inline-flex; align-items: center; padding: 0.125rem 0.375rem; font-size: 0.625rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; border: 1px solid var(--border-color); background-color: rgba(255,255,255,0.05); color: #FFFFFF;">
            ${m.safety}
          </span>
        </td>
      </tr>
    `).join('') : `<tr><td colspan="5" style="padding: 2rem; text-align: center; color: var(--text-dim);">No method calls match “${escapeHtml(state.apiMethodQuery)}”. Try “search”, “field”, “workflow”, or “session”.</td></tr>`;

    // Method Buttons
    apiMethodButtons.innerHTML = visibleMethods.map((m) => {
      const isSel = state.selectedApiMethod === m.name;
      return `
        <button class="btn-secondary api-select-btn" data-method="${m.name}" style="padding: 0.5rem; justify-content: flex-start; font-size: 0.75rem; border-color: ${isSel ? '#FFFFFF' : 'var(--border-color)'}; background-color: ${isSel ? '#FFFFFF' : 'var(--bg-input)'}; color: ${isSel ? '#000000' : '#FFFFFF'}; font-weight: 700;">
          ${m.name}
        </button>
      `;
    }).join('');

    // Console Logs
    if (state.apiLogs.length === 0) {
      apiSandboxConsole.innerHTML = `// Console ready. Select method and click Execute above.`;
    } else {
      apiSandboxConsole.innerHTML = state.apiLogs.map((log) => `
        <div style="border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 0.375rem; margin-bottom: 0.375rem;">${escapeHtml(log)}</div>
      `).join('');
    }
    apiSandboxConsole.scrollTop = apiSandboxConsole.scrollHeight;

    // Listeners for method select
    const btns = apiMethodButtons.querySelectorAll('.api-select-btn');
    btns.forEach((b) => {
      b.addEventListener('click', () => {
        state.selectedApiMethod = b.getAttribute('data-method');
        renderApiTab();
      });
    });
  }

  function getMethodExample(name) {
    const examples = {
      'open()': 'window.Reef.open()',
      'close()': 'window.Reef.close()',
      'search()': 'window.Reef.search("pricing", 8)',
      'searchSections()': 'window.Reef.searchSections("pricing", { includeMatches: true })',
      'suggest()': 'window.Reef.suggest("instal")',
      'facets()': 'window.Reef.facets()',
      'trackQuery()': 'window.Reef.trackQuery("pricing")',
      'getPopularQueries()': 'window.Reef.getPopularQueries(5)',
      'act()': 'await window.Reef.act("action_123")',
      'fillField()': 'await window.Reef.fillField("field_123", "Ada")',
      'agent()': 'await window.Reef.agent().click("#save")',
      'executeWorkflow()': 'await window.Reef.executeWorkflow({ steps })',
      'getAgentTools()': 'window.Reef.getAgentTools()',
      'getInteractiveRecords()': 'window.Reef.getInteractiveRecords()',
      'addCustomRecords()': 'window.Reef.addCustomRecords(records)',
      'openWithQuery()': 'window.Reef.openWithQuery("pricing")',
      'reindex()': 'window.Reef.reindex()',
      'rebuildIndex()': 'await window.Reef.rebuildIndex()',
      'getIndex()': 'window.Reef.getIndex()',
      'getSitemapUrls()': 'await window.Reef.getSitemapUrls()',
      'onselect()': 'window.Reef.onselect(record => {})',
      'toggleInspector()': 'window.Reef.toggleInspector(true)',
      'setTheme()': 'window.Reef.setTheme("dark")',
      'setMode()': 'window.Reef.setMode("opaque")',
      'setHotkey()': 'window.Reef.setHotkey("ctrlk,cmdk")',
      'getConfig()': 'window.Reef.getConfig()'
    };
    return examples[name] || `window.Reef.${name}`;
  }

  apiMethodSearch.addEventListener('input', (e) => {
    state.apiMethodQuery = e.target.value;
    renderApiTab();
  });

  executeApiBtn.addEventListener('click', () => {
    const timestamp = new Date().toISOString().substring(11, 19);
    const param = apiParamInput.value || 'test_query';
    let output = '';

    switch (state.selectedApiMethod) {
      case 'open()':
        output = `[${timestamp}] window.Reef.open()\n  → Modal overlay mounted in Shadow DOM\n  → Hotkey handler: cmdk / ctrlk registered\n  → Focus trapped within .panel`;
        break;
      case 'close()':
        output = `[${timestamp}] window.Reef.close()\n  → Modal dismissed, aria-hidden restored\n  → Host element: is-hidden class applied`;
        break;
      case 'search()':
        output = `[${timestamp}] window.Reef.search("${param}")\n  → BM25F multi-field query in 1.9ms\n  → RESULTS: [\n    { id: "sec_1", type: "section", headingText: "Getting Started", score: 0.94 },\n    { id: "sec_2", type: "section", headingText: "BM25F Scoring", score: 0.87 }\n  ]`;
        break;
      case 'searchSections()':
        output = `[${timestamp}] window.Reef.searchSections("${param}", { scoringAlgorithm: 'bm25f', diversify: true })\n  → Returned ScoredRecord[] with score + MatchSpan[]\n  → MMR re-ranking applied (mmrLambda: 0.5)\n  → 2 results returned`;
        break;
      case 'suggest()':
        output = `[${timestamp}] window.Reef.suggest("${param.substring(0,4)}")\n  → Trie prefix lookup: 0.3ms\n  → SUGGESTIONS: ["${param}", "${param} scoring", "${param} index"]`;
        break;
      case 'facets()':
        output = `[${timestamp}] window.Reef.facets()\n  → { section: 42, action: 8, field: 5, file: 3, media: 2, structured: 1 }`;
        break;
      case 'trackQuery()':
        output = `[${timestamp}] window.Reef.trackQuery("${param}")\n  → Query logged to popularQueries map\n  → Current count for "${param}": 3\n  → Popularity boost active on next search`;
        break;
      case 'getPopularQueries()':
        output = `[${timestamp}] window.Reef.getPopularQueries(5)\n  → ["BM25", "agent", "install", "${param}", "workflow"]`;
        break;
      case 'act()':
        output = `[${timestamp}] window.Reef.act("action_rec_1")\n  → Found IndexRecord { id: "action_rec_1", type: "action", selector: "#submit-btn" }\n  → actionsMode: execute — proceeding\n  → Dispatched MouseEvent('click') on #submit-btn\n  → { success: true }`;
        break;
      case 'fillField()':
        output = `[${timestamp}] window.Reef.fillField("field_rec_1", "${param}")\n  → Found field record { selector: "#email-input" }\n  → Set value via native property descriptor setter\n  → Dispatched: input + change events (React/Vue safe)\n  → { success: true }`;
        break;
      case 'agent()':
        output = `[${timestamp}] window.Reef.agent().type("#search-input", "${param}").submit()\n  → Agent chain initialized\n  → Step 1: .type() — dispatched input+change on #search-input\n  → Step 2: .submit() — dispatched submit on closest form\n  → Chain completed in 3.8ms`;
        break;
      case 'executeWorkflow()':
        output = `[${timestamp}] window.Reef.executeWorkflow([{ action: "type", selector: "#q", value: "${param}" }, { action: "submit" }], { maxRetries: 2 })\n  → Step 1 (type): complete\n  → Step 2 (submit): complete\n  → Workflow finished in 5.2ms`;
        break;
      case 'getAgentTools()':
        output = `[${timestamp}] window.Reef.getAgentTools()\n  → [\n    { name: "Submit Form", type: "action", id: "action_rec_1", selector: "#submit-btn" },\n    { name: "Email Field", type: "field", id: "field_rec_1", selector: "#email-input" }\n  ]\n  → 2 tool descriptors returned`;
        break;
      case 'getInteractiveRecords()':
        output = `[${timestamp}] window.Reef.getInteractiveRecords()\n  → Filtered allSections to type action|field\n  → 13 interactive records in current index`;
        break;
      case 'addCustomRecords()':
        output = `[${timestamp}] window.Reef.addCustomRecords([{ id: "custom_1", type: "section", headingText: "${param}", url: "/custom", bodyText: "..." }])\n  → addToIndex() called — 1 record merged into live index\n  → No rebuild triggered`;
        break;
      case 'openWithQuery()':
        output = `[${timestamp}] window.Reef.openWithQuery("${param}")\n  → Modal opened with pre-populated query\n  → BM25F search triggered immediately`;
        break;
      case 'reindex()':
        output = `[${timestamp}] window.Reef.reindex()\n  → In-memory index cleared\n  → Crawl restarted from sitemap.xml\n  → IndexedDB cache will be updated on completion`;
        break;
      case 'rebuildIndex()':
        output = `[${timestamp}] await window.Reef.rebuildIndex()\n  → Index cleared, full crawl started\n  → Promise resolves when onReady fires\n  → Rebuilt in ~420ms (18 pages)`;
        break;
      case 'getIndex()':
        output = `[${timestamp}] window.Reef.getIndex()\n  → getAllSections() from SearchIndex\n  → Returned 58 IndexRecord objects`;
        break;
      case 'getSitemapUrls()':
        output = `[${timestamp}] await window.Reef.getSitemapUrls()\n  → Fetching /sitemap.xml...\n  → Parsed 18 <loc> entries\n  → ["/", "/docs/architecture", "/api/reference", ...]`;
        break;
      case 'onselect()':
        output = `[${timestamp}] window.Reef.onselect(fn)\n  → Callback registered\n  → Will fire on result selection: fn(IndexRecord)\n  → Use offselect() to deregister`;
        break;
      case 'toggleInspector()':
        output = `[${timestamp}] window.Reef.toggleInspector()\n  → Visual Inspector overlay activated\n  → Highlighting 13 indexed interactive elements on page\n  → Call toggleInspector(false) to deactivate`;
        break;
      case 'setTheme()':
        output = `[${timestamp}] window.Reef.setTheme("dark")\n  → config.theme = "dark"\n  → CSS variables updated on host element`;
        break;
      case 'setMode()':
        output = `[${timestamp}] window.Reef.setMode("opaque")\n  → config.mode = "opaque"\n  → host.classList → mode-opaque applied`;
        break;
      case 'setHotkey()':
        output = `[${timestamp}] window.Reef.setHotkey("ctrlk,cmdk")\n  → Previous keydown listener removed\n  → New hotkey handler registered for: ctrlk, cmdk`;
        break;
      case 'getConfig()':
        output = `[${timestamp}] window.Reef.getConfig()\n  → { sitemap: "/sitemap.xml", actionsMode: "execute", maxPages: 500,\n       hotkey: "ctrlk,cmdk", theme: "auto", mode: "opaque",\n       indexActions: true, indexMedia: true, indexStructuredData: true }`;
        break;
      default:
        output = `[${timestamp}] ${state.selectedApiMethod}\n  → Select a method from the list and click Execute`;
    }

    state.apiLogs.push(output);
    renderApiTab();
  });

  clearApiLogsBtn.addEventListener('click', () => {
    state.apiLogs = [];
    renderApiTab();
  });

  // --- BENCHMARKS TAB RENDER ---
  function renderBenchmarksTab() {
    // Filter Chips
    benchmarkFilterChips.innerHTML = BENCHMARK_TOOLS.map((t) => {
      const isVisible = state.benchmarkVisibleTools.includes(t.name);
      return `
        <button class="btn-secondary bench-toggle-chip" data-name="${t.name}" ${t.isPinned ? 'disabled' : ''} style="padding: 0.25rem 0.625rem; font-size: 0.6875rem; border-color: ${t.isPinned ? '#FFFFFF' : isVisible ? '#FFFFFF' : 'var(--border-color)'}; background-color: ${t.isPinned ? '#FFFFFF' : isVisible ? 'rgba(255,255,255,0.1)' : 'var(--bg-input)'}; color: ${t.isPinned ? '#000000' : isVisible ? '#FFFFFF' : 'var(--text-dim)'}; font-weight: 700;">
          ${t.name} ${t.isPinned ? '(Pinned)' : ''}
        </button>
      `;
    }).join('');

    // Table Head
    benchmarkTableHead.innerHTML = `
      <th>FEATURE / CAPABILITY</th>
      ${state.benchmarkVisibleTools.map((t) => `
        <th style="${t === 'Reef' ? 'background-color: #FFFFFF; color: #000000;' : ''}">${t}</th>
      `).join('')}
    `;

    // Dimensions
    const dimensions = [
      { key: 'latency', label: 'Query Latency' },
      { key: 'cost', label: 'Server Cost' },
      { key: 'setup', label: 'Setup Complexity' },
      { key: 'agentic', label: 'Agent DOM Primitives' },
      { key: 'offline', label: 'Offline Execution' },
      { key: 'privacy', label: 'Privacy & Telemetry' }
    ];

    // Table Body
    benchmarkTableBody.innerHTML = dimensions.map((dim) => `
      <tr>
        <td style="font-weight: 700; color: #FFFFFF;">${dim.label}</td>
        ${state.benchmarkVisibleTools.map((tName) => {
          const tool = BENCHMARK_TOOLS.find((item) => item.name === tName);
          const val = tool ? tool[dim.key] : null;
          const isReef = tName === 'Reef';

          let style = 'background-color: var(--bg-input); color: var(--text-dim); border: 1px solid var(--border-color);';
          if (val?.score === 'good') {
            style = isReef ? 'background-color: #FFFFFF; color: #000000; border: 1px solid #FFFFFF; font-weight: 700;' : 'background-color: rgba(255,255,255,0.1); color: #FFFFFF; border: 1px solid var(--border-color);';
          } else if (val?.score === 'bad') {
            style = 'background-color: rgba(255,255,255,0.02); color: rgba(255,255,255,0.2); border: 1px solid var(--border-color-subtle);';
          } else if (val?.score === 'neutral') {
            style = 'background-color: rgba(255,255,255,0.05); color: rgba(255,255,255,0.6); border: 1px solid var(--border-color);';
          }

          return `
            <td style="${isReef ? 'background-color: rgba(255,255,255,0.02);' : ''}">
              <span style="display: inline-block; padding: 0.25rem 0.5rem; font-size: 0.6875rem; text-transform: uppercase; letter-spacing: 0.05em; ${style}">
                ${val ? val.text : 'N/A'}
              </span>
            </td>
          `;
        }).join('')}
      </tr>
    `).join('');

    // Toggle chip listener
    const chips = benchmarkFilterChips.querySelectorAll('.bench-toggle-chip');
    chips.forEach((c) => {
      c.addEventListener('click', () => {
        const name = c.getAttribute('data-name');
        if (name === 'Reef') return;
        if (state.benchmarkVisibleTools.includes(name)) {
          state.benchmarkVisibleTools = state.benchmarkVisibleTools.filter((t) => t !== name);
        } else {
          state.benchmarkVisibleTools.push(name);
        }
        renderBenchmarksTab();
      });
    });
  }

  // --- INSTALL TAB LOGIC ---
  function updateInstallScriptTag() {
    const tag = `<script src="https://reef.js.org/dist/reef.min.js" data-actions-mode="${state.installActionsMode}" data-sitemap="${state.installSitemap}" data-hotkey="${state.installShortcut}" async defer></script>`;
    genScriptCodeOutput.innerText = tag;
  }

  modeExecuteBtn.addEventListener('click', () => {
    state.installActionsMode = 'execute';
    modeExecuteBtn.className = 'btn-primary';
    modeNavigateOnlyBtn.className = 'btn-secondary';
    updateInstallScriptTag();
  });

  modeNavigateOnlyBtn.addEventListener('click', () => {
    state.installActionsMode = 'navigate-only';
    modeNavigateOnlyBtn.className = 'btn-primary';
    modeExecuteBtn.className = 'btn-secondary';
    updateInstallScriptTag();
  });

  sitemapInput.addEventListener('input', (e) => {
    state.installSitemap = e.target.value;
    updateInstallScriptTag();
  });

  shortcutInput.addEventListener('input', (e) => {
    state.installShortcut = e.target.value;
    updateInstallScriptTag();
  });

  copyGenScriptBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(genScriptCodeOutput.innerText);
    copyGenScriptBtn.innerText = 'Copied!';
    setTimeout(() => {
      copyGenScriptBtn.innerText = 'Copy Script';
    }, 2000);
  });

  copyNpmBtn.addEventListener('click', () => {
    navigator.clipboard.writeText('npm install reef-search');
    copyNpmBtn.innerText = 'Copied!';
    setTimeout(() => {
      copyNpmBtn.innerText = 'Copy';
    }, 2000);
  });

  // --- FAQ TAB RENDER ---
  function renderFaqTab() {
    const categories = ['All', 'Architecture', 'Automation', 'Privacy', 'Performance'];

    // Category Chips
    faqCategoryChips.innerHTML = categories.map((cat) => {
      const isSel = state.faqSelectedCategory === cat;
      return `
        <button class="btn-secondary faq-cat-btn" data-cat="${cat}" style="padding: 0.25rem 0.625rem; font-size: 0.6875rem; border-color: ${isSel ? '#FFFFFF' : 'var(--border-color)'}; background-color: ${isSel ? '#FFFFFF' : 'var(--bg-input)'}; color: ${isSel ? '#000000' : 'var(--text-dim)'}; font-weight: 700;">
          ${cat}
        </button>
      `;
    }).join('');

    // Filter Items
    const filtered = FAQ_ITEMS.filter((item) => {
      const matchesCat = state.faqSelectedCategory === 'All' || item.category === state.faqSelectedCategory;
      const matchesSearch = state.faqSearchQuery === '' ||
        item.question.toLowerCase().includes(state.faqSearchQuery.toLowerCase()) ||
        item.answer.toLowerCase().includes(state.faqSearchQuery.toLowerCase());
      return matchesCat && matchesSearch;
    });

    if (filtered.length === 0) {
      faqAccordionList.innerHTML = `
        <div class="card-panel" style="text-align: center; color: var(--text-dim); font-family: var(--font-mono); font-size: 0.75rem;">
          No matching FAQ questions found.
        </div>
      `;
    } else {
      faqAccordionList.innerHTML = filtered.map((item) => {
        const isOpen = state.faqOpenIds.has(item.id);
        return `
          <div class="accordion-item" style="border-color: ${isOpen ? '#FFFFFF' : 'var(--border-color)'};">
            <button class="accordion-header faq-toggle-btn" data-id="${item.id}">
              <div style="display: flex; align-items: center; gap: 0.75rem;">
                <span style="padding: 0.125rem 0.375rem; font-size: 0.625rem; font-family: var(--font-mono); font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; background-color: rgba(255,255,255,0.05); color: #FFFFFF; border: 1px solid var(--border-color);">
                  ${item.category}
                </span>
                <span style="font-size: 0.875rem; font-weight: 700; color: #FFFFFF;">
                  ${item.question}
                </span>
              </div>
              <span style="font-family: var(--font-mono); font-size: 0.875rem; color: var(--text-dim);">
                ${isOpen ? '−' : '+'}
              </span>
            </button>
            ${isOpen ? `
              <div class="accordion-body">
                ${item.answer}
              </div>
            ` : ''}
          </div>
        `;
      }).join('');
    }

    // Attach Category click listeners
    const catBtns = faqCategoryChips.querySelectorAll('.faq-cat-btn');
    catBtns.forEach((b) => {
      b.addEventListener('click', () => {
        state.faqSelectedCategory = b.getAttribute('data-cat');
        renderFaqTab();
      });
    });

    // Attach Accordion toggle listeners
    const toggleBtns = faqAccordionList.querySelectorAll('.faq-toggle-btn');
    toggleBtns.forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.getAttribute('data-id');
        if (state.faqOpenIds.has(id)) {
          state.faqOpenIds.delete(id);
        } else {
          state.faqOpenIds.add(id);
        }
        renderFaqTab();
      });
    });
  }

  faqSearchInput.addEventListener('input', (e) => {
    state.faqSearchQuery = e.target.value;
    renderFaqTab();
  });

  // --- COMMAND PALETTE SEARCH MODAL LOGIC ---
  function openSearchModal() {
    state.searchModalOpen = true;
    searchModal.style.display = 'flex';
    modalSearchInput.value = '';
    state.searchQuery = '';
    state.searchCategory = 'All';
    state.searchSelectedIndex = 0;
    modalSearchInput.focus();
    renderSearchModal();
  }

  function closeSearchModal() {
    state.searchModalOpen = false;
    searchModal.style.display = 'none';
  }

  function renderSearchModal() {
    const categories = ['All', 'CORE', 'API', 'INSTALL', 'BENCHMARK', 'FAQ'];

    // Category Chips
    modalCategoryFilter.innerHTML = categories.map((cat) => {
      const isSel = state.searchCategory === cat;
      return `
        <button class="btn-secondary modal-cat-chip" data-cat="${cat}" style="padding: 0.125rem 0.5rem; font-size: 0.625rem; border-color: ${isSel ? '#FFFFFF' : 'var(--border-color)'}; background-color: ${isSel ? '#FFFFFF' : 'var(--bg-card)'}; color: ${isSel ? '#000000' : 'var(--text-dim)'}; font-weight: 700;">
          ${cat}
        </button>
      `;
    }).join('');

    // Filter Items
    const filtered = SEARCH_INDEX_ITEMS.filter((item) => {
      const matchesCat = state.searchCategory === 'All' || item.type === state.searchCategory;
      const q = state.searchQuery.toLowerCase();
      const matchesQuery = state.searchQuery === '' ||
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.section.toLowerCase().includes(q);
      return matchesCat && matchesQuery;
    });

    modalRecordsCount.innerText = `${filtered.length} Records`;

    if (filtered.length === 0) {
      modalResultsList.innerHTML = `
        <div style="padding: 2rem; text-align: center; font-family: var(--font-mono); font-size: 0.75rem; color: var(--text-dim); text-transform: uppercase;">
          No index records matching "${state.searchQuery}".
        </div>
      `;
    } else {
      modalResultsList.innerHTML = filtered.map((item, idx) => {
        const isSelected = idx === state.searchSelectedIndex;
        return `
          <div class="modal-item" data-tab="${item.tab}" data-idx="${idx}" style="padding: 0.75rem; border: 1px solid ${isSelected ? '#FFFFFF' : 'transparent'}; background-color: ${isSelected ? 'rgba(255,255,255,0.08)' : 'var(--bg-card)'}; cursor: pointer; transition: all 0.15s ease;">
            <div style="display: flex; align-items: center; justify-content: space-between; font-family: var(--font-mono); font-size: 0.625rem; margin-bottom: 0.25rem;">
              <span style="padding: 0.125rem 0.375rem; font-weight: 700; background-color: rgba(255,255,255,0.05); color: #FFFFFF; border: 1px solid var(--border-color);">
                ${item.type}
              </span>
              <span style="color: var(--text-dim); uppercase">${item.section}</span>
            </div>

            <div style="font-size: 0.8125rem; font-weight: 700; color: #FFFFFF; display: flex; align-items: center; justify-content: space-between;">
              <span>${item.title}</span>
              <span style="font-family: var(--font-mono); font-size: 0.75rem; color: ${isSelected ? '#FFFFFF' : 'var(--text-dim)'};">→</span>
            </div>

            <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">
              ${item.description}
            </p>

            ${item.codeSnippet ? `
              <div class="code-block" style="margin-top: 0.375rem; padding: 0.375rem 0.5rem; font-size: 0.6875rem;">
                ${escapeHtml(item.codeSnippet)}
              </div>
            ` : ''}
          </div>
        `;
      }).join('');
    }

    // Attach Category click listeners
    const catChips = modalCategoryFilter.querySelectorAll('.modal-cat-chip');
    catChips.forEach((c) => {
      c.addEventListener('click', () => {
        state.searchCategory = c.getAttribute('data-cat');
        state.searchSelectedIndex = 0;
        renderSearchModal();
      });
    });

    // Attach Item click listeners
    const itemEls = modalResultsList.querySelectorAll('.modal-item');
    itemEls.forEach((el) => {
      el.addEventListener('click', () => {
        const tab = el.getAttribute('data-tab');
        if (tab) {
          switchTab(tab);
          closeSearchModal();
        }
      });
      el.addEventListener('mouseenter', () => {
        state.searchSelectedIndex = parseInt(el.getAttribute('data-idx'), 10);
        renderSearchModal();
      });
    });
  }

  modalSearchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    state.searchSelectedIndex = 0;
    renderSearchModal();
  });

  openSearchBtn.addEventListener('click', openSearchModal);
  closeSearchBtn.addEventListener('click', closeSearchModal);
  footerCommandBtn.addEventListener('click', openSearchModal);

  searchModal.addEventListener('click', (e) => {
    if (e.target === searchModal) closeSearchModal();
  });

  // Global Keyboard Shortcuts (Cmd+K / Ctrl+K, Esc, Arrows)
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (state.searchModalOpen) {
        closeSearchModal();
      } else {
        openSearchModal();
      }
    }

    if (e.key === 'Escape' && state.searchModalOpen) {
      closeSearchModal();
    }

    if (state.searchModalOpen) {
      const filtered = SEARCH_INDEX_ITEMS.filter((item) => {
        const matchesCat = state.searchCategory === 'All' || item.type === state.searchCategory;
        const q = state.searchQuery.toLowerCase();
        return matchesCat && (state.searchQuery === '' || item.title.toLowerCase().includes(q) || item.description.toLowerCase().includes(q));
      });

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        state.searchSelectedIndex = (state.searchSelectedIndex + 1) % (filtered.length || 1);
        renderSearchModal();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        state.searchSelectedIndex = (state.searchSelectedIndex - 1 + filtered.length) % (filtered.length || 1);
        renderSearchModal();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[state.searchSelectedIndex]) {
          switchTab(filtered[state.searchSelectedIndex].tab);
          closeSearchModal();
        }
      }
    }
  });

  // Utility
  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Initial Render Calls
  renderArchitectureTab();
  renderApiTab();
  renderBenchmarksTab();
  renderFaqTab();
});
