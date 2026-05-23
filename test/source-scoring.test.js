import test from "node:test";
import assert from "node:assert/strict";

import { buildDeepQueries, classifySourceType, detectClaimConflicts, detectCoverageGaps, detectConflictSignals, normalizePaperTitle, prioritizeSourceEntries, scoreSourceEntry } from "../lib/research.js";

test("prioritizeSourceEntries prefers official docs over blogs", () => {
  const sources = [
    { title: "Blog", url: "https://blog.example.com/post" },
    { title: "Docs", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript" },
  ];

  assert.equal(prioritizeSourceEntries(sources, "javascript")[0].title, "Docs");
});

test("scoreSourceEntry exposes source type, score, authority, and freshness", () => {
  const scored = scoreSourceEntry({
    title: "ArXiv Paper",
    url: "https://arxiv.org/abs/1234.5678",
    publishDate: new Date().toISOString().slice(0, 10),
  }, "retrieval augmented generation");

  assert.equal(scored.sourceType, "paper");
  assert.equal(scored.authoritative, true);
  assert.equal(scored.freshness, "today");
  assert.equal(typeof scored.total, "number");
});

test("prioritizeSourceEntries keeps visible score metadata", () => {
  const ranked = prioritizeSourceEntries([
    { title: "Forum", url: "https://reddit.com/r/javascript" },
    { title: "Docs", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript" },
  ], "javascript");

  assert.equal(typeof ranked[0].score, "number");
  assert.equal(typeof ranked[0].authoritative, "boolean");
  assert.ok(["today", "this_week", "this_year", "older", "unknown"].includes(ranked[0].freshness));
});

test("classifySourceType recognizes canonical news sources", () => {
  assert.equal(classifySourceType("https://www.reuters.com/world/example-story", "Example Story"), "news");
  assert.equal(classifySourceType("https://example.com/docs/reference", "Reference"), "official_doc");
  assert.equal(classifySourceType("https://medium.com/example/post", "Post"), "blog");
});

test("buildDeepQueries adds academic paper hints", () => {
  const queries = buildDeepQueries("transformer attention paper", 4);
  assert.ok(queries.some((q) => q.includes("arxiv")));
  assert.ok(queries.some((q) => q.toLowerCase().includes("attention is all you need")));
});

test("detectConflictSignals ignores benign support wording variations", () => {
  const conflict = detectConflictSignals([
    { url: "https://docs.example.com/a", title: "Docs A", text: "Health checks are supported and recommended." },
    { url: "https://guide.example.org/b", title: "Guide B", text: "Health checks are supported; no special configuration is required." },
  ]);

  assert.equal(conflict.detected, false);
  assert.equal(conflict.conflictSummary, "");
  assert.deepEqual(conflict.conflictingSourcePairs, []);
});

test("normalizePaperTitle strips boilerplate prefixes", () => {
  assert.equal(normalizePaperTitle("Title: Example Paper"), "Example Paper");
  assert.equal(normalizePaperTitle("Paper: Semantic Paper"), "Semantic Paper");
});

test("detectClaimConflicts flags opposite claims with source evidence", () => {
  const result = detectClaimConflicts([
    { text: "Supported", source: "docs" },
    { text: "Not supported", source: "issue" },
  ]);
  assert.equal(result.detected, true);
});

test("detectCoverageGaps asks for missing authoritative sources", () => {
  const result = detectCoverageGaps({ claims: [{ text: "A", evidence: [] }] });
  assert.ok(result.missingAspects.includes("authoritative sources"));
});
