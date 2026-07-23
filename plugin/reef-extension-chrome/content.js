// ../src/extraction.ts
function stripTags(value) {
  let result = "";
  let inTag = false;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === "<" && inTag === false) {
      inTag = true;
    } else if (char === ">" && inTag === true) {
      inTag = false;
    } else if (inTag === false) {
      result += char;
    }
  }
  return result.replace(/\s+/g, " ").trim();
}
function generateSelector(element) {
  const path = [];
  let current = element;
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let selector = current.tagName.toLowerCase();
    if (current.id) {
      selector += `#${current.id}`;
      path.unshift(selector);
      break;
    } else if (current.className) {
      const classes = current.className.trim().split(/\s+/);
      if (classes.length) {
        selector += `.${classes.join(".")}`;
      }
    }
    let siblingIndex = 1;
    let sibling = current.previousElementSibling;
    while (sibling) {
      if (sibling.tagName === current.tagName) {
        siblingIndex++;
      }
      sibling = sibling.previousElementSibling;
    }
    if (siblingIndex > 1) {
      selector += `:nth-child(${siblingIndex})`;
    }
    path.unshift(selector);
    current = current.parentElement;
  }
  return path.length > 0 ? path.join(" > ") : element.tagName.toLowerCase();
}
function generateStableSelector(element) {
  const candidates = [];
  const push = (value) => {
    if (value && !candidates.includes(value)) candidates.push(value);
  };
  const escape = (value) => typeof CSS !== "undefined" && CSS.escape ? CSS.escape(value) : value.replace(/(["\\])/g, "\\$1");
  for (const attr of ["data-testid", "data-test", "data-agent-id", "id"]) {
    const value = element.getAttribute(attr);
    if (value) push(attr === "id" ? `#${escape(value)}` : `[${attr}="${escape(value)}"]`);
  }
  const aria = element.getAttribute("aria-label");
  if (aria) push(`[aria-label="${escape(aria)}"]`);
  const role = element.getAttribute("role");
  const name = extractActionName(element);
  if (role && name) push(`[role="${escape(role)}"][aria-label="${escape(name)}"]`);
  if (role) push(`[role="${escape(role)}"]`);
  push(generateSelector(element));
  let sibling = element.previousElementSibling;
  let position = 1;
  while (sibling) {
    if (sibling.tagName === element.tagName) position++;
    sibling = sibling.previousElementSibling;
  }
  push(`xpath=//${element.tagName.toLowerCase()}[${position}]`);
  return candidates;
}
function walkComposed(root, visit, iframePath = []) {
  const elements = root instanceof Document ? Array.from(root.documentElement ? [root.documentElement] : []) : [root];
  const walk = (element, path) => {
    visit(element, path);
    if (element.shadowRoot) walkRoot(element.shadowRoot, path);
    for (const child of Array.from(element.children)) walk(child, path);
    if (element.tagName.toLowerCase() === "iframe") {
      try {
        const frame = element.contentDocument;
        if (frame) walkRoot(frame, [...path, Array.from(element.parentElement?.children || []).indexOf(element)]);
      } catch {
      }
    }
  };
  const walkRoot = (value, path) => {
    if (value instanceof Document) {
      if (value.documentElement) walk(value.documentElement, path);
    } else if (value instanceof ShadowRoot) for (const child of Array.from(value.children)) walk(child, path);
    else walk(value, path);
  };
  for (const element of elements) walk(element, iframePath);
}
function isFocusableAction(element) {
  const tag = element.tagName.toLowerCase();
  return ["a", "button", "input", "textarea", "select", "summary"].includes(tag) || ["button", "link", "tab", "menuitem", "checkbox", "radio", "combobox", "option"].includes(element.getAttribute("role") || "") || element.hasAttribute("contenteditable") || element.hasAttribute("tabindex") && Number(element.getAttribute("tabindex")) >= 0 || element.hasAttribute("data-reef-action");
}
function extractAccessibilityTree(root = document) {
  const records = [];
  walkComposed(root, (element, iframePath) => {
    if (!isFocusableAction(element)) return;
    const label = extractActionName(element);
    if (!label) return;
    const selectors = generateStableSelector(element);
    records.push({ id: `${typeof location !== "undefined" ? location.href : ""}#accessibility-${records.length}`, url: typeof location !== "undefined" ? location.href : "", headingText: label, headingId: `accessibility-${records.length}`, breadcrumb: "", bodyText: label, type: element.matches("input,textarea,select,[contenteditable]") ? "field" : "action", selector: selectors[0], selectors, iframePath, label, destructive: isDestructiveAction(label) });
  });
  return records;
}
function extractHeadingId(fullMatch, text) {
  const idMatch = fullMatch.match(/\bid=["']([^"']+)['"]/i);
  if (idMatch?.[1]) return idMatch[1];
  const stripped = text.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return stripped || Math.random().toString(36).slice(2);
}
function hasExplicitId(fullMatch) {
  return /\bid=["'][^"']+["']/i.test(fullMatch);
}
function findParentSectionId(html, headingMatchEnd) {
  const afterHeading = html.slice(headingMatchEnd, headingMatchEnd + 500);
  const idMatch = afterHeading.match(/<section[^>]*id="([^"]+)"/i);
  if (idMatch?.[1]) return idMatch[1];
  const articleMatch = afterHeading.match(/<article[^>]*id="([^"]+)"/i);
  if (articleMatch?.[1]) return articleMatch[1];
  return null;
}
var headingCache = /* @__PURE__ */ new Map();
function extractSections(html, url) {
  if (headingCache.has(url)) {
    return headingCache.get(url);
  }
  const cleanHtml = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<noscript[\s\S]*?<\/noscript>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ");
  const matches = [];
  const headingRegexGlobal = /<(h[1-6])[^>]*>([\s\S]*?)<\/h[1-6]>/gi;
  let match;
  headingRegexGlobal.lastIndex = 0;
  while ((match = headingRegexGlobal.exec(cleanHtml)) !== null) {
    const [, tag, text] = match;
    const headingText = stripTags(text);
    const level = parseInt(tag[1], 10);
    matches.push({
      level,
      index: match.index,
      text: headingText,
      id: extractHeadingId(match[0], headingText),
      hasRealId: hasExplicitId(match[0])
    });
  }
  const len = matches.length;
  const sections = new Array(len);
  for (let i = 0; i < len; i++) {
    const heading = matches[i];
    const nextHeading = matches[i + 1];
    const start = heading.index + heading.text.length;
    const end = nextHeading?.index ?? cleanHtml.length;
    const content = cleanHtml.slice(start, end);
    const bodyText = stripTags(content).replace(/\s+/g, " ").trim();
    let breadcrumb = "";
    for (let j = 0; j <= i; j++) {
      if (j > 0) breadcrumb += " \u203A ";
      breadcrumb += matches[j].text;
    }
    const parentSectionId = heading.hasRealId ? null : findParentSectionId(cleanHtml, heading.index + heading.text.length);
    const selector = heading.hasRealId ? "#" + heading.id : parentSectionId ? "#" + parentSectionId : void 0;
    sections[i] = {
      id: `${url}#${heading.id}`,
      url: `${url}#${heading.id}`,
      headingText: heading.text,
      headingId: heading.id,
      breadcrumb,
      bodyText,
      type: "section",
      selector
    };
  }
  headingCache.set(url, sections);
  return sections;
}
function extractActionName(element) {
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel?.trim()) return ariaLabel.trim();
  const ariaLabelledBy = element.getAttribute("aria-labelledby");
  if (ariaLabelledBy) {
    const labelledElement = document.getElementById(ariaLabelledBy);
    if (labelledElement?.textContent?.trim()) {
      return labelledElement.textContent.trim();
    }
  }
  const textContent = element.textContent?.trim();
  if (textContent) return textContent;
  const title = element.getAttribute("title");
  if (title?.trim()) return title.trim();
  return null;
}
function isDestructiveAction(label) {
  const destructiveVerbs = [
    "delete",
    "remove",
    "cancel subscription",
    "unsubscribe",
    "pay",
    "checkout",
    "submit order",
    "confirm"
  ];
  const lowerLabel = label.toLowerCase();
  return destructiveVerbs.some((verb) => lowerLabel.includes(verb));
}
function extractActions(html, url, excludeSelectors) {
  const actions = [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const selectors = [
    "button",
    '[role="button"]',
    'input[type="button"]',
    'input[type="submit"]',
    "summary",
    "[data-reef-action]"
  ];
  const elements = Array.from(doc.querySelectorAll(selectors.join(",")));
  for (const element of elements) {
    if (excludeSelectors && element.matches(excludeSelectors)) continue;
    const label = extractActionName(element);
    if (!label) continue;
    const selectors2 = generateStableSelector(element);
    actions.push({
      id: `${url}#action-${actions.length}`,
      url,
      headingText: label,
      headingId: `action-${actions.length}`,
      breadcrumb: "",
      bodyText: label,
      type: "action",
      selector: selectors2[0],
      selectors: selectors2,
      destructive: isDestructiveAction(label),
      label
    });
  }
  return actions;
}
function extractFields(html, url) {
  const fields = [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const formElements = Array.from(doc.querySelectorAll("form"));
  for (const form of formElements) {
    let breadcrumb = "";
    let current = form.parentElement;
    while (current && current !== doc.body) {
      if (current.matches('h1, h2, h3, h4, h5, h6, article, section, [role="main"], main')) {
        const headingText = current.textContent?.trim() || "";
        if (headingText) {
          breadcrumb = headingText;
        }
        break;
      }
      current = current.parentElement;
    }
    const inputs = Array.from(form.querySelectorAll("input, textarea, select"));
    for (const input of inputs) {
      if (input.matches('input[type="hidden"], input[type="button"], input[type="submit"], input[type="reset"]')) {
        continue;
      }
      let label = "";
      const id = input.id;
      if (id) {
        const labelElement = doc.querySelector(`label[for="${id}"]`);
        if (labelElement) {
          label = labelElement.textContent?.trim() || "";
        }
      }
      if (!label) {
        const parentLabel = input.closest("label");
        if (parentLabel) {
          label = parentLabel.textContent?.trim() || "";
          const inputElement2 = input;
          if (label && inputElement2.value && label.includes(inputElement2.value)) {
            label = label.replace(inputElement2.value, "").trim();
          }
        }
      }
      if (!label) {
        const inputElement2 = input;
        const placeholder = "placeholder" in inputElement2 ? inputElement2.placeholder : "";
        label = placeholder || input.getAttribute("aria-label") || "";
      }
      if (!label) continue;
      const selectors = generateStableSelector(input);
      const inputElement = input;
      fields.push({
        id: `${url}#field-${fields.length}`,
        url,
        headingText: label,
        headingId: `field-${fields.length}`,
        breadcrumb,
        bodyText: label,
        type: "field",
        selector: selectors[0],
        selectors,
        label,
        value: inputElement.value
      });
    }
  }
  return fields;
}
function extractLinks(html, url) {
  const links = [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const anchors = Array.from(doc.querySelectorAll("a[href]"));
  for (const anchor of anchors) {
    if (anchor.hasAttribute("rel") && anchor.getAttribute("rel")?.toLowerCase().includes("nofollow")) continue;
    const href = anchor.getAttribute("href");
    if (!href) continue;
    if (href === "#" || href.startsWith("javascript:")) continue;
    const linkText = anchor.textContent?.trim() || "";
    if (!linkText) continue;
    const resolvedUrl = resolveUrl(href, url);
    const isExternal = !resolvedUrl.startsWith(window.location.origin);
    const selectors = generateStableSelector(anchor);
    links.push({
      id: `${url}#link-${links.length}`,
      url: resolvedUrl,
      headingText: linkText,
      headingId: `link-${links.length}`,
      breadcrumb: "",
      bodyText: linkText,
      type: isExternal ? "link" : "section",
      selector: selectors[0],
      selectors
    });
  }
  return links;
}
function extractFiles(html, url, extensions) {
  const files = [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const fileExtensions = extensions?.split(",").map((e) => e.trim().toLowerCase()) ?? ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "zip", "csv"];
  const anchors = Array.from(doc.querySelectorAll("a[href]"));
  for (const anchor of anchors) {
    const href = anchor.getAttribute("href");
    if (!href) continue;
    const isFile = fileExtensions.some(
      (ext) => href.toLowerCase().endsWith(`.${ext}`) || href.toLowerCase().endsWith(`.${ext}?`) || href.toLowerCase().endsWith(`.${ext}#`)
    );
    if (!isFile) continue;
    const linkText = anchor.textContent?.trim() || href.split("/").pop() || "";
    if (!linkText) continue;
    const resolvedUrl = resolveUrl(href, url);
    const selectors = generateStableSelector(anchor);
    files.push({
      id: `${url}#file-${files.length}`,
      url: resolvedUrl,
      headingText: linkText,
      headingId: `file-${files.length}`,
      breadcrumb: "",
      bodyText: linkText,
      type: "file",
      selector: selectors[0],
      selectors
    });
  }
  return files;
}
function extractMedia(html, url) {
  const media = [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const images = Array.from(doc.querySelectorAll("img"));
  for (const img of images) {
    const alt = img.alt.trim();
    if (!alt) continue;
    let caption = "";
    const figure = img.closest("figure");
    if (figure) {
      const figcaption = figure.querySelector("figcaption");
      if (figcaption) {
        caption = figcaption.textContent?.trim() || "";
      }
    }
    const textToIndex = caption ? `${alt} ${caption}` : alt;
    if (!textToIndex.trim()) continue;
    const selectors = generateStableSelector(img);
    media.push({
      id: `${url}#media-image-${media.length}`,
      url,
      headingText: alt,
      headingId: `media-image-${media.length}`,
      breadcrumb: "",
      bodyText: textToIndex,
      type: "media",
      selector: selectors[0],
      selectors
    });
  }
  const mediaElements = Array.from(doc.querySelectorAll("video, audio"));
  for (const element of mediaElements) {
    const title = element.getAttribute("title") || element.getAttribute("aria-label") || "";
    if (!title) continue;
    let transcript = "";
    const tracks = Array.from(element.querySelectorAll('track[kind="captions"], track[kind="subtitles"]'));
    for (const track of tracks) {
      const src = track.getAttribute("src");
      if (src) {
        transcript += `[Transcript available: ${src}] `;
      }
    }
    const textToIndex = transcript ? `${title} ${transcript}` : title;
    if (!textToIndex.trim()) continue;
    const selectors = generateStableSelector(element);
    media.push({
      id: `${url}#media-${media.length}`,
      url,
      headingText: title,
      headingId: `media-${media.length}`,
      breadcrumb: "",
      bodyText: textToIndex,
      type: "media",
      selector: selectors[0],
      selectors,
      transcript: transcript.trim()
    });
  }
  return media;
}
function extractStructuredData(html, url) {
  const structured = [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const jsonLdScripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
  for (const script of jsonLdScripts) {
    try {
      const data = JSON.parse(script.textContent || "{}");
      if (Array.isArray(data) ? data.some((item) => item["@type"] === "FAQPage") : data["@type"] === "FAQPage") {
        const faqItems = Array.isArray(data) ? data.flatMap((item) => item.mainEntity || []) : data.mainEntity || [];
        for (const [index, question] of faqItems.entries()) {
          if (!question || !question.name) continue;
          const answer = question.acceptedAnswer?.text || question.suggestedAnswer?.text || "";
          if (!answer) continue;
          const textToIndex = `${question.name} ${answer}`;
          structured.push({
            id: `${url}#structured-faq-${index}`,
            url,
            headingText: question.name,
            headingId: `structured-faq-${index}`,
            breadcrumb: "",
            bodyText: textToIndex,
            type: "structured",
            structuredData: { question: question.name, answer }
          });
        }
      } else if (data["@type"]) {
        const type = data["@type"];
        const name = data.name || data.headline || "";
        const description = data.description || "";
        if (!name && !description) continue;
        const textToIndex = `${name} ${description}`.trim();
        if (!textToIndex) continue;
        structured.push({
          id: `${url}#structured-${type.toLowerCase()}-${structured.length}`,
          url,
          headingText: name || "Structured Data",
          headingId: `structured-${type.toLowerCase()}-${structured.length}`,
          breadcrumb: "",
          bodyText: textToIndex,
          type: "structured",
          structuredData: data
        });
      }
    } catch (e) {
      continue;
    }
  }
  return structured;
}
function resolveUrl(value, base) {
  if (!value) return base;
  try {
    return new URL(value, base).toString();
  } catch {
    return value;
  }
}

// ../src/agent.ts
var Agent = class {
  constructor(index, inspector, actionsMode = "execute") {
    this.actionCount = 0;
    this.lastRoute = typeof window !== "undefined" ? window.location.href : "";
    this.lastAction = { success: false, reason: "no-action" };
    this.index = index;
    this.inspector = inspector;
    this.options = typeof actionsMode === "string" ? { actionsMode } : actionsMode;
    this.actionsMode = this.options.actionsMode ?? "execute";
    this.installRouteObserver();
  }
  async click(selector) {
    if (typeof selector !== "string" && selector.destructive && (this.actionsMode === "navigate-only" || this.options.destructive === false)) throw new Error("destructive-action-blocked");
    this.guardAction();
    const resolved = await this.resolveSelector(selector);
    if (!resolved.success) {
      if (typeof selector !== "string" && this.actionsMode === "navigate-only") return this;
      throw new Error(resolved.reason || "Click failed");
    }
    const element = resolved.element;
    this.ensureVisible(element ?? null);
    const before = this.fingerprint();
    if (element && typeof MouseEvent !== "undefined") {
      const clickEvent = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: typeof window !== "undefined" ? window : void 0
      });
      element.dispatchEvent(clickEvent);
    }
    await this.waitForStable({ quietMs: 50, timeout: 1e3 });
    if (!this.changedSince(before) && typeof selector !== "string" && selector.selectors?.length) {
      const retry = await this.resolveSelector({ ...selector, selectors: selector.selectors.slice(1) });
      if (retry.success && retry.element && retry.element !== element) retry.element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    }
    this.lastAction = { success: true, changed: this.changedSince(before), url: typeof window !== "undefined" ? window.location.href : void 0, element };
    return this;
  }
  async type(selector, value) {
    this.guardAction();
    const resolved = await this.resolveSelector(selector);
    if (!resolved.success) {
      throw new Error(resolved.reason || "Type failed");
    }
    const element = resolved.element;
    this.ensureVisible(element);
    if (element && "value" in element) {
      const descriptor = Object.getOwnPropertyDescriptor(element, "value");
      if (descriptor && descriptor.set) {
        descriptor.set.call(element, value);
      } else {
        element.value = value;
      }
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
    }
    this.lastAction = { success: true, changed: true, url: typeof window !== "undefined" ? window.location.href : void 0, element: element ?? void 0 };
    return this;
  }
  async submit(selector) {
    let element = null;
    if (selector) {
      const resolved = await this.resolveSelector(selector);
      if (resolved.success && resolved.element) {
        element = resolved.element;
      }
    } else if (typeof document !== "undefined") {
      element = document.querySelector("form") || document.querySelector('button[type="submit"]') || document.querySelector('input[type="submit"]');
    }
    if (element) {
      if (element instanceof HTMLFormElement) {
        element.dispatchEvent(new Event("submit", { bubbles: true }));
      } else {
        const clickEvent = new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          view: typeof window !== "undefined" ? window : void 0
        });
        element.dispatchEvent(clickEvent);
      }
      this.lastAction = { success: true, changed: true, url: typeof window !== "undefined" ? window.location.href : void 0, element };
    }
    return this;
  }
  getLastActionResult() {
    return { ...this.lastAction };
  }
  async navigate(url) {
    if ((url.startsWith("http://") || url.startsWith("https://") || url.startsWith("/")) && typeof window !== "undefined") {
      const target = new URL(url, window.location.href).toString();
      const sameOrigin = new URL(target).origin === window.location.origin;
      if (sameOrigin && target.split("#")[0] === window.location.href.split("#")[0] && window.history.pushState) {
        window.history.pushState({}, "", target);
        window.dispatchEvent(new PopStateEvent("popstate"));
        await this.waitForStable();
      } else window.location.href = target;
    }
    return this;
  }
  async back() {
    if (typeof window !== "undefined") {
      window.history.back();
    }
    return this;
  }
  async forward() {
    if (typeof window !== "undefined") {
      window.history.forward();
    }
    return this;
  }
  async wait(timeout = 1e3) {
    await new Promise((resolve) => setTimeout(resolve, timeout));
    return this;
  }
  async extract(selector) {
    const resolved = await this.resolveSelector(selector);
    if (!resolved.success) {
      throw new Error(resolved.reason || "Extract failed");
    }
    const element = resolved.element;
    if (!element) {
      throw new Error("Element not found");
    }
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
      return element.value;
    }
    return element.textContent?.trim() || "";
  }
  async observe(options) {
    if (typeof document === "undefined") return [];
    const records = extractAccessibilityTree(options?.root ?? document).filter((record) => {
      if (options?.includeHidden) return true;
      const element = this.resolveRecordElement(record);
      return !!element && (!options?.inViewport && options?.inViewport !== false ? this.isVisible(element) : this.isVisible(element));
    });
    this.inspector.setRecords(records);
    return records;
  }
  async waitForStable(options) {
    if (typeof document === "undefined" || typeof MutationObserver === "undefined") return this;
    const quietMs = options?.quietMs ?? 250;
    const timeout = options?.timeout ?? 5e3;
    await new Promise((resolve) => {
      let quietTimer;
      const observer = new MutationObserver(() => {
        clearTimeout(quietTimer);
        quietTimer = setTimeout(done, quietMs);
      });
      const done = () => {
        clearTimeout(quietTimer);
        observer.disconnect();
        resolve();
      };
      observer.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
      quietTimer = setTimeout(done, quietMs);
      setTimeout(done, timeout);
    });
    return this;
  }
  isVisible(element) {
    if (!element) return false;
    const style = typeof window !== "undefined" ? window.getComputedStyle(element) : null;
    if (style && (style.display === "none" || style.visibility === "hidden" || style.opacity === "0")) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && (typeof window === "undefined" || rect.bottom >= 0 && rect.right >= 0 && rect.top <= window.innerHeight && rect.left <= window.innerWidth);
  }
  async exhaustPagination(options) {
    const maxPages = options?.maxPages ?? 10;
    const nextText = (options?.nextText ?? ["next", "older", "more"]).map((v) => v.toLowerCase());
    const merged = /* @__PURE__ */ new Map();
    for (let page = 0; page < maxPages && this.actionCount < (options?.maxActionsPerRun ?? this.options.maxActionsPerRun ?? Infinity); page++) {
      const records = await this.observe({ inViewport: false, includeHidden: true });
      records.forEach((record) => merged.set(`${record.label}:${record.type}`, record));
      const next = records.find((record) => record.type === "action" && !record.destructive && nextText.some((text) => (record.label || "").toLowerCase().includes(text)));
      if (next) await this.click(next);
      else if (options?.scroll !== false && typeof window !== "undefined") {
        window.scrollTo(0, document.body.scrollHeight);
        await this.waitForStable();
      } else break;
      if (!next && options?.scroll === false) break;
    }
    return [...merged.values()];
  }
  async resolveSelector(selector) {
    let element = null;
    if (typeof selector === "string") {
      element = this.queryComposed(selector);
    } else if (selector) {
      const record = this.index.allSections.find((r) => r.id === selector.id);
      const candidates = record?.selectors?.length ? record.selectors : record?.selector ? [record.selector] : [];
      for (const candidate of candidates) {
        element = this.queryComposed(candidate, record?.iframePath);
        if (element) break;
      }
      if (!element) element = this.resolveRecordElement(selector);
      if (!element && selector.headingText) {
        const match = await this.findActionable(selector.headingText);
        if (match && match.id !== selector.id) return this.resolveSelector(match);
      }
    }
    if (!element) {
      return { success: false, reason: "element-not-found" };
    }
    return { success: true, element };
  }
  queryComposed(selector, iframePath) {
    if (typeof document === "undefined") return null;
    const find = (root) => {
      if (selector.startsWith("xpath=")) {
        try {
          return document.evaluate(selector.slice(6), root, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        } catch {
          return null;
        }
      }
      const direct = root.querySelector(selector);
      if (direct) return direct;
      for (const host of Array.from(root.querySelectorAll("*"))) if (host.shadowRoot) {
        const found = find(host.shadowRoot);
        if (found) return found;
      }
      return null;
    };
    if (!iframePath?.length) return find(document);
    let current = document;
    for (const position of iframePath) {
      const frame = current?.querySelectorAll("iframe")[position];
      current = frame?.contentDocument ?? null;
    }
    return current ? find(current) : null;
  }
  resolveRecordElement(record) {
    const candidates = record.selectors?.length ? record.selectors : record.selector ? [record.selector] : [];
    for (const selector of candidates) {
      const found = this.queryComposed(selector, record.iframePath);
      if (found) return found;
    }
    return null;
  }
  ensureVisible(element) {
    if (element && !this.isVisible(element)) element.scrollIntoView({ block: "center", inline: "nearest" });
  }
  fingerprint() {
    return `${typeof window !== "undefined" ? window.location.href : ""}|${typeof document !== "undefined" ? document.body?.textContent?.length : 0}`;
  }
  changedSince(before) {
    return this.fingerprint() !== before;
  }
  guardAction() {
    this.actionCount++;
    if (this.actionCount > (this.options.maxActionsPerRun ?? Infinity)) throw new Error("max-actions-per-run-exceeded");
    if (this.options.rateLimitMs) return;
  }
  installRouteObserver() {
    if (typeof window === "undefined") return;
    const onRoute = () => {
      this.lastRoute = window.location.href;
      void this.observe({ inViewport: false });
    };
    window.addEventListener("popstate", onRoute);
    window.addEventListener("hashchange", onRoute);
    for (const method of ["pushState", "replaceState"]) {
      const historyMethod = window.history[method].bind(window.history);
      window.history[method] = (...args) => {
        const result = historyMethod(...args);
        onRoute();
        return result;
      };
    }
  }
  async findActionable(text) {
    const results = this.index.allSections.filter(
      (r) => r.type === "action" || r.type === "field"
    );
    const normalized = text.toLowerCase().trim();
    for (const record of results) {
      if (record.headingText.toLowerCase().includes(normalized) || record.label?.toLowerCase().includes(normalized)) {
        return record;
      }
    }
    return null;
  }
  async executeWorkflow(steps, options) {
    const maxRetries = options?.maxRetries ?? 0;
    const retryDelay = options?.retryDelay ?? 500;
    const stopOnError = options?.stopOnError ?? true;
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      options?.onStepStart?.(step, i);
      let attempt = 0;
      let success = false;
      while (attempt <= maxRetries && !success) {
        try {
          switch (step.action) {
            case "click":
              if (step.selector) {
                await this.click(step.selector);
              } else if (step.recordId) {
                const record = this.index.allSections.find((r) => r.id === step.recordId);
                if (record) await this.click(record);
              }
              success = true;
              break;
            case "type":
              if (step.selector) {
                await this.type(step.selector, step.value || "");
              } else if (step.recordId) {
                const record = this.index.allSections.find((r) => r.id === step.recordId);
                if (record) await this.type(record, step.value || "");
              }
              success = true;
              break;
            case "navigate":
              if (step.url) {
                await this.navigate(step.url);
                await this.waitForNavigation();
              }
              success = true;
              break;
            case "extract":
              success = true;
              break;
            case "submit":
              await this.submit(step.selector);
              success = true;
              break;
            case "back":
              await this.back();
              success = true;
              break;
            case "forward":
              await this.forward();
              success = true;
              break;
            case "wait":
              if (step.timeout) {
                await this.wait(step.timeout);
              }
              success = true;
              break;
          }
          options?.onStepComplete?.(step, i, success);
        } catch (error) {
          attempt++;
          if (attempt > maxRetries) {
            options?.onStepError?.(step, i, error);
            if (stopOnError) {
              throw error;
            }
          } else {
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
          }
        }
      }
    }
  }
  async waitForNavigation() {
    await new Promise((resolve) => {
      if (typeof document !== "undefined") {
        const checkReady = () => {
          if (document.readyState === "complete") {
            resolve();
          } else {
            setTimeout(checkReady, 100);
          }
        };
        checkReady();
      } else {
        resolve();
      }
    });
  }
  getSession() {
    return {
      id: this.generateSessionId(),
      url: typeof window !== "undefined" ? window.location.href : "about:blank",
      timestamp: Date.now(),
      cookies: this.getCookies(),
      localStorage: this.getLocalStorageSnapshot()
    };
  }
  generateSessionId() {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
  getCookies() {
    const cookies = {};
    if (typeof document !== "undefined") {
      document.cookie.split(";").forEach((cookie) => {
        const [name, value] = cookie.trim().split("=");
        if (name) cookies[name] = value || "";
      });
    }
    return cookies;
  }
  getLocalStorageSnapshot() {
    const storage = {};
    try {
      if (typeof localStorage !== "undefined") {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key) {
            storage[key] = localStorage.getItem(key) || "";
          }
        }
      }
    } catch (e) {
    }
    return storage;
  }
};

// ../src/search-index.ts
function createTrieNode() {
  return {
    children: /* @__PURE__ */ new Map(),
    records: []
  };
}
function createSearchIndex() {
  return {
    headingIndex: /* @__PURE__ */ new Map(),
    headingIds: /* @__PURE__ */ new Map(),
    bodyIndex: /* @__PURE__ */ new Map(),
    allSections: [],
    queryCache: /* @__PURE__ */ new Map(),
    popularQueries: [],
    docFrequency: /* @__PURE__ */ new Map(),
    fieldDocFreq: {
      headingText: /* @__PURE__ */ new Map(),
      bodyText: /* @__PURE__ */ new Map(),
      label: /* @__PURE__ */ new Map(),
      breadcrumb: /* @__PURE__ */ new Map()
    },
    totalDocs: 0,
    queryPopularity: /* @__PURE__ */ new Map(),
    version: 1,
    headingTrie: createTrieNode()
  };
}

// src/content.ts
var HARD_EXCLUSION_SELECTOR = 'input[type="password"], input[name*="card" i], input[autocomplete*="cc-" i], input[name*="ssn" i], input[name*="social-security" i], [data-reef-agent="off"], [data-sensitive]';
function isSensitiveElement(element, customExclusions = []) {
  if (element.matches(HARD_EXCLUSION_SELECTOR) || element.closest('[data-reef-agent="off"], [data-sensitive]')) {
    return true;
  }
  return customExclusions.some((selector) => {
    try {
      return element.matches(selector) || !!element.closest(selector);
    } catch {
      return false;
    }
  });
}
function getAuthoritativeManifest() {
  if (typeof window !== "undefined" && window.__reefAgentManifest) {
    return window.__reefAgentManifest;
  }
  const scriptTag = document.querySelector('script[type="application/agent-manifest+json"]');
  if (scriptTag?.textContent) {
    try {
      return JSON.parse(scriptTag.textContent);
    } catch {
    }
  }
  return null;
}
function extractPageManifest(customExclusions = []) {
  const authoritative = getAuthoritativeManifest();
  if (authoritative) {
    const filteredRecords = authoritative.records.filter((record) => {
      if (!record.selector) return true;
      try {
        const el = document.querySelector(record.selector);
        return el ? !isSensitiveElement(el, customExclusions) : true;
      } catch {
        return true;
      }
    });
    return {
      ...authoritative,
      records: filteredRecords
    };
  }
  const url = location.href;
  const html = document.documentElement.outerHTML;
  const rawRecords = [
    ...extractSections(html, url),
    ...extractActions(html, url),
    ...extractFields(html, url),
    ...extractLinks(html, url),
    ...extractFiles(html, url),
    ...extractMedia(html, url),
    ...extractStructuredData(html, url),
    ...extractAccessibilityTree(document)
  ];
  const filtered = rawRecords.filter((record) => {
    if (record.selector) {
      try {
        const element = document.querySelector(record.selector);
        if (element && isSensitiveElement(element, customExclusions)) return false;
      } catch {
      }
    }
    return true;
  });
  const deduped = [
    ...new Map(
      filtered.map((record) => [`${record.type}:${record.headingText}:${record.selector || record.url}`, record])
    ).values()
  ];
  return {
    version: 1,
    url,
    generatedAt: Date.now(),
    records: deduped,
    excludedCount: rawRecords.length - deduped.length
  };
}
var dummyInspector = {
  activate: () => {
  },
  deactivate: () => {
  },
  isActive: () => false,
  setRecords: () => {
  }
};
var currentAgent = null;
function getOrCreateAgent(actionsMode = "execute") {
  const index = createSearchIndex();
  currentAgent = new Agent(index, dummyInspector, { actionsMode });
  return currentAgent;
}
if (typeof chrome !== "undefined" && chrome.runtime?.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
      try {
        if (message.type === "PING") {
          sendResponse({ success: true, url: location.href });
          return;
        }
        if (message.type === "GET_MANIFEST" || message.type === "RESCAN") {
          const manifest = extractPageManifest(message.options?.exclusionSelectors || []);
          sendResponse({ success: true, manifest });
          return;
        }
        if (message.type === "EXECUTE_ACTION" && message.record) {
          const actionsMode = message.options?.actionsMode || "execute";
          const agent = getOrCreateAgent(actionsMode);
          if (message.record.destructive && actionsMode === "navigate-only") {
            sendResponse({ success: false, error: "destructive-action-blocked-by-mode" });
            return;
          }
          if (message.actionType === "click" || message.record.type === "action" || message.record.type === "link") {
            if (message.record.selector) {
              await agent.click(message.record);
            } else if (message.record.url) {
              location.href = message.record.url;
            }
            sendResponse({ success: true, url: location.href });
            return;
          }
          if (message.actionType === "type" || message.record.type === "field") {
            const valueToType = message.value ?? message.record.value ?? "";
            await agent.type(message.record, valueToType);
            sendResponse({ success: true });
            return;
          }
          sendResponse({ success: false, error: "unknown-action-type" });
          return;
        }
        if (message.type === "HIGHLIGHT_RECORD" && message.record?.selector) {
          const el = document.querySelector(message.record.selector);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            const origOutline = el.style.outline;
            el.style.outline = "3px solid #00a8b5";
            setTimeout(() => {
              el.style.outline = origOutline;
            }, 2e3);
          }
          sendResponse({ success: true });
          return;
        }
        sendResponse({ success: false, error: "unsupported-message-type" });
      } catch (err) {
        sendResponse({ success: false, error: err?.message || String(err) });
      }
    })();
    return true;
  });
}
export {
  extractPageManifest
};
//# sourceMappingURL=content.js.map
