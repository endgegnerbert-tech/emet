import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { runWebResearch } from "../lib/web-research.js";
import { EmetRuntime } from "../lib/emet-runtime.js";

import { handleInitialize } from "./handlers/initialize.js";
import { handlePromptsList, handlePromptsGet } from "./handlers/prompts.js";
import { handleResourcesList, handleResourcesRead } from "./handlers/resources.js";
import { handleToolsList, handleToolsCall } from "./handlers/tools.js";
import { resolveHostProfile } from "./hosts/profiles.js";
import { SamplingService } from "./services/sampling.js";
import { StdioTransport } from "./transport.js";

export class McpServer {
  constructor(deps = {}) {
    this.deps = {
      env: process.env,
      ...deps,
    };
    this.transport = new StdioTransport(deps.input, deps.output, deps.errorOutput);
    this.transport.onMessage = this.handleMessage.bind(this);
    this.samplingService = new SamplingService(this.transport);
    this.runtime = new EmetRuntime();

    this.deps.samplingService = this.samplingService;
    this.deps.runtime = this.runtime;
    this.deps.hostProfile ||= resolveHostProfile({
      env: this.deps.env,
      requestedHost: this.deps.hostId,
    });
  }

  start() {
    this.transport.start();
  }

  jsonRpcError(id, code, message, data) {
    const error = { code, message };
    if (data !== undefined) error.data = data;
    return { jsonrpc: "2.0", id, error };
  }

  async handleMessage(message) {
    if (!message || typeof message !== "object") {
      this.transport.send(this.jsonRpcError(null, -32600, "Invalid Request"));
      return;
    }

    if (!message.method && message.id !== undefined) {
      if (this.samplingService.handleResponse(message)) return;
    }

    if (typeof message.method !== "string") {
      this.transport.send(this.jsonRpcError(message.id ?? null, -32600, "Invalid Request"));
      return;
    }

    if (message.method === "notifications/initialized") return;

    try {
      let result;
      switch (message.method) {
        case "initialize":
          result = await handleInitialize(message, this.deps);
          break;
        case "tools/list":
          result = await handleToolsList(message, this.deps);
          break;
        case "tools/call":
          result = await handleToolsCall(message, this.deps);
          break;
        case "prompts/list":
          result = await handlePromptsList(message, this.deps);
          break;
        case "prompts/get":
          result = await handlePromptsGet(message, this.deps);
          break;
        case "resources/list":
          result = await handleResourcesList(message, this.deps);
          break;
        case "resources/read":
          result = await handleResourcesRead(message, this.deps);
          break;
        default:
          this.transport.send(this.jsonRpcError(message.id ?? null, -32601, `Method not found: ${message.method}`));
          return;
      }

      if (message.id !== undefined && result !== undefined) {
        this.transport.send({
          jsonrpc: "2.0",
          id: message.id,
          result,
        });
      }
    } catch (error) {
      const text = error instanceof Error ? error.stack || error.message : String(error);
      this.transport.send({
        jsonrpc: "2.0",
        id: message.id ?? null,
        result: {
          content: [{ type: "text", text }],
          isError: true,
        },
      });
    }
  }
}

export function startMcpServer({
  input = process.stdin,
  output = process.stdout,
  errorOutput = process.stderr,
  runWebResearchFn = runWebResearch,
  hostId,
  env = process.env,
} = {}) {
  const server = new McpServer({ input, output, errorOutput, runWebResearchFn, hostId, env });
  server.start();
  return server;
}

function isMainModule(metaUrl) {
  if (!process.argv[1] || process.argv[1] === "-") return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(metaUrl));
  } catch {
    return false;
  }
}

if (isMainModule(import.meta.url)) {
  startMcpServer();
}
