import { Type } from "typebox";

import { compactResearchPayload, classifyQueryIntent, inferOfficialDocsSite } from "./lib/research.js";
import { clearResearchMemory, hashResearchQuery, setResearchMemory, shouldSkipResearch } from "./lib/research-memory.js";
import { logResearchEvent } from "./lib/local-logger.js";
import { runWebResearch } from "./lib/web-research.js";

const RESEARCH_STATE = new Map();

function buildWebResearchGuidance() {
  return "Use emet for current facts, docs, best practices, comparisons, and citations. Search if unsure.";
}

function defaultMode(query) {
  const intent = classifyQueryIntent(query);
  if (intent === "comparison" || intent === "comparative") return "deep";
  if (intent === "academic") return "academic";
  return "fast";
}

function buildFastRecoveryQuery(query) {
  const docsSite = inferOfficialDocsSite(query || "");
  return docsSite ? `site:${docsSite} ${query}` : `${query} official docs`;
}

function toolResponse(payload, text) {
  return { content: [{ type: "text", text }], details: payload };
}

function compactWebResearchToolResult(event) {
  if (event.isError || event.toolName !== "emet") return null;
  const payload = event.details;
  if (!payload?.ok || payload.action !== "web_research") return null;

  const compact = compactResearchPayload(payload);
  const citationLines = Array.isArray(compact.citations)
    ? compact.citations.map((citation, index) => `${index + 1}. ${citation.text} [source ${citation.sourceIndex}]`)
    : [];
  const text = [
    payload.contentText,
    "",
    "## Citations",
    "",
    ...(citationLines.length ? citationLines : ["None"]),
    "",
    "## Status",
    "",
    `sufficient: ${compact.sufficient}`,
    `authoritativeSourcesFound: ${compact.authoritativeSourcesFound}`,
    ...(compact.conflictSummary ? [`conflictSummary: ${compact.conflictSummary}`] : []),
  ].join("\n").trim();

  return { content: [{ type: "text", text }] };
}

function getState(queryHash) {
  if (!RESEARCH_STATE.has(queryHash)) RESEARCH_STATE.set(queryHash, { count: 0, lastHash: null, lastSufficient: false, fastRecoveryAllowed: false });
  return RESEARCH_STATE.get(queryHash);
}

export default function webResearchExtension(pi) {
  pi.on("before_agent_start", async (event) => {
    RESEARCH_STATE.clear();
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

    const queryHash = hashResearchQuery(event.input.query || "");
    const state = getState(queryHash);
    const mode = event.input.mode;
    const isolate = Boolean(event.input.isolate || process.env.RESEARCH_ISOLATE === "1");
    const force = Boolean(event.input.force);
    let blocked = false;
    let reason = "";

    if (shouldSkipResearch({ queryHash, lastHash: state.lastHash, lastWasSufficient: state.lastSufficient, force, isolate })) {
      blocked = true;
      reason = "Recent emet result was already sufficient for this exact query.";
      await logResearchEvent("tool_call", {
        originalInput,
        finalInput: { ...event.input },
        queryHash,
        blocked,
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

    if (mode === "fast" && state.count === 1 && state.fastRecoveryAllowed && !force && !isolate) {
      event.input.query = buildFastRecoveryQuery(event.input.query || "");
      state.fastRecoveryAllowed = false;
    }

    state.count += 1;
    state.lastHash = queryHash;
    await logResearchEvent("tool_call", {
      originalInput,
      finalInput: { ...event.input },
      queryHash,
      blocked,
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
        const queryHash = hashResearchQuery(event.input?.query || "");
        const state = getState(queryHash);
        state.lastHash = queryHash;
        state.lastSufficient = Boolean(event.details.sufficient);
        const query = event.input?.query || "";
        state.fastRecoveryAllowed = !event.details.sufficient
          && !event.details.authoritativeSourcesFound
          && ["best_practice", "temporal", "definition"].includes(classifyQueryIntent(query || ""));
        setResearchMemory(`last:${queryHash}`, event.details);
      }
      await logResearchEvent("tool_result", {
        toolName: event.toolName,
        isError: event.isError,
        input: event.input,
        details: event.details,
      });
    }
    return compactWebResearchToolResult(event) || undefined;
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
