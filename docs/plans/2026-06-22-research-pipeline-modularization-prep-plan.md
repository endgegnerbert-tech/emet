# Research pipeline modularization prep plan (revised)

**Date:** 2026-06-22
**Status:** in-progress — Slice 0 (baseline captured)
**Scope:** prepare all `emet` subsystems for the unified checkpointable pipeline without changing behavior first
**Feeds into:** `docs/plans/2026-06-22-unified-interactive-research-plan.md`

---

## Why this plan exists

Before implementing the unified interactive/community pipeline, reduce the risk of making `lib/web-research.js` even more monolithic and lock down boundaries across the rest of `emet`.

Verified current repo shape (2026-06-22 20:48 CEST):

```txt
128 files across lib/mcp/bin/extensions/test/docs/plans
58 JS files in lib
67 tests, 0 failures
```

Verified current size:

```
1831 lib/web-research.js
 900 lib/research.js
 303 lib/research-next-action-policy.js
 273 lib/research-evidence.js
 161 lib/research-guardrails.js
 324 lib/research-policy.js
```

Boundary purity verified: policy/evidence/guardrail modules import NO collector, MCP transport, cookie, or platform-specific modules. ✅

Goal: create stable seams first, then implement the bigger interactive/community plan with less risk.

---

## Non-goals

- no behavior change in this prep phase
- no new public tools
- no new dependencies
- no rewrite of the whole pipeline
- no class hierarchy / DI container
- no ML retraining
- no new platform adapters (belongs to unified plan)

---

## Principle

Extract only boring, testable seams. If a helper is used once and is under ~30 lines, leave it alone.

---

## Research-backed architecture lessons

- **ESLint**: `bin/eslint.js` = tiny bootstrapper, `lib/cli.js` = CLI I/O, `lib/api.js` = public API, `lib/linter/` = pure (no fs/console)
- **VS Code**: extension host separate, MCP tools are thin adapters (protocol bridge, not business logic)
- **Node.js best practices (goldbergyoni)**: structure by business components, dependency direction inward, outer layers depend on inner layers

Translate to `emet`:

```
transport/schema/CLI/Pi/MCP = adapters (outer)
runWebResearch()              = orchestrator
flow/session/contract         = pure service modules (inner)
collectors/retrieval          = I/O adapters (outer)
research-policy/evidence      = core decision/evidence logic (innermost)
```

Hard rule: core policy/evidence modules must not know about platform CLIs, cookies, MCP transport, or Pi tool formatting.

---

## Whole-repo subsystem boundaries

```
Host/adapters
  bin/*, index.js, extensions/*, mcp/*

Research orchestration
  lib/web-research.js, lib/research.js, lib/planner.js

Retrieval and extraction
  lib/collectors/*, lib/page-fetch-adapter.js, lib/article-extractor.js, lib/pdf-extractor.js

Policy, evidence, guardrails
  lib/research-guardrails.js, lib/research-policy.js, lib/research-next-action-policy.js
  lib/research-evidence.js, lib/research-output.js

Routing and ML runtime
  lib/tiny-router.js, lib/query-understanding.js, lib/research-intent.js
  lib/router-structured-features.js, ml/*, data/router/*, metrics/router/*

Domain packs
  lib/domains/*

Memory and observability
  lib/research-memory.js, lib/local-logger.js, lib/research-trace.js

Validation
  test/*, eval/*, docs/pipeline.md
```

Boundary rule: each subsystem may depend downward on normalized data, not sideways on another subsystem's internals.

---

## Target prep architecture

```
lib/web-research.js
  -> orchestrates runWebResearch()
  -> delegates to flow/session/contract/retrieval modules

lib/research-contract.js     [Slice 1 — EXTRACT FIRST]
  -> canonical action enum, result builders
  -> stable interface everything else depends on

lib/research-session.js      [Slice 2]
  -> wraps existing collectorSessions/getOrCreateSession pattern

lib/research-flow.js          [Slice 3]
  -> pure flow policy (runMode, retrievalBias, authorityRequired)

lib/retrieval/community.js   [Slice 4a]
lib/retrieval/normalize.js   [Slice 4b]
  -> collector-backed retrieval, platform result → source candidate
```

### Dependency direction

```
Allowed:
  web-research.js -> research-flow/session/contract/retrieval
  retrieval/*     -> collectors/*, page-fetch-adapter.js
  contract        -> no network modules (stdlib only)
  flow            -> guardrail/query-understanding snapshots only
  session         -> contract types only
  policy/evidence -> normalized source objects only

Forbidden:
  research-flow.js      -> fetch/search/page/collector calls
  research-evidence.js  -> collector/platform-specific imports
  research-policy*.js   -> platform auth/setup imports
  collectors/*          -> synthesis or sufficiency imports
  MCP/Pi handlers       -> collector internals
```

---

## Slice 0: Capture baseline (DONE)

**Command:** `npm test 2>&1 | tail -5`

**Result:** 67 tests, 0 failures, 0 skipped. All collectors healthy per `emet doctor`.

**Gate:** Baseline captured. Any regression after extraction = investigation required.

---

## Slice 1: Extract result contract builders

Create `lib/research-contract.js`.

**Why first:** Contract defines stable enums and builders that Session (Slice 2) and Flow (Slice 3) both import. Extracting this first prevents circular or speculative dependencies.

**Responsibilities:**
- Canonical action enum: `search | refine | fetch | synthesize | final`
- Checkpoint result builder (for interactive mode)
- Final result shape normalization helper
- Legacy action bridge (maps `collector_search` → `search`, etc.)

**Canonical actions:**
```
search | refine | fetch | synthesize | final
```

**Backward-compat mapping (ponytail: remove after unified plan ships):**
```
collector_search  → search
collector_fetch   → fetch
collector_synthesize → synthesize
web_research      → final
```

**Output shape contract (aligned with unified plan):**
```js
{
  ok: true | false,
  action: "search" | "refine" | "fetch" | "synthesize" | "final",
  query, currentQuery?, sessionId?, turn?,
  // Platform-agnostic fields
  sources: [],        // normalized sources
  evidenceState?,     // when sufficient
  nextActions?,       // for checkpoint mode
  missingAspects?,
  contentText?,       // formatted output
  // Legacy compat — removed after migration
  _legacy: { action?, collectorResults? }
}
```

**Tests (`test/research-contract.test.js`):**
- action always matches enum
- legacy action maps correctly to canonical (collector_search→search, etc.)
- required fields present in all result shapes
- checkpoint result has nextActions, final result does not
- result builder produces valid shape with minimal inputs

**Acceptance gate:**
```bash
node --test test/research-contract.test.js
```

---

## Slice 2: Extract session state

Create `lib/research-session.js`.

**Wraps existing code:** `collectorSessions`, `getOrCreateSession()`, `COLLECTOR_SESSION_TTL`, `COLLECTOR_MAX_SESSIONS`, `COLLECTOR_MAX_TURNS_DEFAULT` currently live in `web-research.js` (lines ~1660-1720). Extract them as-is, export the same symbols.

**Responsibilities:**
- In-memory `Map` for collector/interactive sessions
- TTL-based expiry (cleanup on access)
- Max session cap with eviction
- Turn counting and enforcement
- Session continuation by `sessionId`

**Current limits (keep unchanged):**
```js
COLLECTOR_SESSION_TTL = 30 * 60 * 1000    // 30 min
COLLECTOR_MAX_SESSIONS = 100
COLLECTOR_MAX_TURNS_DEFAULT = 3
```

**Tests (`test/research-session.test.js`):**
- creates session with unique ID
- continues existing session by sessionId
- expires sessions older than TTL
- enforces max turn limit
- evicts oldest session when at cap

**Acceptance gate:**
```bash
node --test test/research-session.test.js
node --test test/collector-flow.test.js   # must still pass
```

---

## Slice 3: Extract flow policy as pure code

Create `lib/research-flow.js`.

**Why after contract+session:** Flow decides runMode/retrievalBias — these depend on contract enums existing. Flow must NOT depend on session (session is an orchestration concern, flow is pure policy).

**Responsibilities (pure function, no I/O):**
- `resolveFlowPolicy(query, options, guardrails, queryUnderstanding)` → flow policy object
- Detect `runMode: "auto" | "checkpoint"`
- Detect `retrievalBias: "web" | "community" | "mixed"`
- Detect `authorityRequired: boolean`
- Detect `communityOnlyAllowed: boolean`

**Inputs only:**
```js
{ query, options: {}, guardrails: {}, queryUnderstanding: {} }
```

**Implementation note — ponytail bridge for prep phase:**
Current behavior: `interactive:true` → collector mode. Unified plan wants: `interactive:true` → checkpoint mode. During prep, flow returns retrievalBias=community when interactive+platforms are set, matching current behavior. Add a `ponytail:` comment marking the pending semantic change.

```js
// ponytail: interactive→checkpoint (not collector) once unified plan lands.
// During prep, interactive+platforms still → community bias to match existing behavior.
```

**Tests (`test/research-flow.test.js`):**
- `interactive:true` with platforms → retrievalBias=community (current behavior preserved)
- `interactive:true` without platforms → runMode=checkpoint, retrievalBias=web
- sentiment query → communityOnlyAllowed=true
- factual query → authorityRequired=true
- explicit `platforms: ["hn"]` → retrievalBias=community
- code/academic mode → retrievalBias=web, authorityRequired=true

**Acceptance gate:**
```bash
node --test test/research-flow.test.js
```

---

## Slice 4a: Extract community retrieval normalization

Create `lib/retrieval/normalize.js`.

**Responsibilities:**
- `normalizeCollectorResult(platform, collectorItem)` → normalized source candidate
- Platform-specific signal extraction
- Score normalization (0-10 scale)
- ID generation that is stable across refine turns

**Normalized candidate shape:**
```js
{
  id: string,           // stable: "hn:38274195" (platform + platform-native ID)
  title: string,
  url: string,
  snippet: string,
  sourceType: string,   // "forum" | "github_issue" | "video" | "blog" | ...
  authoritative: false, // community sources are never authoritative
  score: number,        // 0-10, normalized from platform signals
  signals: {
    platform: string,   // "hn" | "v2ex" | "github" | "rss" | "youtube"
    kind: string,       // "story" | "comment" | "issue" | "video"
    author: string,
    comments: number,
    points: number,
  }
}
```

**Tests (`test/retrieval-normalize.test.js`):**
- HN result normalizes with correct score and sourceType
- V2EX result normalizes correctly
- GitHub result (issue/discussion/repo) normalizes correctly
- RSS result normalizes with blog sourceType
- YouTube result normalizes with video sourceType
- Unavailable collector → structured gap (not crash)
- IDs are stable (same platform+id → same output)

---

## Slice 4b: Extract community retrieval orchestration

Create `lib/retrieval/community.js`.

**Responsibilities:**
- `runCommunitySearch(query, platforms, options)` → normalized results + gaps
- Call existing collectors via registry
- Return structured gaps for unavailable collectors
- Keep raw `collectorResults` only as debug field

**Tests (`test/retrieval-community.test.js`):**
- searches HN and returns normalized results
- returns structured gap for unknown platform
- returns structured gap for unavailable collector
- respects maxResultsPerPlatform option

**Acceptance gate (4a+4b):**
```bash
node --test test/retrieval-normalize.test.js test/retrieval-community.test.js
```

---

## Slice 5: Wire back into web-research.js

**Only after slices 1-4 pass all tests.**

Replace inline implementations with module imports:
- `runCollectorInteractive()` → uses `lib/research-session.js` for sessions, `lib/retrieval/community.js` for search
- `shouldRunCollectorInteractive()` → uses `lib/research-flow.js` for flow decision
- Result shapes → use `lib/research-contract.js` builders
- Remove inline `collectorSessions`, `getOrCreateSession`, `COLLECTOR_SESSION_TTL`, etc. from web-research.js

Existing exported symbols (`collectorSessions`, `shouldRunCollectorInteractive`, `runCollectorInteractive`) remain available as re-exports.

**Acceptance gate:**
```bash
node --test test/collector-flow.test.js test/collectors.test.js test/web-research.test.js
npm run check
```

---

## Slice 6: Host and schema boundary cleanup

MCP/Pi/CLI adapters are already thin — verify and lock.

Files: `lib/tool-schema.js`, `index.js`, `mcp/handlers/tools.js`, `mcp/hosts/profiles.js`, `mcp/initialize-result.js`, `bin/*`

Current state verified:
- `mcp/handlers/tools.js` imports only `runWebResearch`, `webFetch` from `web-research.js` ✅
- `bin/emet.js` imports only `webFetch` ✅
- `lib/cli.js` imports only `webFetch` ✅
- No handler imports collector internals ✅

**Rules:**
- Schema descriptions live in `tool-schema.js` as single source
- MCP/Pi handlers format inputs/outputs, never know collector internals
- Host instructions describe capabilities, not implementation branches
- No host-specific behavior inside core policy/evidence modules

**Acceptance gate:**
```bash
node --test test/mcp-server.test.js test/mcp-transport.test.js test/cli.test.js
```

---

## Slice 7: Domain/routing boundary cleanup

Keep domain packs and ML/routing as policy inputs, not retrieval implementations.

Files: `lib/domains/*`, `lib/research-intent.js`, `lib/query-understanding.js`, `lib/tiny-router.js`, `lib/router-policy-context.js`

Verified: domain packs export no network-calling code ✅

**Rules:**
- Domain packs set allowed source types, hints, authority/recency requirements — never call network tools
- Tiny-router may abstain or advise, guardrails can veto unsafe downgrades
- New community/social labels require eval rows before promotion

**Acceptance gate:**
```bash
node --test test/domain-packs.test.js test/domain-template.test.js test/query-understanding.test.js test/tiny-router.test.js
npm run audit:promotion
```

---

## Slice 8: Memory/cache/observability boundary cleanup

Keep cache/logging/traces useful without coupling them to platform internals.

Files: `lib/research-memory.js`, `lib/local-logger.js`, `lib/research-trace.js`

**Rules:**
- Cache keys depend on normalized query/config, not raw session object shape
- Logs record flow decisions and retrieval backends as data
- Traces store normalized source summaries, not auth secrets/cookies
- No raw private tokens in logs, traces, or cached page text

**Acceptance gate:**
```bash
node --test test/research-logging.test.js test/evidence-schema.test.js test/research-improvements.test.js
```

---

## Slice 9: Tests/evals/docs alignment

Make the repo easy to change safely.

**Rules:**
- Every new module gets one focused test file (contract, session, flow, normalization, community)
- Behavior changes get end-to-end tests only after unit seams pass
- Release docs stay historical; plans define future work
- Eval cases cover high-risk, community-only, mixed community+authority, and collector failures

**Acceptance gate:**
```bash
npm run check
```

---

## Handoff to unified plan

After this prep plan lands:

```
prep plan
  -> pure contract/session/flow/community seams
  -> no behavior change
  -> unified plan can change routing semantics safely
```

Do not start adding new platforms during prep. Platform expansion belongs to the unified plan after the community retrieval seam exists.

---

## Final acceptance criteria

- [ ] `npm run check` passes
- [ ] No public schema/tool change
- [ ] `lib/web-research.js` delegates flow/session/contract/community to extracted modules
- [ ] MCP/Pi/CLI adapters remain thin (no collector internals)
- [ ] Domain packs and tiny-router remain policy/routing inputs
- [ ] Policy/evidence/guardrails remain I/O-free
- [ ] Memory/logging/traces serialize normalized data, no auth secrets
- [ ] Existing collector behavior works unchanged
- [ ] New modules have focused tests
- [ ] Unified interactive plan can be implemented without adding branches to `web-research.js`

---

## Ponytail cuts (preserved)

- No framework, no DI, no generic plugin runtime
- No new adapter registry beyond existing collector registry
- No speculative platform adapters
- Smallest useful prep: extract pure seams, then build the pipeline

## Revision notes (vs original plan)

1. **Reordered slices**: Contract (1) → Session (2) → Flow (3). Contract defines shared enums used by both.
2. **Session wraps existing code**: Extracts `collectorSessions`/`getOrCreateSession` from web-research.js instead of creating parallel system.
3. **Flow policy bridge**: `interactive:true` stays collector bias during prep, with ponytail comment for future change.
4. **Added Slice 0 baseline gate**: Captured 67/67 tests passing before any changes.
5. **Added per-slice acceptance gates**: Each slice has concrete `node --test` commands.
6. **Split community retrieval into normalize + orchestrate**: Normalize is pure (4a), orchestrate calls collectors (4b).
7. **Slice 6 verified already-thin**: Host/schema adapters follow best practices today.
