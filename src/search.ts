/**
 * @file Public API exports for search module.
 * Re-exports functions from search-index.ts and extraction.ts for external use.
 */

export type { IndexRecord, SectionDocument, SearchOptions, ScoredRecord, MatchSpan } from './types.js';
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
  type QueryNode,
} from './search-index.js';
export {
  stripTags,
  generateSelector,
  extractHeadingId,
  hasExplicitId,
  findParentSectionId,
  extractSections,
  extractActionName,
  isDestructiveAction,
  extractActions,
  extractFields,
  extractLinks,
  extractFiles,
  extractMedia,
  extractStructuredData,
  resolveUrl,
} from './extraction.js';