import { runResearchAgent } from './agent/research-agent.js';
import type { UsageTracker } from './agent/usage.js';

type ResearchResult = {
  answer: string;
  visitedUrls: string[];
};

export async function deepResearch({
  query,
  usage,
}: {
  query: string;
  usage?: UsageTracker;
}): Promise<ResearchResult> {
  const { state, answer } = await runResearchAgent({ query, usage });
  return {
    answer,
    visitedUrls: [...state.visitedUrls],
  };
}
