/**
 * @file Visual inspector overlay for highlighting page actions and fields.
 * Helpful for developers debugging indexing and AI agents locating interactive elements.
 */

import type { IndexRecord } from '../types.js';

export class VisualInspector {
  private overlayContainer: HTMLDivElement | null = null;
  private records: IndexRecord[] = [];
  private active = false;
  private resizeObserver: ResizeObserver | null = null;

  constructor() {
    this.handleScroll = this.handleScroll.bind(this);
  }

  public setRecords(records: IndexRecord[]): void {
    this.records = records;
    if (this.active) {
      this.refresh();
    }
  }

  public activate(): void {
    if (this.active) return;
    this.active = true;
    this.createContainer();
    this.refresh();

    window.addEventListener('scroll', this.handleScroll, { passive: true });
    window.addEventListener('resize', this.handleScroll, { passive: true });

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.refresh());
      this.resizeObserver.observe(document.body);
    }
  }

  public deactivate(): void {
    if (!this.active) return;
    this.active = false;
    this.removeContainer();

    window.removeEventListener('scroll', this.handleScroll);
    window.removeEventListener('resize', this.handleScroll);

    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
  }

  public isActive(): boolean {
    return this.active;
  }

  private createContainer(): void {
    this.removeContainer();
    const container = document.createElement('div');
    container.id = 'reef-inspector-container';
    container.style.position = 'absolute';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '100%';
    container.style.height = '100%';
    container.style.pointerEvents = 'none';
    container.style.zIndex = '2147483640'; // Just under the search modal but above everything else
    document.body.appendChild(container);
    this.overlayContainer = container;
  }

  private removeContainer(): void {
    if (this.overlayContainer) {
      this.overlayContainer.remove();
      this.overlayContainer = null;
    }
  }

  private handleScroll(): void {
    if (this.active) {
      this.refresh();
    }
  }

  public refresh(): void {
    if (!this.active || !this.overlayContainer) return;

    // Clear existing overlay boxes
    this.overlayContainer.innerHTML = '';

    const currentUrl = window.location.href.split('#')[0];

    // Find all actions and fields relevant to the current page
    const pageRecords = this.records.filter(
      r => (r.type === 'action' || r.type === 'field') &&
           r.selector &&
           (!r.url || r.url.split('#')[0] === currentUrl)
    );

    const docScrollTop = window.scrollY || document.documentElement.scrollTop;
    const docScrollLeft = window.scrollX || document.documentElement.scrollLeft;

    for (const record of pageRecords) {
      if (!record.selector) continue;
      const element = document.querySelector(record.selector);
      if (!element) continue;

      const rect = element.getBoundingClientRect();

      // Check if element is visible/has dimensions
      if (rect.width === 0 || rect.height === 0) continue;

      // Skip elements that are outside the viewport by too much, but render them if we scroll into them
      const top = rect.top + docScrollTop;
      const left = rect.left + docScrollLeft;

      const overlay = document.createElement('div');
      overlay.style.position = 'absolute';
      overlay.style.top = `${top}px`;
      overlay.style.left = `${left}px`;
      overlay.style.width = `${rect.width}px`;
      overlay.style.height = `${rect.height}px`;
      overlay.style.pointerEvents = 'auto'; // allow hover interactions
      overlay.style.boxSizing = 'border-box';
      overlay.style.borderRadius = '6px';
      overlay.style.transition = 'all 0.15s ease';

      const isAction = record.type === 'action';
      const color = isAction ? '#ff007f' : '#00e5ff'; // Pink for actions, Neon Blue for fields
      overlay.style.border = `2px dashed ${color}`;
      overlay.style.backgroundColor = isAction ? 'rgba(255, 0, 127, 0.04)' : 'rgba(0, 229, 255, 0.04)';

      // Floating Badge
      const badge = document.createElement('div');
      badge.style.position = 'absolute';
      badge.style.top = '-20px';
      badge.style.left = '0';
      badge.style.backgroundColor = color;
      badge.style.color = '#000000';
      badge.style.fontFamily = 'ui-monospace, JetBrains Mono, monospace';
      badge.style.fontSize = '9px';
      badge.style.fontWeight = 'bold';
      badge.style.padding = '1px 5px';
      badge.style.borderRadius = '3px';
      badge.style.whiteSpace = 'nowrap';
      badge.style.boxShadow = '0 2px 4px rgba(0,0,0,0.2)';
      badge.style.zIndex = '2';
      badge.textContent = `${record.type.toUpperCase()}: ${record.id}`;

      overlay.appendChild(badge);

      // Tooltip/label details on hover
      overlay.addEventListener('mouseenter', () => {
        overlay.style.border = `2px solid ${color}`;
        overlay.style.backgroundColor = isAction ? 'rgba(255, 0, 127, 0.12)' : 'rgba(0, 229, 255, 0.12)';
        overlay.style.boxShadow = `0 0 10px ${color}`;
        badge.style.transform = 'scale(1.05)';
      });

      overlay.addEventListener('mouseleave', () => {
        overlay.style.border = `2px dashed ${color}`;
        overlay.style.backgroundColor = isAction ? 'rgba(255, 0, 127, 0.04)' : 'rgba(0, 229, 255, 0.04)';
        overlay.style.boxShadow = 'none';
        badge.style.transform = 'none';
      });

      this.overlayContainer.appendChild(overlay);
    }
  }
}
