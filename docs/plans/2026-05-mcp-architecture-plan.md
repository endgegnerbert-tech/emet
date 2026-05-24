# MCP Architecture Upgrade: Stateful Runtime & ML Parity

## Context & Motivation
Currently, the `emet` MCP server acts as a "thin transport wrapper" around `runWebResearch` with a monolithic structure (`mcp/server.js`). It lacks the agentic lifecycle enrichments present in the Pi extension (e.g., `RESEARCH_STATE`, duplicate query skipping, fast recovery, and `ctx`-based model synthesis).

To make `emet` a first-class, marketplace-ready MCP server, we are upgrading it to a **Stateful Agentic Server** using a modular, non-monolithic design. It will combine ultra-fast local ML routing with MCP standard capabilities like Sampling, Prompts, and Resources.

## Architectural Principles (Best Practices)
1. **Single Responsibility Principle (SRP):** Split the monolithic server into distinct modules for transport, routing, tool execution, prompts, and resources.
2. **Fail-Safe & Graceful Degradation:** Provide robust error handling, fallbacks when MCP sampling isn't supported by the client, and proper isolation of failures.
3. **Defense in Depth / Security:** Enforce validations on all inputs via `typebox` (already in use). 

## Phase 1: Shared Agentic Runtime (`lib/emet-runtime.js`)
Extract the lifecycle logic from the Pi extension (`index.js`) into a shared runtime adapter used by both Pi and MCP.
- **Connection-scoped State:** Track `RESEARCH_STATE` per MCP session.
- **Duplicate Skip & Fast Recovery:** Prevent agents from looping on the same query by returning structured blocks directly from the MCP tool.
- **Output Compaction:** Ensure MCP `tool_result` responses are heavily compacted, highlighting citations and missing aspects, minimizing context window bloat.

## Phase 2: Non-Monolithic MCP Server Structure
Refactor `mcp/server.js` into a scalable directory structure:
```text
mcp/
├── index.js              # Entrypoint (starts transport & server)
├── server.js             # Core MCP Server instance (capabilities, state)
├── transport.js          # JSON-RPC over STDIO implementation
├── handlers/             # Modular request handlers
│   ├── initialize.js     # Handshake & capability negotiation
│   ├── tools.js          # tools/list, tools/call
│   ├── prompts.js        # prompts/list, prompts/get
│   └── resources.js      # resources/list, resources/read
├── hosts/
│   ├── profiles.js       # host detection and agent-specific MCP profile layer
│   └── prompts.js        # reusable prompt catalog filtered per host
└── services/
    └── sampling.js       # client.request("createMessage") logic
```

## Phase 3: ML Models & MCP Sampling Integration
1. **Local ML Enforcement (Routing & Policy):**
   - The **Tiny-Router** and **Scrapling Daemon** run 100% locally via IPC.
   - MCP clients instantly benefit from <0.6ms routing and high-risk domain protection.
2. **MCP Sampling (Generative Tasks):**
   - Use the **MCP Sampling Feature** (`client/sample`) to request generative completions directly from the host agent's active LLM.
   - *Graceful Degradation:* If an MCP client rejects the sampling request, gracefully fall back to deterministic heuristics (`buildFastQueries`, `fallbackSynthesis`).

## Phase 4: Exposing Native MCP Primitives
- **Tools:** The core `emet` research execution (`tools.js`).
- **Prompts:** Pre-packaged research workflows (e.g., `prompt: "Security Vulnerability Scan"`) (`prompts.js`).
- **Resources:** Cached research runs (`emet://cache/{query-hash}`) allowing agents to read historical context without re-triggering web traffic (`resources.js`).

## Execution Checkpoints
- [x] Create `mcp/` directory structure and migrate existing logic to `handlers/`.
- [x] Create `lib/emet-runtime.js` and migrate state/compaction logic.
- [x] Implement `client.request("createMessage", ...)` (MCP Sampling) in `services/sampling.js`.
- [x] Implement fallback mechanisms for unsupported sampling.
- [x] Expose `prompts/list` and `resources/list`.
- [x] Add host profiles for Claude Code, Cursor, VS Code/Copilot, Codex, Gemini, and generic MCP clients.
- [x] Add profile/current and cache/latest resources for agent-specific onboarding and context reuse.
