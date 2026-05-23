# Changelog

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

## 1.1.0

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
