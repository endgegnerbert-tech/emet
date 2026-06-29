# Scope
Delete-vs-repair pass for the June 25 audit batch, with emphasis on compatibility leftovers, underpowered features, and cleanup candidates that are ready to delete versus only safe to freeze.

# Files inspected
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
- `/Users/einarjaeger/github/emet/package.json`
- `/Users/einarjaeger/github/emet/lib/web-research.js`
- `/Users/einarjaeger/github/emet/lib/research-contract.js`
- `/Users/einarjaeger/github/emet/lib/research-session.js`
- `/Users/einarjaeger/github/emet/lib/retrieval/community.js`
- `/Users/einarjaeger/github/emet/mcp/server.js`
- `/Users/einarjaeger/github/emet/mcp/handlers/tools.js`
- `/Users/einarjaeger/github/emet/docs/pipeline.md`

# Findings
## Confirmed
1. **Highest risk: legacy collector compatibility should be frozen, not deleted yet.** The `collector_*` action names and the `COLLECTOR_*` aliases are still wired through runtime and tests (`lib/research-contract.js:25-45`, `lib/research-session.js:15-19`, `lib/retrieval/community.js:86,101,118,222,277,329,358,370`, `test/research-contract.test.js`, `test/research-session.test.js`, `test/collector-flow.test.js`). This is the biggest deletion hazard because it is still a real compatibility surface, not just dead code. The right move now is freeze + sunset, not immediate removal.
2. **Duplicate telemetry is underpowered and should be reduced to one path.** `mcp/server.js:121-130` and `mcp/handlers/tools.js:8-15,53-84` both create `Pinglet` clients and send similar events. That doubles the trust boundary and pays latency/cost for little product value. This is a repair candidate, but one of the two telemetry paths should be deleted outright once we pick the single supported host-level hook.
3. **`lib/web-research.js` still leaks compatibility state through a facade that should be thin.** It re-exports `clearResearchMemory`, `collectorSessions`, `shouldRunCollectorInteractive`, and `runCollectorInteractive` alongside the newer pipeline exports (`lib/web-research.js:23-27`). That makes the facade a compat surface instead of a clean entrypoint. Repair by moving the legacy exports behind a temporary shim, then delete them when the external migration window closes.
4. **`turndown` is dead weight and should be deleted now.** It remains in `package.json:97-105`, but the repo has no runtime import or test reference that uses it anymore. This is a straightforward dependency deletion with low compatibility risk.

## Likely
5. **`docs/pipeline.md` is carrying stale router-era references that should be deleted or rewritten.** It still documents `npm run audit:roadmap`, `npm run audit:promotion`, `npm run check:promotion`, and `scripts/router/` subdirectories even though those are no longer part of the current package surface (`docs/pipeline.md:11-26`). Keep the doc, but delete the obsolete commands and directory claims.

# Risks and open questions
- If any external consumer still reads `legacyAction`, `collectorSessions`, or the collector-style action strings, deleting them too early will break integrations quietly.
- If telemetry is meant to be opt-in or host-controlled, the better cleanup may be to delete it entirely rather than keep a single path.
- The compat layer is currently spread across runtime code and tests, so any deletion pass needs a coordinated test update rather than a piecemeal prune.

# Recommended fixes
- Freeze the collector compatibility contract for one release, then delete `collector_*`, `COLLECTOR_*`, and `legacyAction` only after a migration gate proves no callers remain.
- Delete the duplicate `Pinglet` path in `mcp/handlers/tools.js` and keep a single host-level telemetry hook, or remove telemetry entirely if that is the product decision.
- Split the old collector/session helpers out of `lib/web-research.js` so the facade can return to re-export-only shape.
- Remove `turndown` from `package.json` and treat the deletion as permanent unless a real Markdown conversion path is restored.
- Rewrite `docs/pipeline.md` so it only lists live commands and live directories.

# Suggested tests
- Add a contract test that fails if `collector_*` stops mapping through `legacyAction` during the freeze window, so the deletion is deliberate.
- Add a telemetry test that asserts only one `Pinglet` client is created per run.
- Add a facade test that `lib/web-research.js` contains only the intended public re-exports and no mutable compat state.
- Add a manifest test that fails if `turndown` reappears without a runtime import.
- Add a docs sync test that rejects `docs/pipeline.md` references to non-existent scripts or directories.
