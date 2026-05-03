import { Agent } from '@mariozechner/pi-agent-core';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { AssistantMessage } from '@mariozechner/pi-ai';

import { getModel } from '../ai/providers.js';
import { attachLogging } from '../logging.js';
import { createResearchState, type ResearchState } from '../tools/state.js';
import { createReadPageTool } from '../tools/read-page.js';
import { createWebSearchTool } from '../tools/web-search.js';
import { UsageTracker } from './usage.js';

const HARD_TURN_CEILING = 20;

export interface RunResearchAgentOptions {
  query: string;
  usage?: UsageTracker;
}

export interface RunResearchAgentResult {
  state: ResearchState;
  turns: number;
  answer: string;
}

function buildSystemPrompt(turnCeiling: number): string {
  return `You research the user's question on the web and answer it.

Read the query for any explicit signals before you start, and let them shape the deliverable:
- Format and length: pick whatever fits — a one-liner, a paragraph, a bulleted list, a table, a sectioned Markdown report with headings. Match the shape to the question. A factual lookup deserves a sentence; a comparison deserves a table or short sections; an open-ended survey deserves a structured long-form write-up. Honour explicit hints in the query ("short", "one-liner", "report", "deep dive", "table of…") but don't treat them as a binary — interpolate.
- Effort: phrases like "quick", "rough", "just check" → minimize turns. Phrases like "thorough", "exhaustive", "deep" → spend more. If silent, use as many turns as the question genuinely needs and no more.
- Recency, geography, audience, scope: apply whatever the query specifies; otherwise pick sensible defaults a competent researcher would.

Do not ask the user clarifying questions — there is no interactive channel back. Default aggressively to sensible assumptions. Only if the query contains a genuine internal contradiction or an ambiguity so severe that any chosen interpretation is likely useless, abort immediately without doing research: respond on the first turn with a single message starting with the literal token \`ERROR:\` followed by a one-paragraph description of the specific conflict or unresolvable ambiguity and what input would resolve it. Do not call tools in that case.

Hard ceiling: ${turnCeiling} turns. One turn = one assistant message (parallel tool calls count as one). Stop earlier — usually much earlier — once you can answer well. Do not pad.

Tools:
- web_search(query, researchGoal) — returns top result links (url/title/snippet) only. Does NOT fetch bodies.
- read_page(url, sections?, query?) — fetch a page. Small pages return in full. Large pages return an outline; call again with sections=["Heading > Subheading", ...] to get just those parts. Pages are cached.

Workflow: search to find candidate URLs, read_page on the most promising ones, drill into specific sections of large pages instead of dumping them whole.

Cost grows every turn. Each turn re-sends the entire conversation plus all prior tool results, so turn N is more expensive than turn N-1, and the gap widens fast. Optimize ruthlessly:
- Batch independent calls in a single turn — multiple web_search queries together, multiple read_page URLs together. The agent supports parallel tool calls; use them.
- Don't re-read a page you already saw. Pick sections from the outline by exact heading text on the FIRST follow-up call, not the third.
- If a page's outline doesn't have what you need, switch sources rather than re-querying the same URL.
- When the answer is in hand, stop. Extra confirmation reads are rarely worth their cost.

Finish with a turn containing NO tool calls — just the final answer or report in Markdown. That message is what gets saved verbatim, so make it the deliverable.

This is a non-interactive run. The user cannot reply. Do NOT end with offers like "I can also turn this into a profile/summary/table/deeper dive — let me know" or any other follow-up prompt. No questions, no menu of alternative formats, no "want me to…". Decide the right shape, deliver it, stop.`;
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
  const turnCeiling = HARD_TURN_CEILING;
  const state = createResearchState();
  const { model, options: providerOptions } = getModel();

  let turnIndex = 0;
  const isLastTurn = () => turnIndex >= turnCeiling;

  const tools: AgentTool<any>[] = [
    createWebSearchTool({ state, isLastTurn }),
    createReadPageTool({ state, isLastTurn }),
  ];

  const agent = new Agent({
    initialState: {
      systemPrompt: buildSystemPrompt(turnCeiling),
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

  attachLogging(agent, {
    query: options.query,
    maxTurns: turnCeiling,
    modelId: getModel().modelId,
  });

  let answer = '';
  agent.subscribe(event => {
    if (event.type === 'turn_end') {
      turnIndex += 1;
      const msg = event.message as AssistantMessage | undefined;
      const text = extractText(msg?.content);
      if (text) answer = text;
      if (turnIndex === turnCeiling - 1) {
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
