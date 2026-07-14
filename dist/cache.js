/**
 * @file IndexedDB persistent cache for search index.
 * Stores serialized index with metadata for TTL-based expiration.
 */
import { serializeIndex, deserializeIndex } from './search-index.js';
const DB_NAME = 'reef-index';
const STORE_NAME = 'indices';
const CACHE_VERSION_KEY = 'version';
export async function openDB() {
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
export async function saveIndex(index, metadata) {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const data = {
        [CACHE_VERSION_KEY]: metadata.versionHash,
        index: serializeIndex(index),
        metadata
    };
    await new Promise((resolve, reject) => {
        const req = store.put(data);
        req.onsuccess = () => resolve(undefined);
        req.onerror = () => reject(req.error);
    });
}
export async function loadIndex(ttl) {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const allRecords = await new Promise((resolve, reject) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
    if (!allRecords.length)
        return null;
    const record = allRecords[0];
    const cached = deserializeIndex(record.index);
    const metadata = record.metadata;
    if (ttl && metadata.buildTime) {
        const age = Date.now() - metadata.buildTime;
        if (age > ttl) {
            return null;
        }
    }
    return { index: cached, metadata };
}
export async function clearCache() {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    await new Promise((resolve, reject) => {
        const req = store.clear();
        req.onsuccess = () => resolve(undefined);
        req.onerror = () => reject(req.error);
    });
}
