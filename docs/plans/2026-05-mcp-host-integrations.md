# MCP Host Integration Profiles & Agent Access Layer

## Goal
Make `emet` feel native in each major MCP host without forking the server. The server keeps one core research engine and adds a small **host profile layer** that tailors instructions, tool metadata, prompts, and resources per agent.

Authoritative MCP baseline checked: MCP uses JSON-RPC with capability negotiation; servers expose **tools**, **resources**, and **prompts**; clients may provide **sampling** and **elicitation**. Therefore host-specific behavior must be modular, optional, and safe when a client does not support every primitive.

---

## Best-Practice Principles
1. **One core, many profiles:** Keep retrieval, ranking, runtime state, and sampling fallback shared. Host differences live only in profile modules.
2. **Least-privilege tool contract:** `emet` is read-only web research. Tool annotations and descriptions must make that explicit for auto-run capable IDEs.
3. **Capability-aware behavior:** Detect the host from `initialize.params.clientInfo` or `EMET_MCP_HOST`; do not require detection for correctness.
4. **Graceful degradation:** Prompts/resources/sampling improve UX but the `emet` tool must work with plain `tools/list` + `tools/call` clients.
5. **Auditable outputs:** Responses stay compact and citation-first; resources expose reusable session context instead of forcing repeat web calls.
6. **No transport lock-in:** Stdio is the default local install path; future HTTP/SSE can wrap the same server/profile modules.

---

## Implemented Module Layer
```text
mcp/
├── hosts/
│   ├── profiles.js      # host detection, profile metadata, tool annotations, integration resource
│   └── prompts.js       # prompt catalog filtered by host profile
├── handlers/
│   ├── initialize.js    # selects host profile during MCP initialize
│   ├── tools.js         # applies profile metadata to tools/list
│   ├── prompts.js       # exposes profile-specific prompts
│   └── resources.js     # exposes current profile + latest compact research result
├── initialize-result.js # shared initialize result builder
├── server.js            # reusable + directly executable compatibility entrypoint
└── index.js             # public exports
```

### Host Detection
Priority:
1. Explicit `EMET_MCP_HOST` / `MCP_HOST` / constructor `hostId`.
2. `initialize.params.clientInfo.name/title/version`.
3. Environment hints such as Cursor-specific env vars.
4. Fallback to `generic`.

Supported profile IDs:
- `generic`
- `claude-code`
- `cursor`
- `vscode-copilot`
- `codex`
- `gemini`

---

## Host Profiles

### Claude Code
- Install hint: `claude mcp add emet -- npx -y @black-knight.dev/emet`
- Optimized for implementation decisions, migrations, security checks, and ambiguity checks.
- Prompts: current docs, migration check, security scan, framework comparison.

### Cursor
- Config hint: `.cursor/mcp.json` with `npx -y @black-knight.dev/emet`.
- Tool metadata emphasizes read-only, citation-backed use for compiler errors, unknown APIs, and framework docs.
- Prompts: current docs, fix build error, migration check, framework comparison.

### VS Code / GitHub Copilot
- Config hint: `.vscode/mcp.json` or user-level MCP settings.
- Optimized for auditable enterprise use: official docs, standards, vendor advisories, and security evidence.
- Prompts: current docs, enterprise verification, security scan, migration check.

### Codex
- Config hint: Codex MCP config with `command = "npx"` and args for the package.
- Optimized for CLI/API behavior checks before implementation.
- Prompts: current docs, CLI implementation check, migration check, framework comparison.

### Gemini CLI
- Config hint: `~/.gemini/settings.json` under `mcpServers`.
- Optimized for reusable prompt/slash-command style research workflows.
- Prompts: current docs, deep dive, security scan, framework comparison.

---

## Runtime Surfaces
- `tools/list`: returns `emet` with host-specific description, read-only annotations, and `_meta.emet/hostProfile`.
- `prompts/list`: returns only prompts suited to the detected host.
- `resources/list`: exposes:
  - `emet://profile/current` — detected host profile, install hint, prompts, instructions.
  - `emet://cache/latest` — compact latest session research result.
- `initialize`: returns host-tailored instructions plus `_meta.emet/hostProfile`.

---

## Follow-Up Work
- Add optional elicitation for critically ambiguous queries only after client support is detected.
- Add streamable HTTP transport as a wrapper around the same `McpServer` and host profile layer.
- Add README host setup snippets once the exact marketplace packaging formats are finalized.
