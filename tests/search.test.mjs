import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSections, resolveUrl, createSearchIndex, addSectionsToIndex, searchSections, serializeIndex, deserializeIndex, removeFromIndex, updateRecord, levenshteinDistance, findClosestWord, parseExtendedQuery, suggest, facets, trackQuery, getPopularQueries, getAllSections } from '../src/search.js';

test('extractSections returns heading-based sections from HTML', () => {
  const html = `
    <html>
      <head><title>Docs</title></head>
      <body>
        <main>
          <h1>Getting Started</h1>
          <p>Install the package.</p>
          <h2>Configuration</h2>
          <p>Set the token.</p>
        </main>
      </body>
    </html>`;

  const sections = extractSections(html, '/docs');

  assert.equal(sections.length, 2);
  assert.equal(sections[0].headingText, 'Getting Started');
  assert.match(sections[0].bodyText, /Install the package/);
  assert.equal(sections[1].headingText, 'Configuration');
  assert.match(sections[1].bodyText, /Set the token/);
});

test('searchSections finds heading matches', () => {
  const sections = [
    {
      id: '/docs/setup#installation',
      url: '/docs/setup',
      headingText: 'Installation',
      headingId: 'installation',
      breadcrumb: 'Installation',
      bodyText: 'Follow the setup guide to install the package.',
    },
    {
      id: '/docs/config#configuration',
      url: '/docs/config',
      headingText: 'Configuration',
      headingId: 'configuration',
      breadcrumb: 'Configuration',
      bodyText: 'Install the package in your project.',
    },
  ];

  const index = createSearchIndex();
  addSectionsToIndex(index, sections);

  const results = searchSections('install', index, 10);
  assert.ok(results.length > 0);
});

test('resolveUrl resolves relative paths from the current page location', () => {
  assert.equal(resolveUrl('sitemap.xml', 'https://example.com/fixture/index.html'), 'https://example.com/fixture/sitemap.xml');
  assert.equal(resolveUrl('/docs/guide', 'https://example.com/fixture/index.html'), 'https://example.com/docs/guide');
});

test('extractSections handles empty HTML', () => {
  const sections = extractSections('', '/docs');
  assert.equal(sections.length, 0);
});

test('extractSections handles HTML without headings', () => {
  const html = `<html><body><p>Just some text without headings.</p></body></html>`;
  const sections = extractSections(html, '/docs');
  assert.equal(sections.length, 0);
});

test('extractSections handles multiple heading levels', () => {
  const html = `
    <h1>Main Title</h1>
    <h2>Section A</h2>
    <h3>Subsection A1</h3>
    <h2>Section B</h2>
    <h4>Minor Heading</h4>
  `;
  const sections = extractSections(html, '/docs');
  assert.equal(sections.length, 4);
});

test('extractSections correctly generates selectors', () => {
  const html = `
    <h1 id="main">Title</h1>
    <h2 class="subtitle">Subtitle</h2>
  `;
  const sections = extractSections(html, '/docs');
  assert.equal(sections[0].selector, '#main');
});

test('extractSections handles nested sections', () => {
  const html = `
    <section><h1>Outer</h1>
      <section><h2>Inner</h2>
        <p>Content</p>
      </section>
    </section>
  `;
  const sections = extractSections(html, '/docs');
  assert.equal(sections.length, 2);
});

test('searchSections is case insensitive', () => {
  const sections = [
    { id: '/docs#install', url: '/docs', headingText: 'INSTALLATION', headingId: 'install', breadcrumb: 'INSTALLATION', bodyText: 'install guide', type: 'section' },
  ];
  const index = createSearchIndex();
  addSectionsToIndex(index, sections);

  const results = searchSections('installation', index, 10);
  assert.ok(results.length > 0);
});

test('searchSections handles special characters in query', () => {
  const sections = [
    { id: '/docs#api', url: '/docs', headingText: 'API Endpoint', headingId: 'api', breadcrumb: '', bodyText: 'REST API v2 endpoint', type: 'section' },
  ];
  const index = createSearchIndex();
  addSectionsToIndex(index, sections);

  const results = searchSections('endpoint', index, 10);
  assert.ok(results.length > 0);
});

test('searchSections returns all sections for empty query', () => {
  const sections = [
    { id: '/docs#a', url: '/docs', headingText: 'A', headingId: 'a', breadcrumb: '', bodyText: 'Content A', type: 'section' },
    { id: '/docs#b', url: '/docs', headingText: 'B', headingId: 'b', breadcrumb: '', bodyText: 'Content B', type: 'section' },
  ];
  const index = createSearchIndex();
  addSectionsToIndex(index, sections);

  const results = searchSections('', index, 10);
  assert.ok(results.length >= 2);
});

test('resolveUrl handles absolute URLs', () => {
  assert.equal(resolveUrl('https://other.com/page', 'https://example.com'), 'https://other.com/page');
  assert.equal(resolveUrl('//cdn.example.com/script.js', 'https://example.com'), 'https://cdn.example.com/script.js');
});

test('resolveUrl handles protocol-relative URLs', () => {
  assert.equal(resolveUrl('//example.com/api', 'https://site.com'), 'https://example.com/api');
});

test('resolveUrl handles empty values', () => {
  assert.equal(resolveUrl('', 'https://example.com'), 'https://example.com');
  assert.equal(resolveUrl(null, 'https://example.com'), 'https://example.com');
});

test('searchSections with includeScore returns scored results', () => {
  const index = createSearchIndex();
  addSectionsToIndex(index, [
    { id: '/docs#install', url: '/docs', headingText: 'Install', headingId: 'install', breadcrumb: '', bodyText: 'install guide', type: 'section' },
  ]);

  const results = searchSections('install', index, { includeScore: true, limit: 5 });
  assert.ok(Array.isArray(results));
});

test('searchSections with includeMatches returns match spans', () => {
  const index = createSearchIndex();
  addSectionsToIndex(index, [
    { id: '/docs#install', url: '/docs', headingText: 'Install Guide', headingId: 'install', breadcrumb: '', bodyText: 'installation instructions', type: 'section' },
  ]);

  const results = searchSections('guide', index, { includeMatches: true, limit: 5 });
  assert.ok(Array.isArray(results));
});

test('searchSections with custom weights ranks results', () => {
  const index = createSearchIndex();
  addSectionsToIndex(index, [
    { id: '/a#1', url: '/a', headingText: 'test content', headingId: '1', breadcrumb: '', bodyText: 'test', type: 'section' },
  ]);

  const results = searchSections('test', index, { weights: { headingText: 5 }, limit: 5 });
  assert.ok(results.length > 0);
});

test('searchSections with filter excludes non-matching records', () => {
  const index = createSearchIndex();
  addSectionsToIndex(index, [
    { id: '/a#1', url: '/a', headingText: 'Section One', headingId: '1', breadcrumb: '', bodyText: 'content', type: 'section' },
    { id: '/b#2', url: '/b', headingText: 'Section Two', headingId: '2', breadcrumb: '', bodyText: 'content', type: 'section' },
  ]);

  const results = searchSections('section', index, { filter: r => r.url === '/a', limit: 10 });
  assert.ok(results.every(r => r.url === '/a'));
});

test('searchSections with typeWeights boosts matching types', () => {
  const index = createSearchIndex();
  addSectionsToIndex(index, [
    { id: '/a#1', url: '/a', headingText: 'Important', headingId: '1', breadcrumb: '', bodyText: 'content', type: 'action' },
    { id: '/a#2', url: '/a', headingText: 'Important', headingId: '2', breadcrumb: '', bodyText: 'content', type: 'section' },
  ]);

  const results = searchSections('important', index, { typeWeights: { action: 2, section: 1 }, limit: 5 });
  assert.ok(Array.isArray(results));
});

test('searchSections fuzzy matching finds near matches', () => {
  const index = createSearchIndex();
  addSectionsToIndex(index, [
    { id: '/docs#install', url: '/docs', headingText: 'Installation', headingId: 'install', breadcrumb: '', bodyText: 'install code', type: 'section' },
  ]);

  const results = searchSections('instal', index, { fuzzy: true, fuzzyDistance: 2, limit: 5 });
  assert.ok(results.length > 0);
});

test('searchSections with extended query syntax finds exact phrase', () => {
  const index = createSearchIndex();
  addSectionsToIndex(index, [
    { id: '/docs#api', url: '/docs', headingText: 'API Documentation', headingId: 'api', breadcrumb: '', bodyText: 'REST API v2', type: 'section' },
  ]);

  const results = searchSections("'api documentation'", index, { extended: true });
  assert.ok(results.length > 0);
});

test('searchSections extended exclude syntax filters results', () => {
  const index = createSearchIndex();
  addSectionsToIndex(index, [
    { id: '/a#1', url: '/a', headingText: 'Installation Guide', headingId: '1', breadcrumb: '', bodyText: 'install instructions', type: 'section' },
    { id: '/a#2', url: '/a', headingText: 'Configuration Guide', headingId: '2', breadcrumb: '', bodyText: 'config settings', type: 'section' },
  ]);

  const results = searchSections('guide !config', index, { extended: true });
  assert.ok(results.every(r => !r.headingText.toLowerCase().includes('config')));
});

test('searchSections extended OR syntax combines matches', () => {
  const index = createSearchIndex();
  addSectionsToIndex(index, [
    { id: '/a#1', url: '/a', headingText: 'Installation', headingId: '1', breadcrumb: '', bodyText: 'install', type: 'section' },
    { id: '/a#2', url: '/a', headingText: 'Configuration', headingId: '2', breadcrumb: '', bodyText: 'setup', type: 'section' },
  ]);

  const results = searchSections('install | config', index, { extended: true });
  assert.ok(results.length >= 1);
});

test('searchSections prefix matching works', () => {
  const index = createSearchIndex();
  addSectionsToIndex(index, [
    { id: '/docs#api', url: '/docs', headingText: 'API', headingId: 'api', breadcrumb: '', bodyText: 'api reference', type: 'section' },
  ]);

  const results = searchSections('^api', index, { extended: true });
  assert.ok(results.length > 0);
});

test('searchSections suffix matching works', () => {
  const index = createSearchIndex();
  addSectionsToIndex(index, [
    { id: '/docs#guide', url: '/docs', headingText: 'Installation Guide', headingId: 'guide', breadcrumb: '', bodyText: 'setup', type: 'section' },
  ]);

  const results = searchSections('guide$', index, { extended: true });
  assert.ok(results.length > 0);
});

test('levenshteinDistance calculates edit distance', () => {
  assert.equal(levenshteinDistance('kitten', 'sitting'), 3);
  assert.equal(levenshteinDistance('hello', 'hello'), 0);
  assert.equal(levenshteinDistance('test', 'testing'), 3);
  assert.equal(levenshteinDistance('', 'test'), 4);
  assert.equal(levenshteinDistance('test', ''), 4);
});

test('findClosestWord finds nearest index term', () => {
  const index = createSearchIndex();
  addSectionsToIndex(index, [
    { id: '/a#1', url: '/a', headingText: 'Installation', headingId: '1', breadcrumb: '', bodyText: 'install', type: 'section' },
  ]);

  const result = findClosestWord('installtion', index, 2);
  assert.equal(result, 'installation');
});

test('findClosestWord returns null for very different strings', () => {
  const index = createSearchIndex();
  addSectionsToIndex(index, [
    { id: '/a#1', url: '/a', headingText: 'Installation', headingId: '1', breadcrumb: '', bodyText: 'install', type: 'section' },
  ]);

  const result = findClosestWord('xyz', index, 1);
  assert.equal(result, null);
});

test('parseExtendedQuery parses simple term', () => {
  const node = parseExtendedQuery('install');
  assert.equal(node.type, 'and');
});

test('parseExtendedQuery parses exact phrase', () => {
  const node = parseExtendedQuery("'exact phrase'");
  assert.equal(node.type, 'and');
});

test('parseExtendedQuery parses exclude term', () => {
  const node = parseExtendedQuery('!exclude');
  assert.equal(node.type, 'and');
});

test('parseExtendedQuery parses OR expressions', () => {
  const node = parseExtendedQuery('term1 | term2');
  assert.equal(node.type, 'or');
});

test('suggest returns autocomplete suggestions', () => {
  const index = createSearchIndex();
  addSectionsToIndex(index, [
    { id: '/a#1', url: '/a', headingText: 'Installation Guide', headingId: '1', breadcrumb: '', bodyText: 'install', type: 'section' },
    { id: '/a#2', url: '/a', headingText: 'Configuration Guide', headingId: '2', breadcrumb: '', bodyText: 'config', type: 'section' },
  ]);

  const suggestions = suggest('ins', index, 10);
  assert.ok(suggestions.length > 0);
});

test('suggest returns empty for short queries', () => {
  const index = createSearchIndex();
  addSectionsToIndex(index, [
    { id: '/a#1', url: '/a', headingText: 'Installation', headingId: '1', breadcrumb: '', bodyText: 'install', type: 'section' },
  ]);

  const suggestions = suggest('i', index, 10);
  assert.equal(suggestions.length, 0);
});

test('facets returns correct type counts', () => {
  const index = createSearchIndex();
  addSectionsToIndex(index, [
    { id: '/a#1', url: '/a', headingText: 'Section', headingId: '1', breadcrumb: '', bodyText: '', type: 'section' },
    { id: '/a#2', url: '/a', headingText: 'Button', headingId: '2', breadcrumb: '', bodyText: '', type: 'action' },
    { id: '/a#3', url: '/a', headingText: 'Field', headingId: '3', breadcrumb: '', bodyText: '', type: 'field' },
    { id: '/a#4', url: '/a', headingText: 'Link', headingId: '4', breadcrumb: '', bodyText: '', type: 'link' },
    { id: '/a#5', url: '/a', headingText: 'File', headingId: '5', breadcrumb: '', bodyText: '', type: 'file' },
    { id: '/a#6', url: '/a', headingText: 'Media', headingId: '6', breadcrumb: '', bodyText: '', type: 'media' },
    { id: '/a#7', url: '/a', headingText: 'Faq', headingId: '7', breadcrumb: '', bodyText: '', type: 'structured' },
  ]);

  const result = facets(index);
  assert.equal(result.section, 1);
  assert.equal(result.action, 1);
  assert.equal(result.field, 1);
  assert.equal(result.link, 1);
  assert.equal(result.file, 1);
  assert.equal(result.media, 1);
  assert.equal(result.structured, 1);
});

test('trackQuery records queries for analytics', () => {
  const index = createSearchIndex();
  trackQuery(index, 'install');
  trackQuery(index, 'install');
  trackQuery(index, 'config');
  trackQuery(index, 'install');

  assert.ok(index.popularQueries.includes('install'));
});

test('trackQuery ignores empty strings', () => {
  const index = createSearchIndex();
  trackQuery(index, '');
  trackQuery(index, '   ');
  assert.equal(index.popularQueries.length, 0);
});

test('getPopularQueries returns most frequent queries', () => {
  const index = createSearchIndex();
  trackQuery(index, 'install');
  trackQuery(index, 'install');
  trackQuery(index, 'install');
  trackQuery(index, 'config');
  trackQuery(index, 'config');

  const popular = getPopularQueries(index, 5);
  assert.equal(popular[0], 'install');
  assert.ok(popular.includes('config'));
});

test('getPopularQueries respects limit parameter', () => {
  const index = createSearchIndex();
  trackQuery(index, 'one');
  trackQuery(index, 'two');
  trackQuery(index, 'three');

  const popular = getPopularQueries(index, 2);
  assert.equal(popular.length, 2);
});

test('removeFromIndex removes record by id', () => {
  const index = createSearchIndex();
  addSectionsToIndex(index, [
    { id: '/a#1', url: '/a', headingText: 'One', headingId: '1', breadcrumb: '', bodyText: 'content', type: 'section' },
    { id: '/a#2', url: '/a', headingText: 'Two', headingId: '2', breadcrumb: '', bodyText: 'content', type: 'section' },
  ]);

  const initialCount = index.allSections.length;
  removeFromIndex(index, '/a#1');

  assert.equal(index.allSections.length, initialCount - 1);
  assert.ok(!index.allSections.some(r => r.id === '/a#1'));
});

test('removeFromIndex handles non-existent id gracefully', () => {
  const index = createSearchIndex();
  addSectionsToIndex(index, [
    { id: '/a#1', url: '/a', headingText: 'One', headingId: '1', breadcrumb: '', bodyText: 'content', type: 'section' },
  ]);

  removeFromIndex(index, '/nonexistent');
  assert.equal(index.allSections.length, 1);
});

test('removeFromIndex clears query cache', () => {
  const index = createSearchIndex();
  addSectionsToIndex(index, [
    { id: '/a#1', url: '/a', headingText: 'One', headingId: '1', breadcrumb: '', bodyText: 'content', type: 'section' },
  ]);

  searchSections('one', index, 10);
  assert.ok(index.queryCache.size > 0);

  removeFromIndex(index, '/a#1');
  assert.equal(index.queryCache.size, 0);
});

test('updateRecord replaces existing record', () => {
  const index = createSearchIndex();
  addSectionsToIndex(index, [
    { id: '/a#1', url: '/a', headingText: 'Original', headingId: '1', breadcrumb: '', bodyText: 'content', type: 'section' },
  ]);

  updateRecord(index, { id: '/a#1', url: '/a', headingText: 'Updated', headingId: '1', breadcrumb: '', bodyText: 'new content', type: 'section' });

  assert.ok(index.allSections.some(r => r.headingText === 'Updated'));
  assert.ok(!index.allSections.some(r => r.headingText === 'Original'));
});

test('serializeIndex and deserializeIndex preserve index data', () => {
  const index = createSearchIndex();
  addSectionsToIndex(index, [
    { id: '/a#1', url: '/a', headingText: 'Install', headingId: '1', breadcrumb: '', bodyText: 'install guide', type: 'section' },
    { id: '/a#2', url: '/a', headingText: 'Config', headingId: '2', breadcrumb: '', bodyText: 'setup', type: 'action' },
  ]);

  const serialized = serializeIndex(index);
  const deserialized = deserializeIndex(serialized);

  assert.equal(deserialized.allSections.length, 2);
  assert.equal(deserialized.totalDocs, 2);
  assert.ok(deserialized.headingIds.has('install'));
  assert.ok(deserialized.bodyIndex.has('guide'));
});

test('deserializeIndex handles empty JSON', () => {
  const deserialized = deserializeIndex('{}');
  assert.equal(deserialized.allSections.length, 0);
  assert.equal(deserialized.totalDocs, 0);
});

test('searchSections with bm25 scoring algorithm', () => {
  const index = createSearchIndex();
  addSectionsToIndex(index, [
    { id: '/a#1', url: '/a', headingText: 'Install', headingId: '1', breadcrumb: '', bodyText: 'install guide', type: 'section' },
    { id: '/a#2', url: '/a', headingText: 'Configuration', headingId: '2', breadcrumb: '', bodyText: 'config settings', type: 'section' },
  ]);

  const results = searchSections('install', index, { scoringAlgorithm: 'bm25', limit: 5 });
  assert.ok(Array.isArray(results));
});

test('searchSections returns all types when no results', () => {
  const index = createSearchIndex();
  addSectionsToIndex(index, [
    { id: '/a#1', url: '/a', headingText: 'Specific', headingId: '1', breadcrumb: '', bodyText: 'unique content xyz', type: 'section' },
  ]);

  const results = searchSections('nonexistent', index, 10);
  assert.equal(results.length, 0);
});

test('searchSections handles very large limit', () => {
  const index = createSearchIndex();
  const sections = [];
  for (let i = 0; i < 100; i++) {
    sections.push({
      id: `/docs/page${i}#h`,
      url: `/docs/page${i}`,
      headingText: `Heading ${i}`,
      headingId: `h${i}`,
      breadcrumb: '',
      bodyText: `Content ${i}`,
      type: 'section',
    });
  }
  addSectionsToIndex(index, sections);

  const results = searchSections('heading', index, 1000);
  assert.ok(results.length <= 100);
});

test('index handles records with structured data', () => {
  const index = createSearchIndex();
  addSectionsToIndex(index, [
    {
      id: '/faq#1',
      url: '/faq',
      headingText: 'What is Reef?',
      headingId: '1',
      breadcrumb: '',
      bodyText: 'Reef is a search library',
      type: 'structured',
      structuredData: { question: 'What is Reef?', answer: 'Reef is a search library' },
    },
  ]);

  assert.ok(index.allSections[0].structuredData);
  const results = searchSections('question', index, 10);
  assert.ok(results.length > 0);
});

test('index handles records with label field', () => {
  const index = createSearchIndex();
  addSectionsToIndex(index, [
    {
      id: '/a#1',
      url: '/a',
      headingText: 'Login Button',
      headingId: '1',
      breadcrumb: '',
      bodyText: 'click to login',
      type: 'action',
      label: 'Login',
      destructive: false,
    },
  ]);

  assert.equal(index.allSections[0].label, 'Login');
  const results = searchSections('login', index, 10);
  assert.ok(results.length > 0);
});

test('index handles records with selector', () => {
  const index = createSearchIndex();
  addSectionsToIndex(index, [
    {
      id: '/a#1',
      url: '/a',
      headingText: 'Submit',
      headingId: '1',
      breadcrumb: '',
      bodyText: 'submit form',
      type: 'action',
      selector: '#submit-btn',
    },
  ]);

  assert.equal(index.allSections[0].selector, '#submit-btn');
});

test('index handles destructive action flag', () => {
  const index = createSearchIndex();
  addSectionsToIndex(index, [
    {
      id: '/a#1',
      url: '/a',
      headingText: 'Delete Account',
      headingId: '1',
      breadcrumb: '',
      bodyText: 'delete your account',
      type: 'action',
      destructive: true,
    },
  ]);

  assert.equal(index.allSections[0].destructive, true);
});

test('searchSections respects default limit of 8', () => {
  const index = createSearchIndex();
  const sections = [];
  for (let i = 0; i < 20; i++) {
    sections.push({
      id: `/docs/page${i}#h`,
      url: `/docs/page${i}`,
      headingText: `Content ${i}`,
      headingId: `h${i}`,
      breadcrumb: '',
      bodyText: `${i}`,
      type: 'section',
    });
  }
  addSectionsToIndex(index, sections);

  const results = searchSections('content', index, {});
  assert.ok(results.length <= 8);
});

test('searchSections with sortFn customizes ordering', () => {
  const index = createSearchIndex();
  addSectionsToIndex(index, [
    { id: '/a#1', url: '/a', headingText: 'Zebra', headingId: '1', breadcrumb: '', bodyText: '', type: 'section' },
    { id: '/a#2', url: '/a', headingText: 'Apple', headingId: '2', breadcrumb: '', bodyText: '', type: 'section' },
  ]);

  const results = searchSections('app', index, { sortFn: (a, b) => a.record.headingText.localeCompare(b.record.headingText), limit: 5 });
  assert.ok(Array.isArray(results));
});

test('searchSections multi-word query matches all words', () => {
  const index = createSearchIndex();
  addSectionsToIndex(index, [
    { id: '/a#1', url: '/a', headingText: 'Install Guide', headingId: '1', breadcrumb: '', bodyText: 'simple guide', type: 'section' },
    { id: '/a#2', url: '/a', headingText: 'Advanced Guide', headingId: '2', breadcrumb: '', bodyText: 'complex instructions', type: 'section' },
  ]);

  const results = searchSections('install guide', index, 10);
  assert.ok(results.some(r => r.headingText.includes('Install')));
});

test('searchSections with whitespace-only query', () => {
  const index = createSearchIndex();
  addSectionsToIndex(index, [
    { id: '/a#1', url: '/a', headingText: 'Section', headingId: '1', breadcrumb: '', bodyText: 'content', type: 'section' },
  ]);

  const results = searchSections('   ', index, 10);
  assert.ok(results.length > 0);
});

test('createSearchIndex creates index with all required maps', () => {
  const index = createSearchIndex();

  assert.ok(index.headingIndex instanceof Map);
  assert.ok(index.headingIds instanceof Map);
  assert.ok(index.bodyIndex instanceof Map);
  assert.ok(index.allSections instanceof Array);
  assert.ok(index.queryCache instanceof Map);
  assert.ok(index.popularQueries instanceof Array);
  assert.ok(index.docFrequency instanceof Map);
  assert.equal(index.totalDocs, 0);
});

test('addToIndex increments totalDocs correctly', () => {
  const index = createSearchIndex();
  const records = [
    { id: '/a#1', url: '/a', headingText: 'One', headingId: '1', breadcrumb: '', bodyText: '', type: 'section' },
    { id: '/a#2', url: '/a', headingText: 'Two', headingId: '2', breadcrumb: '', bodyText: '', type: 'section' },
  ];

  addToIndex(index, records);
  addToIndex(index, records);

  assert.equal(index.totalDocs, 4);
});

test('suggestions limit is respected with custom limit', () => {
  const index = createSearchIndex();
  for (let i = 0; i < 20; i++) {
    addSectionsToIndex(index, [{
      id: `/a#${i}`,
      url: '/a',
      headingText: `Match ${i}`,
      headingId: `${i}`,
      breadcrumb: '',
      bodyText: 'content',
      type: 'section',
    }]);
  }

  const suggestions = suggest('match', index, 5);
  assert.ok(suggestions.length <= 5);
});

test('searchSections handles unicode in headings', () => {
  const index = createSearchIndex();
  addSectionsToIndex(index, [
    { id: '/a#1', url: '/a', headingText: 'Café', headingId: '1', breadcrumb: '', bodyText: 'coffee shop', type: 'section' },
    { id: '/a#2', url: '/a', headingText: '日本語', headingId: '2', breadcrumb: '', bodyText: 'japanese content', type: 'section' },
  ]);

  const results = searchSections('cafe', index, 10);
  assert.ok(results.some(r => r.headingText.includes('Café')));
});

test('searchSections normalizes scores to 0-1 range', () => {
  const index = createSearchIndex();
  addSectionsToIndex(index, [
    { id: '/a#1', url: '/a', headingText: 'Install Guide', headingId: '1', breadcrumb: '', bodyText: 'installation instructions', type: 'section' },
  ]);

  const results = searchSections('install', index, { includeScore: true, limit: 5 });
  assert.ok(results[0].score >= 0);
  assert.ok(results[0].score <= 1);
});

test('extractSections strips script and style tags', () => {
  const html = `
    <h1>Test</h1>
    <script>var secret = 'hidden';</script>
    <style>.hidden { display: none; }</style>
    <p>Visible content</p>
  `;
  const sections = extractSections(html, '/docs');
  assert.ok(!sections[0].bodyText.includes('secret'));
  assert.ok(!sections[0].bodyText.includes('display'));
});

test('extractSections handles self-closing tags', () => {
  const html = `
    <h1>Article</h1>
    <img src="test.jpg" />
    <br />
    <p>Text</p>
  `;
  const sections = extractSections(html, '/docs');
  assert.equal(sections[0].headingText, 'Article');
});

test('extractSections handles nested heading elements', () => {
  const html = `
    <h1><span>Nested <em>Heading</em></span></h1>
    <p>Content</p>
  `;
  const sections = extractSections(html, '/docs');
  assert.equal(sections[0].headingText, 'Nested Heading');
});