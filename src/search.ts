export interface SectionDocument {
  id: string;
  url: string;
  headingText: string;
  headingId: string;
  breadcrumb: string;
  bodyText: string;
}

export function resolveUrl(value: string, base: string): string {
  if (!value) return base;
  try {
    return new URL(value, base).toString();
  } catch {
    return value;
  }
}

const headingCache = new Map<string, SectionDocument[]>();

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

function extractHeadingId(attrs: string, text: string): string {
  const idMatch = attrs.match(/\bid=["']([^"']+)['"]/i);
  if (idMatch?.[1]) return idMatch[1];
  const stripped = text.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return stripped || Math.random().toString(36).slice(2);
}

export function extractSections(html: string, url: string): SectionDocument[] {
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
      id: extractHeadingId(match[2] || '', headingText),
    });
  }

  const len = matches.length;
  const sections: SectionDocument[] = new Array(len);

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
    };
  }

  headingCache.set(url, sections);
  return sections;
}

interface SearchIndex {
  headingIndex: Map<string, SectionDocument[]>;
  headingIds: Map<string, SectionDocument[]>;
  bodyIndex: Map<string, SectionDocument[]>;
  allSections: SectionDocument[];
}

export function createSearchIndex(): SearchIndex {
  return {
    headingIndex: new Map(),
    headingIds: new Map(),
    bodyIndex: new Map(),
    allSections: [],
  };
}

export function addSectionsToIndex(index: SearchIndex, sections: SectionDocument[]): void {
  index.allSections.push(...sections);

  for (const section of sections) {
    const headingLower = section.headingText.toLowerCase();

    if (headingLower.length >= 2) {
      const existing = index.headingIds.get(headingLower) ?? [];
      existing.push(section);
      index.headingIds.set(headingLower, existing);
    }

    for (let i = 2; i <= headingLower.length; i++) {
      const prefix = headingLower.slice(0, i);
      const existing = index.headingIndex.get(prefix) ?? [];
      existing.push(section);
      index.headingIndex.set(prefix, existing);
    }

    const bodyLower = section.bodyText.toLowerCase();
    const bodyWords = bodyLower.split(/\s+/);
    for (const word of bodyWords) {
      if (word.length >= 3) {
        const existing = index.bodyIndex.get(word) ?? [];
        existing.push(section);
        index.bodyIndex.set(word, existing);
      }
    }
  }
}

export function searchSections(query: string, index: SearchIndex, limit: number = 8): SectionDocument[] {
  const term = query.trim().toLowerCase();
  if (!term) {
    return index.allSections.slice(0, limit);
  }

  const seen = new Set<SectionDocument>();
  const scored = new Map<SectionDocument, number>();

  const headingExact = index.headingIds.get(term) ?? [];
  for (const section of headingExact) {
    scored.set(section, 100);
    seen.add(section);
  }

  for (const [key, sections] of index.headingIds) {
    if (key.includes(term) && key !== term) {
      for (const section of sections) {
        if (!seen.has(section)) {
          seen.add(section);
          scored.set(section, 80);
        } else {
          const score = scored.get(section) ?? 0;
          scored.set(section, Math.max(score, 90));
        }
      }
    }
  }

  for (const [key, sections] of index.headingIndex) {
    if (key.includes(term)) {
      for (const section of sections) {
        if (!seen.has(section)) {
          seen.add(section);
          const headingLower = section.headingText.toLowerCase();
          scored.set(section, headingLower.startsWith(term) ? 60 : 40);
        } else {
          const score = scored.get(section) ?? 0;
          scored.set(section, Math.max(score, 50));
        }
      }
    }
  }

  for (const [key, sections] of index.bodyIndex) {
    if (key.includes(term)) {
      for (const section of sections) {
        if (!seen.has(section)) {
          seen.add(section);
          scored.set(section, 20);
        } else {
          const score = scored.get(section) ?? 0;
          scored.set(section, score + 10);
        }
      }
    }
  }

  const sorted = [...scored.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].headingText.localeCompare(b[0].headingText))
    .map((e) => e[0]);

  return sorted.slice(0, limit);
}

export function getAllSections(index: SearchIndex): SectionDocument[] {
  return index.allSections;
}