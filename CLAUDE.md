# deep-research

## Key dependencies

### `@mariozechner/pi-agent-core` + `@mariozechner/pi-ai`

Both packages live in the **`/badlogic/pi-mono`** monorepo (Mario Zechner = badlogic).

**context7 lookup:** use library ID `/badlogic/pi-mono`

Key APIs:
- `Agent` class — `new Agent({ initialState: { model, systemPrompt, thinkingLevel, messages, tools }, convertToLlm })`
  - `agent.prompt(msg)`, `agent.subscribe(event => ...)`, `agent.abort()`
  - Events: `agent_start/end`, `turn_start/end`, `message_start/update/end`
- Low-level: `agentLoop(messages, context, config)` — async generator
- Models: `getModel('anthropic' | 'openai', modelId)` from `@mariozechner/pi-ai`
- Streaming: `stream(model, context)`, non-streaming: `complete(model, context)`
- Tools use TypeBox schemas: `{ name, description, parameters: Type.Object({...}) }`
