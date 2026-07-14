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