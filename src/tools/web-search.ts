import { compact } from 'lodash-es';
import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import { getToolLogger } from '../logging.js';
import { firecrawl } from './fetch-page.js';
import type { ResearchState } from './state.js';

const log = getToolLogger('web-search');

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

export function createWebSearchTool(deps: WebSearchToolDeps): AgentTool<typeof ParamsSchema> {
  return {
    name: 'web_search',
    label: 'Web search',
    description:
      'Run a web search and return the top result links (url, title, snippet) — does NOT fetch page bodies. Use read_page to read a specific result.',
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

      signal?.throwIfAborted?.();
      log.debug('search_request', { event: 'search_request', query: params.query });
      const search = await firecrawl.search(params.query, { timeout: 15_000, limit: 5 });
      log.debug('search_response', {
        event: 'search_response',
        query: params.query,
        resultCount: search.data?.length ?? 0,
      });
      const items = compact(
        search.data.map(item =>
          item.url
            ? {
                url: item.url,
                title: item.title ?? item.url,
                snippet: (item.description ?? '').slice(0, 400),
              }
            : null,
        ),
      );
      for (const it of items) deps.state.visitedUrls.add(it.url);

      const text =
        items.length === 0
          ? `No results for "${params.query}".`
          : `Search results for "${params.query}":\n\n` +
            items
              .map(
                (r, i) =>
                  `${i + 1}. ${r.title}\n   ${r.url}${r.snippet ? `\n   ${r.snippet}` : ''}`,
              )
              .join('\n');

      return {
        content: [{ type: 'text' as const, text }],
        details: { count: items.length, urls: items.map(i => i.url) },
      };
    },
  };
}
