import type { IndexRecord, SearchOptions } from '../types.js';
export interface ReefPlugin { name: string; version?: string; beforeSearch?(query: string, options: SearchOptions): string | void; afterSearch?(query: string, results: IndexRecord[]): IndexRecord[] | void; onIndex?(records: IndexRecord[]): void; }
