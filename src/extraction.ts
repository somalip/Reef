/**
 * @file Content extraction functions for indexing web pages.
 * Extracts sections, actions, fields, links, files, media, and structured data from HTML.
 */

import { IndexRecord } from './types.js';

export function stripTags(value: string): string {
  let result = '';
  let inTag = false;
  for (let i = 0; i < value.length; i++) {
    const char = value[i];
    if (char === '<' && inTag === false) {
      inTag = true;
    } else if (char === '>' && inTag === true) {
      inTag = false;
    } else if (inTag === false) {
      result += char;
    }
  }
  return result.replace(/\s+/g, ' ').trim();
}

export function generateSelector(element: Element): string {
  const path: string[] = [];
  let current: Element | null = element;

  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let selector = current.tagName.toLowerCase();
    if (current.id) {
      selector += `#${current.id}`;
      path.unshift(selector);
      break;
    } else if (current.className) {
      const classes = current.className.trim().split(/\s+/);
      if (classes.length) {
        selector += `.${classes.join('.')}`;
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

  return path.length > 0 ? path.join(' > ') : element.tagName.toLowerCase();
}

export function extractHeadingId(fullMatch: string, text: string): string {
  const idMatch = fullMatch.match(/\bid=["']([^"']+)['"]/i);
  if (idMatch?.[1]) return idMatch[1];
  const stripped = text.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return stripped || Math.random().toString(36).slice(2);
}

export function hasExplicitId(fullMatch: string): boolean {
  return /\bid=["'][^"']+["']/i.test(fullMatch);
}

export function findParentSectionId(html: string, headingMatchEnd: number): string | null {
  const afterHeading = html.slice(headingMatchEnd, headingMatchEnd + 500);
  const idMatch = afterHeading.match(/<section[^>]*id="([^"]+)"/i);
  if (idMatch?.[1]) return idMatch[1];
  const articleMatch = afterHeading.match(/<article[^>]*id="([^"]+)"/i);
  if (articleMatch?.[1]) return articleMatch[1];
  return null;
}

const headingCache = new Map<string, IndexRecord[]>();

export function chunkBodyText(bodyText: string, chunkSize: number, record: IndexRecord): IndexRecord[] {
  if (chunkSize <= 0 || bodyText.length <= chunkSize) {
    return [record];
  }
  
  const chunks: IndexRecord[] = [];
  const overlap = Math.floor(chunkSize * 0.2); // 20% overlap
  
  for (let i = 0; i < bodyText.length; i += chunkSize - overlap) {
    const chunkEnd = Math.min(i + chunkSize, bodyText.length);
    const chunkText = bodyText.slice(i, chunkEnd);
    
    // Create a new record for this chunk
    const chunkRecord: IndexRecord = {
      ...record,
      id: `${record.id}-chunk-${Math.floor(i / chunkSize)}`,
      url: `${record.url}-chunk-${Math.floor(i / chunkSize)}`,
      bodyText: chunkText,
      headingText: `${record.headingText} (chunk ${Math.floor(i / chunkSize) + 1})`,
      headingId: `${record.headingId}-chunk-${Math.floor(i / chunkSize)}`,
    };
    
    chunks.push(chunkRecord);
  }
  
  return chunks;
}

export function extractSections(html: string, url: string): IndexRecord[] {
  if (headingCache.has(url)) {
    return headingCache.get(url)!;
  }

  const cleanHtml = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  const matches: Array<{ level: number; index: number; text: string; id: string; hasRealId: boolean }> = [];
  const headingRegexGlobal = /<(h[1-6])[^>]*>([\s\S]*?)<\/h[1-6]>/gi;
  let match: RegExpExecArray | null;

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
      hasRealId: hasExplicitId(match[0]),
    });
  }

  const len = matches.length;
  const sections: IndexRecord[] = new Array(len);

  for (let i = 0; i < len; i++) {
    const heading = matches[i];
    const nextHeading = matches[i + 1];
    const start = heading.index + heading.text.length;
    const end = nextHeading?.index ?? cleanHtml.length;
    const content = cleanHtml.slice(start, end);
    const bodyText = stripTags(content).replace(/\s+/g, ' ').trim();

    let breadcrumb = '';
    for (let j = 0; j <= i; j++) {
      if (j > 0) breadcrumb += ' › ';
      breadcrumb += matches[j].text;
    }

    const parentSectionId = heading.hasRealId ? null : findParentSectionId(cleanHtml, heading.index + heading.text.length);
    const selector = heading.hasRealId
      ? '#' + heading.id
      : parentSectionId
        ? '#' + parentSectionId
        : undefined;

    sections[i] = {
      id: `${url}#${heading.id}`,
      url: `${url}#${heading.id}`,
      headingText: heading.text,
      headingId: heading.id,
      breadcrumb,
      bodyText,
      type: 'section',
      selector,
    };
  }

  headingCache.set(url, sections);
  return sections;
}

export function extractActionName(element: Element): string | null {
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel?.trim()) return ariaLabel.trim();

  const ariaLabelledBy = element.getAttribute('aria-labelledby');
  if (ariaLabelledBy) {
    const labelledElement = document.getElementById(ariaLabelledBy);
    if (labelledElement?.textContent?.trim()) {
      return labelledElement.textContent.trim();
    }
  }

  const textContent = element.textContent?.trim();
  if (textContent) return textContent;

  const title = element.getAttribute('title');
  if (title?.trim()) return title.trim();

  return null;
}

export function isDestructiveAction(label: string): boolean {
  const destructiveVerbs = [
    'delete', 'remove', 'cancel subscription', 'unsubscribe',
    'pay', 'checkout', 'submit order', 'confirm'
  ];
  const lowerLabel = label.toLowerCase();
  return destructiveVerbs.some(verb => lowerLabel.includes(verb));
}

export function extractActions(html: string, url: string, excludeSelectors?: string): IndexRecord[] {
  const actions: IndexRecord[] = [];
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const selectors = [
    'button',
    '[role="button"]',
    'input[type="button"]',
    'input[type="submit"]',
    'summary',
    '[data-reef-action]'
  ];

  const elements = Array.from(doc.querySelectorAll(selectors.join(',')));

  for (const element of elements) {
    if (excludeSelectors && element.matches(excludeSelectors)) continue;

    const label = extractActionName(element);
    if (!label) continue;

    const selector = generateSelector(element);

    actions.push({
      id: `${url}#action-${actions.length}`,
      url: url,
      headingText: label,
      headingId: `action-${actions.length}`,
      breadcrumb: '',
      bodyText: label,
      type: 'action',
      selector,
      destructive: isDestructiveAction(label),
      label
    });
  }

  return actions;
}

export function extractFields(html: string, url: string): IndexRecord[] {
  const fields: IndexRecord[] = [];
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const formElements = Array.from(doc.querySelectorAll('form'));

  for (const form of formElements) {
    let breadcrumb = '';
    let current: Element | null = form.parentElement;
    while (current && current !== doc.body) {
      if (current.matches('h1, h2, h3, h4, h5, h6, article, section, [role="main"], main')) {
        const headingText = current.textContent?.trim() || '';
        if (headingText) {
          breadcrumb = headingText;
        }
        break;
      }
      current = current.parentElement;
    }

    const inputs = Array.from(form.querySelectorAll('input, textarea, select'));

    for (const input of inputs) {
      if (input.matches('input[type="hidden"], input[type="button"], input[type="submit"], input[type="reset"]')) {
        continue;
      }

      let label = '';
      const id = input.id;
      if (id) {
        const labelElement = doc.querySelector(`label[for="${id}"]`);
        if (labelElement) {
          label = labelElement.textContent?.trim() || '';
        }
      }

      if (!label) {
        const parentLabel = input.closest('label');
        if (parentLabel) {
          label = parentLabel.textContent?.trim() || '';
          const inputElement = input as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
          if (label && inputElement.value && label.includes(inputElement.value)) {
            label = label.replace(inputElement.value, '').trim();
          }
        }
      }

      if (!label) {
        const inputElement = input as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
        const placeholder = 'placeholder' in inputElement ? inputElement.placeholder : '';
        label = placeholder || input.getAttribute('aria-label') || '';
      }

      if (!label) continue;

      const selector = generateSelector(input);
      const inputElement = input as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

      fields.push({
        id: `${url}#field-${fields.length}`,
        url: url,
        headingText: label,
        headingId: `field-${fields.length}`,
        breadcrumb,
        bodyText: label,
        type: 'field',
        selector,
        label,
        value: inputElement.value
      });
    }
  }

  return fields;
}

export function extractHiddenContent(doc: Document): void {
  doc.querySelectorAll('details').forEach(d => {
    if (!d.hasAttribute('open')) d.setAttribute('data-reef-was-closed', 'true');
    d.setAttribute('open', '');
  });
  doc.querySelectorAll('[aria-hidden="false"]').forEach(el => {
    el.removeAttribute('aria-hidden');
  });
}

export function extractLinks(html: string, url: string): IndexRecord[] {
  const links: IndexRecord[] = [];
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const anchors = Array.from(doc.querySelectorAll('a[href]'));

  for (const anchor of anchors) {
    if (anchor.hasAttribute('rel') && anchor.getAttribute('rel')?.toLowerCase().includes('nofollow')) continue;

    const href = anchor.getAttribute('href');
    if (!href) continue;

    if (href === '#' || href.startsWith('javascript:')) continue;

    const linkText = anchor.textContent?.trim() || '';
    if (!linkText) continue;

    const resolvedUrl = resolveUrl(href, url);
    const isExternal = !resolvedUrl.startsWith(window.location.origin);
    const selector = generateSelector(anchor);

    links.push({
      id: `${url}#link-${links.length}`,
      url: resolvedUrl,
      headingText: linkText,
      headingId: `link-${links.length}`,
      breadcrumb: '',
      bodyText: linkText,
      type: isExternal ? 'link' : 'section',
      selector
    });
  }

  return links;
}

export function extractFiles(html: string, url: string, extensions?: string): IndexRecord[] {
  const files: IndexRecord[] = [];
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const fileExtensions = extensions?.split(',').map(e => e.trim().toLowerCase()) ??
    ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'csv'];

  const anchors = Array.from(doc.querySelectorAll('a[href]'));

  for (const anchor of anchors) {
    const href = anchor.getAttribute('href');
    if (!href) continue;

    const isFile = fileExtensions.some(ext =>
      href.toLowerCase().endsWith(`.${ext}`) ||
      href.toLowerCase().endsWith(`.${ext}?`) ||
      href.toLowerCase().endsWith(`.${ext}#`)
    );

    if (!isFile) continue;

    const linkText = anchor.textContent?.trim() || href.split('/').pop() || '';
    if (!linkText) continue;

    const resolvedUrl = resolveUrl(href, url);
    const selector = generateSelector(anchor);

    files.push({
      id: `${url}#file-${files.length}`,
      url: resolvedUrl,
      headingText: linkText,
      headingId: `file-${files.length}`,
      breadcrumb: '',
      bodyText: linkText,
      type: 'file',
      selector
    });
  }

  return files;
}

export function extractMedia(html: string, url: string): IndexRecord[] {
  const media: IndexRecord[] = [];
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const images = Array.from(doc.querySelectorAll('img'));
  for (const img of images) {
    const alt = img.alt.trim();
    if (!alt) continue;

    let caption = '';
    const figure = img.closest('figure');
    if (figure) {
      const figcaption = figure.querySelector('figcaption');
      if (figcaption) {
        caption = figcaption.textContent?.trim() || '';
      }
    }

    const textToIndex = caption ? `${alt} ${caption}` : alt;
    if (!textToIndex.trim()) continue;

    const selector = generateSelector(img);

    media.push({
      id: `${url}#media-image-${media.length}`,
      url: url,
      headingText: alt,
      headingId: `media-image-${media.length}`,
      breadcrumb: '',
      bodyText: textToIndex,
      type: 'media',
      selector
    });
  }

  const mediaElements = Array.from(doc.querySelectorAll('video, audio'));
  for (const element of mediaElements) {
    const title = element.getAttribute('title') || element.getAttribute('aria-label') || '';
    if (!title) continue;

    let transcript = '';
    const tracks = Array.from(element.querySelectorAll('track[kind="captions"], track[kind="subtitles"]'));
    for (const track of tracks) {
      const src = track.getAttribute('src');
      if (src) {
        transcript += `[Transcript available: ${src}] `;
      }
    }

    const textToIndex = transcript ? `${title} ${transcript}` : title;
    if (!textToIndex.trim()) continue;

    const selector = generateSelector(element);

    media.push({
      id: `${url}#media-${media.length}`,
      url: url,
      headingText: title,
      headingId: `media-${media.length}`,
      breadcrumb: '',
      bodyText: textToIndex,
      type: 'media',
      selector,
      transcript: transcript.trim()
    });
  }

  return media;
}

export function extractStructuredData(html: string, url: string): IndexRecord[] {
  const structured: IndexRecord[] = [];
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const jsonLdScripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
  for (const script of jsonLdScripts) {
    try {
      const data = JSON.parse(script.textContent || '{}');

      if (Array.isArray(data) ? data.some((item: any) => item['@type'] === 'FAQPage') :
        data['@type'] === 'FAQPage') {
        const faqItems = Array.isArray(data) ?
          data.flatMap((item: any) => item.mainEntity || []) :
          data.mainEntity || [];

        for (const [index, question] of faqItems.entries()) {
          if (!question || !question.name) continue;

          const answer = question.acceptedAnswer?.text ||
            question.suggestedAnswer?.text ||
            '';

          if (!answer) continue;

          const textToIndex = `${question.name} ${answer}`;

          structured.push({
            id: `${url}#structured-faq-${index}`,
            url: url,
            headingText: question.name,
            headingId: `structured-faq-${index}`,
            breadcrumb: '',
            bodyText: textToIndex,
            type: 'structured',
            structuredData: { question: question.name, answer }
          });
        }
      }
      else if (data['@type']) {
        const type = data['@type'];
        const name = data.name || data.headline || '';
        const description = data.description || '';

        if (!name && !description) continue;

        const textToIndex = `${name} ${description}`.trim();
        if (!textToIndex) continue;

        structured.push({
          id: `${url}#structured-${type.toLowerCase()}-${structured.length}`,
          url: url,
          headingText: name || 'Structured Data',
          headingId: `structured-${type.toLowerCase()}-${structured.length}`,
          breadcrumb: '',
          bodyText: textToIndex,
          type: 'structured',
          structuredData: data
        });
      }
    } catch (e) {
      continue;
    }
  }

  return structured;
}

// Known tracking parameters to strip
const TRACKING_PARAMS = new Set([
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'fbclid', 'mc_cid', 'mc_eid', 'mc_id',
  'referrer', 'ref', 'source', 'campaign', 'click_id'
]);

// Strip known tracking parameters from URL
function stripTrackingParams(url: string): string {
  try {
    const urlObj = new URL(url);
    const params = new URLSearchParams(urlObj.search);
    
    // Remove tracking parameters
    for (const param of TRACKING_PARAMS) {
      params.delete(param);
    }
    
    // Remove empty parameters
    for (const [key, value] of params.entries()) {
      if (!value) {
        params.delete(key);
      }
    }
    
    // Reconstruct URL
    urlObj.search = params.toString();
    return urlObj.toString();
  } catch {
    return url;
  }
}

// Normalize URL: strip trailing slash, sort/drop known tracking query params, resolve to canonical if present
export function normalizeUrl(url: string, html?: string): string {
  if (!url) return url;
  
  // Strip trailing slash from pathname
  let normalized = url.replace(/\/$/, '');
  
  // Strip tracking parameters
  normalized = stripTrackingParams(normalized);
  
  // Check for canonical URL in HTML if provided
  if (html) {
    const canonicalMatch = html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i);
    if (canonicalMatch?.[1]) {
      const canonicalUrl = stripTrackingParams(canonicalMatch[1]);
      // If canonical URL is different, use it
      if (canonicalUrl !== normalized) {
        return canonicalUrl.replace(/\/$/, '');
      }
    }
  }
  
  return normalized;
}

export function resolveUrl(value: string, base: string): string {
  if (!value) return base;
  try {
    return new URL(value, base).toString();
  } catch {
    return value;
  }
}