import {
  deepResearch,
  deepResearchClassic,
  writeFinalAnswer,
} from './src/deep-research.js';
import { getModel } from './src/ai/providers.js';
import { UsageTracker } from './src/agent/usage.js';

interface RunSummary {
  label: string;
  learnings: string[];
  urls: string[];
  answer: string;
  usage: UsageTracker;
  wallClockMs: number;
}

async function runOne(
  label: string,
  prompt: string,
  fn: (
    usage: UsageTracker,
  ) => Promise<{ learnings: string[]; visitedUrls: string[] }>,
): Promise<RunSummary> {
  const usage = new UsageTracker();
  const t0 = Date.now();
  const { learnings, visitedUrls } = await fn(usage);
  const answer = await writeFinalAnswer({ prompt, learnings, usage });
  return {
    label,
    learnings,
    urls: visitedUrls,
    answer,
    usage,
    wallClockMs: Date.now() - t0,
  };
}

function overlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  const hits = a.filter(x => setB.has(x)).length;
  return hits / Math.max(a.length, b.length);
}

function summarize(s: RunSummary) {
  const t = s.usage.totals();
  const tokensPerLearning =
    s.learnings.length === 0 ? 0 : t.totalTokens / s.learnings.length;
  return {
    label: s.label,
    input: t.input,
    output: t.output,
    cacheRead: t.cacheRead,
    cacheWrite: t.cacheWrite,
    total: t.totalTokens,
    cost: Number(t.cost.toFixed(6)),
    wallClockMs: s.wallClockMs,
    learnings: s.learnings.length,
    urls: s.urls.length,
    tokensPerLearning: Math.round(tokensPerLearning),
  };
}

// A minimal-research factual query whose answer is obvious from a single
// Wikipedia page. Keeps both paths cheap and makes apples-to-apples easy:
// either path *should* reach the same one-word answer ("Lyon").
const DEFAULT_QUERY = 'What is the third largest city of France by population?';

async function main() {
  const args = process.argv.slice(2);
  const query = args.find(a => !a.startsWith('--')) ?? DEFAULT_QUERY;

  console.log('model:', getModel().modelId);
  console.log('query:', query);

  // Run sequentially (not in parallel) to avoid contending on Firecrawl rate
  // limits and to keep wall-clock numbers comparable.
  const classic = await runOne('classic', query, usage =>
    deepResearchClassic({ query, breadth: 2, depth: 2, usage }),
  );
  const agent = await runOne('agent', query, usage =>
    deepResearch({ query, maxTurns: 5, usage }),
  );

  classic.usage.print('classic per-call-site');
  agent.usage.print('agent per-turn');

  const overlapPct = overlap(classic.urls, agent.urls);
  const a = summarize(classic);
  const b = summarize(agent);

  console.log('\n=== comparison ===');
  console.table([a, b]);
  console.log(`source-URL overlap: ${(overlapPct * 100).toFixed(1)}%`);

  console.log('\n--- answers ---');
  console.log(`classic: ${classic.answer}`);
  console.log(`agent:   ${agent.answer}`);

  console.log('\n--- classic learnings ---');
  classic.learnings.forEach((l, i) => console.log(`${i + 1}. ${l}`));
  console.log('\n--- agent learnings ---');
  agent.learnings.forEach((l, i) => console.log(`${i + 1}. ${l}`));
}

main().catch(e => {
  console.error('ERR:', e);
  process.exit(1);
});
