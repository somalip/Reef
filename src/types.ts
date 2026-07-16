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
  scoringAlgorithm?: 'reef-classic' | 'bm25';
  filter?: (record: IndexRecord) => boolean;
  sortFn?: (a: ScoredRecord, b: ScoredRecord) => number;
  typeWeights?: Partial<Record<IndexRecord['type'], number>>;
}

export interface MatchSpan {
  key: string;
  start: number;
  end: number;
}

export interface CacheMetadata {
  versionHash: string;
  buildTime: number;
  pageMetadata: Record<string, string>;
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
}