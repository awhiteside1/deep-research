import { Agent } from '@mariozechner/pi-agent-core';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { AssistantMessage } from '@mariozechner/pi-ai';

import { getModel } from '../ai/providers.js';
import { createResearchState, type ResearchState } from '../tools/state.js';
import { createReadPageTool } from '../tools/read-page.js';
import { createWebSearchTool } from '../tools/web-search.js';
import { UsageTracker } from './usage.js';

export interface RunResearchAgentOptions {
  query: string;
  maxTurns?: number;
  usage?: UsageTracker;
}

export interface RunResearchAgentResult {
  state: ResearchState;
  turns: number;
  answer: string;
}

function buildSystemPrompt(maxTurns: number): string {
  return `You research the user's question on the web and answer it.

Budget: ${maxTurns} turns. One turn = one assistant message (parallel tool calls count as one).

Tools:
- web_search(query, researchGoal) — returns top result links (url/title/snippet) only. Does NOT fetch bodies.
- read_page(url, sections?, query?) — fetch a page. Small pages return in full. Large pages return an outline; call again with sections=["Heading > Subheading", ...] to get just those parts. Pages are cached.

Workflow: search to find candidate URLs, read_page on the most promising ones, drill into specific sections of large pages instead of dumping them whole. Run independent reads in parallel. Stop early once you can answer.

Finish with a turn containing NO tool calls — just the answer in plain text.`;
}

function extractText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content
    .filter((c: any) => c && c.type === 'text')
    .map((c: any) => c.text)
    .join('')
    .trim();
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
    createReadPageTool({ state, isLastTurn }),
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

  let answer = '';
  agent.subscribe(event => {
    if (event.type === 'turn_end') {
      turnIndex += 1;
      const msg = event.message as AssistantMessage | undefined;
      const text = extractText(msg?.content);
      if (text) answer = text;
      if (turnIndex === maxTurns - 1) {
        agent.steer({
          role: 'user',
          content:
            'One turn left after this. Stop calling tools and answer in plain text on the next turn.',
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

  return { state, turns: turnIndex, answer };
}
