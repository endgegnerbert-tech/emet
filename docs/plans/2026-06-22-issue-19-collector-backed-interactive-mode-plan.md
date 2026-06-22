# Issue #19: Collector-backed interactive `emet` mode — agent-steered minimal plan

**Date:** 2026-06-22
**Issue:** [#19](https://github.com/endgegnerbert-tech/emet/issues/19) — feat(emet): add collector-backed interactive mode without tool sprawl
**Status:** planning
**Depends on:** #18 — landed in `fa25f95` / `1.4.1`

---

## Last-push check

- `HEAD` and `origin/master` point at `fa25f95` (`1.4.1 — internal no-auth collector registry`).
- #18 is closed.
- Last commit added the internal collector registry, doctor integration, docs/release metadata, and tests.
- No `.github` workflow is present, so local verification is the real gate for this repo.
- Current MCP handler already returns `structuredContent`, so interactive steering can be data-first without new tools.

---

## External research note

MCP already supports the shape we need:

- Tools are model-controlled and can be called repeatedly by an agent loop.
- Tool results can return `structuredContent` JSON, plus text for compatibility.
- Elicitation exists for user input, but #19 does **not** need user elicitation; this is agent steering.

Refs:

- https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-06-18/server/tools.mdx
- https://github.com/modelcontextprotocol/modelcontextprotocol/blob/main/docs/specification/2025-06-18/client/elicitation.mdx
- https://modelcontextprotocol.info/docs/tutorials/writing-effective-tools/

---

## Goal

Make `emet` interactive for the **AI agent using the tool**:

1. `emet` searches collectors and returns compact results + suggested next actions.
2. The agent inspects those results and decides the next call: refine search, add platform, fetch selected URLs, synthesize, or stop.
3. The normal emet pipeline helps with guardrails, fetch, synthesis, citations, and authority checks.

Design principle: **dumb tool, smart agent**. `emet` exposes capabilities and state; it does not pretend to be the agent, auto-loop secretly, or decide that research is finished. It may suggest `nextActions`, but only the calling AI chooses and triggers the next call.

Public tools stay exactly:

1. `emet`
2. `web_fetch`

No `emet_search`, `emet_fetch`, `emet_synthesize`, `emet_plan`, `emet_continue`, or `emet_status`.

---

## Ponytail implementation shape

Minimum useful feature, no framework:

- Add a few `options` fields to both tool schemas.
- Add a small collector-interactive branch in `runWebResearch()`.
- Reuse #18 collectors.
- Reuse existing `fetchPageSource()` and `synthesizeResearch()`.
- Keep session state in one bounded in-memory `Map`.
- Return machine-readable `structuredContent` with `nextActions` and stable result IDs.
- Add tests; no new dependencies.

Skipped until needed: persistent sessions, auth/cookies, browser automation, background watches, MCP elicitation, new MCP tools.

---

## Public API additions

Add these to `lib/tool-schema.js` and `index.js` `emet.options`:

```js
{
  platforms: ["hn"],                 // allowed: hn, v2ex, github, rss, youtube
  interactive: true,                  // return compact state + next action choices
  sessionId: "optional-id",          // continue bounded in-memory session
  action: "search",                  // search | refine | fetch | synthesize
  queryOverride: "optional narrower query",
  selectedResultIds: ["hn:0"],       // preferred over URLs; stable within session
  selectedUrls: ["https://..."],     // fallback for agent-selected targets
  maxResultsPerPlatform: 5
}
```

Rules:

- `platforms` is an explicit allowlist.
- If `platforms` is omitted, infer only clear single-platform intent: HN/Hacker News, V2EX, GitHub.
- Never fan out to every collector by default.
- Missing collectors return `{ available: false, reason }`, not thrown errors.
- `selectedResultIds` beats raw URLs so the agent can point at compact results without copying long URLs.

---

## Agent steering contract

Every interactive response returns enough state for the agent to choose the next call, but **never raw page dumps by default**:

```js
{
  ok: true,
  action: "collector_search",
  sessionId: "uuid",
  query: "root query",
  currentQuery: "query used this turn",
  turn: 1,
  limits: { maxTurns: 3, remainingTurns: 2, maxResultsPerPlatform: 5 },
  collectorResults: [
    {
      platform: "hn",
      resultCount: 5,
      results: [
        {
          id: "hn:0",
          title: "...",
          url: "...",
          author: "...",
          score: 123,
          signals: { comments: 42 },
          fetchRecommended: true
        }
      ]
    }
  ],
  observedGaps: ["needs official source", "too few current results"],
  nextActions: [
    {
      action: "refine",
      reason: "HN results are broad; narrow by version",
      options: { queryOverride: "React 19 useActionState HN", platforms: ["hn"] }
    },
    {
      action: "fetch",
      reason: "Top discussion and linked repo look useful",
      options: { selectedResultIds: ["hn:0", "hn:2"] }
    },
    {
      action: "synthesize",
      reason: "Enough community evidence for sentiment question"
    }
  ],
  contentText: "Compact summary for humans/clients without structuredContent."
}
```

The agent can then call:

```js
emet({
  query: "what does HN say about React 19?",
  options: {
    interactive: true,
    sessionId: "uuid",
    action: "refine",
    queryOverride: "React 19 useActionState HN",
    platforms: ["hn"]
  }
})
```

or:

```js
emet({
  query: "what does HN say about React 19?",
  options: {
    interactive: true,
    sessionId: "uuid",
    action: "fetch",
    selectedResultIds: ["hn:0", "hn:2"]
  }
})
```

or when it has enough:

```js
emet({
  query: "what does HN say about React 19?",
  options: {
    interactive: true,
    sessionId: "uuid",
    action: "synthesize"
  }
})
```

If the agent is satisfied without synthesis, it simply stops calling `emet`. No `stop` action needed.

---

## Context budget contract

Interactive mode must preserve context. Default responses are compact state, not documents.

- `search` / `refine`: return titles, URLs, scores/signals, short snippets if available, `nextActions`; no page text.
- `fetch`: return selected page previews only: title, URL, source type, readable status, and a short excerpt capped around 500–1,000 chars per page.
- `synthesize`: return the normal compact emet answer, bullets, citations, sources, status.
- Full text stays in bounded session memory, not in chat context.
- `pageTexts`/raw content only appears if the caller explicitly asks for `rawPages: true`; interactive mode should not set that automatically.
- `runtimeTrace` should not be included in interactive `contentText`; keep traces in structured/debug paths only.

Rule of thumb: each interactive turn should be small enough for an agent to read and decide, not large enough to become the research corpus.

---

## Runtime flow

### 1. Start/search

Trigger when any of these is present:

- `options.platforms`
- `options.interactive`
- explicit social query (`HN`, `Hacker News`, `V2EX`, `GitHub issues/discussions/repos`)

Steps:

1. Resolve or create session.
2. Resolve platforms: explicit allowlist first, otherwise one clear inferred platform.
3. Run collectors with `maxResultsPerPlatform`.
4. Store compact results with stable IDs.
5. Return compact `collectorResults`, `observedGaps`, and `nextActions`.

### 2. Refine / continue search

For `options.action === "refine"`:

- Use `queryOverride` from the agent.
- If no `queryOverride` is provided, return a suggested refine query in `nextActions` instead of running hidden follow-up work.
- Optionally add platforms only if the agent explicitly passes them.
- Append new compact results to the same session.
- Return updated `nextActions`.

### 3. Fetch selected results

For `options.action === "fetch"`:

- Resolve `selectedResultIds` to URLs from the session.
- Accept `selectedUrls` only if valid `http(s)` URLs.
- Fetch with existing `fetchPageSource()`.
- Store bounded page text in the session.
- Return page previews, unreadable URLs, and a `synthesize` next action.

### 4. Synthesize

For `options.action === "synthesize"`:

- Use fetched session pages.
- If no pages are fetched yet, fetch top `fetchRecommended` results first, bounded by `maxSites`.
- Call existing `synthesizeResearch()`.
- Return normal emet-style citations/sources plus session metadata.
- If authority is required and only community sources exist, return `sufficient: false` with an official-source follow-up action.

---

## Pipeline adaptation

Keep the current web pipeline as the default. Add the collector branch before normal web search:

```js
if (shouldRunCollectorInteractive(query, config)) {
  return runCollectorInteractive(query, ctx, signal, onUpdate, config);
}
```

Inside `runCollectorInteractive()` reuse existing pieces:

- `buildResearchGuardrails(query, config)` for high-risk detection.
- `fetchPageSource(url, signal, { ...config, query })` for selected URLs.
- `synthesizeResearch(query, pages, ctx, signal)` for final answer.
- `formatResearchResponse()` / current result fields for compatibility.

Do **not** force the whole normal search/fetch loop after collector search. The point is to let the agent decide. Only auto-fetch during `synthesize` if the agent asks for synthesis before fetching.

---

## Session limits

Use one in-memory map in `lib/web-research.js`:

```js
const collectorSessions = new Map();
```

Bounds:

- TTL: 30 minutes
- max sessions: 100
- max turns per session: `options.maxTurns ?? 3`
- max selected URLs per fetch: `min(options.maxSites ?? 5, 10)`
- max stored result rows: 50
- max stored page text per session: reuse `pageTextLimit`, cap at 100k chars

Session ID: `randomUUID()` only. Do not include query text, local paths, tokens, cookies, or raw content in the ID.

---

## Authority guardrail

Community sources are fine for community-sentiment questions.

They are **not sufficient alone** for:

- security/package/vendor-status questions
- legal/medical/finance-sensitive questions
- explicit `requireAuthoritative: true`

Implementation: reuse `buildResearchGuardrails()` / `shouldRequireAuthoritativeSources()` and set:

```js
sufficient: false,
followupRecommended: true,
missingAspects: ["authoritative sources"],
nextActions: [
  {
    action: "refine",
    reason: "Need authoritative source, not only community evidence",
    options: { platforms: [], queryOverride: "<query> official docs advisory" }
  }
]
```

If `platforms: []` is awkward in implementation, omit `platforms` and let normal web research handle the official follow-up.

---

## File changes

### Modify

- `lib/tool-schema.js` — schema options.
- `index.js` — Pi extension schema options.
- `lib/web-research.js` — collector branch + bounded session helpers.
- `test/mcp-server.test.js` — assert exactly `emet` and `web_fetch` are exposed.
- `test/web-research.test.js` — Pi schema includes new options.

### Add only if it keeps `web-research.js` tests cleaner

- `test/collector-flow.test.js` — collector interactive flow tests.

No production file beyond `web-research.js` unless the diff becomes ugly.

---

## Test plan

Add/adjust `node:test` coverage for:

- schema exposes `platforms`, `interactive`, `sessionId`, `action`, `queryOverride`, `selectedResultIds`, `selectedUrls`, `maxResultsPerPlatform`
- `tools/list` exposes exactly `emet` and `web_fetch`
- `emet({ options: { platforms: ["hn"] } })` returns compact HN-backed evidence with stable result IDs
- `emet({ options: { interactive: true } })` returns `observedGaps` and `nextActions`
- agent loop: search → refine with `queryOverride` → fetch selected result IDs → synthesize
- agent can say “enough” by calling `synthesize` without another search
- explicit HN/V2EX/GitHub wording infers the right collector
- missing collector/unavailable runtime returns structured unavailable result
- security/package/vendor-status query with only social sources is `sufficient: false` and suggests authoritative follow-up
- session bounds: max turns, max stored results, invalid/expired session handling

Final gate:

```bash
npm run check
```

---

## Acceptance checklist

- [ ] Public MCP tools remain exactly `emet`, `web_fetch`.
- [ ] Interactive response gives the agent machine-readable state and next choices.
- [ ] The agent can refine search based on previous compact results.
- [ ] The agent can fetch selected result IDs/URLs.
- [ ] The agent can call `synthesize` when it decides evidence is enough.
- [ ] `platforms` runs only explicit or clear single-platform collectors.
- [ ] Synthesis uses existing citation pipeline.
- [ ] High-risk authority veto still works.
- [ ] Optional collectors degrade without hard failure.
- [ ] No new dependencies.
- [ ] `npm run check` passes.

---

## Ponytail cuts

- No separate MCP tools — schema options are enough.
- No `stop` action — the agent stops by not calling the tool again.
- No persistent session database — in-memory is enough for agent steering.
- No collector cache — existing research/page cache covers fetched pages.
- No broad auto-routing — explicit platform or clear single-platform wording only.
- No MCP elicitation — this is agent-controlled, not user-questionnaire flow.
- No auth/cookie support — #22 owns that.
