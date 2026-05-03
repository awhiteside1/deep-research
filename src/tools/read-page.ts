import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import { getToolLogger } from '../logging.js';
import { loadPage } from './fetch-page.js';

const log = getToolLogger('read-page');
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

export function renderOutline(page: ExtractedPage, budget: number = PageBudgetTokens): string {
  const outline = getOutline(page);
  const lines = outline.map(o => {
    const indent = '  '.repeat(Math.max(0, o.level - 1));
    return `${indent}- ${o.path} (${o.tokenCount} tok)`;
  });
  return [
    `# ${page.title}`,
    `${page.url}`,
    `Total: ${page.tokenCount} tokens — exceeds ${budget} budget. Pick sections via read_page(url, sections: [...]).`,
    '',
    'Outline:',
    ...lines,
  ].join('\n');
}

export type ReadPageRoute =
  | { mode: 'full'; text: string; tokens: number }
  | { mode: 'outline'; text: string; tokens: number; headings: number }
  | { mode: 'sections'; text: string; included: string[]; truncatedTail: number; tokens: number };

export function routeReadPage(
  page: ExtractedPage,
  params: { sections?: string[]; query?: string },
  budget: number = PageBudgetTokens,
): ReadPageRoute {
  const noSelectors = (!params.sections || params.sections.length === 0) && !params.query;

  if (noSelectors && page.tokenCount <= budget) {
    return {
      mode: 'full',
      text: `# ${page.title}\n${page.url}\n\n${page.markdown}`,
      tokens: page.tokenCount,
    };
  }

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

  if (indices.length === 0) {
    if (page.tokenCount <= budget) {
      return {
        mode: 'full',
        text: `# ${page.title}\n${page.url}\n\n${page.markdown}`,
        tokens: page.tokenCount,
      };
    }
    return {
      mode: 'outline',
      text: renderOutline(page, budget),
      tokens: page.tokenCount,
      headings: page.headings.length,
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

  const { packed, included, truncatedTail } = packToBudget(parts, budget);
  const header = `# ${page.title}\n${page.url}\n\nSections (${included.length}/${indices.length}${truncatedTail ? `, ${truncatedTail} tail-skipped` : ''}):`;

  return {
    mode: 'sections',
    text: `${header}\n\n${packed}`,
    included,
    truncatedTail,
    tokens: page.tokenCount,
  };
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

      log.debug('read_request', {
        event: 'read_request',
        url: params.url,
        sections: params.sections,
        query: params.query,
      });
      const page = await loadPage(deps.state, params.url, signal);
      if (!page) {
        log.debug('read_failed', { event: 'read_failed', url: params.url });
        return {
          content: [
            { type: 'text' as const, text: `Could not fetch or extract content from ${params.url}.` },
          ],
          details: { url: params.url, ok: false },
          isError: true,
        };
      }
      deps.state.visitedUrls.add(params.url);

      const prevMisses = deps.state.outlineMissCount.get(params.url) ?? 0;
      let route = routeReadPage(page, { sections: params.sections, query: params.query });

      if (route.mode === 'outline') {
        if (prevMisses >= 1) {
          const parts = page.headings.map((_, i) => {
            const s = getSection(page, i);
            return s ? { label: s.path, text: `## ${s.path}\n\n${s.markdown}`, tokenCount: s.tokenCount } : null;
          }).filter((x): x is { label: string; text: string; tokenCount: number } => !!x);
          const { packed, included, truncatedTail } = packToBudget(parts, PageBudgetTokens);
          const header = `# ${page.title}\n${page.url}\n\nAuto-packed (selector misses repeated). Sections (${included.length}/${parts.length}${truncatedTail ? `, ${truncatedTail} tail-skipped` : ''}). Each extra read_page call burns more context — answer from this slice if you can.`;
          route = {
            mode: 'sections',
            text: `${header}\n\n${packed}`,
            included,
            truncatedTail,
            tokens: page.tokenCount,
          };
        } else {
          deps.state.outlineMissCount.set(params.url, prevMisses + 1);
          route = {
            ...route,
            text: `${route.text}\n\nNote: Each turn costs more than the last (context grows with every tool call). Pick sections by exact heading text from the outline above. If you can't find what you need, answer from the search snippets instead of re-reading.`,
          };
        }
      }

      const baseDetails = { url: page.url, tokens: page.tokenCount, source: page.source };
      const details =
        route.mode === 'sections'
          ? { ...baseDetails, mode: route.mode, included: route.included, truncatedTail: route.truncatedTail }
          : route.mode === 'outline'
            ? { ...baseDetails, mode: route.mode, headings: route.headings }
            : { ...baseDetails, mode: route.mode };
      return {
        content: [{ type: 'text' as const, text: route.text }],
        details,
      };
    },
  };
}
