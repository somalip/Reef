/**
 * @file UI helper functions for search interface.
 * Provides utilities for rendering, escaping, and formatting search results.
 */

export function escapeHtml(s: string): string {
  const map: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  let result = '';
  for (let i = 0; i < s.length; i++) {
    result += map[s[i]] ?? s[i];
  }
  return result;
}

export function highlight(text: string, query: string): string {
  if (!query.trim()) return escapeHtml(text);
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);
  if (idx === -1) return escapeHtml(text);
  const before = escapeHtml(text.slice(0, idx));
  const match = escapeHtml(text.slice(idx, idx + query.length));
  const after = escapeHtml(text.slice(idx + query.length));
  return `${before}<mark>${match}</mark>${after}`;
}

export function getSnippet(text: string, query: string): string {
  if (!query.trim()) return text.slice(0, 90) + '…';
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerText.indexOf(lowerQuery);
  if (idx === -1) return text.slice(0, 90) + '…';
  const start = Math.max(0, idx - 30);
  const end = Math.min(text.length, idx + query.length + 40);
  return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '');
}

export function getResultTypeIcon(type: string): string {
  switch (type) {
    case 'section':
      return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square"><path d="M4 6h16M4 10h10M4 14h12M4 18h8"/></svg>';
    case 'action':
      return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square"><polyline points="13 2 13 9 20 9"/><polyline points="11 22 11 15 4 15"/><path d="M3 12l4-4 4 4 4-4 4 4"/></svg>';
    case 'field':
      return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square"><rect x="3" y="8" width="18" height="8"/><line x1="7" y1="12" x2="7" y2="12"/></svg>';
    case 'link':
      return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square"><path d="M10 13a5 5 0 0 0 7.54.51l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.72"/><path d="M14 11a5 5 0 0 0-7.54-.51l-3 3a5 5 0 0 0 7.07 7.07l1.72-1.72"/></svg>';
    case 'file':
      return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square"><path d="M13 2H6v20h12V7z"/><polyline points="13 2 13 7 18 7"/></svg>';
    case 'media':
      return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square"><rect x="3" y="3" width="18" height="18"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>';
    case 'structured':
      return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square"><circle cx="12" cy="12" r="9"/><polyline points="9 12 11 14 15 10"/></svg>';
    default:
      return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="square"><path d="M13 2H6v20h12V7z"/><polyline points="13 2 13 7 18 7"/></svg>';
  }
}

export function getResultTypeLabel(type: string): string {
  switch (type) {
    case 'section':    return 'Section';
    case 'action':     return 'Action';
    case 'field':      return 'Field';
    case 'link':       return 'Link';
    case 'file':       return 'File';
    case 'media':      return 'Media';
    case 'structured': return 'Answer';
    default:           return 'Section';
  }
}
