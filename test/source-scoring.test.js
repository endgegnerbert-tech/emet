import test from "node:test";
import assert from "node:assert/strict";

import { buildDeepQueries, classifySourceType, detectClaimConflicts, detectCoverageGaps, detectConflictSignals, isAuthoritativeUrl, normalizePaperTitle, prioritizeSourceEntries, scoreSourceEntry } from "../lib/research.js";

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

test("scoreSourceEntry does not promote weak sources to authoritative by score alone", () => {
  const sources = [
    {
      title: "Vendor-looking blog release notes and docs",
      url: "https://blog.example.com/product/docs/release-notes",
      text: "Official docs release changelog migration guide version support stable recommended available.",
    },
    {
      title: "GitHub issue with support status",
      url: "https://github.com/example/project/issues/123",
      text: "Official docs support stable recommended available migration guide release notes.",
    },
    {
      title: "GitHub discussion with support status",
      url: "https://github.com/example/project/discussions/456",
      text: "Official docs support stable recommended available migration guide release notes.",
    },
    {
      title: "GitHub pull request with support status",
      url: "https://github.com/example/project/pull/789",
      text: "Official docs support stable recommended available migration guide release notes.",
    },
  ];

  for (const source of sources) {
    const scored = scoreSourceEntry(source, "example project release notes migration guide");
    assert.equal(scored.authoritative, false, `${source.url} should stay non-authoritative`);
  }
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


test("secondary docs hosts are not treated as authoritative official docs", () => {
  assert.equal(classifySourceType("https://sureprompts.com/docs/mcp-sampling", "Docs"), "other");
  assert.equal(isAuthoritativeUrl("https://sureprompts.com/docs/mcp-sampling"), false);
  assert.equal(classifySourceType("https://cursorcommunity.com/reference/mcp", "Reference"), "other");
  assert.equal(isAuthoritativeUrl("https://cursorcommunity.com/reference/mcp"), false);
});

test("explicit non-authoritative labels are not promoted by score", () => {
  const scored = scoreSourceEntry({
    title: "Official-looking docs mirror",
    url: "https://docs.example.com/reference",
    sourceType: "official_doc",
    authoritative: false,
    text: "official documentation reference ".repeat(20),
  }, "example official documentation reference");

  assert.equal(scored.sourceType, "official_doc");
  assert.equal(scored.authoritative, false);
  assert.ok(scored.total >= 10);
});

test("GitHub issues pulls and discussions remain non-authoritative", () => {
  for (const url of [
    "https://github.com/org/project/issues/123",
    "https://github.com/org/project/pull/456",
    "https://github.com/org/project/pulls/456",
    "https://github.com/org/project/discussions/789",
  ]) {
    const scored = scoreSourceEntry({ title: "GitHub state page", url }, "github project support status");
    assert.equal(scored.authoritative, false, `${url} should not be authoritative`);
  }
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


test("detectConflictSignals summarizes the actual disagreement", () => {
  const conflict = detectConflictSignals([
    { url: "https://docs.example.com/a", title: "Docs A", text: "Sampling is supported and available in this release." },
    { url: "https://status.example.org/b", title: "Status B", text: "Sampling is not supported for this client today." },
  ]);

  assert.equal(conflict.detected, true);
  assert.match(conflict.conflictSummary, /docs\.example\.com says/i);
  assert.match(conflict.conflictSummary, /status\.example\.org says/i);
  assert.match(conflict.conflictSummary, /disagreement on support status/i);
});

test("detectConflictSignals catches same-domain contradictory pages", () => {
  const conflict = detectConflictSignals([
    { url: "https://docs.example.com/a", title: "Docs A", text: "Sampling is supported and available in this release." },
    { url: "https://docs.example.com/b", title: "Docs B", text: "Sampling is not supported for this client today." },
  ]);

  assert.equal(conflict.detected, true);
  assert.deepEqual(conflict.conflictingSourcePairs, [[0, 1]]);
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

test("detectCoverageGaps honors immutable non-authoritative source labels", () => {
  const result = detectCoverageGaps({
    query: "example docs",
    sources: [{
      title: "Mirror",
      url: "https://docs.example.com/reference",
      sourceType: "official_doc",
      authoritative: false,
    }],
  });

  assert.equal(result.detected, true);
  assert.ok(result.missingAspects.includes("authoritative sources"));
});
