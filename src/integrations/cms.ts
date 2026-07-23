import type { IndexRecord } from '../types.js';
export interface CMSAdapter { fetchRecords(): Promise<IndexRecord[]>; subscribe?(onChange: (records: IndexRecord[]) => void): () => void; }
export function createCMSAdapter(endpoint: string, fetchImpl: typeof fetch = globalThis.fetch): CMSAdapter { return { async fetchRecords() { const response = await fetchImpl(endpoint); if (!response.ok) throw new Error(`CMS request failed: ${response.status}`); const data = await response.json() as { records?: IndexRecord[] } | IndexRecord[]; return Array.isArray(data) ? data : data.records ?? []; } }; }
