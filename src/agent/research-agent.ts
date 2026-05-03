import { Agent } from '@mariozechner/pi-agent-core';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import { getModel } from '../ai/providers.js';
import { systemPrompt } from '../prompt.js';
import { createResearchState, type ResearchState } from '../tools/state.js';
import { createWebSearchTool } from '../tools/web-search.js';
import {
  createRecordFollowUpTool,
  createRecordLearningTool,
} from '../tools/record.js';
import { UsageTracker } from './usage.js';

export interface RunResearchAgentOptions {
  query: string;
  maxTurns?: number;
  usage?: UsageTracker;
}

export interface RunResearchAgentResult {
  state: ResearchState;
  turns: number;
}

function buildSystemPrompt(maxTurns: number): string {
  return `${systemPrompt()}

You are conducting iterative web research with a hard budget of ${maxTurns} turns.
A "turn" is one assistant message; calling multiple tools in a single message counts as one turn.

Available tools:
- web_search({ query, researchGoal }): run a search and read the scraped pages.
- record_learning({ learning, sourceUrl? }): persist one concise fact (entities, metrics, dates).
- record_followup({ question }): queue a research question for later threads.

Strategy:
- Turn 1: fan out across the most distinct angles of the question with parallel web_search calls.
- Subsequent turns: read what came back, record_learning for each useful fact, then drill deeper on the highest-leverage gap.
- Prefer high-signal sources. Stop searching when learnings plateau.
- You self-pace within ${maxTurns} turns. On the final turn, stop calling tools and return a short text summary.

Finish by returning a turn with NO tool calls. Do not invent a "done" tool. The orchestrator renders the final report from your recorded learnings; you do not need to write it yourself.`;
}

export async function runResearchAgent(
  options: RunResearchAgentOptions,
): Promise<RunResearchAgentResult> {
  const maxTurns = options.maxTurns ?? 10;
  const state = createResearchState();
  const { model, options: providerOptions } = getModel();

  let turnIndex = 0;
  const isLastTurn = () => turnIndex >= maxTurns;

  const tools: AgentTool<any>[] = [
    createWebSearchTool({ state, isLastTurn }),
    createRecordLearningTool({ state, isLastTurn }),
    createRecordFollowUpTool({ state, isLastTurn }),
  ];

  const agent = new Agent({
    initialState: {
      systemPrompt: buildSystemPrompt(maxTurns),
      model,
      thinkingLevel: 'off',
      tools,
      messages: [],
    },
    toolExecution: 'parallel',
    getApiKey: () => providerOptions.apiKey as string | undefined,
  });

  if (options.usage) {
    options.usage.attach(agent, 'research-turn');
  }

  agent.subscribe(event => {
    if (event.type === 'turn_end') {
      turnIndex += 1;
      if (turnIndex === maxTurns - 1) {
        agent.steer({
          role: 'user',
          content:
            'One turn left after this. Record any final learnings now. On the next turn return a brief text summary with NO tool calls.',
          timestamp: Date.now(),
        });
      }
    }
  });

  await agent.prompt({
    role: 'user',
    content: options.query,
    timestamp: Date.now(),
  });

  return { state, turns: turnIndex };
}
