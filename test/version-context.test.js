import test from "node:test";
import assert from "node:assert/strict";

import { buildDeepQueries, buildFastQueries, scoreSearchResult } from "../lib/research.js";
import { classifyQuestionDomain } from "../lib/research-intent.js";
import { extractVersionContext, scoreVersionMatch } from "../lib/version-context.js";

test("extractVersionContext detects pinned API versions and deprecation intent", () => {
  const context = extractVersionContext("GitHub REST apiVersion=2022-11-28 deprecated endpoint");

  assert.equal(context.versionSensitive, true);
  assert.equal(context.explicitVersion, true);
  assert.equal(context.prefersPinnedDocs, true);
  assert.equal(context.prefersChangelog, true);
  assert.equal(context.deprecatedIntent, true);
  assert.deepEqual(context.normalizedTokens.map((token) => token.normalized), ["2022-11-28"]);
});

test("version-sensitive query builders preserve pinned versions and prefer changelog-style sources", () => {
  const query = "GitHub REST apiVersion 2022-11-28 deprecated endpoint";
  const fast = buildFastQueries(query, 4);
  const deep = buildDeepQueries(query, 6);

  assert.ok(fast.every((item) => !/\b2026\b/.test(item)));
  assert.ok(deep.every((item) => !/\b2026\b/.test(item)));
  assert.ok(fast.some((item) => /changelog|release notes|breaking changes/i.test(item)));
  assert.ok(deep.some((item) => /changelog|release notes|breaking changes/i.test(item)));
  assert.ok(deep.some((item) => /official docs|api versions/i.test(item)));
});

test("version scoring favors exact-version breaking changes over latest generic docs", () => {
  const query = "GitHub REST apiVersion 2022-11-28 deprecated endpoint";
  const exact = scoreSearchResult({
    title: "Breaking changes - GitHub Docs",
    url: "https://docs.github.com/en/rest/about-the-rest-api/breaking-changes?apiVersion=2022-11-28",
    snippet: "Breaking changes for REST API version 2022-11-28.",
  }, query, { preferRecent: true, allowedSources: ["docs.github.com"] });
  const latest = scoreSearchResult({
    title: "API Versions - GitHub Docs",
    url: "https://docs.github.com/en/rest/about-the-rest-api/api-versions?apiVersion=2026-03-10",
    snippet: "Current API version documentation.",
  }, query, { preferRecent: true, allowedSources: ["docs.github.com"] });

  assert.ok(exact > latest);

  const versionSignals = scoreVersionMatch({
    title: "Breaking changes - GitHub Docs",
    url: "https://docs.github.com/en/rest/about-the-rest-api/breaking-changes?apiVersion=2022-11-28",
    text: "Breaking changes for REST API version 2022-11-28.",
  }, extractVersionContext(query));
  assert.equal(versionSignals.exactVersionMatch, true);
  assert.equal(versionSignals.pageKind, "breaking_changes");
});

test("classifyQuestionDomain routes explicit deprecated version queries to changelog", () => {
  assert.equal(classifyQuestionDomain("GitHub REST apiVersion 2022-11-28 deprecated endpoint"), "changelog");
});
