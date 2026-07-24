"use strict";
var ReefAgentReady = (() => {
  // src/extraction.ts
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

  // src/agent-ready.ts
  var DEFAULTS = {
    mode: "execute",
    disableAriaBackfill: false,
    disableLiveUpdates: false,
    debounceMs: 150,
    maxRescansPerMinute: 30,
    debug: false,
    publishWellKnown: false
  };
  function scriptConfig() {
    if (typeof document === "undefined") return {};
    const script = Array.from(document.scripts).find((item) => item.src.includes("reef-agent-ready"));
    if (!script) return {};
    const get = (name) => script.getAttribute(`data-${name}`) ?? void 0;
    return {
      exclude: get("exclude"),
      mode: get("mode") ?? void 0,
      disableAriaBackfill: get("disable-aria-backfill") === "true",
      disableLiveUpdates: get("disable-live-updates") === "true",
      debounceMs: Number(get("debounce-ms")) || void 0,
      maxRescansPerMinute: Number(get("max-rescans-per-minute")) || void 0,
      debug: get("debug") === "true",
      publishWellKnown: get("publish-well-known") === "true"
    };
  }
  function isExcluded(element, selectors) {
    if (element.closest('[data-reef-agent="off"]') || element.matches('[data-reef-agent="off"], [data-sensitive]')) return true;
    if (element.matches('input[type="password"], input[name*="card" i], input[autocomplete*="cc-" i], input[name*="ssn" i], input[name*="social-security" i]')) return true;
    return selectors.some((selector) => {
      try {
        return element.matches(selector) || !!element.closest(selector);
      } catch {
        return false;
      }
    });
  }
  function accessibleLabel(element) {
    return element.getAttribute("aria-label") || element.getAttribute("title") || element.textContent?.trim() || "";
  }
  function stampAndBackfill(config, excluded) {
    const selectors = (config.exclude || "").split(",").map((item) => item.trim()).filter(Boolean);
    let nextId = 0;
    const visit = (root) => {
      const interactive = root.querySelectorAll("a[href], button, input, textarea, select, summary, [role], [tabindex], [contenteditable]");
      for (const element of Array.from(interactive)) {
        if (isExcluded(element, selectors)) {
          excluded.add(element);
          continue;
        }
        if (!element.getAttribute("data-agent-id")) element.setAttribute("data-agent-id", `reef-agent-${nextId++}`);
        if (!config.disableAriaBackfill && !accessibleLabel(element) && element.matches('button, a, [role="button"], [role="link"]')) {
          const label = element.getAttribute("data-agent-label") || element.getAttribute("data-icon") || element.querySelector("svg")?.getAttribute("aria-label");
          if (label) element.setAttribute("aria-label", label);
        }
        if (element.shadowRoot) visit(element.shadowRoot);
        if (element.tagName.toLowerCase() === "iframe") {
          try {
            if (element.contentDocument) visit(element.contentDocument);
          } catch {
          }
        }
      }
    };
    visit(document);
  }
  function extractManifest(config) {
    const excluded = /* @__PURE__ */ new Set();
    stampAndBackfill(config, excluded);
    const url = typeof location !== "undefined" ? location.href : "";
    const html = document.documentElement.outerHTML;
    const records = [
      ...extractSections(html, url),
      ...extractActions(html, url),
      ...extractFields(html, url),
      ...extractLinks(html, url),
      ...extractFiles(html, url),
      ...extractMedia(html, url),
      ...extractStructuredData(html, url),
      ...extractAccessibilityTree(document)
    ];
    const selectors = (config.exclude || "").split(",").map((item) => item.trim()).filter(Boolean);
    const filtered = records.filter((record) => {
      if (record.selector) {
        try {
          const element = document.querySelector(record.selector);
          if (element && (excluded.has(element) || isExcluded(element, selectors))) return false;
        } catch {
        }
      }
      if (config.mode === "navigate-only" && record.type === "action") record.destructive = true;
      return true;
    });
    const deduped = [...new Map(filtered.map((record) => [`${record.type}:${record.headingText}:${record.selector || record.url}`, record])).values()];
    return { version: 1, url, generatedAt: Date.now(), records: deduped, excludedCount: records.length - deduped.length };
  }
  function publish(manifest, config) {
    window.__reefAgentManifest = manifest;
    const previous = document.querySelector('script[type="application/agent-manifest+json"]');
    if (previous) previous.remove();
    const node = document.createElement("script");
    node.type = "application/agent-manifest+json";
    node.textContent = JSON.stringify(manifest);
    document.head.appendChild(node);
    window.Reef?.addCustomRecords?.(manifest.records);
    document.dispatchEvent(new CustomEvent("reef:agent-ready", { detail: manifest }));
    if (config.debug) console.debug("[reef-agent-ready]", manifest);
    if (config.publishWellKnown && config.debug) console.info("[reef-agent-ready] export this manifest to /.well-known/agent-manifest.json during deployment");
  }
  function initAgentReady(input) {
    if (typeof window === "undefined" || typeof document === "undefined") return { scan: () => ({ version: 1, url: "", generatedAt: Date.now(), records: [], excludedCount: 0 }), disconnect: () => {
    }, config: input || {} };
    const config = { ...DEFAULTS, ...scriptConfig(), ...input };
    let scans = [];
    let timer;
    const rescan = () => {
      const now = Date.now();
      scans = scans.filter((time) => now - time < 6e4);
      if (scans.length >= config.maxRescansPerMinute) return;
      scans.push(now);
      publish(extractManifest(config), config);
    };
    const scan = () => {
      const manifest = extractManifest(config);
      publish(manifest, config);
      return manifest;
    };
    const observer = config.disableLiveUpdates ? null : new MutationObserver((records) => {
      const internalOnly = records.length > 0 && records.every((record) => {
        if (record.type === "attributes" && (record.attributeName === "data-agent-id" || record.attributeName === "aria-label")) return true;
        if (record.target instanceof HTMLScriptElement && record.target.type === "application/agent-manifest+json") return true;
        if (record.target.parentElement instanceof HTMLScriptElement && record.target.parentElement.type === "application/agent-manifest+json") return true;
        const nodes = [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)];
        return nodes.length > 0 && nodes.every((node) => node instanceof HTMLScriptElement && node.type === "application/agent-manifest+json");
      });
      if (internalOnly) return;
      clearTimeout(timer);
      timer = setTimeout(rescan, config.debounceMs);
    });
    observer?.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
    const onRoute = () => {
      clearTimeout(timer);
      timer = setTimeout(rescan, config.debounceMs);
    };
    const originalPush = history.pushState.bind(history);
    const originalReplace = history.replaceState.bind(history);
    history.pushState = ((...args) => {
      const result = originalPush(...args);
      onRoute();
      return result;
    });
    history.replaceState = ((...args) => {
      const result = originalReplace(...args);
      onRoute();
      return result;
    });
    addEventListener("popstate", onRoute);
    addEventListener("hashchange", onRoute);
    const controller = { scan, disconnect: () => {
      observer?.disconnect();
      clearTimeout(timer);
      removeEventListener("popstate", onRoute);
      removeEventListener("hashchange", onRoute);
    }, config };
    scan();
    return controller;
  }

  // src/agent-ready-entry.ts
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => initAgentReady(), { once: true });
    else initAgentReady();
  }
})();
//# sourceMappingURL=reef-agent-ready.js.map
