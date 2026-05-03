import {
  getModel as getPiModel,
  type Api,
  type Model,
  type ProviderStreamOptions,
} from '@mariozechner/pi-ai';

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
