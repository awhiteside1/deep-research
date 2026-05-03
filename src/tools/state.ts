export interface ResearchState {
  learnings: { learning: string; sourceUrl?: string }[];
  followUps: string[];
  visitedUrls: Set<string>;
}

export function createResearchState(): ResearchState {
  return { learnings: [], followUps: [], visitedUrls: new Set() };
}
