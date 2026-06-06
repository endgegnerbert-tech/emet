# MCP Synthesis: Boilerplate Fallback When No LLM Context Available

**Severity:** HIGH — All MCP-hosted queries (Claude Code, Codex, Cursor, Gemini CLI) get template answers

## Problem

`synthesizeResearch()` in `lib/web-research.js` depends on pi-ai's `complete()` function:

```js
import { complete } from "@mariozechner/pi-ai";
```

When called from an MCP context (no Pi harness), the function tries:

1. `ctx.completeResearch()` — only exists in Pi, returns `null` in MCP
2. `resolveResearchModel(ctx)` — checks `WEB_RESEARCH_MODEL` env var or `ctx.model`
3. `complete()` — needs `ctx.modelRegistry.getApiKeyAndHeaders(model)`

If step 2 or 3 fail, synthesis returns `null` → `synthesizeResearch()` falls to `fallbackSynthesis()`:

```js
function fallbackSynthesis(query, pages) {
  const answer = pages.length
    ? `I found ${pages.length} relevant sources for "${query}" [1]. The strongest sources are summarized below.`
    : `I could not find enough reliable sources for "${query}".`;
  return { answer, bullets, sources, citations };
}
```

**Result: Every MCP-homed query gets a boilerplate template, not actual paper content.**

## Evidence from Cache

Every single cached query — 201 entries — uses the same template:

```
"I found X relevant sources for 'query' [1]. The strongest sources are summarized below."
```

This is the fallback, not LLM synthesis. **Zero queries had LLM-generated answers.**

## Impact

- **No paper summary**: Agent gets "I found 3 sources" not actual paper text
- **No conflict explanation**: Just "No clear source conflicts detected"
- **No code extraction**: `codeBlocks` are often empty
- **Agent falls back to curl/browser**: To get real content, the agent fetches URLs directly

## Fix

### Phase 1: Rule-based improvement (quick win)

Make the fallback synthesis actually useful:

```js
function fallbackSynthesis(query, pages) {
  // Instead of boilerplate, extract meaningful content from pages
  const topPages = pages.slice(0, 3);
  const bullets = topPages.map((p) => {
    const excerpt = p.text.replace(/\s+/g, " ").slice(0, 300).trim();
    return `${excerpt} [${p.title}]`;
  });
  return {
    answer: `Based on ${pages.length} sources for "${query}":`,
    bullets,
    sources: prioritizeSourceEntries(topPages, query),
    citations: topPages.map((p) => ({ text: p.title, sourceIndex: 1 })),
  };
}
```

### Phase 2: MCP Sampling-based synthesis

The MCP server already has a `SamplingService`:

```js
if (deps.samplingService) {
  ctx = deps.samplingService.createVirtualContext();
}
```

Use MCP Sampling (`contexts/`) to let the **host LLM** do the synthesis. The MCP protocol supports `sendSamplingRequest()` which asks the host to generate a completion.

### Phase 3: Built-in mini-LLM synthesis

Bundle a small local model (e.g., via onnxruntime-node) that can:
1. Extract the most relevant paragraphs from sources
2. Generate a 3-bullet summary
3. Never hallucinate (only extract, never invent)
