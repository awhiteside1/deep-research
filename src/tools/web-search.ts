import FirecrawlApp from '@mendable/firecrawl-js';
import { compact } from 'lodash-es';
import pLimit from 'p-limit';
import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import { trimPrompt } from '../ai/providers.js';
import type { ResearchState } from './state.js';

const ConcurrencyLimit = Number(process.env.FIRECRAWL_CONCURRENCY) || 2;

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

export function createWebSearchTool(deps: WebSearchToolDeps): AgentTool<typeof ParamsSchema> {
  return {
    name: 'web_search',
    label: 'Web search',
    description:
      'Run a web search via Firecrawl, scrape the top results, and return their markdown content. Use to gather sources for the research topic.',
    parameters: ParamsSchema,
    async execute(_id: string, params: Params, signal?: AbortSignal) {
      if (deps.isLastTurn()) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'turn limit reached, stop calling tools and end your response with the findings you already have.',
            },
          ],
          details: { skipped: true },
          terminate: true,
        };
      }

      const result = await limit(async () => {
        signal?.throwIfAborted?.();
        return firecrawl.search(params.query, {
          timeout: 15000,
          limit: 5,
          scrapeOptions: { formats: ['markdown'] },
        });
      });

      const newUrls = compact(result.data.map(item => item.url));
      for (const url of newUrls) deps.state.visitedUrls.add(url);

      const contents = compact(result.data.map(item => item.markdown)).map(c =>
        trimPrompt(c, 25_000),
      );

      const text =
        contents.length === 0
          ? `No content returned for query "${params.query}".`
          : `Search results for "${params.query}" (${contents.length} pages):\n\n` +
            contents.map((c, i) => `<result index="${i}">\n${c}\n</result>`).join('\n');

      return {
        content: [{ type: 'text' as const, text }],
        details: { urls: newUrls, count: contents.length },
      };
    },
  };
}
