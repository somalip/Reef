import type { GraphCrawlerOptions, IndexRecord, SiteGraph } from './types.js';
import { extractSections, extractActions, extractFields, extractLinks } from './extraction.js';
import { saveSiteGraph } from './cache.js';

/** BFS same-origin crawler. It only observes HTML; forms and destructive actions are never submitted. */
export async function crawlAndBuildGraph(startUrl: string, options?: GraphCrawlerOptions): Promise<SiteGraph> {
  const fetcher = options?.fetch ?? globalThis.fetch;
  const maxPages = options?.maxPages ?? 50;
  const queue = [startUrl];
  const seen = new Set<string>();
  const nodes: SiteGraph['nodes'] = [];
  const edges: SiteGraph['edges'] = [];
  const origin = new URL(startUrl).origin;
  while (queue.length && seen.size < maxPages) {
    const url = queue.shift()!; if (seen.has(url)) continue; seen.add(url);
    const response = await fetcher(url); if (!response.ok) continue;
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const serialized = new XMLSerializer().serializeToString(doc);
    const records: IndexRecord[] = [...extractSections(serialized, url), ...extractActions(serialized, url), ...extractFields(serialized, url), ...extractLinks(serialized, url)];
    nodes.push({ url, records });
    for (const record of records.filter(r => r.type === 'section' || r.type === 'link')) {
      const target = record.url;
      if (!target.startsWith(origin)) continue;
      edges.push({ fromUrl: url, action: record.headingText, toUrl: target, destructive: record.destructive });
      if (!seen.has(target) && queue.length < (options?.maxActionsPerRun ?? maxPages)) queue.push(target);
    }
    for (const record of records.filter(r => r.type === 'action' || r.type === 'field')) edges.push({ fromUrl: url, action: record.headingText, effect: record.type === 'field' ? 'field-input' : 'dom-action', destructive: record.destructive });
    if (options?.crawlDelay) await new Promise(resolve => setTimeout(resolve, options.crawlDelay));
  }
  const graph = { startUrl, nodes, edges, createdAt: Date.now() };
  if (options?.persist && typeof indexedDB !== 'undefined') await saveSiteGraph(graph);
  return graph;
}
