# Scope
Reviewed CLI entrypoints, MCP transport/handlers, Pi packaging/integration, and host setup/docs for drift between documented behavior and runtime behavior.

# Files inspected
- `/Users/einarjaeger/github/emet/lib/cli.js`
- `/Users/einarjaeger/github/emet/bin/emet.js`
- `/Users/einarjaeger/github/emet/bin/emet-mcp.js`
- `/Users/einarjaeger/github/emet/mcp/server.js`
- `/Users/einarjaeger/github/emet/mcp/transport.js`
- `/Users/einarjaeger/github/emet/mcp/handlers/tools.js`
- `/Users/einarjaeger/github/emet/mcp/hosts/profiles.js`
- `/Users/einarjaeger/github/emet/docs/hosts/pi.md`
- `/Users/einarjaeger/github/emet/docs/hosts/README.md`
- `/Users/einarjaeger/github/emet/docs/quickstarts.md`
- `/Users/einarjaeger/github/emet/README.md`

# Findings
1. **High risk: flag-only CLI invocations are routed into the MCP server instead of help/opt-out behavior.** In `lib/cli.js:126-166`, `runCli()` treats any invocation with no positional command as `startMcpServer()`. That means `emet --help`, `emet --no-telemetry`, and any future top-level flags never reach the help path; they just start the stdio server and hang. I confirmed this by spawning `node bin/emet.js --help` and `node bin/emet.js --no-telemetry` with a timeout: both timed out without printing usage. This directly contradicts the telemetry opt-out guidance in `README.md:158-163` and makes the documented flag unusable.
2. **Medium risk: MCP server telemetry ignores injected environment overrides.** `mcp/server.js:113-131` and `mcp/handlers/tools.js:8-15` read `process.env.EMET_TELEMETRY_ENDPOINT` directly when creating `Pinglet`, even though `startMcpServer()` accepts an `env` argument and `McpServer` stores `deps.env`. In embedded tests or host wrappers that pass a custom env map, the telemetry endpoint cannot be redirected or suppressed through the injected server context. That is a real host-integration mismatch, even if it is less user-visible than the CLI flag bug.

# Risks and open questions
- I did not find a mismatch between the shipped Pi extension entrypoint and the current docs; `docs/hosts/pi.md:3-19` matches the package-level `pi.extensions` setup.
- The main open question is whether top-level CLI flags are intentionally unsupported. If so, the help/telemetry docs should be trimmed back; if not, `runCli()` needs an explicit pre-command flag path.

# Recommended fixes
- Teach `runCli()` to recognize global flags before the implicit MCP-server fallback, with `--help` and `--no-telemetry` handled explicitly.
- Thread the injected `env` object through both Pinglet initializations so host wrappers can control telemetry without depending on ambient process state.
- If top-level flags are not intended, remove the `emet --no-telemetry` guidance from `README.md`.

# Suggested tests
- Add CLI tests for `emet --help` and `emet --no-telemetry` that assert they do not start the MCP server.
- Add a unit test for `runCli(['--help'])` that captures usage text.
- Add an MCP test that injects a custom `env` with a sentinel telemetry endpoint and verifies the server uses it instead of `process.env`.
