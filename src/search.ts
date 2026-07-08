/**
 * @file Public API exports for search module.
 * Re-exports functions from search-index.ts and extraction.ts for external use.
 */

export type { IndexRecord, SectionDocument } from './types.js';
export { resolveUrl } from './extraction.js';
export {
  createSearchIndex,
  addToIndex,
  addSectionsToIndex,
  getAllSections,
  levenshteinDistance,
  findClosestWord,
  searchSections,
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
} from './extraction.js';