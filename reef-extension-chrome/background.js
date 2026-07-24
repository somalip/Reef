// src/search-index.ts
function createTrieNode() {
  return {
    children: /* @__PURE__ */ new Map(),
    records: []
  };
}
function trieInsert(root, text, record) {
  let current = root;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (!current.children.has(char)) {
      current.children.set(char, createTrieNode());
    }
    current = current.children.get(char);
    if (!current.records.some((r) => r.id === record.id)) {
      current.records.push(record);
    }
  }
}
function triePrefixQuery(root, prefix) {
  let current = root;
  for (let i = 0; i < prefix.length; i++) {
    const char = prefix[i];
    if (!current.children.has(char)) {
      return [];
    }
    current = current.children.get(char);
  }
  return [...current.records];
}
function jaccardSimilarity(tokens1, tokens2) {
  if (tokens1.size === 0 || tokens2.size === 0) return 0;
  let intersection = 0;
  for (const token of tokens1) {
    if (tokens2.has(token)) intersection++;
  }
  const union = tokens1.size + tokens2.size - intersection;
  return intersection / union;
}
function extractTokensForMMR(text) {
  const tokens = text.toLowerCase().split(/\s+/);
  return new Set(tokens.filter((t) => t.length > 2));
}
function applyMMR(scoredEntries, lambda = 0.5) {
  if (scoredEntries.length <= 1) return scoredEntries;
  const results = [];
  const selectedTokens = [];
  const sortedByScore = [...scoredEntries].sort((a, b) => b[1] - a[1]);
  results.push(sortedByScore[0]);
  selectedTokens.push(extractTokensForMMR(sortedByScore[0][0].headingText + " " + sortedByScore[0][0].bodyText));
  for (let i = 1; i < sortedByScore.length; i++) {
    const [record, originalScore] = sortedByScore[i];
    const recordText = record.headingText + " " + record.bodyText;
    const recordTokens = extractTokensForMMR(recordText);
    let maxSimilarity = 0;
    for (const selectedTokenSet of selectedTokens) {
      const similarity = jaccardSimilarity(recordTokens, selectedTokenSet);
      maxSimilarity = Math.max(maxSimilarity, similarity);
    }
    const mmrScore = (1 - lambda) * originalScore + lambda * (1 - maxSimilarity);
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
function createSearchIndex() {
  return {
    headingIndex: /* @__PURE__ */ new Map(),
    headingIds: /* @__PURE__ */ new Map(),
    bodyIndex: /* @__PURE__ */ new Map(),
    allSections: [],
    queryCache: /* @__PURE__ */ new Map(),
    popularQueries: [],
    docFrequency: /* @__PURE__ */ new Map(),
    fieldDocFreq: {
      headingText: /* @__PURE__ */ new Map(),
      bodyText: /* @__PURE__ */ new Map(),
      label: /* @__PURE__ */ new Map(),
      breadcrumb: /* @__PURE__ */ new Map()
    },
    totalDocs: 0,
    queryPopularity: /* @__PURE__ */ new Map(),
    version: 1,
    headingTrie: createTrieNode()
  };
}
function addToIndex(index, records, tokenizePipeline) {
  index.totalDocs += records.length;
  for (const record of records) {
    const headingLower = record.headingText.toLowerCase();
    if (headingLower.length >= 2) {
      const existing = index.headingIds.get(headingLower) ?? [];
      existing.push(record);
      index.headingIds.set(headingLower, existing);
      const normalizedHeading2 = headingLower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (normalizedHeading2 !== headingLower) {
        const normalizedExisting = index.headingIds.get(normalizedHeading2) ?? [];
        normalizedExisting.push(record);
        index.headingIds.set(normalizedHeading2, normalizedExisting);
      }
    }
    for (let i = 2; i <= headingLower.length; i++) {
      const prefix = headingLower.slice(0, i);
      const existing = index.headingIndex.get(prefix) ?? [];
      existing.push(record);
      index.headingIndex.set(prefix, existing);
    }
    const normalizedHeading = headingLower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    for (let i = 2; i <= normalizedHeading.length; i++) {
      const prefix = normalizedHeading.slice(0, i);
      if (prefix !== headingLower.slice(0, i)) {
        const existing = index.headingIndex.get(prefix) ?? [];
        existing.push(record);
        index.headingIndex.set(prefix, existing);
      }
    }
    trieInsert(index.headingTrie, headingLower, record);
    if (normalizedHeading !== headingLower) {
      trieInsert(index.headingTrie, normalizedHeading, record);
    }
    const bodyLower = record.bodyText.toLowerCase();
    const bodyWords = bodyLower.split(/\s+/);
    for (const word of bodyWords) {
      if (word.length >= 3) {
        const existing = index.bodyIndex.get(word) ?? [];
        existing.push(record);
        index.bodyIndex.set(word, existing);
        const normalizedWord = word.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (normalizedWord !== word) {
          const normalizedExisting = index.bodyIndex.get(normalizedWord) ?? [];
          normalizedExisting.push(record);
          index.bodyIndex.set(normalizedWord, normalizedExisting);
        }
      }
    }
    for (const word of bodyWords) {
      if (word.length >= 2) {
        const currentFreq = index.docFrequency.get(word) ?? 0;
        index.docFrequency.set(word, currentFreq + 1);
        const currentBodyFreq = index.fieldDocFreq.bodyText.get(word) ?? 0;
        index.fieldDocFreq.bodyText.set(word, currentBodyFreq + 1);
      }
    }
    const headingWords = headingLower.split(/\s+/);
    for (const word of headingWords) {
      if (word.length >= 2) {
        const currentHeadingFreq = index.fieldDocFreq.headingText.get(word) ?? 0;
        index.fieldDocFreq.headingText.set(word, currentHeadingFreq + 1);
      }
    }
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
    if (record.label) {
      const labelLower = record.label.toLowerCase();
      if (labelLower.length >= 2) {
        const existing = index.bodyIndex.get(labelLower) ?? [];
        existing.push(record);
        index.bodyIndex.set(labelLower, existing);
      }
    }
    if (record.type === "structured" && record.structuredData) {
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
  index.allSections.push(...records);
}
function levenshteinDistance(a, b) {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = new Array(n + 1);
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
var DEFAULT_WEIGHTS = {
  headingText: 2,
  bodyText: 1,
  label: 1.5,
  breadcrumb: 0.5
};
function getLengthNorm(textLength, avgLength = 50) {
  const norm = 1 - Math.exp(-textLength / avgLength);
  return Math.max(0, Math.min(1, norm));
}
function findMatchPositions(text, query) {
  const positions = [];
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
function parseExtendedQuery(query) {
  const tokens = tokenizeExtendedQuery(query);
  return buildQueryTree(tokens);
}
function tokenizeExtendedQuery(query) {
  const tokens = [];
  let rest = query;
  const exactRegex = /'([^']+)'/g;
  const excludeRegex = /!(\S+)/g;
  const prefixRegex = /\^(\S+)/g;
  const suffixRegex = /(\S+)\$/g;
  while (rest.length > 0) {
    let matched = false;
    const exactMatch = exactRegex.exec(rest);
    if (exactMatch && exactMatch.index === 0) {
      tokens.push({ type: "exact", value: exactMatch[1] });
      rest = rest.slice(exactMatch[0].length);
      matched = true;
      continue;
    }
    const excludeMatch = excludeRegex.exec(rest);
    if (excludeMatch && excludeMatch.index === 0) {
      tokens.push({ type: "exclude", value: excludeMatch[1] });
      rest = rest.slice(excludeMatch[0].length);
      matched = true;
      continue;
    }
    const prefixMatch = prefixRegex.exec(rest);
    if (prefixMatch && prefixMatch.index === 0) {
      tokens.push({ type: "prefix", value: prefixMatch[1] });
      rest = rest.slice(prefixMatch[0].length);
      matched = true;
      continue;
    }
    const suffixMatch = suffixRegex.exec(rest);
    if (suffixMatch && suffixMatch.index === 0) {
      tokens.push({ type: "suffix", value: suffixMatch[1] });
      rest = rest.slice(suffixMatch[0].length);
      matched = true;
      continue;
    }
    const pipeMatch = rest.match(/^\|/);
    if (pipeMatch) {
      tokens.push({ type: "or", value: "|" });
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
      const fieldMatch = wordMatch[1].match(/^([\w-]+):(.+)$/);
      tokens.push({ type: "term", value: fieldMatch ? `${fieldMatch[1]}:${fieldMatch[2]}` : wordMatch[1] });
      rest = rest.slice(wordMatch[0].length);
      matched = true;
    }
  }
  return tokens;
}
function buildQueryTree(tokens) {
  const result = { type: "and", children: [] };
  let currentOr = null;
  for (const token of tokens) {
    if (token.type === "or") {
      if (!currentOr) {
        currentOr = { type: "or", children: [] };
        result.children.push(currentOr);
      }
    } else {
      if (currentOr) {
        result.children.push(currentOr);
        currentOr = null;
      }
      result.children.push({ type: token.type, value: token.value });
    }
  }
  if (currentOr) {
    result.children.push(currentOr);
  }
  return result;
}
function getFuzzyCandidates(query, index, distance) {
  const candidates = /* @__PURE__ */ new Set();
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
function matchExtendedNode(node, record) {
  switch (node.type) {
    case "term":
      const fieldMatch = node.value.match(/^([\w-]+):(.+)$/);
      const searchTerm = (fieldMatch ? fieldMatch[2] : node.value).toLowerCase();
      const field = fieldMatch?.[1].toLowerCase();
      const values = field === "title" || field === "heading" ? [record.headingText] : field === "body" ? [record.bodyText] : field === "label" ? [record.label ?? ""] : field === "breadcrumb" ? [record.breadcrumb] : field === "type" ? [record.type] : [record.headingText, record.bodyText, record.label ?? "", record.breadcrumb];
      return values.some((value) => value.toLowerCase().includes(searchTerm));
    case "exact":
      const exactTerm = node.value.toLowerCase();
      const phraseTokens = tokenizeForPhraseMatching(exactTerm);
      const headingTokens = tokenizeForPhraseMatching(record.headingText);
      const bodyTokens = tokenizeForPhraseMatching(record.bodyText);
      return hasPhraseMatch(headingTokens, phraseTokens) || hasPhraseMatch(bodyTokens, phraseTokens);
    case "exclude":
      const excludeTerm = node.value.toLowerCase();
      return !record.headingText.toLowerCase().includes(excludeTerm) && !record.bodyText.toLowerCase().includes(excludeTerm);
    case "prefix":
      const prefixTerm = node.value.toLowerCase();
      return record.headingText.toLowerCase().startsWith(prefixTerm) || record.bodyText.toLowerCase().startsWith(prefixTerm);
    case "suffix":
      const suffixTerm = node.value.toLowerCase();
      return record.headingText.toLowerCase().endsWith(suffixTerm) || record.bodyText.toLowerCase().endsWith(suffixTerm);
    case "and":
      return node.children.every((child) => matchExtendedNode(child, record));
    case "or":
      return node.children.some((child) => matchExtendedNode(child, record));
  }
}
function bm25Score(termFreq, docFreq, totalDocs, docLength, avgDocLength, k1 = 1.5, b = 0.75) {
  const idf = Math.log((totalDocs - docFreq + 0.5) / (docFreq + 0.5) + 1);
  const norm = 1 - b + b * (docLength / avgDocLength);
  return idf * (termFreq * (k1 + 1) / (termFreq + k1 * norm));
}
function bm25fScore(record, queryTerms, index, weights, k1 = 1.5, b = 0.75) {
  const avgDocLength = getAvgDocLength(index);
  const totalDocs = index.totalDocs;
  const docLength = record.headingText.length * (weights.headingText || 1) + record.bodyText.length * (weights.bodyText || 1) + (record.label ? record.label.length * (weights.label || 1) : 0) + (record.breadcrumb ? record.breadcrumb.length * (weights.breadcrumb || 1) : 0);
  let totalScore = 0;
  for (const term of queryTerms) {
    const termLower = term.toLowerCase();
    let weightedTermFreq = 0;
    let combinedDocFreq = 0;
    if (weights.headingText) {
      const headingText = record.headingText.toLowerCase();
      const headingTermFreq = countTermFrequency(headingText, termLower);
      const headingDocFreq = index.fieldDocFreq.headingText.get(termLower) || 1;
      weightedTermFreq += headingTermFreq * (weights.headingText || 1);
      combinedDocFreq = Math.max(combinedDocFreq, headingDocFreq);
    }
    if (weights.bodyText) {
      const bodyText = record.bodyText.toLowerCase();
      const bodyTermFreq = countTermFrequency(bodyText, termLower);
      const bodyDocFreq = index.fieldDocFreq.bodyText.get(termLower) || 1;
      weightedTermFreq += bodyTermFreq * (weights.bodyText || 1);
      combinedDocFreq = Math.max(combinedDocFreq, bodyDocFreq);
    }
    if (record.label && weights.label) {
      const labelText = record.label.toLowerCase();
      const labelTermFreq = countTermFrequency(labelText, termLower);
      const labelDocFreq = index.fieldDocFreq.label.get(termLower) || 1;
      weightedTermFreq += labelTermFreq * (weights.label || 1);
      combinedDocFreq = Math.max(combinedDocFreq, labelDocFreq);
    }
    if (record.breadcrumb && weights.breadcrumb) {
      const breadcrumbText = record.breadcrumb.toLowerCase();
      const breadcrumbTermFreq = countTermFrequency(breadcrumbText, termLower);
      const breadcrumbDocFreq = index.fieldDocFreq.breadcrumb.get(termLower) || 1;
      weightedTermFreq += breadcrumbTermFreq * (weights.breadcrumb || 1);
      combinedDocFreq = Math.max(combinedDocFreq, breadcrumbDocFreq);
    }
    if (weightedTermFreq > 0 && combinedDocFreq > 0) {
      const idf = Math.log((totalDocs - combinedDocFreq + 0.5) / (combinedDocFreq + 0.5) + 1);
      const norm = 1 - b + b * (docLength / avgDocLength);
      const bm25f = idf * (weightedTermFreq * (k1 + 1) / (weightedTermFreq + k1 * norm));
      totalScore += bm25f;
    }
  }
  return totalScore;
}
function countTermFrequency(text, term) {
  if (!text || !term) return 0;
  const words = text.split(/\s+/);
  let count = 0;
  for (const word of words) {
    if (word === term) count++;
  }
  return count;
}
function tokenizeForPhraseMatching(text) {
  if (!text) return [];
  return text.toLowerCase().split(/\s+/).filter((t) => t.length > 0);
}
function hasPhraseMatch(textTokens, phraseTokens) {
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
function calculateProximityBonus(textTokens, queryTokens) {
  if (queryTokens.length <= 1) return 1;
  const termPositions = /* @__PURE__ */ new Map();
  for (let i = 0; i < textTokens.length; i++) {
    const token = textTokens[i];
    if (queryTokens.includes(token)) {
      if (!termPositions.has(token)) {
        termPositions.set(token, []);
      }
      termPositions.get(token).push(i);
    }
  }
  let totalProximity = 0;
  let pairCount = 0;
  for (let i = 0; i < queryTokens.length; i++) {
    for (let j = i + 1; j < queryTokens.length; j++) {
      const term1 = queryTokens[i];
      const term2 = queryTokens[j];
      const positions1 = termPositions.get(term1) || [];
      const positions2 = termPositions.get(term2) || [];
      if (positions1.length === 0 || positions2.length === 0) continue;
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
        const bonus = Math.max(1, 2 - minDistance * 0.1);
        totalProximity += bonus;
        pairCount++;
      }
    }
  }
  return pairCount > 0 ? 1 + (totalProximity - pairCount) / pairCount : 1;
}
function getAvgDocLength(index) {
  if (index.allSections.length === 0) return 50;
  const total = index.allSections.reduce((sum, r) => sum + r.bodyText.length + r.headingText.length, 0);
  return total / index.allSections.length;
}
function getCachedShortlist(query, index) {
  const cached = index.queryCache.get(query);
  if (cached) {
    const candidates = /* @__PURE__ */ new Set();
    for (const id of cached.resultIds) {
      const record = index.allSections.find((r) => r.id === id);
      if (record) candidates.add(record);
    }
    return candidates;
  }
  return null;
}
function cacheShortlist(query, records, index) {
  const entry = {
    resultIds: records.map((r) => r.id),
    timestamp: Date.now()
  };
  index.queryCache.set(query, entry);
  if (index.queryCache.size > 100) {
    const firstKey = index.queryCache.keys().next().value;
    if (firstKey !== void 0) {
      index.queryCache.delete(firstKey);
    }
  }
}
function searchSections(query, index, limitOrOptions) {
  let limit = 8;
  let options;
  if (typeof limitOrOptions === "number") {
    limit = limitOrOptions;
  } else if (limitOrOptions) {
    options = limitOrOptions;
    limit = limitOrOptions.limit ?? 8;
  }
  const q = query.trim();
  if (!q) {
    return index.allSections.slice(0, limit);
  }
  const normalizedQ = q.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const scores = /* @__PURE__ */ new Map();
  const matches = /* @__PURE__ */ new Map();
  const weights = { ...DEFAULT_WEIGHTS, ...options?.weights ?? {} };
  const avgLength = getAvgDocLength(index);
  const addScore = (record, score, key, start, end) => {
    scores.set(record, (scores.get(record) ?? 0) + score);
    const recordMatches = matches.get(record) ?? [];
    recordMatches.push({ key, start, end });
    matches.set(record, recordMatches);
  };
  const useBM25 = options?.scoringAlgorithm === "bm25";
  const useBM25F = options?.scoringAlgorithm === "bm25f";
  const bm25fConfig = options?.bm25fOptions || { k1: 1.5, b: 0.75 };
  const cached = getCachedShortlist(normalizedQ.toLowerCase(), index);
  const searchPool = cached ? [...cached] : index.allSections;
  const exact = index.headingIds.get(normalizedQ.toLowerCase()) ?? index.headingIds.get(q.toLowerCase());
  if (exact) {
    for (const record of exact) {
      const fieldWeight = weights.headingText ?? 1;
      const lengthNorm = getLengthNorm(record.headingText.length);
      let score;
      if (useBM25) {
        const termFreq = 1;
        const docFreq = index.docFrequency.get(normalizedQ.toLowerCase()) ?? 1;
        score = bm25Score(termFreq, docFreq, index.totalDocs, record.headingText.length + record.bodyText.length, avgLength) * 100;
      } else {
        score = 100 * fieldWeight * (1 + lengthNorm);
      }
      addScore(record, score, "headingText", 0, record.headingText.length);
    }
  }
  const prefix = index.headingIndex.get(normalizedQ.toLowerCase()) ?? index.headingIndex.get(q.toLowerCase());
  if (prefix) {
    for (const record of prefix) {
      if (scores.has(record)) continue;
      const fieldWeight = weights.headingText ?? 1;
      const lengthNorm = getLengthNorm(record.headingText.length);
      let score;
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
        addScore(record, score, "headingText", pos.start, pos.end);
      } else {
        addScore(record, score, "headingText", 0, Math.min(q.length, record.headingText.length));
      }
    }
  }
  const words = normalizedQ.toLowerCase().split(/\s+/);
  for (const word of words) {
    const bodyMatches = index.bodyIndex.get(word);
    if (bodyMatches) {
      for (const record of bodyMatches) {
        if (scores.has(record)) continue;
        const fieldWeight = weights.bodyText ?? 1;
        const lengthNorm = getLengthNorm(record.bodyText.length);
        let score;
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
          addScore(record, score, "bodyText", pos.start, pos.end);
        } else {
          addScore(record, score, "bodyText", 0, Math.min(word.length, record.bodyText.length));
        }
      }
    }
  }
  if (useBM25F && scores.size === 0) {
    const queryTerms = normalizedQ.toLowerCase().split(/\s+/);
    for (const record of index.allSections) {
      const score = bm25fScore(record, queryTerms, index, weights, bm25fConfig.k1, bm25fConfig.b);
      if (score > 0) {
        addScore(record, score * 100, "bm25f", 0, Math.min(normalizedQ.length, record.headingText.length + record.bodyText.length));
      }
    }
  }
  if (scores.size > 0) {
    const queryTerms = normalizedQ.toLowerCase().split(/\s+/);
    if (queryTerms.length > 1) {
      for (const [record, score] of scores.entries()) {
        const headingTokens = tokenizeForPhraseMatching(record.headingText);
        const bodyTokens = tokenizeForPhraseMatching(record.bodyText);
        const allTermsInHeading = queryTerms.every((term) => headingTokens.includes(term));
        const allTermsInBody = queryTerms.every((term) => bodyTokens.includes(term));
        if (allTermsInHeading || allTermsInBody) {
          const combinedTokens = [...headingTokens, ...bodyTokens];
          const proximityBonus = calculateProximityBonus(combinedTokens, queryTerms);
          scores.set(record, score * proximityBonus);
        }
        if (hasPhraseMatch(headingTokens, queryTerms) || hasPhraseMatch(bodyTokens, queryTerms)) {
          scores.set(record, score * 1.5);
        }
      }
    }
  }
  if (options?.trackPopularity) {
    const boostFactor = options.popularityBoost || 1.2;
    for (const [record, score] of scores.entries()) {
      const key = `${normalizedQ.toLowerCase()}||${record.id}`;
      const popularity = index.queryPopularity.get(key);
      if (popularity) {
        const popularityBoost = 1 + (popularity.count - 1) * 0.1;
        scores.set(record, score * popularityBoost * boostFactor);
      }
    }
  }
  if (options?.fuzzy) {
    const fuzzyDistance = options.fuzzyDistance ?? 2;
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
            addScore(record, normalizedScore * fieldWeight * (1 + lengthNorm), "headingText", 0, Math.min(q.length, headingLower.length));
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
          addScore(record, normalizedScore * fieldWeight * (1 + lengthNorm), "bodyText", bestStart, bestStart + q.length);
        }
      }
    }
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
          addScore(record, normalizedScore * fieldWeight * (1 + lengthNorm), "headingText", 0, Math.min(q.length, headingLower.length));
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
          addScore(record, normalizedScore * fieldWeight * (1 + lengthNorm), "bodyText", bestStart, bestStart + q.length);
        }
      }
    }
  }
  if ((options?.extended || /\b(?:title|heading|body|label|breadcrumb|type):\S+/i.test(q)) && scores.size === 0) {
    const parsed = parseExtendedQuery(q);
    for (const record of index.allSections) {
      if (matchExtendedNode(parsed, record)) {
        const fieldWeight = weights.headingText ?? 1;
        const lengthNorm = getLengthNorm(record.headingText.length);
        const score = 50 * fieldWeight * (1 + lengthNorm);
        addScore(record, score, "headingText", 0, Math.min(q.length, record.headingText.length));
      }
    }
  }
  let filteredScores = [...scores.entries()];
  if (options?.filter) {
    filteredScores = filteredScores.filter(([record]) => options.filter(record));
  }
  let sortedEntries = filteredScores.sort((a, b) => b[1] - a[1]);
  if (options?.sortFn) {
    sortedEntries = sortedEntries.sort((a, b) => {
      const aMatches = matches.get(a[0]) ?? [];
      const bMatches = matches.get(b[0]) ?? [];
      return options.sortFn({ record: a[0], score: a[1], matches: aMatches }, { record: b[0], score: b[1], matches: bMatches });
    });
  }
  if (options?.diversify) {
    const lambda = options.mmrLambda ?? 0.5;
    sortedEntries = applyMMR(sortedEntries, lambda);
  }
  const topRecords = sortedEntries.slice(0, limit).map(([record]) => record);
  if (options?.typeWeights) {
    const typeBoost = options.typeWeights;
    for (const record of topRecords) {
      const boost = typeBoost[record.type] ?? 1;
      const currentScore = scores.get(record);
      if (currentScore !== void 0 && boost !== 1) {
        scores.set(record, currentScore * boost);
      }
    }
    sortedEntries = [...scores.entries()].sort((a, b) => b[1] - a[1]);
    const boostedRecords = sortedEntries.slice(0, limit).map(([record]) => record);
    cacheShortlist(q.toLowerCase(), boostedRecords, index);
    if (options?.includeScore || options?.includeMatches) {
      return boostedRecords.map((record) => {
        const recordMatches = matches.get(record) ?? [];
        const normalizedScore = scores.get(record) ?? 0;
        const maxScore = useBM25 ? 100 : 200;
        const score = Math.max(0, Math.min(1, 1 - normalizedScore / maxScore));
        return {
          record,
          score,
          matches: options.includeMatches ? recordMatches : void 0
        };
      });
    }
    return boostedRecords;
  }
  cacheShortlist(q.toLowerCase(), topRecords, index);
  if (options?.includeScore || options?.includeMatches) {
    return topRecords.map((record) => {
      const recordMatches = matches.get(record) ?? [];
      const normalizedScore = scores.get(record) ?? 0;
      const maxScore = useBM25 ? 100 : 200;
      const score = Math.max(0, Math.min(1, 1 - normalizedScore / maxScore));
      return {
        record,
        score,
        matches: options.includeMatches ? recordMatches : void 0
      };
    });
  }
  return topRecords;
}
function suggest(query, index, limit = 10) {
  const q = query.trim().toLowerCase();
  if (!q || q.length < 2) return [];
  const suggestions = [];
  const seen = /* @__PURE__ */ new Set();
  const trieCandidates = triePrefixQuery(index.headingTrie, q);
  for (const record of trieCandidates) {
    if (suggestions.length >= limit) break;
    const heading = record.headingText;
    if (!seen.has(heading)) {
      seen.add(heading);
      suggestions.push(heading);
    }
  }
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

// plugin/src/storage.ts
var KEY = {
  bookmarks: "reef.bookmarks",
  snippets: "reef.snippets",
  pageNotes: "reef.pageNotes",
  recents: "reef.recents"
};
function genId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
function storageApi() {
  if (typeof chrome !== "undefined" && chrome.storage?.local) {
    return chrome.storage.local;
  }
  return null;
}
async function getArray(key) {
  const api = storageApi();
  if (!api) return [];
  const data = await api.get([key]);
  return data[key] || [];
}
async function setArray(key, value) {
  const api = storageApi();
  if (!api) return;
  await api.set({ [key]: value });
}
async function createBookmark(input) {
  const now = Date.now();
  const bookmark = { ...input, id: genId(), createdAt: now, updatedAt: now };
  const all = await getArray(KEY.bookmarks);
  all.unshift(bookmark);
  await setArray(KEY.bookmarks, all);
  return bookmark;
}
async function createSnippet(input) {
  const now = Date.now();
  const snippet = { ...input, id: genId(), createdAt: now, updatedAt: now };
  const all = await getArray(KEY.snippets);
  all.unshift(snippet);
  await setArray(KEY.snippets, all);
  return snippet;
}
async function setPageNote(url, text, title) {
  const all = await getArray(KEY.pageNotes);
  const existing = all.findIndex((n) => n.url === url);
  const note = { url, text, title, updatedAt: Date.now() };
  if (existing >= 0) all[existing] = note;
  else all.unshift(note);
  await setArray(KEY.pageNotes, all);
  return note;
}
async function listRecents() {
  return getArray(KEY.recents);
}

// plugin/src/background.ts
var tabIndices = /* @__PURE__ */ new Map();
var siteIndices = /* @__PURE__ */ new Map();
function scoreTab(tab, query, tabIndex) {
  const q = query.toLowerCase();
  const title = (tab.title || "").toLowerCase();
  const url = (tab.url || "").toLowerCase();
  let score = 0;
  if (title === q) score += 100;
  else if (title.startsWith(q)) score += 60;
  else if (title.includes(q)) score += 30;
  if (url.includes(q)) score += 20;
  if (tabIndex) {
    const siteResults = searchSections(tabIndex.index, query, { limit: 5 });
    if (siteResults.length > 0) {
      score += 15;
    }
  }
  if (tab.active) score += 5;
  if (tab.lastAccessed) {
    const age = Date.now() - tab.lastAccessed;
    if (age < 36e5) score += 10;
    else if (age < 864e5) score += 5;
  }
  return score;
}
async function handleSpotlightSearch(message, sender) {
  try {
    const query = message.query.trim();
    const limit = message.limit || 50;
    if (!query) {
      return { success: true, items: [], siteResults: [], actions: [], autocorrected: false };
    }
    const tabs = await chrome.tabs.query({});
    const tabResults = [];
    for (const tab of tabs) {
      if (!tab.id || !tab.url) continue;
      if (tab.url.startsWith("chrome://") || tab.url.startsWith("chrome-extension://")) continue;
      const tabIndex = tabIndices.get(tab.id);
      const score = scoreTab(tab, query, tabIndex);
      if (score > 0 || tabIndex && searchSections(tabIndex.index, query, { limit: 1 }).length > 0) {
        const matchedRecords = tabIndex ? searchSections(tabIndex.index, query, { limit: 5 }).map((r) => r.record) : [];
        tabResults.push({
          tabId: tab.id,
          windowId: tab.windowId,
          title: tab.title || tab.url,
          url: tab.url,
          favIconUrl: tab.favIconUrl,
          score,
          matchedRecords
        });
      }
    }
    tabResults.sort((a, b) => b.score - a.score);
    const items = tabResults.slice(0, limit);
    const siteResults = [];
    for (const [origin, index] of siteIndices.entries()) {
      const results = searchSections(index, query, { limit: 10 });
      for (const result of results) {
        siteResults.push({
          url: result.record.url || "",
          headingText: result.record.headingText || "",
          bodyText: result.record.bodyText || "",
          selector: result.record.selector,
          type: result.record.type || "section",
          score: result.score,
          sourceOrigin: origin
        });
      }
    }
    siteResults.sort((a, b) => b.score - a.score);
    const suggestion = suggest(query, { limit: 1 })[0];
    const autocorrected = suggestion && suggestion !== query.toLowerCase();
    return {
      success: true,
      items,
      siteResults: siteResults.slice(0, 20),
      actions: [],
      suggestion,
      autocorrected: !!autocorrected
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
      items: [],
      siteResults: [],
      actions: [],
      autocorrected: false
    };
  }
}
async function handleTabSwitch(message) {
  try {
    await chrome.tabs.update(message.tabId, { active: true });
    await chrome.windows.update(message.windowId, { focused: true });
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
async function handleSpotlightOpenRecord(message) {
  try {
    const tab = await chrome.tabs.get(message.tabId);
    if (message.record.selector) {
      await chrome.scripting.executeScript({
        target: { tabId: message.tabId },
        func: (selector) => {
          const el = document.querySelector(selector);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.focus();
          }
        },
        args: [message.record.selector]
      });
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
async function handleSpotlightOpenNewTab(message) {
  try {
    await chrome.tabs.create({ url: message.url });
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
async function handleBrowserActionExecute(message) {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.id) {
      return { success: false, error: "no-active-tab" };
    }
    switch (message.action) {
      case "mute-tab":
        await chrome.tabs.update(activeTab.id, { muted: !activeTab.mutedInfo?.muted });
        break;
      case "pin-tab":
        await chrome.tabs.update(activeTab.id, { pinned: !activeTab.pinned });
        break;
      case "duplicate-tab":
        await chrome.tabs.duplicate(activeTab.id);
        break;
      case "reload-tab":
        await chrome.tabs.reload(activeTab.id);
        break;
      case "close-other-tabs": {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        for (const tab of tabs) {
          if (tab.id !== activeTab.id && tab.id !== void 0) {
            await chrome.tabs.remove(tab.id);
          }
        }
        break;
      }
      case "focus-mode": {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        for (const tab of tabs) {
          if (tab.id !== activeTab.id && tab.id !== void 0 && !tab.pinned) {
            await chrome.tabs.remove(tab.id);
          }
        }
        break;
      }
      case "save-session": {
        const tabs = await chrome.tabs.query({ currentWindow: true });
        const sessionTabs = tabs.filter((t) => t.url && !t.url.startsWith("chrome://")).map((t) => ({ url: t.url, title: t.title || "" }));
        const sessions = await chrome.storage.local.get(["reef:sessions"]);
        const sessionList = sessions["reef:sessions"] || [];
        sessionList.unshift({
          id: `session-${Date.now()}`,
          name: `Session ${(/* @__PURE__ */ new Date()).toLocaleString()}`,
          tabs: sessionTabs,
          savedAt: Date.now()
        });
        await chrome.storage.local.set({ "reef:sessions": sessionList.slice(0, 20) });
        break;
      }
      case "bookmark-page": {
        const tab = await chrome.tabs.get(activeTab.id);
        if (tab.url) {
          await chrome.bookmarks.create({ url: tab.url, title: tab.title || tab.url });
        }
        break;
      }
      case "remove-bookmark": {
        const tab = await chrome.tabs.get(activeTab.id);
        if (tab.url) {
          const results = await chrome.bookmarks.search(tab.url);
          for (const bookmark of results) {
            await chrome.bookmarks.remove(bookmark.id);
          }
        }
        break;
      }
      case "new-tab":
        await chrome.tabs.create({});
        break;
      case "close-tab":
        await chrome.tabs.remove(activeTab.id);
        break;
      case "reopen-closed-tab":
        await chrome.tabs.undo();
        break;
      case "go-back":
        await chrome.tabs.goBack(activeTab.id);
        break;
      case "go-forward":
        await chrome.tabs.goForward(activeTab.id);
        break;
      case "toggle-fullscreen":
        await chrome.tabs.sendMessage(activeTab.id, { type: "TOGGLE_FULLSCREEN" });
        break;
      case "new-window":
        await chrome.windows.create();
        break;
      case "new-incognito":
        await chrome.windows.create({ incognito: true });
        break;
      case "zoom-in": {
        const zoom = await chrome.tabs.getZoom(activeTab.id);
        await chrome.tabs.setZoom(activeTab.id, Math.min(zoom + 0.1, 5));
        break;
      }
      case "zoom-out": {
        const zoom = await chrome.tabs.getZoom(activeTab.id);
        await chrome.tabs.setZoom(activeTab.id, Math.max(zoom - 0.1, 0.25));
        break;
      }
      case "zoom-reset":
        await chrome.tabs.setZoom(activeTab.id, 0);
        break;
      case "print-page":
        await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: () => window.print()
        });
        break;
      case "save-page":
        await chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          func: () => {
            const a = document.createElement("a");
            a.href = window.location.href;
            a.download = "";
            a.click();
          }
        });
        break;
      case "open-download":
        if (message.downloadId !== void 0) {
          await chrome.downloads.open(message.downloadId);
        }
        break;
      default:
        return { success: false, error: "unknown-action" };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
async function handleLibraryBookmarkCreate(message) {
  try {
    const bookmark = await createBookmark(message.data);
    return { success: true, bookmark };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
async function handleLibrarySnippetCreate(message) {
  try {
    const snippet = await createSnippet(message.data);
    return { success: true, snippet };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
async function handleLibraryPageNoteSet(message) {
  try {
    const note = await setPageNote(message.url, message.text, message.title);
    return { success: true, note };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
async function handleLibraryRecentsList() {
  try {
    const items = await listRecents();
    return { success: true, items };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
async function handleLibraryOpenRecent(message) {
  try {
    await chrome.tabs.create({ url: message.url });
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
async function handleGetManifest(sender) {
  try {
    if (!sender.tab?.id) {
      return { success: false, error: "no-tab-id" };
    }
    const tab = sender.tab;
    if (!tab.url) {
      return { success: false, error: "no-url" };
    }
    const tabIndex = tabIndices.get(tab.id);
    if (tabIndex) {
      return {
        success: true,
        manifest: {
          url: tabIndex.url,
          title: tabIndex.title,
          records: tabIndex.records
        }
      };
    }
    return { success: false, error: "no-index" };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
async function handleCrawlSite(message) {
  try {
    const allTabs = await chrome.tabs.query({});
    const seedTab = allTabs.find(
      (t) => t.url && t.id && new URL(t.url).origin === message.origin
    );
    if (!seedTab?.id) {
      return { success: false, error: "no-tab-for-origin" };
    }
    const resp = await chrome.tabs.sendMessage(seedTab.id, { type: "GET_MANIFEST" });
    if (resp?.success?.manifest) {
      let siteIndex = siteIndices.get(message.origin);
      if (!siteIndex) {
        siteIndex = createSearchIndex();
        siteIndices.set(message.origin, siteIndex);
      }
      addToIndex(siteIndex, resp.manifest.records);
      return { success: true, recordCount: resp.manifest.records.length };
    } else {
      return { success: false, error: "no-manifest" };
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
async function handleUpdateShortcut(message) {
  try {
    if (chrome.commands?.update) {
      await chrome.commands.update({
        name: message.command,
        shortcut: message.shortcut
      });
      return { success: true };
    } else {
      return {
        success: false,
        error: "commands-update-not-supported",
        message: "Please update shortcuts manually at chrome://extensions/shortcuts"
      };
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
      try {
        switch (message.type) {
          case "SPOTLIGHT_SEARCH":
            sendResponse(await handleSpotlightSearch(message, sender));
            break;
          case "TAB_SWITCH":
            sendResponse(await handleTabSwitch(message));
            break;
          case "SPOTLIGHT_OPEN_RECORD":
            sendResponse(await handleSpotlightOpenRecord(message));
            break;
          case "SPOTLIGHT_OPEN_NEW_TAB":
            sendResponse(await handleSpotlightOpenNewTab(message));
            break;
          case "BROWSER_ACTION_EXECUTE":
            sendResponse(await handleBrowserActionExecute(message));
            break;
          case "LIBRARY_BOOKMARK_CREATE":
            sendResponse(await handleLibraryBookmarkCreate(message));
            break;
          case "LIBRARY_SNIPPET_CREATE":
            sendResponse(await handleLibrarySnippetCreate(message));
            break;
          case "LIBRARY_PAGE_NOTE_SET":
            sendResponse(await handleLibraryPageNoteSet(message));
            break;
          case "LIBRARY_RECENTS_LIST":
            sendResponse(await handleLibraryRecentsList());
            break;
          case "LIBRARY_OPEN_RECENT":
            sendResponse(await handleLibraryOpenRecent(message));
            break;
          case "GET_MANIFEST":
            sendResponse(await handleGetManifest(sender));
            break;
          case "SPOTLIGHT_CRAWL_SITE":
            sendResponse(await handleCrawlSite(message));
            break;
          case "UPDATE_SHORTCUT":
            sendResponse(await handleUpdateShortcut(message));
            break;
          default:
            sendResponse({ success: false, error: "unsupported-message-type" });
        }
      } catch (err) {
        sendResponse({ success: false, error: err instanceof Error ? err.message : String(err) });
      }
    })();
    return true;
  });
}
if (typeof chrome !== "undefined" && chrome.tabs?.onRemoved) {
  chrome.tabs.onRemoved.addListener((tabId) => {
    tabIndices.delete(tabId);
  });
}
if (typeof chrome !== "undefined" && chrome.commands?.onCommand) {
  chrome.commands.onCommand.addListener(async (command) => {
    if (command === "open-popup" || command === "_execute_action") {
      try {
        if (chrome.action?.openPopup) {
          await chrome.action.openPopup();
        } else {
          const views = chrome.extension?.getViews?.({ type: "popup" }) || [];
          if (views[0]?.focus) views[0].focus();
          else if (chrome.windows?.create) {
            const url = chrome.runtime.getURL("src/popup/popup.html");
            await chrome.windows.create({ url, type: "popup", width: 400, height: 560 });
          }
        }
      } catch {
      }
      return;
    }
    if (command !== "open-spotlight") return;
    if (!chrome.tabs?.query) return;
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab?.id) return;
      if (command === "close-tab") {
        await chrome.tabs.remove(activeTab.id);
      } else if (command === "reopen-closed-tab") {
        await chrome.tabs.undo();
      } else if (command === "go-back") {
        await chrome.tabs.goBack(activeTab.id);
      } else if (command === "go-forward") {
        await chrome.tabs.goForward(activeTab.id);
      } else if (command === "toggle-fullscreen") {
        await chrome.tabs.sendMessage(activeTab.id, { type: "TOGGLE_FULLSCREEN" });
      } else {
        await chrome.tabs.sendMessage(activeTab.id, { type: "SHOW_SPOTLIGHT" });
      }
    } catch {
    }
  });
}
//# sourceMappingURL=background.js.map
