import FirecrawlApp from '@mendable/firecrawl-js';
import { compact } from 'lodash-es';
import pLimit from 'p-limit';
import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import { htmlToMarkdown } from 'mdream';

import type { ResearchState } from './state.js';

const ConcurrencyLimit = Number(process.env.FIRECRAWL_CONCURRENCY) || 2;
const FetchTimeoutMs = 10_000;
const MinUsableMarkdown = 200;

const firecrawl = new FirecrawlApp({
  apiKey: process.env.FIRECRAWL_KEY ?? '',
  apiUrl: process.env.FIRECRAWL_BASE_URL,
});

const limit = pLimit(ConcurrencyLimit);

const ParamsSchema = Type.Object({
  query: Type.String({ description: 'Search query string for the web search engine.' }),
  researchGoal: Type.String({
    description:
      'Why this query is being run and how its results should advance the overall research.',
  }),
});

type Params = Static<typeof ParamsSchema>;

export interface WebSearchToolDeps {
  state: ResearchState;
  isLastTurn: () => boolean;
}

async function fetchAndClean(
  url: string,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), FetchTimeoutMs);
    const onParentAbort = () => ctrl.abort();
    signal?.addEventListener?.('abort', onParentAbort);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal,
        redirect: 'follow',
        headers: {
          'user-agent':
            'Mozilla/5.0 (compatible; deep-research/1.0; +https://github.com/dzhng/deep-research)',
          accept: 'text/html,application/xhtml+xml',
        },
      });
      if (!res.ok) return null;
      const ctype = res.headers.get('content-type') ?? '';
      if (!ctype.includes('html')) return null;
      const html = await res.text();
      if (!html || html.length < 500) return null;
      const md = htmlToMarkdown(html, { clean: true }).trim();
      return md.length >= MinUsableMarkdown ? md : null;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', onParentAbort);
    }
  } catch {
    return null;
  }
}

async function firecrawlScrape(
  url: string,
  signal?: AbortSignal,
): Promise<string | null> {
  try {
    signal?.throwIfAborted?.();
    const res = await firecrawl.scrapeUrl(url, {
      timeout: 15_000,
      formats: ['html'],
    });
    const html = (res as any).html ?? '';
    if (!html) return null;
    const md = htmlToMarkdown(html, { clean: true }).trim();
    return md.length >= MinUsableMarkdown ? md : null;
  } catch {
    return null;
  }
}

export function createWebSearchTool(deps: WebSearchToolDeps): AgentTool<typeof ParamsSchema> {
  return {
    name: 'web_search',
    label: 'Web search',
    description:
      'Run a web search and read the top results as cleaned markdown. Use to gather sources for the research topic.',
    parameters: ParamsSchema,
    async execute(_id: string, params: Params, signal?: AbortSignal) {
      if (deps.isLastTurn()) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'turn limit reached, stop calling tools and answer with what you have.',
            },
          ],
          details: { skipped: true },
          terminate: true,
        };
      }

      const search = await limit(async () => {
        signal?.throwIfAborted?.();
        return firecrawl.search(params.query, { timeout: 15_000, limit: 3 });
      });

      const urls = compact(search.data.map(item => item.url));
      for (const url of urls) deps.state.visitedUrls.add(url);

      const pages = await Promise.all(
        urls.map(async url => {
          const direct = await fetchAndClean(url, signal);
          if (direct) return { url, md: direct, source: 'fetch' as const };
          const fallback = await firecrawlScrape(url, signal);
          if (fallback) return { url, md: fallback, source: 'firecrawl' as const };
          return { url, md: null as string | null, source: 'none' as const };
        }),
      );

      const usable = pages.filter(
        (p): p is { url: string; md: string; source: 'fetch' | 'firecrawl' } => !!p.md,
      );

      const text =
        usable.length === 0
          ? `No usable content for "${params.query}".`
          : `Search results for "${params.query}" (${usable.length} pages):\n\n` +
            usable
              .map(p => `<result url="${p.url}">\n${p.md}\n</result>`)
              .join('\n');

      return {
        content: [{ type: 'text' as const, text }],
        details: {
          urls,
          fetched: usable.length,
          viaFetch: usable.filter(p => p.source === 'fetch').length,
          viaFirecrawl: usable.filter(p => p.source === 'firecrawl').length,
        },
      };
    },
  };
}
