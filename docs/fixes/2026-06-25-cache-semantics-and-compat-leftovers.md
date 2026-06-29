# Emet Master Repo Improvement Ledger

Date: 2026-06-25
Status: implementation ledger from audit `00` through `20`; verified fix batch updated 2026-06-27.
Scope: improve existing emet behavior only. No net-new product features.

## Verified Fix Batch - 2026-06-27

Verification:

- [x] `node --test test/source-scoring.test.js test/intent-router.test.js test/research-guardrails.test.js test/web-research.test.js` -> 62 tests passed.
- [x] `node --test test/research-memory.test.js test/research-logging.test.js test/page-fetch-adapter.test.js` -> 17 tests passed.
- [x] `node --test test/mcp-server.test.js test/cli.test.js test/retrieval-community.test.js test/docs-sync.test.js test/eval-runner.test.js test/boundary-audit.test.js test/package-manifest.test.js` -> 45 tests passed.
- [x] `npm run check` -> 290 tests passed, package surface audit passed, `npm pack --dry-run` passed.

Completed and verified:

- [x] Source policy is enforced before direct fetches, `web_fetch`, Jina reader fetches, redirect acceptance, cached page reuse, academic result merging, and community fetch actions.
- [x] Host/path allowlists are segment-aware; `/docs` matches `/docs` and `/docs/page`, not `/docsx`.
- [x] Private/internal network URLs fail closed by default, with explicit opt-in in the `web_fetch` schema.
- [x] `web_fetch` returns bounded text plus truncation metadata instead of effectively unlimited payloads.
- [x] Cache identity includes semantic policy/output fields, raw-pages calls bypass the slim persistent result cache, topic fallback is gated away from exact/strict/versioned requests, and persistent cache entries are project-scoped without storing raw project paths.
- [x] Ranking no longer promotes sources to authoritative from numeric score alone; explicit `authoritative: false` is immutable, and GitHub issues, pulls, and discussions remain non-authoritative.
- [x] Sufficiency, coverage, and confidence use immutable authority labels; same-domain contradictions are detected.
- [x] Guardrails veto high-risk downgrades to generic web, and caller/domain/query-understanding hints merge additively.
- [x] Default research logs omit `cwd`, `Error.stack`, raw config/result blobs, and raw local file paths.
- [x] Community adapter no longer imports the public facade, and the boundary audit catches static plus dynamic import back-edges.
- [x] CLI global flags are handled before MCP startup, including `--help`, `--no-telemetry`, and unknown flag-only invocations.
- [x] MCP telemetry is centralized and honors injected env/opt-out instead of separate direct `process.env` paths.
- [x] Community checkpoint resume preserves platforms; URL-seeded RSS/YouTube collectors reject topic-only queries without network.
- [x] Package surface is deterministic for this batch: bin targets executable, Node floor declared, plugin bootstrap pinned, unused `turndown` dependency removed, and `pack:dry` runs a surface audit.
- [x] `docs/pipeline.md` references only existing scripts/paths, and eval decorative expectation fields are now checked.
- [x] `AGENTS.md` documents layer, cache, fetch-policy, CLI, package, and dependency production-grader rules.

Breaking/release decisions completed 2026-06-27:

- [x] Legacy public surface deletion completed for the 2.0.0 breaking release: removed `legacyAction`, `collector_*` action compatibility, `COLLECTOR_*` aliases, old collector-interactive facade exports, and the parallel legacy collector entry path.
- [x] Public `exports` map added with documented supported subpaths only; unsupported deep imports are intentionally blocked.
- [x] Heavy extraction stack decision made: keep high-quality article/PDF extraction, and package audit now guards `@extractus/article-extractor`, `@napi-rs/canvas`, and `pdfjs-dist`.
- [x] Trusted Publishing/OIDC workflow added in `.github/workflows/publish.yml`; package audit rejects long-lived npm token usage in that workflow.
- [x] Full tarball temp-prefix install smoke added as `npm run pack:smoke` and included in `npm run check`.

## Inputs Reviewed

- Audit docs -> synthesized from `docs/fixes/audit/2026-06-25/00-index.md` through `20-post-audit-roadmap.md`.
- Repo instructions -> `AGENTS.md`.
- Existing draft -> this file before rewrite.
- Code spot-checks -> source/fetch policy, cache keys, pipeline result caching, ranking/sufficiency, community flow, CLI/MCP/plugin packaging, logging, eval fixtures, and package metadata.
- Current release state -> package version `2.0.0`; this ledger now includes the breaking public-surface cleanup, cache/source-policy hardening, release-surface checks, and package smoke verification.

## Current Highest-Risk Clusters

- Source policy is porous -> make allowlists, source type controls, authority gates, and redirects fail closed before retrieval or sufficiency -> `lib/research/fetch.js`, `lib/research/search.js`, `lib/research/synthesis.js`, `lib/retrieval/community.js`, `lib/research/ranking.js`, `lib/research-policy.js`, `lib/research-guardrails.js`.
- Cache semantics can replay stale or looser answers -> include policy/query/output fields in identity, scope persistence, and restrict topic fallback -> `lib/research-memory.js`, `lib/research/pipeline.js`, `lib/research/config.js`, `lib/research/queries.js`.
- Legacy collector/community compatibility is still active -> freeze public compat briefly, remove boundary back-edges, then delete old names on a deliberate migration gate -> `lib/web-research.js`, `lib/retrieval/community.js`, `lib/research-session.js`, `lib/research-contract.js`, `test/*collector*`, `test/boundary-audit.test.js`.
- Host/package release surface is nondeterministic -> fix CLI global flags, injected env, plugin bootstrap pin, bin modes, and pack smoke tests -> `lib/cli.js`, `mcp/server.js`, `mcp/handlers/tools.js`, `plugins/emet/start.mjs`, `package.json`, `bin/*`, `docs/*`.
- Ranking/synthesis can overstate confidence -> stop authority promotion by score alone, compare same-domain contradictions, and synthesize from ranked evidence -> `lib/research/ranking.js`, `lib/research/coverage.js`, `lib/research/synthesis.js`, `lib/research/pipeline.js`.

## Critical Correctness Fixes

- Strict `hostAllowlist` is advertised but not enforced before network I/O -> add a fetch-boundary policy check before direct fetch, Jina fallback, PDF extraction, redirect use, `web_fetch`, and collector fetch -> `lib/research/fetch.js`, `lib/research/synthesis.js`, `lib/retrieval/community.js`, `lib/research/search.js`, `lib/tool-schema.js`.
- Disallowed explicit `web_fetch` URLs can still be fetched -> route `webFetch()` through the same allowlist/source-policy gate and return a deterministic refused result before network access -> `lib/research/synthesis.js`, `lib/research/fetch.js`, `mcp/handlers/tools.js`, `test/page-fetch-adapter.test.js`.
- Collector fetch action can retrieve disallowed URLs -> pass effective source policy into `handleCollectorFetch()` and validate selected result URLs before fetch -> `lib/retrieval/community.js`, `lib/research/fetch.js`, `test/collector-flow.test.js`.
- Jina reader fetch can bypass host/path policy through fallback paths -> validate original URL and any resolved reader URL under the same policy before and after fetch -> `lib/research/fetch.js`, `lib/research/helpers.js`.
- Redirects can change the effective host after initial allowlist validation -> validate `response.url` or final URL before accepting/storing page content -> `lib/research/fetch.js`, `lib/page-fetch-adapter.js`, `test/page-fetch-adapter.test.js`.
- Academic provider results bypass source filtering -> run arXiv/Semantic Scholar/Crossref results through `filterSearchResults()` or an equivalent source-policy filter before merge/rank/cache -> `lib/research/search.js`, `test/web-research.test.js`.
- Host/path matching overmatches sibling paths such as `/docsx` for `/docs` -> replace raw `startsWith()` with segment-aware matching where allowed path matches exact path or next char `/` -> `lib/research/search.js`, `test/web-research.test.js`.
- Mixed `allowedSources` host constraints plus keywords disable strict filtering -> split strict allowlists from ranking hints, or fail loudly when a domain pack tries to use mixed semantics as strict policy -> `lib/domains/*`, `lib/research/search.js`, `lib/research/config.js`, `test/domain-packs.test.js`.
- Ranking can mark non-authoritative pages authoritative when `total >= 10` -> remove score-only authority promotion or gate it behind explicit authority evidence that cannot override policy negatives -> `lib/research/ranking.js`, `lib/research-policy.js`, `test/source-scoring.test.js`.
- GitHub issues/pulls/discussions can regain authoritative status despite policy -> keep GitHub state/discussion pages non-authoritative unless a documented exception applies to README/releases/blob pages -> `lib/research-policy.js`, `lib/research/ranking.js`, `lib/research/heuristics.js`, `test/source-scoring.test.js`.
- Guardrails are computed but not used in domain selection -> wire `guardrailVetoesDomainDowngrade()` or equivalent logic into routing before domain pack hints and config are finalized -> `lib/research/pipeline.js`, `lib/research-guardrails.js`, `lib/domains/index.js`, `test/intent-router.test.js`.
- High-risk domain packs read as strict but behave as soft hints -> define which packs are fail-closed and convert those to concrete host/path constraints only -> `lib/domains/changelog.js`, `lib/domains/legal.js`, `lib/domains/vendor-status.js`, `lib/domains/local-howto.js`, `test/domain-packs.test.js`.
- Query-understanding and caller hints are dropped -> merge `options.queryHints`, domain hints, and query-understanding hints additively instead of replacing them with `domainConfig.queryHints` -> `lib/research/config.js`, `lib/query-understanding.js`, `lib/research/queries.js`, `test/web-research.test.js`.
- Strict and permissive requests can share persistent answers -> include policy-shaping inputs in cache identity before any memory/disk short-circuit -> `lib/research-memory.js`, `lib/research/pipeline.js`, `test/research-memory.test.js`, `test/web-research.test.js`.
- Topic fallback strips versions, years, URLs, `site:`, and GitHub repo paths -> disable topic fallback for versioned, changelog, migration, deprecation, release-note, URL-specific, `site:`-specific, strict-source, year-constrained, or authoritative-required requests -> `lib/research-memory.js`, `lib/research/pipeline.js`, `lib/version-context.js`, `test/research-memory.test.js`.
- `rawPages: true` output disappears on persistent cache hits -> either bypass persistent result cache for `rawPages` calls or include `rawPages` in identity and store a bounded compatible payload -> `lib/research/pipeline.js`, `lib/research-memory.js`, `lib/emet-runtime.js`, `test/web-research.test.js`.
- Persistent cache appears project-scoped but reads/writes global project `''` -> implement real project key on read/write/migration or delete project columns and docs implying isolation -> `lib/research-memory.js`, `lib/local-logger.js`, `test/research-memory.test.js`.
- Search cache key can cross modes when provider mix is manually overridden -> include `mode` and academic-provider participation in search cache identity -> `lib/research/search.js`, `lib/research/cache.js`, `test/web-research.test.js`.
- `web_fetch` can return huge payloads -> add explicit payload cap, truncation metadata, or chunking contract while preserving existing simple fetch behavior for normal pages -> `lib/research/synthesis.js`, `lib/tool-schema.js`, `mcp/handlers/tools.js`, `test/web-research.test.js`.
- Flag-only CLI invocations start MCP and hang -> handle global flags before implicit MCP startup, especially `--help`, `--no-telemetry`, and unknown flags -> `lib/cli.js`, `bin/emet.js`, `test/cli.test.js`.
- MCP telemetry ignores injected env -> use `deps.env` or passed env consistently instead of direct `process.env` in server and tool handlers -> `mcp/server.js`, `mcp/handlers/tools.js`, `test/mcp.test.js`.

## Architecture And Boundary Fixes

- Community adapter dynamically imports the public facade -> remove `await import("../web-research.js")` from `lib/retrieval/community.js` and call lower-layer fetch/synthesis modules or have the workbench pass explicit helpers -> `lib/retrieval/community.js`, `lib/research/pipeline.js`, `lib/research/fetch.js`, `lib/research/synthesis.js`.
- Boundary audit misses dynamic imports -> parse or regex-check `import()` targets and explicitly cover facade/community back-edges -> `test/boundary-audit.test.js`.
- Public facade exports mutable compat state -> narrow `lib/web-research.js` to documented re-exports and move legacy session/cache helpers behind a named legacy module during a freeze window -> `lib/web-research.js`, `lib/research-session.js`, `lib/retrieval/community.js`, `docs/tool-reference.md`.
- `lib/research/pipeline.js` imports unused memory/page-snapshot helpers -> delete unused imports after checking tests and side effects -> `lib/research/pipeline.js`.
- Policy responsibilities are split across config, domain packs, search, fetch, ranking, sufficiency, and cache -> introduce one normalized policy object inside existing modules, not a plugin framework, and make each layer consume the same fields -> `lib/research/config.js`, `lib/research-policy.js`, `lib/research/search.js`, `lib/research/fetch.js`, `lib/research/pipeline.js`.
- Retrieval currently returns and sometimes steers checkpoint result quality separately from normal evidence flow -> keep retrieval returning candidates/pages and let pipeline/ranking/synthesis decide sufficiency where feasible -> `lib/retrieval/community.js`, `lib/research/pipeline.js`, `lib/retrieval/normalize.js`.
- Community checkpoint bypasses normal rank/dedupe/fetch/synthesis contracts -> normalize community candidates through existing source normalization/ranking before fetch/synthesis, or document checkpoint as raw candidate mode only -> `lib/retrieval/community.js`, `lib/retrieval/normalize.js`, `lib/research/pipeline.js`.
- Source authority can be changed by ranking after policy labels are set -> separate immutable policy labels from numeric quality/rank scores -> `lib/research-policy.js`, `lib/research/ranking.js`, `lib/research/coverage.js`.
- `allowedSources` mixes source type names, host hints, and keywords -> split into explicit `sourceHints` and strict `sourceAllowlist` internally while preserving public compatibility -> `lib/research/config.js`, `lib/research/search.js`, `lib/domains/*`, `lib/tool-schema.js`.
- Base-layer modules read `process.env` in config/cache paths -> review AGENTS boundary rule and isolate env reads to adapter/workbench/infra where practical -> `lib/research/config.js`, `lib/research-memory.js`, `lib/local-logger.js`.
- Public import surface is implicit because package has no `exports` map -> freeze supported import paths first, then consider a compatibility-safe `exports` map in a major/minor release -> `package.json`, `index.js`, `lib/web-research.js`, docs.
- ESM-only package is correct but Node support is implicit -> add `engines.node` after validating current minimum, align `doctor` and CI with that floor -> `package.json`, `lib/cli.js`, docs.

## Search, Fetch, And Source-Control Improvements

- Fetch boundary lacks a single reusable access-control helper -> add a small helper that validates URL, host/path, source type, private/internal network stance, and redirect target before content retrieval -> `lib/research/fetch.js`, `lib/research/search.js`, `lib/research-policy.js`.
- Private/internal network behavior is undefined -> decide whether localhost/RFC1918/link-local are allowed by default, then enforce and test the decision -> `lib/research/fetch.js`, `lib/tool-schema.js`, `test/page-fetch-adapter.test.js`.
- `fetchPageSource()` validates blocked/dynamic content after network but not source policy before network -> add early refusal before cache lookup and before all direct/Jina/PDF branches -> `lib/research/fetch.js`.
- Cached page snapshots may be returned without rechecking updated policy -> validate cached page URL/source type/timeframe under current config before returning -> `lib/research/fetch.js`, `lib/research-memory.js`.
- Search provider fallbacks log raw errors and queries -> keep provider diagnostics but redact error objects and avoid full query/config dumps by default -> `lib/research/search.js`, `lib/local-logger.js`.
- Academic mode appends providers after DuckDuckGo fallback without dedupe/filter first -> filter, dedupe by normalized title/URL/DOI, then rank the combined set -> `lib/research/search.js`, `lib/research/ranking.js`.
- Provider order is fixed by `searchProvider` but not transparent in output -> keep trace metadata compact and redacted while exposing selected provider and filtered counts for debugging -> `lib/research/search.js`, `lib/research-trace.js`.
- `allowedSourceTypes` only filters search results, not explicit fetches -> apply source-type checks to fetched pages too, with clear behavior for unknown type -> `lib/research/fetch.js`, `lib/research/search.js`.
- Domain packs with `preferRecent`/year requirements can still admit undated pages too easily -> decide whether strict recency packs require dated pages or only downrank undated pages, then encode in policy -> `lib/research/fetch.js`, `lib/research/ranking.js`, `lib/domains/*`.
- Article extraction discards rich metadata from `@extractus/article-extractor` -> either preserve useful author/published/description fields or simplify extraction if not needed -> `lib/research/extraction.js`, `lib/article-extractor.js`, `lib/research/fetch.js`.
- PDF extraction silently degrades when native canvas/path fails -> surface extraction mode/fallback in trace and tests without making zero-setup installs brittle -> `lib/pdf-extractor.js`, `lib/research/fetch.js`, `test/page-fetch-adapter.test.js`.
- `web_fetch` uses effectively unlimited `pageTextLimit` -> set a default cap and return `truncated: true`, `originalLength`, and maybe `nextOffset` if needed later -> `lib/research/synthesis.js`, `lib/tool-schema.js`.
- `readLocalFiles()` logs full local file paths -> redact or hash paths in default logs while preserving enough support detail under debug -> `lib/research/fetch.js`, `lib/local-logger.js`.

## Cache, Memory, And Logging Fixes

- `modeCacheKey()` omits semantic options -> add `preferRecent`, `minYear`, `maxYear`, `requireAuthoritative`, `rawPages`, `format`, `queryHints`, `overlays`, `sourcePolicy`, `sourcePolicyFlags`, `deepResearchConfig`, `platforms`, and strict-source fields where they alter answer semantics -> `lib/research-memory.js`.
- `topicCacheKey()` shares the same omissions and additionally normalizes away exactness signals -> restrict topic cache to broad non-policy lookups or delete it if it remains hard to reason about -> `lib/research-memory.js`, `lib/research/pipeline.js`.
- Topic cache writes duplicate slim result under broad key unconditionally -> only write topic key after a safety predicate passes, and never for version/URL/year/source-constrained queries -> `lib/research/pipeline.js`, `lib/research-memory.js`.
- In-memory result cache uses same unsafe identity as disk -> update memory keying and rawPages behavior together with persistent cache changes -> `lib/research/pipeline.js`, `lib/research-memory.js`.
- Persistent result cache strips `contentText` and `pageTexts` but result consumers may expect stable shape -> either store shape-compatible fields or bypass result cache for output-shaping flags -> `lib/research/pipeline.js`, `lib/emet-runtime.js`.
- Page snapshot cache stores reusable pages independent of source policy -> keep page snapshots as content cache but always reapply current policy before use -> `lib/research/fetch.js`, `lib/research-memory.js`.
- `EMET_DEV_CACHE` writes full result snapshots under user cache tree -> make dev cache opt-in, clearly isolated by context, and redacted of secrets/local paths -> `lib/research-memory.js`, docs.
- Default logs include `cwd` in every record -> remove, hash, or debug-gate `cwd` -> `lib/local-logger.js`, `test/research-logging.test.js`.
- Default log sanitizer preserves `Error.stack` -> omit stack by default and keep `name`, `message`, `code`, `statusCode`, `reason`, and retry count -> `lib/local-logger.js`.
- Pipeline logs full `config`, cached result, query-understanding decisions, and final result payloads -> log compact summaries by default; keep full trace behind explicit `EMET_DEBUG` or similar -> `lib/research/pipeline.js`, `lib/research-trace.js`, `lib/local-logger.js`.
- Search/fetch logs raw error objects -> use `fetchFailureReason()`/structured fields only -> `lib/research/search.js`, `lib/research/fetch.js`.
- Logs/traces may include query text and source URLs even in default mode -> decide redaction policy for local logs, then document and test it -> `lib/local-logger.js`, `docs/hosts/*`, `SECURITY.md`.
- Cache migration writes project `''` for all imported entries -> either migrate with project context or mark migrated legacy entries as global and never serve them to project-scoped reads -> `lib/research-memory.js`.
- Cache cleanup and page-store stats expose cache path in `doctor` output -> decide if path output is okay for CLI-only diagnostics; avoid sending it through telemetry/logs by default -> `lib/cli.js`, `lib/research-memory.js`.

## Ranking, Sufficiency, And Synthesis Improvements

- Non-authoritative pages can satisfy sufficiency after score promotion -> make `authoritativeSourcesFound` depend on immutable authority labels, not total rank score -> `lib/research/coverage.js`, `lib/research/ranking.js`.
- Same-domain contradictions are ignored when all pages share a host -> compare distinct pages on same domain if they have opposing support/deprecation/removal claims -> `lib/research/coverage.js`, `test/source-scoring.test.js`.
- Conflict detection is phrase-level and can over/under-detect -> add targeted tests for supported/unsupported, deprecated/available, removed/still works, and migration/change-log language -> `lib/research/coverage.js`, `test/source-scoring.test.js`.
- Runtime sufficiency does not pass claims into `evaluateSufficiency()` -> thread synthesized/fact-checked claims into sufficiency before follow-up decisions, or delete the unused claim branch to avoid false confidence in tests -> `lib/research/pipeline.js`, `lib/research/coverage.js`, `lib/research/synthesis.js`.
- Fallback synthesis ranks source metadata but builds answer/bullets from input order -> use ranked pages for answer and bullet text, and preserve source numbering consistently -> `lib/research/synthesis.js`, `test/research-synthesis.test.js`.
- Fallback synthesis can quote weak/old pages when better-scored pages exist -> use `prioritizeSourceEntries()` or `rankFetchedPages()` before selecting excerpts -> `lib/research/synthesis.js`.
- Sufficiency overrides can mark sufficient with conflicts if any page is authoritative -> require conflict resolution evidence, not just one authoritative page, when conflict is detected -> `lib/research/pipeline.js`, `lib/research-next-action-policy.js`, `test/web-research.test.js`.
- Follow-up steering depends on conflict/missing-aspect quality -> ensure `conflictSummary`, `missingAspects`, and `openSubQuestions` are computed before deciding next action -> `lib/research/pipeline.js`, `lib/research-next-action-policy.js`.
- JSON/table output formats may drop citation/conflict metadata -> verify current consumers and either preserve compact citation/conflict fields or document markdown as richest mode -> `lib/research-output.js`, `test/output-formats.test.js`.
- Version-sensitive ranking and cache behavior are coupled loosely -> keep version signals in ranking, but never allow version match alone to create authority -> `lib/version-context.js`, `lib/research/ranking.js`, `test/version-context.test.js`.
- Domain/freshness signals can overpower source quality -> tune scoring after authority fix with regression cases for official docs, changelogs, blogs, mirrors, issue threads, and papers -> `lib/research/ranking.js`, `test/source-scoring.test.js`, eval cases.
- `defaultMode()` misses obvious repo/package prompts -> decide whether GitHub/package-registry/docs prompts should auto-upgrade to `code`; if yes, extend intent classification; if no, remove ambiguity in planner docs/tests -> `lib/research/heuristics.js`, `lib/planner.js`, `test/intent-router.test.js`.

## Community, Collector, And Host Integration Fixes

- `sessionId` resume does not preserve platform selection -> persist platforms and checkpoint state in sessions or require platforms on resume with a clear error -> `lib/research-session.js`, `lib/retrieval/community.js`, `test/research-session.test.js`.
- Resumed checkpoint can silently fall back to web pipeline if platforms are omitted -> use stored session platforms before recomputing `selectedCommunityPlatforms()` -> `lib/research/pipeline.js`, `lib/retrieval/community.js`.
- `rss` and `youtube` are URL-seeded collectors but advertised as query-search platforms -> reject topic strings for those platforms unless a valid URL/feed/video seed is supplied, or split them from query-search platforms -> `lib/retrieval/community.js`, `lib/collectors/rss.js`, `lib/collectors/youtube.js`, `lib/tool-schema.js`, `test/retrieval-community.test.js`.
- Default community platforms include `rss`, which is not topic-search capable -> remove `rss` from default query-search set or make default skip URL-seeded collectors unless seeded -> `lib/retrieval/community.js`, `lib/research-flow.js`.
- Legacy `runCollectorInteractive()` and new checkpoint flow can diverge -> freeze legacy path, add explicit compatibility tests, and route shared logic through one implementation where safe -> `lib/retrieval/community.js`, `lib/research-session.js`, `test/collector-flow.test.js`.
- `legacyAction` remains in result shapes -> keep for a documented deprecation window, then remove or move to legacy-only module with release notes -> `lib/retrieval/community.js`, `lib/research-contract.js`, `lib/research/pipeline.js`, `mcp/handlers/resources.js`, `lib/emet-runtime.js`.
- `COLLECTOR_*` aliases remain public -> freeze for one release and delete only after external compatibility decision -> `lib/research-session.js`, `lib/research-contract.js`, tests.
- Checkpoint search returns raw collector results with less ranking/dedupe than normal web -> normalize and score community results consistently before exposing/fetching -> `lib/retrieval/normalize.js`, `lib/retrieval/community.js`, `lib/research/ranking.js`.
- Community fetch dynamically imports facade for fetch and synthesize helpers -> replace with direct lower-layer imports or workbench callbacks to honor architecture rules -> `lib/retrieval/community.js`.
- MCP resource handler checks `legacyAction` for web research -> migrate to canonical `action`/`retrievalClass` semantics once compatibility window closes -> `mcp/handlers/resources.js`, `lib/research-contract.js`.
- CLI `--no-telemetry` is documented but unusable -> either implement as global flag or remove docs; implementation is preferred because docs and product already advertise it -> `lib/cli.js`, `README.md`, `docs/quickstarts.md`.
- Duplicate telemetry sends startup and per-tool events through separate `Pinglet` clients -> choose one optional telemetry adapter or remove telemetry; avoid two trust-boundary crossings -> `mcp/server.js`, `mcp/handlers/tools.js`.
- Telemetry endpoint is hardcoded in two modules -> centralize endpoint resolution and honor injected env/opt-out -> `mcp/server.js`, `mcp/handlers/tools.js`, `lib/cli.js`.
- MCP stdio must not receive ordinary logs/help text -> keep all global CLI flag handling before MCP startup and ensure diagnostics go to stderr where appropriate -> `lib/cli.js`, `bin/emet.js`, `mcp/transport.js`.
- Pi rawPages formatting was fixed but cache still breaks rawPages shape -> align host formatting with cache semantics fix -> `lib/emet-runtime.js`, `lib/research/pipeline.js`.

## Docs, Release, And Package Fixes

- Codex plugin bootstrap installs `@black-knight.dev/emet@latest` while manifests pin `1.4.6` -> replace `latest` with package version or single-source version from manifest -> `plugins/emet/start.mjs`, `package.json`, `.codex-plugin/plugin.json`, `plugins/emet/.codex-plugin/plugin.json`.
- Bootstrap reinstall check will never match installed version when expected is `latest` -> compare against actual package version and skip install when matched -> `plugins/emet/start.mjs`.
- Published npm `bin` targets are not executable in repo (`bin/emet.js`, `bin/emet-mcp.js` mode `644`) while root shims are executable -> chmod bin targets or repoint `package.json.bin` to executable shims -> `package.json`, `bin/emet.js`, `bin/emet-mcp.js`, `emet.js`, `emet-mcp.js`.
- `npm run pack:dry` only runs `npm pack --dry-run` -> upgrade to an audit that asserts file list, executable bins, no secret-like files, version sync, and dependency sanity -> `package.json`, `scripts/*` if added, `test/package-surface.test.js`.
- Packed tarball is not install-smoked -> add temp-prefix install and invoke `node_modules/.bin/emet --help`, `emet doctor`, and `emet-mcp` as appropriate -> `package.json`, `test/package-surface.test.js`.
- Version drift can recur across package, server, plugins, release notes, and bootstrap -> add a version-sync test -> `package.json`, `server.json`, `.codex-plugin/*`, `.claude-plugin/*`, `plugins/emet/*`, `docs/releases/*`.
- `docs/pipeline.md` references missing scripts and removed router-era files -> rewrite to match current scripts and tree -> `docs/pipeline.md`, `package.json`.
- README/quickstarts/host docs advertise global flags that currently hang -> update after CLI fix, or remove guidance if not supported -> `README.md`, `docs/quickstarts.md`, `docs/hosts/*`.
- `docs/releases/1.4.6.md` is too narrow for current release drift -> update next release notes with bootstrap/package/bin/CLI/cache/policy fixes when they land -> `docs/releases/*`, `CHANGELOG.md`.
- `CHANGELOG.md` still mentions old turndown-backed HTML behavior -> update history/current docs after dependency cleanup -> `CHANGELOG.md`, `README.md`.
- Package has no `engines` despite doctor requiring Node 20+ -> add `engines.node` after testing package on intended Node floor -> `package.json`, `lib/cli.js`.
- Release workflow should avoid long-lived npm tokens -> add trusted publishing/OIDC follow-up if releases are automated -> `.github/workflows/*` if present, docs.
- Public docs should define strict vs hint source controls -> document actual `allowedSources`, `hostAllowlist`, `allowedSourceTypes`, overlays, and source policy semantics after code fix -> `docs/tool-reference.md`, `README.md`, `docs/reference/*`.
- Host docs should disclose local cache/log/telemetry behavior -> document cache location, redaction, telemetry opt-out, and how to isolate via env -> `README.md`, `SECURITY.md`, `docs/hosts/*`.

## Test And Eval Improvements

- Add fail-closed fetch tests before policy changes -> verify disallowed `webFetch()`, direct `fetchPageSource()`, Jina fallback, redirects, and collector fetch do not touch network -> `test/page-fetch-adapter.test.js`, `test/web-research.test.js`, `test/collector-flow.test.js`.
- Add source-filter tests for academic providers -> restrictive `hostAllowlist`, `allowedSources`, and `allowedSourceTypes` filter arXiv/Semantic Scholar/Crossref before ranking -> `test/web-research.test.js`.
- Add segment-aware host/path test -> `example.com/docs` matches `/docs` and `/docs/page`, not `/docsx` -> `test/web-research.test.js`.
- Add authority tests -> high-scoring blog, GitHub issue, GitHub discussion, and mirror remain non-authoritative unless policy explicitly allows -> `test/source-scoring.test.js`.
- Add guardrail routing tests -> high-risk legal/changelog/security/version prompts cannot downgrade to weak web family after guardrails require authority -> `test/intent-router.test.js`, `test/research-guardrails.test.js`.
- Add query-hint merge tests -> caller `queryHints` and domain hints both appear in `getResearchConfig()` and `buildQueries()` -> `test/web-research.test.js`.
- Add cache identity tests -> keys differ for `requireAuthoritative`, `preferRecent`, year bounds, overlays, source policy, query hints, rawPages, format, source allowlists, and platforms -> `test/research-memory.test.js`, `test/web-research.test.js`.
- Add topic fallback tests -> versioned, changelog, URL, GitHub repo path, `site:`, strict-source, and year-constrained queries do not reuse broad topic entries -> `test/research-memory.test.js`.
- Add rawPages cache test -> repeated `rawPages: true` calls either bypass persistent cache or return `pageTexts` consistently -> `test/web-research.test.js`.
- Add project isolation test -> same key under two project contexts cannot collide if project scope is kept -> `test/research-memory.test.js`.
- Add logging tests -> default JSONL events do not include `cwd`, `stack`, raw `config`, raw cached result, or final result blobs -> `test/research-logging.test.js`.
- Add fallback synthesis test -> answer and bullets use top-ranked pages, not original input order -> `test/research-synthesis.test.js`.
- Add same-domain conflict test -> two contradictory pages on same host can trigger conflict detection -> `test/source-scoring.test.js`.
- Add sufficiency integration test -> conflicts and unsupported claims steer follow-up before final sufficiency -> `test/web-research.test.js`.
- Add checkpoint resume test -> second turn with only `sessionId` and `action` preserves prior platform set or fails explicitly -> `test/research-session.test.js`, `test/retrieval-community.test.js`.
- Add URL-seeded collector tests -> `rss` and `youtube` reject topic-only queries or require valid seed URL -> `test/retrieval-community.test.js`, `test/collectors.test.js`.
- Add CLI tests -> `emet --help`, `emet --no-telemetry`, and unknown global flags exit without starting MCP -> `test/cli.test.js`.
- Add MCP env injection test -> server/tool telemetry uses injected env and opt-out path -> `test/mcp.test.js`.
- Add package smoke test -> packed tarball installs and published bin commands run -> `test/package-surface.test.js`.
- Add version drift test -> package, server, manifests, bootstrap, and release docs stay aligned -> `test/package-surface.test.js`.
- Add docs sync test -> docs mention only package scripts and files that exist -> `test/docs-sync.test.js`.
- Extend boundary audit -> detect static and dynamic imports, cover facade purity, and forbid adapter-to-facade loops -> `test/boundary-audit.test.js`.
- Make eval runner exercise runtime behavior -> add deterministic mocked `runWebResearch()` fixture path that asserts answer, sources, trace, and follow-up state -> `lib/eval/runner.js`, `test/eval-runner.test.js`, `eval/cases/*`.
- Decorative eval fields are unused -> either enforce `expectedQuality`/`expectedClaims` or remove them from cases -> `lib/eval/runner.js`, `eval/cases/*`, `test/eval-runner.test.js`.
- Add hostile options tests -> config/cache identity construction should ignore prototype pollution and unknown fields safely -> `lib/research/config.js`, `lib/research-memory.js`, tests.

## Cleanup, Deletion, And Deprecation Items

- `turndown` is unused -> remove dependency and lockfile entry unless a real Markdown conversion path is restored -> `package.json`, `package-lock.json`, `CHANGELOG.md`.
- Duplicate telemetry path is low value -> delete one `Pinglet` path after selecting retained hook, or delete telemetry entirely if product decision favors no third-party calls -> `mcp/server.js`, `mcp/handlers/tools.js`.
- Legacy collector public exports are still referenced -> freeze now, document deprecation, delete later behind a release gate -> `lib/web-research.js`, `lib/retrieval/community.js`, `lib/research-session.js`, `lib/research-contract.js`.
- `legacyAction` should not be required by new hosts -> migrate host/resource code to canonical `action` and keep `legacyAction` only in compat output until deletion -> `mcp/handlers/resources.js`, `lib/emet-runtime.js`, `lib/research-contract.js`.
- `COLLECTOR_*` aliases keep old naming alive -> sunset after compatibility decision and tests are updated -> `lib/research-session.js`, `test/research-session.test.js`.
- Old `runCollectorInteractive()` path is parallel architecture -> move to legacy module or delete after migration; do not keep on main facade long term -> `lib/retrieval/community.js`, `lib/web-research.js`.
- Unused imports in pipeline add noise -> remove after behavioral fixes land -> `lib/research/pipeline.js`.
- Stale router-era docs should be deleted or rewritten -> remove references to `audit:roadmap`, `audit:promotion`, `check:promotion`, and `scripts/router/` -> `docs/pipeline.md`.
- Heavy extraction stack needs a keep/delete decision -> if metadata is not preserved and native fallback is best-effort only, consider simplifying while protecting current fetch quality -> `lib/research/extraction.js`, `lib/article-extractor.js`, `lib/pdf-extractor.js`, `package.json`.
- Topic fallback may be more risk than benefit -> repair narrowly first; delete if tests show it remains hard to reason about safely -> `lib/research-memory.js`, `lib/research/pipeline.js`.
- `exports` map should wait -> do not add until public import compatibility is frozen and documented -> `package.json`, docs.
- Release docs for old point releases should not be over-edited -> prefer next release notes for newly fixed drift unless a published note is factually wrong -> `docs/releases/*`, `CHANGELOG.md`.

## Sequencing Guidance

### Must Happen First

- Pin failing contracts with tests -> add fail-closed fetch/source tests, cache identity/topic-fallback tests, authority scoring tests, CLI flag tests, and dynamic boundary tests before changing broad behavior.
- Close source-policy bypasses -> fetch-boundary allowlists, academic provider filtering, segment-aware path matching, redirect validation, and immutable authority labels.
- Fix cache correctness -> semantic cache keys, rawPages shape, unsafe topic fallback gates, and project-scope decision.
- Redact default logs before adding more diagnostic output -> remove `cwd`, `stack`, raw config/result/cached payloads from default JSONL events.

### Can Parallelize

- CLI/package/release surface fixes -> `lib/cli.js`, `plugins/emet/start.mjs`, bin mode/bin target, version-sync tests, and pack smoke tests can proceed alongside core policy work if tests are isolated.
- Docs refresh after decisions are clear -> `docs/pipeline.md`, README quickstarts, host docs, and release notes can be updated in parallel once behavior is known.
- Eval cleanup -> decorative field deletion/enforcement and mocked runtime evals can proceed without touching source policy internals.
- Unused dependency deletion -> `turndown` removal can land independently after lockfile/package checks.
- Boundary audit hardening -> dynamic import detection can land before or alongside community adapter refactor.

### Should Wait

- Legacy collector deletion -> wait until current compat contract is frozen, documented, and a migration/release gate is chosen.
- Public `exports` map -> wait until supported deep imports and legacy surfaces are decided.
- Heavy extraction simplification -> wait until fetch policy and payload caps are fixed, so extraction changes are not mixed with trust-boundary changes.
- Topic fallback deletion -> first try safe gating with tests; delete only if repair remains ambiguous.
- Major release cleanup -> remove `collector_*`, `legacyAction`, `COLLECTOR_*`, and old facade exports only in a coordinated compatibility release.

### Suggested Batches

- Batch 0: tests only -> source/fetch policy, authority, cache identity/topic fallback/rawPages, CLI flags, boundary dynamic imports, checkpoint resume.
- Batch 1: source trust boundary -> fetch allowlists, redirect checks, academic filtering, path matching, strict vs hint source semantics.
- Batch 2: cache/privacy -> cache keys, topic fallback gates, project scope, rawPages cache behavior, logging redaction.
- Batch 3: ranking/sufficiency -> authority immutability, same-domain conflicts, fallback synthesis ordering, claim-aware sufficiency.
- Batch 4: host/release -> CLI globals, telemetry env/duplication, bootstrap version pin, bin executable surface, pack smoke tests.
- Batch 5: community compatibility -> session platform persistence, rss/youtube seed semantics, adapter/facade back-edge removal, compat freeze/deprecation.
- Batch 6: docs/eval/deletion -> docs sync, runtime evals, `turndown` removal, stale release/doc cleanup.

## Verification Commands

- Targeted policy -> `node --test test/page-fetch-adapter.test.js test/source-scoring.test.js test/domain-packs.test.js test/research-policy-domain.test.js test/intent-router.test.js`
- Targeted cache/logs -> `node --test test/web-research.test.js test/research-logging.test.js test/research-memory.test.js`
- Targeted community/boundary -> `node --test test/boundary-audit.test.js test/collector-flow.test.js test/retrieval-community.test.js test/research-session.test.js`
- Targeted host/package -> `node bin/emet.js --help`, `node bin/emet.js --no-telemetry`, `node bin/emet.js doctor`, `npm run pack:dry`
- Full gate -> `npm test` then `npm run check`
