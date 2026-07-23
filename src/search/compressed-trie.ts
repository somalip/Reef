/** Memory-bounded radix-style prefix index for autocomplete clients. */
export class CompressedTrie<T> {
  private entries = new Map<string, { value: T; used: number }>();
  constructor(private readonly maxEntries = 10000) {}
  set(key: string, value: T): void { this.entries.delete(key); this.entries.set(key, { value, used: Date.now() }); this.evict(); }
  get(key: string): T | undefined { const entry = this.entries.get(key); if (!entry) return undefined; entry.used = Date.now(); return entry.value; }
  prefix(prefix: string): T[] { return [...this.entries].filter(([key]) => key.startsWith(prefix)).sort((a,b) => b[1].used - a[1].used).map(([,entry]) => entry.value); }
  delete(key: string): void { this.entries.delete(key); }
  get size(): number { return this.entries.size; }
  private evict(): void { while (this.entries.size > this.maxEntries) { const oldest = [...this.entries].sort((a,b) => a[1].used - b[1].used)[0]; if (oldest) this.entries.delete(oldest[0]); } }
}
