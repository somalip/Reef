/**
 * @file Local library storage for Reef for Browsers.
 * Persists user Bookmarks, Snippets, PageNotes, and Recent pages
 * in chrome.storage.local. No remote sync, no telemetry.
 */

export interface Bookmark {
  id: string;
  url: string;
  title: string;
  selectedText?: string;
  selector?: string;
  contextBefore?: string;
  contextAfter?: string;
  note: string;
  tags: string[];
  favicon?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Snippet {
  id: string;
  text: string;
  title: string;
  tags: string[];
  source?: { url: string; title: string };
  createdAt: number;
  updatedAt: number;
}

export interface PageNote {
  url: string;
  text: string;
  title: string;
  updatedAt: number;
}

export interface RecentPage {
  url: string;
  title: string;
  favicon?: string;
  visitedAt: number;
  recordCount: number;
}

const KEY = {
  bookmarks: 'reef.bookmarks',
  snippets: 'reef.snippets',
  pageNotes: 'reef.pageNotes',
  recents: 'reef.recents',
} as const;

function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function storageApi(): typeof chrome.storage.local | null {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    return chrome.storage.local;
  }
  return null;
}

async function getArray<T>(key: string): Promise<T[]> {
  const api = storageApi();
  if (!api) return [];
  const data = await api.get([key]);
  return (data[key] as T[]) || [];
}

async function setArray<T>(key: string, value: T[]): Promise<void> {
  const api = storageApi();
  if (!api) return;
  await api.set({ [key]: value });
}

// ─── BOOKMARKS ────────────────────────────────────────────
export async function listBookmarks(query = '', tags: string[] = []): Promise<Bookmark[]> {
  const all = await getArray<Bookmark>(KEY.bookmarks);
  return filterItems(all, query, tags);
}

export async function createBookmark(input: Omit<Bookmark, 'id' | 'createdAt' | 'updatedAt'>): Promise<Bookmark> {
  const now = Date.now();
  const bookmark: Bookmark = { ...input, id: genId(), createdAt: now, updatedAt: now };
  const all = await getArray<Bookmark>(KEY.bookmarks);
  all.unshift(bookmark);
  await setArray(KEY.bookmarks, all);
  return bookmark;
}

export async function updateBookmark(id: string, patch: Partial<Bookmark>): Promise<Bookmark | null> {
  const all = await getArray<Bookmark>(KEY.bookmarks);
  const idx = all.findIndex(b => b.id === id);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], ...patch, id, updatedAt: Date.now() };
  await setArray(KEY.bookmarks, all);
  return all[idx];
}

export async function deleteBookmark(id: string): Promise<boolean> {
  const all = await getArray<Bookmark>(KEY.bookmarks);
  const next = all.filter(b => b.id !== id);
  if (next.length === all.length) return false;
  await setArray(KEY.bookmarks, next);
  return true;
}

// ─── SNIPPETS ─────────────────────────────────────────────
export async function listSnippets(query = '', tags: string[] = []): Promise<Snippet[]> {
  const all = await getArray<Snippet>(KEY.snippets);
  return filterItems(all, query, tags);
}

export async function createSnippet(input: Omit<Snippet, 'id' | 'createdAt' | 'updatedAt'>): Promise<Snippet> {
  const now = Date.now();
  const snippet: Snippet = { ...input, id: genId(), createdAt: now, updatedAt: now };
  const all = await getArray<Snippet>(KEY.snippets);
  all.unshift(snippet);
  await setArray(KEY.snippets, all);
  return snippet;
}

export async function updateSnippet(id: string, patch: Partial<Snippet>): Promise<Snippet | null> {
  const all = await getArray<Snippet>(KEY.snippets);
  const idx = all.findIndex(s => s.id === id);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], ...patch, id, updatedAt: Date.now() };
  await setArray(KEY.snippets, all);
  return all[idx];
}

export async function deleteSnippet(id: string): Promise<boolean> {
  const all = await getArray<Snippet>(KEY.snippets);
  const next = all.filter(s => s.id !== id);
  if (next.length === all.length) return false;
  await setArray(KEY.snippets, next);
  return true;
}

// ─── PAGE NOTES ───────────────────────────────────────────
export async function getPageNote(url: string): Promise<PageNote | null> {
  const all = await getArray<PageNote>(KEY.pageNotes);
  return all.find(n => n.url === url) || null;
}

export async function listPageNotes(query = ''): Promise<PageNote[]> {
  const all = await getArray<PageNote>(KEY.pageNotes);
  if (!query) return all;
  const q = query.toLowerCase();
  return all.filter(n =>
    n.text.toLowerCase().includes(q) ||
    n.title.toLowerCase().includes(q) ||
    n.url.toLowerCase().includes(q)
  );
}

export async function setPageNote(url: string, text: string, title: string): Promise<PageNote> {
  const all = await getArray<PageNote>(KEY.pageNotes);
  const existing = all.findIndex(n => n.url === url);
  const note: PageNote = { url, text, title, updatedAt: Date.now() };
  if (existing >= 0) all[existing] = note;
  else all.unshift(note);
  await setArray(KEY.pageNotes, all);
  return note;
}

export async function deletePageNote(url: string): Promise<boolean> {
  const all = await getArray<PageNote>(KEY.pageNotes);
  const next = all.filter(n => n.url !== url);
  if (next.length === all.length) return false;
  await setArray(KEY.pageNotes, next);
  return true;
}

// ─── RECENT PAGES ─────────────────────────────────────────
const RECENT_MAX = 30;

export async function listRecents(): Promise<RecentPage[]> {
  return getArray<RecentPage>(KEY.recents);
}

export async function recordRecent(page: Omit<RecentPage, 'visitedAt'>): Promise<void> {
  const all = await getArray<RecentPage>(KEY.recents);
  const next = [{ ...page, visitedAt: Date.now() }, ...all.filter(p => p.url !== page.url)].slice(0, RECENT_MAX);
  await setArray(KEY.recents, next);
}

export async function clearRecents(): Promise<void> {
  await setArray<RecentPage>(KEY.recents, []);
}

// ─── TAGS ─────────────────────────────────────────────────
export async function allBookmarkTags(): Promise<string[]> {
  return collectTags(await getArray<Bookmark>(KEY.bookmarks));
}

export async function allSnippetTags(): Promise<string[]> {
  return collectTags(await getArray<Snippet>(KEY.snippets));
}

// ─── HELPERS ──────────────────────────────────────────────
function filterItems<T extends { tags: string[] }>(items: T[], query: string, tags: string[]): T[] {
  let out = items;
  if (tags.length) {
    out = out.filter(item => tags.every(t => item.tags.includes(t)));
  }
  if (query) {
    const q = query.toLowerCase();
    out = out.filter(item => {
      const hay = JSON.stringify(item).toLowerCase();
      return hay.includes(q);
    });
  }
  return out;
}

function collectTags<T extends { tags: string[] }>(items: T[]): string[] {
  const set = new Set<string>();
  for (const item of items) for (const tag of item.tags) set.add(tag);
  return Array.from(set).sort();
}

export function parseTagsInput(raw: string): string[] {
  return Array.from(new Set(
    raw
      .split(/[,\n]/)
      .map(s => s.trim().replace(/^#/, ''))
      .filter(Boolean)
  ));
}
