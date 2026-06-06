# Mode Routing: Agent Overrides `defaultMode` — Paper Queries Land in `fast`

**Severity:** HIGH — Papers, version lookups, and comparisons all default to `fast` when the calling agent sets `mode` explicitly

## Problem

emet has two separate mode-routing paths:

**Pi Extension** (`index.js`):
```js
if (!event.input.mode) event.input.mode = defaultMode(event.input.query || "");
```
✅ Uses `defaultMode()` which detects paper/version/comparison intents.

**MCP Server** (`mcp/handlers/tools.js`):
```js
if (!input.mode) input.mode = defaultMode(input.query || "");
```
✅ Same logic — **if** the agent doesn't pass `mode`.

**MCP Tool Schema** (`lib/tool-schema.js`):
```js
mode: {
  type: "string",
  enum: ["fast", "deep", "code", "academic"],
  description: "Mode",
  // ⬆ No "default" in JSON Schema
},
```

## Root Cause

The JSON Schema has no `default` field. MCP hosts (Claude Code, Codex, Gemini CLI) see `mode` as optional with no default. The **calling agent** then either:

1. **Omits mode entirely** → `defaultMode()` runs correctly → academic gets picked.
2. **Hardcodes `mode: "fast"`** from examples or host defaults → `defaultMode()` is **skipped**.

Evidence from cache: `"Attention Is All You Need paper"` was routed as `fast` mode, not `academic`. The agent explicitly set `mode: "fast"`.

## Impact

| Expected | Actual | Consequence |
|----------|--------|-------------|
| Academic search (ArXiv, S2, DOI) | Generic web search | Missing paper databases |
| Deep follow-up rounds | Single-shot fetch | Insufficient sources |
| Paper-scoring (type bonus) | Generic scoring | Lower-quality results |

## Fix

### Primary: Move `defaultMode()` INTO `runWebResearch()`

In `lib/web-research.js`, the entry point `runWebResearch()` should **override** the mode based on query intent, not trust the caller:

```js
export async function runWebResearch(query, ctx, signal, onUpdate, mode = "fast") {
  const modeOptions = typeof mode === "object" ? mode : { mode };
  
  // Always re-evaluate mode from query, don't trust caller blindly
  const detectedMode = defaultMode(query);
  const effectiveMode = modeOptions.mode !== detectedMode && detectedMode !== "fast"
    ? detectedMode // override if caller picked "fast" but query is academic
    : modeOptions.mode;
  
  // ... rest uses effectiveMode
}
```

This ensures the query's intent is never overridden by an agent that always says `mode: "fast"`.

### Secondary: Add `default` to JSON Schema

```js
mode: {
  type: "string",
  enum: ["fast", "deep", "code", "academic"],
  default: "fast", // ← add this
  description: "Mode. Use 'academic' for papers, 'deep' for comparisons, 'code' for docs.",
  // ⬆ Better description helps agents choose correctly
},
```

### Tertiary: Update README examples

Current examples show `mode: "fast"` for everything. Add explicit examples:

```
# For papers:
emet({ query: "Attention Is All You Need paper", mode: "academic" })
# For version lookups:
emet({ query: "React 19 release notes", mode: "code" })
```
