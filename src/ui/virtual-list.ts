/** Small DOM virtualizer used by result views with large collections. */
export interface VirtualListOptions<T> { itemHeight: number; buffer?: number; render: (item: T, index: number) => HTMLElement; }
export class VirtualList<T> {
  private scroller: HTMLElement | null = null; private items: T[] = [];
  constructor(private readonly options: VirtualListOptions<T>) {}
  mount(scroller: HTMLElement, items: T[] = []): void { this.scroller = scroller; this.items = items; this.render(); scroller.addEventListener('scroll', () => this.render(), { passive: true }); }
  setItems(items: T[]): void { this.items = items; this.render(); }
  private render(): void { if (!this.scroller) return; const { itemHeight, buffer = 5 } = this.options; const top = this.scroller.scrollTop; const first = Math.max(0, Math.floor(top / itemHeight) - buffer); const count = Math.ceil(this.scroller.clientHeight / itemHeight) + buffer * 2; const fragment = document.createDocumentFragment(); const spacer = document.createElement('div'); spacer.style.height = `${first * itemHeight}px`; fragment.appendChild(spacer); for (let i = first; i < Math.min(this.items.length, first + count); i++) { const el = this.options.render(this.items[i], i); el.style.minHeight = `${itemHeight}px`; fragment.appendChild(el); } const tail = document.createElement('div'); tail.style.height = `${Math.max(0, this.items.length - first - count) * itemHeight}px`; fragment.appendChild(tail); this.scroller.replaceChildren(fragment); }
}
