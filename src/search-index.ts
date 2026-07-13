/**
 * @file Search index data structure and search algorithms.
 * Provides in-memory search indexing with fuzzy matching and result ranking.
 */

import { IndexRecord, SearchOptions, ScoredRecord, MatchSpan, TokenFilter } from './types.js';

// Default stop words for English
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
  'from', 'up', 'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
  'did', 'will', 'would', 'should', 'could', 'may', 'might', 'must', 'shall', 'can', 'it',
  'its', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'we', 'they', 'what',
  'which', 'who', 'whom', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both',
  'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
  'same', 'so', 'than', 'too', 'very', 'just', 'also', 'now', 'here', 'there',
]);

// Default tokenizer pipeline
function createDefaultTokenizePipeline(): TokenFilter[] {
  return [
    (token: string) => {
      if (STOP_WORDS.has(token)) return null;
      return token;
    },
    (token: string) => {
      return token.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    },
    (token: string) => {
      if (token.length <= 2) return token;
      if (/ing$/.test(token)) return token.slice(0, -3);
      if (/ed$/.test(token)) return token.slice(0, -2);
      if (/es$/.test(token) && token.length > 3) return token.slice(0, -2);
      if (/s$/.test(token) && token.length > 3) return token.slice(0, -1);
      return token;
    },
  ];
}

// Apply tokenization pipeline to text and return array of tokens
function tokenizeText(text: string, pipeline?: TokenFilter[]): string[] {
  if (!text) return [];

  let tokens = text.toLowerCase().split(/[^a-z0-9]+/i).filter(t => t.length > 0);
  const filters = pipeline ?? createDefaultTokenizePipeline();

  const result: string[] = [];
  for (const token of tokens) {
    let processed: string | null = token;
    for (const filter of filters) {
      if (processed === null) break;
      processed = filter(processed);
    }
    if (processed !== null) {
      result.push(processed);
    }
  }
  return result;
}

// Search cache entry for LRU
interface CacheEntry {
  resultIds: string[];
  timestamp: number;
}

export interface SearchIndex {
  headingIndex: Map<string, IndexRecord[]>;
  headingIds: Map<string, IndexRecord[]>;
  bodyIndex: Map<string, IndexRecord[]>;
  allSections: IndexRecord[];
  queryCache: Map<string, CacheEntry>;
  popularQueries: string[];
  docFrequency: Map<string, number>;
  totalDocs: number;
}

export function createSearchIndex(): SearchIndex {
  return {
    headingIndex: new Map(),
    headingIds: new Map(),
    bodyIndex: new Map(),
    allSections: [],
    queryCache: new Map(),
    popularQueries: [],
    docFrequency: new Map(),
    totalDocs: 0,
  };
}

export function addToIndex(index: SearchIndex, records: IndexRecord[], tokenizePipeline?: TokenFilter[]): void {
  index.totalDocs += records.length;

  for (const record of records) {
    // Index by exact heading text (backward compatible)
    const headingLower = record.headingText.toLowerCase();
    if (headingLower.length >= 2) {
      const existing = index.headingIds.get(headingLower) ?? [];
      existing.push(record);
      index.headingIds.set(headingLower, existing);

      // Also index normalized version for diacritic matching
      const normalizedHeading = headingLower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (normalizedHeading !== headingLower) {
        const normalizedExisting = index.headingIds.get(normalizedHeading) ?? [];
        normalizedExisting.push(record);
        index.headingIds.set(normalizedHeading, normalizedExisting);
      }
    }

    // Index by heading prefixes (also normalized)
    for (let i = 2; i <= headingLower.length; i++) {
      const prefix = headingLower.slice(0, i);
      const existing = index.headingIndex.get(prefix) ?? [];
      existing.push(record);
      index.headingIndex.set(prefix, existing);
    }
    const normalizedHeading = headingLower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    for (let i = 2; i <= normalizedHeading.length; i++) {
      const prefix = normalizedHeading.slice(0, i);
      if (prefix !== headingLower.slice(0, i)) {
        const existing = index.headingIndex.get(prefix) ?? [];
        existing.push(record);
        index.headingIndex.set(prefix, existing);
      }
    }

    // Index body words (backward compatible, simple split)
    const bodyLower = record.bodyText.toLowerCase();
    const bodyWords = bodyLower.split(/\s+/);
    for (const word of bodyWords) {
      if (word.length >= 3) {
        const existing = index.bodyIndex.get(word) ?? [];
        existing.push(record);
        index.bodyIndex.set(word, existing);

        // Also index normalized version
        const normalizedWord = word.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (normalizedWord !== word) {
          const normalizedExisting = index.bodyIndex.get(normalizedWord) ?? [];
          normalizedExisting.push(record);
          index.bodyIndex.set(normalizedWord, normalizedExisting);
        }
      }
    }

    // Track doc frequency for BM25 (use body words for now)
    for (const word of bodyWords) {
      if (word.length >= 2) {
        const currentFreq = index.docFrequency.get(word) ?? 0;
        index.docFrequency.set(word, currentFreq + 1);
      }
    }

    // Also index the label if present
    if (record.label) {
      const labelLower = record.label.toLowerCase();
      if (labelLower.length >= 2) {
        const existing = index.bodyIndex.get(labelLower) ?? [];
        existing.push(record);
        index.bodyIndex.set(labelLower, existing);
      }
    }

    if (record.type === 'structured' && record.structuredData) {
      if (record.structuredData.question) {
        const questionWords = record.structuredData.question.toLowerCase().split(/\s+/);
        for (const word of questionWords) {
          if (word.length >= 3) {
            const existing = index.bodyIndex.get(word) ?? [];
            existing.push(record);
            index.bodyIndex.set(word, existing);
          }
        }
      }
      if (record.structuredData.answer) {
        const answerWords = record.structuredData.answer.toLowerCase().split(/\s+/);
        for (const word of answerWords) {
          if (word.length >= 3) {
            const existing = index.bodyIndex.get(word) ?? [];
            existing.push(record);
            index.bodyIndex.set(word, existing);
          }
        }
      }
    }
  }

  // Also add records to allSections
  index.allSections.push(...records);
}

export const addSectionsToIndex = addToIndex;

export function getAllSections(index: SearchIndex): IndexRecord[] {
  return index.allSections;
}

export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;

  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] !== b[j - 1] ? 1 : 0)
      );
      prev = temp;
    }
  }
  return dp[n];
}

export function findClosestWord(query: string, index: SearchIndex, maxDistance = 2): string | null {
  const term = query.trim().toLowerCase();
  if (!term || term.length < 2) return null;

  let closest: { word: string; distance: number } | null = null;

  const checkWord = (word: string) => {
    if (!word || Math.abs(word.length - term.length) > maxDistance) return;
    const distance = levenshteinDistance(word, term);
    const current = closest as { word: string; distance: number } | null;
    if (distance <= maxDistance && (!current || distance < current.distance)) {
      closest = { word, distance };
    }
  };

  for (const key of index.headingIds.keys()) {
    checkWord(key);
  }
  for (const key of index.bodyIndex.keys()) {
    checkWord(key);
  }

  return (closest as { word: string; distance: number } | null)?.word ?? null;
}

// Default field weights (matching Fuse.js convention where higher = more important)
const DEFAULT_WEIGHTS: Record<string, number> = {
  headingText: 2,
  bodyText: 1,
  label: 1.5,
  breadcrumb: 0.5,
};

// Calculate field length normalization factor (shorter matches = better)
function getLengthNorm(textLength: number, avgLength = 50): number {
  const norm = 1 - Math.exp(-textLength / avgLength);
  return Math.max(0, Math.min(1, norm));
}

// Find all match positions in a string for a query
function findMatchPositions(text: string, query: string): Array<{ start: number; end: number }> {
  const positions: Array<{ start: number; end: number }> = [];
  if (!query.trim() || !text) return positions;

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  let idx = 0;

  while ((idx = lowerText.indexOf(lowerQuery, idx)) !== -1) {
    positions.push({ start: idx, end: idx + query.length });
    idx += query.length;
  }

  return positions;
}

// Parse extended search query syntax
export type QueryNode =
  | { type: 'term'; value: string; field?: string }
  | { type: 'exact'; value: string }
  | { type: 'exclude'; value: string }
  | { type: 'prefix'; value: string }
  | { type: 'suffix'; value: string }
  | { type: 'or'; children: QueryNode[] }
  | { type: 'and'; children: QueryNode[] };

export function parseExtendedQuery(query: string): QueryNode {
  const tokens = tokenizeExtendedQuery(query);
  return buildQueryTree(tokens);
}

function tokenizeExtendedQuery(query: string): Array<{ type: string; value: string }> {
  const tokens: Array<{ type: string; value: string }> = [];

  let rest = query;
  const exactRegex = /'([^']+)'/g;
  const excludeRegex = /!(\S+)/g;
  const prefixRegex = /\^(\S+)/g;
  const suffixRegex = /(\S+)\$/g;

  while (rest.length > 0) {
    let matched = false;

    const exactMatch = exactRegex.exec(rest);
    if (exactMatch && exactMatch.index === 0) {
      tokens.push({ type: 'exact', value: exactMatch[1] });
      rest = rest.slice(exactMatch[0].length);
      matched = true;
      continue;
    }

    const excludeMatch = excludeRegex.exec(rest);
    if (excludeMatch && excludeMatch.index === 0) {
      tokens.push({ type: 'exclude', value: excludeMatch[1] });
      rest = rest.slice(excludeMatch[0].length);
      matched = true;
      continue;
    }

    const prefixMatch = prefixRegex.exec(rest);
    if (prefixMatch && prefixMatch.index === 0) {
      tokens.push({ type: 'prefix', value: prefixMatch[1] });
      rest = rest.slice(prefixMatch[0].length);
      matched = true;
      continue;
    }

    const suffixMatch = suffixRegex.exec(rest);
    if (suffixMatch && suffixMatch.index === 0) {
      tokens.push({ type: 'suffix', value: suffixMatch[1] });
      rest = rest.slice(suffixMatch[0].length);
      matched = true;
      continue;
    }

    const pipeMatch = rest.match(/^\|/);
    if (pipeMatch) {
      tokens.push({ type: 'or', value: '|' });
      rest = rest.slice(1);
      matched = true;
      continue;
    }

    const spaceMatch = rest.match(/^\s+/);
    if (spaceMatch && !matched) {
      rest = rest.slice(spaceMatch[0].length);
      continue;
    }

    const wordMatch = rest.match(/^(\S+)/);
    if (wordMatch) {
      tokens.push({ type: 'term', value: wordMatch[1] });
      rest = rest.slice(wordMatch[0].length);
      matched = true;
    }
  }

  return tokens;
}

function buildQueryTree(tokens: Array<{ type: string; value: string }>): QueryNode {
  const result: QueryNode = { type: 'and', children: [] };
  let currentOr: QueryNode | null = null;

  for (const token of tokens) {
    if (token.type === 'or') {
      if (!currentOr) {
        currentOr = { type: 'or', children: [] };
        result.children.push(currentOr);
      }
    } else {
      if (currentOr) {
        result.children.push(currentOr);
        currentOr = null;
      }
      result.children.push({ type: token.type as any, value: token.value });
    }
  }

  if (currentOr) {
    result.children.push(currentOr);
  }

  return result;
}

// Check if a query matches a record via indexed terms with fuzzy tolerance
function getFuzzyCandidates(query: string, index: SearchIndex, distance: number): Set<IndexRecord> {
  const candidates = new Set<IndexRecord>();
  const queryLen = query.length;

  for (const [key, records] of index.headingIds) {
    if (Math.abs(key.length - queryLen) <= distance) {
      for (const record of records) {
        candidates.add(record);
      }
    }
  }

  for (const [key, records] of index.bodyIndex) {
    if (Math.abs(key.length - queryLen) <= distance) {
      for (const record of records) {
        candidates.add(record);
      }
    }
  }

  return candidates;
}

// Extended search matching for a single query node
function matchExtendedNode(node: QueryNode, record: IndexRecord): boolean {
  switch (node.type) {
    case 'term':
      const searchTerm = node.value.toLowerCase();
      const headingLower = record.headingText.toLowerCase();
      const bodyLower = record.bodyText.toLowerCase();
      return headingLower.includes(searchTerm) || bodyLower.includes(searchTerm);

    case 'exact':
      const exactTerm = node.value.toLowerCase();
      return record.headingText.toLowerCase().includes(exactTerm) || record.bodyText.toLowerCase().includes(exactTerm);

    case 'exclude':
      const excludeTerm = node.value.toLowerCase();
      return !record.headingText.toLowerCase().includes(excludeTerm) && !record.bodyText.toLowerCase().includes(excludeTerm);

    case 'prefix':
      const prefixTerm = node.value.toLowerCase();
      return record.headingText.toLowerCase().startsWith(prefixTerm) || record.bodyText.toLowerCase().startsWith(prefixTerm);

    case 'suffix':
      const suffixTerm = node.value.toLowerCase();
      return record.headingText.toLowerCase().endsWith(suffixTerm) || record.bodyText.toLowerCase().endsWith(suffixTerm);

    case 'and':
      return node.children.every(child => matchExtendedNode(child, record));

    case 'or':
      return node.children.some(child => matchExtendedNode(child, record));
  }
}

// Calculate BM25 score for a term
function bm25Score(
  termFreq: number,
  docFreq: number,
  totalDocs: number,
  docLength: number,
  avgDocLength: number,
  k1 = 1.5,
  b = 0.75
): number {
  const idf = Math.log((totalDocs - docFreq + 0.5) / (docFreq + 0.5) + 1);
  const norm = 1 - b + b * (docLength / avgDocLength);
  return idf * ((termFreq * (k1 + 1)) / (termFreq + k1 * norm));
}

// Calculate average document length from index
function getAvgDocLength(index: SearchIndex): number {
  if (index.allSections.length === 0) return 50;
  const total = index.allSections.reduce((sum, r) => sum + r.bodyText.length + r.headingText.length, 0);
  return total / index.allSections.length;
}

// Get cached shortlist if available
function getCachedShortlist(query: string, index: SearchIndex): Set<IndexRecord> | null {
  const cached = index.queryCache.get(query);
  if (cached) {
    const candidates = new Set<IndexRecord>();
    for (const id of cached.resultIds) {
      const record = index.allSections.find(r => r.id === id);
      if (record) candidates.add(record);
    }
    return candidates;
  }
  return null;
}

// Cache shortlist for future queries
function cacheShortlist(query: string, records: IndexRecord[], index: SearchIndex): void {
  const entry: CacheEntry = {
    resultIds: records.map(r => r.id),
    timestamp: Date.now()
  };
  index.queryCache.set(query, entry);

  // Limit cache size
  if (index.queryCache.size > 100) {
    const firstKey = index.queryCache.keys().next().value;
    if (firstKey !== undefined) {
      index.queryCache.delete(firstKey);
    }
  }
}

// Backward-compatible searchSections - old signature preserved
export function searchSections(
  query: string,
  index: SearchIndex,
  limitOrOptions?: number | SearchOptions
): IndexRecord[] | ScoredRecord[] {
  let limit = 8;
  let options: SearchOptions | undefined;

  if (typeof limitOrOptions === 'number') {
    limit = limitOrOptions;
  } else if (limitOrOptions) {
    options = limitOrOptions;
    limit = limitOrOptions.limit ?? 8;
  }

  const q = query.trim();

  if (!q) {
    return index.allSections.slice(0, limit);
  }

  // Normalize diacritics in query for matching
  const normalizedQ = q.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const scores = new Map<IndexRecord, number>();
  const matches = new Map<IndexRecord, MatchSpan[]>();
  const weights = { ...DEFAULT_WEIGHTS, ...(options?.weights ?? {}) };
  const avgLength = getAvgDocLength(index);

  const addScore = (record: IndexRecord, score: number, key: string, start: number, end: number) => {
    scores.set(record, (scores.get(record) ?? 0) + score);
    const recordMatches = matches.get(record) ?? [];
    recordMatches.push({ key, start, end });
    matches.set(record, recordMatches);
  };

  const useBM25 = options?.scoringAlgorithm === 'bm25';

  // Check query cache first
  const cached = getCachedShortlist(normalizedQ.toLowerCase(), index);
  const searchPool: IndexRecord[] = cached
    ? [...cached]
    : index.allSections;

  // Exact matches on headingText (try both original and normalized)
  const exact = index.headingIds.get(normalizedQ.toLowerCase()) ?? index.headingIds.get(q.toLowerCase());
  if (exact) {
    for (const record of exact) {
      const fieldWeight = weights.headingText ?? 1;
      const lengthNorm = getLengthNorm(record.headingText.length);
      let score: number;
      if (useBM25) {
        const termFreq = 1;
        const docFreq = index.docFrequency.get(normalizedQ.toLowerCase()) ?? 1;
        score = bm25Score(termFreq, docFreq, index.totalDocs, record.headingText.length + record.bodyText.length, avgLength) * 100;
      } else {
        score = 100 * fieldWeight * (1 + lengthNorm);
      }
      addScore(record, score, 'headingText', 0, record.headingText.length);
    }
  }

// Prefix matches on headingText (try both)
  const prefix = index.headingIndex.get(normalizedQ.toLowerCase()) ?? index.headingIndex.get(q.toLowerCase());
  if (prefix) {
    for (const record of prefix) {
      if (scores.has(record)) continue;
      const fieldWeight = weights.headingText ?? 1;
      const lengthNorm = getLengthNorm(record.headingText.length);
      let score: number;
      if (useBM25) {
        const termFreq = 1;
        const docFreq = index.docFrequency.get(normalizedQ.toLowerCase()) ?? 1;
        score = bm25Score(termFreq, docFreq, index.totalDocs, record.headingText.length + record.bodyText.length, avgLength) * 50;
      } else {
        score = 50 * fieldWeight * (1 + lengthNorm);
      }
      const positions = findMatchPositions(record.headingText, q);
      if (positions.length > 0) {
        const pos = positions[0];
        addScore(record, score, 'headingText', pos.start, pos.end);
      } else {
        addScore(record, score, 'headingText', 0, Math.min(q.length, record.headingText.length));
      }
    }
  }

  // Word matches in bodyText (try both)
  const words = normalizedQ.toLowerCase().split(/\s+/);
  for (const word of words) {
    const bodyMatches = index.bodyIndex.get(word);
    if (bodyMatches) {
      for (const record of bodyMatches) {
        if (scores.has(record)) continue;
        const fieldWeight = weights.bodyText ?? 1;
        const lengthNorm = getLengthNorm(record.bodyText.length);
        let score: number;
        if (useBM25) {
          const termFreq = 1;
          const docFreq = index.docFrequency.get(word) ?? 1;
          score = bm25Score(termFreq, docFreq, index.totalDocs, record.headingText.length + record.bodyText.length, avgLength) * 20;
        } else {
          score = 20 * fieldWeight * (1 + lengthNorm);
        }
        const positions = findMatchPositions(record.bodyText, q);
        if (positions.length > 0) {
          const pos = positions[0];
          addScore(record, score, 'bodyText', pos.start, pos.end);
} else {
           addScore(record, score, 'bodyText', 0, Math.min(word.length, record.bodyText.length));
         }
       }
     }
   }

  // Staged fuzzy search - exact → 1-typo → 2-typo, short-circuit on first hit
  if (options?.fuzzy) {
    const fuzzyDistance = options.fuzzyDistance ?? 2;

    // Stage 1: Exact matches (already done above)
    // Stage 2: 1-typo matches on indexed candidates
    if (scores.size === 0) {
      const candidates = getFuzzyCandidates(q.toLowerCase(), index, 1);
      for (const record of candidates) {
        if (scores.has(record)) continue;

        const headingLower = record.headingText.toLowerCase();
        const headingMatch = findMatchPositions(headingLower, q);
        if (headingMatch.length === 0) {
          const dist = levenshteinDistance(headingLower, q);
          if (dist <= 1) {
            const normalizedScore = (1 - dist / Math.max(q.length, headingLower.length)) * 60;
            const fieldWeight = weights.headingText ?? 1;
            const lengthNorm = getLengthNorm(record.headingText.length);
            addScore(record, normalizedScore * fieldWeight * (1 + lengthNorm), 'headingText', 0, Math.min(q.length, headingLower.length));
          }
        }

        if (scores.has(record)) continue;

        const bodyLower = record.bodyText.toLowerCase();
        let bestDist = Infinity;
        let bestStart = 0;
        for (let i = 0; i <= bodyLower.length - q.length; i++) {
          const substr = bodyLower.slice(i, i + q.length);
          const dist = levenshteinDistance(q, substr);
          if (dist < bestDist) {
            bestDist = dist;
            bestStart = i;
          }
        }
        if (bestDist <= 1) {
          const normalizedScore = (1 - bestDist / Math.max(q.length, bodyLower.length)) * 40;
          const fieldWeight = weights.bodyText ?? 1;
          const lengthNorm = getLengthNorm(record.bodyText.length);
          addScore(record, normalizedScore * fieldWeight * (1 + lengthNorm), 'bodyText', bestStart, bestStart + q.length);
        }
      }
    }

    // Stage 3: 2-typo matches
    if (scores.size === 0) {
      const candidates = getFuzzyCandidates(q.toLowerCase(), index, 2);
      for (const record of candidates) {
        if (scores.has(record)) continue;

        const headingLower = record.headingText.toLowerCase();
        const dist = levenshteinDistance(headingLower, q);
        if (dist <= 2) {
          const normalizedScore = (1 - dist / Math.max(q.length, headingLower.length)) * 30;
          const fieldWeight = weights.headingText ?? 1;
          const lengthNorm = getLengthNorm(record.headingText.length);
          addScore(record, normalizedScore * fieldWeight * (1 + lengthNorm), 'headingText', 0, Math.min(q.length, headingLower.length));
        }

        if (scores.has(record)) continue;

        const bodyLower = record.bodyText.toLowerCase();
        let bestDist = Infinity;
        let bestStart = 0;
        for (let i = 0; i <= bodyLower.length - q.length; i++) {
          const substr = bodyLower.slice(i, i + q.length);
          const d = levenshteinDistance(q, substr);
          if (d < bestDist) {
            bestDist = d;
            bestStart = i;
          }
        }
        if (bestDist <= 2) {
          const normalizedScore = (1 - bestDist / Math.max(q.length, bodyLower.length)) * 20;
          const fieldWeight = weights.bodyText ?? 1;
          const lengthNorm = getLengthNorm(record.bodyText.length);
          addScore(record, normalizedScore * fieldWeight * (1 + lengthNorm), 'bodyText', bestStart, bestStart + q.length);
        }
      }
    }
  }

  // Extended query syntax
  if (options?.extended && scores.size === 0) {
    const parsed = parseExtendedQuery(q);
    for (const record of index.allSections) {
      if (matchExtendedNode(parsed, record)) {
        const fieldWeight = weights.headingText ?? 1;
        const lengthNorm = getLengthNorm(record.headingText.length);
        const score = 50 * fieldWeight * (1 + lengthNorm);
        addScore(record, score, 'headingText', 0, Math.min(q.length, record.headingText.length));
      }
    }
  }

  // Filtering
  let filteredScores = [...scores.entries()];
  if (options?.filter) {
    filteredScores = filteredScores.filter(([record]) => options!.filter!(record));
  }

  // Sort results
  let sortedEntries = filteredScores.sort((a, b) => b[1] - a[1]);
  if (options?.sortFn) {
    sortedEntries = sortedEntries.sort((a, b) => {
      const aMatches = matches.get(a[0]) ?? [];
      const bMatches = matches.get(b[0]) ?? [];
      return options!.sortFn!({ record: a[0], score: a[1], matches: aMatches }, { record: b[0], score: b[1], matches: bMatches });
    });
  }

  const topRecords = sortedEntries.slice(0, limit).map(([record]) => record);

  // Apply type-based ranking boost
  if (options?.typeWeights) {
    const typeBoost = options.typeWeights;
    for (const record of topRecords) {
      const boost = typeBoost[record.type] ?? 1;
      const currentScore = scores.get(record);
      if (currentScore !== undefined && boost !== 1) {
        scores.set(record, currentScore * boost);
      }
    }
    sortedEntries = [...scores.entries()].sort((a, b) => b[1] - a[1]);
    const boostedRecords = sortedEntries.slice(0, limit).map(([record]) => record);
    
    // Cache the boosted shortlist
    cacheShortlist(q.toLowerCase(), boostedRecords, index);
    
    if (options?.includeScore || options?.includeMatches) {
      return boostedRecords.map(record => {
        const recordMatches = matches.get(record) ?? [];
        const normalizedScore = scores.get(record) ?? 0;
        const maxScore = useBM25 ? 100 : 200;
        const score = Math.max(0, Math.min(1, 1 - normalizedScore / maxScore));
        return {
          record,
          score,
          matches: options.includeMatches ? recordMatches : undefined,
        };
      });
    }
    return boostedRecords;
  }

  // Cache the shortlist
  cacheShortlist(q.toLowerCase(), topRecords, index);

  // Return format based on options
  if (options?.includeScore || options?.includeMatches) {
    return topRecords.map(record => {
      const recordMatches = matches.get(record) ?? [];
      const normalizedScore = scores.get(record) ?? 0;
      const maxScore = useBM25 ? 100 : 200;
      const score = Math.max(0, Math.min(1, 1 - normalizedScore / maxScore));
      return {
        record,
        score,
        matches: options.includeMatches ? recordMatches : undefined,
      };
    });
  }

  return topRecords;
}

// remove a record from the index by its id
export function removeFromIndex(index: SearchIndex, id: string): void {
  const recordIndex = index.allSections.findIndex(r => r.id === id);
  if (recordIndex === -1) return;

  const record = index.allSections[recordIndex];
  index.allSections.splice(recordIndex, 1);
  index.totalDocs = Math.max(0, index.totalDocs - 1);

  // Clear query cache on mutation
  index.queryCache.clear();

  const headingLower = record.headingText.toLowerCase();
  const headingIds = index.headingIds.get(headingLower);
  if (headingIds) {
    const idx = headingIds.findIndex(r => r.id === id);
    if (idx !== -1) headingIds.splice(idx, 1);
    if (headingIds.length === 0) index.headingIds.delete(headingLower);
  }

  for (let i = 2; i <= headingLower.length; i++) {
    const prefix = headingLower.slice(0, i);
    const prefixRecords = index.headingIndex.get(prefix);
    if (prefixRecords) {
      const idx = prefixRecords.findIndex(r => r.id === id);
      if (idx !== -1) prefixRecords.splice(idx, 1);
      if (prefixRecords.length === 0) index.headingIndex.delete(prefix);
    }
  }

  const bodyWords = record.bodyText.toLowerCase().split(/\s+/);
  for (const word of bodyWords) {
    if (word.length < 3) continue;
    const bodyRecords = index.bodyIndex.get(word);
    if (bodyRecords) {
      const idx = bodyRecords.findIndex(r => r.id === id);
      if (idx !== -1) bodyRecords.splice(idx, 1);
      if (bodyRecords.length === 0) index.bodyIndex.delete(word);
    }
  }
}

// Update an existing record in the index
export function updateRecord(index: SearchIndex, record: IndexRecord): void {
  removeFromIndex(index, record.id);
  addToIndex(index, [record]);
}

// Serialize index to JSON string
export function serializeIndex(index: SearchIndex): string {
  const serializable = {
    allSections: index.allSections,
    headingIndex: Array.from(index.headingIndex.entries()),
    headingIds: Array.from(index.headingIds.entries()),
    bodyIndex: Array.from(index.bodyIndex.entries()),
    docFrequency: Array.from(index.docFrequency.entries()),
    totalDocs: index.totalDocs,
    popularQueries: index.popularQueries,
  };
  return JSON.stringify(serializable);
}

// Deserialize index from JSON string
export function deserializeIndex(json: string): SearchIndex {
  const parsed = JSON.parse(json);
  return {
    allSections: parsed.allSections ?? [],
    headingIndex: new Map(parsed.headingIndex ?? []),
    headingIds: new Map(parsed.headingIds ?? []),
    bodyIndex: new Map(parsed.bodyIndex ?? []),
    queryCache: new Map(),
    popularQueries: parsed.popularQueries ?? [],
    docFrequency: new Map(parsed.docFrequency ?? []),
    totalDocs: parsed.totalDocs ?? 0,
  };
}

// Suggest function for autocomplete - returns unique headings matching query prefix
export function suggest(query: string, index: SearchIndex, limit: number = 10): string[] {
  const q = query.trim().toLowerCase();
  if (!q || q.length < 2) return [];

  const suggestions: string[] = [];
  const seen = new Set<string>();

  // Get candidates from heading index
  const candidates = index.headingIndex.get(q) ?? [];
  const prefixCandidates = index.headingIds.get(q) ?? [];

  const allCandidates = [...candidates, ...prefixCandidates];
  for (const record of allCandidates) {
    if (suggestions.length >= limit) break;
    const heading = record.headingText;
    if (!seen.has(heading)) {
      seen.add(heading);
      suggestions.push(heading);
    }
  }

  // If not enough from prefix, try fuzzy match on indexed keys
  if (suggestions.length < limit) {
    for (const [key, records] of index.headingIds) {
      if (suggestions.length >= limit) break;
      if (key.includes(q) && !seen.has(records[0].headingText)) {
        seen.add(records[0].headingText);
        suggestions.push(records[0].headingText);
      }
    }
  }

  return suggestions.slice(0, limit);
}

// Facets function - returns counts per record type
export function facets(index: SearchIndex): Record<IndexRecord['type'], number> {
  const result: Record<IndexRecord['type'], number> = {
    section: 0,
    action: 0,
    field: 0,
    link: 0,
    file: 0,
    media: 0,
    structured: 0,
  };

  for (const record of index.allSections) {
    result[record.type] = (result[record.type] ?? 0) + 1;
  }

  return result;
}

// Track query for popularity analytics
export function trackQuery(index: SearchIndex, query: string): void {
  const q = query.trim();
  if (!q) return;

  // Add to ring buffer (keep last 100)
  if (index.popularQueries.length >= 100) {
    index.popularQueries.shift();
  }
  index.popularQueries.push(q);
}

// Get popular queries - returns most frequently searched terms
export function getPopularQueries(index: SearchIndex, n: number = 5): string[] {
  const counts = new Map<string, number>();
  for (const q of index.popularQueries) {
    counts.set(q, (counts.get(q) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([q]) => q);
}

export type { IndexRecord, TokenFilter };
