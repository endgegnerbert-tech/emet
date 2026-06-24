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

- Docs and examples: `README.md`, `docs/README.md`, `docs/tool-reference.md`, `docs/quickstarts.md`, `docs/hosts/`, `docs/examples.md`
- MCP and host packaging: `mcp/`, `configs/`, `.claude-plugin/`, `.codex-plugin/`
- Runtime research path: `lib/web-research.js` (thin facade), `lib/research/*.js`, `lib/retrieval/*.js`
- Router scripts and audits: `scripts/router/`, `ml/router/`, `docs/pipeline.md`
- Tests: `test/`

## Docs maintenance rules

- `README.md` stays the front door: short, current, task-first.
- `docs/quickstarts.md` is for first success, not architecture.
- `docs/tool-reference.md` is the stable source for modes/options/call shapes.
- `docs/examples.md` should stay copy-pasteable and code-backed.
- `docs/pipeline.md` and `docs/policies/` are maintainer docs.
- Historical release notes, plans, and fixes belong in `docs/releases/`, `docs/plans/`, `docs/fixes/`, or `docs/archive/`.
- Avoid hardcoding changing test counts in evergreen docs; keep those in release notes or verification output.

## Good first issues

Good first issues are usually docs, host config smoke tests, examples, or small CLI checks. Avoid starting with router/model promotion unless an issue explicitly says so.

## Pull request checklist

- Keep the change focused on one issue.
- Add or update tests for behavior changes.
- Run `npm test` or the narrower test command relevant to your change.
- Run `npm run pack:dry` for package/config changes.
- Do not include local cache, log, database, or harness files.

## Security

If you found a security bug, do not open a public issue first. Follow `SECURITY.md`.

## Debug bundle guidance

When reporting grounding problems, include:

- query and mode
- expected vs actual behavior
- source URLs involved
- `runtimeTrace` or a future trace bundle if available
- environment: Node version, host, emet version
