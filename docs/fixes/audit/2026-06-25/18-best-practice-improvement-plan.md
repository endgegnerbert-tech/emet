# Best-Practice Improvement Plan

Date: 2026-06-25
Status: official-source comparison with repo follow-ups

## Sources

- [MCP: Build an MCP server](https://modelcontextprotocol.io/docs/develop/build-server)
- [MCP specification 2025-06-18: Tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools)
- [MCP: Security Best Practices](https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices)
- [npm: Creating and publishing scoped public packages](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/)
- [npm: Trusted publishing](https://docs.npmjs.com/trusted-publishers/)
- [npm: About semantic versioning](https://docs.npmjs.com/about-semantic-versioning/)
- [Node.js Learn: Publishing a package](https://nodejs.org/learn/modules/publishing-a-package)
- [Node.js API: Packages](https://nodejs.org/api/packages.html)
- [Node.js Learn: Security Best Practices](https://nodejs.org/learn/getting-started/security-best-practices)

## MCP server practices

| Best practice | Current repo gap | Follow-up |
| --- | --- | --- |
| Stdio servers must not write ordinary logs to stdout. | The audit did not confirm stdout corruption, but CLI flag-only invocations can start the stdio server and hang. Inference from MCP docs: every global CLI path should resolve before stdio startup so help/diagnostic output cannot interleave with JSON-RPC. | Add CLI preflight handling for `--help`, `--no-telemetry`, and unknown global flags before `startMcpServer()`. Add tests that assert flag-only invocations exit without starting MCP. |
| Tool definitions should have clear names, descriptions, and JSON Schema input contracts. | `lib/tool-schema.js` has schemas and `additionalProperties: false`, which is good. The gap is semantic: fields described as strict, especially `hostAllowlist`, are not enforced at every fetch path. | Treat tool-schema descriptions as contract tests. Add tests proving strict fields are enforced by `runWebResearch()`, `webFetch()`, and collector fetch paths. |
| MCP tools must validate inputs, implement access controls, rate-limit invocations, and sanitize outputs. | Input shape validation exists at schema level, but access controls are incomplete: allowlists can be bypassed by explicit fetch paths and academic providers. Output size is also unbounded for `web_fetch`. | Add fetch-boundary access checks, segment-aware host/path matching, provider result filtering, and a `web_fetch` size cap or chunking strategy. |
| Tool execution errors should be reported as tool results when the tool ran but failed. | Audit focused more on correctness than error shape. Inference from the tools spec: policy refusals from `web_fetch()` should be deterministic tool errors, not partial successful results. | Define a consistent MCP error/result policy for refused URLs, oversized payloads, invalid platform/query combinations, and unavailable extraction. |
| Local MCP servers are a trust boundary because they execute on the user's machine. | Telemetry currently crosses a third-party boundary twice, and logs can contain full configs/results. | Collapse telemetry into one optional hook, honor injected env, default to redacted logs, and document the trust boundary clearly. |
| MCP security guidance emphasizes least privilege and explicit consent for risky local behavior. | emet is read-only by product design, but its source/fetch controls are not consistently fail-closed. Inference: a read-only MCP server still needs least-privilege egress behavior because fetching arbitrary URLs is a data and network boundary. | Make egress policy explicit: allowed hosts are enforced before network I/O, redirects are validated against the same policy, and private/internal address handling is decided and tested. |

## npm publishing practices

| Best practice | Current repo gap | Follow-up |
| --- | --- | --- |
| Review package contents and remove sensitive or unnecessary information before publishing. | `package.json` uses a `files` allowlist, which is good. Reports still found stale docs, unused dependency `turndown`, and likely non-executable bin entries. | Keep `npm run pack:dry` mandatory, add a tarball smoke test, and fail if unused dependencies or stale docs enter the package. |
| Test the package before publishing, including install behavior. | Existing `npm run check` runs tests plus `npm pack --dry-run`, but it does not install the tarball and invoke `node_modules/.bin/emet`. | Add a temp-prefix install smoke test for `emet --help`, `emet doctor`, and `emet-mcp` from the packed tarball. |
| Scoped public packages need explicit public access. | `publishConfig.access` is already `public`, matching npm guidance. | Keep this and add a release check that fails if scoped package public access is removed accidentally. |
| Prefer trusted publishing/OIDC over long-lived npm tokens. | No audited release workflow was inspected. Inference from npm trusted publishing docs: if releases are automated, token-based publishing should be replaced or minimized. | Add a release follow-up to configure npm trusted publishing with GitHub Actions or the chosen CI, require 2FA/staged approval where appropriate, and remove long-lived publish tokens. |
| Semantic versioning should communicate patch/minor/major impact. | The package is `1.4.6`, but the Codex bootstrap installs `latest`, bypassing semver expectations for that host. | Pin bootstrap install target to `package.json.version` and add a version-drift test across `package.json`, `server.json`, plugin manifests, and bootstrap. |

## Node package and server security practices

| Best practice | Current repo gap | Follow-up |
| --- | --- | --- |
| Be explicit about package module type and public entry points. | `package.json` has `"type": "module"` and `"main": "./index.js"`, but no `"exports"` field. Inference from Node docs: adding `exports` could clarify the public API, but it would be breaking unless all currently supported deep imports are listed. | Freeze current public import paths first. Later, introduce `exports` only in a major or with a compatibility map that includes known supported subpaths. |
| Prefer one package format where possible and avoid dual-package hazards. | emet is ESM-only, which aligns with the "one format" guidance. | Keep ESM-only. Do not add CJS wrappers unless a real consumer need appears. |
| Use `engines` to communicate supported Node versions. | `package.json` does not declare `engines`, despite MCP docs and deps implying modern Node. | Add an `engines.node` floor after testing the actual supported version. Tie it to CI and release notes. |
| Use `npm publish --dry-run`, `.gitignore`/`.npmignore`, or package `files` to control published contents. | `files` exists and `npm run pack:dry` exists, but publish contents still include stale docs and compatibility baggage. | Upgrade `pack:dry` into a real audit: assert file list, bin modes, dependency list, release docs, and no secret-like files. |
| Use `npm ci`, lockfiles, dependency review, and vulnerability checks for supply-chain hygiene. | Existing commands use npm, and a lockfile likely drives installs. Reports found unused `turndown` and heavy optional/native parser risk. | Remove unused deps, classify heavy/native deps as required vs optional, run `npm audit` in release CI, and prefer exact behavioral tests over dependency trust. |
| Sanitize untrusted inputs and avoid prototype-pollution-prone merges. | Tool schemas reject extra top-level fields, but options are still runtime data used across config, cache, and policy. | Add tests around hostile option objects where config merges occur; use explicit object construction for policy/cache identity. |
| Avoid exposing secrets or sensitive local state through logs. | Logs can include cwd, stacks, full configs, query state, and result blobs. | Redact default logs, gate verbose logs behind opt-in debug, and add tests forbidding `cwd`, `stack`, raw `config`, and raw `result` in default JSONL events. |

## Concrete follow-up backlog

1. Contract hardening: strict fetch access checks, academic provider filtering, segment-aware host/path matching, and output-size caps.
2. Release hardening: tarball install smoke test, executable bins, bootstrap version pin, manifest version sync, `npm run pack:dry` assertions.
3. Security hygiene: single optional telemetry adapter, injected env support, redacted logs, no long-lived npm publish token in CI.
4. Package surface: document supported imports, freeze deep imports, then consider `exports` in a compatibility-safe release.
5. Dependency cleanup: delete `turndown`, re-evaluate parser/native dependencies, and ensure package files match the zero-setup promise.
