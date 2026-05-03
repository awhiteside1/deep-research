import type { ExtractedPage } from './page-extract.js';

export interface ResearchState {
  learnings: { learning: string; sourceUrl?: string }[];
  followUps: string[];
  visitedUrls: Set<string>;
  pageCache: Map<string, ExtractedPage>;
}

export function createResearchState(): ResearchState {
  return {
    learnings: [],
    followUps: [],
    visitedUrls: new Set(),
    pageCache: new Map(),
  };
}
