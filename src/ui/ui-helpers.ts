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
    case 'section': return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
    case 'action': return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
    case 'field': return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
    case 'link': return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.51l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.72"/><path d="M14 11a5 5 0 0 0-7.54-.51l-3 3a5 5 0 0 0 7.07 7.07l1.72-1.72"/></svg>';
    case 'file': return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.44l-5.12 5.12a5 5 0 0 1-1.62.98l-2.6.45a2.43 2.43 0 0 1-2.89-2.04l-.26-2.16a5 5 0 0 1 .89-4.08l5.12-5.12a5 5 0 0 1 6.36 6.36z"/><circle cx="7" cy="7" r="1"/></svg>';
    case 'media': return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 15"/></svg>';
    case 'structured': return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><polyline points="7 11 11 15 15 9"/></svg>';
    default: return '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
  }
}

export function getResultTypeLabel(type: string): string {
  switch (type) {
    case 'section': return 'Section';
    case 'action': return 'Action';
    case 'field': return 'Field';
    case 'link': return 'Link';
    case 'file': return 'File';
    case 'media': return 'Media';
    case 'structured': return 'Answer';
    default: return 'Section';
  }
}