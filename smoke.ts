import { deepResearch, writeFinalAnswer } from './src/deep-research.js';
import { getModel } from './src/ai/providers.js';

async function main() {
  console.log('model:', getModel().modelId);
  const { learnings, visitedUrls } = await deepResearch({
    query: 'What is the capital of France? Just confirm in one sentence.',
    breadth: 2,
    depth: 1,
  });
  console.log('learnings count:', learnings.length, 'urls:', visitedUrls.length);
  const answer = await writeFinalAnswer({
    prompt: 'What is the capital of France?',
    learnings,
  });
  console.log('ANSWER:', answer);
}
main().catch(e => { console.error('ERR:', e); process.exit(1); });
