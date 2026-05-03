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

  const onHeading = (el: { textContent: string; tagName: string; attributes: Record<string, string> }) => {
    const text = el.textContent.trim();
    if (!text) return;
    headings.push({
      text,
      level: Number(el.tagName.charAt(1)),
      anchor: el.attributes.id || undefined,
    });
  };
  const markdown = htmlToMarkdown(html, {
    origin: url,
    extraction: {
      title: el => {
        if (!title) title = el.textContent.trim();
      },
      h1: onHeading,
      h2: onHeading,
      h3: onHeading,
      h4: onHeading,
      h5: onHeading,
      h6: onHeading,
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

const pathsCache = new WeakMap<ExtractedPage, string[]>();
const positionsCache = new WeakMap<ExtractedPage, number[]>();

function getCachedPaths(page: ExtractedPage): string[] {
  let p = pathsCache.get(page);
  if (!p) { p = buildPaths(page.headings); pathsCache.set(page, p); }
  return p;
}

// Scan markdown once to find the character offset of each heading,
// matching by level + normalized text so Unicode/whitespace variants resolve correctly.
function getHeadingPositions(page: ExtractedPage): number[] {
  let positions = positionsCache.get(page);
  if (positions) return positions;

  positions = new Array<number>(page.headings.length).fill(-1);
  const unmatched = new Set(page.headings.map((_, i) => i));
  const md = page.markdown;
  let lineStart = 0;

  for (let i = 0; i <= md.length; i++) {
    if (i === md.length || md[i] === '\n') {
      if (unmatched.size > 0 && md[lineStart] === '#') {
        const line = md.slice(lineStart, i);
        const m = line.match(/^(#+) (.*)/);
        if (m) {
          const level = m[1]!.length;
          const text = normalize(m[2]!);
          for (const idx of unmatched) {
            const h = page.headings[idx]!;
            if (h.level === level && normalize(h.text) === text) {
              positions[idx] = lineStart;
              unmatched.delete(idx);
              break;
            }
          }
        }
      }
      lineStart = i + 1;
    }
  }

  positionsCache.set(page, positions);
  return positions;
}

export function getSection(page: ExtractedPage, index: number): Section | null {
  const h = page.headings[index];
  if (!h) return null;
  const paths = getCachedPaths(page);
  const positions = getHeadingPositions(page);
  const start = positions[index];
  if (start === undefined || start === -1) return null;

  let end = page.markdown.length;
  for (let j = 0; j < positions.length; j++) {
    if (j === index) continue;
    const p = positions[j]!;
    if (p > start && p < end) end = p;
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
  const paths = getCachedPaths(page);
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
  const paths = getCachedPaths(page);
  return page.headings.map((h, i) => {
    const s = getSection(page, i);
    return {
      path: paths[i]!,
      level: h.level,
      tokenCount: s?.tokenCount ?? 0,
    };
  });
}
