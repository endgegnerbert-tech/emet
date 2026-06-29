# Post-Audit Roadmap

Date: 2026-06-25
Status: pragmatic execution plan

## Sequencing principle

Fix the trust boundary before cleanup. The first releases after this audit should make emet safe and deterministic, not more featureful. Prefer deletion and narrower contracts over new abstraction.

Repo verification commands from `AGENTS.md`:

```bash
npm test
npm run check
node --test test/boundary-audit.test.js
node bin/emet.js doctor
npm run pack:dry
```

## Phase 0: Pin the failing contracts

Goal: add tests that fail for the highest-risk drift before changing behavior.

Batch 0A: source and authority contract tests

- Assert `fetchPageSource()` and `webFetch()` refuse URLs outside `hostAllowlist` before network I/O.
- Assert academic provider results are filtered under restrictive `allowedSources`, `allowedSourceTypes`, and `hostAllowlist`.
- Assert `example.com/docs` does not match `/docsx`.
- Assert high-scoring blogs, GitHub issues, and GitHub discussions do not become authoritative by score alone.

Batch 0B: cache and session tests

- Assert policy-sensitive fields change cache identity.
- Assert topic fallback is skipped for versioned, changelog, URL-specific, and strict-source queries.
- Assert project-scoped cache reads cannot collide.
- Assert checkpoint resume preserves platform selection or fails explicitly.

Batch 0C: package and host tests

- Assert `emet --help` exits with usage.
- Assert `emet --no-telemetry` does not start MCP.
- Assert injected MCP env controls telemetry.
- Assert packed bin targets are executable and runnable from a temp install.

Verification:

```bash
node --test test/page-fetch-adapter.test.js test/source-scoring.test.js test/web-research.test.js
node --test test/research-session.test.js test/research-logging.test.js
node --test test/boundary-audit.test.js
npm run pack:dry
```

## Phase 1: Close policy and retrieval bypasses

Goal: make strict source controls actually strict.

Fix batch 1A: fetch boundary

- Enforce host/path allowlists in `lib/research/fetch.js` before any fetch, Jina fetch, redirect follow, or PDF extraction.
- Route `webFetch()` and collector fetch through the same policy check.
- Add segment-aware path matching.

Fix batch 1B: search boundary

- Re-filter academic provider results before ranking/caching.
- Split `allowedSources` into explicit soft hints vs strict host/path allowlists.
- Make domain packs with strict intent use concrete host/path entries only.

Fix batch 1C: authority and guardrails

- Wire guardrails into domain selection before domain hints are finalized.
- Remove score-only authority promotion.
- Keep GitHub issues/pulls/discussions non-authoritative unless a deliberate exception is added.
- Detect same-domain contradictions.

Verification:

```bash
node --test test/page-fetch-adapter.test.js test/source-scoring.test.js test/domain-packs.test.js test/research-policy-domain.test.js test/intent-router.test.js
npm test
```

## Phase 2: Make cache and logs safe

Goal: prevent stale or looser answers from replaying into stricter requests, and prevent logs from leaking high-detail local state.

Fix batch 2A: cache identity

- Include `requireAuthoritative`, `preferRecent`, years, overlays, source policy flags, query hints, source allowlists, and mode in cache identity where they affect output.
- Disable topic fallback for versioned, changelog, URL-specific, and strict-policy queries.
- Decide project isolation: implement it for reads/writes or delete the unused `project` columns.

Fix batch 2B: trace and logging

- Redact `cwd`, `stack`, raw `config`, raw cached result, and final result payloads by default.
- Put verbose traces behind explicit debug opt-in.
- Keep correlation IDs and high-level event names for supportability.

Verification:

```bash
node --test test/web-research.test.js test/research-logging.test.js
npm test
```

## Phase 3: Repair release and host surface

Goal: make install, CLI, MCP, and plugin behavior deterministic.

Fix batch 3A: CLI/MCP

- Handle global flags before implicit MCP startup.
- Thread injected env through all telemetry initialization.
- Choose one telemetry hook or remove telemetry entirely.

Fix batch 3B: npm/package/plugin

- Replace `plugins/emet/start.mjs` `latest` with `package.json.version`.
- Make published bin targets executable or repoint `package.json.bin` to executable shims.
- Add version-sync checks across package, server, plugin, and release metadata.
- Add tarball install smoke tests.

Fix batch 3C: docs and release notes

- Refresh `README.md`, `docs/quickstarts.md`, `docs/hosts/*`, and `docs/pipeline.md` to match actual CLI/scripts.
- Update release notes to mention packaging/bootstrap cleanup.

Verification:

```bash
node bin/emet.js --help
node bin/emet.js --no-telemetry
node bin/emet.js doctor
npm run pack:dry
npm run check
```

## Phase 4: Quarantine compatibility leftovers

Goal: stop old collector surfaces from steering new architecture.

Fix batch 4A: facade and boundaries

- Remove the dynamic `community.js` to `web-research.js` back-edge.
- Make `lib/web-research.js` re-export-only with a small documented public set.
- Extend boundary tests to detect dynamic imports.

Fix batch 4B: collector/session compatibility

- Freeze `collector_*`, `legacyAction`, and `COLLECTOR_*` for one release.
- Move compatibility exports to a named legacy module or mark them deprecated.
- Persist checkpoint platform state, or require platforms on resume and fail fast.
- Split URL-seeded collectors from query-search collectors.

Verification:

```bash
node --test test/boundary-audit.test.js test/collector-flow.test.js test/retrieval-community.test.js test/research-session.test.js
npm test
```

## Phase 5: Delete dead weight and make evals real

Goal: reduce maintenance cost after behavior is safe.

Fix batch 5A: dependency and extraction simplification

- Delete `turndown`.
- Decide whether article/PDF extraction is strategic. If yes, preserve metadata and make fallbacks explicit. If no, slim the stack.
- Add a `web_fetch` payload cap or chunked flow.

Fix batch 5B: eval/doc cleanup

- Make `lib/eval/runner.js` exercise mocked `runWebResearch()` turns.
- Delete decorative `expectedQuality` and `expectedClaims` fields unless enforced.
- Add docs sync checks for package scripts and existing files.

Verification:

```bash
npm test
npm run check
npm run pack:dry
```

## Parallelization guide

- Safe in parallel after Phase 0: docs refresh, version-sync test, unused dependency deletion, eval-field cleanup.
- Do not parallelize without coordination: fetch policy and cache identity, because both affect pipeline short-circuiting.
- Keep isolated: CLI/package fixes can proceed while policy fixes are underway if both sides share only tests and docs.
- Land compatibility deletion last, after a freeze/deprecation decision.

## Release checkpoints

1. Patch release candidate: policy fetch fixes, cache key safety, CLI flags, bootstrap pin, bin executability.
2. Minor release candidate: compatibility freeze notices, checkpoint/session repair, eval realism, docs sync.
3. Major release candidate if needed: remove legacy collector public surface and introduce a stricter `exports` map.
