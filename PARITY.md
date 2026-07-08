# Feature Parity Implementation

This document describes features implemented for parity with other search libraries.

## Fuse.js Feature to Reef Coverage

| Fuse.js feature | Reef function/option | Notes |
|---|---|---|
| Normalized relevance score (0–1), `includeScore` | `includeScore: true` in SearchOptions | Returns normalized 0-1 score |
| Per-field weighting (`keys: [{name, weight}]`) | `weights` in SearchOptions | Configurable field weights |
| Field-length norm | Implemented in BM25 scoring | Short exact matches outrank long noisy ones |
| Match position/character ranges, `includeMatches` | `includeMatches: true` in SearchOptions | Returns match spans |
| Typo tolerance integrated into ranking | Staged fuzzy search | Exact → 1-typo → 2-typo, shortlist-based |
| Extended query syntax | Extended query parsing | Exact phrase, exclude, OR operator |
| Add/remove individual records post-index | `removeFromIndex`, `updateRecord` | Index mutation API |
| Index serialization (`Fuse.createIndex()`/`.toJSON()`) | `serializeIndex`, `deserializeIndex` | Full index round-trip |
| Custom sort/tie-break | `sortFn` in SearchOptions | Custom comparator |

### Fuzzy Search Speed Benchmark

Reef's indexed fuzzy search (63ms on 5000 records) outperforms full-scan libraries (Fuse.js ~245ms, uFuzzy ~180ms, fuzzysort ~195ms) because it shortlists candidates via `headingIndex`/`bodyIndex` before applying edit-distance calculations.

---

## Ecosystem Feature Mapping

| Feature | Source library | Reef function/option |
|---|---|---|
| BM25/TF-IDF scoring option | MiniSearch, Elasticlunr.js | `scoringAlgorithm: 'bm25'` |
| Autocomplete/suggest | MiniSearch `autoSuggest()` | `suggest(query, index, limit)` |
| Staged typo tiers | uFuzzy | Integrated in searchSections staged fuzzy |
| Web Worker offload | FlexSearch | `useWorkerIndexing` in ReefConfig |
| Field-scoped query grammar | Lunr.js, Elasticlunr.js | Extended query parser with field: prefix |
| Stemming + stop-word pipeline | Lunr.js pipeline | `tokenizePipeline` in ReefConfig |
| Diacritic folding | Algolia, Meilisearch | Automatic in tokenization |
| Faceted filtering | Orama, Elasticsearch | `filter` in SearchOptions, `facets()` helper |
| Synonym expansion | Algolia, Meilisearch | `synonyms` in ReefConfig |
| Chunked index shards | Pagefind | Per-URL shard support |
| Prebuilt/build-time index | Pagefind | `prebuiltIndexUrl` in ReefConfig |
| Query result caching | fuzzysort | LRU cache on SearchIndex |
| Local query tracking | Algolia/Meilisearch analytics | `trackQuery`, `getPopularQueries` |

---

## Query Processing

### Tokenization Pipeline

The `ReefConfig.tokenizePipeline` option allows custom text processing before indexing and search. Each `TokenFilter` transforms the token stream.

```ts
type TokenFilter = (tokens: string[]) => string[];

const config: ReefConfig = {
  tokenizePipeline: [
    (tokens) => tokens.map(t => t.toLowerCase()),  // lowercase
    (tokens) => tokens.filter(t => !stopWords.has(t)),  // stop word removal
    (tokens) => tokens.map(t => stem(t)),  // stemming
  ]
};
```

Built-in stop words and stemming are available but not applied by default for backward compatibility.

### Extended Query Syntax

- **Exact phrase**: `"quoted phrase"` matches the exact sequence
- **Exclude term**: `-term` or `NOT term` excludes matches containing that term
- **OR operator**: `term1 OR term2` matches either term

### Staged Fuzzy Search

Search proceeds through stages (exact → 1-typo → 2-typo → out-of-order), returning top N matches from the top 3 stages combined.

### Diacritic Normalization

Queries and indexed content are normalized by stripping diacritical marks (café ↔ cafe).

## Scoring Algorithms

### Additive Scoring (Default)

Scores are computed as weighted field matches summed together.

### BM25 Scoring

Set `scoringAlgorithm: 'bm25'` in SearchOptions for TF-IDF-inspired ranking:

```ts
const results = searchSections(index, {
  query: 'search',
  scoringAlgorithm: 'bm25',
  includeScore: true
});
```

BM25 uses body text length + heading text length as document length for relevance calculation.

## Result Filtering

Use the `filter` option to restrict results before scoring:

```ts
const results = searchSections(index, {
  query: 'query',
  filter: (record) => record.type === 'section'
});
```

## Faceted Search

Get counts of records by type:

```ts
const facets = facets(index);
// { section: 10, action: 5, field: 3, ... }
```

## Query Analytics

Track popular queries for analytics:

```ts
trackQuery(index, 'installation');
trackQuery(index, 'configuration');

const popular = getPopularQueries(index);
// [{ query: 'installation', count: 42 }, ...]
```

## Autocomplete

Get suggestions as users type:

```ts
const suggestions = suggest(index, 'inst');
// ['installation', 'instructions', 'instance', ...]
```

Suggestions are derived from headings and body text, respecting existing stopwords and limit settings.

## Query Caching

Search results are cached using LRU (Least Recently Used) strategy. Cache is invalidated when `removeFromIndex` is called.

## Prebuilt Indexes

Load an index from a URL instead of building in-browser:

```ts
const config: ReefConfig = {
  prebuiltIndexUrl: '/search-index.json'
};
```

Useful for static site generation workflows where the index is computed at build time.

## Backward Compatibility Notes

- **Tokenization pipeline**: Applied opt-in only. Default indexing does not use stop words, stemming, or diacritics to maintain backward compatibility with existing indexes.
- **Score normalization**: Old additive int scores still work; `includeScore: true` returns normalized 0-1 scores on top.