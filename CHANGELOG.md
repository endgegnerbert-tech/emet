# Changelog

## 1.2.6

### Added
- **Full Page Text in Response (`options.rawPages`):** New `rawPages: true` option on the emet tool. When set, the response includes a `pageTexts` array with the full raw text of each fetched page (not truncated to 4k/8k chars). Agents no longer need `browser_harness`, `curl`, or custom fetch to inspect full page content. Works in all modes (`fast`, `deep`, `code`, `academic`).
- **`fullText` in Page Cache:** `pageFromText()` now stores both `text` (truncated for synthesis) and `fullText` (complete page) in the page cache. Full text is reused across queries, reducing re-fetches.
- **`webFetch()` export:** New exported function in `lib/web-research.js` for fetching a single URL with effectively unlimited page text limit. Usable by Pi extensions and direct API consumers.

### Fixed
- **Plugin Manifest Version Alignment:** Updated `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, and `plugins/emet/.codex-plugin/plugin.json` to match package version 1.2.5.

## 1.2.5

### Fixed
- **evaluateSufficiency Claims Gap (High):** `detectCoverageGaps()` now falls back to source-authoritative check when no claims are passed, eliminating the contradiction where `sufficient=true` but `missingAspects` always contained "authoritative sources" (73/201 cached queries affected).
- **Synthesis Fallback Boilerplate (High):** `fallbackSynthesis()` now extracts real page content (top 400 chars per source) instead of returning "I found X relevant sources" template, giving agents usable content even when LLM synthesis is unavailable.
- **Mode Routing Agent Override (High):** `runWebResearch()` now re-evaluates mode from query intent via `defaultMode()` and upgrades `fast` to `academic`/`deep`/`versioned` when the query demands it, preventing paper and comparison queries from landing in generic fast mode.
- **Options Propagation in Mode Override:** Fixed `isolate`, `files`, and other option fields being lost when the mode-override path reconstructed the research config without spreading original options.

### Changed
- **Tool Schema Default:** Added `default: "fast"` and improved description for the `mode` field so MCP hosts display the correct default.

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
