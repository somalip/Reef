/**
 * @file Action execution and navigation logic.
 * Handles navigating to sections, executing actions on elements, and deferred actions.
 */

import type { IndexRecord } from '../types.js';
import { escapeHtml } from '../ui/ui-helpers.js';
import { findClosestWord } from '../search-index.js';

export class ActionExecutor {
  private deferredScrollHandler: () => void = () => {};
  private deferredActionHandler: () => void = () => {};

  navigateToSection(result: IndexRecord, closeCallback: () => void): void {
    const currentUrl = window.location.href.split('#')[0];
    const targetUrl = result.url.split('#')[0];
    const isSamePage = currentUrl === targetUrl;

    if (result.selector) {
      const element = document.querySelector(result.selector);
      if (element) {
        this.highlightAndScrollTo(element as HTMLElement, closeCallback);
        return;
      }
    }

    if (isSamePage) {
      const heading = this.findHeadingElementByText(result.headingText);
      if (heading) {
        this.highlightAndScrollTo(heading, closeCallback);
        return;
      }
    }

    this.setupDeferredScroll(result);
    closeCallback();
    window.location.href = result.url;
  }

  private findHeadingElementByText(headingText: string): HTMLElement | null {
    const normalized = headingText.trim().toLowerCase();
    if (!normalized) return null;
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    for (const heading of Array.from(headings)) {
      if (heading.textContent?.trim().toLowerCase() === normalized) {
        return heading as HTMLElement;
      }
    }
    return null;
  }

  private highlightAndScrollTo(element: HTMLElement, closeCallback: () => void): void {
    closeCallback();
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    element.style.boxShadow = '0 0 0 3px rgba(67, 217, 200, 0.5)';
    element.style.borderRadius = '4px';
    setTimeout(() => {
      element.style.boxShadow = '';
    }, 2000);
  }

  private setupDeferredScroll(result: IndexRecord): void {
    const target = {
      headingText: result.headingText,
      selector: result.selector,
    };
    try {
      sessionStorage.setItem('reef-deferred-scroll', JSON.stringify(target));
    } catch (error) {
      console.error('[reef] Failed to store deferred scroll target:', error);
    }
  }

  handleDeferredScroll(): void {
    const raw = sessionStorage.getItem('reef-deferred-scroll');
    if (!raw) return;
    sessionStorage.removeItem('reef-deferred-scroll');

    let target: { headingText: string; selector?: string } | null = null;
    try {
      target = JSON.parse(raw);
    } catch (error) {
      console.error('[reef] Failed to parse deferred scroll target:', error);
      return;
    }
    if (!target || !target.headingText) return;
    const deferredTarget = target;

    const findTarget = (): HTMLElement | null => {
      if (deferredTarget.selector) {
        const element = document.querySelector(deferredTarget.selector) as HTMLElement | null;
        if (element) return element;
      }
      return this.findHeadingElementByText(deferredTarget.headingText);
    };

    const attempt = (): boolean => {
      const element = findTarget();
      if (!element) return false;
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      element.style.boxShadow = '0 0 0 3px rgba(67, 217, 200, 0.5)';
      element.style.borderRadius = '4px';
      setTimeout(() => {
        element.style.boxShadow = '';
      }, 2000);
      return true;
    };

    const start = () => {
      if (attempt()) return;
      const observer = new MutationObserver(() => {
        if (attempt()) observer.disconnect();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => observer.disconnect(), 5000);
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
      start();
    }
  }

  executeAction(result: IndexRecord, actionsMode?: string, showToast?: (msg: string) => void): void {
    switch (result.type) {
      case 'action':
        this.executeActionResult(result, actionsMode, showToast);
        break;
      case 'field':
        this.focusField(result);
        break;
      case 'link':
      case 'file':
      case 'media':
      case 'structured':
        window.location.href = result.url;
        break;
      case 'section':
        this.navigateToSection(result, () => {});
        break;
    }
  }

  private executeActionResult(result: IndexRecord, actionsMode?: string, showToast?: (msg: string) => void): void {
    if (result.destructive && actionsMode !== 'execute') {
      this.highlightAndNavigate(result);
      return;
    }

    const currentUrl = window.location.href.split('#')[0];
    const targetUrl = result.url.split('#')[0];

    if (currentUrl === targetUrl) {
      this.executeActionOnCurrentPage(result, showToast);
    } else {
      this.setupDeferredAction(result);
    }
  }

  private executeActionOnCurrentPage(result: IndexRecord, showToast?: (msg: string) => void): void {
    if (!result.selector) {
      if (result.type === 'field') {
        this.focusField(result);
      }
      return;
    }

    try {
      const element = document.querySelector(result.selector);
      if (!element) {
        showToast?.('Could not find that element on the page. It may have changed.');
        return;
      }

      if (result.type === 'action') {
        const clickEvent = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window,
        });
        element.dispatchEvent(clickEvent);
      } else if (result.type === 'field') {
        (element as HTMLElement).focus();
      }
    } catch (error) {
      console.error('Failed to execute action:', error);
      showToast?.('Could not interact with that element. It may have changed or be unavailable.');
    }
  }

  private focusField(result: IndexRecord): void {
    if (!result.selector) return;
    try {
      const element = document.querySelector(result.selector);
      if (element) {
        (element as HTMLElement).focus();
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
          element.select();
        }
      }
    } catch (error) {
      console.error('Failed to focus field:', error);
    }
  }

  private setupDeferredAction(result: IndexRecord): void {
    const deferredAction = {
      selector: result.selector,
      type: result.type,
      label: result.label,
      destructive: result.destructive,
    };
    sessionStorage.setItem('reef-deferred-action', JSON.stringify(deferredAction));
    window.location.href = result.url;
  }

  handleDeferredActions(): void {
    const deferredActionStr = sessionStorage.getItem('reef-deferred-action');
    if (!deferredActionStr) return;

    try {
      const deferredAction = JSON.parse(deferredActionStr);
      sessionStorage.removeItem('reef-deferred-action');

      if (deferredAction.selector) {
        const element = document.querySelector(deferredAction.selector);
        if (element) {
          if (deferredAction.type === 'action' && !deferredAction.destructive) {
            const clickEvent = new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              view: window,
            });
            element.dispatchEvent(clickEvent);
          } else if (deferredAction.type === 'field') {
            (element as HTMLElement).focus();
          }
        }
      }
    } catch (error) {
      console.error('Failed to handle deferred action:', error);
      sessionStorage.removeItem('reef-deferred-action');
    }
  }

  private highlightAndNavigate(result: IndexRecord): void {
    window.location.href = result.url;
    if (result.selector) {
      const selector = result.selector;
      const observer = new MutationObserver(() => {
        const element = document.querySelector(selector) as HTMLElement | null;
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.style.boxShadow = '0 0 0 3px rgba(108, 140, 255, 0.5)';
          element.style.borderRadius = '4px';
          observer.disconnect();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => observer.disconnect(), 5000);
    }
  }
}