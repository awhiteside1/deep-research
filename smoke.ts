import { deepResearch } from './src/deep-research.js';
import { getModel } from './src/ai/providers.js';
import { UsageTracker } from './src/agent/usage.js';

const DEFAULT_QUERY = 'What is the third largest city of France by population?';

async function main() {
  const args = process.argv.slice(2);
  const query = args.find(a => !a.startsWith('--')) ?? DEFAULT_QUERY;

  console.log('model:', getModel().modelId);
  console.log('query:', query);

  const usage = new UsageTracker();
  const t0 = Date.now();
  const { answer, visitedUrls } = await deepResearch({
    query,
    usage,
  });
  const wallClockMs = Date.now() - t0;

  usage.print('agent per-turn');

  const t = usage.totals();
  console.log('\n=== summary ===');
  console.table([
    {
      input: t.input,
      output: t.output,
      cacheRead: t.cacheRead,
      cacheWrite: t.cacheWrite,
      total: t.totalTokens,
      cost: Number(t.cost.toFixed(6)),
      wallClockMs,
      urls: visitedUrls.length,
    },
  ]);

  console.log(`\nanswer: ${answer}`);
  console.log(`\nurls visited:\n${visitedUrls.map(u => `  ${u}`).join('\n')}`);
}

main().catch(e => {
  console.error('ERR:', e);
  process.exit(1);
});
