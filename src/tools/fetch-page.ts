import FirecrawlApp from '@mendable/firecrawl-js';

import { getToolLogger } from '../logging.js';
import { extractMainContent, type ExtractedPage } from './page-extract.js';
import type { ResearchState } from './state.js';

const log = getToolLogger('fetch-page');

const FetchTimeoutMs = 10_000;

const firecrawl = new FirecrawlApp({
  apiKey: process.env.FIRECRAWL_KEY ?? '',
  apiUrl: process.env.FIRECRAWL_BASE_URL,
});

async function plainFetchHtml(url: string, signal?: AbortSignal): Promise<string | null> {
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
      return html && html.length >= 500 ? html : null;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', onParentAbort);
    }
  } catch {
    return null;
  }
}

async function firecrawlHtml(url: string, signal?: AbortSignal): Promise<string | null> {
  try {
    signal?.throwIfAborted?.();
    const res = await firecrawl.scrapeUrl(url, {
      timeout: 15_000,
      formats: ['html'],
    });
    const html = (res as any).html ?? '';
    return html || null;
  } catch {
    return null;
  }
}

export async function loadPage(
  state: ResearchState,
  url: string,
  signal?: AbortSignal,
): Promise<ExtractedPage | null> {
  const cached = state.pageCache.get(url);
  if (cached) {
    log.debug('cache_hit', { event: 'cache_hit', url, tokens: cached.tokenCount });
    return cached;
  }
  log.debug('cache_miss', { event: 'cache_miss', url });

  let page: ExtractedPage | null = null;
  const directHtml = await plainFetchHtml(url, signal);
  if (directHtml) {
    log.debug('direct_fetch', { event: 'direct_fetch', url, bytes: directHtml.length });
    page = extractMainContent(directHtml, url, 'fetch');
  }
  if (!page) {
    const fallbackHtml = await firecrawlHtml(url, signal);
    if (fallbackHtml) {
      log.debug('firecrawl_fetch', { event: 'firecrawl_fetch', url, bytes: fallbackHtml.length });
      page = extractMainContent(fallbackHtml, url, 'firecrawl');
    }
  }
  if (page) {
    state.pageCache.set(url, page);
    log.debug('page_extracted', {
      event: 'page_extracted',
      url,
      source: page.source,
      tokens: page.tokenCount,
    });
  } else {
    log.debug('page_failed', { event: 'page_failed', url });
  }
  return page;
}

export { firecrawl };
