# Executive Synthesis

Date: 2026-06-25
Status: post-audit synthesis
Inputs: audit reports `00` through `16`

## Bottom line

emet's core product promise is strong: a zero-setup MCP/Pi research server that returns grounded answers from live sources. The audit shows the repo is close enough to preserve, but not ready to treat as policy-hard or release-hard without cleanup. The highest-risk problems are not isolated bugs; they are repeated boundary mismatches where public contracts say "strict", "authoritative", "scoped", or "pinned", while runtime paths still behave as best-effort compatibility code.

The safest direction is not a rewrite. It is a staged hardening pass: close policy and cache bypasses first, freeze compatibility leftovers, delete dead weight, then narrow the public surface.

## Top risks

1. Source policy is porous. Multiple reports found the same class of failure: fetch paths do not enforce host/path allowlists before network I/O, academic results bypass source filtering, mixed domain-pack hints can accidentally disable strict filtering, and ranking can promote non-authoritative pages to authoritative by score alone.
2. Cache reuse can violate user intent. Policy-sensitive fields are missing from cache keys, topic fallback strips versions/URLs/years, and persistent cache scope is user-wide despite schema fields implying project isolation.
3. Compatibility drift is now architectural debt. Collector-era actions, sessions, facade exports, dynamic imports, and checkpoint behavior keep old and new flows alive at the same time. That makes correctness fixes harder to reason about.
4. Release and host surfaces are not deterministic enough. The Codex plugin bootstrap uses `latest`, published bin targets appear non-executable, and flag-only CLI invocations can hang by starting MCP instead of printing help or honoring telemetry opt-out.
5. Observability and telemetry are overexposed. Logs can capture full config/result payloads, paths, stacks, and query state; telemetry is duplicated across MCP startup and tool handlers.

## Top quick wins

- Enforce `hostAllowlist` and concrete host/path filters inside `fetchPageSource()` before any network call.
- Stop score-only authority promotion in `scoreSourceEntry()`.
- Add policy fields to cache keys and disable topic fallback for versioned, changelog, URL-specific, or strict-source queries.
- Replace the plugin bootstrap `latest` pin with the package version and add a version-drift test.
- Fix `emet --help` and `emet --no-telemetry` before implicit MCP startup.
- Remove `turndown` unless a real Markdown conversion path is restored.
- Extend `test/boundary-audit.test.js` to catch dynamic imports and explicitly cover `lib/web-research.js` plus `lib/retrieval/community.js`.

## Structural problems

1. Policy is split across too many late-stage gates. Domain packs, guardrails, source filtering, ranking, sufficiency, fetch, and cache all carry part of the policy model. The result is fail-open behavior when one layer treats a field as a hint while another treats it as a guarantee.
2. Cache is optimized before it is safe. Topic fallback and global persistence are useful only after policy, project, version, URL, and source constraints are encoded in identity.
3. The facade is not clean. `lib/web-research.js` claims to be a thin re-export facade, but still exposes mutable compatibility state and legacy collector control paths.
4. Community checkpoint flow is a parallel product path. It bypasses parts of the normal ranking/fetch/synthesis pipeline and has different session assumptions.
5. Tests are broad but shallow in the wrong places. The suite has many helper-level assertions, but the missing tests are contract tests for public promises: fail-closed fetch, cache isolation, executable package bins, CLI flags, dynamic boundary imports, and runtime eval paths.

## Dedupe map

The audit reports overlap heavily. Treat these as five consolidated workstreams rather than dozens of separate bugs:

| Workstream | Includes | Source reports |
| --- | --- | --- |
| Policy hardening | allowlists, source filtering, authority, guardrails, same-domain conflicts | `04`, `05`, `06`, `12`, `14` |
| Cache and privacy safety | cache identity, project scope, topic fallback, trace redaction | `03`, `07`, `12`, `14`, `16` |
| Public surface repair | CLI flags, MCP env, package bins, bootstrap version, docs drift | `01`, `09`, `15`, `16` |
| Compatibility cleanup | collector actions, facade back-edge, sessions, checkpoint divergence | `02`, `08`, `10`, `13`, `16` |
| Product simplification | telemetry duplication, unused deps, heavy extraction, eval realism | `10`, `11`, `13`, `14` |

## Recommended posture

- Repair before publishing a confidence release: source controls, cache identity, package bins, bootstrap pin, CLI flags.
- Freeze before deleting: `collector_*`, `legacyAction`, `COLLECTOR_*`, and old interactive collector exports.
- Delete now: unused dependency `turndown`, stale docs references to missing scripts/directories, one duplicate telemetry path after choosing the retained hook.
- Defer or prove value: heavy extraction stack, URL-seeded `rss`/`youtube` collectors in topic-search flows, decorative eval fields.
