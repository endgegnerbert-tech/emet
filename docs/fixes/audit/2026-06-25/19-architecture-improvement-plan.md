# Architecture Improvement Plan

Date: 2026-06-25
Status: target architecture proposal

## Target shape

Keep the current layered design, but make the boundaries enforceable and smaller:

```
Public hosts
  bin/  mcp/  Pi extension
  import only public facade

Facade
  lib/web-research.js
  exports runWebResearch, webFetch, schemas, documented helpers only

Workbench
  lib/research/pipeline.js
  owns turn orchestration, cache policy, checkpoint handoff

Policy and planning
  lib/research/config.js
  lib/research/queries.js
  lib/research-policy.js
  lib/research-guardrails.js
  lib/domains/*

Retrieval
  lib/research/search.js
  lib/research/fetch.js
  lib/retrieval/community.js
  returns candidates/pages, never final authority decisions

Evidence and synthesis
  lib/research/ranking.js
  lib/research/coverage.js
  lib/research/synthesis.js
  turns vetted evidence into answer/output

State and infra
  lib/research-memory.js
  lib/research-session.js
  lib/local-logger.js
```

The important change is ownership: policy decides what may be retrieved, retrieval retrieves only within that policy, ranking scores without overriding policy labels, and cache stores only after the policy identity is fully known.

## Boundary rules to make real

1. `lib/web-research.js` is a re-export-only public facade. It must not expose mutable session state or old collector control helpers after the freeze window.
2. `lib/retrieval/community.js` must not import `lib/web-research.js`, statically or dynamically. If it needs fetch/synthesis helpers, those come from lower-level modules or from workbench orchestration.
3. Base/config/policy modules must not read `process.env`, touch the filesystem, or fetch. They receive normalized options and return data.
4. Fetch is the only network boundary for page bodies, so host/path allowlists and redirect policy must be enforced there before network I/O.
5. Search providers must return filtered candidates. No provider-specific append path can bypass `allowedSources`, `allowedSourceTypes`, or `hostAllowlist`.
6. Ranking cannot promote a source above policy. It may score confidence, but it cannot turn an explicitly non-authoritative source into an authoritative one.
7. Cache identity must include all fields that change admissibility, freshness, source set, or query shape.

## Simplify layers

- Merge policy naming where possible. Today `sourcePolicy`, `overlays`, domain packs, guardrails, `requireAuthoritative`, and ranking authority all sound similar but execute differently. Keep them as separate implementation pieces only if the public model says exactly how they compose.
- Move strict vs soft source handling into one explicit policy object. `allowedSources` should produce either `sourceHints` or `sourceAllowlist`; mixed keyword/host arrays should not silently disable strict behavior.
- Treat checkpoint/community as a retrieval mode, not a second product. Its results should flow through the same normalization, filtering, ranking, and synthesis contracts unless the API explicitly asks for raw checkpoint output.
- Keep `web_fetch` as a thin public helper over the same fetch policy path. It should not be a privileged bypass.

## Delete, freeze, repair

| Area | Decision | Rationale |
| --- | --- | --- |
| `turndown` dependency | Delete now | No runtime imports or tests; keeping it contradicts the package-minimality goal. |
| Duplicate telemetry path | Delete one path | Two `Pinglet` clients do not buy enough value for the added trust boundary. |
| `collector_*`, `legacyAction`, `COLLECTOR_*` | Freeze, then delete | Still wired through tests/runtime. Removing now risks quiet integration breakage. Mark deprecated and schedule a major/minor cleanup gate. |
| `runCollectorInteractive()` public export | Freeze behind compat shim | Do not keep it on the main facade long term. Move to a named legacy module or delete with migration notes. |
| `rss` and `youtube` topic search | Repair or split | They are URL-seeded collectors, not query-search collectors. Reject topic strings or move them to a separate media-fetch flow. |
| Topic cache fallback | Repair narrowly or delete | It is useful only when safe. Disable for policy-sensitive and version/URL-specific prompts first; delete if it remains hard to reason about. |
| Heavy extraction stack | Prove or slim | Either preserve richer metadata and make native fallbacks explicit, or simplify to the stdlib/regex path. |
| `exports` field in `package.json` | Defer | Useful for public-surface clarity, but breaking unless all supported deep imports are mapped. |

## Target public surface

Public runtime:

- `runWebResearch(query, options)`
- `webFetch(url, options)`
- MCP tools `emet` and `web_fetch`
- CLI commands `emet doctor`, `emet mcp` or implicit MCP startup, and explicit global help/telemetry flags

Temporary compatibility:

- `collector_*` action names
- `legacyAction`
- legacy collector/session aliases

Non-public after cleanup:

- Mutable collector sessions
- Raw cache clearing through the facade
- Collector-only interactive runner
- Internal research modules unless deliberately exported in `package.json`

## Test architecture

- Boundary tests parse both static and dynamic imports.
- Contract tests pin public tool-schema promises to runtime behavior.
- Cache tests prove project/policy/version/source isolation.
- Pack tests install the tarball and invoke the published bins.
- Runtime eval tests execute mocked `runWebResearch()` turns rather than only helper functions.
