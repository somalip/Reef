export type { ReefConfig, IndexRecord, SectionDocument, SearchOptions, ScoredRecord, MatchSpan } from './src/types.js';

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
  type QueryNode,
} from './src/search.js';

export { ReefSearch } from './src/reef.js';