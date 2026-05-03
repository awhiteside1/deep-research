import {
  complete,
  getModel as getPiModel,
  parseJsonWithRepair,
  type Api,
  type Context,
  type Model,
  type ProviderStreamOptions,
} from '@mariozechner/pi-ai';
import { getEncoding } from 'js-tiktoken';
import { z } from 'zod';

import { RecursiveCharacterTextSplitter } from './text-splitter.js';

type AnyModel = Model<Api>;

interface ResolvedModel {
  model: AnyModel;
  options: ProviderStreamOptions;
}

const MODEL_PROVIDER = 'openai';
const MODEL_ID = 'gpt-5.4-mini';

let cached: ResolvedModel | undefined;
function resolve(): ResolvedModel {
  if (cached) return cached;
  if (!process.env.OPENAI_KEY) {
    throw new Error('No model configured. Set OPENAI_KEY.');
  }
  const model = getPiModel(MODEL_PROVIDER, MODEL_ID);
  cached = {
    model: model as AnyModel,
    options: { apiKey: process.env.OPENAI_KEY },
  };
  return cached;
}

export function getModel(): { modelId: string } & ResolvedModel {
  const r = resolve();
  return { ...r, modelId: r.model.id };
}

function describeShape(schema: z.ZodTypeAny, indent = ''): string {
  const def: any = (schema as any)._def;
  const desc = (schema as any).description
    ? `  // ${(schema as any).description}`
    : '';
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const lines = Object.entries(shape).map(
      ([k, v]) =>
        `${indent}  "${k}": ${describeShape(v, indent + '  ')}`,
    );
    return `{\n${lines.join(',\n')}\n${indent}}${desc}`;
  }
  if (schema instanceof z.ZodArray) {
    return `[${describeShape(def.type, indent)}, ...]${desc}`;
  }
  if (schema instanceof z.ZodString) return `"<string>"${desc}`;
  if (schema instanceof z.ZodNumber) return `<number>${desc}`;
  if (schema instanceof z.ZodBoolean) return `<boolean>${desc}`;
  return `<value>${desc}`;
}

function extractText(content: any[]): string {
  return content
    .filter((c: any) => c.type === 'text')
    .map((c: any) => c.text)
    .join('');
}

function stripCodeFence(s: string): string {
  const trimmed = s.trim();
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fence ? fence[1]! : trimmed;
}

import type { UsageTracker } from '../agent/usage.js';

export async function generateObject<T extends z.ZodTypeAny>(args: {
  system?: string;
  prompt: string;
  schema: T;
  abortSignal?: AbortSignal;
  usage?: UsageTracker;
  usageLabel?: string;
}): Promise<{ object: z.infer<T> }> {
  const { model, options } = resolve();
  const shape = describeShape(args.schema);
  const jsonInstruction = `Respond with ONLY a JSON object, no prose, no code fences. The JSON must conform to this shape (// comments describe each field):\n${shape}`;
  const system = args.system
    ? `${args.system}\n\n${jsonInstruction}`
    : jsonInstruction;
  const context: Context = {
    systemPrompt: system,
    messages: [{ role: 'user', content: args.prompt, timestamp: Date.now() }],
  };
  const result = await complete(model, context, {
    ...options,
    signal: args.abortSignal,
  });
  if (args.usage) {
    args.usage.recordCompletion(args.usageLabel ?? 'generateObject', result);
  }
  const text = stripCodeFence(extractText(result.content as any));
  const parsed = parseJsonWithRepair<unknown>(text);
  return { object: args.schema.parse(parsed) };
}

const MinChunkSize = 140;
const encoder = getEncoding('o200k_base');

// trim prompt to maximum context size
export function trimPrompt(
  prompt: string,
  contextSize = Number(process.env.CONTEXT_SIZE) || 128_000,
) {
  if (!prompt) {
    return '';
  }

  const length = encoder.encode(prompt).length;
  if (length <= contextSize) {
    return prompt;
  }

  const overflowTokens = length - contextSize;
  const chunkSize = prompt.length - overflowTokens * 3;
  if (chunkSize < MinChunkSize) {
    return prompt.slice(0, MinChunkSize);
  }

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap: 0,
  });
  const trimmedPrompt = splitter.splitText(prompt)[0] ?? '';

  if (trimmedPrompt.length === prompt.length) {
    return trimPrompt(prompt.slice(0, chunkSize), contextSize);
  }

  return trimPrompt(trimmedPrompt, contextSize);
}
