# Verification and module map

This doc is for maintainers. User-facing entrypoints live in `README.md`, `docs/quickstarts.md`, `docs/tool-reference.md`, and `docs/examples.md`.

## Standard check

```bash
npm run check
```

This runs, in order:

1. `npm test`
2. `npm run pack:dry`

## Individual gates

```bash
npm test
npm run pack:dry
node --test test/boundary-audit.test.js
node bin/emet.js doctor
```

`npm run pack:dry` runs the package surface audit before `npm pack --dry-run`, including bin modes, version sync, and dependency sanity.

## Current layers

| Layer | Files | Role |
| --- | --- | --- |
| Facade | `lib/web-research.js` | thin re-export facade for backward compatibility |
| Workbench | `lib/research/pipeline.js` | main research orchestrator |
| Platform | `lib/research/{queries,search,fetch,synthesis}.js` | query building, search, fetch, synthesis |
| Adapter | `lib/retrieval/community.js`, `lib/collectors/*` | community/media retrieval and normalization entry |
| Base | `lib/research-flow.js`, `lib/research-contract.js`, `lib/research-session.js`, `lib/retrieval/normalize.js` | policy, contracts, bounded session state, normalized candidates |
| Infra | `lib/research-memory.js`, `lib/local-logger.js`, `lib/tiny-router.js` | storage, logging, optional local ML/router runtime |

## Dependency direction

```text
Allowed:
  web-research.js        -> research/* re-exports only
  research/pipeline.js   -> research/*, retrieval/*, policy/base modules
  retrieval/*            -> collectors/*, normalized/base modules
  base/policy modules    -> pure helpers only
  adapters/hosts         -> public runtime/facade only

Forbidden:
  lib/web-research.js    -> new implementation logic
  base modules           -> platform/adapter imports
  collectors/*           -> synthesis or sufficiency logic
  MCP/Pi/CLI handlers    -> collector internals
```

## Page-fetch adapter note

`lib/page-fetch-adapter.js` is the small Node-side heuristic layer for blocked/thin/dynamic pages. The function name `chooseScraplingMode()` is historical naming only; the repo does **not** require a local `Scrapling/` checkout or `.venv-scrapling/` anymore.

Verify its behavior with:

```bash
node --test test/page-fetch-adapter.test.js test/web-research.test.js
```

## Boundary audit

```bash
node --test test/boundary-audit.test.js
```

This test verifies that core policy/evidence modules import no adapter internals, adapters import no individual collector implementations, domain packs import no I/O modules, and memory/logging/traces serialize no raw secrets.
