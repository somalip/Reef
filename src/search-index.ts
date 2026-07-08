/**
 * @file Search index data structure and search algorithms.
 * Provides in-memory search indexing with fuzzy matching and result ranking.
 */

import { IndexRecord, SearchOptions, ScoredRecord, MatchSpan } from './types.js';

export interface SearchIndex {
  headingIndex: Map<string, IndexRecord[]>;
  headingIds: Map<string, IndexRecord[]>;
  bodyIndex: Map<string, IndexRecord[]>;
  allSections: IndexRecord[];
}

export function createSearchIndex(): SearchIndex {
  return {
    headingIndex: new Map(),
    headingIds: new Map(),
    bodyIndex: new Map(),
    allSections: [],
  };
}

export function addToIndex(index: SearchIndex, records: IndexRecord[]): void {
  index.allSections.push(...records);

  for (const record of records) {
    const headingLower = record.headingText.toLowerCase();
    if (headingLower.length >= 2) {
      const existing = index.headingIds.get(headingLower) ?? [];
      existing.push(record);
      index.headingIds.set(headingLower, existing);
    }

    for (let i = 2; i <= headingLower.length; i++) {
      const prefix = headingLower.slice(0, i);
      const existing = index.headingIndex.get(prefix) ?? [];
      existing.push(record);
      index.headingIndex.set(prefix, existing);
    }

    const bodyLower = record.bodyText.toLowerCase();
    const bodyWords = bodyLower.split(/\s+/);
    for (const word of bodyWords) {
      if (word.length >= 3) {
        const existing = index.bodyIndex.get(word) ?? [];
        existing.push(record);
        index.bodyIndex.set(word, existing);
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
  const regex = /'(\s*[^']+\s*')|(!\S+)|(\^\\S+)||( \\S+)|^(\|)|\s+/g;
  
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

// Get candidate words within fuzzy distance
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
function matchNode(node: QueryNode, record: IndexRecord): boolean {
  switch (node.type) {
    case 'term':
      const searchTerm = node.value.toLowerCase();
      const headingLower = record.headingText.toLowerCase();
      const bodyLower = record.bodyText.toLowerCase();
      return headingLower.includes(searchTerm) || bodyLower.includes(searchTerm);

    case 'exact':
      const exactTerm = node.value.toLowerCase();
      const headingExact = record.headingText.toLowerCase();
      const bodyExact = record.bodyText.toLowerCase();
      return headingExact.includes(exactTerm) || bodyExact.includes(exactTerm);

    case 'exclude':
      const excludeTerm = node.value.toLowerCase();
      const headingExcl = record.headingText.toLowerCase();
      const bodyExcl = record.bodyText.toLowerCase();
      return !headingExcl.includes(excludeTerm) && !bodyExcl.includes(excludeTerm);

    case 'prefix':
      const prefixTerm = node.value.toLowerCase();
      return headingLower.startsWith(prefixTerm) || bodyLower.startsWith(prefixTerm);

    case 'suffix':
      const suffixTerm = node.value.toLowerCase();
      return headingLower.endsWith(suffixTerm) || bodyLower.endsWith(suffixTerm);

    case 'and':
      return node.children.every(child => matchNode(child, record));

    case 'or':
      return node.children.some(child => matchNode(child, record));
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

  const scores = new Map<IndexRecord, number>();
  const matches = new Map<IndexRecord, MatchSpan[]>();
  const weights = { ...DEFAULT_WEIGHTS, ...(options?.weights ?? {}) };

  const addScore = (record: IndexRecord, score: number, key: string, start: number, end: number) => {
    scores.set(record, (scores.get(record) ?? 0) + score);
    const recordMatches = matches.get(record) ?? [];
    recordMatches.push({ key, start, end });
    matches.set(record, recordMatches);
  };

  // Exact matches on headingText
  const exact = index.headingIds.get(q.toLowerCase());
  if (exact) {
    for (const record of exact) {
      const fieldWeight = weights.headingText ?? 1;
      const lengthNorm = getLengthNorm(record.headingText.length);
      const score = 100 * fieldWeight * (1 + lengthNorm);
      addScore(record, score, 'headingText', 0, record.headingText.length);
    }
  }

  // Prefix matches on headingText
  const prefix = index.headingIndex.get(q.toLowerCase());
  if (prefix) {
    for (const record of prefix) {
      if (scores.has(record)) continue;
      const fieldWeight = weights.headingText ?? 1;
      const lengthNorm = getLengthNorm(record.headingText.length);
      const score = 50 * fieldWeight * (1 + lengthNorm);
      const positions = findMatchPositions(record.headingText, q);
      if (positions.length > 0) {
        const pos = positions[0];
        addScore(record, score, 'headingText', pos.start, pos.end);
      } else {
        addScore(record, score, 'headingText', 0, Math.min(q.length, record.headingText.length));
      }
    }
  }

  // Word matches in bodyText
  const words = q.toLowerCase().split(/\s+/);
  for (const word of words) {
    const bodyMatches = index.bodyIndex.get(word);
    if (bodyMatches) {
      for (const record of bodyMatches) {
        if (scores.has(record)) continue;
        const fieldWeight = weights.bodyText ?? 1;
        const lengthNorm = getLengthNorm(record.bodyText.length);
        const score = 20 * fieldWeight * (1 + lengthNorm);
        const positions = findMatchPositions(record.bodyText, word);
        if (positions.length > 0) {
          const pos = positions[0];
          addScore(record, score, 'bodyText', pos.start, pos.end);
        } else {
          addScore(record, score, 'bodyText', 0, Math.min(word.length, record.bodyText.length));
        }
      }
    }
  }

  // Fuzzy matching - only on shortlisted candidates
  if (options?.fuzzy) {
    const fuzzyThreshold = options.fuzzyThreshold ?? 0.3;
    const fuzzyDistance = options.fuzzyDistance ?? 2;
    const fuzzyCandidates = getFuzzyCandidates(q.toLowerCase(), index, fuzzyDistance);

    for (const record of fuzzyCandidates) {
      if (scores.has(record)) continue;

      const headingLower = record.headingText.toLowerCase();
      const bodyLower = record.bodyText.toLowerCase();
      let bestDistance = Infinity;
      let matchKey = 'bodyText';
      let matchStart = 0;
      let matchEnd = 0;

      for (const [key, records] of index.headingIds) {
        if (records.includes(record)) continue;
        const dist = levenshteinDistance(key, q.toLowerCase());
        if (dist < bestDistance) {
          bestDistance = dist;
          matchKey = 'headingText';
          const idx = headingLower.indexOf(key);
          if (idx !== -1) {
            matchStart = idx;
            matchEnd = idx + key.length;
          }
        }
      }

      for (const [key, records] of index.bodyIndex) {
        if (records.includes(record)) continue;
        const dist = levenshteinDistance(key, q.toLowerCase());
        if (dist < bestDistance) {
          bestDistance = dist;
          matchKey = 'bodyText';
          const idx = bodyLower.indexOf(key);
          if (idx !== -1) {
            matchStart = idx;
            matchEnd = idx + key.length;
          }
        }
      }

      if (bestDistance <= fuzzyDistance) {
        const maxPossibleDistance = Math.max(q.length, record.headingText.length, record.bodyText.length);
        const normalizedScore = (1 - bestDistance / maxPossibleDistance) * 40;
        const fieldWeight = matchKey === 'headingText' ? weights.headingText : weights.bodyText;
        const lengthNorm = getLengthNorm(matchKey === 'headingText' ? record.headingText.length : record.bodyText.length);
        addScore(record, normalizedScore * fieldWeight * (1 + lengthNorm), matchKey, matchStart, matchEnd);
      }
    }
  }

  // Fallback: substring search in heading/body
  if (scores.size === 0) {
    const trimmedQ = q.toLowerCase();
    for (const record of index.allSections) {
      const headingLower = record.headingText.toLowerCase();
      const bodyLower = record.bodyText.toLowerCase();

      const headingIdx = headingLower.indexOf(trimmedQ);
      if (headingIdx !== -1) {
        const fieldWeight = weights.headingText ?? 1;
        const lengthNorm = getLengthNorm(record.headingText.length);
        addScore(record, 40 * fieldWeight * (1 + lengthNorm), 'headingText', headingIdx, headingIdx + trimmedQ.length);
      } else {
        const bodyIdx = bodyLower.indexOf(trimmedQ);
        if (bodyIdx !== -1) {
          const fieldWeight = weights.bodyText ?? 1;
          const lengthNorm = getLengthNorm(record.bodyText.length);
          addScore(record, 10 * fieldWeight * (1 + lengthNorm), 'bodyText', bodyIdx, bodyIdx + trimmedQ.length);
        }
      }
    }
  }

  // Sort results
  let sortedEntries = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  if (options?.sortFn) {
    sortedEntries = sortedEntries.sort((a, b) => {
      const aMatches = matches.get(a[0]) ?? [];
      const bMatches = matches.get(b[0]) ?? [];
      return options!.sortFn!({ record: a[0], score: a[1], matches: aMatches }, { record: b[0], score: b[1], matches: bMatches });
    });
  }

  const topRecords = sortedEntries.slice(0, limit).map(([record]) => record);

  // Return format based on options
  if (options?.includeScore || options?.includeMatches) {
    return topRecords.map(record => {
      const recordMatches = matches.get(record) ?? [];
      const normalizedScore = scores.get(record) ?? 0;
      const maxScore = 200;
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
  };
}