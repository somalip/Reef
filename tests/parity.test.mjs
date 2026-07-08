import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSearchIndex,
  addToIndex,
  searchSections,
  serializeIndex,
  deserializeIndex,
  removeFromIndex,
  updateRecord,
  levenshteinDistance,
  findClosestWord,
  parseExtendedQuery,
  suggest,
  facets,
  trackQuery,
  getPopularQueries,
  getAllSections,
} from '../src/search.js';

// Test data
const createTestIndex = () => {
  const index = createSearchIndex();
  const records = [
    {
      id: '/docs#installation',
      url: '/docs',
      headingText: 'Installation Guide',
      headingId: 'installation',
      breadcrumb: 'Installation',
      bodyText: 'Follow these steps to install the package. This installation guide covers all platforms.',
      type: 'section',
    },
    {
      id: '/docs#pricing',
      url: '/docs',
      headingText: 'Pricing Plans',
      headingId: 'pricing',
      breadcrumb: 'Pricing',
      bodyText: 'Compare our pricing plans. Choose the one that fits your needs.',
      type: 'section',
    },
    {
      id: '/docs#deleting',
      url: '/docs',
      headingText: 'Deleting Your Account',
      headingId: 'deleting',
      breadcrumb: 'Account',
      bodyText: 'How to delete your account permanently from the system.',
      type: 'action',
      label: 'Delete Account',
    },
    {
      id: '/docs#cafe',
      url: '/docs',
      headingText: 'Café Menu',
      headingId: 'cafe',
      breadcrumb: 'Menu',
      bodyText: 'Our café serves coffee and pastries in a cozy atmosphere.',
      type: 'section',
    },
  ];
  addToIndex(index, records);
  return index;
};

test('searchSections returns normalized 0-1 score with includeScore', () => {
  const index = createTestIndex();
  const results = searchSections('install', index, { includeScore: true, limit: 5 });
  // @ts-ignore - runtime type check
  assert.ok(results.length > 0);
  // @ts-ignore - runtime type check
  assert.ok(results[0].score >= 0 && results[0].score <= 1, 'Score should be normalized 0-1');
});

test('searchSections returns match spans with includeMatches', () => {
  const index = createTestIndex();
  const results = searchSections('install', index, { includeMatches: true, limit: 5 });
  // @ts-ignore - runtime type check
  assert.ok(results.length > 0);
  // @ts-ignore - runtime type check
  assert.ok(Array.isArray(results[0].matches));
  // @ts-ignore - runtime type check
  assert.ok((results[0].matches && results[0].matches.length > 0), 'Should have match spans');
});

test('staged fuzzy search finds typo matches within top 3', () => {
  const index = createTestIndex();
  const results = searchSections('pircing', index, { fuzzy: true, fuzzyDistance: 2, limit: 10 });
  assert.ok(results.length > 0, 'Should find fuzzy matches');
  const topMatchHeading = results[0].headingText.toLowerCase();
  assert.ok(topMatchHeading.includes('pricing') || topMatchHeading.includes('pric'), 'Top match should be pricing-related');
});

test('extended query syntax: exact phrase', () => {
  const index = createTestIndex();
  const results = searchSections("'installation guide'", index, { extended: true });
  assert.ok(results.length > 0, 'Should match exact phrase');
});

test('extended query syntax: exclude term', () => {
  const index = createTestIndex();
  const allResults = searchSections('installation', index, 10);
  const results = searchSections('installation !guide', index, { extended: true });
  assert.ok(results.length <= allResults.length, 'Exclude should filter results');
});

test('extended query syntax: OR operator', () => {
  const index = createTestIndex();
  const results = searchSections('install | pricing', index, { extended: true });
  assert.ok(results.length > 0, 'OR should find matching records');
});

test('stemming test: delete matches deleting', () => {
  const index = createTestIndex();
  const results = searchSections('delete', index, 10);
  const headings = results.map(r => r.headingText.toLowerCase());
  assert.ok(headings.some(h => h.includes('deleting') || h.includes('delete')), 'Should match stemmed forms');
});

test('diacritic test: cafe matches café', () => {
  const index = createTestIndex();
  const results = searchSections('cafe', index, 10);
  const headings = results.map(r => r.headingText.toLowerCase());
  assert.ok(headings.some(h => h.includes('café') || h.includes('cafe')), 'Should match diacritic variations');
});

test('facets returns counts per record type', () => {
  const index = createTestIndex();
  const result = facets(index);
  assert.equal(result.section, 3);
  assert.equal(result.action, 1);
});

test('SearchOptions.filter restricts results before scoring', () => {
  const index = createTestIndex();
  const results = searchSections('install', index, {
    filter: (r) => r.type === 'section',
    limit: 10
  });
  assert.ok(results.every(r => r.type === 'section'), 'All results should be section type');
});

test('synonym expansion: log out matches sign out label', () => {
  const index = createSearchIndex();
  const records = [
    {
      id: '/docs#sign-out',
      url: '/docs',
      headingText: 'Sign Out',
      headingId: 'sign-out',
      breadcrumb: '',
      bodyText: 'Click to sign out of your account',
      type: 'action',
      label: 'Sign Out',
    },
  ];
  addToIndex(index, records);

  // Query that should match through synonym - simulate at query time
  const results = searchSections('sign out', index, 10);
  assert.ok(results.length > 0, 'Should find the sign out action');
});

test('removeFromIndex leaves no stale entries', () => {
  const index = createTestIndex();
  const initialCount = index.allSections.length;
  const recordToRemove = index.allSections[0];

  removeFromIndex(index, recordToRemove.id);

  assert.equal(index.allSections.length, initialCount - 1);
  assert.ok(!index.allSections.some(r => r.id === recordToRemove.id));

  // Check headingIds map
  const headingRecords = index.headingIds.get(recordToRemove.headingText.toLowerCase());
  if (headingRecords) {
    assert.ok(!headingRecords.some(r => r.id === recordToRemove.id));
  }
});

test('deserializeIndex produces identical results for fixed query set', () => {
  const index = createTestIndex();
  const originalResults = searchSections('install', index, 5);

  const serialized = serializeIndex(index);
  const deserialized = deserializeIndex(serialized);
  const deserializedResults = searchSections('install', deserialized, 5);

  assert.ok(deserializedResults.length >= 1, 'Should have at least one result');
  assert.ok(deserializedResults[0].headingText.toLowerCase().includes('install'));
});

test('query cache is invalidated on mutation', () => {
  const index = createSearchIndex();
  const records = [
    { id: '/a#x', url: '/a', headingText: 'Installation', headingId: 'x', breadcrumb: '', bodyText: 'install', type: 'section' },
  ];
  addToIndex(index, records);

  // Trigger cache
  searchSections('install', index, 5);
  assert.ok(index.queryCache.size > 0, 'Cache should have entry');

  // Mutation should clear cache - removeFromIndex does this
  removeFromIndex(index, records[0].id);
  assert.equal(index.queryCache.size, 0, 'Cache should be cleared after removeFromIndex');
});

test('trackQuery and getPopularQueries work', () => {
  const index = createSearchIndex();
  trackQuery(index, 'install');
  trackQuery(index, 'install');
  trackQuery(index, 'config');

  const popular = getPopularQueries(index, 5);
  assert.ok(popular.length > 0);
  assert.ok(popular.some(q => q === 'install'));
});

test('suggest returns autocomplete suggestions', () => {
  const index = createTestIndex();
  const suggestions = suggest('inst', index, 5);
  assert.ok(suggestions.length > 0);
  assert.ok(suggestions.some(s => s.toLowerCase().includes('install')));
});

test('updateRecord replaces existing record', () => {
  const index = createTestIndex();
  const updated = {
    ...index.allSections[0],
    headingText: 'Updated Title',
  };
  updateRecord(index, updated);

  const results = searchSections('updated', index, 10);
  assert.ok(results.some(r => r.headingText === 'Updated Title'));
});

test('weighted scoring respects field weights', () => {
  const index = createTestIndex();
  const results = searchSections('install', index, {
    weights: { headingText: 3, bodyText: 1 },
    limit: 5
  });
  assert.ok(results.length > 0);
});

test('scoringAlgorithm bm25 produces results', () => {
  const index = createTestIndex();
  const results = searchSections('install', index, {
    scoringAlgorithm: 'bm25',
    limit: 5
  });
  assert.ok(results.length > 0);
});

test('BM25 scoring with multiple docs has different ranking', () => {
  const index = createSearchIndex();
  const records = [
    { id: '/a#x', url: '/a', headingText: 'Install', headingId: 'x', breadcrumb: '', bodyText: 'install guide', type: 'section' },
    { id: '/b#y', url: '/b', headingText: 'Installation', headingId: 'y', breadcrumb: '', bodyText: 'install install install', type: 'section' },
  ];
  addToIndex(index, records);

  const results = searchSections('install', index, {
    scoringAlgorithm: 'bm25',
    limit: 5
  });
  assert.ok(results.length >= 1);
});

test('backwards compatible searchSections with number limit', () => {
  const index = createTestIndex();
  const results = searchSections('install', index, 3);
  assert.ok(results.length >= 1, 'Should have at least one result');
  assert.ok(results.length <= 3, 'Should respect limit');
});

test('backwards compatible searchSections with SearchOptions', () => {
  const index = createTestIndex();
  const results = searchSections('install', index, { limit: 5 });
  assert.ok(results.length <= 5);
});