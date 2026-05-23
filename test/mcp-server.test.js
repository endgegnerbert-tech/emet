import test from "node:test";
import assert from "node:assert/strict";

import {
  buildInitializeResult,
  buildToolDefinition,
  handleMcpRequest,
} from "../mcp/server.js";
import { buildInitializeResult as buildInitializeResultFromShim } from "../mcp-server.js";

test("mcp initialize advertises tools capability", () => {
  const result = buildInitializeResult("2025-03-26");
  assert.equal(result.protocolVersion, "2025-03-26");
  assert.deepEqual(result.capabilities, { tools: {} });
  assert.equal(result.serverInfo.name, "emet-mcp");
});

test("root mcp-server shim re-exports the MCP API", () => {
  assert.equal(buildInitializeResultFromShim("2025-03-26").serverInfo.name, "emet-mcp");
});

test("mcp tools/list exposes emet", async () => {
  const response = await handleMcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  assert.equal(response.result.tools[0].name, buildToolDefinition().name);
  assert.equal(response.result.tools[0].inputSchema.required[0], "query");
});

test("mcp tools/call delegates to the shared research engine", async () => {
  let called = null;
  const response = await handleMcpRequest(
    {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name: "emet",
        arguments: { query: "What is MCP?" },
      },
    },
    {
      runWebResearchFn: async (query, ctx, signal, onUpdate, options) => {
        called = { query, ctx, signal, onUpdate, options };
        return { ok: true, contentText: "answer", answer: "answer" };
      },
    },
  );

  assert.equal(called.query, "What is MCP?");
  assert.equal(called.options.mode, "fast");
  assert.equal(response.result.content[0].text, "answer");
  assert.equal(response.result.structuredContent.answer, "answer");
});
