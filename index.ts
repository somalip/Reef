export type { ReefConfig, IndexRecord, SectionDocument, SearchOptions, ScoredRecord, MatchSpan, TokenFilter } from './src/types.js';

export {
  extractSections,
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
  type QueryNode,
} from './src/search.js';

export { ReefSearch } from './src/reef.js';