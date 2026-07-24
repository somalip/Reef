/**
 * @file Indexing and crawling functionality for the search index.
 * Handles sitemap fetching, page crawling, and worker-based indexing.
 */

import {
  extractSections,
  extractActions,
  extractFields,
  extractLinks,
  extractFiles,
  extractMedia,
  extractStructuredData,
  extractHiddenContent,
  normalizeUrl,
} from '../extraction.js';
import {
  createSearchIndex,
  addToIndex,
  type SearchIndex,
  type IndexRecord,
  type TokenFilter,
} from '../search-index.js';
import type { ReefConfig } from '../types.js';

export class Indexer {
  private index: SearchIndex = createSearchIndex();
  private config: ReefConfig;
  private robotsCache: Map<string, { disallowed: Set<string>; timestamp: number }> = new Map();
  private lastCrawlTime: number = 0;

  constructor(config: ReefConfig) {
    this.config = config;
  }

  getIndex(): SearchIndex { return this.index; }
  setIndex(index: SearchIndex): void { this.index = index; }

  private extractAllContent(html: string, url: string): IndexRecord[] {
    const doc = new DOMParser().parseFromString(html, 'text/html');

    if (this.config.indexHidden) {
      extractHiddenContent(doc);
    }

    let rootElement: Element | Document = doc;
    if (this.config.scope) {
      const scopeElement = doc.querySelector(this.config.scope);
      if (scopeElement) {
        rootElement = scopeElement;
      }
    }

    const htmlToProcess = new XMLSerializer().serializeToString(rootElement as Element);

    const sections = extractSections(htmlToProcess, url);
    const actions = this.config.indexActions ? extractActions(htmlToProcess, url, this.config.excludeAction) : [];
    const fields = this.config.indexActions ? extractFields(htmlToProcess, url) : [];
    const links = extractLinks(htmlToProcess, url);
    const files = extractFiles(htmlToProcess, url, this.config.fileExtensions);
    const media = this.config.indexMedia ? extractMedia(htmlToProcess, url) : [];
    const structured = this.config.indexStructuredData ? extractStructuredData(htmlToProcess, url) : [];

    const combined: IndexRecord[] = [];
    combined.push(...sections, ...actions, ...fields, ...links, ...files, ...media, ...structured);
    return combined;
  }

  async boot(
    onReady: () => void,
    showToast?: (msg: string) => void
  ): Promise<void> {
    // Try prebuilt index first if configured
    if (this.config.prebuiltIndexUrl) {
      try {
        const response = await fetch(this.config.prebuiltIndexUrl);
        if (response.ok) {
          const json = await response.text();
          this.index = (await import('../search-index.js')).deserializeIndex(json);
          console.info(`[reef] loaded prebuilt index with ${this.index.allSections.length} sections`);
          onReady();
          return;
        }
      } catch (error) {
        console.warn('[reef] prebuilt index fetch failed, falling back to crawling', error);
      }
    }

    // Try IndexedDB cache first
    try {
      const { loadIndex, saveIndex } = await import('../cache.js');
      const ttl = this.config.ttl;
      const cached = await loadIndex(ttl);
      if (cached?.index && cached.index.allSections.length > 0) {
        this.index = cached.index;
        console.info(`[reef] loaded cached index with ${this.index.allSections.length} sections`);
        onReady();
        return;
      }
    } catch (error) {
      console.warn('[reef] cache load failed, continuing with fresh index', error);
    }

    // Try to load existing page metadata from cache first for incremental crawling
    let cachedMetadata: { metadata: any } | null = null;
    try {
      const { loadIndex } = await import('../cache.js');
      cachedMetadata = await loadIndex();
    } catch (e) {
      console.warn('[reef] failed to load cached metadata for incremental crawling', e);
    }

    const pageHashes = cachedMetadata?.metadata?.pageMetadata ?? {};

    // Use the new recursive sitemap processing
    const urls = await this.fetchSitemapUrls();
    const maxPages = this.config.maxPages ?? 500;

    if (urls.length === 0) {
      // Fallback to same-origin crawling if no sitemaps found
      this.crawlSameOrigin(onReady);
      return;
    }

    if (this.config.useWorkerIndexing) {
      // TODO: Implement incremental crawling for worker-based indexing
      await this.fetchPagesWithWorker(urls.slice(0, maxPages), urls[0], onReady);
    } else {
      const fetchedSections = await this.fetchPagesParallel(urls.slice(0, maxPages), urls[0], pageHashes);
      if (fetchedSections.length) {
        addToIndex(this.index, fetchedSections, this.config.tokenizePipeline);
        console.info(`[reef] indexed ${fetchedSections.length} sections`);
      }
      // Save to cache with updated page metadata
      try {
        const { saveIndex } = await import('../cache.js');
        const versionHash = this.computeVersionHash(urls);
        const newPageMetadata: Record<string, { etag?: string; lastModified?: string; contentHash?: string; timestamp: number }> = {};
        
        // Update metadata for crawled pages
        for (const url of urls.slice(0, maxPages)) {
          newPageMetadata[url] = pageHashes[url] ?? { timestamp: Date.now() };
        }
        
        const metadata = {
          versionHash,
          buildTime: Date.now(),
          pageMetadata: newPageMetadata
        };
        await saveIndex(this.index, metadata);
      } catch (e) {
        console.warn('[reef] cache save failed', e);
      }
      onReady();
      return;
    }

    this.crawlSameOrigin(onReady);
  }

  async fetchSitemapUrls(): Promise<string[]> {
    const candidates = this.getSitemapCandidates();
    const allUrls: string[] = [];
    const seenUrls = new Set<string>();

    for (const candidate of candidates) {
      try {
        await this.processSitemap(candidate, allUrls, seenUrls);
      } catch (e) {
        console.warn('[reef] failed to process sitemap:', candidate, e);
        continue;
      }
    }

    return allUrls;
  }

  private async processSitemap(url: string, allUrls: string[], seenUrls: Set<string>): Promise<void> {
    if (seenUrls.has(url)) return;
    seenUrls.add(url);

    try {
      const response = await fetch(url);
      if (!response.ok) return;
      const xml = await response.text();

      // Check if this is a sitemap index
      const isSitemapIndex = xml.includes('<sitemapindex') && xml.includes('</sitemapindex>');
      
      if (isSitemapIndex) {
        // Parse child sitemaps from sitemap index
        const sitemapRegex = /<sitemap>\s*<loc>(.*?)<\/loc>\s*<\/sitemap>/g;
        let match: RegExpExecArray | null;
        
        while ((match = sitemapRegex.exec(xml)) !== null) {
          const childSitemapUrl = match[1].trim();
          const resolvedUrl = this.resolveUrl(childSitemapUrl, url);
          await this.processSitemap(resolvedUrl, allUrls, seenUrls);
        }
      } else {
        // Parse URLs from regular sitemap
        const locRegex = /<loc>(.*?)<\/loc>/g;
        let match: RegExpExecArray | null;
        while ((match = locRegex.exec(xml)) !== null) {
          const pageUrl = match[1].trim();
          const resolvedUrl = this.resolveUrl(pageUrl, url);
          if (!seenUrls.has(resolvedUrl)) {
            allUrls.push(resolvedUrl);
            seenUrls.add(resolvedUrl);
          }
        }
      }
    } catch (e) {
      console.warn('[reef] failed to process sitemap:', url, e);
    }
  }

  private computeVersionHash(urls: string[]): string {
    let hash = 0;
    for (const url of urls) {
      for (let i = 0; i < url.length; i++) {
        const char = url.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
    }
    return Math.abs(hash).toString(36);
  }

  // Simple hash function for content hashing
  private hashContent(content: string): string {
    let hash = 0;
    for (let i = 0; i < Math.min(content.length, 10000); i++) { // Only hash first 10k chars for performance
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  getSitemapCandidates(): string[] {
    const base = window.location.href;
    const configured = this.config.sitemap ?? 'sitemap.xml';
    const candidates = [this.resolveUrl(configured, base)];

    if (!configured.startsWith('/')) {
      candidates.push(this.resolveUrl('./sitemap.xml', base));
    } else if (configured === '/sitemap.xml') {
      candidates.push(this.resolveUrl('sitemap.xml', base));
    }

    return [...new Set(candidates)];
  }

  private resolveUrl(value: string, base: string): string {
    if (!value) return base;
    try {
      return new URL(value, base).toString();
    } catch {
      return value;
    }
  }

  // Fetch and parse robots.txt for a given origin
  private async fetchRobotsTxt(origin: string): Promise<Set<string>> {
    const cacheKey = origin;
    const cacheEntry = this.robotsCache.get(cacheKey);
    
    // Return cached entry if it's still fresh (cache for 1 hour)
    if (cacheEntry && Date.now() - cacheEntry.timestamp < 3600000) {
      return cacheEntry.disallowed;
    }

    try {
      const robotsUrl = new URL('/robots.txt', origin).toString();
      const response = await fetch(robotsUrl);
      
      if (!response.ok) {
        // If we can't fetch robots.txt, assume crawling is allowed
        this.robotsCache.set(cacheKey, { disallowed: new Set(), timestamp: Date.now() });
        return new Set();
      }

      const robotsText = await response.text();
      const disallowed = this.parseRobotsTxt(robotsText);
      
      this.robotsCache.set(cacheKey, { disallowed, timestamp: Date.now() });
      return disallowed;
    } catch (e) {
      console.warn('[reef] failed to fetch robots.txt:', e);
      // On error, assume crawling is allowed
      this.robotsCache.set(cacheKey, { disallowed: new Set(), timestamp: Date.now() });
      return new Set();
    }
  }

  // Parse robots.txt content and extract disallowed paths
  private parseRobotsTxt(robotsText: string): Set<string> {
    const disallowed = new Set<string>();
    const lines = robotsText.split('\n');
    
    let currentUserAgent = '';
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine || trimmedLine.startsWith('#')) continue;
      
      const userAgentMatch = trimmedLine.match(/^User-agent:\s*(.+)$/i);
      if (userAgentMatch) {
        currentUserAgent = userAgentMatch[1].trim();
        continue;
      }

      const disallowMatch = trimmedLine.match(/^Disallow:\s*(.+)$/i);
      if (disallowMatch && currentUserAgent === '*') {
        const path = disallowMatch[1].trim();
        if (path) {
          disallowed.add(path);
        }
      }
    }
    
    return disallowed;
  }

  // Check if a URL is allowed by robots.txt
  private isUrlAllowed(url: string, origin: string): boolean {
    // If we don't have cached robots.txt for this origin, assume it's allowed
    const cacheEntry = this.robotsCache.get(origin);
    if (!cacheEntry) return true;
    
    const disallowed = cacheEntry.disallowed;
    if (disallowed.size === 0) return true;
    
    // Check if the URL path starts with any disallowed path
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname;
      
      for (const disallowedPath of disallowed) {
        if (path.startsWith(disallowedPath)) {
          return false;
        }
      }
    } catch {
      return true; // If URL parsing fails, assume allowed
    }
    
    return true;
  }

  // Apply crawl delay between batches
  private async applyCrawlDelay(): Promise<void> {
    const delay = this.config.crawlDelay ?? 0;
    if (delay <= 0) return;
    
    const now = Date.now();
    const timeSinceLastCrawl = now - this.lastCrawlTime;
    
    if (timeSinceLastCrawl < delay) {
      await new Promise(resolve => setTimeout(resolve, delay - timeSinceLastCrawl));
    }
    
    this.lastCrawlTime = Date.now();
  }

  private crawlSameOrigin(onReady: () => void): void {
    const origin = window.location.origin;
    const visited = new Set<string>();
    const queue: string[] = [normalizeUrl(window.location.href)];
    const maxPages = this.config.maxPages ?? 500;
    const concurrency = this.config.maxPages ? Math.min(this.config.maxPages, 6) : 6;

    const processQueue = async () => {
      // Fetch robots.txt first
      await this.fetchRobotsTxt(origin);

      while (queue.length && visited.size < maxPages) {
        // Apply crawl delay between batches
        await this.applyCrawlDelay();
        
        const batch = queue.splice(0, concurrency);
        
        for (const url of batch) {
          const normalizedUrlStr = normalizeUrl(url);
          if (visited.has(normalizedUrlStr) || !normalizedUrlStr.startsWith(origin)) continue;
          
          // Check robots.txt
          if (!this.isUrlAllowed(normalizedUrlStr, origin)) {
            console.info(`[reef] skipping disallowed URL: ${normalizedUrlStr}`);
            continue;
          }
          
          visited.add(normalizedUrlStr);

          try {
            const response = await fetch(normalizedUrlStr);
            if (!response.ok) continue;
            const html = await response.text();
            const content = this.extractAllContent(html, normalizedUrlStr);
            addToIndex(this.index, content, this.config.tokenizePipeline);

            const links = extractLinks(html, normalizedUrlStr)
              .filter(l => l.url.startsWith(origin))
              .map(l => normalizeUrl(l.url))
              .filter((u, i, arr) => arr.indexOf(u) === i);
            queue.push(...links);
          } catch (e) {
            continue;
          }
        }
      }
      console.info(`[reef] indexed ${visited.size} pages via same-origin crawl`);
      onReady();
    };

    processQueue();
  }

  private async fetchPagesParallel(urls: string[], sitemapUrl: string, pageHashes: Record<string, any> = {}): Promise<IndexRecord[]> {
    const concurrency = 6;
    const sections: IndexRecord[] = [];
    const results: (IndexRecord[] | null)[] = new Array(urls.length);

    let idx = 0;
    const fetchBatch = async () => {
      while (idx < urls.length) {
        const i = idx++;
        const pageUrl = this.resolveUrl(urls[i], sitemapUrl);
        try {
          // Check if we have cached info for this URL
          const cachedPageInfo = pageHashes[pageUrl];
          
          // Skip if content hasn't changed (incremental crawling)
          if (cachedPageInfo) {
            const headResponse = await fetch(pageUrl, { method: 'HEAD' });
            if (headResponse.ok) {
              const currentEtag = headResponse.headers.get('ETag');
              const currentLastModified = headResponse.headers.get('Last-Modified');
              
              // Check if content is unchanged
              if ((cachedPageInfo.etag && currentEtag === cachedPageInfo.etag) ||
                  (cachedPageInfo.lastModified && currentLastModified === cachedPageInfo.lastModified)) {
                console.info(`[reef] skipping unchanged page: ${pageUrl}`);
                results[i] = null; // Skip this page
                return;
              }
            }
          }
          
          // Fetch the full page content
          const pageResponse = await fetch(pageUrl);
          if (pageResponse.ok) {
            const html = await pageResponse.text();
            
            // Check content hash if we have it
            if (cachedPageInfo?.contentHash) {
              const currentContentHash = this.hashContent(html);
              if (currentContentHash === cachedPageInfo.contentHash) {
                console.info(`[reef] skipping unchanged page (content hash match): ${pageUrl}`);
                results[i] = null; // Skip this page
                return;
              }
            }
            
            const pageSections = this.extractAllContent(html, pageUrl);
            results[i] = pageSections;
            
            // Update page metadata with new hash/etag info
            pageHashes[pageUrl] = {
              etag: pageResponse.headers.get('ETag'),
              lastModified: pageResponse.headers.get('Last-Modified'),
              contentHash: this.hashContent(html),
              timestamp: Date.now()
            };
          }
        } catch {
          results[i] = null;
        }
      }
    };

    await Promise.all([...Array(concurrency)].map(() => fetchBatch()));

    for (let i = 0; i < results.length; i++) {
      if (results[i]) {
        sections.push(...(results[i] ?? []));
      }
    }

    return sections;
  }

  private async fetchPagesWithWorker(urls: string[], sitemapUrl: string, onReady: () => void): Promise<IndexRecord[]> {
    const workerUrl = new URL('../worker.js', import.meta.url).href;
    const workerCount = Math.min(navigator.hardwareConcurrency || 4, 4);
    
    return new Promise<IndexRecord[]>((resolve, reject) => {
      const workers: Worker[] = [];
      const results: Map<number, { result: string; error: string }> = new Map();
      let completedWorkers = 0;
      
      // Shard the URLs across workers
      const shards = this.shardArray(urls, workerCount);
      
      for (let i = 0; i < workerCount; i++) {
        const worker = new Worker(workerUrl);
        workers.push(worker);
        
        const workerId = i;
        const shard = shards[i] || [];
        
        const messageHandler = (e: MessageEvent) => {
          const { result, error, json, workerIndex } = e.data as { 
            result: string; 
            error: string; 
            json: string; 
            workerIndex: number 
          };
          
          if (workerIndex !== workerId) return; // Not for this worker
          
          if (error) {
            console.error(`[reef] worker ${workerId} error:`, error);
            results.set(workerId, { result: 'error', error });
          } else if (json) {
            results.set(workerId, { result: 'ok', error: '' });
            // Store the serialized index from this worker
            // We'll merge them after all workers complete
          }
          
          completedWorkers++;
          
          if (completedWorkers === workerCount) {
            // All workers completed, merge results
            this.mergeWorkerResults(workers, results, onReady, resolve, reject);
          }
        };
        
        const errorHandler = (e: ErrorEvent) => {
          console.error(`[reef] worker ${workerId} error:`, e.error);
          results.set(workerId, { result: 'error', error: e.error?.toString() || 'Unknown error' });
          completedWorkers++;
          
          if (completedWorkers === workerCount) {
            this.mergeWorkerResults(workers, results, onReady, resolve, reject);
          }
        };
        
        worker.addEventListener('message', messageHandler);
        worker.addEventListener('error', errorHandler);
        
        const config = {
          scope: this.config.scope,
          indexActions: this.config.indexActions,
          indexMedia: this.config.indexMedia,
          indexStructuredData: this.config.indexStructuredData,
          indexHidden: this.config.indexHidden,
          excludeAction: this.config.excludeAction,
          fileExtensions: this.config.fileExtensions,
        };
        
        const id = Date.now() + i; // Unique ID for each worker
        worker.postMessage({
          id,
          workerIndex: i,
          action: 'indexPages',
          payload: {
            pages: shard.map(url => [this.resolveUrl(url, sitemapUrl), '']), // URL and empty HTML initially
            config,
            shardIndex: i,
            totalShards: workerCount
          },
        });
      }
    });
  }
  
  // Helper to shard an array into N parts
  private shardArray<T>(array: T[], count: number): T[][] {
    const shards: T[][] = [];
    const shardSize = Math.ceil(array.length / count);
    
    for (let i = 0; i < count; i++) {
      const start = i * shardSize;
      const end = start + shardSize;
      shards.push(array.slice(start, end));
    }
    
    return shards;
  }
  
  // Merge results from all workers
  private async mergeWorkerResults(
    workers: Worker[], 
    results: Map<number, { result: string; error: string }>, 
    onReady: () => void, 
    resolve: (value: IndexRecord[] | PromiseLike<IndexRecord[]>) => void, 
    reject: (reason?: any) => void
  ): Promise<void> {
    // Clean up workers
    for (const worker of workers) {
      worker.terminate();
    }
    
    // Check for errors
    let hasErrors = false;
    for (const [workerId, result] of results) {
      if (result.error) {
        hasErrors = true;
        break;
      }
    }
    
    if (hasErrors) {
      // If any worker failed, fall back to single-threaded approach
      console.warn('[reef] worker pool had errors, falling back to single-threaded');
      try {
        const fetchedSections = await this.fetchPagesParallel(
          Array.from(results.keys()).map(i => this.resolveUrl('', '')), // Empty for fallback
          '',
          {}
        );
        onReady();
        resolve(fetchedSections);
      } catch (e) {
        reject(e);
      }
      return;
    }
    
    // All workers completed successfully
    // For now, fall back to single-threaded as the worker communication 
    // would need significant changes to return partial indices
    console.warn('[reef] worker pool: TODO implement proper merging of worker results');
    onReady();
    resolve([]);
  }
}