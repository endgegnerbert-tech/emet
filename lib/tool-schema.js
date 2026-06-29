export const TOOL_NAME = "emet";
export const FETCH_TOOL_NAME = "web_fetch";
export const TOOL_DESCRIPTION = "Live sources, ranking, and cited answers.";
export const FETCH_TOOL_DESCRIPTION = "Fetch one URL through emet's resilient fetch/cache pipeline and return raw page text.";

export function buildFetchToolDefinition() {
  return {
    name: FETCH_TOOL_NAME,
    description: FETCH_TOOL_DESCRIPTION,
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to fetch" },
        mode: {
          type: "string",
          enum: ["fast", "deep", "code", "academic"],
          default: "fast",
          description: "Fetch profile to use for timeouts and content handling.",
        },
        force: { type: "boolean", description: "Bypass persistent page cache where supported" },
        maxBytes: {
          type: "number",
          default: 200000,
          description: "Maximum returned text characters. Larger pages return truncation metadata with nextOffset.",
        },
        allowPrivateNetwork: {
          type: "boolean",
          default: false,
          description: "Allow localhost/private/internal network URLs. Defaults fail-closed.",
        },
      },
      required: ["url"],
      additionalProperties: false,
    },
  };
}

export function buildToolDefinition() {
  return {
    name: TOOL_NAME,
    description: TOOL_DESCRIPTION,
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Live web question" },
        mode: {
          type: "string",
          enum: ["fast", "deep", "code", "academic"],
          default: "fast",
          description: "Mode. Use 'academic' for papers, 'deep' for comparisons, 'code' for docs.",
        },
        force: { type: "boolean", description: "Ignore cache" },
        isolate: { type: "boolean", description: "No cache reuse" },
        options: {
          type: "object",
          properties: {
            domain: { type: "string", description: "Explicit domain/pack alias, or auto" },
            domainHint: { type: "string", description: "Soft domain/pack hint; router may override" },
            familyHint: { type: "string", description: "Soft routing family hint such as developer-docs, regulated, academic, current-events, commerce, community, local-government, or web" },
            overlays: { type: "array", items: { type: "string" }, description: "Optional policy overlays such as changelog, shopify, official-only, recency-required" },
            sourcePolicy: { type: "string", description: "Optional source-policy overlay such as official-only, primary-source-required, recency-required, or version-sensitive" },
            forceDomain: { type: "boolean", description: "Treat domain as an explicit override instead of a hint" },
            allowedSources: { type: "array", items: { type: "string" }, description: "Soft source hints for ranking. If every entry is a concrete host or host/path, they are also applied as a strict fail-closed filter." },
            hostAllowlist: { type: "array", items: { type: "string" }, description: "Strict fail-closed host or host/path allowlist, e.g. modelcontextprotocol.io or github.com/modelcontextprotocol" },
            maxTurns: { type: "number" },
            maxSites: { type: "number" },
            requireAuthoritative: { type: "boolean" },
            requirePrimarySource: { type: "boolean", description: "Require official/primary evidence where possible; aliases to stricter authority guardrails." },
            rawPages: { type: "boolean", description: "Include full raw page texts in the response (pageTexts array). When true, each source's full text is returned so the agent can inspect pages directly without needing browser_harness or curl." },
            minYear: { type: "number" },
            maxYear: { type: "number" },
            preferRecent: { type: "boolean" },
            files: { type: "array", items: { type: "string" } },
            allowPrivateNetwork: { type: "boolean", description: "Allow localhost/private/internal network URLs. Defaults fail-closed." },
            format: {
              type: "string",
              enum: ["markdown", "json", "table", "latex"],
            },
            // ponytail: checkpoint/community options — no new public tools.
            platforms: {
              type: "array",
              items: { type: "string" },
              description: "Community/media retrieval backends (hn, reddit, v2ex, github, rss, youtube)",
            },
            interactive: { type: "boolean", description: "Checkpoint the normal research pipeline and return compact state + next action choices" },
            sessionId: { type: "string", description: "Continue bounded in-memory session" },
            action: {
              type: "string",
              enum: ["search", "refine", "fetch", "synthesize"],
              description: "Checkpoint session action",
            },
            queryOverride: { type: "string", description: "Override query for refine action" },
            selectedResultIds: {
              type: "array",
              items: { type: "string" },
              description: "Stable result IDs from a previous checkpoint to fetch",
            },
            selectedUrls: {
              type: "array",
              items: { type: "string" },
              description: "URLs to fetch (fallback when no selectedResultIds)",
            },
            maxResultsPerPlatform: { type: "number", description: "Max results per collector platform" },
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
