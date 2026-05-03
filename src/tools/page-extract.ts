import { getEncoding } from 'js-tiktoken';
import { htmlToMarkdown } from 'mdream';

const enc = getEncoding('o200k_base');

export interface HeadingInfo {
  text: string;
  level: number; // 1..6
  anchor?: string;
}

export interface Section extends HeadingInfo {
  path: string;
  markdown: string;
  tokenCount: number;
}

export interface ExtractedPage {
  url: string;
  title: string;
  markdown: string;
  tokenCount: number;
  headings: HeadingInfo[];
  source: 'fetch' | 'firecrawl';
}

export function tokenLen(s: string): number {
  return enc.encode(s).length;
}

export function extractMainContent(
  html: string,
  url: string,
  source: 'fetch' | 'firecrawl',
): ExtractedPage | null {
  const headings: HeadingInfo[] = [];
  let title = '';

  const markdown = htmlToMarkdown(html, {
    minimal: true,
    origin: url,
    extraction: {
      title: el => {
        if (!title) title = el.textContent.trim();
      },
      'h1, h2, h3, h4, h5, h6': el => {
        const text = el.textContent.trim();
        if (!text) return;
        headings.push({
          text,
          level: Number(el.tagName.charAt(1)),
          anchor: el.attributes.id || undefined,
        });
      },
    },
  }).trim();

  if (markdown.length < 100) return null;

  return {
    url,
    title: title || url,
    markdown,
    tokenCount: tokenLen(markdown),
    headings,
    source,
  };
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function buildPaths(headings: HeadingInfo[]): string[] {
  const stack: HeadingInfo[] = [];
  return headings.map(h => {
    while (stack.length && stack[stack.length - 1]!.level >= h.level) stack.pop();
    const path = [...stack.map(s => s.text), h.text].join(' > ');
    stack.push(h);
    return path;
  });
}

function headingLine(h: HeadingInfo): string {
  return `${'#'.repeat(h.level)} ${h.text}`;
}

export function getSection(page: ExtractedPage, index: number): Section | null {
  const h = page.headings[index];
  if (!h) return null;
  const paths = buildPaths(page.headings);
  const startLine = headingLine(h);
  const start = page.markdown.indexOf(startLine);
  if (start === -1) return null;

  let end = page.markdown.length;
  for (let j = 0; j < page.headings.length; j++) {
    if (j === index) continue;
    const other = page.headings[j]!;
    const line = headingLine(other);
    const idx = page.markdown.indexOf(line, start + startLine.length);
    if (idx !== -1 && idx < end) end = idx;
  }
  const md = page.markdown.slice(start, end).trim();
  return {
    ...h,
    path: paths[index]!,
    markdown: md,
    tokenCount: tokenLen(md),
  };
}

export function findHeadingIndex(
  page: ExtractedPage,
  selector: string,
): number {
  const target = normalize(selector);
  if (!target) return -1;
  const paths = buildPaths(page.headings);
  // 1) anchor id
  for (let i = 0; i < page.headings.length; i++) {
    const h = page.headings[i]!;
    if (h.anchor && normalize(h.anchor) === target) return i;
  }
  // 2) full path
  for (let i = 0; i < paths.length; i++) {
    if (normalize(paths[i]!) === target) return i;
  }
  // 3) heading text
  for (let i = 0; i < page.headings.length; i++) {
    if (normalize(page.headings[i]!.text) === target) return i;
  }
  // 4) path suffix
  for (let i = 0; i < paths.length; i++) {
    if (normalize(paths[i]!).endsWith(target)) return i;
  }
  // 5) heading substring
  for (let i = 0; i < page.headings.length; i++) {
    if (normalize(page.headings[i]!.text).includes(target)) return i;
  }
  return -1;
}

export function packToBudget(
  parts: { label: string; text: string; tokenCount: number }[],
  budgetTokens: number,
): { packed: string; included: string[]; truncatedTail: number } {
  const included: string[] = [];
  const out: string[] = [];
  let used = 0;
  let truncatedTail = 0;

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]!;
    if (used + p.tokenCount <= budgetTokens) {
      out.push(p.text);
      used += p.tokenCount;
      included.push(p.label);
      continue;
    }
    const remaining = budgetTokens - used;
    if (remaining > 200) {
      const tokens = enc.encode(p.text);
      const head = enc.decode(tokens.slice(0, remaining - 50));
      out.push(
        `${head}\n\n[…truncated — ${p.tokenCount - (remaining - 50)} more tokens in "${p.label}"]`,
      );
      included.push(`${p.label} (truncated)`);
    }
    truncatedTail = parts.length - i - 1;
    break;
  }
  return { packed: out.join('\n\n'), included, truncatedTail };
}

export function getOutline(page: ExtractedPage): { path: string; level: number; tokenCount: number }[] {
  const paths = buildPaths(page.headings);
  return page.headings.map((h, i) => {
    const s = getSection(page, i);
    return {
      path: paths[i]!,
      level: h.level,
      tokenCount: s?.tokenCount ?? 0,
    };
  });
}
