import type { IndexRecord } from '../types.js';
export function mergeIndexes(indexes: IndexRecord[][], options: { prefer?: 'first' | 'last' } = {}): IndexRecord[] { const merged = new Map<string, IndexRecord>(); for (const index of indexes) for (const record of index) if (options.prefer === 'last' || !merged.has(record.id)) merged.set(record.id, record); return [...merged.values()]; }
