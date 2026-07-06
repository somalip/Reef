export interface SectionDocument {
  id: string;
  url: string;
  headingText: string;
  headingId: string;
  breadcrumb: string;
  bodyText: string;
}

export interface IndexRecord extends SectionDocument {
  type: 'section' | 'action' | 'field' | 'link' | 'file' | 'media' | 'structured';
  selector?: string;
  destructive?: boolean;
  label?: string;
  value?: string;
  transcript?: string;
  structuredData?: any;
}

export function resolveUrl(value: string, base: string): string {
  if (!value) return base;
  try {
    return new URL(value, base).toString();
  } catch {
    return value;
  }
}

const headingCache = new Map<string, IndexRecord[]>();

function stripTags(value: string): string {
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

function normalizeText(value: string): string {
  return stripTags(value).toLowerCase();
}

const headingRegexGlobal = /<(h[1-6])[^>]*>([\s\S]*?)<\/h[1-6]>/gi;

function extractHeadingId(fullMatch: string, text: string): string {
  const idMatch = fullMatch.match(/\bid=["']([^"']+)['"]/i);
  if (idMatch?.[1]) return idMatch[1];
  const stripped = text.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return stripped || Math.random().toString(36).slice(2);
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

  const matches: Array<{ level: number; index: number; text: string; id: string }> = [];
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

    sections[i] = {
      id: `${url}#${heading.id}`,
      url: `${url}#${heading.id}`,
      headingText: heading.text,
      headingId: heading.id,
      breadcrumb,
      bodyText,
      type: 'section',
    };
  }

  headingCache.set(url, sections);
  return sections;
}

function extractActionName(element: Element): string | null {
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

function isDestructiveAction(label: string): boolean {
  const destructiveVerbs = [
    'delete', 'remove', 'cancel subscription', 'unsubscribe', 
    'pay', 'checkout', 'submit order', 'confirm'
  ];
  const lowerLabel = label.toLowerCase();
  return destructiveVerbs.some(verb => lowerLabel.includes(verb));
}

export function extractActions(html: string, url: string): IndexRecord[] {
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

function generateSelector(element: Element): string {
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

export function extractLinks(html: string, url: string): IndexRecord[] {
  const links: IndexRecord[] = [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  
  const anchors = Array.from(doc.querySelectorAll('a[href]'));
  
  for (const anchor of anchors) {
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

export function extractFiles(html: string, url: string): IndexRecord[] {
  const files: IndexRecord[] = [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  
  const fileExtensions = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'zip', 'csv'];
  
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

interface SearchIndex {
  headingIndex: Map<string, IndexRecord[]>;
  headingIds: Map<string, IndexRecord[]>;
  bodyIndex: Map<string, IndexRecord[]>;
  allSections: IndexRecord[];
}

export function createSearchIndex(): SearchIndex {
  return {
    headingIndex: new Map(),
    headingIds: new Map(),
    bodyIndex: new Map(),
    allSections: [],
  };
}

export function addToIndex(index: SearchIndex, records: IndexRecord[]): void {
  index.allSections.push(...records);

  for (const record of records) {
    const headingLower = record.headingText.toLowerCase();
    if (headingLower.length >= 2) {
      const existing = index.headingIds.get(headingLower) ?? [];
      existing.push(record);
      index.headingIds.set(headingLower, existing);
    }

    for (let i = 2; i <= headingLower.length; i++) {
      const prefix = headingLower.slice(0, i);
      const existing = index.headingIndex.get(prefix) ?? [];
      existing.push(record);
      index.headingIndex.set(prefix, existing);
    }

    const bodyLower = record.bodyText.toLowerCase();
    const bodyWords = bodyLower.split(/\s+/);
    for (const word of bodyWords) {
      if (word.length >= 3) {
        const existing = index.bodyIndex.get(word) ?? [];
        existing.push(record);
        index.bodyIndex.set(word, existing);
      }
    }

    if (record.type === 'structured' && record.structuredData) {
      if (record.structuredData.question) {
        const questionWords = record.structuredData.question.toLowerCase().split(/\s+/);
        for (const word of questionWords) {
          if (word.length >= 3) {
            const existing = index.bodyIndex.get(word) ?? [];
            existing.push(record);
            index.bodyIndex.set(word, existing);
          }
        }
      }
      if (record.structuredData.answer) {
        const answerWords = record.structuredData.answer.toLowerCase().split(/\s+/);
        for (const word of answerWords) {
          if (word.length >= 3) {
            const existing = index.bodyIndex.get(word) ?? [];
            existing.push(record);
            index.bodyIndex.set(word, existing);
          }
        }
      }
    }
  }
}

// Alias for test compatibility
export const addSectionsToIndex = addToIndex;

export function getAllSections(index: SearchIndex): IndexRecord[] {
  return index.allSections;
}

export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const dp: number[] = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;

  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] !== b[j - 1] ? 1 : 0)
      );
      prev = temp;
    }
  }
  return dp[n];
}

export function findClosestWord(query: string, index: SearchIndex, maxDistance = 2): string | null {
  const term = query.trim().toLowerCase();
  if (!term || term.length < 2) return null;

  let closest: { word: string; distance: number } | null = null;

  const checkWord = (word: string) => {
    if (!word || Math.abs(word.length - term.length) > maxDistance) return;
    const distance = levenshteinDistance(word, term);
    const current = closest as { word: string; distance: number } | null;
    if (distance <= maxDistance && (!current || distance < current.distance)) {
      closest = { word, distance };
    }
  };

  for (const key of index.headingIds.keys()) {
    checkWord(key);
  }
  for (const key of index.bodyIndex.keys()) {
    checkWord(key);
  }

  return (closest as { word: string; distance: number } | null)?.word ?? null;
}

export function searchSections(
  query: string,
  index: SearchIndex,
  limit = 8
): IndexRecord[] {
  const q = query.trim().toLowerCase();

  if (!q) {
    return index.allSections.slice(0, limit);
  }

  const scores = new Map<IndexRecord, number>();

  const addScore = (record: IndexRecord, score: number) => {
    scores.set(record, (scores.get(record) ?? 0) + score);
  };

  // Exact heading match
  const exact = index.headingIds.get(q);
  if (exact) {
    for (const record of exact) {
      addScore(record, 100);
    }
  }

  // Heading prefix matches
  const prefix = index.headingIndex.get(q);
  if (prefix) {
    for (const record of prefix) {
      addScore(record, 50);
    }
  }

  // Body word matches
  const words = q.split(/\s+/);

  for (const word of words) {
    const bodyMatches = index.bodyIndex.get(word);
    if (bodyMatches) {
      for (const record of bodyMatches) {
        addScore(record, 20);
      }
    }
  }

  // Fallback substring search
  if (scores.size === 0) {
    for (const record of index.allSections) {
      const heading = record.headingText.toLowerCase();
      const body = record.bodyText.toLowerCase();

      if (heading.includes(q)) {
        addScore(record, 40);
      } else if (body.includes(q)) {
        addScore(record, 10);
      }
    }
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([record]) => record)
    .slice(0, limit);
}