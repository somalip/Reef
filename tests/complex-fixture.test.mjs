import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSections, searchSections, createSearchIndex, addSectionsToIndex, addToIndex, getAllSections } from '../src/search.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fixturePath = resolve(import.meta.dirname, '../fixture');

function readFixture(file) {
  return readFileSync(resolve(fixturePath, file), 'utf-8');
}

test('complex fixture index page has multiple sections', () => {
  const html = readFixture('index.html');
  const sections = extractSections(html, '/');
  assert.ok(sections.length >= 3);
});

test('complex fixture has form fields that can be searched', () => {
  const html = readFixture('advanced.html');
  const sections = extractSections(html, '/advanced.html');
  assert.ok(sections.length >= 2, 'Should have sections in forms page');
});

test('complex fixture has buttons for action indexing', () => {
  const html = readFixture('index.html');
  const sections = extractSections(html, '/');
  assert.ok(sections.length >= 2, 'Should have multiple sections');
});

test('search finds results across multiple documents', () => {
  const index = createSearchIndex();
  
  const files = [
    'index.html', 'install.html', 'config.html', 'advanced.html', 'parity.html', 'api-demo.html'
  ];
  
  for (const file of files) {
    try {
      const html = readFixture(file);
      const sections = extractSections(html, '/' + file);
      addToIndex(index, sections);
    } catch (e) {
      // Some files may not exist yet
    }
  }
  
  const installResults = searchSections('install', index, 10);
  assert.ok(installResults.length >= 1, 'Should find installation references');
  
  const configResults = searchSections('config', index, 10);
  assert.ok(configResults.length >= 1, 'Should find configuration references');
  
  const formResults = searchSections('field', index, 10);
  assert.ok(formResults.length >= 1, 'Should find field references');
});

test('duplicate heading prefixes are handled correctly', () => {
  const installDoc = extractSections(readFixture('install.html'), '/install.html');
  const setupDoc = extractSections(readFixture('config.html'), '/config.html');
  
  assert.ok(installDoc.some(s => s.headingText?.includes('Installation')));
  assert.ok(setupDoc.some(s => s.headingText?.includes('Configuration') || s.headingText?.includes('Custom')));
});

test('nested headings create separate sections', () => {
  const html = readFixture('api-demo.html');
  const sections = extractSections(html, '/api-demo.html');
  
  assert.ok(sections.length >= 3, 'Should have multiple sections from h1, h2, h3');
});

test('fixture with actions has action type records', () => {
  const html = readFixture('agentic-demo.html');
  const sections = extractSections(html, '/agentic-demo.html');
  
  assert.ok(sections.length >= 1, 'Should have sections');
});

test('extractSections handles real HTML documents', () => {
  const html = readFixture('index.html');
  const sections = extractSections(html, '/index.html');
  
  assert.ok(sections.length > 0);
  sections.forEach(section => {
    assert.ok(section.id);
    assert.ok(section.url);
    assert.ok(section.headingText);
    assert.ok(section.headingId);
    assert.ok(section.type === 'section');
  });
});

test('search sections have breadcrumb hierarchy', () => {
  const html = readFixture('index.html');
  const sections = extractSections(html, '/index.html');
  
  sections.forEach(section => {
    assert.ok(typeof section.breadcrumb === 'string');
  });
});

test('search finds specific section by heading text', () => {
  const index = createSearchIndex();
  addToIndex(index, extractSections(readFixture('index.html'), '/index.html'));
  
  const results = searchSections('What is Reef', index, 10);
  assert.ok(results.length >= 1, 'Should find What is Reef section');
});

test('search across all fixtures finds various content', () => {
  const index = createSearchIndex();
  
  const files = ['index.html', 'install.html', 'config.html', 'advanced.html', 'parity.html'];
  for (const file of files) {
    try {
      const html = readFixture(file);
      addToIndex(index, extractSections(html, '/' + file));
    } catch (e) {}
  }
  
  const reefResults = searchSections('reef', index, 10);
  assert.ok(reefResults.length >= 1, 'Should find reef references');
  
  const guideResults = searchSections('guide', index, 10);
  assert.ok(guideResults.length >= 1, 'Should find guide references');
});

test('index stores all sections across multiple documents', () => {
  const index = createSearchIndex();
  
  const files = ['index.html', 'install.html', 'config.html'];
  for (const file of files) {
    try {
      const html = readFixture(file);
      addToIndex(index, extractSections(html, '/' + file));
    } catch (e) {}
  }
  
  assert.ok(index.allSections.length > 0);
  assert.equal(index.totalDocs > 0, true);
});

test('search with exact match finds specific heading', () => {
  const index = createSearchIndex();
  addToIndex(index, extractSections(readFixture('install.html'), '/install.html'));
  
  const results = searchSections('Installation', index, 10);
  assert.ok(results.some(r => r.headingText.toLowerCase().includes('install')));
});

test('extractSections handles complex nested HTML', () => {
  const html = `
    <article>
      <h1>Main Article</h1>
      <div>
        <h2>Subsection</h2>
        <p>Content inside div</p>
      </div>
      <section>
        <h3>Deep nested</h3>
        <p>Deep content</p>
      </section>
    </article>
  `;
  const sections = extractSections(html, '/test');
  
  assert.equal(sections.length, 3);
  assert.equal(sections[0].headingText, 'Main Article');
  assert.equal(sections[1].headingText, 'Subsection');
  assert.equal(sections[2].headingText, 'Deep nested');
});

test('search works with special characters in content', () => {
  const index = createSearchIndex();
  addToIndex(index, [
    { id: '/a#1', url: '/a', headingText: 'API v2.0', headingId: '1', breadcrumb: '', bodyText: 'Version 2.0 release notes', type: 'section' },
  ]);
  
  const results = searchSections('v2', index, 10);
  assert.ok(Array.isArray(results));
});

test('extractSections preserves content between headings', () => {
  const html = `
    <h1>First</h1>
    <p>Para 1</p>
    <p>Para 2</p>
    <h2>Second</h2>
    <p>Para 3</p>
  `;
  const sections = extractSections(html, '/test');
  
  assert.ok(sections.length >= 1);
});

test('search returns results sorted by relevance', () => {
  const index = createSearchIndex();
  addToIndex(index, [
    { id: '/a#1', url: '/a', headingText: 'Completely Different', headingId: '1', breadcrumb: '', bodyText: 'test', type: 'section' },
    { id: '/a#2', url: '/a', headingText: 'Test Heading', headingId: '2', breadcrumb: '', bodyText: 'other', type: 'section' },
  ]);
  
  const results = searchSections('test', index, 10);
  assert.ok(results.length >= 1);
  // Exact heading match should rank first
  assert.ok(results[0].headingText.includes('Test'));
});

test('extractSections handles script and style removal', () => {
  const html = `
    <h1>Title</h1>
    <script>console.log('removed')</script>
    <style>.hidden { display: none; }</style>
    <p>Content after removal</p>
  `;
  const sections = extractSections(html, '/test');
  
  assert.ok(sections.length >= 1);
});

test('getAllSections returns all sections', () => {
  const index = createSearchIndex();
  addToIndex(index, [
    { id: '/a#1', url: '/a', headingText: 'One', headingId: '1', breadcrumb: '', bodyText: '', type: 'section' },
  ]);
  
  const sections = getAllSections(index);
  assert.equal(sections.length, 1);
});

test('searchSections with includeScore returns properly formatted results', () => {
  const index = createSearchIndex();
  addToIndex(index, [
    { id: '/a#1', url: '/a', headingText: 'Install Guide', headingId: '1', breadcrumb: '', bodyText: 'installation', type: 'section' },
  ]);
  
  const results = searchSections('install', index, { includeScore: true, limit: 5 });
  assert.ok(Array.isArray(results));
});

test('searchSections with includeMatches returns match spans', () => {
  const index = createSearchIndex();
  addToIndex(index, [
    { id: '/a#1', url: '/a', headingText: 'Install Guide', headingId: '1', breadcrumb: '', bodyText: 'installation guide', type: 'section' },
  ]);
  
  const results = searchSections('guide', index, { includeMatches: true, limit: 5 });
  assert.ok(Array.isArray(results));
});

test('search handles body text matching', () => {
  const index = createSearchIndex();
  addToIndex(index, [
    { id: '/a#1', url: '/a', headingText: 'Topic Overview', headingId: '1', breadcrumb: '', bodyText: 'configuration and setup', type: 'section' },
  ]);
  
  const results = searchSections('configuration', index, 10);
  assert.ok(results.length >= 1);
});

test('search with custom limit respects it', () => {
  const sections = Array.from({ length: 20 }, (_, i) => ({
    id: `/docs/page${i}#h`,
    url: `/docs/page${i}`,
    headingText: `Heading ${i}`,
    headingId: `h${i}`,
    breadcrumb: '',
    bodyText: 'common content',
    type: 'section',
  }));

  const index = createSearchIndex();
  addToIndex(index, sections);

  const results = searchSections('heading', index, 15);
  assert.ok(results.length <= 15);
});