import test from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";

import { startMcpServer } from "../mcp/index.js";

function onceData(stream) {
  return new Promise((resolve) => stream.once("data", (chunk) => resolve(chunk.toString("utf8"))));
}

test("mcp stdio transport responds with content-length framing for framed requests", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  startMcpServer({ input, output, errorOutput: new PassThrough() });

  const responsePromise = onceData(output);
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } });
  input.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);

  const response = await responsePromise;
  assert.match(response, /^Content-Length:/);
  assert.match(response, /"serverInfo":\{"name":"emet-mcp"/);
});

test("mcp stdio transport responds with json-line framing for Claude-style requests", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  startMcpServer({ input, output, errorOutput: new PassThrough() });

  const responsePromise = onceData(output);
  input.write(`${JSON.stringify({
    jsonrpc: "2.0",
    id: 0,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: { roots: {}, elicitation: {} },
      clientInfo: { name: "claude-code", version: "2.1.150" },
    },
  })}\n\n`);

  const response = await responsePromise;
  assert.doesNotMatch(response, /^Content-Length:/);
  assert.match(response, /"protocolVersion":"2025-11-25"/);
  assert.match(response, /"emet\/hostProfile"/);
});
