import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSections, resolveUrl, searchSections } from '../src/search.js';

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

test('searchSections ranks heading matches ahead of body-only matches', () => {
  const sections = [
    {
      url: '/docs/setup',
      headingText: 'Installation',
      headingId: 'installation',
      breadcrumb: 'Installation',
      bodyText: 'Follow the setup guide to install the package.',
    },
    {
      url: '/docs/config',
      headingText: 'Configuration',
      headingId: 'configuration',
      breadcrumb: 'Configuration',
      bodyText: 'Install the package in your project.',
    },
  ];

  const results = searchSections('install', sections);

  assert.equal(results[0].headingText, 'Installation');
  assert.equal(results[1].headingText, 'Configuration');
});

test('resolveUrl resolves relative paths from the current page location', () => {
  assert.equal(resolveUrl('sitemap.xml', 'https://example.com/fixture/index.html'), 'https://example.com/fixture/sitemap.xml');
  assert.equal(resolveUrl('/docs/guide', 'https://example.com/fixture/index.html'), 'https://example.com/docs/guide');
});
