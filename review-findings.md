# Deep-Research Agent: Implementation Review Findings

> Prepared for review by a stronger model to generate improvement suggestions.
> Scope: end-to-end workflow, control flow branches, model-guided vs forced behaviors,
> inefficiencies and waste. Cross-referenced against 6 JSONL run logs.

---

## 1. End-to-End Workflow

```
run.ts
  → deepResearch() [deep-research.ts]
    → runResearchAgent() [agent/research-agent.ts]
      → new Agent({ systemPrompt, model, tools, thinkingLevel:'off' })
      → agent.prompt(userQuery)
        ↳ loop: turn_start → model LLM call → tool executions (parallel) → turn_end
        ↳ on turn_end: capture answer text; if turn == ceiling-1, steer("one turn left")
        ↳ tools check isLastTurn() and return terminate:true if at ceiling
      → returns { state, turns, answer }
  → returns { answer, visitedUrls }
```

Each turn re-sends the **entire conversation history plus all prior tool results** to the LLM. This is the pi-agent-core `Agent` class behavior — no context windowing or summarization occurs. Turn N input cost therefore grows quadratically with tool call density.

### Tools

| Tool | Network | Cache | Result shape |
|---|---|---|---|
| `web_search` | Firecrawl search API | None | 5 URL+title+snippet(≤400 chars) |
| `read_page` | Direct fetch → Firecrawl fallback | `state.pageCache` per URL | full / outline / sections |

---

## 2. Control Flow Branches

### `read_page` routing (`routeReadPage`)

```
read_page(url, sections?, query?)
  → loadPage(url)  [cache check → direct fetch → firecrawl fallback]
  → check outlineMissCount[url]
  → routeReadPage(page, params)
    ├─ noSelectors && tokens ≤ 5000  →  mode: full
    ├─ noSelectors && tokens > 5000  →  mode: outline
    │     + increment outlineMissCount[url]
    │     + if prevMisses >= 1: override to auto-pack (all sections, budget=5000)
    ├─ sections[] provided → findHeadingIndex for each → packToBudget → mode: sections
    │     + if no indices found && tokens ≤ 5000 → mode: full
    │     + if no indices found && tokens > 5000 → mode: outline (miss++)
    └─ query string provided → filter headings by substring → same as sections path
```

### Fetch strategy (`loadPage`)

```
loadPage(url)
  ├─ cache hit → return cached ExtractedPage
  ├─ plainFetchHtml (10s timeout, direct HTTP)
  │     → success && html ≥ 500 bytes → extractMainContent → cache → return
  └─ firecrawlHtml (15s timeout, Firecrawl scrape API)
        → success → extractMainContent → cache → return
```

### Section extraction (`getSection` / `findHeadingIndex`)

`findHeadingIndex` matches via five cascading strategies (anchor id → full path → heading text → path suffix → heading substring), all normalized (lowercase, collapsed whitespace).

`getSection` uses `getHeadingPositions`, which does a single linear scan of the markdown matching headings by level + normalized text. Heading positions and paths are cached per `ExtractedPage` via WeakMap.

---

## 3. Model-Guided vs Forced Behaviors

### Pushed to the model (soft guidance in system prompt)

- Parallel tool calls: "Batch independent calls in a single turn"
- Section selection: "Pick sections by exact heading text on the FIRST follow-up call"
- Early stopping: "When the answer is in hand, stop"
- Format/length: inferred from query phrasing
- Effort level: inferred from "quick"/"thorough" etc. in query
- Turn count: "use as many turns as the question genuinely needs and no more"

### Hard-forced by code

| Mechanism | Value | Location |
|---|---|---|
| Turn ceiling | 10 | `HARD_TURN_CEILING` constant |
| Penultimate-turn steer | "One turn left, stop calling tools" | `research-agent.ts:108–114` |
| Tool terminate signal | Returns `{ terminate: true }` when `isLastTurn()` | both tool execute() functions |
| Page token budget | 5000 tokens | `PageBudgetTokens` constant |
| Search result count | 5 | `firecrawl.search(..., { limit: 5 })` |
| Snippet truncation | 400 chars | `web-search.ts:61` |
| Auto-pack after miss | After 1 outline miss: pack all sections to budget | `read-page.ts:178–199` |

---

## 5. Remaining Inefficiencies and Waste

### 5.2 Outline → sections always costs 2 round-trips

The 2-turn cost for any large page (>5000 tokens) is structural: the model must call `read_page` once to get the outline, then call again with section selectors. Each of those calls is a full LLM turn, and turn N is more expensive than turn N-1 because the entire conversation (including the first outline response) is re-sent.

For a query that needs 3 large pages, this pattern costs 6 tool-turns just for page content, on top of the initial search turns.

There is no mechanism for the model to request sections on the **first** read (it can't know heading names before seeing the outline). The system prompt instructs the model to pick sections "on the FIRST follow-up call" but this advice is moot — it's inherent to the design.

### 5.6 Parallel cache stampede in `loadPage` *(theoretical — not observed in logs)*

`loadPage` checks the cache synchronously, then performs async network operations. If two `read_page` calls for the same URL arrive in the same parallel batch (which the system prompt actively encourages), both can slip through the cache check before either writes:

```
time →
  call A: cache.get(url) → miss  [fetch starts]
  call B: cache.get(url) → miss  [fetch starts]  ← both reading same page
  call A: extractMainContent → cache.set(url, page)
  call B: extractMainContent → cache.set(url, page)  ← duplicate work
```

Fix: deduplicate in-flight requests with a `Map<url, Promise<ExtractedPage>>`.

### 5.8 Auto-pack fires on any selector miss, dumps arbitrary content

The `outlineMissCount` mechanic:
- First call with no/mismatching selector: return outline, increment miss count to 1.
- Second call: `prevMisses >= 1` → auto-pack (fill 5000 tokens with sections in document order).

Problems:
1. **Fires after just one miss**, so a model that provides a slightly malformed selector immediately triggers auto-pack on the retry.
2. **Auto-pack fills by document order**, not by relevance to the query. For the aviation page (200k tokens), the first 5000 tokens of sections may have nothing to do with the research goal.
3. **No `query` parameter is applied** during auto-pack — it ignores `params.query` entirely.
4. The advisory note added to the outline response ("Pick sections by exact heading text…") isn't actionable if the issue is Unicode mismatch rather than model behavior.

### 5.11 Token budget uses `o200k_base` encoder for all models

Both `page-extract.ts` and `providers.ts` hardcode `getEncoding('o200k_base')` (the GPT-4o tokenizer). The active model is `gpt-5.4-mini`. If the actual model uses a different tokenizer, the 5000-token page budget is an approximation. Sections may be over- or under-packed relative to the intended budget.

---

## 6. Log Analysis Summary

### Run table

| Run | Query (abbrev.) | Model | Turns | Total input tok | Tool patterns |
|---|---|---|---|---|---|
| 02-48 | (unknown) | — | — | 0 | no events captured |
| 02-55 | Din Tai Fung | gpt-5.4-mini | 5 | 0 | partial log (old format) |
| 03-07 | White House east wing | gpt-5.4-mini | 4 | 7,662 | search → read(full) → search |
| 03-10 | Foldable phones deep dive | gpt-5.4-mini | 4 | 18,998 | 3×search + 6×read(full) |
| 03-16 | Civil aviation disasters | gpt-5.4-mini | 8 | 4,864* | 2×search + 6×read(outline) |
| 03-29 | Luxury EVs US vs China | gpt-5.4-mini | 4 | 12,004 | 3×search + 4×read(outline/sections) |

*Suspiciously low — aviation run likely reporting non-cached tokens only, not total input.

### Token growth within a run (luxury EV, most complete data)

| Turn | Input | Output | Notes |
|---|---|---|---|
| 1 | 953 | 184 | system + query; 3 parallel searches fired |
| 2 | 2,502 | 223 | search results in context; 4 parallel read_page |
| 3 | 7,343 | 416 | 4 outlines in context; 3 section reads + 1 re-read |
| 4 | 1,206 | 431 | final answer turn |

Turn 4 input (1206) is dramatically lower than turn 3 (7343) despite the full conversation history being re-sent. **This is unexplained.** The smoke test (`smoke.ts`) run against the same model (`gpt-5.4-mini`) shows `cacheRead = 0` and `cacheWrite = 0` — OpenAI prompt caching is not active or not reported by this model/provider. Without caching, turn 4 input should be ≥ turn 3 input. Possible explanations:

- The pi-agent-core `Agent` is pruning the message history between turns (this was not verified; would require reading the pi-agent-core source or adding turn-level message-count logging).
- The `msg.usage.input` field for `gpt-5.4-mini` reports only tokens for the **new portion** of the prompt (incremental billing), not total tokens sent.
- The logging is capturing usage from a message that does not correspond to the full-turn API call.

This is a cost-visibility gap. Until it is understood, per-turn token counts cannot be reliably used for cost analysis.

### Smoke test results (capital of Japan, trivial query)

```
Turn 1: 952 input, 40 output  — 1 web_search
Turn 2: 1339 input, 13 output — final answer
Total: 2344 tokens, $0.00196, 3854ms, 5 URLs
```

The agent searched for "capital of Japan" when a direct answer from training data would suffice. There is no "answer from knowledge" path — the agent always uses at least one tool call before answering. For trivial factual queries, this wastes one search round-trip (~400 tokens + ~1.5s Firecrawl latency).

The smoke test also confirms: `cacheRead = 0` for this model — the luxury EV turn 4 drop is not a caching artifact.

### Aviation disasters run: outline thrash

6 out of 8 tool calls returned `outline` mode on pages with 200,105 and 60,649 tokens. The input token counts per turn (254–637) are inconsistent with the accumulated tool results for pages of that size, suggesting the log was captured during a period when `turn_end` token reporting was not working (confirmed by the 02-55 run also showing 0s). The pattern of repeated outlines without section drilldown suggests the `outlineMissCount` auto-pack mechanism either (a) did not trigger because each call was to a different URL, or (b) produced packed content the model deemed unhelpful and it continued searching.

---

## 8. Design Direction Notes from Author (for Reviewer Consideration)

These are not bugs — they are design directions the project author has identified for exploration. The reviewer should evaluate feasibility and tradeoffs.

### 8.2 Smart `read_page` via parallel mini-agents

**Current problem**: Large pages require 2 LLM turns on the outer agent (outline → sections). Each extra turn re-sends the full conversation, making the outer agent progressively more expensive. The outer agent's context grows with every tool result, including raw page content.

**Proposed direction**: Replace the outline→sections pattern with a `smart_read_page` tool that:
1. Outer agent provides the URL plus a **context string** ("what I need from this page") rather than specific section selectors.
2. The tool internally spawns one or more cheap mini-agent calls (e.g., Haiku-class model) in parallel.
3. Each mini-agent receives a page slice and the context string, and returns either a concise summary or verbatim excerpts of high-relevance content.
4. The mini-agents' results are merged and returned to the outer agent as a single, pre-digested response.

**Benefits**:
- Outer agent context grows by one compact result instead of raw page text.
- No round-trip penalty for large pages — the extraction happens inside the tool call.
- Cheap model handles mechanical extraction; expensive model handles research strategy.
- Parallel page processing: if the outer agent calls `smart_read_page` for 3 URLs in one turn, all 3 mini-agents run concurrently.

**Tradeoffs to evaluate**:
- Mini-agent latency adds to tool execution time (though parallelized with other tool calls in the same turn).
- Mini-agents must be given enough page budget to do useful work but not so much that they become expensive themselves.
- Context string quality from the outer agent affects mini-agent output quality — this is a new prompt-engineering surface.

### 8.3 Model tiering — right-size the model per task

**Proposed direction**: Use different models for different subtasks:
- **Outer research agent**: current expensive model — strategy, query formulation, synthesis.
- **Page extraction mini-agents** (see 8.2): Haiku-class — mechanical text extraction and summarization.
- **Search result scoring** (if added): Haiku-class — rank/filter 5 results before outer agent sees them.

The infrastructure (`getModel` in `providers.ts`) currently returns one hardcoded model. It would need to support multiple named model slots (e.g., `getModel('extraction')`, `getModel('research')`).

### 8.4 Tool schema as the single source of usage guidance

**Current problem**: Tool execution results inject guidance text when things go wrong (e.g., the outline result appends "Note: Each turn costs more than the last. Pick sections by exact heading text…"). This guidance re-appears in tool results every time an outline is returned, adding tokens to the conversation each time.

**Proposed direction**: Move all usage guidance into the **tool `description` field** (or a dedicated `usage` field if the schema supports it). Tool descriptions are sent once per conversation in the system prompt / tools block. They should include:
- When to use this tool vs another
- How to format parameters correctly
- What to do with each response mode (full / outline / sections)
- Cost implications

Error and outline responses should then return **only data** — no instructional prose. Guidance belongs in the schema, not the results.

---

## 10. Structural Observations for Reviewer

1. The **two-turn per-page cost is structural**, not a bug. Any optimization here requires either (a) speculative section pre-fetching, (b) model-provided selectors on the first call using search snippet hints, or (c) a different page-access strategy entirely.

2. The **system prompt is doing significant work** that could alternatively be enforced at the tool layer. For example, the instruction to batch calls is only enforced by model compliance; a turn-level tool-call quota could enforce it structurally.

3. The **logging gaps** (cacheRead not captured, old format with 0 tokens) make it hard to assess true cost. Any optimization effort should first fix cost visibility.
