# Scope
Audit of public entrypoints, package publish surface, runtime/export/schema drift, and version/release/manifests mismatch.

# Files inspected
- `package.json`
- `index.js`
- `bin/emet.js`
- `bin/emet-mcp.js`
- `emet.js`
- `emet-mcp.js`
- `mcp/index.js`
- `mcp/server.js`
- `mcp-server.js`
- `lib/tool-schema.js`
- `lib/cli.js`
- `plugins/emet/start.mjs`
- `plugins/emet/.codex-plugin/plugin.json`
- `plugins/emet/.codex-plugin/mcp.json`
- `.claude-plugin/plugin.json`
- `.claude-plugin/marketplace.json`
- `.codex-plugin/plugin.json`
- `.codex-plugin/mcp.json`
- `server.json`
- `README.md`
- `CHANGELOG.md`
- `docs/tool-reference.md`
- `docs/releases/1.4.6.md`
- `npm pack --dry-run --json`

# Findings
1. Confirmed: the shipped Codex plugin bootstrap is pinned to `latest`, not the package version, so it will reinstall on every launch and can drift away from the release metadata the repo publishes. In `plugins/emet/start.mjs:8-10`, `PACKAGE_VERSION` is hardcoded to `"latest"`, and `ensureRuntime()` at `plugins/emet/start.mjs:24-36` compares the installed package against that literal string. Because the installed package’s `package.json` version will never equal `"latest"`, the bootstrap always runs `npm install ... @black-knight.dev/emet@latest`. That makes the shipped plugin nondeterministic even though `package.json`, `server.json`, and the plugin manifests all pin `1.4.6`.
2. Likely: the declared CLI entrypoints are published without execute permissions, which can break `npm install -g` / `npx` CLI launching on Unix-like systems. `package.json:9-12` declares `bin/emet.js` and `bin/emet-mcp.js` as the public bin targets, but `npm pack --dry-run --json` showed those files in the tarball with mode `420` (644), not executable. The root shims `emet.js` and `emet-mcp.js` are executable, but they are not the files npm exposes via `bin`, so the packaged CLI surface looks inconsistent.

# Risks and open questions
- I did not run a full install-from-tarball execution test, so the bin-mode issue is marked likely rather than confirmed.
- The repo intentionally ships multiple host/plugin manifests, but they are version-aligned today; the main drift is the Codex bootstrap opting out of that pin.
- `README.md`, `docs/tool-reference.md`, and `server.json` are internally consistent on the public tool names (`emet` and `web_fetch`), so I did not find a docs/schema mismatch there.

# Recommended fixes
- Replace the `latest` bootstrap pin in `plugins/emet/start.mjs` with the package’s actual version or read it from the installed manifest, and stop reinstalling when the installed version already matches the shipped release.
- Make `bin/emet.js` and `bin/emet-mcp.js` executable in the repo so the packed `bin` targets are executable in the published tarball.
- Add a release check that compares the published package version, plugin manifest versions, and Codex bootstrap version so they cannot silently diverge again.

# Suggested tests
- Install the packed tarball into a clean temp prefix and invoke `emet --help` and `emet doctor` from the installed `node_modules/.bin` path.
- Add a test that reads `plugins/emet/start.mjs` and asserts the bootstrap install target matches `package.json.version` rather than `latest`.
- Extend the pack audit to assert the published `bin/emet.js` and `bin/emet-mcp.js` entries are executable in the generated tarball.
