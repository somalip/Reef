/**
 * @file Shared type definitions for Reef search library.
 * Contains interfaces for section documents, index records, and configuration options.
 */

export interface SectionDocument {
  id: string;
  url: string;
  headingText: string;
  headingId: string;
  breadcrumb: string;
  bodyText: string;
}

export interface IndexRecord extends SectionDocument {
  type: 'section' | 'action' | 'field' | 'link' | 'file' | 'media' | 'structured';
  selector?: string;
  selectors?: string[];
  iframePath?: number[];
  destructive?: boolean;
  label?: string;
  value?: string;
  transcript?: string;
  structuredData?: any;
}

export interface SearchOptions {
  limit?: number;
  fuzzy?: boolean;
  fuzzyThreshold?: number;
  fuzzyDistance?: number;
  includeScore?: boolean;
  includeMatches?: boolean;
  weights?: Partial<Record<'headingText' | 'bodyText' | 'label' | 'breadcrumb', number>>;
  extended?: boolean;
  scoringAlgorithm?: 'reef-classic' | 'bm25' | 'bm25f';
  bm25fOptions?: { k1?: number; b?: number };
  filter?: (record: IndexRecord) => boolean;
  sortFn?: (a: ScoredRecord, b: ScoredRecord) => number;
  typeWeights?: Partial<Record<IndexRecord['type'], number>>;
  diversify?: boolean;
  mmrLambda?: number; // MMR diversity parameter (0-1), default 0.5
  trackPopularity?: boolean;
  popularQueryBoost?: number;
  popularityBoost?: number; // Multiplicative boost factor for popularity ranking
  fields?: Record<string, string>;
}

export interface SearchPage<T = ScoredRecord> {
  results: T[];
  total: number;
  nextCursor?: string;
  hasMore: boolean;
}

export interface MatchSpan {
  key: string;
  start: number;
  end: number;
}

export interface CacheMetadata {
  versionHash: string;
  buildTime: number;
  pageMetadata: Record<string, {
    etag?: string;
    lastModified?: string;
    contentHash?: string;
    timestamp: number;
  }>;
}

// Per-page hash information for incremental crawling
export interface PageHashInfo {
  etag?: string;
  lastModified?: string;
  contentHash?: string;
  timestamp: number;
}

export type TokenFilter = (token: string) => string | null;

/** Agentic workflow types */
export interface WorkflowStep {
  action: 'click' | 'type' | 'navigate' | 'extract' | 'submit' | 'back' | 'forward' | 'wait';
  selector?: string;
  value?: string;
  url?: string;
  recordId?: string;
  timeout?: number;
}

export interface WorkflowOptions {
  maxRetries?: number;
  retryDelay?: number;
  stopOnError?: boolean;
  onStepStart?: (step: WorkflowStep, index: number) => void;
  onStepComplete?: (step: WorkflowStep, index: number, result: any) => void;
  onStepError?: (step: WorkflowStep, index: number, error: Error) => void;
}

export interface AgentSession {
  id: string;
  url: string;
  timestamp: number;
  cookies?: Record<string, string>;
  localStorage?: Record<string, string>;
}

export interface ActionResult {
  success: boolean;
  reason?: string;
  element?: Element;
  changed?: boolean;
  url?: string;
}

export interface ObservationOptions {
  root?: Document | Element | ShadowRoot;
  includeHidden?: boolean;
  inViewport?: boolean;
}

export interface StableWaitOptions {
  quietMs?: number;
  timeout?: number;
  observeNetwork?: boolean;
}

export interface PaginationOptions {
  maxPages?: number;
  maxActionsPerRun?: number;
  nextText?: string[];
  scroll?: boolean;
}

export interface AgentOptions {
  actionsMode?: 'execute' | 'navigate-only';
  maxActionsPerRun?: number;
  rateLimitMs?: number;
  destructive?: boolean;
}

export interface GraphEdge {
  fromUrl: string;
  action: string;
  toUrl?: string;
  effect?: string;
  destructive?: boolean;
}

export interface SiteGraphNode {
  url: string;
  records: IndexRecord[];
}

export interface SiteGraph {
  startUrl: string;
  nodes: SiteGraphNode[];
  edges: GraphEdge[];
  createdAt: number;
}

export interface GraphCrawlerOptions {
  maxPages?: number;
  maxActionsPerRun?: number;
  crawlDelay?: number;
  actionsMode?: 'execute' | 'navigate-only';
  persist?: boolean;
  fetch?: typeof globalThis.fetch;
}

export interface AgentToolDefinition {
  name: string;
  description: string;
  inputSchema: { type: 'object'; properties: Record<string, any>; required?: string[] };
}

export interface ScoredRecord {
  record: IndexRecord;
  score: number;
  matches?: MatchSpan[];
}

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
  primaryColor?: string;
  secondaryColor?: string;
  backgroundColor?: string;
  textColor?: string;
  borderColor?: string;
  radius?: number;
  theme?: 'light' | 'dark' | 'auto';
  fontFamily?: string;
  mode?: 'regular' | 'opaque' | 'high-contrast';
  hotkey?: string;
  placeholder?: string;
  headless?: boolean;
  onReady?: (data: { index: IndexRecord[] }) => void;
  tokenizePipeline?: TokenFilter[];
  synonyms?: Record<string, string[]>;
  prebuiltIndexUrl?: string;
  useWorkerIndexing?: boolean;
  ttl?: number;
  chunkSize?: number;
  crawlDelay?: number;
  bm25fOptions?: { k1?: number; b?: number };
  popularityTracking?: boolean;
  popularityBoost?: number; // Multiplicative boost factor for popularity ranking
  mmrLambda?: number; // MMR diversity parameter (0-1), default 0.5
}
