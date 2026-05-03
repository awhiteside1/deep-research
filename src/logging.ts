import { getFileSink } from '@logtape/file';
import {
  configure,
  getConsoleSink,
  getJsonLinesFormatter,
  getLogger,
  lazy,
  withFilter,
} from '@logtape/logtape';
import { prettyFormatter } from '@logtape/pretty';

import type { Agent } from '@mariozechner/pi-agent-core';

export interface ConfigureLoggingOptions {
  jsonlPath: string;
}

let configured = false;

export async function configureLogging(options: ConfigureLoggingOptions): Promise<void> {
  if (configured) return;
  configured = true;

  await configure({
    sinks: {
      file: getFileSink(options.jsonlPath, {
        lazy: true,
        bufferSize: 8192,
        flushInterval: 1000,
        formatter: getJsonLinesFormatter(),
      }),
      console: withFilter(getConsoleSink({ formatter: prettyFormatter }), 'info'),
    },
    loggers: [
      {
        category: ['deep-research'],
        sinks: ['console', 'file'],
        lowestLevel: 'debug',
      },
      {
        category: ['logtape', 'meta'],
        sinks: [],
        lowestLevel: 'warning',
      },
    ],
  });
}

export function getAgentLogger() {
  return getLogger(['deep-research', 'agent']);
}

export function getToolLogger(name: string) {
  return getLogger(['deep-research', 'tool', name]);
}

function summarize(text: string, limit = 500): string {
  if (!text) return '';
  return text.length <= limit ? text : `${text.slice(0, limit)}…`;
}

export function extractText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return content
    .filter((c: any) => c && c.type === 'text')
    .map((c: any) => c.text)
    .join('');
}

function extractThinking(content: unknown): string[] {
  if (!Array.isArray(content)) return [];
  return content
    .filter((c: any) => c && (c.type === 'thinking' || c.type === 'reasoning'))
    .map((c: any) => c.thinking ?? c.text ?? '')
    .filter(Boolean);
}

function extractToolCalls(content: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(content)) return [];
  return content
    .filter((c: any) => c && c.type === 'toolCall')
    .map((c: any) => ({ id: c.id, name: c.name, arguments: c.arguments }));
}

function describeArgs(toolName: string, args: any): string {
  if (!args || typeof args !== 'object') return '';
  if (toolName === 'web_search' && typeof args.query === 'string') {
    return `"${summarize(args.query, 80)}"`;
  }
  if (toolName === 'read_page' && typeof args.url === 'string') {
    const sections =
      Array.isArray(args.sections) && args.sections.length
        ? ` [${args.sections.slice(0, 3).join(', ')}${args.sections.length > 3 ? ',…' : ''}]`
        : '';
    return `${args.url}${sections}`;
  }
  return '';
}

interface RunState {
  query: string;
  modelId: string;
  maxTurns: number;
  turn: number;
  // inputUncached = tokens NOT served from cache; totalInput = inputUncached + cacheRead = actual context sent to model
  inputUncached: number | undefined;
  cacheRead: number | undefined;
  totalInput: number | undefined;
  output: number | undefined;
  totalTokens: number | undefined;
  cost: number | undefined;
}

function applyUsage(state: RunState, raw: any): void {
  if (!raw) return;
  const inputUncached = raw.input ?? raw.inputTokens ?? 0;
  const cacheRead = raw.cacheRead ?? raw.cacheReadTokens ?? 0;
  const output = raw.output ?? raw.outputTokens ?? 0;
  state.inputUncached = inputUncached;
  state.cacheRead = cacheRead;
  state.totalInput = inputUncached + cacheRead;
  state.output = output;
  state.totalTokens = inputUncached + cacheRead + output;
  state.cost = raw.cost;
}

export function attachLogging(
  agent: Agent,
  meta: { query: string; maxTurns: number; modelId: string },
): void {
  const state: RunState = {
    query: meta.query,
    modelId: meta.modelId,
    maxTurns: meta.maxTurns,
    turn: 0,
    inputUncached: undefined,
    cacheRead: undefined,
    totalInput: undefined,
    output: undefined,
    totalTokens: undefined,
    cost: undefined,
  };

  const log = getAgentLogger().with({
    modelId: lazy(() => state.modelId),
    maxTurns: lazy(() => state.maxTurns),
    turn: lazy(() => state.turn),
    inputUncached: lazy(() => state.inputUncached),
    cacheRead: lazy(() => state.cacheRead),
    totalInput: lazy(() => state.totalInput),
    output: lazy(() => state.output),
    totalTokens: lazy(() => state.totalTokens),
    cost: lazy(() => state.cost),
  });

  log.info('agent_start model={modelId} maxTurns={maxTurns} query={query}', {
    event: 'agent_start',
    query: summarize(meta.query, 100),
  });

  let lastAssistantText = '';
  const argsById = new Map<string, { name: string; args: any }>();

  agent.subscribe((event: any) => {
    const e = event;
    switch (e.type) {
      case 'turn_start': {
        state.turn += 1;
        log.debug('turn_start turn={turn}', { event: 'turn_start' });
        break;
      }
      case 'turn_end': {
        applyUsage(state, e.message?.usage);
        log.info(
          'turn_end turn={turn} totalInput={totalInput} inputUncached={inputUncached} cacheRead={cacheRead} out={output}',
          { event: 'turn_end' },
        );
        break;
      }
      case 'message_end': {
        const msg = e.message ?? {};
        const text = extractText(msg.content);
        if (msg.role === 'assistant' && text) lastAssistantText = text;
        if (msg.role === 'assistant') applyUsage(state, msg.usage);
        log.debug('message_end', {
          event: 'message_end',
          role: msg.role,
          text,
          thinking: extractThinking(msg.content),
          toolCalls: extractToolCalls(msg.content),
        });
        break;
      }
      case 'tool_execution_start': {
        const args = e.args ?? e.arguments;
        argsById.set(e.toolCallId, { name: e.toolName, args });
        log.info('tool_start {tool} {desc}', {
          event: 'tool_execution_start',
          tool: e.toolName,
          desc: describeArgs(e.toolName, args),
          toolCallId: e.toolCallId,
          args,
        });
        break;
      }
      case 'tool_execution_end': {
        const result = e.result;
        const text = Array.isArray(result?.content)
          ? result.content
              .filter((c: any) => c && c.type === 'text')
              .map((c: any) => c.text)
              .join('')
          : '';
        const stored = argsById.get(e.toolCallId);
        argsById.delete(e.toolCallId);
        log.info('tool_end {tool} {status} mode={mode} tokens={tokens} {desc}', {
          event: 'tool_execution_end',
          tool: e.toolName,
          status: result?.isError ? 'ERR' : 'ok',
          mode: result?.details?.mode,
          tokens: result?.details?.tokens,
          desc: stored ? describeArgs(stored.name, stored.args) : '',
          toolCallId: e.toolCallId,
          isError: !!result?.isError,
          details: result?.details,
          resultSummary: summarize(text, 500),
        });
        log.debug('tool_execution_result', {
          event: 'tool_execution_result',
          toolName: e.toolName,
          toolCallId: e.toolCallId,
          result,
        });
        break;
      }
      case 'agent_end': {
        log.info('agent_end turns={turn} answerChars={answerChars}', {
          event: 'agent_end',
          answerChars: lastAssistantText.length,
        });
        break;
      }
    }
  });
}
