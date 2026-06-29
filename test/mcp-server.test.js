import test from "node:test";
import assert from "node:assert/strict";

import { buildInitializeResult, McpServer } from "../mcp/index.js";
import { buildInitializeResult as buildInitializeResultFromShim } from "../mcp-server.js";
import { handleToolsCall } from "../mcp/handlers/tools.js";
import { createTelemetry } from "../mcp/telemetry.js";

// Mock transport to capture responses
class MockTransport {
  constructor() {
    this.responses = [];
  }
  send(msg) {
    this.responses.push(msg);
  }
  start() {}
}

test("mcp initialize advertises tools capability", () => {
  const result = buildInitializeResult("2025-03-26");
  assert.equal(result.protocolVersion, "2025-03-26");
  assert.equal(typeof result.capabilities.tools, "object");
  assert.equal(result.serverInfo.name, "emet-mcp");
});

test("root mcp-server shim re-exports the MCP API", () => {
  assert.equal(buildInitializeResultFromShim("2025-03-26").serverInfo.name, "emet-mcp");
});

test("mcp tools/list exposes emet and web_fetch", async () => {
  const server = new McpServer({});
  server.transport = new MockTransport();
  await server.handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/list" });
  
  const response = server.transport.responses[0];
  const names = response.result.tools.map((tool) => tool.name);
  assert.ok(names.includes("emet"));
  assert.ok(names.includes("web_fetch"));
  assert.equal(response.result.tools.find((tool) => tool.name === "emet").inputSchema.required[0], "query");
  assert.equal(response.result.tools.find((tool) => tool.name === "web_fetch").inputSchema.required[0], "url");
});

test("mcp host profile is selected at initialize and applied to tools", async () => {
  const server = new McpServer({ env: {} });
  server.transport = new MockTransport();

  await server.handleMessage({
    jsonrpc: "2.0",
    id: 10,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      clientInfo: { name: "Cursor" },
    },
  });
  await server.handleMessage({ jsonrpc: "2.0", id: 11, method: "tools/list" });

  const initResponse = server.transport.responses[0];
  const toolsResponse = server.transport.responses[1];
  const tool = toolsResponse.result.tools[0];

  assert.equal(initResponse.result._meta["emet/hostProfile"].id, "cursor");
  assert.equal(tool._meta["emet/hostProfile"].id, "cursor");
  assert.equal(tool.annotations.readOnlyHint, true);
  assert.match(tool.description, /Cursor profile/);
});

test("mcp prompts/list is filtered by host profile", async () => {
  const server = new McpServer({ hostId: "codex", env: {} });
  server.transport = new MockTransport();

  await server.handleMessage({ jsonrpc: "2.0", id: 12, method: "prompts/list" });

  const names = server.transport.responses[0].result.prompts.map((prompt) => prompt.name);
  assert.ok(names.includes("cli_implementation_check"));
  assert.equal(names.includes("fix_build_error"), false);
});

test("mcp resources expose current profile and latest compact research", async () => {
  const server = new McpServer({
    hostId: "gemini",
    env: {},
    runWebResearchFn: async () => ({
      ok: true,
      action: "final",
      contentText: "answer",
      sufficient: true,
      authoritativeSourcesFound: true,
      citations: [],
    }),
  });
  server.transport = new MockTransport();

  await server.handleMessage({ jsonrpc: "2.0", id: 13, method: "resources/read", params: { uri: "emet://profile/current" } });
  await server.handleMessage({ jsonrpc: "2.0", id: 14, method: "tools/call", params: { name: "emet", arguments: { query: "Gemini MCP docs" } } });
  await server.handleMessage({ jsonrpc: "2.0", id: 15, method: "resources/read", params: { uri: "emet://cache/latest" } });

  const profile = JSON.parse(server.transport.responses[0].result.contents[0].text);
  const latest = JSON.parse(server.transport.responses[2].result.contents[0].text);

  assert.equal(profile.id, "gemini");
  assert.equal(latest.query, "Gemini MCP docs");
  assert.equal(latest.result.sufficient, true);
});

test("mcp tools/call delegates to the shared research engine", async () => {
  let called = null;
  const mockTransport = new MockTransport();
  const mockInput = { on: () => {} };
  
  const server = new McpServer({
    input: mockInput,
    output: { write: msg => mockTransport.send(JSON.parse(msg.split("\r\n\r\n")[1])) },
    errorOutput: { write: () => {} },
    runWebResearchFn: async (query, ctx, signal, onUpdate, options) => {
      called = { query, ctx, signal, onUpdate, options };
      return { ok: true, action: "final", contentText: "answer", answer: "answer" };
    },
  });

  await server.handleMessage({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "emet",
      arguments: { query: "What is MCP?" },
    },
  });

  const response = mockTransport.responses[0];

  assert.equal(called.query, "What is MCP?");
  assert.equal(called.options.mode, "fast");
  assert.ok(response.result.content[0].text.startsWith("answer"));
  assert.equal(response.result.structuredContent.answer, "answer");
});

test("mcp web_fetch forwards maxBytes to the fetch pipeline", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => ({
    ok: true,
    status: 200,
    url: String(url),
    headers: { get: () => "text/plain" },
    async text() {
      return "x".repeat(120);
    },
  });

  try {
    const response = await handleToolsCall({
      params: {
        name: "web_fetch",
        arguments: { url: "https://allowed.example/large", maxBytes: 25 },
      },
    }, {});

    assert.equal(response.structuredContent.ok, true);
    assert.equal(response.structuredContent.textLength, 25);
    assert.equal(response.structuredContent.textLimit, 25);
    assert.equal(response.structuredContent.truncated, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("mcp web_fetch forwards allowPrivateNetwork to the fetch pipeline", async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async (url) => {
    called = true;
    return {
      ok: true,
      status: 200,
      url: String(url),
      headers: { get: () => "text/plain" },
      async text() {
        return "private dev server response";
      },
    };
  };

  try {
    const response = await handleToolsCall({
      params: {
        name: "web_fetch",
        arguments: {
          url: "http://127.0.0.1:1234/private-mcp-allow",
          allowPrivateNetwork: true,
          force: true,
        },
      },
    }, {});

    assert.equal(response.structuredContent.ok, true);
    assert.equal(called, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("mcp tools/call triggers MCP sampling when deeply integrated", async () => {
  let calledCtx = null;
  const mockTransport = new MockTransport();
  const mockInput = { on: () => {} };

  const server = new McpServer({
    input: mockInput,
    output: { write: msg => mockTransport.send(JSON.parse(msg.split("\r\n\r\n")[1])) },
    errorOutput: { write: () => {} },
    runWebResearchFn: async (query, ctx, signal, onUpdate, options) => {
      calledCtx = ctx;
      if (ctx && ctx.completeResearch) {
        // Trigger the injected fake completeResearch
        await ctx.completeResearch("Please plan this query");
      }
      return { ok: true, action: "final", contentText: "sampled", answer: "sampled" };
    },
  });

  // We intentionally do not await handleMessage entirely because requestSample blocks until it receives a response
  // We trigger it, grab the outgoing sampling request, and fulfill it
  const handlePromise = server.handleMessage({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "emet", arguments: { query: "Deep plan request" } },
  });

  // wait for next tick so requestSample sends the transport message
  await new Promise(r => setTimeout(r, 50));

  const sampleRequest = mockTransport.responses.find(r => r.method === "sampling/createMessage");
  assert.ok(sampleRequest, "Server should send sampling request to client");
  assert.equal(sampleRequest.params.messages[0].content.text, "Please plan this query");

  // Fulfill the sampling request back to the server
  await server.handleMessage({
    jsonrpc: "2.0",
    id: sampleRequest.id,
    result: {
      content: { type: "text", text: "Here is your plan" }
    }
  });

  await handlePromise;
  
  assert.ok(calledCtx);
  assert.ok(typeof calledCtx.completeResearch === "function");
});

test("mcp telemetry uses injected env and can be disabled", async () => {
  const created = [];
  class FakePinglet {
    constructor(options) {
      created.push(options);
    }
    track(event, payload) {
      created.push({ event, payload });
    }
  }

  const telemetry = createTelemetry({
    env: { EMET_TELEMETRY_ENDPOINT: "https://telemetry.invalid/ping" },
    PingletClass: FakePinglet,
  });
  telemetry.track("run", { host: "test" });

  assert.equal(created[0].endpoint, "https://telemetry.invalid/ping");
  assert.equal(created[1].event, "run");

  const disabled = createTelemetry({
    env: { EMET_TELEMETRY_DISABLED: "1", EMET_TELEMETRY_ENDPOINT: "https://unused.invalid/ping" },
    PingletClass: FakePinglet,
  });
  disabled.track("run", { host: "disabled" });

  assert.equal(created.length, 2);
});
