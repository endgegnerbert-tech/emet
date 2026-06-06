export const TOOL_NAME = "emet";
export const TOOL_DESCRIPTION = "Live sources, ranking, and cited answers.";

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
