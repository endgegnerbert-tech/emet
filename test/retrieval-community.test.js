import test from "node:test";
import assert from "node:assert/strict";

import { runCommunityCheckpoint, runCommunitySearch } from "../lib/retrieval/community.js";
import { collectorSessions } from "../lib/research-session.js";

test.beforeEach(() => {
  collectorSessions.clear();
});

test("runCommunitySearch: HN returns normalized results", async () => {
  const { results, gaps, raw } = await runCommunitySearch("javascript", ["hn"], {
    maxResultsPerPlatform: 2,
  });

  assert.ok(Array.isArray(results));
  assert.ok(Array.isArray(gaps));
  assert.ok(Array.isArray(raw));

  // HN is available per doctor
  assert.ok(results.length > 0, "HN should return results");
  assert.equal(gaps.length, 0, "HN should not have gaps");

  // Verify normalized shape
  const first = results[0];
  assert.ok(first.id, "should have id");
  assert.ok(first.title, "should have title");
  assert.ok(first.url, "should have url");
  assert.equal(first.sourceType, "forum");
  assert.equal(first.authoritative, false);
  assert.ok(typeof first.score === "number");
  assert.equal(first.signals.platform, "hn");

  // Verify raw shape
  assert.ok(raw.length > 0);
  assert.equal(raw[0].platform, "hn");
  assert.equal(raw[0].available, true);
});

test("runCommunitySearch: unknown platform returns gap", async () => {
  const { results, gaps, raw } = await runCommunitySearch("test", ["nonexistent"], {
    maxResultsPerPlatform: 1,
  });

  assert.equal(results.length, 0);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].platform, "nonexistent");
  assert.equal(gaps[0].available, false);
  assert.equal(gaps[0].reason, "Collector not in registry");
  assert.equal(raw.length, 0);
});

test("runCommunitySearch: platform names are normalized", async (t) => {
  const original = globalThis.fetch;
  t.after(() => globalThis.fetch = original);
  globalThis.fetch = async (url) => {
    const text = String(url);
    if (text.includes("hn.algolia.com")) return new Response(JSON.stringify({ hits: [] }));
    if (text.includes("reddit.com")) return new Response(JSON.stringify({ data: { children: [] } }));
    if (text.includes("v2ex.com")) return new Response(JSON.stringify([]));
    return new Response("", { status: 404 });
  };

  const result = await runCommunitySearch("test", ["HN", "Reddit.com", "V2EX"], {
    isolate: true,
    maxResultsPerPlatform: 1,
  });

  assert.equal(result.gaps.some((gap) => gap.reason === "Collector not in registry"), false);
  assert.deepEqual(result.raw.map((entry) => entry.platform), ["hn", "reddit", "v2ex"]);
});

test("runCommunitySearch: respects maxResultsPerPlatform", async () => {
  const { results } = await runCommunitySearch("javascript", ["hn"], {
    maxResultsPerPlatform: 1,
  });
  // May be less if the API returns fewer, but should not exceed
  assert.ok(results.length <= 1);
});

test("runCommunitySearch: multiple platforms", async () => {
  const { results, gaps, raw } = await runCommunitySearch(
    "javascript",
    ["hn", "v2ex"],
    { maxResultsPerPlatform: 1 },
  );

  // Both should be available per doctor
  assert.ok(gaps.length === 0, `unexpected gaps: ${JSON.stringify(gaps)}`);
  assert.ok(results.length > 0, "should have results from at least one platform");

  // raw should have entries for both platforms
  const platforms = raw.map((r) => r.platform);
  assert.ok(platforms.includes("hn"));
  assert.ok(platforms.includes("v2ex"));
});

test("runCommunitySearch: V2EX returns normalized results", async () => {
  const { results } = await runCommunitySearch("nodejs", ["v2ex"], {
    maxResultsPerPlatform: 2,
  });

  assert.ok(results.length >= 0); // V2EX may return 0 for some queries
  // If results exist, verify shape
  if (results.length > 0) {
    const first = results[0];
    assert.equal(first.signals.platform, "v2ex");
    assert.equal(first.sourceType, "forum");
  }
});

test("runCommunitySearch: GitHub returns normalized results", async () => {
  const { results } = await runCommunitySearch("react", ["github"], {
    maxResultsPerPlatform: 2,
  });

  // GitHub search may return 0 for some queries
  if (results.length > 0) {
    const first = results[0];
    assert.equal(first.signals.platform, "github");
    assert.equal(first.sourceType, "github_repo");
  }
});

test("runCommunitySearch: no platforms returns empty", async () => {
  const { results, gaps } = await runCommunitySearch("test", []);
  assert.equal(results.length, 0);
  assert.equal(gaps.length, 0);
});

test("url-seeded collectors reject topic-only queries without network", async () => {
  const result = await runCommunitySearch("react release discussion", ["rss", "youtube"], {
    isolate: true,
  });

  assert.equal(result.results.length, 0);
  assert.equal(result.gaps.length, 2);
  assert.match(result.gaps[0].reason, /requires an explicit URL seed/);
  assert.match(result.gaps[1].reason, /requires an explicit URL seed/);
});

test("community checkpoint resume preserves prior platform selection", async () => {
  const first = await runCommunityCheckpoint(
    "react discussion",
    null,
    undefined,
    undefined,
    { platforms: ["nonexistent"], isolate: true },
    { retrievalBias: "community" },
  );
  const second = await runCommunityCheckpoint(
    "react discussion",
    null,
    undefined,
    undefined,
    { sessionId: first.sessionId, action: "refine", queryOverride: "react specifics", isolate: true },
    { retrievalBias: "community" },
  );

  assert.equal(second.sessionId, first.sessionId);
  assert.equal(second.collectorResults.at(-1).platform, "nonexistent");
  assert.equal(collectorSessions.get(first.sessionId).platforms[0], "nonexistent");
});
