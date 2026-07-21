/**
 * @file IndexedDB persistent cache for search index.
 * Stores serialized index with metadata for TTL-based expiration.
 */

import { SearchIndex, serializeIndex, deserializeIndex } from './search-index.js';
import { CacheMetadata } from './types.js';

// Feature detection for compression streams
declare global {
  interface Window {
    CompressionStream?: typeof CompressionStream;
    DecompressionStream?: typeof DecompressionStream;
  }
}

const DB_NAME = 'reef-index';
const STORE_NAME = 'indices';
const CACHE_VERSION_KEY = 'version';

export async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: CACHE_VERSION_KEY });
      }
    };
  });
}

// Compress data using gzip if available
async function compressData(data: string): Promise<{ compressed: boolean; data: ArrayBuffer | string }> {
  if (typeof window === 'undefined' || !window.CompressionStream) {
    return { compressed: false, data };
  }
  
  try {
    const blob = new Blob([data]).stream();
    const compressedStream = blob.pipeThrough(new CompressionStream('gzip'));
    const chunks: Uint8Array[] = [];
    const reader = compressedStream.getReader();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(new Uint8Array(value));
    }
    
    // Concatenate chunks into a single ArrayBuffer
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    
    return { compressed: true, data: result.buffer };
  } catch {
    return { compressed: false, data };
  }
}

// Decompress data using gzip if available
async function decompressData(data: ArrayBuffer | string): Promise<string> {
  if (typeof data === 'string') {
    return data; // Not compressed
  }
  
  if (typeof window === 'undefined' || !window.DecompressionStream) {
    throw new Error('Compressed data but no decompression available');
  }
  
  try {
    const blob = new Blob([data]).stream();
    const decompressedStream = blob.pipeThrough(new DecompressionStream('gzip'));
    const chunks: string[] = [];
    const reader = decompressedStream.getReader();
    const decoder = new TextDecoder();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(decoder.decode(value, { stream: true }));
    }
    
    return chunks.join('') + decoder.decode();
  } catch {
    throw new Error('Failed to decompress data');
  }
}

// Serialize index to JSON string
export async function saveIndex(index: SearchIndex, metadata: CacheMetadata): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  
  const serializedIndex = serializeIndex(index);
  const { compressed, data } = await compressData(serializedIndex);
  
  const dataToStore = {
    [CACHE_VERSION_KEY]: metadata.versionHash,
    index: data,
    metadata,
    compressed
  };
  
  await new Promise((resolve, reject) => {
    const req = store.put(dataToStore);
    req.onsuccess = () => resolve(undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function loadIndex(ttl?: number): Promise<{ index: SearchIndex; metadata: CacheMetadata } | null> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  
  const allRecords = await new Promise<any[]>((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  if (!allRecords.length) return null;
  
  const record = allRecords[0] as { [key: string]: any };
  let serializedIndex = record.index;
  
  // Decompress if needed
  if (record.compressed) {
    try {
      serializedIndex = await decompressData(record.index);
    } catch (e) {
      console.warn('[reef] decompression failed, trying uncompressed fallback:', e);
      // If decompression fails, try as string (fallback for old caches)
      if (typeof record.index === 'string') {
        serializedIndex = record.index;
      } else {
        return null; // Can't read this cache
      }
    }
  } else if (typeof record.index === 'string') {
    serializedIndex = record.index;
  } else {
    // Can't handle this format
    return null;
  }
  
  const cached = deserializeIndex(serializedIndex);
  const metadata: CacheMetadata = record.metadata;

  if (ttl && metadata.buildTime) {
    const age = Date.now() - metadata.buildTime;
    if (age > ttl) {
      return null;
    }
  }

  return { index: cached, metadata };
}

export async function clearCache(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  await new Promise((resolve, reject) => {
    const req = store.clear();
    req.onsuccess = () => resolve(undefined);
    req.onerror = () => reject(req.error);
  });
}