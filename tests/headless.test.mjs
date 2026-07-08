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