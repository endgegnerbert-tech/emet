// Query building. Layer: base.
import { complete } from "@mariozechner/pi-ai";
import { buildDeepQueries, buildFastQueries, buildFollowUpQuery, buildActionBasedFollowUpQuery, parseDeepQueryPlan, defaultMode } from "../research.js";
import { getResearchConfig, resolveResearchModel } from "./config.js";
import { planResearch } from "../planner.js";
import { resolveQueryUnderstandingPlanning } from "../query-understanding.js";

export function textFromCompletion(response) {
  return response.content.filter((part) => part.type === "text").map((part) => part.text).join("\n").trim();
}

export function parseJsonBlock(text) {
  const trimmed = String(text || "").trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(candidate);
}

export async function completeWithResearchModel(ctx, signal, prompt, reasoningEffort = "low") {
  if (typeof ctx?.completeResearch === "function") {
    return ctx.completeResearch(prompt, { signal, reasoningEffort });
  }

  const model = resolveResearchModel(ctx);
  if (!model) return null;

  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
  if (!auth.ok || !auth.apiKey) return null;

  const response = await complete(model, {
    messages: [{ role: "user", content: [{ type: "text", text: prompt }], timestamp: Date.now() }],
  }, {
    apiKey: auth.apiKey,
    headers: auth.headers,
    signal,
    reasoningEffort,
  });

  if (response.stopReason === "aborted") return null;
  return textFromCompletion(response);
}

export async function buildQueries(query, mode = "fast", ctx, signal) {
  const config = getResearchConfig(mode);
  const hintedQueries = Array.isArray(config.queryHints) && config.queryHints.length
    ? config.queryHints.map((hint) => `${query} ${hint}`)
    : [];

  if (config.mode === "code") {
    return [...new Set([...planResearch(query, "code").subqueries, ...hintedQueries])].slice(0, config.maxQueries);
  }
  if (config.mode === "deep" || config.mode === "academic") {
    const prompt = [
      "Generate web research search queries as JSON only.",
      'Return shape: {"queries":["..."]}',
      config.mode === "academic"
        ? "Use 3-5 focused paper-search queries covering arXiv, DOI, Semantic Scholar, benchmarks, and official references."
        : "Use 3-5 focused queries covering official docs, examples, source/readme, and recent status when relevant.",
      `Question: ${query}`,
    ].join("\n");

    try {
      const text = await completeWithResearchModel(ctx, signal, prompt, "low");
      if (text) return [...new Set([...parseDeepQueryPlan(text, query, config.maxQueries), ...hintedQueries])].slice(0, config.maxQueries);
    } catch {
      // fall through
    }

    return [...new Set([...buildDeepQueries(query, config.maxQueries), ...hintedQueries])].slice(0, config.maxQueries);
  }

  return [...new Set([...buildFastQueries(query, config.maxQueries), ...hintedQueries])].slice(0, config.maxQueries);
}

export function planSubqueries(rootQuery, currentQuery, config, sufficiency) {
  const queries = [];
  if (sufficiency?.openSubQuestions?.length) queries.push(...sufficiency.openSubQuestions);
  if (queries.length === 0) queries.push(buildFollowUpQuery(currentQuery || rootQuery, []));
  return [...new Set(queries.filter(Boolean))].slice(0, Math.max(1, config.breadth || 2));
}

