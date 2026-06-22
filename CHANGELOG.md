# Changelog

Pinned: [1.4.5 release notes](docs/releases/1.4.5.md) · [quickstarts](docs/quickstarts.md) · [examples](docs/examples.md) · [contributing](CONTRIBUTING.md)

## Unreleased (master)

- Nothing yet.

---

## 1.4.5

### Pinned release theme
- **Unified checkpointable pipeline + community evidence:** `interactive` is checkpointing, `platforms` is community/media retrieval, and social/community sources are normalized into the shared research evidence path instead of acting as a separate truth pipeline.

### Added
- **Community extraction overlays:** Added `community-sentiment`, `community-complaints`, `feature-requests`, `social-verify`, and `video-transcript` routing overlays for social/media research intents. (`lib/domains/index.js`, `lib/router-policy-context.js`)
- **Community intent policy:** Flow policy now distinguishes sentiment, complaints, feature requests, and verification claims. Verification claims become `mixed` retrieval with authoritative follow-up required. (`lib/research-flow.js`)
- **Social evidence metadata:** Normalized community results now include `evidenceRole`, `platformStability`, `auth`, and `createdAt` signals while remaining non-authoritative by default. (`lib/retrieval/normalize.js`)
- **Checkpoint/community tests:** Added coverage for canonical actions, interactive-without-platforms, normal-pipeline synthesis, community overlays, social metadata, and authority gating. (`test/collector-flow.test.js`, `test/research-flow.test.js`, `test/retrieval-normalize.test.js`, `test/domain-packs.test.js`)
- **Release note shipping:** npm package files now include the whole `docs/releases/` directory, including this release note. (`package.json`, `docs/releases/1.4.5.md`)

### Changed
- **Pipeline semantics:** `interactive: true` alone no longer routes to collector-only mode; explicit `platforms` or platform wording selects community retrieval. (`lib/research/pipeline.js`, `lib/retrieval/community.js`)
- **Canonical result contract:** Normal web research returns `action: "final"` with `legacyAction: "web_research"`; community checkpoints return canonical actions like `search` with `legacyAction` for migration compatibility. (`lib/research/pipeline.js`, `lib/retrieval/community.js`, `lib/emet-runtime.js`, `mcp/handlers/resources.js`)
- **Community synthesis path:** `interactive + action: "synthesize"` now falls back to the normal research pipeline instead of the legacy collector synthesis branch. (`lib/research/pipeline.js`, `lib/retrieval/community.js`)
- **Schema and host guidance:** MCP/Pi schema text and host instructions now describe checkpointed research and community/media retrieval instead of collector-interactive as a separate mode. (`lib/tool-schema.js`, `index.js`, `mcp/hosts/profiles.js`)
- **Stable IDs:** Collector fallback IDs are hash-based instead of turn-local index-only IDs. (`lib/retrieval/normalize.js`)
- **Architecture documentation:** Updated the unified interactive plan to reflect the implemented slice and current facade/module boundaries. (`docs/plans/2026-06-22-unified-interactive-research-plan.md`)
- **Pipeline modularization:** `lib/web-research.js` remains a 27-line pure re-export facade after the Chrome/VS Code-style split into layered modules. Public API remains compatible.

### Fixed
- **Split search module cache constant:** Imported `SEARCH_CACHE_TTL_MS` in `lib/research/search.js`, fixing `SEARCH_CACHE_TTL_MS is not defined` after modularization.

### Upgrade notes
- No database migration is required.
- Public tools remain exactly `emet` and `web_fetch`.
- Existing integrations should prefer canonical `action` and treat `legacyAction` as a migration hint.
- Updating from 1.4.x only requires reinstalling/restarting the MCP/Pi host.

### Verified
- `npm run check` — green locally.
- `npm pack --dry-run` — package builds and includes `docs/releases/`.
- No new dependencies and no new public tools.

---

## 1.4.2

### Pinned release theme
- **Collector-backed interactive mode release:** Agent-steered interactive `emet` mode using the internal collector registry from 1.4.1. Adds schema options (`platforms`, `interactive`, `sessionId`, `action`, `queryOverride`, `selectedResultIds`, `selectedUrls`, `maxResultsPerPlatform`) to both MCP and Pi tool definitions. In-memory bounded sessions with 30min TTL. No new MCP tools, no new dependencies.

### Added
- **Collector interactive mode:** New `shouldRunCollectorInteractive()` and `runCollectorInteractive()` in `lib/web-research.js` that return compact structured results with stable result IDs, `nextActions`, and session state for AI agent steering.
- **Agent steering contract:** Interactive responses include `collectorResults`, `observedGaps`, `nextActions`, `limits` (maxTurns/remainingTurns), and a compact `contentText` summary. The agent can call `search`, `refine` (with `queryOverride`), `fetch` (by `selectedResultIds` or `selectedUrls`), or `synthesize` via the existing `emet` tool — no new MCP tools.
- **Session management:** In-memory `Map` with 30min TTL, 100 session cap, per-session turn tracking. (`lib/web-research.js`)
- **Platform inference:** Conservative `inferQueryPlatforms()` triggers for HN, V2EX, and GitHub (issues/repos/discussions only — not passing mentions). (`lib/web-research.js`)
- **Interactive options schema:** New `platforms`, `interactive`, `sessionId`, `action`, `queryOverride`, `selectedResultIds`, `selectedUrls`, `maxResultsPerPlatform` fields in both MCP (`lib/tool-schema.js`) and Pi (`index.js`) tool schemas.
- **Collector flow tests:** 13 tests covering schema options, platform inference, structured results, session turns, max turns enforcement, and unavailable collector degradation. (`test/collector-flow.test.js`)

### Changed
- **RunWebResearch early branch:** Added a collector interactive check before the full web pipeline. When `shouldRunCollectorInteractive()` returns true, research routes to the collector path instead of DuckDuckGo search. (`lib/web-research.js`)

### Verified
- `npm test` — 241/241 passing (13 new + 228 existing).
- `npm run audit:roadmap` — `allSlicesReady: true`.
- `npm run pack:dry` — dry-run package build succeeds.
- No new dependencies in `package.json`.
- No new MCP tools in `tools/list`.
- All existing tests pass unchanged.

## 1.4.1

### Pinned release theme
- **Internal collector registry release:** Internal no-auth collectors for HN (Algolia), V2EX (public API), GitHub (REST search), RSS/Atom feeds (zero deps), and YouTube (yt-dlp, optional). No new MCP tools, no new dependencies. Visible in `emet doctor`.

### Added
- **Internal collector registry:** New `lib/collectors/` module with lazy Map-based registry, shared `SocialCollector` base class, `fetchWithTimeout` primitive, and unified output schema (`emptyResult()`, `normalizeResult()`). (`lib/collectors/collector.js`, `lib/collectors/index.js`)
- **Hacker News collector:** Algolia API search, no auth, 10k req/h/IP. (`lib/collectors/hn.js`)
- **V2EX collector:** Public v1 `/api/topics/hot.json`, no auth, 120 req/h/IP, client-side filter for search. (`lib/collectors/v2ex.js`)
- **GitHub collector:** Public REST search, no auth (60 req/h), supports repositories/code/issues types. (`lib/collectors/github-collector.js`)
- **RSS/Atom collector:** Zero-dependency regex parser for RSS 2.0 `<item>` and Atom `<entry>` elements. (`lib/collectors/rss.js`)
- **YouTube collector:** `yt-dlp`-based metadata extraction, degrades gracefully when yt-dlp is missing. (`lib/collectors/youtube.js`)
- **Collector doctor:** `runCollectorDoctor()` checks availability of all collectors; YouTube is optional. (`lib/collectors/index.js`)
- **Doctor integration:** `emet doctor` now reports collector availability alongside core checks, with `warn` level for optional collectors. (`lib/cli.js`)
- **Collector tests:** 18 unit tests with mocked `globalThis.fetch` covering registry, HN, V2EX, GitHub, RSS, error handling, timeouts, and YouTube availability. (`test/collectors.test.js`)

### Changed
- **`runDoctor()` output:** Collector checks appended with `ok`/`warn` prefix; `runDoctor()` return shape unchanged. (`lib/cli.js`)
- **Version metadata:** Bumped package, lockfile, MCP server metadata, Claude/Codex plugin manifests, marketplace metadata to `1.4.1`.

### Verified
- `npm test` — 228/228 passing (18 new + 210 existing).
- `node bin/emet.js doctor` — reports all 5 collectors.
- No new dependencies in `package.json`.
- No new MCP tools in `tools/list`.
- All existing tests pass unchanged.

## 1.4.0

### Pinned release theme
- **DX + raw-source release:** `emet doctor`, `emet init`, CLI `emet fetch`, MCP/Pi `web_fetch`, persistent SQLite/FTS5 page storage, and a deliberate two-tool public policy: `emet` + `web_fetch`.

### Added
- **CLI helper surface:** `emet` now supports `doctor`, `init <host> --print|--write`, and `fetch <url> [--json]` while preserving default MCP stdio startup with plain `emet`. (`lib/cli.js`, `bin/emet.js`)
- **Install doctor:** `emet doctor` checks Node runtime, package metadata, MCP binary, Pi extension, packaged model presence, shipped host configs, and persistent page-store stats with actionable output. (`lib/cli.js`, `test/cli.test.js`)
- **Host config generator:** `emet init` can print or write shipped Claude Code, Codex, Cursor, Gemini, and VS Code/Copilot MCP configs. (`lib/cli.js`, `configs/`)
- **Raw URL fetch command:** `emet fetch <url>` exposes the existing resilient fetch/cache pipeline from the CLI for direct source inspection without synthesis. (`lib/cli.js`, `lib/web-research.js`)
- **`web_fetch` agent tool:** MCP and Pi now expose `web_fetch` as the single raw-URL companion to the main `emet` research tool. (`lib/tool-schema.js`, `mcp/handlers/tools.js`, `index.js`)
- **Persistent page store:** The context DB now has a `pages` table, FTS5-backed `pages_fts` index, URL-normalized dedupe, TTL cleanup, access counts, and public helpers for write/read/search/stats. (`lib/research-memory.js`, `test/page-store.test.js`)
- **Cross-session page reuse:** `fetchPageSource()` now consults the persistent page store in addition to the in-memory page cache, and successful page fetches are stored for later raw fetch/research reuse. (`lib/web-research.js`)
- **Pi raw-pages schema:** The Pi `emet` tool schema now includes `options.rawPages`, matching the MCP schema and runtime behavior. (`index.js`, `test/web-research.test.js`)
- **Onboarding docs:** Added 5-minute host quickstarts, copy-paste examples, and a contributor guide. (`docs/quickstarts.md`, `docs/examples.md`, `CONTRIBUTING.md`, `README.md`)
- **Release notes:** Added a dedicated release note draft for this release. (`docs/releases/1.4.0.md`)

### Changed
- **Minimal tool policy:** The social-collector roadmap was consolidated around two public agent tools only: `emet` for research/orchestration and `web_fetch` for known-URL raw text. Planned `emet_search`, `emet_fetch`, `emet_synthesize`, `emet_plan`, `emet_continue`, and `emet_status` tool sprawl was explicitly rejected in the GitHub issue split.
- **Package contents:** `CONTRIBUTING.md`, `docs/quickstarts.md`, and `docs/examples.md` are now included in the npm package files list. (`package.json`, `test/package-manifest.test.js`)
- **GitHub backlog:** Issue #17 was rewritten and closed as a superseded epic; focused follow-ups were created/updated as #18, #19, and #22, with #20 and #21 closed into #19 to keep the public tool surface small.
- **Version metadata:** Bumped package, lockfile, MCP server metadata, Claude/Codex plugin manifests, marketplace metadata, and plugin runtime installer version to `1.4.0`.

### Verified
- `npm test` — 210/210 passing.
- `npm run audit:roadmap` — `allSlicesReady: true`.
- `npm run pack:dry` — dry-run package build succeeds.
- `node bin/emet.js doctor` — local install checks pass.

## 1.3.5

### Added
- **Topic-based cache key (`emet:v2`):** New `normalizeResearchTopic()` strips years, versions, `site:` prefixes, GitHub paths, and URLs before hashing. Cache writes go to both the exact key (`emet:v1`) and the topic key (`emet:v2`). On read, topic key is tried as fallback after exact miss. Analyzed data shows ~93% of daily queries share a topic with a cached entry, turning 0% → ~93% cache hit rate for repeat topics. (`lib/research-memory.js`, `lib/web-research.js`)

### Fixed
- **pdfjs-dist v6 `standardFontDataUrl` parameter:** `lib/pdf-extractor.js` now passes resolved `file://` URLs for `standardFontDataUrl` and `cMapUrl` to `pdfjs.getDocument()`, plus `useWorkerFetch: false`. Fixes `Warning: UnknownErrorException: Ensure that the standardFontDataUrl API parameter is provided.` during PDF extraction in academic, code, and deep modes.

## 1.3.4

### Fixed
- **PDF Buffer → Uint8Array conversion:** `lib/pdf-extractor.js` now converts Node.js `Buffer` to `Uint8Array` before passing to `pdfjs-dist` v6, which no longer accepts `Buffer` objects. Fixes `"Please provide binary data as Uint8Array, rather than Buffer"` error during PDF text extraction in academic, code, and deep research modes.

## 1.3.3

### Fixed
- **MCP import path:** Fixed incorrect import path in `mcp/handlers/tools.js`.
- **Tiny router tests:** Fixed test stability issues in `test/tiny-router.test.js`.

### Changed
- **Promotion gates:** Updated metrics and thresholds in `metrics/router/promotion-gates.json`.
- **Audit roadmap:** Refreshed implementation roadmap timestamps.

## 1.3.2

### Added
- **Tiny router auto-activation:** `lib/tiny-router.js` now auto-enables `domain` and `preflight` tasks when `ml/models/domain/model.joblib`, `ml/models/preflight/model.joblib`, and `.venv-router/bin/python` are present. Set `EMET_TINY_ROUTER=0` to force off.
- **Structured research logging:** Stable `outcome`/`reason` fields plus `retryCount`, `provider`, `statusCode`, `latencyMs`, `sourceCount`, `fallbackUsed`, and `fallback` metadata across all fetch, search, synthesis, and research events. New `fetchFailureReason()`, `contentFailureReason()`, `isTransientStatus()`, and `isRetryableFetchError()` helpers.
- **Daily log files with size rollover:** Research logs default to context-aware OS/Pi paths and daily JSONL files (`emet-YYYY-MM-DD.jsonl`) instead of an unbounded `~/.pi/logs/emet.jsonl`. Active file rolls over at `EMET_LOG_MAX_BYTES` (default 50 MiB). Logger degradation is counted and reported once.
- **Log maintenance script:** `scripts/maintenance/rotate-emet-logs.mjs` compresses older JSONL with gzip.

### Changed
- **Retry hardening in `fetchTextWithRetry()`:** Retries only transient failures (timeout, 408, 429, 500, 502, 503, 504). Does not retry 400/401/403/404. Uses exponential backoff + jitter. Respects request latency budget.
- **Search provider instrumentation:** `searchDuckDuckGo()` logs per-provider fallthrough, raw/post-filter/final counts, and provider order. Cache hits logged as `search_results_summary`.
- **Router daemon ref-counting:** Tiny-router daemon unrefs its child-process streams when idle and refs them during active requests, so test/CLI processes exit promptly.
- **Reduced fallback noise:** When tiny-router is unavailable, emits one `tiny_router_setup` event per session instead of repeated fallback spam.

### Fixed
- **PDF.js runtime dependency shipping:** Added `@napi-rs/canvas` as a direct runtime dependency so published npm installs also pull the Node canvas runtime that `pdfjs-dist` expects for `DOMMatrix`/`ImageData`.
- **PDF extraction fallback:** `lib/pdf-extractor.js` now preloads canvas support before importing `pdfjs-dist` and degrades gracefully when native canvas support is unavailable, instead of crashing with `DOMMatrix is not defined`.

## 1.3.1

### Fixed
- **Unhandled Promise Rejection in Article Extraction (Crash):** `extractArticle()` in `lib/article-extractor.js` called async `extractFromHtml()` without `await`, causing unhandled promise rejections to crash the process when `linkedom`'s `DOMParser` returned a document without `documentElement` (empty/whitespace-only/plain-text HTML). Made `extractArticle` and `extractPageSnapshot` async with proper `await` chains so the error is caught gracefully and falls back to regex extraction.

## 1.3.0

### Removed
- **Scrapling Integration (343MB):** Removed the Python Scrapling daemon (`.venv-scrapling/` + `Scrapling/`, ~350 lines of Python). Page quality assessment utilities are preserved; blocked/dynamic pages now fall through to Jina Reader directly. Eliminates Python dependency, 5 failure modes, and 343MB of disk usage.

### Added
- **SQLite Research Cache (`emet-context.db`):** Replaced the single `research-cache.json` file with a `better-sqlite3` backed SQLite database (WAL mode, FTS5-ready schema). Automatic one-shot migration from old JSON cache. Slim cache entries: `runtimeTrace`, `contentText`, and `pageTexts` are stripped before writing, eliminating ~98% cache bloat.
- **Context-Aware Cache Path:** Pi extensions store cache in `~/.pi/agent/lazy-modules/emet/.cache/`, standalone users get XDG-compatible paths (`~/Library/Caches/emet/` on macOS, `~/.cache/emet/` on Linux). Overridable via `EMET_CONTEXT_PATH`.
- **Article Extraction:** Integrated `@extractus/article-extractor` for semantic content extraction from HTML pages, with `turndown` for HTML-to-Markdown conversion. Falls back to regex-based extraction when article extraction fails.
- **PDF Text Extraction:** Added `pdfjs-dist` integration for extracting full text from PDF documents in academic, code, and deep research modes.
- **Full Page Text in Response (`options.rawPages`):** New `rawPages: true` option on the emet tool. When set, the response includes a `pageTexts` array with the full raw text of each fetched page (not truncated to 4k/8k chars). Works in all modes (`fast`, `deep`, `code`, `academic`).
- **`fullText` in Page Cache:** `pageFromText()` now stores both `text` (truncated for synthesis) and `fullText` (complete page) in the page cache, reducing re-fetches.
- **`webFetch()` export:** New exported function in `lib/web-research.js` for fetching a single URL with effectively unlimited page text limit.
- **User-Agent Rotation:** Three rotating User-Agent strings per request to reduce blocking.
- **Domain-Specific Timeouts:** `arxiv.org` (15s), `github.com` (5s) for faster failover.
- **Cache Size Limits:** In-memory caches capped at 200 (search) and 100 (pages), preventing unbounded memory growth.
- **JSON Safety Helpers:** `safeJsonStringify` and `safeJsonParse` wrappers prevent crashes from circular or non-serializable values.

### Fixed
- **evaluateSufficiency Claims Gap (High):** `detectCoverageGaps()` now falls back to source-authoritative check when no claims are passed (73/201 cached queries affected).
- **Synthesis Fallback Boilerplate (High):** `fallbackSynthesis()` now extracts real page content instead of returning a generic template.
- **Mode Routing Agent Override (High):** `runWebResearch()` upgrades `fast` to `academic`/`deep`/`versioned` when the query demands it.
- **Options Propagation in Mode Override:** Fixed `isolate`, `files`, and other option fields being lost during mode-override config reconstruction.
- **Infinite Recursion in Cache Migration:** Fixed `migrateFromJsonIfNeeded` calling `getDb()` before DB initialization (stack overflow on first access).
- **Duplicate `stripTags`:** Centralized HTML tag stripping into `lib/article-extractor.js`.
- **Plugin Manifest Versions:** Aligned `.claude-plugin`, `.codex-plugin`, and `plugins/emet/.codex-plugin` manifests to package version.

### Changed
- **Cache Key Format:** New `emet:v1:` prefix with stable config fields. Old cache entries from JSON migration are preserved but naturally expire.
- **Tool Schema Default:** Added `default: "fast"` and improved description for the `mode` field.

## 1.2.0

### Added
- **Plan Archive Cleanup:** Moved completed plans into `docs/archive/plans/`, removed the duplicate uploaded Superrouter plan copy, and documented the archive rules.
- **Scrapling Integration Notes:** Documented the active Scrapling fallback path and restored the missing submodule declaration for the local checkout.
- **Pipeline Check Scripts:** Added npm scripts for roadmap gates, promotion gates, package dry-runs, and a standard non-promotion `check` pipeline.
- **Structured Router Scripts:** Split router pipeline scripts into `audit/`, `export/`, `review/`, `train/`, `eval/`, `tools/`, `deploy/`, and `utils/` groups with compatibility shims at the old paths.
- **Research Trace Service:** Extracted trace snapshot, hashing, version-signal, and source-summary helpers from `lib/web-research.js` into `lib/research-trace.js`.
- **Review Utility Service:** Extracted shared Pi-review JSON parsing, retry, queue, stable ID, and JSONL append helpers into `scripts/router/review/review-utils.mjs`.
- **Canonical CLI Bins:** Pointed npm `bin` aliases at the canonical `bin/` entrypoints while keeping root shims for compatibility.
- **Package Lock Metadata:** Aligned `package-lock.json` root package names with the scoped npm package name.
- **Dependency Ranges:** Replaced wildcard runtime/peer dependency ranges with current compatible semver ranges.
- **Model Artifact Cleanup:** Removed the redundant `ml/models/domain-lr` package artifact and kept promoted packaged router artifacts to domain, preflight, follow-up, conflict, and sufficiency.
- **Release Metadata:** Prepared the accumulated unreleased Superrouter, pipeline, archive, and packaging cleanup work as version `1.2.0`.
- **Phase 12 Roadmap Audit:** Added `scripts/router/audit/audit-implementation-roadmap.mjs` to verify that each Superrouter roadmap slice has concrete artifacts, reports, and rollback evidence before further rollout.
- **Phase 8 Research Policy Baseline:** Added a unified next-action policy baseline that chooses stop/fetch/conflict/clarification/routing-control actions from explicit evidence-state features instead of separate one-off follow-up rules.
- **Policy Eval Script:** Added `scripts/router/eval/eval_research_policy_baseline.mjs` for evaluating labeled research-policy rows against the baseline action picker.
- **Phase 11 Promotion Gate Audit:** Added `scripts/router/audit/audit-promotion-gates.mjs` to fail closed on missing eval sets, missing rollback hooks, unsafe metrics, missing artifacts, or missing promotion evidence.
- **Preflight Superrouter Bundle:** Added a new shared pre-query multi-head model (`ml/router/preflight.py`, `ml/router/train_preflight_router.py`) that predicts `domain`, `query_shape`, `answer_shape`, `source_family`, `recency_need`, and `ambiguity` from a single query encoder.
- **Preflight Runtime Path:** Added daemon and tiny-router support for an opt-in `preflight` task so one model call can provide both domain and query-understanding signals.
- **Preflight Metrics Output:** Added `metrics/router/preflight-superrouter.json` as the training/eval report for the new preflight bundle.
- **Packaged Preflight Artifact:** Added `ml/models/preflight/` as the single packaged pre-query bundle for domain plus query-understanding signals.

### Changed
- **Runtime Policy Routing:** Updated `runWebResearch()` to record `turn.policy`, apply policy controls through `activeConfig`, and centralize follow-up planning behind the unified policy layer while keeping legacy follow-up as a shadow signal.
- **Preflight-First Query Routing:** Updated `runWebResearch()` and `resolveQuestionDomain()` so `EMET_TINY_ROUTER_PREFLIGHT=1` uses the new preflight bundle first, while keeping heuristic fallback and guardrail vetoes intact.
- **Best-Practice Multi-Task Training:** Trained the new preflight bundle from reviewed experiment labels and emet query-understanding rows with separate heads, confidence thresholds, abstain behavior, deduping, and class-imbalance handling instead of collapsing everything into one giant label space.
- **Training Runbook:** Extended `ml/router/README.md` with the Phase 3.5 preflight-superrouter workflow, rollout guidance, and safety constraints.
- **Phase Plan Docs:** Refreshed the Phase 8 and Phase 11 plan notes with the implemented runtime, evaluation, and rollout details.

### Fixed
- **Promotion Gate Pathing:** Corrected the Phase 11 audit so query-understanding metrics resolve from the real training output path.
- **Preflight Data Hygiene:** Prevented non-domain legacy example rows from leaking into preflight domain training and capped overrepresented domain labels to reduce `web` dominance.
- **Package Hygiene:** Excluded Python `__pycache__` and `*.pyc` artifacts from npm package dry-runs.
- **Promotion Gate Robustness:** Tightened rollback detection so a generic `return null` no longer counts as an explicit rules fallback.
- **Auditable Policy Traces:** Narrowed policy trace summaries to the fields that should be recorded and kept version-controlled runtime metadata aligned across repo manifests.

## 1.1.7

### Added
- **Phase 7 Evidence-Aware Router:** Added sufficiency, conflict, and follow-up routing models that operate on family/overlay/source-policy aware evidence state instead of flat domain labels.
- **Shared Routing Context Service:** Added `lib/router-policy-context.js` to centralize routing families, overlays, policy flags, and risk markers for feature extraction and runtime decisioning.
- **Selective Training Metrics:** Added selective coverage, abstention, and high-risk false-sufficient promotion reporting to structured model training outputs.

### Changed
- **Runtime Evidence Context:** Updated research traces, source metadata, and follow-up planning to preserve domain family, overlays, source-policy flags, and query-understanding signals end to end.
- **Structured Review Labels:** Centralized review label sets and expanded them to include `resolved_by_version`, `open_conflict`, `need_primary_source`, `need_conflict_resolution`, and `ask_clarifying_question`.
- **Structured Model Training:** Updated conflict and sufficiency structured training to use stricter confidence thresholds on high-risk evidence and to evaluate models with selective abstention metrics.
- **Phase Plan Docs:** Refreshed the Superrouter Phase 7 plan to reflect the implemented evidence-aware training and promotion approach.
- **Package Metadata:** Bumped package, lockfile, server registry, and MCP metadata to `1.1.7`.

### Fixed
- **Backward-Compatible Inference:** Kept runtime inference compatible with previously promoted structured models while the new feature space rolls out.
- **Evidence-Aware Follow-Up:** Prevented follow-up and sufficiency decisions from collapsing back to flat-domain-only heuristics.
- **Metadata Consistency:** Aligned version metadata across `package.json`, `package-lock.json`, and `server.json`.

## 1.1.6

### Added
- **Evidence Graph and Claim State:** Added serializable per-turn evidence state with explicit nodes and edges for queries, sources, claims, versions, publishers/domains, and actions/turns.
- **Evidence Replay Utility:** Added `scripts/router/replay-evidence-trace.mjs` to replay runtime traces or JSONL logs into compact evidence-state summaries.
- **Regression Coverage:** Added tests for evidence schema serialization, trace replay, and runtime trace evidence-state wiring.

### Changed
- **Runtime Trace Provenance:** `runWebResearch()` now attaches evidence state to turn traces and final traces so sufficiency, conflict, and follow-up decisions can be replayed deterministically.
- **Structured Source Context:** Source serialization now preserves family, overlays, source-policy flags, authority/quality/version scores, and text hashes for downstream graph building.
- **Source Feature Compatibility:** Structured feature extraction now accepts `text_sample` from serialized source snapshots.
- **Service-Layer Cleanup:** Extracted reusable evidence-state builders into `lib/research-evidence.js` so the main research loop keeps policy decisions separate from serialization mechanics.
- **Package Metadata:** Bumped package, lockfile, and MCP registry metadata to `1.1.6`.

## 1.1.5

### Added
- **Phase 4 Family + Overlay Router:** Added a stable routing architecture built around domain families (`web`, `developer-docs`, `academic`, `regulated`, `current-events`, `commerce`, `community`, `local-government`) plus composable overlays such as `security`, `github`, `changelog`, `shopify`, `official-only`, `recency-required`, and `version-sensitive`.
- **Manual Routing Controls:** Added optional `domainHint`, `familyHint`, `overlays`, `sourcePolicy`, and `forceDomain` tool options so expert users and host agents can guide retrieval policy without breaking automatic routing.
- **Compatibility Guards:** Added runtime support that keeps legacy flat pack names working as aliases while preserving family/overlay structure internally and protecting heuristic-only domains until the tiny-router model is retrained.
- **Phase Plan Alignment:** Updated Superrouter feature-plan docs for Phases 4–12 so later work now targets family/overlay/source-policy controls instead of flat pack sprawl.
- **Regression Coverage:** Added tests for family/overlay routing, manual hint composition, forced domain overrides, and family-aware research config behavior.

### Changed
- **Domain Resolution Service Layer:** Centralized family/overlay selection in `lib/domains/index.js` so auto routing, hints, forced overrides, and policy composition share one implementation.
- **Research Runtime Config:** `runWebResearch()` and `getResearchConfig()` now carry `domainFamily`, `overlays`, and `sourcePolicy` through runtime config, traces, and cache keys.
- **Source Policy Heuristics:** Expanded follow-up queries, authority rules, and protected-domain handling to work with the new family/overlay architecture while keeping safety-first fallbacks.
- **Domain Evaluation Assets:** Refreshed the gold domain draft set and baseline metrics for the expanded taxonomy; high-risk downgrades to `web` remain zero on the heuristic baseline.
- **Package Metadata:** Bumped package/server metadata to `1.1.5` and refreshed README messaging around routing architecture and current test coverage.

## 1.1.4

### Added
- **Query-Understanding Heuristics:** Added `lib/query-understanding.js` to classify query shape, answer shape, source family, recency need, and ambiguity with conservative heuristic fallback.
- **Query-Understanding Training Pipeline:** Added Phase 3 multi-head training code and daemon support for optional tiny-router inference (`ml/router/query_understanding.py`, `ml/router/train_query_understanding.py`, `ml/router/daemon.py`, `ml/router/features.py`).
- **Query-Understanding Datasets:** Added a weak-label export and a hand-labeled holdout set for Phase 3 evaluation (`scripts/router/export_query_understanding_examples.mjs`, `data/router/query-understanding-weak.jsonl`, `data/router/query-understanding-holdout.jsonl`).
- **Regression Coverage:** Added focused tests for heuristic classification, planner feature merging, runtime trace output, and tiny-router config behavior (`test/query-understanding.test.js`, updated runtime tests).

### Changed
- **Planner Features:** Query-understanding now feeds recency, query hints, and search breadth into research planning as non-veto features with heuristic fallback.
- **Runtime Trace Metadata:** `runWebResearch` now records query-understanding decisions in result metadata and runtime traces for future evaluation and promotion gates.
- **Training Runbook:** Extended `ml/router/README.md` with a dedicated Phase 3 training flow and planner-only rollout guidance.

## 1.1.3

### Added
- **Canonical Training Schema:** Added a unified, versioned JSON schema and JS validation layer for all router machine learning examples (`docs/schemas/router-training-row.schema.json`, `lib/router-training-schema.js`).
- **Data Governance Audit:** Added `scripts/router/audit-data-governance.mjs` to validate Phase 2 governance rules (split separation, valid schemas, review thresholds, privacy opt-ins).
- **Review Provenance Service:** Extracted a shared `summarizeReviewProvenance` service to reliably parse review quality and confidence across pipeline stages.

### Changed
- **Training Readiness Gate:** Upgraded the training-readiness audit script to block candidate promotion when data lacks minimum confidence, provenance, or requires human review.
- **Documentation Updates:** Marked Superrouter Phase 2 (Data Governance, Schemas, and Labels) as completed in the feature plans.

## 1.1.2

### Added
- **Safety Foundations:** Added `lib/research-guardrails.js` to enforce non-negotiable safety rules for high-risk queries (security, medical, legal, finance, privacy).
- **Minimum Evidence Requirements:** Automatically raised runtime config requirements (minimum sources, authoritative source requirements) based on detected guardrail flags.
- **Trace Boundaries:** Emitted `guardrail_decision` events and included `guardrail_flags` and `guardrails` state in the final runtime trace to support future ML policy phases.

### Changed
- **Domain Router Veto:** Prevented the Tiny-Router ML models from downgrading protected domains (`security`, `papers`, `specs`, `changelog`) or authority-required queries to the generic `web` domain.
- **Fast Mode Safeguards:** Refactored fast-mode source reduction logic out of `lib/web-research.js` into the guardrails layer, blocking single-source shortcuts when high-risk or authority requirements are present.
- **Documentation Updates:** Marked Superrouter Phase 0 (current state) and Phase 1 (safety foundations) as completed in the feature plans.

## 1.1.1

### Added
- **MCP Registry Manifest:** Added `server.json` for registry discovery and package publishing.
- **Pi Preview Metadata:** Added gallery preview metadata to improve Pi discoverability.
- **Discoverability Keywords:** Expanded plugin/package keywords for wider host and marketplace reach.

### Changed
- **README Positioning:** Refined the intro and use-case framing around autonomous grounding.
- **Metadata Alignment:** Tightened package, marketplace, and host metadata to emphasize cited answers and current-doc lookup.
- **Version Consistency:** Aligned package and bootstrap version references across the repo.

### Fixed
- **Publish Consistency:** Normalized package bin paths and release metadata for cleaner packaging.

## 1.1.0

### Added
- **Modular MCP Server Structure:** Split the MCP server into `mcp/index.js`, `mcp/server.js`, `mcp/transport.js`, modular handlers, and dedicated services to avoid a monolithic server.
- **Shared Agentic Runtime:** Added `lib/emet-runtime.js` as a shared runtime layer for duplicate-query skipping, fast recovery, state tracking, and response compaction across Pi and MCP.
- **Shared Tool Schema:** Added `lib/tool-schema.js` as a single source of truth for the `emet` tool definition.
- **MCP Native Primitives:** Added `prompts/list`, `prompts/get`, `resources/list`, and `resources/read` support.
- **MCP Host Profile Layer:** Added modular host profiles for Claude Code, Cursor, VS Code/GitHub Copilot, Codex, Gemini, and generic MCP clients, with host-specific instructions, tool metadata, prompts, and profile resources.
- **Host Config Examples:** Added publishable `configs/` examples and README install snippets for Claude Code, Cursor, VS Code/Copilot, Codex, and Gemini CLI.
- **Plugin Manifests:** Added publishable Claude Code and Codex plugin manifest files for host-native packaging and validation flows.
- **MCP Sampling Integration:** Added a sampling service that proxies MCP client sampling into the research engine via a virtual `ctx.completeResearch` adapter with graceful fallback.
- **Regression Coverage:** Added/updated MCP tests for initialize, tools/list, tools/call, and sampling behavior.

### Changed
- **Pi/MCP Parity:** Updated both the Pi extension and MCP server to share the same research lifecycle, mode selection, and compaction behavior.
- **Tool Execution Flow:** Routed MCP tool calls through the shared runtime so MCP now uses the same skip/fallback/recovery mechanics as Pi.
- **Prompt/Resource Exposure:** Exposed research workflows and cached resource access as first-class MCP protocol surfaces.
- **MCP Entrypoint Compatibility:** Kept `mcp/server.js` directly executable while moving public exports through `mcp/index.js`.
- **Claude Code Transport Compatibility:** Updated stdio transport to support both Content-Length framing and Claude Code's JSON-line MCP framing.
- **Documentation:** Updated the MCP architecture plan to reflect the non-monolithic structure and completed implementation checkpoints.

### Fixed
- **Monolithic MCP Server:** Removed the old single-file MCP server pattern and replaced it with isolated modules and service boundaries.
- **Sampling Fallbacks:** Ensured unsupported or rejected sampling requests degrade cleanly into deterministic local heuristics.

## 1.0.6 (Hotfix)

### Added
- **Version Context Layer:** Added a shared `lib/version-context.js` service that extracts pinned versions, deprecation intent, migration intent, and version/source match signals from queries and sources.
- **Version-Aware Runtime Metadata:** Added `versionContext`, `versionCoverage`, and per-source `versionSignals` to research results, runtime traces, and dataset export paths so future ML work can train on real version-sensitive retrieval behavior.
- **Regression Coverage:** Added focused tests for pinned-version query planning, version-aware ranking, runtime trace coverage, and downstream export/audit utilities.

### Changed
- **Version-Sensitive Query Planning:** Changed fast/deep query builders and follow-up query generation to preserve pinned versions and prefer changelogs, release notes, migration guides, and breaking-change pages over generic latest-docs lookups.
- **Version-Aware Source Ranking:** Changed search/page/source scoring so exact version matches and release-history style pages rank above mismatched current-version pages for deprecated endpoint queries.
- **Structured Feature Exports:** Changed structured router/export utilities to carry version-sensitive flags and coverage summaries alongside existing authority/conflict metadata.

### Fixed
- **Pinned Version Drift:** Fixed retrieval planning that previously rewrote explicit version queries into current-year lookups, causing wrong-source selection for deprecated endpoints.
- **Deprecated Endpoint Grounding:** Fixed ranking and synthesis so deprecated-version questions now stay anchored to the referenced version instead of silently drifting to latest documentation.
- **Dataset Logging Gaps:** Fixed cache/log/export pipelines so version-specific evidence is now preserved for later audit and ML retraining.

## 1.0.5 (Hotfix)

### Added
- **Runtime Trace in Cached Results:** Added a detailed `runtimeTrace` payload to cached research results, including per-turn search queries, ranked search results, fetched page snapshots, conflict/sufficiency decisions, follow-up actions, final synthesis metadata, and run provenance such as `runId`, `createdAt`, `cacheKey`, and `queryHash`.
- **Canonical Research Freshness Helpers:** Added shared freshness normalization helpers so raw dates, legacy freshness values, and canonical freshness buckets are now interpreted through one consistent path.
- **Shared Source Meta Service Layer:** Added shared source metadata helpers for `has_authority`, `has_forum`, `has_news`, `has_recent`, and `source_count` so runtime logic and dataset/log export paths use the exact same rules.
- **Regression Coverage:** Added focused tests for runtime trace persistence, freshness normalization, log-derived follow-up metadata, and canonical news-source detection.

### Changed
- **Cache Payload Schema:** Expanded the runtime cache payload to preserve full research traces instead of only the compact end result, making cached runs directly usable for later training and inspection workflows.
- **Freshness Serialization:** Changed cached and synthesized source freshness values to canonical buckets (`today`, `this_week`, `this_year`, `older`, `unknown`) instead of leaking raw date strings into downstream consumers.
- **News Source Classification:** Changed source typing so news-like URLs are now recognized canonically as `news`, and updated allowed source type profiles so these sources are not filtered out accidentally.
- **Unified Follow-Up Inputs:** Changed both runtime follow-up routing and log-derived follow-up dataset generation to reuse the same shared source-meta logic.

### Fixed
- **Broken Recency Signal (`has_recent`):** Fixed a mismatch where runtime and log-derived follow-up inputs still checked legacy freshness values like `recent` and `current_year`, causing recent sources to be missed even when publish dates were present.
- **Inconsistent News Detection:** Fixed divergence where some code paths expected `sourceType === "news"` even though source classification did not reliably emit `news`, leading to inconsistent `has_news` signals across runtime, logs, and evaluations.
- **Structured Cache/Log Consistency:** Fixed inconsistencies between runtime cache records, trace snapshots, and follow-up export utilities so all three now observe the same source freshness and source-meta behavior.

### Removed
- **Legacy Freshness Assumptions:** Removed the remaining runtime dependence on old `recent` / `current_year` freshness checks in follow-up metadata generation.

## Legacy History (Old Tool / Pre-Migration Version Line)

The entries below are preserved from the older version line before the current scoped `@black-knight.dev/emet` release sequence.

## 1.4.1 (Hotfix)

- **Fixed Bundle Configuration:** Added `ml` directory to `package.json` files array to ensure the Python daemon scripts and local ML models (`.joblib`) are correctly included in the npm published tarball. This ensures the zero-setup architecture functions securely out of the box after fresh installations.

## 1.4.0 (The Agentic Router Update)

This major release transforms `emet` from a heuristic-based fetching tool into a blazing-fast, machine-learning-driven research engine explicitly optimized for autonomous AI coding agents. 

By replacing the heavyweight BitNet JSON-planner with the new **Hybrid Tiny-Router Architecture**, agents can now perform hallucination-free, high-quality research with sub-millisecond routing latency—requiring absolute zero setup.

### Added
- **The Tiny-Router (Hybrid Architecture):** Introduced a heavily optimized Node.js-to-Python IPC daemon (`daemon.py`) using `spawn` and line-delimited JSON-RPC 2.0. This handles machine learning tasks via Model2Vec and lightweight ML classifiers without exhausting system resources.
- **Structured ML Capabilities:** Added deterministic "Structured Features" extraction (like `has_authority`, `conflict_state`, `source_count`) for conflict and sufficiency tasks. The router evaluates these features using ultra-fast Logistic Regression, achieving **100% accuracy on unseen Follow-Up task evaluations**.
- **Remote Deploy & Evaluation Scripts:** Added `deploy-server-runtime.sh`, `eval_domain_unknown.py`, and the unyielding `eval_unseen_hard.js` dataset to continuously stress-test the model's accuracy.

### Changed
- **Lightning-Fast Domain Routing:** Replaced slow generative LLM routing with a Model2Vec + SVC classifier.
  - *Performance:* p95 latency is **< 0.6 ms** per query.
  - *Accuracy:* Achieved 0% high-risk downgrades. Security and Paper queries are strictly protected and never downgraded to generic "web" searches.
- **Centralized Retrieval Policy:** Extracted and unified duplicated Blocked/Placeholder detection regexes (`PLACEHOLDER_PATTERNS`) from the ML feature extractor into the core `research-policy.js` to ensure models and heuristics share the exact same rules.
- **Query Planning Engine:** The planning loop is now purely deterministic and heavily leverages the tiny-router hooks instead of generative JSON planning.

### Fixed
- **Follow-Up Search Deadlock:** Hardened `lib/web-research.js` to strictly enforce the Tiny-Router's `stop` decisions. If the model determines that no further sources are needed, the agent gracefully finishes the fetch rounds instead of being overridden by legacy heuristics.
- **High-Risk Veto Power:** Fixed premature loop termination for high-risk domains. The Sufficiency Model now acts as a strict gatekeeper. If a security query only finds blog posts, the model vetos completion and forces a `need_authority` follow-up round to fetch official NIST/CVE data.

### Removed
- **BitNet Deprecation:** Completely removed the legacy BitNet/local-SLM JSON planner dependencies (`lib/local-slm.js`, `lib/local-slm-setup.js`), test files, and CLI commands. `emet` is now lighter, more stable, and entirely zero-setup out of the box.

## 1.3.1

### Fixed
- npm `bin` metadata now points to `bin/emet.js` and `bin/emet-mcp.js` so publish no longer warns and strips invalid entries.
- CLI wrapper files are now aligned with npm publish expectations for the next release.

## 1.3.0

### Added
- Retrieval policy document at `docs/policies/emet-retrieval-policy.md` to freeze authority, weak-page, and follow-up rules.
- `lib/research-policy.js` with shared authority matrix, weak/blocked thresholds, and deterministic follow-up query builders.
- Regression tests for blocked placeholders, vendor research authority, ResearchGate handling, and search-oriented follow-up queries.
- Deterministic eval cases for weak-page detection, follow-up behavior, and authority checks across `web`, `github`, `security`, and `papers`.

### Changed
- Follow-up queries now stay search-oriented and stop using meta-question phrasing like `Which authoritative source...`.
- Vendor research hosts such as `research.ibm.com` and `research.google` are now classified above generic `other` pages for relevant technical queries.
- Eval runner now reports behavior-based check coverage instead of only counting domain labels.
- Agent-start analytics now log prompt length instead of the full system prompt body.

### Fixed
- Repeated zero-result follow-up loops are now cut short instead of wasting turns on the same dead-end query shape.
- Blocked placeholders such as `Access denied`, `Temporarily Unavailable`, and Cloudflare challenge pages are filtered earlier and no longer treated like normal evidence.
- Unsupported content types such as PDFs now try a targeted fallback path before being dropped as unreadable.
- Cached blocked/placeholder pages are revalidated before reuse.

## 1.2.1

### Added
- Root-level CLI wrappers `emet.js` and `emet-mcp.js` for npm-publish-safe bin targets.
- README install examples for `npm i emet`, MCP-only usage, and global CLI usage.
- Tests covering MCP initialize/list/call, package bin aliases, and shim re-export behavior.

### Changed
- Package metadata now exposes both CLI entry points via `bin`.
- README now documents `npm i emet`, `node ./mcp/server.js`, `npm run --silent mcp`, and `npx -y emet`.
- Public tool name stays `emet` for both the Pi extension and the MCP server.
- MCP server branding stays `emet-mcp` while the shared engine remains in `emet`.

### Fixed
- Global npm bin execution works correctly with publish-safe wrapper entrypoints.
- npm install / global bin flow was verified in an isolated packed install.
- npm publish no longer strips the CLI bin targets.

## 1.1.2

### Added
- MCP stdio server at `mcp/server.js` with CLI aliases `emet` and `emet-mcp`.
- Root-level `mcp-server.js` compatibility shim for older local configs.
- README install examples for Pi extension, MCP-only usage, and global CLI usage.
- Tests covering MCP initialize/list/call, package bin aliases, and shim re-export behavior.

### Changed
- Public tool name stays `emet` for both the Pi extension and the MCP server.
- MCP server branding is `emet-mcp` while the shared engine remains in `emet`.
- Package metadata now exposes both CLI entry points via `bin`.
- README now documents `node ./mcp/server.js`, `npm run --silent mcp`, and `npx -y emet`.

### Fixed
- Global npm bin execution now works correctly with symlinked entrypoints.
- npm install / global bin flow was verified in an isolated packed install.

## 1.1.1

### Added
- Scrapling-backed page fetch fallback with `AsyncFetcher`, `DynamicFetcher`, and `StealthyFetcher`.
- Internal page fetch adapter with heuristic escalation for blocked, thin, JS-heavy, and anti-bot pages.
- Benchmark assessment note for BrowseComp and FreshQA pilot runs.

### Changed
- `emet` tool metadata was refreshed for agent routing.
- Tool guidance now emphasizes current facts, docs, best practices, comparisons, and verification.
- Fetch heuristics were tuned to avoid false positives on normal GitHub pages.
- `web-research` now keeps the fast HTTP path first and escalates only when needed.

## Legacy 1.1.0

### Added
- Domain packs now drive routing and source controls for web, github, security, papers, specs, changelog, forums, package-registry, and vendor-status.
- Output formatting now supports `markdown`, `json`, `table`, and `latex`.
- Community pack starter example at `lib/domains/template.js`.
- README guidance for custom domain packs.
- QA report for the universal research layer review.

### Changed
- Intent routing tightened for changelog and vendor-status queries.
- Domain packs now bias search queries and source controls toward domain-specific sources.
- Security, vendor-status, package-registry, forums, papers, specs, and changelog packs now prefer authoritative sources.
- `requireAuthoritative` now affects runtime sufficiency checks.
- `format` now affects tool output rendering.

## 1.0.2

### Added
- MIT license.
- Changelog file.

### Changed
- README now notes the MIT license.

## 1.0.1

### Changed
- Package metadata and install details were updated.

## 1.0.0

### Added
- Standalone `emet` package for Pi.
- Install support via `pi install npm:emet`.
- Research modes: `fast`, `deep`, `code`, `academic`.
- Source scoring, citations, confidence, follow-up suggestions, and code block extraction.
- English README and public GitHub repo.

### Notes
- The tool name is `emet`.
- The internal research action remains `web_research`.
