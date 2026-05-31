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
