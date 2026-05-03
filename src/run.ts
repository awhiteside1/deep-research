import * as fs from 'fs/promises';
import * as readline from 'readline';

import { UsageTracker } from './agent/usage.js';
import { getModel } from './ai/providers.js';
import { deepResearch } from './deep-research.js';
import { configureLogging, getAgentLogger } from './logging.js';

function log(...args: any[]) {
  console.log(...args);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function askQuestion(query: string): Promise<string> {
  return new Promise(resolve => {
    rl.question(query, answer => {
      resolve(answer);
    });
  });
}

async function run() {
  const jsonlPath = `logs/run-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`;
  await fs.mkdir('logs', { recursive: true });
  await configureLogging({ jsonlPath });
  getAgentLogger().info('model_selected', { modelId: getModel().modelId });

  const query = await askQuestion('What would you like to research? ');
  rl.close();

  log('\nStarting research...\n');

  const usage = new UsageTracker();
  const { answer, visitedUrls } = await deepResearch({ query, usage });

  if (answer.startsWith('ERROR:')) {
    console.error(`\n${answer}\n`);
    usage.print('Token usage');
    process.exitCode = 1;
    return;
  }

  const urlsSection = visitedUrls.length
    ? `\n\n## Sources\n\n${visitedUrls.map(u => `- ${u}`).join('\n')}\n`
    : '';
  const output = answer + urlsSection;

  await fs.writeFile('output.md', output, 'utf-8');
  log(`\n\nResult:\n\n${output}`);
  log(`\nVisited URLs (${visitedUrls.length}):\n${visitedUrls.join('\n')}`);
  log('\nSaved to output.md');

  usage.print('Token usage');
}

run().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
