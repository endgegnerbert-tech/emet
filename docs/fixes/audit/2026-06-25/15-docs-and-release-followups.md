# Scope
Docs drift, config drift, manifest drift, and release-note gaps that sit around the current release surface rather than the core research pipeline.

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
- `/Users/einarjaeger/github/emet/docs/fixes/audit/2026-06-25/12-cross-report-priority-matrix.md`
- `/Users/einarjaeger/github/emet/docs/fixes/audit/2026-06-25/13-delete-vs-repair-matrix.md`
- `/Users/einarjaeger/github/emet/docs/fixes/audit/2026-06-25/14-test-gap-matrix.md`
- `/Users/einarjaeger/github/emet/docs/fixes/audit/2026-06-25/16-fix-batch-plan.md`
- `/Users/einarjaeger/github/emet/package.json`
- `/Users/einarjaeger/github/emet/README.md`
- `/Users/einarjaeger/github/emet/CHANGELOG.md`
- `/Users/einarjaeger/github/emet/docs/pipeline.md`
- `/Users/einarjaeger/github/emet/docs/quickstarts.md`
- `/Users/einarjaeger/github/emet/docs/hosts/README.md`
- `/Users/einarjaeger/github/emet/docs/hosts/pi.md`
- `/Users/einarjaeger/github/emet/docs/releases/1.4.6.md`
- `/Users/einarjaeger/github/emet/server.json`
- `/Users/einarjaeger/github/emet/plugins/emet/start.mjs`
- `/Users/einarjaeger/github/emet/.codex-plugin/plugin.json`
- `/Users/einarjaeger/github/emet/.codex-plugin/mcp.json`
- `/Users/einarjaeger/github/emet/.claude-plugin/plugin.json`
- `/Users/einarjaeger/github/emet/.claude-plugin/marketplace.json`
- `/Users/einarjaeger/github/emet/bin/emet.js`
- `/Users/einarjaeger/github/emet/bin/emet-mcp.js`
- `/Users/einarjaeger/github/emet/emet.js`
- `/Users/einarjaeger/github/emet/emet-mcp.js`

# Findings
1. Confirmed: the Codex bootstrap is pinned to `latest` while the rest of the release surface is pinned to `1.4.6`, so one host will reinstall nondeterministically even when every manifest says the release is fixed. `plugins/emet/start.mjs` hardcodes `PACKAGE_VERSION = "latest"`, but `package.json`, `server.json`, `.codex-plugin/plugin.json`, `.claude-plugin/plugin.json`, and `.claude-plugin/marketplace.json` all declare `1.4.6`. That is config drift, not just a packaging quirk, because the bootstrap will always see the installed version as “wrong” and repull the moving tag.
2. Confirmed: the npm bin manifest points at non-executable files. `package.json` publishes `bin/emet.js` and `bin/emet-mcp.js`, but those files are mode `644` in the repo and the executable wrappers are the root shims `emet.js` and `emet-mcp.js`. The published surface therefore advertises one path while the runnable bits live somewhere else, which is exactly the kind of manifest drift that breaks installs or leaves platform behavior inconsistent.
3. Confirmed: the maintainer docs still describe router-era commands and an outdated host story. `docs/pipeline.md` references `npm run audit:roadmap`, `npm run audit:promotion`, `npm run check:promotion`, and `scripts/router/` directories that are no longer in `package.json` or the tree. `README.md`, `docs/quickstarts.md`, and the host pages also still advertise `emet --no-telemetry`, but the current CLI behavior routes flag-only invocations into the MCP server instead of a help path. The docs are now ahead of the runtime in one place and behind it in another.
4. Likely: the release notes are too narrow for the current drift. `docs/releases/1.4.6.md` frames the release as a fetch-import fix and says only `lib/research/fetch.js` changed, but the live package surface now also has bootstrap version drift, bin-mode drift, and CLI/doc mismatches. That means readers of the pinned note will not learn the release-specific cleanup they need to trust the install story.

# Risks and open questions
- The codebase still has a deliberate compatibility layer, so some docs may be intentionally conservative. The question is whether that conservatism should stay in public docs or move into a deprecated appendix.
- If `latest` is meant to be a temporary bootstrap strategy, it needs a very explicit release gate; otherwise it will keep fighting the pinned manifests forever.
- I did not see a separate release-note process, so it is unclear whether `docs/releases/*.md` are the canonical history or just a human-facing summary.

# Recommended fixes
- Batch 1: make the release identity single-sourced. Replace the `latest` bootstrap pin in `plugins/emet/start.mjs` with the package version, then align `package.json`, `server.json`, and the plugin manifests to that same version on every release.
- Batch 2: fix the publish surface. Either make `bin/emet.js` and `bin/emet-mcp.js` executable in the repo or repoint `package.json` `bin` entries at the executable root shims, then add a tarball smoke test so the published CLI paths and file modes stay honest.
- Batch 3: refresh the docs together. Rewrite `docs/pipeline.md` to match the live scripts, update `README.md`, `docs/quickstarts.md`, and `docs/hosts/*.md` to describe the actual CLI flag behavior, and add a short note to `docs/releases/1.4.6.md` or the next release note that calls out the bootstrap and packaging cleanup explicitly.

# Suggested tests
- Add a version-drift test that reads `package.json.version` and asserts the Codex bootstrap install target in `plugins/emet/start.mjs` matches it instead of `latest`.
- Add a pack smoke test that installs the tarball into a temp prefix and verifies `node_modules/.bin/emet` works, plus a tarball assertion that the published bin targets are executable.
- Add a docs sync test that fails if `docs/pipeline.md` mentions scripts or directories absent from `package.json` and the repo tree.
- Add a release-note check that ensures each pinned release note names the actual shipped surface changes, not only the last bug fix.
