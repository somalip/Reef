export interface SectionDocument {
  url: string;
  headingText: string;
  headingId: string;
  breadcrumb: string;
  bodyText: string;
}

export function resolveUrl(value: string, base: string): string {
  if (!value) {
    return base;
  }

  try {
    return new URL(value, base).toString();
  } catch {
    return value;
  }
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeText(value: string): string {
  return stripTags(value).toLowerCase();
}

export function extractSections(html: string, url: string): SectionDocument[] {
  const cleanHtml = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--([\s\S]*?)-->/g, ' ');

  const headingRegex = /<(h[1-6])\b([^>]*)>([\s\S]*?)<\/\1>/gi;
  const matches: Array<{ level: number; index: number; text: string; id: string }> = [];

  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(cleanHtml)) !== null) {
    const [, tag, attrs, text] = match;
    const idMatch = attrs.match(/\bid=["']([^"']+)['"]/i);
    const headingText = stripTags(text);
    const level = parseInt(tag[1], 10);
    matches.push({
      level,
      index: match.index,
      text: headingText,
      id: idMatch?.[1] ?? headingText.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    });
  }

  const sections: SectionDocument[] = [];
  matches.forEach((heading, index) => {
    const nextHeading = matches[index + 1];
    const start = heading.index + heading.text.length;
    const end = nextHeading?.index ?? cleanHtml.length;
    const content = cleanHtml.slice(start, end);
    const bodyText = stripTags(content).replace(/\s+/g, ' ').trim();

    const breadcrumb = matches
      .slice(0, index + 1)
      .map((h) => h.text)
      .join(' › ');

    sections.push({
      url: `${url}#${heading.id}`,
      headingText: heading.text,
      headingId: heading.id,
      breadcrumb,
      bodyText,
    });
  });

  return sections;
}

export function searchSections(query: string, sections: SectionDocument[]): SectionDocument[] {
  const term = normalizeText(query).trim();
  if (!term) {
    return sections.slice(0, 8);
  }

  const scored = sections
    .map((section) => {
      const headingText = normalizeText(section.headingText);
      const bodyText = normalizeText(section.bodyText);
      const haystack = `${headingText} ${bodyText}`;
      let score = 0;

      if (headingText.includes(term)) {
        score += 40;
      }
      if (bodyText.includes(term)) {
        score += 8;
      }
      if (headingText.split(/\s+/).some((word) => word.startsWith(term))) {
        score += 6;
      }
      if (haystack.includes(term)) {
        score += 2;
      }
      if (headingText.includes(term.split(' ')[0])) {
        score += 2;
      }

      return { section, score };
    })
    .filter(({ score }) => score > 0);

  if (!scored.length) {
    return [];
  }

  return scored
    .sort((a, b) => b.score - a.score || a.section.headingText.localeCompare(b.section.headingText))
    .map(({ section }) => section);
}