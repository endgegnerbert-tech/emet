import { Type } from "typebox";

import { buildWebResearchGuidance, defaultMode } from "./lib/research.js";
import { clearResearchMemory } from "./lib/research-memory.js";
import { logResearchEvent } from "./lib/local-logger.js";
import { runWebResearch, webFetch } from "./lib/web-research.js";
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
        name: "emet",
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
      name: "emet",
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
    name: "web_fetch",
    label: "Web Fetch",
    description: "Fetch one URL through emet's resilient fetch/cache pipeline and return raw page text.",
    promptSnippet: "Use for reading a cited URL without browser_harness or curl.",
    promptGuidelines: [
      "Use when you need original page text from a known URL.",
      "Prefer this over curl/browser fallback for sources emet already fetched.",
    ],
    parameters: Type.Object({
      url: Type.String({ description: "URL to fetch" }),
      mode: Type.Optional(Type.Union([Type.Literal("fast"), Type.Literal("deep"), Type.Literal("code"), Type.Literal("academic")], { description: "Fetch profile", default: "fast" })),
      force: Type.Optional(Type.Boolean({ description: "Bypass persistent page cache where supported" })),
    }),
    async execute(_toolCallId, params, signal) {
      const payload = await webFetch(params.url || "", signal, {
        mode: params.mode || "fast",
        isolate: Boolean(params.force),
      });
      return toolResponse(payload, payload.ok ? payload.text : JSON.stringify(payload, null, 2));
    },
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
      "Use interactive: true only when source/refinement choices should checkpoint; use platforms for community or sentiment retrieval.",
      "Verify factual or high-risk community claims with authoritative sources.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "Live web question" }),
      mode: Type.Optional(Type.Union([Type.Literal("fast"), Type.Literal("deep"), Type.Literal("code"), Type.Literal("academic")], { description: "Mode", default: "fast" })),
      force: Type.Optional(Type.Boolean({ description: "Ignore cache" })),
      isolate: Type.Optional(Type.Boolean({ description: "No cache reuse" })),
      options: Type.Optional(Type.Object({
        domain: Type.Optional(Type.String({ description: "Explicit domain/pack alias, or auto" })),
        domainHint: Type.Optional(Type.String({ description: "Soft domain/pack hint; router may override" })),
        familyHint: Type.Optional(Type.String({ description: "Soft routing family hint" })),
        overlays: Type.Optional(Type.Array(Type.String(), { description: "Optional policy overlays" })),
        sourcePolicy: Type.Optional(Type.String({ description: "Optional source-policy overlay" })),
        forceDomain: Type.Optional(Type.Boolean({ description: "Treat domain as explicit override" })),
        allowedSources: Type.Optional(Type.Array(Type.String(), { description: "Soft source hints for ranking. If every entry is a concrete host or host/path, they are also applied as a strict fail-closed filter." })),
        hostAllowlist: Type.Optional(Type.Array(Type.String(), { description: "Strict fail-closed host or host/path allowlist" })),
        maxTurns: Type.Optional(Type.Number()),
        maxSites: Type.Optional(Type.Number()),
        requireAuthoritative: Type.Optional(Type.Boolean()),
        rawPages: Type.Optional(Type.Boolean({ description: "Include full raw page texts in pageTexts array." })),
        minYear: Type.Optional(Type.Number()),
        maxYear: Type.Optional(Type.Number()),
        preferRecent: Type.Optional(Type.Boolean()),
        files: Type.Optional(Type.Array(Type.String())),
        format: Type.Optional(Type.Union([Type.Literal("markdown"), Type.Literal("json"), Type.Literal("table"), Type.Literal("latex")], { default: "markdown" })),
        // ponytail: checkpoint/community options
        platforms: Type.Optional(Type.Array(Type.String(), { description: "Community/media retrieval backends (hn, v2ex, github, rss, youtube)" })),
        interactive: Type.Optional(Type.Boolean({ description: "Checkpoint the normal research pipeline and return compact state + next action choices" })),
        sessionId: Type.Optional(Type.String({ description: "Continue bounded in-memory session" })),
        action: Type.Optional(Type.Union([Type.Literal("search"), Type.Literal("refine"), Type.Literal("fetch"), Type.Literal("synthesize")], { description: "Checkpoint session action" })),
        queryOverride: Type.Optional(Type.String({ description: "Override query for refine action" })),
        selectedResultIds: Type.Optional(Type.Array(Type.String(), { description: "Stable result IDs from a previous checkpoint to fetch" })),
        selectedUrls: Type.Optional(Type.Array(Type.String(), { description: "URLs to fetch (fallback)" })),
        maxResultsPerPlatform: Type.Optional(Type.Number({ description: "Max results per collector platform" })),
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
