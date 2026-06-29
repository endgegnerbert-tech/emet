# Full audit scope for emet

Date: 2026-06-25
Status: execution-ready multi-agent audit plan
Basis: current repo at `HEAD`

## Mission

Run a whole-repo audit that is broad, adversarial, and deletion-friendly.

This is not just a bug sweep. The audit should identify:

- correctness bugs
- contract drift
- stale docs
- dead code
- compatibility leftovers
- policy/cache/version hazards
- risky dependencies
- product incoherence
- tests that look useful but do not protect behavior

The audit output should be strong enough to drive follow-up fix passes without re-reading the whole repository from scratch.

## Execution model

This file is the controller plan for a parallel audit run.

Rules for the run:

- use many parallel subagents
- each subagent owns exactly one output file
- each subagent has a disjoint write target
- subagents may inspect any repo files but must only write their own assigned audit file
- subagents should prefer concrete findings over broad summaries
- subagents must separate confirmed issues from suspicions and follow-ups
- subagents should propose deletions when a feature/module no longer pays for itself

## Output directory

All worker outputs should live under:

- `docs/fixes/audit/2026-06-25/`

Required files for the run:

- `00-index.md` — main-thread synthesis/index
- `01-public-contract-and-release-surface.md`
- `02-architecture-and-boundaries.md`
- `03-pipeline-and-query-ingress.md`
- `04-domain-routing-and-policy.md`
- `05-search-fetch-and-source-controls.md`
- `06-ranking-version-sufficiency-and-synthesis.md`
- `07-cache-memory-and-trace-safety.md`
- `08-community-collectors-and-session-flow.md`
- `09-cli-mcp-pi-host-integrations.md`
- `10-tests-eval-docs-and-dead-code.md`
- `11-dependency-security-performance-product.md`
- `12-cross-report-priority-matrix.md`
- `13-delete-vs-repair-matrix.md`
- `14-test-gap-matrix.md`
- `15-docs-and-release-followups.md`
- `16-fix-batch-plan.md`

## Required file structure for every worker output

Every worker file should use this shape:

1. Scope
2. Files inspected
3. Findings
4. Risks and open questions
5. Recommended fixes
6. Suggested tests

Constraints:

- findings must be ordered highest-risk first
- include file references whenever possible
- separate "confirmed" from "likely" issues
- call out behavior drift, not just style issues
- prefer delete/simplify recommendations over abstraction

## Audit sharding plan

Each numbered worker below owns exactly one output file.

### Worker 01 — public contract and published surface

Output file:

- `docs/fixes/audit/2026-06-25/01-public-contract-and-release-surface.md`

Primary scope:

- public entrypoints
- package publish surface
- runtime/export/schema drift
- version/release/manifests mismatch

Primary files:

- `package.json`
- `index.js`
- `extensions/emet.ts`
- `bin/emet.js`
- `bin/emet-mcp.js`
- `mcp/server.js`
- `mcp/index.js`
- `mcp-server.js`
- `lib/tool-schema.js`
- `server.json`
- `README.md`
- `CHANGELOG.md`
- `configs/`
- `.claude-plugin/`
- `.codex-plugin/`
- `plugins/`

### Worker 02 — architecture and layer boundaries

Output file:

- `docs/fixes/audit/2026-06-25/02-architecture-and-boundaries.md`

Primary scope:

- intended layer model vs actual imports/runtime coupling
- facade purity
- deleted architecture leftovers
- boundary audit gaps

Primary files:

- `AGENTS.md`
- `lib/web-research.js`
- `lib/research/pipeline.js`
- `lib/retrieval/community.js`
- `lib/research-memory.js`
- `lib/collectors/*`
- `docs/pipeline.md`
- `test/boundary-audit.test.js`

### Worker 03 — pipeline and query ingress

Output file:

- `docs/fixes/audit/2026-06-25/03-pipeline-and-query-ingress.md`

Primary scope:

- end-to-end pipeline
- input normalization
- config resolution
- planner/query-intent drift
- short-circuit and redundant-work risks

Primary files:

- `lib/research/pipeline.js`
- `lib/research/config.js`
- `lib/research/queries.js`
- `lib/research-intent.js`
- `lib/query-understanding.js`
- `lib/planner.js`
- `lib/types.js`
- `docs/pipeline.md`

### Worker 04 — domain routing and policy gates

Output file:

- `docs/fixes/audit/2026-06-25/04-domain-routing-and-policy.md`

Primary scope:

- domain packs
- overlays and source policy composition
- guardrails
- authority/recency/version gates
- fail-open vs fail-closed behavior

Primary files:

- `lib/domains/*`
- `lib/research-flow.js`
- `lib/router-policy-context.js`
- `lib/research-policy.js`
- `lib/research-guardrails.js`
- `lib/research-output.js`
- `lib/research-next-action-policy.js`
- `test/domain-packs.test.js`
- `test/intent-router.test.js`
- `test/research-guardrails.test.js`
- `test/research-policy-domain.test.js`

### Worker 05 — search, fetch, extraction, and source controls

Output file:

- `docs/fixes/audit/2026-06-25/05-search-fetch-and-source-controls.md`

Primary scope:

- provider ordering/fallbacks
- source filtering
- path/host controls
- fetch pipeline
- article/PDF extraction

Primary files:

- `lib/research/search.js`
- `lib/research/fetch.js`
- `lib/page-fetch-adapter.js`
- `lib/article-extractor.js`
- `lib/pdf-extractor.js`
- `lib/research/extraction.js`
- `lib/research/helpers.js`
- `test/page-fetch-adapter.test.js`
- `test/page-store.test.js`
- `test/source-scoring.test.js`

### Worker 06 — ranking, version behavior, sufficiency, and synthesis

Output file:

- `docs/fixes/audit/2026-06-25/06-ranking-version-sufficiency-and-synthesis.md`

Primary scope:

- ranking/scoring
- version-sensitive behavior
- evidence sufficiency
- conflict detection
- synthesis and fallback synthesis
- output grounding quality

Primary files:

- `lib/research/ranking.js`
- `lib/research/heuristics.js`
- `lib/version-context.js`
- `lib/research/coverage.js`
- `lib/research/synthesis.js`
- `lib/research-output.js`
- `lib/research-next-action-policy.js`
- `test/version-context.test.js`
- `test/research-improvements.test.js`
- `test/output-formats.test.js`

### Worker 07 — cache, memory, DB, and trace safety

Output file:

- `docs/fixes/audit/2026-06-25/07-cache-memory-and-trace-safety.md`

Primary scope:

- all cache layers
- persistent DB semantics
- topic fallback contamination
- trace/log safety
- global vs project scope

Primary files:

- `lib/research/cache.js`
- `lib/research-memory.js`
- `lib/research-trace.js`
- `lib/local-logger.js`
- `lib/research/pipeline.js`
- `lib/research/search.js`
- `lib/research/fetch.js`
- `test/page-store.test.js`
- `test/research-logging.test.js`
- `docs/fixes/2026-06-25-cache-semantics-and-compat-leftovers.md`

### Worker 08 — community retrieval, collectors, and session flow

Output file:

- `docs/fixes/audit/2026-06-25/08-community-collectors-and-session-flow.md`

Primary scope:

- checkpoint flow
- interactive/session semantics
- community/web transition behavior
- collector implementation value and drift

Primary files:

- `lib/retrieval/community.js`
- `lib/retrieval/normalize.js`
- `lib/research-session.js`
- `lib/research-flow.js`
- `lib/collectors/*`
- `test/collector-flow.test.js`
- `test/retrieval-community.test.js`
- `test/retrieval-normalize.test.js`
- `test/research-session.test.js`
- `test/collectors.test.js`

### Worker 09 — CLI, MCP, Pi, and host integration surface

Output file:

- `docs/fixes/audit/2026-06-25/09-cli-mcp-pi-host-integrations.md`

Primary scope:

- CLI behavior
- MCP transport/handlers
- Pi integration
- host config/docs drift

Primary files:

- `lib/cli.js`
- `bin/emet.js`
- `mcp/server.js`
- `mcp/index.js`
- `mcp/transport.js`
- `mcp/handlers/*`
- `mcp/services/sampling.js`
- `lib/emet-runtime.js`
- `extensions/emet.ts`
- `docs/hosts/*`
- `configs/*`
- `test/cli.test.js`
- `test/mcp-server.test.js`
- `test/mcp-transport.test.js`

### Worker 10 — tests, eval, docs drift, and dead code

Output file:

- `docs/fixes/audit/2026-06-25/10-tests-eval-docs-and-dead-code.md`

Primary scope:

- test coverage quality
- eval realism
- stale docs
- compatibility leftovers
- dead modules or decorative fields

Primary files:

- `test/*.test.js`
- `lib/eval/*`
- `eval/cases/*`
- `docs/pipeline.md`
- `README.md`
- `docs/releases/*`
- `lib/research-contract.js`
- `lib/research-evidence.js`
- `lib/research-session.js`
- `lib/research-trace.js`
- `lib/web-research.js`

### Worker 11 — dependencies, security, performance, product coherence

Output file:

- `docs/fixes/audit/2026-06-25/11-dependency-security-performance-product.md`

Primary scope:

- dependency value audit
- security/trust boundaries
- performance hotspots
- product coherence and deletion candidates

Primary files:

- `package.json`
- `SECURITY.md`
- `lib/research/pipeline.js`
- `lib/research/search.js`
- `lib/research/fetch.js`
- `lib/research-memory.js`
- `lib/retrieval/community.js`
- `index.js`
- `mcp/*`
- runtime call sites for each dependency

### Worker 12 — cross-report priority matrix

Output file:

- `docs/fixes/audit/2026-06-25/12-cross-report-priority-matrix.md`

Primary scope:

- read worker outputs `01` through `11`
- dedupe overlapping findings
- rank top issues by severity, blast radius, and repair cost
- identify the few fixes that unlock the most risk reduction

### Worker 13 — delete vs repair matrix

Output file:

- `docs/fixes/audit/2026-06-25/13-delete-vs-repair-matrix.md`

Primary scope:

- read worker outputs `01` through `11`
- list deletion candidates
- distinguish dead code, compat leftovers, soft-deprecated paths, and underpowered features
- recommend delete, freeze, or repair for each candidate

### Worker 14 — test gap matrix

Output file:

- `docs/fixes/audit/2026-06-25/14-test-gap-matrix.md`

Primary scope:

- read worker outputs `01` through `11`
- convert findings into concrete missing tests
- group by unit, integration, contract, cache, and regression coverage
- rank by risk and expected bug-catching value

### Worker 15 — docs and release follow-ups

Output file:

- `docs/fixes/audit/2026-06-25/15-docs-and-release-followups.md`

Primary scope:

- read worker outputs `01` through `11`
- map docs drift, config drift, manifest drift, and release-note gaps
- propose exact docs/release cleanup batches

### Worker 16 — fix batch plan

Output file:

- `docs/fixes/audit/2026-06-25/16-fix-batch-plan.md`

Primary scope:

- read worker outputs `01` through `15`
- group follow-up work into practical implementation batches
- each batch should have target files, expected risk, and verification commands
- optimize for safe sequencing and parallel implementation

## Main-thread responsibilities

The main thread should own only:

- `docs/fixes/audit/2026-06-25/00-index.md`
- cross-file synthesis
- deduping overlapping findings
- prioritizing repo-wide fix order
- deciding delete vs repair
- final "what emet should be" recommendation

## Acceptance criteria

The audit run is only complete when:

- every worker file exists
- every worker file contains concrete findings, not just summaries
- overlaps are resolved in `00-index.md`
- top risks are prioritized across the whole repo
- fix proposals are grouped into delete / repair / test / docs / release follow-up

## Suggested run order

Wave 1:

- Worker 01
- Worker 02
- Worker 03
- Worker 07
- Worker 09

Wave 2:

- Worker 04
- Worker 05
- Worker 06
- Worker 08
- Worker 10
- Worker 11

## Verified repo surface

Top-level runtime surface seen in repo now:

- `bin/emet.js`, `bin/emet-mcp.js`
- `index.js`, `extensions/emet.ts`
- `mcp/` server + handlers + transport
- `lib/` runtime modules
- `eval/cases/`
- `test/` audit + runtime tests
- `docs/`, `README.md`, `CHANGELOG.md`

Key runtime areas under `lib/` now:

- `research/` → `cache.js`, `config.js`, `coverage.js`, `extraction.js`, `fetch.js`, `helpers.js`, `heuristics.js`, `pipeline.js`, `queries.js`, `ranking.js`, `search.js`, `synthesis.js`
- `collectors/` → `collector.js`, `github-collector.js`, `hn.js`, `rss.js`, `v2ex.js`, `youtube.js`, `index.js`
- `retrieval/` → `community.js`, `normalize.js`
- top-level policy/state/runtime modules such as `research-memory.js`, `research-evidence.js`, `research-flow.js`, `research-session.js`, `research-trace.js`, `research-policy.js`, `research-output.js`, `research-next-action-policy.js`, `query-understanding.js`, `version-context.js`, `tool-schema.js`, `emet-runtime.js`, `cli.js`

## What must be checked — everything

## 1. Public entrypoints and published contract

Files:

- `package.json`
- `index.js`
- `extensions/emet.ts`
- `bin/emet.js`
- `bin/emet-mcp.js`
- `mcp/server.js`, `mcp/index.js`, `mcp-server.js`
- `lib/tool-schema.js`
- `server.json`
- plugin/config files under `configs/`, `.claude-plugin/`, `.codex-plugin/`, `plugins/`

Check:

- what is actually public vs internal
- whether CLI, MCP, Pi extension all expose the same semantics
- schema drift between Pi and MCP
- version drift across package/manifests/docs
- npm `files` list vs actual shipped runtime needs
- whether docs describe the current public contract, not old behavior

## 2. Top-level architecture and dependency boundaries

Files:

- `lib/web-research.js`
- `lib/research/pipeline.js`
- `lib/retrieval/community.js`
- `lib/collectors/*`
- `lib/research-memory.js`
- `test/boundary-audit.test.js`
- `AGENTS.md`
- `docs/pipeline.md`

Check:

- whether the actual code still matches the intended layer model
- whether any adapter/platform/base boundary is leaking
- whether `web-research.js` is still truly just a facade
- whether removed ML/tiny-router architecture is fully gone from runtime paths
- whether docs still mention deleted layers/scripts/features

## 3. End-to-end research pipeline

Files:

- `lib/research/pipeline.js`
- `docs/pipeline.md`

Check the whole turn lifecycle:

- input normalization
- mode resolution
- guardrails
- domain resolution
- query understanding
- flow policy
- cache lookup
- local file merge
- search turn loop
- fetch loop
- conflict/sufficiency/follow-up loop
- synthesis
- result shaping
- memory/persistent cache write
- logging and trace emission

Questions:

- what exactly happens on the happy path
- where can it short-circuit
- where can it return stale or partial data
- where can one option silently change another
- where can the pipeline do redundant work

## 4. Query ingress and normalization

Files:

- `lib/tool-schema.js`
- `lib/research/config.js`
- `lib/research-intent.js`
- `lib/query-understanding.js`
- `lib/planner.js`
- `lib/types.js`

Check:

- option parsing and defaults
- hidden coupling between `mode`, `options`, `deepResearchConfig`, `platforms`, `interactive`
- which options are ignored, overridden, or only half-respected
- whether `defaultMode()` and actual config resolution agree
- whether user intent survives from tool schema to runtime config unchanged

## 5. Domain routing and domain packs

Files:

- `lib/domains/index.js`
- all files in `lib/domains/`
- `lib/research-flow.js`
- `lib/research-intent.js`
- `lib/router-policy-context.js`
- `test/domain-packs.test.js`
- `test/intent-router.test.js`

Check:

- explicit domain overrides
- hints/overlays/sourcePolicy composition
- family/overlay behavior
- authoritative-source defaults per domain
- query hints and source constraints per pack
- obsolete or duplicate packs
- packs that no longer have realistic runtime support

## 6. Guardrails and policy gates

Files:

- `lib/research-guardrails.js`
- `lib/research-policy.js`
- `lib/research-output.js`
- `lib/research-next-action-policy.js`
- `lib/research-flow.js`
- `test/research-guardrails.test.js`
- `test/research-next-action-policy.test.js`
- `test/research-policy-domain.test.js`

Check:

- what triggers authority requirements
- what triggers recency/version constraints
- where guardrails are advisory vs fail-closed
- whether policy decisions can be bypassed by cache reuse
- whether policy output matches actual retrieval behavior

## 7. Query planning and subquery generation

Files:

- `lib/research/queries.js`
- `lib/planner.js`
- `lib/query-understanding.js`
- `test/query-understanding.test.js`
- `test/web-research.test.js`

Check:

- fast vs deep vs academic planning
- model-assisted vs heuristic planning
- subquery explosion risk
- duplicate subqueries
- version/context preservation in subqueries
- query planning that looks smart but does nothing useful

## 8. Search providers and provider fallbacks

Files:

- `lib/research/search.js`
- `lib/page-fetch-adapter.js`
- `lib/research/helpers.js`
- `test/research-logging.test.js`
- `test/web-research.test.js`

Check:

- DDG HTML/lite/Jina ordering
- provider retry/fallback behavior
- search timeout behavior
- deduping/ranking before fetch
- empty-result loops
- whether blocked/failing providers degrade cleanly
- whether source filtering happens before or after ranking in the right place

## 9. Source filtering and host controls

Files:

- `lib/research/search.js`
- `lib/research/config.js`
- `lib/research.js` re-exports from heuristics/ranking
- `test/source-scoring.test.js`
- `test/web-research.test.js`

Check:

- `allowedSources`
- `hostAllowlist`
- `allowedSourceTypes`
- host/path parsing edge cases
- official-doc heuristics vs docs-like mirrors
- fail-open vs fail-closed behavior
- whether source constraints are reflected in cache keys

## 10. Fetch pipeline

Files:

- `lib/research/fetch.js`
- `lib/page-fetch-adapter.js`
- `lib/article-extractor.js`
- `lib/pdf-extractor.js`
- `test/page-fetch-adapter.test.js`
- `test/web-research.test.js`
- `test/page-store.test.js`

Check:

- text fetch vs Jina fetch
- page timeout rules
- blocked/thin/dynamic page heuristics
- unsupported content fallback
- PDF path
- article extraction path
- local file path
- duplicate page suppression
- page truncation/full text behavior
- whether the best page survives to synthesis correctly

## 11. Ranking and scoring

Files:

- `lib/research/ranking.js`
- `lib/research/heuristics.js`
- `lib/research-policy.js`
- `lib/version-context.js`
- `test/source-scoring.test.js`
- `test/version-context.test.js`
- `test/research-improvements.test.js`

Check:

- source score components
- authority/freshness/version weighting
- docs vs blog vs forum preferences
- exact-version preference
- whether ranking logic and sufficiency logic disagree
- score fields in output vs true runtime meaning

## 12. Version-sensitive behavior

Files:

- `lib/version-context.js`
- `lib/research/queries.js`
- `lib/research/ranking.js`
- `lib/research/coverage.js`
- `test/version-context.test.js`
- `test/web-research.test.js`

Check:

- explicit version extraction
- deprecated/breaking/removal wording
- changelog/release-note preference
- exact-version vs latest-doc tradeoff
- whether cache/topic fallback breaks version-sensitive correctness

## 13. Evidence graph and evidence state

Files:

- `lib/research-evidence.js`
- `lib/research-trace.js`
- `lib/research/pipeline.js`
- `test/evidence-schema.test.js`

Check:

- whether evidence state is actually complete enough to be useful
- whether every turn writes enough evidence to explain final decisions
- whether evidence graph fields are live or decorative
- whether any evidence structures are now obsolete after ML removal
- whether evidence state is used consistently by conflict/sufficiency/policy

## 14. Conflict detection, sufficiency, follow-up

Files:

- `lib/research/coverage.js`
- `lib/research-next-action-policy.js`
- `lib/research-flow.js`
- `lib/research/pipeline.js`
- `test/research-next-action-policy.test.js`
- `test/web-research.test.js`

Check:

- current heuristic-only conflict path
- current heuristic-only sufficiency path
- follow-up query generation
- conflict summaries quality
- false-sufficient risk
- loops that keep searching without improving evidence
- whether results stop too early or too late

## 15. Synthesis and fallback synthesis

Files:

- `lib/research/synthesis.js`
- `lib/research/coverage.js`
- `lib/research-output.js`
- `test/output-formats.test.js`
- `test/web-research.test.js`

Check:

- LLM synthesis path
- fallback synthesis path
- citation/source index correctness
- source selection into synthesis prompt
- prompt size pressure
- whether fallback answers are grounded or just stitched excerpts
- whether synthesis honors authority/version constraints

## 16. Output shaping and response contracts

Files:

- `lib/types.js`
- `lib/research-contract.js`
- `lib/research-output.js`
- `lib/emet-runtime.js`
- `mcp/handlers/resources.js`
- `test/research-contract.test.js`
- `test/output-formats.test.js`

Check:

- canonical `action` contract
- `legacyAction` migration leftovers
- `structuredContent` vs text output
- source metadata stability
- raw page inclusion
- consistent shape across MCP, Pi, CLI
- whether outputs are compact but still sufficient for agents

## 17. Cache system — all layers

Files:

- `lib/research/cache.js`
- `lib/research-memory.js`
- `lib/research/pipeline.js`
- `lib/research/search.js`
- `lib/research/fetch.js`
- `test/page-store.test.js`
- `test/web-research.test.js`
- `docs/fixes/2026-06-25-cache-semantics-and-compat-leftovers.md`

Check all caches separately:

### 17a. In-memory result cache
- exact-key behavior
- lifecycle/eviction
- agent/session interaction

### 17b. Persistent global research cache
- SQLite schema and TTL
- exact key vs topic fallback key
- cache key completeness
- cross-query contamination
- cross-option contamination
- cache reuse under authority/version/recency constraints

### 17c. Search cache
- provider result reuse
- source-filter-sensitive cache correctness

### 17d. Page snapshot cache
- normalized URL behavior
- truncated vs full text behavior
- reuse safety across modes

### 17e. Dev cache
- whether it is still useful
- whether it leaks oversized or sensitive data

### 17f. Cache scope
- cache path is global/user-level by default, not repo-local
- verify whether that is intended for all cache classes
- verify whether per-project isolation is needed anywhere

## 18. Research memory DB / SQLite internals

Files:

- `lib/research-memory.js`
- `test/page-store.test.js`

Check:

- schema correctness
- migrations from old JSON cache
- cleanup jobs
- DB corruption/failure handling
- FTS pages table behavior
- size growth over time
- access count/session_id usefulness
- whether unused columns/tables exist now

## 19. Logging, telemetry, trace safety

Files:

- `lib/local-logger.js`
- `lib/research-trace.js`
- `lib/research-memory.js`
- `test/research-logging.test.js`
- `test/boundary-audit.test.js`

Check:

- what events are emitted
- whether logs can reconstruct failures
- secret/token leakage risk
- oversized log growth
- event field consistency
- whether logs still mention deleted runtime concepts

## 20. Community retrieval and checkpoint flow

Files:

- `lib/retrieval/community.js`
- `lib/retrieval/normalize.js`
- `lib/research-session.js`
- `lib/research-flow.js`
- `test/collector-flow.test.js`
- `test/retrieval-community.test.js`
- `test/retrieval-normalize.test.js`
- `test/research-session.test.js`

Check:

- `interactive` semantics
- `platforms` semantics
- session creation/continuation
- turn budget handling
- `selectedResultIds` and `selectedUrls`
- search/fetch/synthesize transitions
- mixed community+web behavior
- fallback from community to normal pipeline
- old `runCollectorInteractive()` path vs new checkpoint path drift

## 21. Collector implementations one by one

Files:

- `lib/collectors/collector.js`
- `lib/collectors/index.js`
- `lib/collectors/hn.js`
- `lib/collectors/v2ex.js`
- `lib/collectors/github-collector.js`
- `lib/collectors/rss.js`
- `lib/collectors/youtube.js`
- `test/collectors.test.js`

Check per collector:

- availability checks
- rate-limit assumptions
- schema normalization
- search quality
- duplicate handling
- broken-result behavior
- hardcoded limits
- optional dependency handling (`yt-dlp`)
- whether any collector is low-value or obsolete

## 22. Local files and file-assisted research

Files:

- `lib/research/fetch.js`
- `lib/research/config.js`
- `lib/research/pipeline.js`
- `test/web-research.test.js`

Check:

- `files` option semantics
- local file parsing limits
- local+web merge behavior
- local code-block extraction
- whether local file evidence is over- or under-weighted

## 23. PDF and article extraction

Files:

- `lib/pdf-extractor.js`
- `lib/article-extractor.js`
- `lib/research/extraction.js`
- related tests in `test/web-research.test.js`

Check:

- extraction quality
- crash safety
- memory/time cost
- native dependency risk
- whether both extractors still pay for themselves

## 24. CLI behavior

Files:

- `lib/cli.js`
- `bin/emet.js`
- `test/cli.test.js`

Check:

- default command behavior
- `doctor`
- `init`
- `fetch`
- error codes
- install/path checks
- whether doctor checks current runtime realities, not deleted ML ones

## 25. MCP server and transport

Files:

- `mcp/server.js`
- `mcp/index.js`
- `mcp/transport.js`
- `mcp/handlers/*`
- `mcp/services/sampling.js`
- `test/mcp-server.test.js`
- `test/mcp-transport.test.js`

Check:

- startup/init behavior
- tool exposure
- resource exposure
- prompt/resource handler correctness
- transport robustness
- whether MCP path behavior matches Pi/CLI runtime semantics

## 26. Pi runtime integration

Files:

- `index.js`
- `lib/emet-runtime.js`
- `extensions/emet.ts`
- `docs/hosts/pi.md`
- `test/web-research.test.js`

Check:

- interceptCall/interceptResult behavior
- skip/recovery logic
- output formatting
- rawPages handling
- whether Pi-specific mutations diverge from base runtime

## 27. Host integration docs/configs

Files:

- `configs/*`
- `docs/hosts/*`
- `README.md`
- `docs/quickstarts.md`
- `docs/examples.md`

Check:

- whether configs are current
- whether every documented host still matches code/schema
- whether examples use removed options/features

## 28. Evaluation harness and case coverage

Files:

- `lib/eval/*`
- `eval/cases/*`
- `test/eval-runner.test.js`

Check:

- what kinds of regressions are actually covered
- which domains have no eval cases
- whether version-sensitive and authority-sensitive cases are enough
- whether community/checkpoint mode is covered in eval or only unit tests

## 29. Test suite quality, blind spots, stale tests

Files:

- all `test/*.test.js`

Check:

- tests that only prove a helper, not user-visible behavior
- stale tests from previous architecture assumptions
- missing tests for current high-risk areas:
  - cache semantics
  - version-sensitive topic fallback
  - rawPages with persistent cache
  - authority requirements + cache reuse
  - dual community flow drift
  - docs/schema/runtime consistency

## 30. Release hygiene and docs drift

Files:

- `CHANGELOG.md`
- `docs/releases/*`
- `README.md`
- `docs/pipeline.md`
- `package.json`
- manifests/plugins/configs

Check:

- commits after tagged release but before next version bump
- stale docs that still mention removed router/ML scripts
- release notes that miss runtime changes
- package version drift vs `HEAD`

## 31. Dead code / obsolete modules / compatibility leftovers

Files to inspect especially:

- `lib/web-research.js`
- `lib/retrieval/community.js`
- `lib/research-session.js`
- `lib/research-contract.js`
- `lib/research-trace.js`
- `lib/research-evidence.js`
- `docs/pipeline.md`

Check:

- old `legacyAction` surface
- `COLLECTOR_*` aliases
- old collector-interactive entrypoints still re-exported only for compatibility
- evidence/trace fields no longer consumed
- docs/scripts mentioning deleted ML/tiny-router paths
- leftover knobs that no longer affect behavior

## 32. Dependency value audit

Files:

- `package.json`
- runtime modules using each dependency

Check each dependency:

- `better-sqlite3`
- `@extractus/article-extractor`
- `pdfjs-dist`
- `@napi-rs/canvas`
- `turndown`
- `@black-knight.dev/pinglet`
- `@mariozechner/pi-ai`
- `typebox`

Questions:

- is it still necessary
- is it runtime-critical or optional
- does it create portability/install pain
- is the code using enough of it to justify the weight

## 33. Security and trust boundaries

Files:

- `SECURITY.md`
- `lib/local-logger.js`
- `lib/research-memory.js`
- `lib/research/fetch.js`
- `mcp/*`
- `index.js`

Check:

- secrets in logs or cache
- uncontrolled remote fetch surface
- shell/process execution safety around collectors/tools
- path handling for local files
- trust assumptions in host integrations

## 34. Performance audit

Files:

- `lib/research/pipeline.js`
- `lib/research/search.js`
- `lib/research/fetch.js`
- `lib/research-memory.js`
- `lib/retrieval/community.js`

Check:

- repeated work across turns
- needless serialization/deserialization
- large payload caching/writing
- parallelism/concurrency correctness
- slow provider fallbacks
- large prompt construction cost
- DB growth and cleanup cost

## 35. Product coherence audit

Cross-cutting question across all files:

- what is emet now, exactly
- which features are core
- which ones are migration baggage
- which ones look clever but do not materially improve grounded research
- what should be deleted vs repaired

## Suggested audit pass order

1. Public contract + version/docs drift
2. End-to-end pipeline map
3. Cache/memory/page store
4. Search/fetch/ranking
5. Policy/authority/version behavior
6. Synthesis/output contracts
7. Community/checkpoint/collectors
8. Evidence/trace/logging
9. CLI/MCP/Pi integration
10. Tests/eval/dead code/dependency cleanup

## Already visible from quick verification

Even before the full audit:

- `package.json` still says `1.4.6` while `HEAD` contains post-`v1.4.6` commits
- `docs/pipeline.md` still mentions removed router audit scripts and `lib/tiny-router.js`
- cache semantics already need dedicated review (`docs/fixes/2026-06-25-cache-semantics-and-compat-leftovers.md`)

This file is the full scope list to drive sub-audits or a whole-repo audit sweep.
