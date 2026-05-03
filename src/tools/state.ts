import type { ExtractedPage } from './page-extract.js';

export interface ResearchState {
  visitedUrls: Set<string>;
  pageCache: Map<string, ExtractedPage>;
  outlineMissCount: Map<string, number>;
}

export function createResearchState(): ResearchState {
  return {
    visitedUrls: new Set(),
    pageCache: new Map(),
    outlineMissCount: new Map(),
  };
}
