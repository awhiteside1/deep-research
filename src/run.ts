import * as fs from 'fs/promises';
import * as readline from 'readline';

import { UsageTracker } from './agent/usage.js';
import { getModel } from './ai/providers.js';
import { deepResearch, writeFinalReport } from './deep-research.js';
import { generateFeedback } from './feedback.js';

// Helper function for consistent logging
function log(...args: any[]) {
  console.log(...args);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Helper function to get user input
function askQuestion(query: string): Promise<string> {
  return new Promise(resolve => {
    rl.question(query, answer => {
      resolve(answer);
    });
  });
}

// run the agent
async function run() {
  console.log('Using model: ', getModel().modelId);

  // Get initial query
  const initialQuery = await askQuestion('What would you like to research? ');

  // Get breath and depth parameters
  const maxTurns =
    parseInt(
      await askQuestion(
        'Enter max research turns (recommended 5-20, default 10): ',
      ),
      10,
    ) || 10;
  const isReport =
    (await askQuestion(
      'Do you want to generate a long report or a specific answer? (report/answer, default report): ',
    )) !== 'answer';

  let combinedQuery = initialQuery;
  if (isReport) {
    log(`Creating research plan...`);

    // Generate follow-up questions
    const followUpQuestions = await generateFeedback({
      query: initialQuery,
    });

    log(
      '\nTo better understand your research needs, please answer these follow-up questions:',
    );

    // Collect answers to follow-up questions
    const answers: string[] = [];
    for (const question of followUpQuestions) {
      const answer = await askQuestion(`\n${question}\nYour answer: `);
      answers.push(answer);
    }

    // Combine all information for deep research
    combinedQuery = `
Initial Query: ${initialQuery}
Follow-up Questions and Answers:
${followUpQuestions.map((q: string, i: number) => `Q: ${q}\nA: ${answers[i]}`).join('\n')}
`;
  }

  log('\nStarting research...\n');

  const usage = new UsageTracker();

  if (isReport) {
    // generateFeedback already ran above without a tracker; that's fine — it's
    // outside the research loop and not part of the comparison.
  }

  const { answer, visitedUrls } = await deepResearch({
    query: combinedQuery,
    maxTurns,
    usage,
  });

  log(`\n\nAnswer:\n\n${answer}`);
  log(`\n\nVisited URLs (${visitedUrls.length}):\n\n${visitedUrls.join('\n')}`);

  if (isReport) {
    log('Writing final report...');
    const report = await writeFinalReport({
      prompt: combinedQuery,
      answer,
      visitedUrls,
      usage,
    });

    await fs.writeFile('report.md', report, 'utf-8');
    console.log(`\n\nFinal Report:\n\n${report}`);
    console.log('\nReport has been saved to report.md');
  } else {
    await fs.writeFile('answer.md', answer, 'utf-8');
    console.log('\nAnswer has been saved to answer.md');
  }

  usage.print('Token usage');

  rl.close();
}

run().catch(console.error);
