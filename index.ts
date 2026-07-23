export type { ReefConfig, IndexRecord, SectionDocument, SearchOptions, ScoredRecord, MatchSpan, TokenFilter, WorkflowStep, WorkflowOptions, AgentSession, ActionResult, SearchPage, ObservationOptions, StableWaitOptions, PaginationOptions, AgentOptions, GraphEdge, SiteGraphNode, SiteGraph, GraphCrawlerOptions, AgentToolDefinition } from './src/types.js';

export {
  extractSections,
  generateStableSelector,
  extractAccessibilityTree,
  extractActions,
  extractFields,
  extractLinks,
  extractFiles,
  extractMedia,
  extractStructuredData,
  resolveUrl,
  searchSections,
  addToIndex,
  createSearchIndex,
  findClosestWord,
  getAllSections,
  levenshteinDistance,
  removeFromIndex,
  updateRecord,
  serializeIndex,
  deserializeIndex,
  parseExtendedQuery,
  suggest,
  facets,
  trackQuery,
  getPopularQueries,
  searchWithPagination,
  getTotalResultCount,
  type QueryNode,
} from './src/search.js';

export { Agent } from './src/agent.js';
export { observeDocument, waitForStableDom } from './src/observation.js';
export { crawlAndBuildGraph } from './src/graph-crawler.js';
export { agentTools, createAgentTools } from './src/tools.js';
export { executeWorkflow, parseYAML, validateWorkflow, type WorkflowDefinition } from './src/workflow.js';
export { semanticSearch, cosineSimilarity, quantizeEmbedding, expandQuery, soundex, phoneticAlternatives, parseFieldQuery, matchesFieldQuery, applyFieldBoosts } from './src/search.js';
export { CompressedTrie } from './src/search.js';
export { VirtualList, QueryHistory, KeyboardManager, previewRecord, RelevanceTuner } from './src/ui/index.js';
export { listWorkflowTemplates, getWorkflowTemplate, exportWorkflow, recordWorkflow } from './src/workflow/templates.js';
export { composeActions, conditionalActions, repeatActions } from './src/agent/actions.js';
export { createRemoteAgent } from './src/agent/remote.js';
export { DynamicIndexer } from './src/indexing/dynamic.js';
export { detectLanguage, tokenizeLanguage } from './src/indexing/multilang.js';
export { ContentWatcher } from './src/indexing/watcher.js';
export { mergeIndexes } from './src/indexing/merger.js';
export { createStaticIndex, exportStaticIndex } from './src/indexing/ssr.js';
export { extractDocument, isDocumentUrl } from './src/extraction/document.js';
export { extractImageText, imageAltText } from './src/extraction/ocr.js';
export { AnalyticsTracker } from './src/analytics/tracker.js';
export { createCMSAdapter } from './src/integrations/cms.js';
export { cacheUrls, clearCache, registerServiceWorker } from './src/cache/sw-cache.js';
export { saveSiteGraph, loadSiteGraph } from './src/cache.js';
export { PluginManager } from './src/plugins/manager.js';
export type { ReefPlugin } from './src/plugins/types.js';
export { inspectIndex, profileSearch } from './src/debug/devtools.js';
export { createMockIndex, replay } from './src/testing/harness.js';

import { ReefSearch } from './src/reef.js';
import { ConfigReader } from './src/config/config-reader.js';

declare global {
  interface Window {
    ReefConfig?: Partial<import('./src/types.js').ReefConfig>;
    Reef?: ReefSearch;
  }
}

export { ReefSearch, ConfigReader };

export function createReef(config?: Partial<import('./src/types.js').ReefConfig>): ReefSearch {
  if (typeof window !== 'undefined' && (window as any).ReefConfig) {
    ConfigReader.setConfig((window as any).ReefConfig);
  }
  if (config) {
    ConfigReader.setConfig(config);
  }
  const reef = new ReefSearch();
  if (typeof window !== 'undefined') {
    (window as Window).Reef = reef;
  }
  return reef;
}

export function reef(config?: Partial<import('./src/types.js').ReefConfig>): ReefSearch {
  return createReef(config);
}

export default {
  open: () => {
    if (typeof window !== 'undefined' && (window as any).Reef) {
      (window as any).Reef.open();
    } else {
      const r = createReef();
      r.open();
    }
  },
  close: () => {
    if (typeof window !== 'undefined' && (window as any).Reef) {
      (window as any).Reef.close();
    }
  },
};
