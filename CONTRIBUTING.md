# Contributing to emet

Thanks for helping. Start small and keep changes verifiable.

## Quickstart

```bash
npm install
npm test
npm run pack:dry
```

Use the full local gate before opening a PR:

```bash
npm run check
```

## Where to start

- Docs and examples: `README.md`, `docs/quickstarts.md`, `docs/examples.md`
- MCP and host packaging: `mcp/`, `configs/`, `.claude-plugin/`, `.codex-plugin/`
- Runtime research path: `lib/web-research.js`, `lib/research*.js`
- Router scripts and audits: `scripts/router/`, `ml/router/`, `docs/pipeline.md`
- Tests: `test/`

## Good first issues

Good first issues are usually docs, host config smoke tests, examples, or small CLI checks. Avoid starting with router/model promotion unless an issue explicitly says so.

## Pull request checklist

- Keep the change focused on one issue.
- Add or update tests for behavior changes.
- Run `npm test` or the narrower test command relevant to your change.
- Run `npm run pack:dry` for package/config changes.
- Do not include local cache, log, database, or harness files.

## Debug bundle guidance

When reporting grounding problems, include:

- query and mode
- expected vs actual behavior
- source URLs involved
- `runtimeTrace` or a future trace bundle if available
- environment: Node version, host, emet version
