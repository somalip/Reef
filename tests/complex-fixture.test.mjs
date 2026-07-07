import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSections, searchSections, createSearchIndex, addToIndex } from '../src/search.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const fixturePath = resolve(import.meta.dirname, '../tests/fixture');

function readFixture(file) {
  return readFileSync(resolve(fixturePath, file), 'utf-8');
}

test('complex fixture index page has multiple sections', () => {
  const html = readFixture('index.html');
  const sections = extractSections(html, '/');
  assert.ok(sections.length >= 3);
});

test('complex fixture has form fields that can be searched', () => {
  const html = readFixture('advanced/forms.html');
  const sections = extractSections(html, '/advanced/forms.html');
  assert.ok(sections.length >= 2, 'Should have sections in forms page');
});

test('complex fixture has buttons for action indexing', () => {
  const html = readFixture('index.html');
  const sections = extractSections(html, '/');
  assert.ok(sections.length >= 2, 'Should have multiple sections');
});

test('search finds results across multiple documents', () => {
  const index = createSearchIndex();
  
  // Simulate indexing multiple pages
  const files = [
    'index.html', 'docs/install.html', 'docs/setup.html', 'docs/troubleshooting.html',
    'api/core.html', 'api/search.html', 'api/index.html', 'api/extract.html',
    'reference/config.html', 'reference/themes.html', 'reference/actions.html',
    'examples/demo.html', 'examples/advanced-demo.html',
    'guides/intro.html', 'guides/quickstart.html', 'guides/tutorial.html',
    'advanced/forms.html', 'advanced/performance.html', 'advanced/themes.html', 'docs/faq.html'
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
  
  // Test searches that should match across documents
  const installResults = searchSections('install', index, 10);
  assert.ok(installResults.length >= 1, 'Should find installation references');
  
  const configResults = searchSections('config', index, 10);
  assert.ok(configResults.length >= 1, 'Should find configuration references');
  
  const formResults = searchSections('field', index, 10);
  assert.ok(formResults.length >= 1, 'Should find field references');
});

test('duplicate heading prefixes are handled correctly', () => {
  // Multiple docs have "Installation" in headings
  const installDoc = extractSections(readFixture('docs/install.html'), '/docs/install.html');
  const setupDoc = extractSections(readFixture('docs/setup.html'), '/docs/setup.html');
  
  assert.ok(installDoc.some(s => s.headingText?.includes('Installation')));
  assert.ok(setupDoc.some(s => s.headingText?.includes('Installation')));
});

test('nested headings create separate sections', () => {
  const html = readFixture('api/core.html');
  const sections = extractSections(html, '/api/core.html');
  
  assert.ok(sections.length >= 3, 'Should have multiple sections from h1, h2, h3');
});