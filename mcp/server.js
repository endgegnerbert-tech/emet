#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import pkg from "../package.json" with { type: "json" };
import { classifyQueryIntent } from "../lib/research.js";
import { runWebResearch } from "../lib/web-research.js";

const SERVER_NAME = "emet-mcp";
const TOOL_NAME = "emet";

function buildWebResearchGuidance() {
  return "Use emet for current facts, docs, best practices, comparisons, and citations. Search if unsure.";
}

function defaultMode(query) {
  const intent = classifyQueryIntent(query);
  if (intent === "comparison" || intent === "comparative") return "deep";
  if (intent === "academic") return "academic";
  return "fast";
}

function buildToolDefinition() {
  return {
    name: TOOL_NAME,
    description: "Live sources, ranking, and cited answers.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Live web question" },
        mode: {
          type: "string",
          enum: ["fast", "deep", "code", "academic"],
          description: "Mode",
        },
        force: { type: "boolean", description: "Ignore cache" },
        isolate: { type: "boolean", description: "No cache reuse" },
        options: {
          type: "object",
          properties: {
            allowedSources: { type: "array", items: { type: "string" } },
            maxTurns: { type: "number" },
            maxSites: { type: "number" },
            requireAuthoritative: { type: "boolean" },
            minYear: { type: "number" },
            maxYear: { type: "number" },
            preferRecent: { type: "boolean" },
            files: { type: "array", items: { type: "string" } },
            format: {
              type: "string",
              enum: ["markdown", "json", "table", "latex"],
            },
            deepResearchConfig: {
              type: "object",
              properties: {
                depth: { type: "number", enum: [1, 2, 3] },
                breadth: { type: "number", enum: [2, 3, 4] },
                concurrency: { type: "number", enum: [1, 2, 3, 4] },
              },
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  };
}

function buildInitializeResult(protocolVersion) {
  return {
    protocolVersion: protocolVersion || "2025-03-26",
    capabilities: {
      tools: {},
    },
    serverInfo: {
      name: SERVER_NAME,
      version: pkg.version,
    },
    instructions: buildWebResearchGuidance(),
  };
}

function buildToolResult(payload) {
  const text = payload?.ok ? (payload.contentText || JSON.stringify(payload, null, 2)) : JSON.stringify(payload, null, 2);
  return {
    content: [{ type: "text", text }],
    structuredContent: payload,
    isError: !payload?.ok,
  };
}

async function runResearchTool(params = {}, run = runWebResearch) {
  const mode = params.mode ?? defaultMode(params.query || "");
  const payload = await run(params.query || "", undefined, undefined, undefined, {
    mode,
    force: params.force,
    isolate: params.isolate,
    ...(params.options || {}),
  });
  return buildToolResult(payload);
}

function jsonRpcError(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: "2.0", id, error };
}

async function handleMcpRequest(message, deps = {}) {
  const run = deps.runWebResearchFn || runWebResearch;

  if (!message || typeof message !== "object") {
    return jsonRpcError(null, -32600, "Invalid Request");
  }

  if (typeof message.method !== "string") {
    return jsonRpcError(message.id ?? null, -32600, "Invalid Request");
  }

  if (message.method === "notifications/initialized") return null;

  try {
    if (message.method === "initialize") {
      return {
        jsonrpc: "2.0",
        id: message.id,
        result: buildInitializeResult(message.params?.protocolVersion),
      };
    }

    if (message.method === "tools/list") {
      return {
        jsonrpc: "2.0",
        id: message.id,
        result: { tools: [buildToolDefinition()] },
      };
    }

    if (message.method === "tools/call") {
      const params = message.params || {};
      if (params.name !== TOOL_NAME) {
        return jsonRpcError(message.id ?? null, -32602, `Unknown tool: ${String(params.name || "")}`);
      }
      const toolResult = await runResearchTool(params.arguments || {}, run);
      return {
        jsonrpc: "2.0",
        id: message.id,
        result: toolResult,
      };
    }

    return jsonRpcError(message.id ?? null, -32601, `Method not found: ${message.method}`);
  } catch (error) {
    const text = error instanceof Error ? error.stack || error.message : String(error);
    return {
      jsonrpc: "2.0",
      id: message.id ?? null,
      result: {
        content: [{ type: "text", text }],
        isError: true,
      },
    };
  }
}

export function startMcpServer({ input = process.stdin, output = process.stdout, errorOutput = process.stderr, runWebResearchFn = runWebResearch } = {}) {
  function send(message) {
    const json = JSON.stringify(message);
    output.write(`Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`);
  }

  let buffer = Buffer.alloc(0);

  function pump() {
    while (true) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;

      const headerText = buffer.slice(0, headerEnd).toString("utf8");
      const match = headerText.match(/content-length:\s*(\d+)/i);
      if (!match) {
        buffer = buffer.slice(headerEnd + 4);
        continue;
      }

      const length = Number(match[1]);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + length;
      if (buffer.length < bodyEnd) return;

      const bodyText = buffer.slice(bodyStart, bodyEnd).toString("utf8");
      buffer = buffer.slice(bodyEnd);
      if (!bodyText.trim()) continue;

      let message;
      try {
        message = JSON.parse(bodyText);
      } catch (error) {
        errorOutput.write(`${String(error)}\n`);
        continue;
      }

      void handleMcpRequest(message, { runWebResearchFn }).then((response) => {
        if (response) send(response);
      }).catch((error) => {
        const text = error instanceof Error ? error.stack || error.message : String(error);
        send({ jsonrpc: "2.0", id: message?.id ?? null, result: { content: [{ type: "text", text }], isError: true } });
      });
    }
  }

  input.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    pump();
  });

  input.on("end", () => {
    process.exitCode = 0;
  });
}

function isMainModule(metaUrl) {
  if (!process.argv[1]) return false;
  return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(metaUrl));
}

if (isMainModule(import.meta.url)) {
  startMcpServer();
}

export {
  buildInitializeResult,
  buildToolDefinition,
  buildToolResult,
  defaultMode,
  handleMcpRequest,
  runResearchTool,
};
