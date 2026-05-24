import { Type } from "typebox";

import { buildWebResearchGuidance, defaultMode } from "./lib/research.js";
import { clearResearchMemory } from "./lib/research-memory.js";
import { logResearchEvent } from "./lib/local-logger.js";
import { runWebResearch } from "./lib/web-research.js";
import { EmetRuntime } from "./lib/emet-runtime.js";

const runtime = new EmetRuntime();

function toolResponse(payload, text) {
  return { content: [{ type: "text", text }], details: payload };
}

export default function webResearchExtension(pi) {
  pi.on("before_agent_start", async (event) => {
    runtime.clear();
    clearResearchMemory();
    await logResearchEvent("agent_start", {
      systemPromptLength: String(event.systemPrompt || "").length,
      guidance: buildWebResearchGuidance(),
    });
    return { systemPrompt: `${event.systemPrompt}\n\n${buildWebResearchGuidance()}` };
  });

  pi.on("tool_call", async (event) => {
    if (event.toolName !== "emet") return;
    event.input ||= {};
    const originalInput = { ...event.input };
    if (!event.input.mode) event.input.mode = defaultMode(event.input.query || "");

    const { skip, reason, state, modifiedInput } = runtime.interceptCall(event.input);

    if (skip) {
      await logResearchEvent("tool_call", {
        originalInput,
        finalInput: { ...event.input },
        queryHash: runtime.hashQuery(event.input.query || ""),
        blocked: true,
        reason,
        state: {
          count: state.count,
          lastHash: state.lastHash,
          lastSufficient: state.lastSufficient,
          fastRecoveryAllowed: state.fastRecoveryAllowed,
        },
      });
      return { block: true, reason };
    }

    event.input = modifiedInput;

    await logResearchEvent("tool_call", {
      originalInput,
      finalInput: { ...event.input },
      queryHash: runtime.hashQuery(event.input.query || ""),
      blocked: false,
      state: {
        count: state.count,
        lastHash: state.lastHash,
        lastSufficient: state.lastSufficient,
        fastRecoveryAllowed: state.fastRecoveryAllowed,
      },
    });
  });

  pi.on("tool_result", async (event) => {
    if (event.toolName === "emet") {
      if (!event.isError && event.details?.ok) {
        runtime.interceptResult(event.input, event.details);
      }
      await logResearchEvent("tool_result", {
        toolName: event.toolName,
        isError: event.isError,
        input: event.input,
        details: event.details,
      });

      if (!event.isError && event.details?.ok) {
        const formatted = runtime.formatResponse(event.details);
        return { content: [{ type: "text", text: formatted.text }] };
      }
    }
    return undefined;
  });

  pi.registerTool({
    name: "emet",
    label: "Web Research",
    description: "Live sources, ranking, and cited answers.",
    promptSnippet: "Use for current or uncertain answers with citations.",
    promptGuidelines: [
      "Use for current facts, docs, best practices, comparisons, and verification.",
      "Search instead of guessing.",
      "Pick fast, deep, code, or academic mode as needed.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "Live web question" }),
      mode: Type.Optional(Type.Union([Type.Literal("fast"), Type.Literal("deep"), Type.Literal("code"), Type.Literal("academic")], { description: "Mode", default: "fast" })),
      force: Type.Optional(Type.Boolean({ description: "Ignore cache" })),
      isolate: Type.Optional(Type.Boolean({ description: "No cache reuse" })),
      options: Type.Optional(Type.Object({
        allowedSources: Type.Optional(Type.Array(Type.String())),
        maxTurns: Type.Optional(Type.Number()),
        maxSites: Type.Optional(Type.Number()),
        requireAuthoritative: Type.Optional(Type.Boolean()),
        minYear: Type.Optional(Type.Number()),
        maxYear: Type.Optional(Type.Number()),
        preferRecent: Type.Optional(Type.Boolean()),
        files: Type.Optional(Type.Array(Type.String())),
        format: Type.Optional(Type.Union([Type.Literal("markdown"), Type.Literal("json"), Type.Literal("table"), Type.Literal("latex")], { default: "markdown" })),
        deepResearchConfig: Type.Optional(Type.Object({
          depth: Type.Optional(Type.Union([Type.Literal(1), Type.Literal(2), Type.Literal(3)])),
          breadth: Type.Optional(Type.Union([Type.Literal(2), Type.Literal(3), Type.Literal(4)])),
          concurrency: Type.Optional(Type.Union([Type.Literal(1), Type.Literal(2), Type.Literal(3), Type.Literal(4)])),
        })),
      })),
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const mode = params.mode ?? defaultMode(params.query || "");
      const payload = await runWebResearch(params.query || "", ctx, signal, onUpdate, {
        mode,
        force: params.force,
        isolate: params.isolate,
        ...(params.options || {}),
      });
      return toolResponse(payload, payload.ok ? payload.contentText : JSON.stringify(payload, null, 2));
    },
  });
}
