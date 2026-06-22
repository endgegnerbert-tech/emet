# Development pipeline

Use this pipeline before promoting router, research, or packaging changes.

## Standard check

```bash
npm run check
```

This runs, in order:

1. `npm test`
2. `npm run audit:roadmap`
3. `npm run pack:dry`

## Individual gates

```bash
npm test
npm run audit:roadmap
npm run audit:promotion
npm run pack:dry
```

Canonical router pipeline scripts live in grouped subdirectories under `scripts/router/` (`audit/`, `export/`, `review/`, `train/`, `eval/`, `tools/`, `deploy/`, `utils/`). Root-level script files are compatibility shims only.

## Router promotion rule

Run the stricter promotion gate only when intentionally promoting a router/model artifact:

```bash
npm run check:promotion
```

A model or policy change is not promotion-ready unless both router audits pass and the package dry-run still contains only intended publish files. Promotion gates may fail on development checkouts that intentionally do not include all model artifacts.

## Scrapling rule

Scrapling is an optional runtime fallback, not the common path. Keep `lib/page-fetch-adapter.js` fast-path-first and verify fallback behavior with:

```bash
node --test test/page-fetch-adapter.test.js test/web-research.test.js
```

## Module boundaries after prep plan (2026-06-22)

The research pipeline modularization prep plan extracted these stable seams:

| Module | Role | Pure/IO |
|--------|------|---------|
| `lib/research-contract.js` | Canonical action enum, result builders | Pure |
| `lib/research-session.js` | In-memory collector/interactive sessions | Pure (Map) |
| `lib/research-flow.js` | Flow policy: runMode, retrievalBias, authority | Pure |
| `lib/retrieval/normalize.js` | Collector result → normalized candidate | Pure |
| `lib/retrieval/community.js` | Collector-backed search + interactive mode | I/O adapter |
| `lib/web-research.js` | Main research orchestrator | Orchestrator |

### Dependency direction

```
Allowed:
  web-research.js → research-flow/session/contract/retrieval
  retrieval/*     → collectors/*, page-fetch-adapter.js
  contract        → no network modules
  flow/session    → pure modules only
  policy/evidence → normalized source objects only

Forbidden:
  research-flow.js     → fetch/search/page/collector calls
  research-evidence.js → collector/platform-specific imports
  collectors/*         → synthesis or sufficiency imports
  MCP/Pi handlers      → collector internals
```

### Boundary audit

```bash
node --test test/boundary-audit.test.js
```

This test verifies that core policy/evidence modules import no adapter internals,
adapters import no individual collector implementations, domain packs import no
I/O modules, and memory/logging/traces serialize no raw secrets.
