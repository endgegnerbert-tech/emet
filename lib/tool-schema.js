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
            allowedSources: { type: "array", items: { type: "string" } },
            maxTurns: { type: "number" },
            maxSites: { type: "number" },
            requireAuthoritative: { type: "boolean" },
            rawPages: { type: "boolean", description: "Include full raw page texts in the response (pageTexts array). When true, each source's full text is returned so the agent can inspect pages directly without needing browser_harness or curl." },
            minYear: { type: "number" },
            maxYear: { type: "number" },
            preferRecent: { type: "boolean" },
            files: { type: "array", items: { type: "string" } },
            format: {
              type: "string",
              enum: ["markdown", "json", "table", "latex"],
            },
            // ponytail: collector interactive options — no new tools, just schema fields
            platforms: {
              type: "array",
              items: { type: "string" },
              description: "Explicit collector platforms (hn, v2ex, github, rss, youtube)",
            },
            interactive: { type: "boolean", description: "Return compact state + next action choices" },
            sessionId: { type: "string", description: "Continue bounded in-memory session" },
            action: {
              type: "string",
              enum: ["search", "refine", "fetch", "synthesize"],
              description: "Interactive mode action",
            },
            queryOverride: { type: "string", description: "Override query for refine action" },
            selectedResultIds: {
              type: "array",
              items: { type: "string" },
              description: "Result IDs (stable session IDs) to fetch",
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
