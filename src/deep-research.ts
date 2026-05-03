import { z } from 'zod';

import { runResearchAgent } from './agent/research-agent.js';
import type { UsageTracker } from './agent/usage.js';
import { generateObject, trimPrompt } from './ai/providers.js';
import { systemPrompt } from './prompt.js';

type ResearchResult = {
  answer: string;
  visitedUrls: string[];
};

export async function writeFinalReport({
  prompt,
  answer,
  visitedUrls,
  usage,
}: {
  prompt: string;
  answer: string;
  visitedUrls: string[];
  usage?: UsageTracker;
}) {
  const res = await generateObject({
    usage,
    usageLabel: 'writeFinalReport',
    system: systemPrompt(),
    prompt: trimPrompt(
      `Given the user's prompt and the researcher's findings, write a detailed final report (3+ pages). Incorporate every fact in the findings.\n\n<prompt>${prompt}</prompt>\n\n<findings>\n${answer}\n</findings>`,
    ),
    schema: z.object({
      reportMarkdown: z.string().describe('Final report on the topic in Markdown'),
    }),
  });

  const urlsSection = `\n\n## Sources\n\n${visitedUrls.map(url => `- ${url}`).join('\n')}`;
  return res.object.reportMarkdown + urlsSection;
}

export async function deepResearch({
  query,
  maxTurns,
  usage,
}: {
  query: string;
  maxTurns?: number;
  usage?: UsageTracker;
}): Promise<ResearchResult> {
  const { state, answer } = await runResearchAgent({ query, maxTurns, usage });
  return {
    answer,
    visitedUrls: [...state.visitedUrls],
  };
}
