export type { ReefConfig, IndexRecord, SectionDocument } from './src/types.js';

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
} from './src/search.js';

export { ReefSearch } from './src/reef.js';