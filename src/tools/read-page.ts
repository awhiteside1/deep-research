import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import { loadPage } from './fetch-page.js';
import {
  findHeadingIndex,
  getOutline,
  getSection,
  packToBudget,
  type ExtractedPage,
} from './page-extract.js';
import type { ResearchState } from './state.js';

const PageBudgetTokens = 5_000;

const ParamsSchema = Type.Object({
  url: Type.String({ description: 'Absolute URL of the page to read.' }),
  sections: Type.Optional(
    Type.Array(Type.String(), {
      description:
        'Heading paths/anchors to fetch (e.g. "Demographics > Population", "history", "#references"). If omitted on a large page, an outline is returned so you can choose.',
    }),
  ),
  query: Type.Optional(
    Type.String({
      description:
        'Optional substring filter applied to heading text/path; only matching sections are returned.',
    }),
  ),
});

type Params = Static<typeof ParamsSchema>;

export interface ReadPageToolDeps {
  state: ResearchState;
  isLastTurn: () => boolean;
}

function renderOutline(page: ExtractedPage): string {
  const outline = getOutline(page);
  const lines = outline.map(o => {
    const indent = '  '.repeat(Math.max(0, o.level - 1));
    return `${indent}- ${o.path} (${o.tokenCount} tok)`;
  });
  return [
    `# ${page.title}`,
    `${page.url}`,
    `Total: ${page.tokenCount} tokens — exceeds ${PageBudgetTokens} budget. Pick sections via read_page(url, sections: [...]).`,
    '',
    'Outline:',
    ...lines,
  ].join('\n');
}

export function createReadPageTool(deps: ReadPageToolDeps): AgentTool<typeof ParamsSchema> {
  return {
    name: 'read_page',
    label: 'Read page',
    description: `Fetch and read a web page as cleaned markdown. If the page fits in ${PageBudgetTokens} tokens it is returned in full; otherwise an outline is returned and you must call again with the "sections" you want. Pages are cached per URL.`,
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

      const page = await loadPage(deps.state, params.url, signal);
      if (!page) {
        return {
          content: [
            { type: 'text' as const, text: `Could not fetch or extract content from ${params.url}.` },
          ],
          details: { url: params.url, ok: false },
          isError: true,
        };
      }
      deps.state.visitedUrls.add(params.url);

      // Whole page fits — return it.
      if (!params.sections && !params.query && page.tokenCount <= PageBudgetTokens) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `# ${page.title}\n${page.url}\n\n${page.markdown}`,
            },
          ],
          details: {
            url: page.url,
            tokens: page.tokenCount,
            source: page.source,
            mode: 'full',
          },
        };
      }

      // Resolve which sections to return.
      let indices: number[] = [];
      if (params.sections && params.sections.length) {
        const seen = new Set<number>();
        for (const sel of params.sections) {
          const i = findHeadingIndex(page, sel);
          if (i >= 0 && !seen.has(i)) {
            seen.add(i);
            indices.push(i);
          }
        }
      } else if (params.query) {
        const q = params.query.toLowerCase();
        indices = page.headings
          .map((h, i) => ({ i, hit: h.text.toLowerCase().includes(q) }))
          .filter(x => x.hit)
          .map(x => x.i);
      }

      // No sections requested and page is too big -> outline.
      if (indices.length === 0) {
        if (page.tokenCount <= PageBudgetTokens) {
          // Filter requested but nothing matched and page fits anyway.
          return {
            content: [
              {
                type: 'text' as const,
                text: `# ${page.title}\n${page.url}\n\n${page.markdown}`,
              },
            ],
            details: { url: page.url, tokens: page.tokenCount, source: page.source, mode: 'full' },
          };
        }
        return {
          content: [{ type: 'text' as const, text: renderOutline(page) }],
          details: {
            url: page.url,
            tokens: page.tokenCount,
            source: page.source,
            mode: 'outline',
            headings: page.headings.length,
          },
        };
      }

      const parts = indices
        .map(i => {
          const s = getSection(page, i);
          if (!s) return null;
          return {
            label: s.path,
            text: `## ${s.path}\n\n${s.markdown}`,
            tokenCount: s.tokenCount,
          };
        })
        .filter((x): x is { label: string; text: string; tokenCount: number } => !!x);

      const { packed, included, truncatedTail } = packToBudget(parts, PageBudgetTokens);
      const header = `# ${page.title}\n${page.url}\n\nSections (${included.length}/${indices.length}${truncatedTail ? `, ${truncatedTail} tail-skipped` : ''}):`;

      return {
        content: [{ type: 'text' as const, text: `${header}\n\n${packed}` }],
        details: {
          url: page.url,
          tokens: page.tokenCount,
          source: page.source,
          mode: 'sections',
          included,
          truncatedTail,
        },
      };
    },
  };
}
