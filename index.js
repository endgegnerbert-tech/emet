import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";

import { buildWebResearchGuidance, defaultMode } from "./lib/research.js";
import { clearResearchMemory } from "./lib/research-memory.js";
import { logResearchEvent } from "./lib/local-logger.js";
import { runWebResearch, webFetch } from "./lib/web-research.js";
import { EmetRuntime } from "./lib/emet-runtime.js";

const runtime = new EmetRuntime();
const MODE_VALUES = ["fast", "deep", "code", "academic"];
const FORMAT_VALUES = ["markdown", "json", "table", "latex"];
const ACTION_VALUES = ["search", "refine", "fetch", "synthesize"];
const DEPTH_VALUES = ["1", "2", "3"];
const BREADTH_VALUES = ["2", "3", "4"];
const CONCURRENCY_VALUES = ["1", "2", "3", "4"];

function toolResponse(payload, text) {
  return { content: [{ type: "text", text }], details: payload };
}

function numberFromEnum(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePiParams(params = {}) {
  const options = params.options || {};
  const deepResearchConfig = options.deepResearchConfig || null;
  return {
    ...params,
    options: {
      ...options,
      ...(deepResearchConfig ? {
        deepResearchConfig: {
          ...deepResearchConfig,
          depth: numberFromEnum(deepResearchConfig.depth, undefined),
          breadth: numberFromEnum(deepResearchConfig.breadth, undefined),
          concurrency: numberFromEnum(deepResearchConfig.concurrency, undefined),
        },
      } : {}),
    },
  };
}

function keepWebFetchActive(pi) {
  try {
    if (typeof pi.getActiveTools !== "function" || typeof pi.getAllTools !== "function" || typeof pi.setActiveTools !== "function") return;
    const active = pi.getActiveTools();
    if (!Array.isArray(active) || !active.includes("emet") || active.includes("web_fetch")) return;
    const allNames = new Set(pi.getAllTools().map((tool) => tool.name));
    if (allNames.has("web_fetch")) pi.setActiveTools([...active, "web_fetch"]);
  } catch {
    // Pi may expose the methods before its runtime is fully bound.
  }
}

const webFetchTool = {
  name: "web_fetch",
  label: "Web Fetch",
  description: "Fetch one URL through emet's resilient fetch/cache pipeline and return raw page text.",
  promptSnippet: "Use for reading a cited URL without browser_harness or curl.",
  promptGuidelines: [
    "Use web_fetch when you need original page text from a known URL.",
    "Prefer web_fetch over curl/browser fallback for sources emet already fetched.",
  ],
  parameters: Type.Object({
    url: Type.String({ description: "URL to fetch" }),
    mode: Type.Optional(StringEnum(MODE_VALUES, { description: "Fetch profile", default: "fast" })),
    force: Type.Optional(Type.Boolean({ description: "Bypass persistent page cache where supported" })),
  }),
  async execute(_toolCallId, params, signal) {
    const payload = await webFetch(params.url || "", signal, {
      mode: params.mode || "fast",
      isolate: Boolean(params.force),
    });
    return toolResponse(payload, payload.ok ? payload.text : JSON.stringify(payload, null, 2));
  },
};

function registerWebFetchTool(pi) {
  pi.registerTool(webFetchTool);
}

export default function webResearchExtension(pi) {
  pi.on("session_start", async () => {
    registerWebFetchTool(pi);
    keepWebFetchActive(pi);
  });

  pi.on("before_agent_start", async (event) => {
    keepWebFetchActive(pi);
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

  registerWebFetchTool(pi);

  pi.registerTool({
    name: "emet",
    label: "Web Research",
    description: "Live sources, ranking, and cited answers.",
    promptSnippet: "Use for current or uncertain answers with citations.",
    promptGuidelines: [
      "Use emet for current facts, docs, best practices, comparisons, and verification.",
      "Search instead of guessing.",
      "Pick emet mode fast, deep, code, or academic as needed.",
      "Use emet interactive: true only when source/refinement choices should checkpoint; use platforms for community or sentiment retrieval.",
      "Verify factual or high-risk emet community claims with authoritative sources.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "Live web question" }),
      mode: Type.Optional(StringEnum(MODE_VALUES, { description: "Mode", default: "fast" })),
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
        requirePrimarySource: Type.Optional(Type.Boolean({ description: "Require primary/official evidence where possible; alias for requireAuthoritative plus primary-source guardrails." })),
        minYear: Type.Optional(Type.Number()),
        maxYear: Type.Optional(Type.Number()),
        preferRecent: Type.Optional(Type.Boolean()),
        files: Type.Optional(Type.Array(Type.String())),
        format: Type.Optional(StringEnum(FORMAT_VALUES, { default: "markdown" })),
        // ponytail: checkpoint/community options
        platforms: Type.Optional(Type.Array(Type.String(), { description: "Community/media retrieval backends (hn, reddit, v2ex, github, rss, youtube)" })),
        interactive: Type.Optional(Type.Boolean({ description: "Checkpoint the normal research pipeline and return compact state + next action choices" })),
        sessionId: Type.Optional(Type.String({ description: "Continue bounded in-memory session" })),
        action: Type.Optional(StringEnum(ACTION_VALUES, { description: "Checkpoint session action" })),
        queryOverride: Type.Optional(Type.String({ description: "Override query for refine action" })),
        selectedResultIds: Type.Optional(Type.Array(Type.String(), { description: "Stable result IDs from a previous checkpoint to fetch" })),
        selectedUrls: Type.Optional(Type.Array(Type.String(), { description: "URLs to fetch (fallback)" })),
        maxResultsPerPlatform: Type.Optional(Type.Number({ description: "Max results per collector platform" })),
        deepResearchConfig: Type.Optional(Type.Object({
          depth: Type.Optional(StringEnum(DEPTH_VALUES, { description: "Follow-up depth: 1, 2, or 3." })),
          breadth: Type.Optional(StringEnum(BREADTH_VALUES, { description: "Queries per depth layer: 2, 3, or 4." })),
          concurrency: Type.Optional(StringEnum(CONCURRENCY_VALUES, { description: "Concurrent searches/fetches: 1, 2, 3, or 4." })),
        })),
      })),
    }),
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      params = normalizePiParams(params);
      if (params.options?.requirePrimarySource) {
        params.options.requireAuthoritative = true;
        params.options.overlays = [...new Set([...(params.options.overlays || []), "primary-source-required"])];
      }
      const mode = params.mode ?? defaultMode(params.query || "");
      const payload = await runWebResearch(params.query || "", ctx, signal, onUpdate, {
        mode,
        force: params.force,
        isolate: params.isolate,
        ...(params.options || {}),
      });
      const wantsJson = params.options?.format === "json";
      return toolResponse(payload, wantsJson ? JSON.stringify(payload, null, 2) : (payload.ok ? payload.contentText : JSON.stringify(payload, null, 2)));
    },
  });
}
