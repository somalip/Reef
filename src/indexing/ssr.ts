import type { IndexRecord } from '../types.js';
export function createStaticIndex(records: IndexRecord[]): string { return JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), records }); }
export function exportStaticIndex(records: IndexRecord[], format: 'json' | 'hugo' | 'jekyll' = 'json'): string { const json = createStaticIndex(records); if (format === 'json') return json; return `---\nreef_index: true\n---\n${json}`; }
