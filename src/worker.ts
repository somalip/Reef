/// <reference lib="webworker" />
import {
  createSearchIndex,
  searchSections,
  deserializeIndex,
  serializeIndex,
  addToIndex,
  type SearchIndex,
  type IndexRecord,
} from './search-index.js';
import {
  extractSections,
  extractActions,
  extractFields,
  extractLinks,
  extractFiles,
  extractMedia,
  extractStructuredData,
  extractHiddenContent,
} from './extraction.js';

let index: SearchIndex = createSearchIndex();

self.onmessage = (e: MessageEvent) => {
  const { id, action, payload } = e.data as { id: number; action: string; payload: any };
  
  switch (action) {
    case 'createIndex':
      index = createSearchIndex();
      self.postMessage({ id, result: 'ok' });
      break;
      
    case 'search': {
      const { query, options } = payload as { query: string; options?: any };
      const results = searchSections(query, index, options);
      self.postMessage({ id, results });
      break;
    }
    
    case 'deserializeIndex': {
      index = deserializeIndex(payload.json);
      self.postMessage({ id, result: 'ok' });
      break;
    }
    
    case 'serializeIndex': {
      const json = serializeIndex(index);
      self.postMessage({ id, json });
      break;
    }
    
    case 'indexPages': {
      (async () => {
        const { pages, config } = payload as { 
          pages: [string, string][]; 
          config: { scope?: string; indexActions?: boolean; indexMedia?: boolean; indexStructuredData?: boolean; indexHidden?: boolean; excludeAction?: string; fileExtensions?: string } 
        };
        const allRecords: IndexRecord[] = [];
        
        for (const [pageUrl, html] of pages) {
          try {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            
            if (config.indexHidden) {
              extractHiddenContent(doc);
            }
            
            let rootElement: Element | Document = doc;
            if (config.scope) {
              const scopeElement = doc.querySelector(config.scope);
              if (scopeElement) {
                rootElement = scopeElement;
              }
            }
            
            const htmlToProcess = new XMLSerializer().serializeToString(rootElement as Element);
            const sections = extractSections(htmlToProcess, pageUrl);
            const actions = config.indexActions ? extractActions(htmlToProcess, pageUrl, config.excludeAction) : [];
            const fields = config.indexActions ? extractFields(htmlToProcess, pageUrl) : [];
            const links = extractLinks(htmlToProcess, pageUrl);
            const files = extractFiles(htmlToProcess, pageUrl, config.fileExtensions);
            const media = config.indexMedia ? extractMedia(htmlToProcess, pageUrl) : [];
            const structured = config.indexStructuredData ? extractStructuredData(htmlToProcess, pageUrl) : [];
            
            allRecords.push(...sections, ...actions, ...fields, ...links, ...files, ...media, ...structured);
          } catch (error) {
            console.error('[reef-worker] error indexing page:', pageUrl, error);
          }
        }
        
        addToIndex(index, allRecords);
        const json = serializeIndex(index);
        self.postMessage({ id, result: 'ok', json });
      })();
      break;
    }
    default:
      self.postMessage({ id, error: 'Unknown action' });
  }
};