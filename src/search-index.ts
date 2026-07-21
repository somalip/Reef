/**
 * @file Search index data structure and search algorithms.
 * Provides in-memory search indexing with fuzzy matching and result ranking.
 */

import { IndexRecord, SearchOptions, ScoredRecord, MatchSpan, TokenFilter, ReefConfig } from './types.js';

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

// Per-field document frequency tracking for BM25F
interface FieldDocFreq {
  headingText: Map<string, number>;
  bodyText: Map<string, number>;
  label: Map<string, number>;
  breadcrumb: Map<string, number>;
}

// Query popularity tracking entry
interface PopularityEntry {
  query: string;
  recordId: string;
  count: number;
}

// Trie node for autocomplete
interface TrieNode {
  children: Map<string, TrieNode>;
  records: IndexRecord[]; // Records that have this prefix
}

export interface SearchIndex {
  headingIndex: Map<string, IndexRecord[]>;
  headingIds: Map<string, IndexRecord[]>;
  bodyIndex: Map<string, IndexRecord[]>;
  allSections: IndexRecord[];
  queryCache: Map<string, CacheEntry>;
  popularQueries: string[];
  docFrequency: Map<string, number>;
  fieldDocFreq: FieldDocFreq;
  totalDocs: number;
  queryPopularity: Map<string, PopularityEntry>;
  version: number;
  headingTrie: TrieNode; // Trie for efficient prefix lookups
}

// Create a new trie node
function createTrieNode(): TrieNode {
  return {
    children: new Map(),
    records: [],
  };
}

// Insert a string into the trie
function trieInsert(root: TrieNode, text: string, record: IndexRecord): void {
  let current = root;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (!current.children.has(char)) {
      current.children.set(char, createTrieNode());
    }
    current = current.children.get(char)!;
    
    // Add record to this prefix node
    if (!current.records.some(r => r.id === record.id)) {
      current.records.push(record);
    }
  }
}

// Delete a string from the trie
function trieDelete(root: TrieNode, text: string, recordId: string): void {
  let current = root;
  const path: {node: TrieNode, char: string}[] = [];
  
  // Traverse to find the string
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (!current.children.has(char)) {
      return; // String not in trie
    }
    path.push({node: current, char});
    current = current.children.get(char)!;
  }
  
  // Remove the record from all prefix nodes
  const nodesToClean: TrieNode[] = [];
  let tempCurrent = root;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (tempCurrent.children.has(char)) {
      tempCurrent = tempCurrent.children.get(char)!;
      // Remove the record from this node
      tempCurrent.records = tempCurrent.records.filter(r => r.id !== recordId);
      nodesToClean.push(tempCurrent);
    }
  }
  
  // Clean up empty nodes (optional optimization)
  for (const node of nodesToClean) {
    if (node.records.length === 0 && node.children.size === 0) {
      // This node can be removed, but we'd need to track parent references
      // For now, just leave empty nodes as they don't affect functionality
    }
  }
}

// Query the trie for prefix matches
function triePrefixQuery(root: TrieNode, prefix: string): IndexRecord[] {
  let current = root;
  
  for (let i = 0; i < prefix.length; i++) {
    const char = prefix[i];
    if (!current.children.has(char)) {
      return []; // Prefix not found
    }
    current = current.children.get(char)!;
  }
  
  // Return all records that have this prefix
  return [...current.records];
}

// Count total nodes in the trie (for memory comparison)
function countTrieNodes(root: TrieNode): number {
  let count = 1; // Count current node
  for (const child of root.children.values()) {
    count += countTrieNodes(child);
  }
  return count;
}

// Helper function for finer-grained cache invalidation
function invalidateAffectedQueries(index: SearchIndex, recordId: string, headingText: string, bodyText: string): void {
  // Tokenize the record's heading and body text
  const recordTokens = new Set<string>();
  
  // Add heading tokens
  headingText.toLowerCase().split(/\s+/).forEach(token => {
    if (token.length >= 2) recordTokens.add(token);
  });
  
  // Add body tokens
  bodyText.toLowerCase().split(/\s+/).forEach(token => {
    if (token.length >= 2) recordTokens.add(token);
  });
  
  // Find queries that need to be invalidated
  const queriesToInvalidate = new Set<string>();
  
  for (const [query, entry] of index.queryCache.entries()) {
    // Check if this query's results include the mutated record
    if (entry.resultIds.includes(recordId)) {
      queriesToInvalidate.add(query);
      continue;
    }
    
    // Check if query terms overlap with record tokens
    const queryLower = query.toLowerCase();
    const queryTokens = queryLower.split(/\s+/).filter(t => t.length >= 2);
    
    for (const queryToken of queryTokens) {
      if (recordTokens.has(queryToken)) {
        queriesToInvalidate.add(query);
        break;
      }
    }
  }
  
  // Remove invalidated queries from cache
  if (queriesToInvalidate.size > 0) {
    for (const query of queriesToInvalidate) {
      index.queryCache.delete(query);
    }
  } else {
    // If we can't determine affected queries (e.g., empty cache or no matches),
    // fall back to clearing the entire cache
    index.queryCache.clear();
  }
}

// Calculate Jaccard similarity between two sets of tokens
function jaccardSimilarity(tokens1: Set<string>, tokens2: Set<string>): number {
  if (tokens1.size === 0 || tokens2.size === 0) return 0;
  
  let intersection = 0;
  for (const token of tokens1) {
    if (tokens2.has(token)) intersection++;
  }
  
  const union = tokens1.size + tokens2.size - intersection;
  return intersection / union;
}

// Extract tokens from text for MMR similarity comparison
function extractTokensForMMR(text: string): Set<string> {
  const tokens = text.toLowerCase().split(/\s+/);
  return new Set(tokens.filter(t => t.length > 2)); // Filter out very short tokens
}

// Maximal Marginal Relevance (MMR) re-ranking
// Diversifies results by penalizing documents similar to already-selected ones
function applyMMR(
  scoredEntries: Array<[IndexRecord, number]>, 
  lambda: number = 0.5
): Array<[IndexRecord, number]> {
  if (scoredEntries.length <= 1) return scoredEntries;
  
  const results: Array<[IndexRecord, number]> = [];
  const selectedTokens: Set<string>[] = [];
  
  // Sort by score first (descending)
  const sortedByScore = [...scoredEntries].sort((a, b) => b[1] - a[1]);
  
  // Select first result (highest score)
  results.push(sortedByScore[0]);
  selectedTokens.push(extractTokensForMMR(sortedByScore[0][0].headingText + ' ' + sortedByScore[0][0].bodyText));
  
  // Select remaining results using MMR
  for (let i = 1; i < sortedByScore.length; i++) {
    const [record, originalScore] = sortedByScore[i];
    const recordText = record.headingText + ' ' + record.bodyText;
    const recordTokens = extractTokensForMMR(recordText);
    
    // Calculate similarity to already-selected results
    let maxSimilarity = 0;
    for (const selectedTokenSet of selectedTokens) {
      const similarity = jaccardSimilarity(recordTokens, selectedTokenSet);
      maxSimilarity = Math.max(maxSimilarity, similarity);
    }
    
    // MMR score: (1 - lambda) * relevance + lambda * (1 - maxSimilarity)
    const mmrScore = (1 - lambda) * originalScore + lambda * (1 - maxSimilarity);
    
    // Insert in the right position
    let inserted = false;
    for (let j = 0; j < results.length; j++) {
      if (mmrScore > results[j][1]) {
        results.splice(j, 0, [record, mmrScore]);
        selectedTokens.splice(j, 0, recordTokens);
        inserted = true;
        break;
      }
    }
    
    if (!inserted) {
      results.push([record, mmrScore]);
      selectedTokens.push(recordTokens);
    }
  }
  
  return results;
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
    fieldDocFreq: {
      headingText: new Map(),
      bodyText: new Map(),
      label: new Map(),
      breadcrumb: new Map(),
    },
    totalDocs: 0,
    queryPopularity: new Map(),
    version: 1,
    headingTrie: createTrieNode(),
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

    // Index by heading prefixes (also normalized) - keep for backward compatibility
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

    // Insert into trie for efficient prefix lookups
    trieInsert(index.headingTrie, headingLower, record);
    if (normalizedHeading !== headingLower) {
      trieInsert(index.headingTrie, normalizedHeading, record);
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
        
        // Track per-field doc frequency for BM25F
        const currentBodyFreq = index.fieldDocFreq.bodyText.get(word) ?? 0;
        index.fieldDocFreq.bodyText.set(word, currentBodyFreq + 1);
      }
    }

    // Track per-field doc frequency for heading
    const headingWords = headingLower.split(/\s+/);
    for (const word of headingWords) {
      if (word.length >= 2) {
        const currentHeadingFreq = index.fieldDocFreq.headingText.get(word) ?? 0;
        index.fieldDocFreq.headingText.set(word, currentHeadingFreq + 1);
      }
    }

    // Track per-field doc frequency for label if present
    if (record.label) {
      const labelLower = record.label.toLowerCase();
      const labelWords = labelLower.split(/\s+/);
      for (const word of labelWords) {
        if (word.length >= 2) {
          const currentLabelFreq = index.fieldDocFreq.label.get(word) ?? 0;
          index.fieldDocFreq.label.set(word, currentLabelFreq + 1);
        }
      }
    }

    // Track per-field doc frequency for breadcrumb if present
    if (record.breadcrumb) {
      const breadcrumbLower = record.breadcrumb.toLowerCase();
      const breadcrumbWords = breadcrumbLower.split(/\s+/);
      for (const word of breadcrumbWords) {
        if (word.length >= 2) {
          const currentBreadcrumbFreq = index.fieldDocFreq.breadcrumb.get(word) ?? 0;
          index.fieldDocFreq.breadcrumb.set(word, currentBreadcrumbFreq + 1);
        }
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
      // Use proper phrase matching instead of string includes
      const phraseTokens = tokenizeForPhraseMatching(exactTerm);
      const headingTokens = tokenizeForPhraseMatching(record.headingText);
      const bodyTokens = tokenizeForPhraseMatching(record.bodyText);
      return hasPhraseMatch(headingTokens, phraseTokens) || hasPhraseMatch(bodyTokens, phraseTokens);

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

// Calculate BM25F score - field-weighted BM25
// BM25F combines per-field weighted term frequency into a single pseudo-frequency
// before applying the BM25 saturation function
function bm25fScore(
  record: IndexRecord,
  queryTerms: string[],
  index: SearchIndex,
  weights: Record<string, number>,
  k1 = 1.5,
  b = 0.75
): number {
  const avgDocLength = getAvgDocLength(index);
  const totalDocs = index.totalDocs;
  
  // Calculate document length (combined length of all searchable fields)
  const docLength = (
    record.headingText.length * (weights.headingText || 1) +
    record.bodyText.length * (weights.bodyText || 1) +
    (record.label ? record.label.length * (weights.label || 1) : 0) +
    (record.breadcrumb ? record.breadcrumb.length * (weights.breadcrumb || 1) : 0)
  );
  
  let totalScore = 0;
  
  // For each query term, calculate BM25F score across all fields
  for (const term of queryTerms) {
    const termLower = term.toLowerCase();
    
    // Calculate per-field term frequencies and doc frequencies
    let weightedTermFreq = 0;
    let combinedDocFreq = 0;
    
    // Check heading field
    if (weights.headingText) {
      const headingText = record.headingText.toLowerCase();
      const headingTermFreq = countTermFrequency(headingText, termLower);
      const headingDocFreq = index.fieldDocFreq.headingText.get(termLower) || 1;
      
      weightedTermFreq += headingTermFreq * (weights.headingText || 1);
      combinedDocFreq = Math.max(combinedDocFreq, headingDocFreq);
    }
    
    // Check body field
    if (weights.bodyText) {
      const bodyText = record.bodyText.toLowerCase();
      const bodyTermFreq = countTermFrequency(bodyText, termLower);
      const bodyDocFreq = index.fieldDocFreq.bodyText.get(termLower) || 1;
      
      weightedTermFreq += bodyTermFreq * (weights.bodyText || 1);
      combinedDocFreq = Math.max(combinedDocFreq, bodyDocFreq);
    }
    
    // Check label field
    if (record.label && weights.label) {
      const labelText = record.label.toLowerCase();
      const labelTermFreq = countTermFrequency(labelText, termLower);
      const labelDocFreq = index.fieldDocFreq.label.get(termLower) || 1;
      
      weightedTermFreq += labelTermFreq * (weights.label || 1);
      combinedDocFreq = Math.max(combinedDocFreq, labelDocFreq);
    }
    
    // Check breadcrumb field
    if (record.breadcrumb && weights.breadcrumb) {
      const breadcrumbText = record.breadcrumb.toLowerCase();
      const breadcrumbTermFreq = countTermFrequency(breadcrumbText, termLower);
      const breadcrumbDocFreq = index.fieldDocFreq.breadcrumb.get(termLower) || 1;
      
      weightedTermFreq += breadcrumbTermFreq * (weights.breadcrumb || 1);
      combinedDocFreq = Math.max(combinedDocFreq, breadcrumbDocFreq);
    }
    
    // Apply BM25 formula to the weighted term frequency
    if (weightedTermFreq > 0 && combinedDocFreq > 0) {
      const idf = Math.log((totalDocs - combinedDocFreq + 0.5) / (combinedDocFreq + 0.5) + 1);
      const norm = 1 - b + b * (docLength / avgDocLength);
      const bm25f = idf * ((weightedTermFreq * (k1 + 1)) / (weightedTermFreq + k1 * norm));
      totalScore += bm25f;
    }
  }
  
  return totalScore;
}

// Helper function to count term frequency in text
function countTermFrequency(text: string, term: string): number {
  if (!text || !term) return 0;
  const words = text.split(/\s+/);
  let count = 0;
  for (const word of words) {
    if (word === term) count++;
  }
  return count;
}

// Tokenize text using the same pipeline as the index
function tokenizeForPhraseMatching(text: string): string[] {
  if (!text) return [];
  // Use simple split for phrase matching (no stop word removal or stemming)
  return text.toLowerCase().split(/\s+/).filter(t => t.length > 0);
}

// Check if a phrase (array of tokens) exists as contiguous sequence in text
function hasPhraseMatch(textTokens: string[], phraseTokens: string[]): boolean {
  if (phraseTokens.length === 0) return true;
  if (phraseTokens.length > textTokens.length) return false;
  
  for (let i = 0; i <= textTokens.length - phraseTokens.length; i++) {
    let match = true;
    for (let j = 0; j < phraseTokens.length; j++) {
      if (textTokens[i + j] !== phraseTokens[j]) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
}

// Snippet/highlight generation helper
/**
 * Generate a text snippet around match positions with highlights
 * @param record The index record containing the text
 * @param matches Array of MatchSpan objects with start/end positions
 * @param contextChars Number of characters to include around each match (default 60)
 * @returns Truncated excerpt with match boundaries marked using <mark> tags
 */
export function getSnippet(record: IndexRecord, matches: MatchSpan[], contextChars = 60): string {
  if (!record || !matches || matches.length === 0) return '';
  
  const text = record.bodyText || record.headingText || '';
  if (!text) return '';
  
  // If no specific matches, return first part of text
  if (matches.length === 0) {
    return text.slice(0, contextChars * 2) + (text.length > contextChars * 2 ? '...' : '');
  }
  
  // Sort matches by start position
  const sortedMatches = [...matches].sort((a, b) => a.start - b.start);
  
  // Find the best match (longest match or first one)
  let bestMatch = sortedMatches[0];
  for (const match of sortedMatches) {
    if (match.end - match.start > bestMatch.end - bestMatch.start) {
      bestMatch = match;
    }
  }
  
  const matchStart = bestMatch.start;
  const matchEnd = bestMatch.end;
  
  // Calculate snippet boundaries
  let start = Math.max(0, matchStart - contextChars);
  let end = Math.min(text.length, matchEnd + contextChars);
  
  // Adjust start if we're at the beginning
  if (start === 0) {
    end = Math.min(text.length, matchEnd + contextChars * 2);
  }
  
  // Adjust end if we're at the end
  if (end === text.length) {
    start = Math.max(0, matchStart - contextChars * 2);
  }
  
  const snippetText = text.slice(start, end);
  
  // Add ellipsis if we're not at the beginning or end
  const prefix = start > 0 ? '...' : '';
  const suffix = end < text.length ? '...' : '';
  
  // Find the match position within the snippet
  const snippetMatchStart = matchStart - start;
  const snippetMatchEnd = matchEnd - start;
  
  // Create the highlighted snippet
  const beforeMatch = snippetText.slice(0, snippetMatchStart);
  const matchText = snippetText.slice(snippetMatchStart, snippetMatchEnd);
  const afterMatch = snippetText.slice(snippetMatchEnd);
  
  return prefix + beforeMatch + '<mark>' + matchText + '</mark>' + afterMatch + suffix;
}

// Calculate proximity score for multiple terms in text
// Returns a bonus multiplier based on how close the terms are to each other
function calculateProximityBonus(textTokens: string[], queryTokens: string[]): number {
  if (queryTokens.length <= 1) return 1.0; // No bonus for single term
  
  // Find all positions where each query term appears
  const termPositions: Map<string, number[]> = new Map();
  for (let i = 0; i < textTokens.length; i++) {
    const token = textTokens[i];
    if (queryTokens.includes(token)) {
      if (!termPositions.has(token)) {
        termPositions.set(token, []);
      }
      termPositions.get(token)!.push(i);
    }
  }
  
  // For each query term, find its closest neighbor
  let totalProximity = 0;
  let pairCount = 0;
  
  for (let i = 0; i < queryTokens.length; i++) {
    for (let j = i + 1; j < queryTokens.length; j++) {
      const term1 = queryTokens[i];
      const term2 = queryTokens[j];
      
      const positions1 = termPositions.get(term1) || [];
      const positions2 = termPositions.get(term2) || [];
      
      if (positions1.length === 0 || positions2.length === 0) continue;
      
      // Find minimum distance between any occurrence of term1 and term2
      let minDistance = Infinity;
      for (const pos1 of positions1) {
        for (const pos2 of positions2) {
          const distance = Math.abs(pos1 - pos2);
          if (distance < minDistance) {
            minDistance = distance;
          }
        }
      }
      
      if (minDistance !== Infinity) {
        // Convert distance to bonus: closer terms get higher bonus
        // Max bonus of 2.0 for adjacent terms (distance = 1)
        // Linear falloff: bonus = 2.0 - (distance * 0.1)
        const bonus = Math.max(1.0, 2.0 - (minDistance * 0.1));
        totalProximity += bonus;
        pairCount++;
      }
    }
  }
  
  // Return average bonus across all term pairs
  return pairCount > 0 ? 1.0 + (totalProximity - pairCount) / pairCount : 1.0;
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
  const useBM25F = options?.scoringAlgorithm === 'bm25f';
  
  // Get BM25F config options or use defaults
  const bm25fConfig = options?.bm25fOptions || { k1: 1.5, b: 0.75 };

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

  // BM25F scoring - score all records using field-weighted BM25
  if (useBM25F && scores.size === 0) {
    const queryTerms = normalizedQ.toLowerCase().split(/\s+/);
    for (const record of index.allSections) {
      const score = bm25fScore(record, queryTerms, index, weights, bm25fConfig.k1, bm25fConfig.b);
      if (score > 0) {
        addScore(record, score * 100, 'bm25f', 0, Math.min(normalizedQ.length, record.headingText.length + record.bodyText.length));
      }
    }
  }

  // Apply proximity bonus for multi-term queries
  if (scores.size > 0) {
    const queryTerms = normalizedQ.toLowerCase().split(/\s+/);
    if (queryTerms.length > 1) {
      for (const [record, score] of scores.entries()) {
        const headingTokens = tokenizeForPhraseMatching(record.headingText);
        const bodyTokens = tokenizeForPhraseMatching(record.bodyText);
        
        // Check if all query terms appear in either heading or body
        const allTermsInHeading = queryTerms.every(term => headingTokens.includes(term));
        const allTermsInBody = queryTerms.every(term => bodyTokens.includes(term));
        
        if (allTermsInHeading || allTermsInBody) {
          // Calculate proximity bonus
          const combinedTokens = [...headingTokens, ...bodyTokens];
          const proximityBonus = calculateProximityBonus(combinedTokens, queryTerms);
          
          // Apply bonus to existing score
          scores.set(record, score * proximityBonus);
        }
        
        // Check for exact phrase match and give additional bonus
        if (hasPhraseMatch(headingTokens, queryTerms) || hasPhraseMatch(bodyTokens, queryTerms)) {
          scores.set(record, score * 1.5); // 50% bonus for exact phrase match
        }
      }
    }
  }

  // Apply popularity boosts if enabled
  if (options?.trackPopularity) {
    const boostFactor = options.popularityBoost || 1.2; // Default 20% boost
    for (const [record, score] of scores.entries()) {
      const key = `${normalizedQ.toLowerCase()}||${record.id}`;
      const popularity = index.queryPopularity.get(key);
      if (popularity) {
        // Apply multiplicative boost based on popularity count
        const popularityBoost = 1 + ((popularity.count - 1) * 0.1); // 10% per additional click, max at 2x
        scores.set(record, score * popularityBoost * boostFactor);
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

  // Apply MMR (Maximal Marginal Relevance) for result diversity if enabled
  if (options?.diversify) {
    const lambda = options.mmrLambda ?? 0.5; // Default 50% diversity
    sortedEntries = applyMMR(sortedEntries, lambda);
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

  // Invalidate only queries affected by this mutation
  invalidateAffectedQueries(index, record.id, record.headingText, record.bodyText);

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

  // Remove from trie
  trieDelete(index.headingTrie, headingLower, id);
  const normalizedHeading = record.headingText.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (normalizedHeading !== headingLower) {
    trieDelete(index.headingTrie, normalizedHeading, id);
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
  // First, remove the old record and invalidate affected queries
  removeFromIndex(index, record.id);
  
  // Then add the updated record
  addToIndex(index, [record]);
  
  // Since we've replaced the record, we need to invalidate queries that might now match
  // the updated content (the remove already handled invalidation, but add might introduce new matches)
  // For simplicity, we'll invalidate queries that match the new record's tokens
  invalidateAffectedQueries(index, record.id, record.headingText, record.bodyText);
}

// Serialize index to JSON string
// Note: trie is not serialized as it can be rebuilt from headingIndex on load
export function serializeIndex(index: SearchIndex): string {
  const serializable = {
    allSections: index.allSections,
    headingIndex: Array.from(index.headingIndex.entries()),
    headingIds: Array.from(index.headingIds.entries()),
    bodyIndex: Array.from(index.bodyIndex.entries()),
    docFrequency: Array.from(index.docFrequency.entries()),
    fieldDocFreq: {
      headingText: Array.from(index.fieldDocFreq.headingText.entries()),
      bodyText: Array.from(index.fieldDocFreq.bodyText.entries()),
      label: Array.from(index.fieldDocFreq.label.entries()),
      breadcrumb: Array.from(index.fieldDocFreq.breadcrumb.entries()),
    },
    totalDocs: index.totalDocs,
    popularQueries: index.popularQueries,
    queryPopularity: Array.from(index.queryPopularity.entries()),
    version: index.version,
  };
  return JSON.stringify(serializable);
}

// Deserialize index from JSON string with migration support
export function deserializeIndex(json: string): SearchIndex {
  const parsed = JSON.parse(json);
  
  // Migrate old index format to new format with fieldDocFreq
  const fieldDocFreq: FieldDocFreq = {
    headingText: new Map(),
    bodyText: new Map(),
    label: new Map(),
    breadcrumb: new Map(),
  };
  
  // Load query popularity data if present
  const queryPopularity = new Map<string, PopularityEntry>();
  if (parsed.queryPopularity && Array.isArray(parsed.queryPopularity)) {
    for (const [key, value] of parsed.queryPopularity) {
      if (typeof value === 'object' && value !== null) {
        queryPopularity.set(key, value as PopularityEntry);
      }
    }
  }
  
  // If old format (no fieldDocFreq), we need to rebuild it from docFrequency
  // This is a one-time migration that will happen on first load
  if (!parsed.fieldDocFreq) {
    // We can't perfectly reconstruct fieldDocFreq from the old format,
    // but we can approximate by using docFrequency for all fields
    if (parsed.docFrequency) {
      for (const [term, freq] of parsed.docFrequency) {
        // Distribute the frequency across fields (this is an approximation)
        fieldDocFreq.bodyText.set(term, freq);
        fieldDocFreq.headingText.set(term, Math.floor(freq * 0.3));
        fieldDocFreq.label.set(term, Math.floor(freq * 0.1));
        fieldDocFreq.breadcrumb.set(term, Math.floor(freq * 0.1));
      }
    }
  } else {
    // New format - load fieldDocFreq from parsed data
    fieldDocFreq.headingText = new Map(parsed.fieldDocFreq.headingText ?? []);
    fieldDocFreq.bodyText = new Map(parsed.fieldDocFreq.bodyText ?? []);
    fieldDocFreq.label = new Map(parsed.fieldDocFreq.label ?? []);
    fieldDocFreq.breadcrumb = new Map(parsed.fieldDocFreq.breadcrumb ?? []);
  }
  
  // Rebuild trie from headingIndex data for backward compatibility
  const headingTrie = createTrieNode();
  
  // If we have headingIndex data, rebuild the trie
  if (parsed.headingIndex && Array.isArray(parsed.headingIndex)) {
    const headingIndexMap = new Map(parsed.headingIndex as [string, IndexRecord[]][]);
    const seenRecords = new Set<string>();
    for (const [prefix, records] of headingIndexMap.entries()) {
      if (prefix.length >= 2 && Array.isArray(records)) { // Only prefixes of length 2+ as per original implementation
        for (const record of records) {
          if (seenRecords.has(record.id)) continue;
          seenRecords.add(record.id);
          // Insert each record's full heading into the trie
          const headingLower = record.headingText.toLowerCase();
          trieInsert(headingTrie, headingLower, record);
          
          // Also insert normalized version
          const normalizedHeading = headingLower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          if (normalizedHeading !== headingLower) {
            trieInsert(headingTrie, normalizedHeading, record);
          }
        }
      }
    }
  } else {
    // If no headingIndex, rebuild from allSections
    const allSections = parsed.allSections ?? [];
    for (const record of allSections) {
      const headingLower = record.headingText.toLowerCase();
      trieInsert(headingTrie, headingLower, record);
      
      const normalizedHeading = headingLower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (normalizedHeading !== headingLower) {
        trieInsert(headingTrie, normalizedHeading, record);
      }
    }
  }
  
  return {
    allSections: parsed.allSections ?? [],
    headingIndex: new Map(parsed.headingIndex ?? []),
    headingIds: new Map(parsed.headingIds ?? []),
    bodyIndex: new Map(parsed.bodyIndex ?? []),
    queryCache: new Map(),
    popularQueries: parsed.popularQueries ?? [],
    docFrequency: new Map(parsed.docFrequency ?? []),
    fieldDocFreq,
    totalDocs: parsed.totalDocs ?? 0,
    queryPopularity,
    version: parsed.version ?? 1,
    headingTrie,
  };
}

// Suggest function for autocomplete - returns unique headings matching query prefix
export function suggest(query: string, index: SearchIndex, limit: number = 10): string[] {
  const q = query.trim().toLowerCase();
  if (!q || q.length < 2) return [];

  const suggestions: string[] = [];
  const seen = new Set<string>();

  // Get candidates from trie (new efficient method)
  const trieCandidates = triePrefixQuery(index.headingTrie, q);
  for (const record of trieCandidates) {
    if (suggestions.length >= limit) break;
    const heading = record.headingText;
    if (!seen.has(heading)) {
      seen.add(heading);
      suggestions.push(heading);
    }
  }

  // Fallback to old method for backward compatibility if trie doesn't have results
  if (suggestions.length < limit) {
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
export function trackQuery(index: SearchIndex, query: string, selectedId?: string): void {
  const q = query.trim();
  if (!q) return;

  // Add to ring buffer (keep last 100)
  if (index.popularQueries.length >= 100) {
    index.popularQueries.shift();
  }
  index.popularQueries.push(q);

  // If a selected record ID is provided and popularity tracking is enabled,
  // store the (query, recordId) pair for future ranking boosts
  if (selectedId) {
    const key = `${q}||${selectedId}`; // Use double pipe as separator
    const existing = index.queryPopularity.get(key);
    if (existing) {
      existing.count++;
    } else {
      index.queryPopularity.set(key, {
        query: q,
        recordId: selectedId,
        count: 1,
      });
    }
  }
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
