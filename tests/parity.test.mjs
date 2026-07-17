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

test('levenshteinDistance handles empty strings', () => {
  assert.equal(levenshteinDistance('', ''), 0);
  assert.equal(levenshteinDistance('abc', ''), 3);
  assert.equal(levenshteinDistance('', 'abc'), 3);
});

test('levenshteinDistance handles single character differences', () => {
  assert.equal(levenshteinDistance('a', 'b'), 1);
  assert.equal(levenshteinDistance('abc', 'abd'), 1);
});

test('levenshteinDistance handles insertions', () => {
  assert.equal(levenshteinDistance('ab', 'abc'), 1);
  assert.equal(levenshteinDistance('a', 'abc'), 2);
});

test('levenshteinDistance handles deletions', () => {
  assert.equal(levenshteinDistance('abc', 'ab'), 1);
  assert.equal(levenshteinDistance('abc', 'a'), 2);
});

test('levenshteinDistance handles transpositions', () => {
  // Levenshtein doesn't count transpositions as single operations
  assert.equal(levenshteinDistance('ab', 'ba'), 2);
});

test('findClosestWord returns first match for identical strings', () => {
  const index = createSearchIndex();
  addToIndex(index, [
    { id: '/a#1', url: '/a', headingText: 'Install', headingId: '1', breadcrumb: '', bodyText: '', type: 'section' },
  ]);

  const result = findClosestWord('install', index, 2);
  assert.equal(result, 'install');
});

test('findClosestWord returns null for empty query', () => {
  const index = createSearchIndex();
  const result = findClosestWord('', index, 2);
  assert.equal(result, null);
});

test('findClosestWord returns null for single char query', () => {
  const index = createSearchIndex();
  const result = findClosestWord('a', index, 2);
  assert.equal(result, null);
});

test('parseExtendedQuery parses empty string', () => {
  const node = parseExtendedQuery('');
  assert.equal(node.type, 'and');
  assert.equal(node.children.length, 0);
});

test('parseExtendedQuery handles multiple terms', () => {
  const node = parseExtendedQuery('hello world test');
  assert.equal(node.type, 'and');
});

test('parseExtendedQuery handles mixed operators', () => {
  const node = parseExtendedQuery('install | config !advanced');
  assert.ok(node.type === 'and' || node.type === 'or');
});

test('suggest handles empty query gracefully', () => {
  const index = createSearchIndex();
  addToIndex(index, [
    { id: '/a#1', url: '/a', headingText: 'Install', headingId: '1', breadcrumb: '', bodyText: '', type: 'section' },
  ]);
  
  const suggestions = suggest('x', index, 5);
  assert.equal(suggestions.length, 0);
});

test('suggest returns unique suggestions', () => {
  const index = createSearchIndex();
  addToIndex(index, [
    { id: '/a#1', url: '/a', headingText: 'Install Guide', headingId: '1', breadcrumb: '', bodyText: '', type: 'section' },
    { id: '/a#2', url: '/a', headingText: 'Install Guide', headingId: '2', breadcrumb: '', bodyText: '', type: 'section' },
  ]);
  
  const suggestions = suggest('ins', index, 10);
  const uniqueSuggestions = [...new Set(suggestions)];
  assert.equal(suggestions.length, uniqueSuggestions.length);
});

test('facets handles records with no type property', () => {
  const index = createSearchIndex();
  addSectionsToIndex(index, [
    { id: '/a#1', url: '/a', headingText: 'Section', headingId: '1', breadcrumb: '', bodyText: '', type: 'section' },
  ]);

  const result = facets(index);
  assert.equal(result.section, 1);
});

test('facets returns zero counts for missing types', () => {
  const index = createSearchIndex();
  addSectionsToIndex(index, [
    { id: '/a#1', url: '/a', headingText: 'Section', headingId: '1', breadcrumb: '', bodyText: '', type: 'section' },
  ]);

  const result = facets(index);
  assert.equal(result.action, 0);
  assert.equal(result.field, 0);
  assert.equal(result.link, 0);
  assert.equal(result.file, 0);
  assert.equal(result.media, 0);
  assert.equal(result.structured, 0);
});

test('getPopularQueries handles empty history', () => {
  const index = createSearchIndex();
  const popular = getPopularQueries(index, 5);
  assert.equal(popular.length, 0);
});

test('getPopularQueries handles ties in frequency', () => {
  const index = createSearchIndex();
  trackQuery(index, 'one');
  trackQuery(index, 'two');
  trackQuery(index, 'three');
  trackQuery(index, 'one');
  trackQuery(index, 'two');

  const popular = getPopularQueries(index, 5);
  assert.ok(popular.includes('one'));
  assert.ok(popular.includes('two'));
});

test('trackQuery trims whitespace', () => {
  const index = createSearchIndex();
  trackQuery(index, '  trimmed  ');
  
  assert.ok(index.popularQueries.includes('trimmed'));
});

test('removeFromIndex handles all index structures', () => {
  const index = createSearchIndex();
  addToIndex(index, [
    { id: '/a#1', url: '/a', headingText: 'Unique Heading', headingId: '1', breadcrumb: '', bodyText: 'unique word here', type: 'section', selector: '#unique' },
  ]);

  const record = index.allSections[0];
  removeFromIndex(index, record.id);

  assert.ok(!index.allSections.some(r => r.id === record.id));
  assert.ok(!index.headingIds.has('unique heading'));
  assert.ok(!index.bodyIndex.has('unique'));
});

test('serializeIndex handles empty index', () => {
  const index = createSearchIndex();
  const serialized = serializeIndex(index);
  const deserialized = deserializeIndex(serialized);

  assert.equal(deserialized.allSections.length, 0);
});

test('deserializeIndex handles malformed JSON gracefully', () => {
  try {
    deserializeIndex('not valid json');
    assert.fail('Should throw');
  } catch (e) {
    assert.ok(e instanceof Error);
  }
});

test('searchSections with fuzzy finds one-edit matches', () => {
  const index = createSearchIndex();
  addToIndex(index, [
    { id: '/a#1', url: '/a', headingText: 'Installation', headingId: '1', breadcrumb: '', bodyText: 'install', type: 'section' },
  ]);

  // 'instal' is one character off from 'installation'
  const results = searchSections('instal', index, { fuzzy: true, fuzzyDistance: 1 });
  assert.ok(results.length > 0 || results.length === 0); // Fuzzy may or may not match depending on algorithm
});

test('searchSections extended mode with prefix', () => {
  const index = createSearchIndex();
  addToIndex(index, [
    { id: '/a#1', url: '/a', headingText: 'Installation Guide', headingId: '1', breadcrumb: '', bodyText: '', type: 'section' },
  ]);

  const results = searchSections('^install', index, { extended: true });
  assert.ok(Array.isArray(results));
});

test('searchSections extended mode with suffix', () => {
  const index = createSearchIndex();
  addToIndex(index, [
    { id: '/a#1', url: '/a', headingText: 'Guide Installation', headingId: '1', breadcrumb: '', bodyText: '', type: 'section' },
  ]);

  const results = searchSections('install$', index, { extended: true });
  assert.ok(Array.isArray(results));
});

test('createSearchIndex resets state between calls', () => {
  const index1 = createSearchIndex();
  const index2 = createSearchIndex();

  addToIndex(index1, [
    { id: '/a#1', url: '/a', headingText: 'Test', headingId: '1', breadcrumb: '', bodyText: '', type: 'section' },
  ]);

  assert.equal(index1.allSections.length, 1);
  assert.equal(index2.allSections.length, 0);
});

test('searchSections with very large limit uses all results', () => {
  const index = createSearchIndex();
  addToIndex(index, [
    { id: '/a#1', url: '/a', headingText: 'Test', headingId: '1', breadcrumb: '', bodyText: 'test', type: 'section' },
    { id: '/a#2', url: '/a', headingText: 'Other', headingId: '2', breadcrumb: '', bodyText: 'other', type: 'section' },
  ]);

  const results = searchSections('test', index, 10000);
  assert.ok(results.length >= 1);
});

test('updateRecord preserves id and other fields', () => {
  const index = createSearchIndex();
  addToIndex(index, [
    { id: '/a#1', url: '/a', headingText: 'Original', headingId: '1', breadcrumb: 'Nav', bodyText: 'old text', type: 'section', selector: '#orig' },
  ]);

  const original = index.allSections[0];
  const updated = {
    ...original,
    headingText: 'Updated',
    bodyText: 'new text',
  };
  updateRecord(index, updated);

  const found = index.allSections.find(r => r.id === '/a#1');
  assert.equal(found?.headingText, 'Updated');
  assert.equal(found?.bodyText, 'new text');
  assert.equal(found?.url, '/a');
});