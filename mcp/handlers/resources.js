import { compactResearchPayload } from "../../lib/research.js";
import { buildHostResource } from "../hosts/profiles.js";

function latestResearchResource(runtime) {
  const latest = runtime?.getLatestResearch?.();
  if (!latest?.payload) return { message: "No cached research available yet." };

  return {
    query: latest.query,
    queryHash: latest.queryHash,
    createdAt: latest.createdAt,
    result: latest.payload?.ok && (latest.payload.action === "final" || latest.payload.action === "web_research" || latest.payload.legacyAction === "web_research")
      ? compactResearchPayload(latest.payload)
      : latest.payload,
  };
}

function jsonResourceContents(uri, value) {
  return {
    contents: [
      {
        uri,
        mimeType: "application/json",
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}

export async function handleResourcesList(message, deps) {
  const profile = deps.hostProfile;
  return {
    resources: [
      {
        uri: "emet://profile/current",
        name: `Current Host Profile: ${profile?.displayName || "Generic MCP Host"}`,
        description: "Detected host integration profile, install hint, prompts, and tool behavior.",
        mimeType: "application/json",
      },
      {
        uri: "emet://cache/latest",
        name: "Latest Research Run",
        description: "The most recent research result in this MCP session, compacted for reuse.",
        mimeType: "application/json",
      },
    ],
  };
}

export async function handleResourcesRead(message, deps) {
  const params = message.params || {};
  const uri = params.uri;

  if (uri === "emet://profile/current") {
    return jsonResourceContents(uri, buildHostResource(deps.hostProfile));
  }

  if (uri === "emet://cache/latest") {
    return jsonResourceContents(uri, latestResearchResource(deps.runtime));
  }

  throw new Error(`Resource not found: ${uri}`);
}
