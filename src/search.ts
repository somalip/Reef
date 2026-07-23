/**
 * @file Public API exports for search module.
 * Re-exports functions from search-index.ts and extraction.ts for external use.
 */

export type { IndexRecord, SectionDocument, SearchOptions, ScoredRecord, MatchSpan, TokenFilter, ReefConfig } from './types.js';
export {
  createSearchIndex,
  addToIndex,
  addSectionsToIndex,
  getAllSections,
  levenshteinDistance,
  findClosestWord,
  searchSections,
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
  getSnippet,
  type QueryNode,
} from './search-index.js';
export { semanticSearch, cosineSimilarity, quantizeEmbedding } from './search/semantic.js';
export { expandQuery, soundex, phoneticAlternatives } from './search/query-expansion.js';
export { parseFieldQuery, matchesFieldQuery, applyFieldBoosts } from './search/field-syntax.js';
export { CompressedTrie } from './search/compressed-trie.js';
export {
  stripTags,
  generateSelector,
  extractHeadingId,
  hasExplicitId,
  findParentSectionId,
  extractSections,
  generateStableSelector,
  extractAccessibilityTree,
  chunkBodyText,
  extractActionName,
  isDestructiveAction,
  extractActions,
  extractFields,
  extractLinks,
  extractFiles,
  extractMedia,
  extractStructuredData,
  extractHiddenContent,
  normalizeUrl,
  resolveUrl,
} from './extraction.js';
