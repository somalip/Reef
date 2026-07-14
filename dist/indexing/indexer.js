/**
 * @file Indexing and crawling functionality for the search index.
 * Handles sitemap fetching, page crawling, and worker-based indexing.
 */
import { extractSections, extractActions, extractFields, extractLinks, extractFiles, extractMedia, extractStructuredData, extractHiddenContent, } from '../extraction.js';
import { createSearchIndex, addToIndex, } from '../search-index.js';
export class Indexer {
    constructor(config) {
        this.index = createSearchIndex();
        this.config = config;
    }
    getIndex() { return this.index; }
    setIndex(index) { this.index = index; }
    extractAllContent(html, url) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        if (this.config.indexHidden) {
            extractHiddenContent(doc);
        }
        let rootElement = doc;
        if (this.config.scope) {
            const scopeElement = doc.querySelector(this.config.scope);
            if (scopeElement) {
                rootElement = scopeElement;
            }
        }
        const htmlToProcess = new XMLSerializer().serializeToString(rootElement);
        const sections = extractSections(htmlToProcess, url);
        const actions = this.config.indexActions ? extractActions(htmlToProcess, url, this.config.excludeAction) : [];
        const fields = this.config.indexActions ? extractFields(htmlToProcess, url) : [];
        const links = extractLinks(htmlToProcess, url);
        const files = extractFiles(htmlToProcess, url, this.config.fileExtensions);
        const media = this.config.indexMedia ? extractMedia(htmlToProcess, url) : [];
        const structured = this.config.indexStructuredData ? extractStructuredData(htmlToProcess, url) : [];
        const combined = [];
        combined.push(...sections, ...actions, ...fields, ...links, ...files, ...media, ...structured);
        return combined;
    }
    async boot(onReady, showToast) {
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
            }
            catch (error) {
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
        }
        catch (error) {
            console.warn('[reef] cache load failed, continuing with fresh index', error);
        }
        const candidates = this.getSitemapCandidates();
        for (const candidate of candidates) {
            try {
                const response = await fetch(candidate);
                if (!response.ok)
                    continue;
                const xml = await response.text();
                const urls = [];
                const locRegex = /<loc>(.*?)<\/loc>/g;
                let match;
                while ((match = locRegex.exec(xml)) !== null) {
                    urls.push(match[1].trim());
                }
                const maxPages = this.config.maxPages ?? 500;
                if (this.config.useWorkerIndexing) {
                    await this.fetchPagesWithWorker(urls.slice(0, maxPages), candidate, onReady);
                }
                else {
                    const fetchedSections = await this.fetchPagesParallel(urls.slice(0, maxPages), candidate);
                    if (fetchedSections.length) {
                        addToIndex(this.index, fetchedSections, this.config.tokenizePipeline);
                        console.info(`[reef] indexed ${fetchedSections.length} sections`);
                    }
                    // Save to cache
                    try {
                        const { saveIndex } = await import('../cache.js');
                        const versionHash = this.computeVersionHash(urls);
                        const metadata = {
                            versionHash,
                            buildTime: Date.now(),
                            pageMetadata: urls.reduce((acc, url) => ({ ...acc, [url]: versionHash }), {})
                        };
                        await saveIndex(this.index, metadata);
                    }
                    catch (e) {
                        console.warn('[reef] cache save failed', e);
                    }
                    onReady();
                    return;
                }
            }
            catch (error) {
                console.warn('[reef] sitemap fetch failed', candidate, error);
            }
        }
        this.crawlSameOrigin(onReady);
    }
    async fetchSitemapUrls() {
        const candidates = this.getSitemapCandidates();
        for (const candidate of candidates) {
            try {
                const response = await fetch(candidate);
                if (!response.ok)
                    continue;
                const xml = await response.text();
                const urls = [];
                const locRegex = /<loc>(.*?)<\/loc>/g;
                let match;
                while ((match = locRegex.exec(xml)) !== null) {
                    urls.push(match[1].trim());
                }
                if (urls.length)
                    return urls;
            }
            catch {
                continue;
            }
        }
        return [];
    }
    computeVersionHash(urls) {
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
    getSitemapCandidates() {
        const base = window.location.href;
        const configured = this.config.sitemap ?? 'sitemap.xml';
        const candidates = [this.resolveUrl(configured, base)];
        if (!configured.startsWith('/')) {
            candidates.push(this.resolveUrl('./sitemap.xml', base));
        }
        else if (configured === '/sitemap.xml') {
            candidates.push(this.resolveUrl('sitemap.xml', base));
        }
        return [...new Set(candidates)];
    }
    resolveUrl(value, base) {
        if (!value)
            return base;
        try {
            return new URL(value, base).toString();
        }
        catch {
            return value;
        }
    }
    crawlSameOrigin(onReady) {
        const visited = new Set();
        const queue = [window.location.href];
        const maxPages = this.config.maxPages ?? 500;
        const processQueue = async () => {
            while (queue.length && visited.size < maxPages) {
                const url = queue.shift();
                if (visited.has(url) || !url.startsWith(window.location.origin))
                    continue;
                visited.add(url);
                try {
                    const response = await fetch(url);
                    if (!response.ok)
                        continue;
                    const html = await response.text();
                    const content = this.extractAllContent(html, url);
                    addToIndex(this.index, content, this.config.tokenizePipeline);
                    const links = extractLinks(html, url)
                        .filter(l => l.url.startsWith(window.location.origin))
                        .map(l => l.url)
                        .filter((u, i, arr) => arr.indexOf(u) === i);
                    queue.push(...links);
                }
                catch (e) {
                    continue;
                }
            }
            console.info(`[reef] indexed ${visited.size} pages via same-origin crawl`);
            onReady();
        };
        processQueue();
    }
    async fetchPagesParallel(urls, sitemapUrl) {
        const concurrency = 6;
        const sections = [];
        const results = new Array(urls.length);
        let idx = 0;
        const fetchBatch = async () => {
            while (idx < urls.length) {
                const i = idx++;
                const pageUrl = this.resolveUrl(urls[i], sitemapUrl);
                try {
                    const pageResponse = await fetch(pageUrl);
                    if (pageResponse.ok) {
                        const html = await pageResponse.text();
                        const pageSections = this.extractAllContent(html, pageUrl);
                        results[i] = pageSections;
                    }
                }
                catch {
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
    async fetchPagesWithWorker(urls, sitemapUrl, onReady) {
        const workerUrl = new URL('../worker.js', import.meta.url).href;
        const worker = new Worker(workerUrl);
        return new Promise((resolve, reject) => {
            const messageHandler = async (e) => {
                const { result, error, json } = e.data;
                if (error) {
                    console.error('[reef] worker error:', error);
                    reject(new Error(error));
                    return;
                }
                if (result === 'ok' && json) {
                    worker.removeEventListener('message', messageHandler);
                    worker.terminate();
                    this.index = (await import('../search-index.js')).deserializeIndex(json);
                    onReady();
                    resolve([]);
                }
            };
            const errorHandler = (e) => {
                console.error('[reef] worker error:', e.error);
                reject(e.error);
            };
            worker.addEventListener('message', messageHandler);
            worker.addEventListener('error', errorHandler);
            const htmlMap = {};
            const fetchPromises = urls.map(async (pageUrl) => {
                try {
                    const resolvedUrl = this.resolveUrl(pageUrl, sitemapUrl);
                    const response = await fetch(resolvedUrl);
                    if (response.ok) {
                        htmlMap[resolvedUrl] = await response.text();
                    }
                }
                catch (e) {
                    console.warn('[reef] failed to fetch page for worker:', pageUrl);
                }
            });
            void Promise.all(fetchPromises).then(() => {
                const config = {
                    scope: this.config.scope,
                    indexActions: this.config.indexActions,
                    indexMedia: this.config.indexMedia,
                    indexStructuredData: this.config.indexStructuredData,
                    indexHidden: this.config.indexHidden,
                    excludeAction: this.config.excludeAction,
                    fileExtensions: this.config.fileExtensions,
                };
                const id = Date.now();
                worker.postMessage({
                    id,
                    action: 'indexPages',
                    payload: {
                        pages: Object.entries(htmlMap),
                        config,
                    },
                });
            });
        });
    }
}
