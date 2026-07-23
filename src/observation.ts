import type { IndexRecord, ObservationOptions, StableWaitOptions } from './types.js';
import { extractAccessibilityTree } from './extraction.js';

/** Standalone live-DOM observation helpers for integrations that do not need Agent state. */
export function observeDocument(options?: ObservationOptions): IndexRecord[] {
  if (typeof document === 'undefined') return [];
  return extractAccessibilityTree(options?.root ?? document).filter(record => {
    if (options?.includeHidden) return true;
    const element = record.selector ? document.querySelector(record.selector) : null;
    return !!element && (element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0);
  });
}

export function waitForStableDom(options?: StableWaitOptions): Promise<void> {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return Promise.resolve();
  const quietMs = options?.quietMs ?? 250;
  const timeout = options?.timeout ?? 5000;
  return new Promise(resolve => {
    let quietTimer: ReturnType<typeof setTimeout>;
    let timeoutTimer: ReturnType<typeof setTimeout>;
    const observer = new MutationObserver(() => { clearTimeout(quietTimer); quietTimer = setTimeout(done, quietMs); });
    const done = () => { clearTimeout(quietTimer); clearTimeout(timeoutTimer); observer.disconnect(); resolve(); };
    observer.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
    quietTimer = setTimeout(done, quietMs);
    timeoutTimer = setTimeout(done, timeout);
  });
}
