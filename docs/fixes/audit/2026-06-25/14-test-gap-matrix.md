# Scope
Convert worker findings 01-11 into a test-gap matrix, grouped by unit, integration, contract, cache, and regression coverage. Focus is on missing tests that would have caught the highest-risk behavior drift first.

# Files inspected
- `docs/fixes/audit/2026-06-25/01-public-contract-and-release-surface.md`
- `docs/fixes/audit/2026-06-25/02-architecture-and-boundaries.md`
- `docs/fixes/audit/2026-06-25/03-pipeline-and-query-ingress.md`
- `docs/fixes/audit/2026-06-25/04-domain-routing-and-policy.md`
- `docs/fixes/audit/2026-06-25/05-search-fetch-and-source-controls.md`
- `docs/fixes/audit/2026-06-25/06-ranking-version-sufficiency-and-synthesis.md`
- `docs/fixes/audit/2026-06-25/07-cache-memory-and-trace-safety.md`
- `docs/fixes/audit/2026-06-25/08-community-collectors-and-session-flow.md`
- `docs/fixes/audit/2026-06-25/09-cli-mcp-pi-host-integrations.md`
- `docs/fixes/audit/2026-06-25/10-tests-eval-docs-and-dead-code.md`
- `docs/fixes/audit/2026-06-25/11-dependency-security-performance-product.md`
- `docs/fixes/2026-06-25-full-audit-scope.md`

# Findings
## Contract coverage gaps
1. The repo is missing a strict boundary test that proves host allowlists and source-policy controls are enforced before any fetch happens. The highest-risk gaps are in `lib/research/fetch.js:72-190`, `lib/research/synthesis.js:134-157`, `lib/retrieval/community.js:308-349`, and `lib/research/search.js:245-252`, where disallowed URLs or academic results can still be retrieved after the public contract in `lib/tool-schema.js` promises fail-closed behavior. A test should assert that `webFetch()` and collector fetch paths refuse URLs outside `hostAllowlist`, and that academic provider results are filtered under restrictive policies.
2. The public CLI/MCP contract is missing tests for flag handling and injected environment overrides. `lib/cli.js:126-166` routes flag-only invocations into the MCP server, and `mcp/server.js:113-131` plus `mcp/handlers/tools.js:8-15` read `process.env` directly instead of the injected env map. There is no regression test proving `emet --help` or `emet --no-telemetry` exits cleanly, or that a custom env passed into the server actually controls telemetry.

## Integration coverage gaps
3. The pipeline needs end-to-end tests for policy-sensitive routing and follow-up steering. `lib/research/pipeline.js:57-71` ignores guardrails when choosing a domain, `lib/research-policy.js:201-207` and `lib/research/ranking.js:207-242` let non-authoritative pages become authoritative by score, and `lib/research/coverage.js:54-85` misses same-domain contradictions. The missing integration test should drive a full turn and prove a high-risk query cannot downgrade to a weak domain, weak sources cannot satisfy sufficiency gates, and same-domain contradictions still trigger follow-up.
4. The eval harness is not exercising the runtime pipeline, so integration regressions can slip through while helper tests still pass. `lib/eval/runner.js` only checks pure helpers, and `test/eval-runner.test.js` does not execute `runWebResearch()`, fetch/search, or the real synthesis path. A runtime integration test should run a mocked end-to-end turn and assert the resulting answer, trace, and follow-up state.

## Cache coverage gaps
5. The cache layer is missing tests for policy-sensitive keying, project isolation, and topic fallback safety. `lib/research-memory.js:242-377` and `lib/research/pipeline.js:158-173` can reuse broader or looser answers across strict follow-up queries, while `project` is not actually used to isolate reads and writes. The missing cache tests should prove that different projects do not collide, that strict/permissive requests do not share keys, and that versioned or URL-specific questions do not fall back to a broader topic cache entry.
6. Trace/log safety needs a direct cache-pipeline test. `lib/local-logger.js:46-90` and `lib/research/pipeline.js:143-172` can log full configs, result blobs, stacks, and cwd data. There is no test asserting that default logging stays redacted enough for a shared cache/log path.

## Unit coverage gaps
7. Query normalization and hint-merging need direct unit-level tests. `lib/research/config.js:21-52` drops caller `queryHints`, `lib/research/queries.js:43-72` builds search variants from the stripped config, and `lib/research/heuristics.js:227-245` never auto-upgrades obvious repo/package prompts to `code`. These are easy-to-miss behavior drifts that should have explicit unit tests.

## Regression coverage gaps
8. Session and collector compatibility are under-tested. `lib/research-session.js:35-65` does not preserve platform selection, `lib/retrieval/community.js:74-157` can diverge from the legacy collector path, and `rss`/`youtube` collectors expect URL seeds instead of topic queries. A regression test should resume from `sessionId` alone, verify the same checkpoint branch is used, and fail fast when URL-seeded collectors are given a plain search prompt.
9. Boundary-audit coverage is incomplete because it only scans static imports. `test/boundary-audit.test.js:13-23,72-107,143-198` misses dynamic imports, so `lib/retrieval/community.js:308-365` can still reach back into `lib/web-research.js` without failing the audit. Add a regression test that explicitly checks the facade stays re-export-only and that the community adapter cannot import the facade at runtime.

# Risks and open questions
- Some missing tests depend on whether legacy collector behavior is still intentionally supported. If `collector_*`, `legacyAction`, and the old interactive path are still public, the regression tests need compatibility expectations rather than deletion expectations.
- The CLI flag tests depend on whether top-level flags are meant to be supported at all. If not, the docs should be trimmed instead of adding help-path coverage that the product no longer wants.
- The cache tests need a decision on whether project isolation is a real guarantee. If it is not, the `project` fields should be removed so the tests do not encode a false promise.

# Recommended fixes
- Add contract tests first for fetch boundaries, CLI flags, and telemetry env handling so the public surface is pinned before further repairs.
- Add integration tests around a mocked `runWebResearch()` turn to cover guardrails, authority gating, conflict detection, and runtime eval realism.
- Add cache regression tests for project isolation, topic fallback, and policy-sensitive cache keys before changing cache behavior.
- Add session and collector compatibility tests before pruning any legacy surface so deletions stay intentional.
- Extend the boundary audit to include dynamic imports and the facade/community pair.

# Suggested tests
- `test/web-research.test.js`: refuse disallowed URLs in `webFetch()` and collector fetch paths; verify academic results are filtered by `hostAllowlist` and `allowedSourceTypes`.
- `test/cli.test.js` or `test/mcp.test.js`: `emet --help` prints usage, `emet --no-telemetry` does not start MCP, and injected `env` controls telemetry endpoints.
- `test/research-policy-domain.test.js` and `test/source-scoring.test.js`: high-risk queries keep guardrail-safe domains, non-authoritative GitHub issue/discussion pages stay non-authoritative, and same-domain contradictions still count.
- `test/research-synthesis.test.js`: fallback synthesis uses ranked sources, not input order.
- `test/research-memory.test.js`: distinct project contexts and policy flags produce distinct cache keys, and topic fallback is disabled for versioned/changelog/URL-constrained queries.
- `test/research-session.test.js` and `test/retrieval-community.test.js`: resuming from `sessionId` preserves platforms, and `rss`/`youtube` reject topic-only searches.
- `test/boundary-audit.test.js`: detect dynamic imports into `lib/web-research.js` and `lib/retrieval/community.js`.
