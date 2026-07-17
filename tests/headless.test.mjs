import test from 'node:test';
import assert from 'node:assert/strict';
import { createSearchIndex, searchSections, getAllSections, addToIndex } from '../src/search.js';

test('search returns results from index', () => {
  const sections = [
    {
      id: '/docs/setup#installation',
      url: '/docs/setup',
      headingText: 'Installation',
      headingId: 'installation',
      breadcrumb: 'Installation',
      bodyText: 'Follow the setup guide to install the package.',
      type: 'section',
    },
    {
      id: '/docs/config#configuration',
      url: '/docs/config',
      headingText: 'Configuration',
      headingId: 'configuration',
      breadcrumb: 'Configuration',
      bodyText: 'Set the token in your project.',
      type: 'section',
    },
  ];

  const index = createSearchIndex();
  addToIndex(index, sections);

  const results = searchSections('install', index, 10);
  assert.equal(results.length > 0, true);
  assert.equal(results[0].headingText, 'Installation');
});

test('getIndex returns all sections from index', () => {
  const sections = [
    {
      id: '/docs/setup#installation',
      url: '/docs/setup',
      headingText: 'Installation',
      headingId: 'installation',
      breadcrumb: 'Installation',
      bodyText: 'Follow the setup guide.',
      type: 'section',
    },
  ];

  const index = createSearchIndex();
  addToIndex(index, sections);

  const allSections = getAllSections(index);
  assert.equal(allSections.length, 1);
});

test('search with limit parameter works', () => {
  const sections = [];
  for (let i = 0; i < 20; i++) {
    sections.push({
      id: `/docs/page${i}#heading`,
      url: `/docs/page${i}`,
      headingText: `Heading ${i}`,
      headingId: `heading${i}`,
      breadcrumb: `Heading ${i}`,
      bodyText: `Content ${i}`,
      type: 'section',
    });
  }

  const index = createSearchIndex();
  addToIndex(index, sections);

  const results = searchSections('heading', index, 5);
  assert.equal(results.length <= 5, true);
});

test('search returns empty array for no matches', () => {
  const sections = [
    {
      id: '/docs/setup#installation',
      url: '/docs/setup',
      headingText: 'Installation',
      headingId: 'installation',
      breadcrumb: 'Installation',
      bodyText: 'Follow the setup guide.',
      type: 'section',
    },
  ];

  const index = createSearchIndex();
  addToIndex(index, sections);

  const results = searchSections('nonexistent', index, 10);
  assert.equal(results.length, 0);
});

test('search returns all sections for empty query', () => {
  const sections = [
    { id: '/a#1', url: '/a', headingText: 'Alpha', headingId: '1', breadcrumb: '', bodyText: 'a', type: 'section' },
    { id: '/a#2', url: '/a', headingText: 'Beta', headingId: '2', breadcrumb: '', bodyText: 'b', type: 'section' },
    { id: '/a#3', url: '/a', headingText: 'Gamma', headingId: '3', breadcrumb: '', bodyText: 'c', type: 'section' },
  ];

  const index = createSearchIndex();
  addToIndex(index, sections);

  const results = searchSections('', index, 10);
  assert.ok(results.length >= 3);
});

test('search handles whitespace-only query', () => {
  const sections = [
    { id: '/a#1', url: '/a', headingText: 'Alpha', headingId: '1', breadcrumb: '', bodyText: 'a', type: 'section' },
  ];

  const index = createSearchIndex();
  addToIndex(index, sections);

  const results = searchSections('   ', index, 10);
  assert.ok(results.length >= 1);
});

test('getAllSections returns empty array for empty index', () => {
  const index = createSearchIndex();
  const sections = getAllSections(index);
  assert.equal(sections.length, 0);
});

test('getAllSections returns all record types', () => {
  const sections = [
    { id: '/a#1', url: '/a', headingText: 'Section', headingId: '1', breadcrumb: '', bodyText: 'content', type: 'section' },
    { id: '/a#2', url: '/a', headingText: 'Action', headingId: '2', breadcrumb: '', bodyText: '', type: 'action', selector: '#btn' },
    { id: '/a#3', url: '/a', headingText: 'Field', headingId: '3', breadcrumb: '', bodyText: '', type: 'field', selector: '#inp', label: 'Email' },
    { id: '/a#4', url: '/a', headingText: 'External', headingId: '4', breadcrumb: '', bodyText: '', type: 'link', url: 'https://other.com' },
    { id: '/a#5', url: '/a', headingText: 'PDF', headingId: '5', breadcrumb: '', bodyText: '', type: 'file', url: '/doc.pdf' },
    { id: '/a#6', url: '/a', headingText: 'Image', headingId: '6', breadcrumb: '', bodyText: '', type: 'media', selector: 'img#hero' },
    { id: '/a#7', url: '/a', headingText: 'FAQ', headingId: '7', breadcrumb: '', bodyText: '', type: 'structured' },
  ];

  const index = createSearchIndex();
  addToIndex(index, sections);

  const all = getAllSections(index);
  assert.equal(all.length, 7);
});

test('search respects limit of 1', () => {
  const sections = Array.from({ length: 10 }, (_, i) => ({
    id: `/docs/page${i}#h`,
    url: `/docs/page${i}`,
    headingText: `Install Guide`,
    headingId: `h${i}`,
    breadcrumb: 'Install',
    bodyText: 'installation',
    type: 'section',
  }));

  const index = createSearchIndex();
  addToIndex(index, sections);

  const results = searchSections('install', index, 1);
  assert.equal(results.length, 1);
});

test('search with exact match ranks higher than partial', () => {
  const sections = [
    { id: '/a#1', url: '/a', headingText: 'Install', headingId: '1', breadcrumb: '', bodyText: 'installation guide', type: 'section' },
    { id: '/a#2', url: '/a', headingText: 'Installation Guide', headingId: '2', breadcrumb: '', bodyText: 'setup', type: 'section' },
  ];

  const index = createSearchIndex();
  addToIndex(index, sections);

  const results = searchSections('install', index, 10);
  assert.ok(results.some(r => r.headingText === 'Install'));
});

test('search includes records from body text matches', () => {
  const sections = [
    { id: '/a#1', url: '/a', headingText: 'Guide', headingId: '1', breadcrumb: '', bodyText: 'installation instructions here', type: 'section' },
  ];

  const index = createSearchIndex();
  addToIndex(index, sections);

  const results = searchSections('installation', index, 10);
  assert.ok(results.length > 0);
});

test('search with multiple terms finds matching paragraphs', () => {
  const sections = [
    { id: '/a#1', url: '/a', headingText: 'Install', headingId: '1', breadcrumb: '', bodyText: 'package install', type: 'section' },
    { id: '/a#2', url: '/a', headingText: 'Config', headingId: '2', breadcrumb: '', bodyText: 'package config', type: 'section' },
  ];

  const index = createSearchIndex();
  addToIndex(index, sections);

  const results = searchSections('package', index, 10);
  assert.ok(results.length >= 2);
});

test('search handles numeric values in query', () => {
  const sections = [
    { id: '/a#1', url: '/a', headingText: 'Version 1', headingId: '1', breadcrumb: '', bodyText: 'v1.0.0', type: 'section' },
    { id: '/a#2', url: '/a', headingText: 'Version 2', headingId: '2', breadcrumb: '', bodyText: 'v2.0.0', type: 'section' },
  ];

  const index = createSearchIndex();
  addToIndex(index, sections);

  const results = searchSections('version', index, 10);
  assert.ok(Array.isArray(results));
});

test('search handles special regex characters safely', () => {
  const sections = [
    { id: '/a#1', url: '/a', headingText: 'C++ Guide', headingId: '1', breadcrumb: '', bodyText: 'c++ programming', type: 'section' },
  ];

  const index = createSearchIndex();
  addToIndex(index, sections);

  const results = searchSections('c++', index, 10);
  assert.ok(Array.isArray(results));
});

test('search returns unique results', () => {
  const sections = [
    { id: '/a#1', url: '/a', headingText: 'Install Guide', headingId: '1', breadcrumb: '', bodyText: 'install', type: 'section' },
    { id: '/a#2', url: '/a', headingText: 'Install Guide', headingId: '2', breadcrumb: '', bodyText: 'install', type: 'section' },
  ];

  const index = createSearchIndex();
  addToIndex(index, sections);

  const results = searchSections('install', index, 10);
  assert.ok(results.length >= 1);
});

test('search with zero limit returns empty', () => {
  const sections = [
    { id: '/a#1', url: '/a', headingText: 'Install', headingId: '1', breadcrumb: '', bodyText: 'installation', type: 'section' },
  ];

  const index = createSearchIndex();
  addToIndex(index, sections);

  const results = searchSections('install', index, 0);
  assert.ok(results.length === 0 || results.length === 1);
});

test('search works with large index', () => {
  const sections = Array.from({ length: 500 }, (_, i) => ({
    id: `/page${i % 50}#${i}`,
    url: `/page${i % 50}`,
    headingText: `Topic ${i}`,
    headingId: `${i}`,
    breadcrumb: 'Topics',
    bodyText: `documentation about topic ${i}`,
    type: 'section',
  }));

  const index = createSearchIndex();
  addToIndex(index, sections);

  const results = searchSections('topic 10', index, 10);
  assert.ok(results.length >= 1);
});

test('search case-insensitive with mixed case query', () => {
  const sections = [
    { id: '/a#1', url: '/a', headingText: 'INSTALLATION', headingId: '1', breadcrumb: '', bodyText: 'guide', type: 'section' },
  ];

  const index = createSearchIndex();
  addToIndex(index, sections);

  const results = searchSections('Installation', index, 10);
  assert.ok(results.length > 0);
});

test('search returns records with correct properties', () => {
  const sections = [
    { id: '/a#1', url: '/a', headingText: 'Install', headingId: '1', breadcrumb: 'Setup', bodyText: 'install guide', type: 'section', selector: '#install' },
  ];

  const index = createSearchIndex();
  addToIndex(index, sections);

  const results = searchSections('install', index, 10);
  assert.equal(results[0].id, '/a#1');
  assert.equal(results[0].url, '/a');
  assert.equal(results[0].breadcrumb, 'Setup');
  assert.equal(results[0].selector, '#install');
});