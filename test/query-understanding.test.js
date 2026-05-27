import test from "node:test";
import assert from "node:assert/strict";

import {
  applyQueryUnderstandingToConfig,
  classifyQueryUnderstandingHeuristically,
  classifyQueryUnderstandingKeywordBaseline,
  mergeQueryUnderstandingPrediction,
  resolveQueryUnderstandingPlanning,
} from "../lib/query-understanding.js";

test("heuristic query understanding detects comparison queries", () => {
  const result = classifyQueryUnderstandingHeuristically("React 19 vs Vue 3 performance comparison");
  assert.equal(result.query_shape, "comparison");
  assert.equal(result.answer_shape, "comparison_table");
  assert.equal(result.ambiguity, "medium");
});

test("heuristic query understanding detects version-sensitive official-doc questions", () => {
  const result = classifyQueryUnderstandingHeuristically("Chrome extension manifest v2 deprecation timeline");
  assert.equal(result.query_shape, "current_or_version_sensitive");
  assert.equal(result.source_family, "official_docs");
  assert.equal(result.recency_need, "helpful");
});

test("heuristic query understanding detects sensitive queries conservatively", () => {
  const result = classifyQueryUnderstandingHeuristically("capital gains tax Germany 2026");
  assert.equal(result.query_shape, "legal_medical_finance_sensitive");
  assert.equal(result.source_family, "government_or_legal");
  assert.equal(result.answer_shape, "citation_heavy");
});

test("keyword baseline stays simpler than the main heuristic", () => {
  const baseline = classifyQueryUnderstandingKeywordBaseline("How to migrate from Next.js 14 to 15");
  assert.equal(baseline.query_shape, "howto");
  assert.equal(baseline.answer_shape, "step_by_step");
});

test("planner config gets only additive boosts from query understanding", () => {
  const config = applyQueryUnderstandingToConfig({ maxTurns: 1, maxQueries: 2, queryHints: ["existing"] }, {
    query_shape: "academic_review",
    answer_shape: "citation_heavy",
    source_family: "academic",
    recency_need: "helpful",
    ambiguity: "high",
  });

  assert.equal(config.preferRecent, true);
  assert.equal(config.maxTurns, 2);
  assert.equal(config.maxQueries, 3);
  assert.ok(config.queryHints.includes("existing"));
  assert.ok(config.queryHints.includes("site:arxiv.org"));
  assert.ok(config.queryHints.includes("references"));
});

test("mergeQueryUnderstandingPrediction falls back only on abstained labels", () => {
  const merged = mergeQueryUnderstandingPrediction("What is MCP", {
    query_shape: "explanation",
    answer_shape: null,
    source_family: "official_docs",
    recency_need: null,
    ambiguity: "low",
    confidence: 0.77,
    acceptedAny: true,
    abstainedLabels: ["answer_shape", "recency_need"],
  });

  assert.equal(merged.final.query_shape, "explanation");
  assert.equal(merged.final.source_family, "official_docs");
  assert.equal(typeof merged.final.answer_shape, "string");
  assert.equal(typeof merged.final.recency_need, "string");
  assert.equal(merged.decisionSource, "tiny_router");
});

test("resolveQueryUnderstandingPlanning keeps config shaping in the service layer", () => {
  const planning = resolveQueryUnderstandingPlanning(
    { maxTurns: 1, maxQueries: 2, queryHints: [] },
    "retrieval augmented generation benchmark papers",
    null,
    { domain: "papers", mode: "academic" },
  );

  assert.equal(planning.decision.final.query_shape, "academic_review");
  assert.equal(planning.config.maxQueries, 3);
  assert.ok(planning.config.queryHints.includes("site:arxiv.org"));
});
