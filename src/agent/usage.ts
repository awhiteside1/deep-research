import type { Agent } from '@mariozechner/pi-agent-core';
import type { AssistantMessage, Usage } from '@mariozechner/pi-ai';

export interface UsageEntry {
  label: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  cost: number;
}

const ZERO: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

function toEntry(label: string, u: Usage | undefined): UsageEntry {
  const usage = u ?? ZERO;
  return {
    label,
    input: usage.input,
    output: usage.output,
    cacheRead: usage.cacheRead,
    cacheWrite: usage.cacheWrite,
    totalTokens: usage.totalTokens,
    cost: usage.cost?.total ?? 0,
  };
}

export class UsageTracker {
  private entries: UsageEntry[] = [];

  record(label: string, usage: Usage | undefined) {
    this.entries.push(toEntry(label, usage));
  }

  recordCompletion(label: string, message: { usage?: Usage }) {
    this.record(label, message.usage);
  }

  attach(agent: Agent, labelPrefix = 'agent-turn') {
    let turnIndex = 0;
    return agent.subscribe(event => {
      if (event.type === 'turn_end') {
        const msg = event.message as AssistantMessage;
        if (msg && msg.role === 'assistant' && msg.usage) {
          turnIndex += 1;
          this.record(`${labelPrefix}#${turnIndex}`, msg.usage);
        }
      }
    });
  }

  totals(): UsageEntry {
    return this.entries.reduce<UsageEntry>(
      (acc, e) => ({
        label: 'TOTAL',
        input: acc.input + e.input,
        output: acc.output + e.output,
        cacheRead: acc.cacheRead + e.cacheRead,
        cacheWrite: acc.cacheWrite + e.cacheWrite,
        totalTokens: acc.totalTokens + e.totalTokens,
        cost: acc.cost + e.cost,
      }),
      { label: 'TOTAL', input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: 0 },
    );
  }

  list(): UsageEntry[] {
    return [...this.entries];
  }

  print(title: string) {
    const rows = [...this.entries, this.totals()];
    console.log(`\n=== ${title} ===`);
    console.log(
      ['label', 'input', 'output', 'cacheR', 'cacheW', 'total', 'cost($)']
        .map(s => s.padEnd(12))
        .join(' '),
    );
    for (const r of rows) {
      console.log(
        [
          r.label,
          String(r.input),
          String(r.output),
          String(r.cacheRead),
          String(r.cacheWrite),
          String(r.totalTokens),
          r.cost.toFixed(6),
        ]
          .map(s => s.padEnd(12))
          .join(' '),
      );
    }
  }
}
