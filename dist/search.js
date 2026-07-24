/**
 * @file Public API exports for search module.
 * Re-exports functions from search-index.ts and extraction.ts for external use.
 */
export { createSearchIndex, addToIndex, addSectionsToIndex, getAllSections, levenshteinDistance, findClosestWord, searchSections, removeFromIndex, updateRecord, serializeIndex, deserializeIndex, parseExtendedQuery, suggest, facets, trackQuery, getPopularQueries, } from './search-index.js';
export { stripTags, generateSelector, extractHeadingId, hasExplicitId, findParentSectionId, extractSections, extractActionName, isDestructiveAction, extractActions, extractFields, extractLinks, extractFiles, extractMedia, extractStructuredData, extractHiddenContent, resolveUrl, } from './extraction.js';
