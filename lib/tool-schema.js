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
