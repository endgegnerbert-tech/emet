# Raw Content Access + Stability: Improvement Plan

**Date:** 2026-06-06
**Status:** Draft
**Author:** emet code review + cache analysis

---

## Executive Summary

emet's current architecture works well for **quick factual lookups** but fails when the agent needs **raw page content** (papers, docs, source code). The synthesis layer discards raw text, the synthesis quality is boilerplate without a Pi context, and mode routing is overridden by calling agents. This plan addresses both the immediate bugs and the structural gap.

---

## Phase 0: Critical Bugfixes (NOW)

### 0.1 — Fix `evaluateSufficiency` claims gap

**File:** `lib/research.js` — `evaluateSufficiency()` / `detectCoverageGaps()`

**Problem:** `missingAspects` always includes "authoritative sources" because `detectCoverageGaps` checks an empty claims array.

**Fix:** Make `detectCoverageGaps` fall back to source-authoritative check when claims are empty.

**Effort:** 1 line change
**Risk:** Low
**Test:** 73 fewer contradictions in cache

### 0.2 — Override agent mode with `defaultMode` in `runWebResearch`

**File:** `lib/web-research.js` — `runWebResearch()` entry point

**Problem:** Calling agents hardcode `mode: "fast"` and skip `defaultMode()`.

**Fix:** Re-evaluate mode from query intent inside `runWebResearch()`. If caller says "fast" but query is academic, upgrade silently.

**Effort:** 5 lines
**Risk:** Low — academic/deep upgrade is always beneficial
**Test:** "Attention Is All You Need paper" now routes to academic mode

### 0.3 — Isolate test cache from production cache

**File:** test files + `lib/research-memory.js`

**Problem:** Tests write mock data to `research-cache.json` — fake papers leak into real queries.

**Fix:** Use `os.tmpdir()` temp cache file during tests.

**Effort:** 10 lines
**Risk:** Low
**Test:** "retrieval augmented generation papers" no longer returns fake `arxiv.org/abs/2401.12345`

---

## Phase 1: Raw Content — `mode: "fetch"` (THIS WEEK)

### 1.1 — Add `fetch` mode to tool schema + routing

**Files:** `lib/tool-schema.js`, `lib/research.js` (`defaultMode`), `lib/web-research.js`

New mode that:
- Skips LLM synthesis entirely
- Returns full page text (no truncation to 5000 chars)
- Keeps caching (raw pages are still cacheable)
- Returns `{ title, url, fullText, contentType, codeBlocks, sourceType }`

**Signature:**
```json
{
  "query": "Attention Is All You Need paper",
  "mode": "fetch"
}
```

**Response:**
```json
{
  "ok": true,
  "url": "https://arxiv.org/abs/1706.03762",
  "title": "[1706.03762] Attention Is All You Need",
  "fullText": "Abstract\nThe dominant sequence...",
  "contentType": "text/html",
  "codeBlocks": [],
  "sourceType": "paper"
}
```

### 1.2 — PDF-aware fetching

When `mode: "fetch"` is used and the URL is a known paper source (arxiv.org, semanticscholar.org, doi.org), use Jina Reader to fetch the PDF version and convert to markdown.

For arxiv, automatically route `/abs/1706.03762` → `/pdf/1706.03762.pdf` → Jina Reader.

### 1.3 — Add `options.rawPages` flag to existing modes

For users who want both synthesis AND raw content:

```json
{
  "query": "Attention Is All You Need paper",
  "mode": "academic",
  "options": { "rawPages": true }
}
```

Response includes additional `rawPages` array with top 1-3 full page texts.

---

## Phase 2: Synthesis Improvement (THIS MONTH)

### 2.1 — Better fallback synthesis (no LLM required)

Current fallback:
```
"I found 3 relevant sources for 'query'. The strongest sources are summarized below."
```

Improved fallback: Extract top sentences from each page instead of generic boilerplate.

### 2.2 — MCP Sampling synthesis

Use the existing `SamplingService` to ask the host LLM for real synthesis.

The MCP protocol supports `contexts/canCreate` + sampling. The host (Claude Code, Codex) generates a proper answer from the raw sources, then emet packages it.

### 2.3 — Page text from synthesized results

After synthesis, add the raw page text (or a link to it) in the response metadata so the agent can paginate through if it wants more detail.

---

## Phase 3: Stability & Defaults (THIS MONTH)

### 3.1 — Enable Tiny Router by default

Auto-detect `ml/models/domain/model.joblib` and enable `EMET_TINY_ROUTER=1` without env vars.

Check in `resolveTinyRouterConfig()`:
```js
if (!envFlag(env, "EMET_TINY_ROUTER") && modelDirHasModels) {
  // Auto-enable — no env var needed
}
```

### 3.2 — Scrapling: replace with Playwright in Node.js

The Python daemon adds 3 failure modes (venv missing, import error, runtime crash). Replace with `playwright-core` which is a pure Node.js dependency.

```bash
npm install playwright-core
```

### 3.3 — Add `default` to tool schema JSON Schema

Helps MCP hosts show the correct default in their UI.

---

## Priority Matrix

| Task | Effort | Impact | Priority |
|------|--------|--------|----------|
| Fix `evaluateSufficiency` claims gap | ~1h | HIGH (73 contradictions) | P0 |
| Override agent mode in `runWebResearch` | ~1h | HIGH (paper queries broken) | P0 |
| Add `mode: "fetch"` | ~4h | HIGH (kills curl/browser) | P0 |
| Isolate test cache | ~2h | MEDIUM (fake data) | P1 |
| PDF-aware fetching (Jina) | ~2h | HIGH (papers are PDFs) | P1 |
| Better fallback synthesis | ~3h | MEDIUM (boilerplate) | P2 |
| MCP Sampling synthesis | ~8h | MEDIUM (real synthesis) | P2 |
| Enable Tiny Router by default | ~2h | MEDIUM (ML routing) | P2 |
| Replace Scrapling with Playwright | ~12h | MEDIUM (stability) | P3 |

---

## Success Metrics

| Metric | Before | After (target) |
|--------|--------|----------------|
| Contradictions (sufficient+missing) | 73 (36%) | 0 |
| Paper queries in academic mode | ~30% | 100% |
| Synthesis with real content | 0% | >80% |
| Agent falls back to curl/browser | Often | Rare |
| Cache with fake data | 2 entries | 0 |
| Tiny Router enabled by default | 0% | 100% |
