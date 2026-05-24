import pkg from "../package.json" with { type: "json" };
import { buildHostInstructions, buildHostProfileMeta, resolveHostProfile } from "./hosts/profiles.js";

const SERVER_NAME = "emet-mcp";

export function buildInitializeResult(protocolVersion, options = {}) {
  const hostProfile = options.hostProfile || resolveHostProfile({
    clientInfo: options.clientInfo,
    env: options.env,
    requestedHost: options.hostId,
  });

  return {
    protocolVersion: protocolVersion || "2025-03-26",
    capabilities: {
      tools: { listChanged: false },
      prompts: { listChanged: false },
      resources: { subscribe: false, listChanged: false },
    },
    serverInfo: {
      name: SERVER_NAME,
      version: pkg.version,
    },
    instructions: buildHostInstructions(hostProfile),
    _meta: {
      "emet/hostProfile": buildHostProfileMeta(hostProfile),
      "emet/primitives": ["tools", "prompts", "resources", "sampling"],
    },
  };
}
