# Unified checkpointable research pipeline plan

**Date:** 2026-06-22
**Status:** planning, revised
**Scope:** make `emet` interactive by reusing the normal research pipeline; keep one public tool surface
**Prep dependency:** run `docs/plans/2026-06-22-research-pipeline-modularization-prep-plan.md` first to avoid growing `lib/web-research.js` further.
**Supersedes for future work:** `docs/plans/2026-06-22-issue-19-collector-backed-interactive-mode-plan.md`

---

## Verified current state

Repo evidence checked before this revision:

- `1.4.2` has an internal collector registry and collector-backed interactive mode.
- `emet doctor` reports collectors available: `hn`, `v2ex`, `github`, `rss`, `youtube`.
- Public tools remain exactly `emet` and `web_fetch`.
- Interactive schema fields already exist in MCP and Pi definitions.
- Current interactive handling is an early collector branch in `lib/web-research.js`:

```txt
runWebResearch()
  -> shouldRunCollectorInteractive()
  -> runCollectorInteractive()
  -> return
  -> otherwise normal web pipeline
```

- `shouldRunCollectorInteractive()` currently treats `interactive: true` as collector mode, even without explicit platforms.
- Domain routing already has `community` family plus `forums` and `github` overlays.
- Query understanding already supports `source_family: community`.
- Promotion gate currently says `promoteSafe: false`; ML/router expansion must stay rule-first or shadow-mode until gates pass.

Verified locally during review:

```bash
node bin/emet.js doctor
node --test test/collector-flow.test.js test/collectors.test.js
node --test test/research-policy-domain.test.js test/query-understanding.test.js test/research-next-action-policy.test.js test/tiny-router.test.js test/collector-flow.test.js
npm run check
npm run check:promotion # expected non-promoted status today
```

---

## Problem

Interactive support exists, but it is the wrong shape:

- `interactive: true` currently means collector path, not checkpointable research.
- Collector/community results bypass much of the normal search/fetch/evidence/sufficiency machinery.
- Result contracts are inconsistent: schema says `search | refine | fetch | synthesize`, runtime returns `collector_search`, `collector_fetch`, `collector_synthesize`, `web_research`.
- Collector result IDs are index-based (`hn:0`) and can collide across refine turns.
- Community evidence can be useful, but must not become final truth for factual/high-risk claims.

Result: useful feature, but too special-cased and not safe enough as the default interactive architecture.

---

## Goal

Keep one public research tool, `emet`, and make interactive mode a **checkpointable version of the same normal pipeline**.

Target behaviors:

1. **Auto pipeline** — default `emet` keeps running internally when the next step is obvious.
2. **Checkpointed pipeline** — with `interactive: true`, the same pipeline can pause at real decision points.
3. **Community retrieval backend** — collectors become retrieval backends whose results are normalized into the same evidence model.
4. **Authority gate** — community can answer sentiment questions; factual/high-risk claims require authoritative follow-up.

---

## Non-goals

- no new public MCP/Pi tools
- no separate social/community pipeline
- no CLI interactive redesign
- no auth/cookie/browser automation
- no new dependency or orchestration framework
- no ML promotion as part of this change
- no giant source-type taxonomy rewrite

---

## Design principles

1. **Pipeline first**
   - interactive is a run policy, not a second implementation.
   - `interactive: true` must still use guardrails, domain packs, tiny-router/query-understanding, evidence state, sufficiency, conflict policy, and synthesis.

2. **Tiny flow decision, not a big branch**
   - flow decision only chooses run policy and retrieval bias:

```js
{
  runMode: "auto" | "checkpoint",
  retrievalBias: "web" | "community" | "mixed",
  authorityRequired: true | false,
  communityOnlyAllowed: true | false
}
```

3. **Collectors are retrieval backends**
   - `hn`, `v2ex`, `github`, `rss`, `youtube` feed source candidates into the shared evidence model.
   - They do not own their own sufficiency or synthesis path long-term.

4. **Community is signal, not verdict**
   - enough for sentiment, complaints, feature requests, trend summaries.
   - insufficient for security, package facts, deprecations, vendor status, legal, medical, finance, factual verification.

5. **Fail closed**
   - if evidence is thin, conflicting, high-risk, or non-authoritative, return `sufficient: false` with `missingAspects` and `nextActions`.
   - Do not pretend external systems are reliable. Use timeouts, max turns, and explicit partial status.

---

## Transcript-derived product lessons

Input: user-provided Agent Reach / research-OS transcript, plus README-level verification with `emet`.

Keep the useful parts, skip the hype:

- **Eyes, not brain**: the win is better routing to live sources, not claiming the model got smarter.
- **Capability inventory matters**: `emet doctor` should keep showing which backends work, fail, or need setup.
- **Clean extraction beats raw HTML**: return compact structured text by default; keep raw pages opt-in with `rawPages`.
- **Platform-specific retrieval is valuable**: YouTube transcripts, GitHub repo/issues/discussions, RSS, HN/V2EX/community are first-class retrieval backends.
- **Fallbacks beat magic**: if one backend fails, try another or return a partial checkpoint with gaps.
- **Cross-channel sanity checks**: community trends should be checked against docs, changelogs, status pages, or source repos when the user asks factual truth.
- **Agent-call presets matter**: agents need obvious schema examples for social-only, social+verify, YouTube transcript, GitHub scout, and checkpointed exploration.
- **Privacy/auth boundary stays hard**: cookie scraping, CRM enrichment, email finding, outreach, and lead-gen workflows are not part of this phase. `emet` stays read-only research.

---

## Agent Reach platform map and adoption plan

Agent Reach is useful as a product reference: one router, many platform adapters, doctor checks, clean text output, and fallback commands. Do not copy the whole surface into `emet` at once. Import the pattern, not the bloat.

### Platform categories to model

| Category | Platforms/tools from Agent Reach docs | Emet stance |
|---|---|---|
| Search | Exa web/code search | optional external backend later; current web search stays default |
| Web/readers | Jina Reader, web-reader MCP, WeChat via Exa/Camoufox, RSS/feedparser | reuse idea: clean extracted text, raw opt-in |
| Dev | GitHub via `gh` / API | already partly covered by `github` collector; extend issues/discussions carefully |
| Community/social public | V2EX, Reddit, HN-like forums | good fit for read-only community evidence |
| Video/transcript | YouTube, Bilibili, Xiaoyuzhou podcasts, Douyin video text | good fit when transcript/read-only; comments are best-effort evidence |
| Auth/cookie social | X/Twitter, LinkedIn, Xiaohongshu, Bilibili login-only paths | optional adapters only; doctor must show setup/auth status |
| Thin web fallbacks | Weibo/Zhihu/public pages via Jina Reader | treat as web/community fallback, not first-class phase-one platforms |
| Write/CRM/lead-gen | posting, comments, Clay-style email enrichment/outreach | out of scope; `emet` stays read-only research |

### Adoption tiers

**Tier 0 — already present / keep working**

- web search/fetch
- local files
- `hn`
- `v2ex`
- `github`
- `rss`
- `youtube`

**Tier 1 — safest next read-only adapters**

- `reddit`: public search/read/comments where available
- `bilibili`: metadata/subtitles through `yt-dlp`/CLI when available
- `weibo`: public page read through Jina-style reader
- `web`: explicit generic reader backend for known URLs

**Tier 2 — optional auth/setup adapters**

- `x` / `twitter`: cookie/API-backed, fragile; must be explicit and doctor-gated
- `linkedin`: login-required; high privacy boundary
- `xhs`: cookie/xsec-token flow; explicit only
- `douyin`: MCP/CLI adapter; explicit only
- `wechat`: Exa/Camoufox path; explicit only
- `podcast`: Xiaoyuzhou/Groq/ffmpeg setup; explicit only

**Tier 3 — do not include in this plan**

- posting, liking, commenting, sending messages
- CRM sync, lead enrichment, verified email finding
- scraping private/personal data
- bypassing paywalls or access controls

### Adapter contract

Use one tiny read-only adapter shape. No framework.

```js
{
  name: "reddit",
  label: "Reddit",
  auth: "none" | "optional" | "required",
  stability: "stable" | "fragile" | "best_effort",
  capabilities: ["search", "read", "comments", "transcript"],
  checkAvailability() {},
  async search(query, options) {},
  async read(idOrUrl, options) {}
}
```

All adapter output must normalize to source candidates plus `signals`, then enter the shared pipeline.

### Doctor and capability inventory

Expose platform availability without pretending every adapter works:

```js
{
  platform: "x",
  available: false,
  authRequired: true,
  reason: "missing cookies/API auth",
  capabilities: ["search", "read"]
}
```

`emet doctor` and structured research results should make this visible. This is the Agent Reach lesson worth copying.

### Schema aliases

Keep `options.platforms` as the user-facing selector. Support aliases later, but normalize internally:

```txt
hackernews -> hn
twitter -> x
youtube -> youtube
bilibili -> bilibili
小红书 -> xhs
微博 -> weibo
微信公众号 -> wechat
```

Unknown platforms must return a structured unavailable result, not crash.

---

## Target architecture

### Current

```txt
query
  -> if shouldRunCollectorInteractive()
       -> runCollectorInteractive()
       -> return
  -> normal web pipeline
```

### Target

```txt
query
  -> normalize options
  -> build guardrails
  -> domain/query-understanding routing
  -> decide run policy
  -> initialize pipeline state/session

pipeline turn
  -> choose retrieval backends
       - web search/fetch
       - collector/community search
       - local files
  -> normalize all results into source candidates
  -> rank/fetch/read as needed
  -> build shared evidence state
  -> evaluate sufficiency/conflict/authority
  -> if auto and next step is obvious: continue
  -> if checkpoint and agent choice matters: return checkpoint
  -> synthesize when sufficient or bounded max reached

result
  -> stable structuredContent
  -> human contentText
```

The key shift: **same pipeline, different stop policy**.

---

## Flow decision policy

Add a small `decideResearchFlow(query, options, guardrails, queryUnderstanding)` layer.

It must not replace domain packs, ML, or sufficiency logic. It only selects the pipeline behavior.

### `runMode`

- `auto` by default
- `checkpoint` when `interactive: true` or continuing a session

### `retrievalBias`

- `web` for normal docs/facts/current research
- `community` when explicit platforms are provided or the query clearly asks for sentiment/discussion/reaction/complaints
- `mixed` when community claims must be verified with official/authoritative sources

### `authorityRequired`

True when guardrails or query intent require authority:

- security/CVE/advisory
- package facts
- migration/deprecation/API truth claims
- vendor status/outage confirmation
- legal/medical/finance/trading
- official-doc/reference questions
- explicit `requireAuthoritative`

### `communityOnlyAllowed`

True only for community-signal questions:

- sentiment
- complaints
- feature requests
- reactions
- trend spotting
- discussion summary

False for factual verification.

---

## Interactive behavior

### Default auto mode

For normal questions:

```txt
search -> fetch -> evaluate -> follow up if needed -> synthesize
```

No checkpoint unless explicitly requested.

### `interactive: true`

Run the same pipeline, but return a checkpoint when agent choice matters:

- multiple plausible refinements
- source/result selection is useful
- community-only vs authority follow-up is a real decision
- ambiguity remains after first turn
- budget/max turn would be exceeded by auto-continuing

Do not checkpoint for mechanical steps that the tool can safely do itself.

### Continue session

Use existing `sessionId`, but store pipeline state, not just collector state:

```js
{
  id,
  query,
  turn,
  currentQuery,
  flow,
  sources,
  collectorResults,
  fetchedPages,
  evidenceState,
  previousActions
}
```

Keep it in-memory for this phase. No DB.

---

## Unified result contract

Use stable fields across auto, checkpoint, community, and mixed modes.

```js
{
  ok: true,
  schemaVersion: 1,
  action: "search" | "refine" | "fetch" | "synthesize" | "final",
  retrievalClass: "web" | "community" | "mixed" | "local",
  legacyAction: "collector_search", // optional compatibility only
  sessionId: "...",
  turn: 1,
  query: "root query",
  currentQuery: "current query",
  sufficient: false,
  authoritativeSourcesFound: false,
  followupRecommended: true,
  missingAspects: [],
  observedGaps: [],
  nextActions: [],
  sources: [],
  collectorResults: [],
  contentText: "compact human summary"
}
```

Rules:

- `action` must match the schema enum.
- Existing `collector_*` names can remain only as `legacyAction` during migration.
- `structuredContent` should always carry the same top-level fields.

---

## Collector normalization

Collectors should produce source candidates, not final research results.

Minimum normalized shape:

```js
{
  title,
  url,
  snippet,
  sourceType: "forum" | "github_repo" | "news" | "blog" | "other",
  authoritative: false,
  score,
  signals: {
    platform: "hn" | "v2ex" | "github" | "rss" | "youtube",
    kind: "community_post" | "issue" | "discussion" | "rss_item" | "video",
    author,
    points,
    comments
  }
}
```

Do **not** add a large new SourceType taxonomy first. Use current source types and put finer labels in `signals.kind`.

### Stable IDs

Replace index-only IDs:

```txt
hn:0
```

with stable IDs:

```txt
hn:<turn>:<hash(url-or-title)>
```

This prevents `selectedResultIds` collisions across refine turns.

---

## Domain packs and routing impact

Keep changes minimal.

### Existing assets to reuse

- `community` family already exists.
- `forums` overlay already exists.
- `github` overlay already exists.
- query understanding already has `source_family: community`.

### Required pack/rule adjustments

1. Expand community intent rules to include clear platform words:
   - HN / Hacker News
   - V2EX
   - Reddit/forum/discussion/community
   - GitHub issues/discussions when the user asks what people report/say

2. Keep official GitHub docs/repo questions in `developer-docs` / `github` authority path.

3. Do not make `rss` or `youtube` new domains in this phase.
   - Treat them as retrieval backends/signals.

4. High-risk domains must override community:
   - `security`, `medical`, `legal`, `finance`, `trading`, `vendor-status`, `package-registry`, `changelog`, `standards` remain authority-gated.

---

## ML/router impact

Do not retrain/promote ML as part of the first implementation.

Reason: current promotion gate is not safe for production promotion (`promoteSafe: false`).

### Phase policy

1. Use deterministic rules for flow/community/authority decisions.
2. Log decisions and evidence outcomes.
3. Add eval rows for community and checkpoint behavior.
4. Retrain query/domain models only after enough reviewed rows exist.
5. Promote only when `npm run check:promotion` passes.

ML can assist in shadow/abstain mode, but rules and guardrails decide safety.

---

## Edge-case policy

### Must stay authority-gated

- `social says package X is broken — is it true?`
- `HN says API Y is deprecated — verify`
- `Reddit reports outage — confirm`
- `GitHub issue says CVE/exploit exists`
- legal/medical/finance/trading claims
- version/deprecation/migration claims

Output if only community evidence exists:

```js
{
  sufficient: false,
  followupRecommended: true,
  missingAspects: ["authoritative sources"]
}
```

### May be community-sufficient

- `what are people saying about X?`
- `summarize complaints about Y`
- `extract feature requests from these discussions`
- `HN/V2EX sentiment about Z`

Still include gaps if sample is small or collectors failed.

### Collector failure

If one collector fails:

- keep partial results
- mark `observedGaps: ["some collectors unavailable"]`
- do not fail whole run unless no retrieval backend produced usable evidence

### Ambiguous intent

If community vs authority is unclear and `interactive: true`:

- return checkpoint with two `nextActions`
  - community summary
  - authority verification

If not interactive:

- choose safer path: authority/mixed.

### Max turns

Never loop indefinitely. Use current `maxTurns` and return partial status with next actions.

---

## Agent call presets

These are not new public tools. They are examples agents can infer from schema/descriptions.

### Social-only research

Use when the question is explicitly about sentiment, complaints, requests, reactions, or community discussion.

```js
{
  query: "What are people complaining about in React 19?",
  mode: "fast",
  options: {
    familyHint: "community",
    platforms: ["hn", "github", "rss"],
    maxResultsPerPlatform: 5,
    requireAuthoritative: false
  }
}
```

Expected behavior: community retrieval can be sufficient if evidence is enough and the query is not asking for factual verification.

### Social signal plus authority verification

Use when community says something factual and the agent must verify it.

```js
{
  query: "HN says API X is deprecated — verify whether that is true",
  mode: "deep",
  options: {
    familyHint: "community",
    platforms: ["hn", "github"],
    requireAuthoritative: true,
    overlays: ["official-only", "changelog"]
  }
}
```

Expected behavior: community evidence seeds the investigation; official docs/changelogs decide sufficiency.

### Checkpointed exploration

Use when the agent should choose sources or next branch.

```js
{
  query: "Explore community feedback on Bun vs Node this month",
  mode: "deep",
  options: {
    interactive: true,
    familyHint: "community",
    platforms: ["hn", "github", "rss"],
    maxResultsPerPlatform: 5
  }
}
```

Then continue with the returned `sessionId`:

```js
{
  query: "Explore community feedback on Bun vs Node this month",
  mode: "deep",
  options: {
    interactive: true,
    sessionId: "...",
    action: "fetch",
    selectedResultIds: ["hn:1:abc123"]
  }
}
```

### YouTube transcript research

Use `platforms: ["youtube"]` when the user asks about a video, transcript, first sentence, or video summary.

```js
{
  query: "Find the latest long-form video from CHANNEL and summarize its transcript",
  mode: "fast",
  options: {
    familyHint: "community",
    platforms: ["youtube"],
    maxResultsPerPlatform: 3
  }
}
```

### GitHub scout

Use GitHub retrieval when the user asks whether a repo is worth studying, adopting, or making content about.

```js
{
  query: "Scout github.com/OWNER/REPO: what it does, traction, risks, and whether it is worth covering",
  mode: "code",
  options: {
    platforms: ["github"],
    overlays: ["github"]
  }
}
```

---

## Discoverability plan

Update descriptions only; no prompt explosion.

### `lib/tool-schema.js`

Clarify:

- `interactive`: checkpointable research using the normal pipeline
- `platforms`: optional community collectors, not a separate tool
- `action`: continues a checkpointed session
- `selectedResultIds`: stable result IDs from previous checkpoint
- `maxResultsPerPlatform`: collector cap

### `index.js`

Mirror the Pi schema and prompt guidance.

### `mcp/hosts/profiles.js`

Add host instructions:

- use default auto for straightforward factual/docs research
- use `interactive: true` for exploratory decisions
- use `platforms` for community/sentiment work
- require authority follow-up for high-risk/factual claims

### Optional later

Add one compact prompt/resource only if schema + host instructions are not enough.

---

## Modularization plan

This section summarizes the implementation boundary. The full whole-repo prep plan lives in `docs/plans/2026-06-22-research-pipeline-modularization-prep-plan.md` and should land first.

Current evidence: `lib/web-research.js` is already large (~1.8k lines), but `emet` also includes MCP/Pi/CLI adapters, retrieval/extraction, routing/ML, domain packs, memory/logging, tests, evals, and docs. Do not make the unified pipeline a new monolith in any of those subsystems. Split only at stable seams. No framework, no DI container, no class tree.

Architecture research from large projects points to the same shape:

- ESLint separates bootstrap, CLI I/O, public API, and pure linting core; its core linter does not touch filesystem or console.
- VS Code keeps extension/runtime boundaries explicit through extension host and contribution points.
- Node package guidance favors explicit entry points and thin adapters.

For `emet`, that means MCP/Pi/CLI stay adapters, `runWebResearch()` stays orchestration, retrieval modules own I/O, and policy/evidence modules remain I/O-free.

### Target module shape

Keep `runWebResearch()` as the thin orchestrator:

```txt
lib/web-research.js
  -> normalize input
  -> call flow policy
  -> run one pipeline turn
  -> return final/checkpoint result
```

Extract small modules only where they remove real coupling:

| Module | Owns | Must not own |
|---|---|---|
| `lib/research-flow.js` | `decideResearchFlow()`, community-only vs mixed, authority-required rules | fetching, sessions, synthesis |
| `lib/research-session.js` | bounded in-memory pipeline sessions, TTL, max sessions | research policy decisions |
| `lib/research-contract.js` | unified checkpoint/final result builders, action enum compatibility | retrieval logic |
| `lib/retrieval/community.js` | calls collectors as read-only retrieval backends | sufficiency, final answers |
| `lib/retrieval/normalize.js` | collector/platform result -> source candidate | platform API calls |

If a module would be under ~30 lines and used once, keep it inline until the second use.

### What stays where

- `lib/collectors/*` stay platform-specific.
- `lib/research-next-action-policy.js` keeps sufficiency/follow-up decisions.
- `lib/research-evidence.js` keeps evidence graph/state.
- `lib/domains/*` keep source policy/domain packs.
- `lib/web-research.js` coordinates, but stops owning every helper.

### Anti-monolith rules

- No new code path may bypass guardrails, evidence state, or sufficiency policy.
- No platform adapter may synthesize final answers.
- No flow policy may fetch network data.
- No output contract field may be invented in only one branch.
- No MCP/Pi/CLI transport concern may leak into core policy/evidence modules.
- No auth/cookie/platform setup logic may leak into sufficiency or synthesis.
- No new abstraction with one implementation unless it replaces existing duplication.

### Split order

1. Extract pure flow policy first (`research-flow.js`) with unit tests.
2. Extract session map second (`research-session.js`) after checkpoint state shape is known.
3. Extract community retrieval/normalization third, reusing current collectors.
4. Extract result builders last, once output shape stabilizes.

This avoids speculative structure while preventing `web-research.js` from becoming the permanent monolith.

---

## Legacy cleanup and migration plan

Repo scan found old collector-interactive language in code, tests, changelog, release docs, and the previous issue-19 plan. Treat them differently.

### Runtime/schema files to update during implementation

These must move to the new wording/behavior:

- `lib/web-research.js`
  - remove the early collector-only return
  - rename/comment old collector branch as community retrieval backend
  - keep exported compatibility helpers only until tests migrate
- `lib/tool-schema.js`
  - replace `collector interactive options` comments with `checkpoint/community retrieval options`
  - `interactive` description becomes "checkpointable normal research pipeline"
  - `platforms` description becomes "community/media retrieval backends"
- `index.js`
  - mirror Pi schema descriptions and prompt guidance
- `test/collector-flow.test.js`
  - split into compatibility tests and new checkpointed-pipeline tests
  - old expectation `interactive: true -> collector` must flip to `interactive: true -> pipeline checkpoint`

### Historical docs to keep, but mark superseded

Do not rewrite release history. Add a short supersession note only if touched later:

- `CHANGELOG.md` current 1.4.2 notes describe what shipped; keep historical truth.
- `docs/releases/1.4.2.md` describes the released collector-backed mode; keep historical truth.
- `docs/plans/2026-06-22-issue-19-collector-backed-interactive-mode-plan.md` should remain as the old implemented slice, but this unified plan supersedes it for future work.

### Compatibility window

Keep old response fields for one migration slice:

```js
{
  action: "search",
  retrievalClass: "community",
  legacyAction: "collector_search",
  collectorResults: []
}
```

After downstream tests and docs use the unified contract, remove reliance on `legacyAction`.

### Naming migration

Use this naming everywhere new:

```txt
collector interactive -> checkpointed pipeline with community retrieval
collector path        -> community retrieval backend
collectorResults     -> compatibility field for raw platform results
platforms            -> retrieval backend selector
social mode          -> community retrieval bias
```

### Done when stale behavior is gone

- `interactive: true` alone no longer routes to collector-only code.
- schema text no longer says collector-interactive as the primary concept.
- tests prove `platforms` selects community retrieval, while `interactive` selects checkpointing.
- historical release docs remain truthful and the new plan is the forward source of truth.

---

## File-level implementation plan

### `lib/web-research.js`

Main work:

1. Replace early collector return with pipeline flow decision.
2. Keep collector functions temporarily, but call them as retrieval backends.
3. Add pipeline session state for checkpointing.
4. Normalize collector outputs into shared source candidates.
5. Return stable unified checkpoint shape.
6. Keep existing guardrails, query understanding, search/fetch, sufficiency, conflict, trace, and synthesis as the backbone.

### `lib/research-evidence.js`

- Preserve community signals on sources.
- Do not classify community evidence as authoritative by default.

### `lib/research-next-action-policy.js`

- Add community/authority decision reasons if needed.
- Ensure high-risk/community-only cannot stop as sufficient.

### `lib/domains/index.js` and domain packs

- Minimal community intent improvements only.
- No new pack family unless tests prove current `community` + overlays are insufficient.

### `lib/tool-schema.js`

- Improve descriptions.
- Add output schema only if MCP handler can support it cleanly without churn.

### `index.js`

- Mirror schema and Pi guidance.

### `mcp/hosts/profiles.js`

- Align host instructions.

### Tests

Add focused tests, not a giant framework.

---

## Test plan

### Keep existing guarantees

- public tools remain exactly `emet` and `web_fetch`
- non-interactive research still works
- existing collector tests still pass during migration
- `npm run check` passes

### Add behavior tests

1. `interactive: true` without platforms uses normal web pipeline, not collector-only.
2. Explicit `platforms` uses community retrieval backend.
3. `action` in output matches schema enum.
4. `legacyAction` carries old collector names only during migration.
5. Collector result IDs do not collide across refine turns.
6. Community sentiment query can be `sufficient: true` with community evidence.
7. Community factual-claim query returns `sufficient: false` without authority.
8. High-risk query never becomes community-only sufficient.
9. Mixed community+authority query fetches or recommends official follow-up.
10. Collector failure yields partial checkpoint, not silent success.
11. Session max turns returns bounded partial state.
12. `structuredContent` top-level fields remain stable across web/community/mixed.
13. Schema/descriptions mention checkpointed pipeline and community collectors.
14. Tool surface stays exactly `emet` + `web_fetch`.

Final gate:

```bash
npm run check
```

Promotion gate is not required for the first rule-based implementation, but ML promotion later requires:

```bash
npm run check:promotion
```

---

## Acceptance criteria

- `emet` remains the single public research tool.
- `interactive: true` means checkpointable normal pipeline, not collector-only branch.
- Collectors are retrieval backends inside the shared pipeline.
- Domain packs, guardrails, query understanding, evidence state, sufficiency, conflict policy, and synthesis are reused.
- Community-only sufficiency is allowed only for community-signal questions.
- Factual/high-risk claims require authoritative follow-up.
- Result contract is stable and schema-aligned.
- Collector result IDs are stable across turns.
- The system fails closed with `sufficient: false`, `missingAspects`, and `nextActions` when evidence is weak.
- `npm run check` passes.

---

## Rollout slices

### Slice 0: Modularization prep

- complete `docs/plans/2026-06-22-research-pipeline-modularization-prep-plan.md`
- extract flow/session/contract/community normalization seams
- keep behavior compatible before changing routing semantics

### Slice 1: Contract and routing safety

- fix `interactive: true` so it does not automatically mean collector-only
- add unified result fields
- add tests for schema/action consistency

### Slice 2: Collector as backend

- normalize collector outputs to source candidates
- stable IDs
- keep compatibility fields

### Slice 3: Checkpointable pipeline

- pipeline session state
- checkpoint return at decision points
- continue with `sessionId` + `action`

### Slice 4: Community authority policy

- community-only vs mixed rules
- high-risk authority gate tests

### Slice 5: Discoverability

- schema descriptions
- Pi guidance
- MCP host instructions

### Slice 6: Evaluation data for ML later

- log community decisions
- add reviewed rows
- retrain only after data exists
- promote only after `check:promotion` passes

---

## Ponytail cuts

- no second pipeline
- no new public tools
- no new DB for sessions
- no new dependency
- no source-type explosion
- no ML promotion in the first pass
- no prompt/resource framework unless schema text is not enough

Smallest correct architecture: **one normal research pipeline, checkpointable stop policy, collectors as retrieval backends, authority gate in the shared sufficiency layer**.
