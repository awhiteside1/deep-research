import { Type, type Static } from '@mariozechner/pi-ai';
import type { AgentTool } from '@mariozechner/pi-agent-core';

import type { ResearchState } from './state.js';

const LearningSchema = Type.Object({
  learning: Type.String({
    description:
      'A concise, information-dense fact extracted from research. Include entities, metrics, dates where applicable.',
  }),
  sourceUrl: Type.Optional(
    Type.String({ description: 'Optional source URL the learning came from.' }),
  ),
});

const FollowUpSchema = Type.Object({
  question: Type.String({
    description: 'A follow-up research question to dig deeper into the topic.',
  }),
});

interface Deps {
  state: ResearchState;
  isLastTurn: () => boolean;
}

export function createRecordLearningTool(deps: Deps): AgentTool<typeof LearningSchema> {
  return {
    name: 'record_learning',
    label: 'Record learning',
    description:
      'Append a learning to the research notebook. Call once per distinct fact you want to keep.',
    parameters: LearningSchema,
    async execute(_id, params: Static<typeof LearningSchema>) {
      deps.state.learnings.push({ learning: params.learning, sourceUrl: params.sourceUrl });
      const total = deps.state.learnings.length;
      return {
        content: [
          {
            type: 'text' as const,
            text: `Recorded learning #${total}. Continue researching or finish if coverage is sufficient.`,
          },
        ],
        details: { total },
      };
    },
  };
}

export function createRecordFollowUpTool(deps: Deps): AgentTool<typeof FollowUpSchema> {
  return {
    name: 'record_followup',
    label: 'Record follow-up question',
    description:
      'Queue a follow-up question for further research. Use to keep track of threads worth investigating.',
    parameters: FollowUpSchema,
    async execute(_id, params: Static<typeof FollowUpSchema>) {
      deps.state.followUps.push(params.question);
      const total = deps.state.followUps.length;
      return {
        content: [
          { type: 'text' as const, text: `Queued follow-up #${total}.` },
        ],
        details: { total },
      };
    },
  };
}
