/**
 * @file Search index data structure and search algorithms.
 * Provides in-memory search indexing with fuzzy matching and result ranking.
 */

import { IndexRecord } from './types.js';

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

export function searchSections(
  query: string,
  index: SearchIndex,
  limit = 8
): IndexRecord[] {
  const q = query.trim().toLowerCase();

  if (!q) {
    return index.allSections.slice(0, limit);
  }

  const scores = new Map<IndexRecord, number>();

  const addScore = (record: IndexRecord, score: number) => {
    scores.set(record, (scores.get(record) ?? 0) + score);
  };

  const exact = index.headingIds.get(q);
  if (exact) {
    for (const record of exact) {
      addScore(record, 100);
    }
  }

  const prefix = index.headingIndex.get(q);
  if (prefix) {
    for (const record of prefix) {
      addScore(record, 50);
    }
  }

  const words = q.split(/\s+/);

  for (const word of words) {
    const bodyMatches = index.bodyIndex.get(word);
    if (bodyMatches) {
      for (const record of bodyMatches) {
        addScore(record, 20);
      }
    }
  }

  if (scores.size === 0) {
    for (const record of index.allSections) {
      const heading = record.headingText.toLowerCase();
      const body = record.bodyText.toLowerCase();

      if (heading.includes(q)) {
        addScore(record, 40);
      } else if (body.includes(q)) {
        addScore(record, 10);
      }
    }
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([record]) => record)
    .slice(0, limit);
}