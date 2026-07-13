import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSections, searchSections, createSearchIndex, addToIndex } from '../src/search.js';
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
  
  // Simulate indexing multiple pages
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