# Scope
Batch plan for follow-up fixes based on audit outputs `01` through `11`. I only found worker files `01`-`11` in `docs/fixes/audit/2026-06-25/`, so `12`-`15` are treated as not yet available and any cross-report prioritization from them is necessarily an assumption.

# Files inspected
- `/Users/einarjaeger/github/emet/AGENTS.md`
- `/Users/einarjaeger/github/emet/docs/fixes/2026-06-25-full-audit-scope.md`
- `/Users/einarjaeger/github/emet/docs/fixes/audit/2026-06-25/01-public-contract-and-release-surface.md`
- `/Users/einarjaeger/github/emet/docs/fixes/audit/2026-06-25/02-architecture-and-boundaries.md`
- `/Users/einarjaeger/github/emet/docs/fixes/audit/2026-06-25/03-pipeline-and-query-ingress.md`
- `/Users/einarjaeger/github/emet/docs/fixes/audit/2026-06-25/04-domain-routing-and-policy.md`
- `/Users/einarjaeger/github/emet/docs/fixes/audit/2026-06-25/05-search-fetch-and-source-controls.md`
- `/Users/einarjaeger/github/emet/docs/fixes/audit/2026-06-25/06-ranking-version-sufficiency-and-synthesis.md`
- `/Users/einarjaeger/github/emet/docs/fixes/audit/2026-06-25/07-cache-memory-and-trace-safety.md`
- `/Users/einarjaeger/github/emet/docs/fixes/audit/2026-06-25/08-community-collectors-and-session-flow.md`
- `/Users/einarjaeger/github/emet/docs/fixes/audit/2026-06-25/09-cli-mcp-pi-host-integrations.md`
- `/Users/einarjaeger/github/emet/docs/fixes/audit/2026-06-25/10-tests-eval-docs-and-dead-code.md`
- `/Users/einarjaeger/github/emet/docs/fixes/audit/2026-06-25/11-dependency-security-performance-product.md`

# Findings
1. High-risk batch: close the policy bypasses and wrong-scope retrieval first.
   - Target files: `lib/research/fetch.js`, `lib/research/search.js`, `lib/research/pipeline.js`, `lib/research/config.js`, `lib/research/queries.js`, `lib/research/ranking.js`, `lib/research-policy.js`, `lib/research-guardrails.js`, `lib/research-flow.js`, `lib/domains/*`, `test/page-fetch-adapter.test.js`, `test/source-scoring.test.js`, `test/domain-packs.test.js`, `test/research-policy-domain.test.js`, `test/intent-router.test.js`.
   - Why this is first: it contains the confirmed allowlist bypass, query-hint loss, guardrail routing gap, authority promotion bug, and mixed strict/soft domain-pack behavior. These changes affect what the product is allowed to fetch and what evidence can satisfy sufficiency.
   - Expected risk: high. This is behavior-changing and may alter retrieval results for many queries.
   - Practical batch shape: enforce host/path checks before network I/O, preserve additive query hints, make guardrails influence domain selection, and stop letting score alone promote non-authoritative pages.
   - Verification commands: `node --test test/page-fetch-adapter.test.js test/source-scoring.test.js test/domain-packs.test.js test/research-policy-domain.test.js test/intent-router.test.js`, then `npm test`.

2. High-risk batch: fix cache/session semantics and trace safety together.
   - Target files: `lib/research-memory.js`, `lib/research/pipeline.js`, `lib/research-session.js`, `lib/local-logger.js`, `test/research-logging.test.js`, `test/web-research.test.js`, `test/research-session.test.js`.
   - Why this is next: the cache collisions and global cache scope can replay stale or weaker answers across policy-sensitive requests, and the logger currently leaks full config/result state and stack/path data.
   - Expected risk: high for correctness and privacy; medium for implementation complexity.
   - Practical batch shape: add policy fields and project scope to cache keys/reads, disable topic fallback where it can contaminate versioned or URL-bound queries, and redact default trace payloads.
   - Verification commands: `node --test test/web-research.test.js test/research-logging.test.js test/research-session.test.js`, then `npm test`.

3. Medium-risk batch: clean up public surface, CLI/MCP behavior, and packaged bootstrap drift.
   - Target files: `bin/emet.js`, `bin/emet-mcp.js`, `lib/cli.js`, `mcp/server.js`, `mcp/handlers/tools.js`, `plugins/emet/start.mjs`, `package.json`, `README.md`, `server.json`, `docs/hosts/README.md`, `docs/hosts/pi.md`, `docs/quickstarts.md`, `plugins/emet/.codex-plugin/plugin.json`, `plugins/emet/.codex-plugin/mcp.json`, `plugins/emet/start.mjs`.
   - Why this is grouped here: the CLI flag hang, injected-env mismatch, and `latest` bootstrap pin are all release-surface issues that can break or skew host setup even when the core pipeline is healthy.
   - Expected risk: medium. Mostly packaging and host-integration behavior, but it can still block user entrypoints.
   - Practical batch shape: teach the CLI to honor top-level flags, thread injected env into telemetry, make the packaged bin targets executable, and align plugin bootstrap/version pinning with the release version.
   - Verification commands: `node bin/emet.js --help`, `node bin/emet.js --no-telemetry`, `node bin/emet.js doctor`, `npm run pack:dry`.

4. Medium-risk batch: delete or quarantine collector-era compatibility drift.
   - Target files: `lib/web-research.js`, `lib/retrieval/community.js`, `lib/research.js`, `lib/research-flow.js`, `lib/research-session.js`, `lib/collectors/*`, `test/boundary-audit.test.js`, `test/collector-flow.test.js`, `test/retrieval-community.test.js`.
   - Why this matters: the adapter/facade cycle and legacy collector exports make the architecture harder to trust and easier to regress, especially because the current boundary test misses dynamic imports.
   - Expected risk: medium. Mostly compatibility cleanup, but removing the wrong shim can break external callers.
   - Practical batch shape: remove the runtime `web-research.js` back-edge from `community.js`, decide whether `collector_*`/legacy exports stay, and extend boundary tests to cover dynamic imports and the facade/adapter loop.
   - Verification commands: `node --test test/boundary-audit.test.js`, then `npm test`.

5. Lower-risk batch: trim dead weight in eval/docs/dependencies once behavior is stable.
   - Target files: `lib/eval/*`, `test/eval-runner.test.js`, `docs/pipeline.md`, `CHANGELOG.md`, `package.json`.
   - Why this is last: the eval harness, stale docs, and unused dependency surface are important, but they are less urgent than correctness, policy, or release-surface bugs.
   - Expected risk: low to medium. Mostly deletion and documentation sync, with limited runtime impact.
   - Practical batch shape: either wire the eval suite to real runtime paths or delete decorative fields, refresh docs to match current scripts, and remove dead dependencies such as `turndown` if they are no longer used.
   - Verification commands: `npm test`, `npm run check`, `npm run pack:dry`.

# Risks and open questions
- `12`-`15` were not present when I read the audit directory, so this plan only reflects `01`-`11`. If those later reports add a new top-risk area, the batch order may need to change.
- The biggest sequencing choice is whether to land policy fixes and cache fixes in one pass or split them. I leaned toward separate batches because they touch different invariants and are easier to validate independently.
- Some cleanup items depend on whether the compatibility surface is still intentionally supported. If it is, batch 4 should become a deprecation pass instead of a removal pass.

# Recommended fixes
- Start with the policy batch and land it behind focused tests before touching cleanup.
- Treat cache/session and trace safety as a separate hardening pass, because it can silently affect answer reuse and logs across the entire product.
- Keep the public-surface/host batch small and explicit so packaging drift is easy to review.
- Use the compatibility batch to decide what is truly still supported, then delete the rest.
- Finish with eval/docs/dependency cleanup once the behavior and release surface have stabilized.

# Suggested tests
- Add one regression test per batch rather than one broad end-to-end test for everything.
- For batch 1, verify allowlists, query hints, guardrails, and authority gates all change output when expected.
- For batch 2, verify cache keys differ across policy-sensitive inputs and that logs no longer expose raw config/result blobs by default.
- For batch 3, verify CLI flags, MCP env injection, and packaged bin executability from the tarball.
- For batch 4, verify the boundary audit catches dynamic imports and the facade/adapter loop.
- For batch 5, verify the eval runner either exercises the runtime pipeline or no longer advertises decorative fields.
