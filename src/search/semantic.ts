import type { IndexRecord, ScoredRecord } from '../types.js';
export type Embedding = number[];
export type Embedder = (text: string) => Embedding | Promise<Embedding>;
export function cosineSimilarity(a: Embedding, b: Embedding): number { const n = Math.min(a.length, b.length); let dot = 0, aa = 0, bb = 0; for (let i = 0; i < n; i++) { dot += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2; } return aa && bb ? dot / Math.sqrt(aa * bb) : 0; }
export async function semanticSearch(query: string, records: IndexRecord[], embedder: Embedder, options: { limit?: number; hybrid?: number } = {}): Promise<ScoredRecord[]> { const q = await embedder(query); const scored = await Promise.all(records.map(async record => ({ record, score: cosineSimilarity(q, await embedder(`${record.headingText} ${record.bodyText}`)) }))); return scored.sort((a, b) => b.score - a.score).slice(0, options.limit ?? 10); }
export function quantizeEmbedding(vector: Embedding): Int8Array { const max = Math.max(...vector.map(Math.abs), 1); return Int8Array.from(vector, value => Math.max(-127, Math.min(127, Math.round(value / max * 127)))); }
