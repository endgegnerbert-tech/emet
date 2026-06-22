import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeCollectorResult,
  normalizeCollectorResults,
  buildCollectorGap,
} from "../lib/retrieval/normalize.js";

// --- HN normalization ---

test("normalizeCollectorResult: HN story", () => {
  const item = {
    title: "Show HN: My Project",
    url: "https://example.com",
    author: "user123",
    points: 150,
    num_comments: 45,
    objectID: "38274195",
  };
  const result = normalizeCollectorResult("hn", item, 0);
  assert.equal(result.id, "hn:38274195");
  assert.equal(result.title, "Show HN: My Project");
  assert.equal(result.url, "https://example.com");
  assert.equal(result.sourceType, "forum");
  assert.equal(result.authoritative, false);
  assert.ok(result.score > 0 && result.score <= 10);
  assert.equal(result.signals.platform, "hn");
  assert.equal(result.signals.kind, "story");
  assert.equal(result.signals.author, "user123");
  assert.equal(result.signals.comments, 45);
  assert.equal(result.signals.points, 150);
});

test("normalizeCollectorResult: HN score is log-scaled", () => {
  const low = normalizeCollectorResult("hn", { points: 1, objectID: "1" }, 0);
  const med = normalizeCollectorResult("hn", { points: 50, objectID: "2" }, 0);
  const high = normalizeCollectorResult("hn", { points: 500, objectID: "3" }, 0);
  assert.ok(low.score < med.score);
  assert.ok(med.score < high.score);
});

// --- V2EX normalization ---

test("normalizeCollectorResult: V2EX topic", () => {
  const item = {
    title: "Best Node.js framework",
    url: "https://v2ex.com/t/12345",
    author: "dev123",
    replies: 20,
  };
  const result = normalizeCollectorResult("v2ex", item, 0);
  assert.equal(result.sourceType, "forum");
  assert.equal(result.signals.platform, "v2ex");
  assert.equal(result.signals.kind, "topic");
  assert.equal(result.signals.comments, 20);
  assert.ok(result.score > 0);
});

// --- GitHub normalization ---

test("normalizeCollectorResult: GitHub repo", () => {
  const item = {
    title: "facebook/react",
    url: "https://github.com/facebook/react",
    author: "facebook",
    stargazers_count: 200000,
    open_issues_count: 500,
    kind: "repo",
  };
  const result = normalizeCollectorResult("github", item, 0);
  assert.equal(result.sourceType, "github_repo");
  assert.equal(result.signals.kind, "repo");
  assert.equal(result.signals.points, 200000);
  assert.ok(result.score >= 0 && result.score <= 10);
});

// --- RSS normalization ---

test("normalizeCollectorResult: RSS article", () => {
  const item = {
    title: "New React 19 Features",
    url: "https://blog.example.com/react-19",
    author: "Jane Doe",
    description: "React 19 brings many improvements",
  };
  const result = normalizeCollectorResult("rss", item, 0);
  assert.equal(result.sourceType, "blog");
  assert.equal(result.signals.kind, "article");
  assert.equal(result.signals.author, "Jane Doe");
  assert.equal(result.snippet, "React 19 brings many improvements");
});

// --- YouTube normalization ---

test("normalizeCollectorResult: YouTube video", () => {
  const item = {
    title: "Rust Tutorial 2024",
    url: "https://youtube.com/watch?v=abc",
    channelTitle: "Rust Channel",
    viewCount: 50000,
    commentCount: 200,
  };
  const result = normalizeCollectorResult("youtube", item, 0);
  assert.equal(result.sourceType, "video");
  assert.equal(result.signals.kind, "video");
  assert.equal(result.signals.author, "Rust Channel");
  assert.equal(result.signals.points, 50000);
});

// --- ID stability ---

test("normalizeCollectorResult: stable IDs from objectID", () => {
  const r1 = normalizeCollectorResult("hn", { objectID: "abc123", title: "T1" }, 0);
  const r2 = normalizeCollectorResult("hn", { objectID: "abc123", title: "T2" }, 5);
  assert.equal(r1.id, r2.id);
  assert.equal(r1.id, "hn:abc123");
});

test("normalizeCollectorResult: fallback ID is stable hash, not index-only", () => {
  const result = normalizeCollectorResult("rss", { title: "No ID" }, 7);
  assert.match(result.id, /^rss:[a-f0-9]{10}$/);
  assert.equal(result.id, normalizeCollectorResult("rss", { title: "No ID" }, 9).id);
});

// --- buildCollectorGap ---

test("buildCollectorGap: returns structured gap", () => {
  const gap = buildCollectorGap("hn", "API rate limit exceeded");
  assert.equal(gap.platform, "hn");
  assert.equal(gap.available, false);
  assert.equal(gap.reason, "API rate limit exceeded");
  assert.equal(gap.resultCount, 0);
  assert.deepEqual(gap.results, []);
  assert.deepEqual(gap.normalized, []);
});

// --- normalizeCollectorResults ---

test("normalizeCollectorResults: normalizes batch", () => {
  const collectorResult = {
    resultCount: 2,
    results: [
      { title: "A", url: "https://a.com", objectID: "1", points: 10 },
      { title: "B", url: "https://b.com", objectID: "2", points: 50 },
    ],
    meta: { elapsedMs: 100 },
  };
  const output = normalizeCollectorResults("hn", collectorResult);
  assert.equal(output.resultCount, 2);
  assert.equal(output.normalized.length, 2);
  assert.equal(output.normalized[0].title, "A");
  assert.equal(output.normalized[1].title, "B");
  assert.equal(output.meta.elapsedMs, 100);
});

test("normalizeCollectorResults: empty result", () => {
  const output = normalizeCollectorResults("hn", { resultCount: 0, results: [] });
  assert.equal(output.resultCount, 0);
  assert.deepEqual(output.normalized, []);
});

// --- Authoritative is always false ---

test("normalizeCollectorResult: community sources are never authoritative", () => {
  const platforms = ["hn", "v2ex", "github", "rss", "youtube"];
  for (const platform of platforms) {
    const result = normalizeCollectorResult(platform, { title: "X", url: "https://x.com" }, 0);
    assert.equal(result.authoritative, false, `${platform} should not be authoritative`);
  }
});

test("normalizeCollectorResult: social signals include evidence role and stability", () => {
  const result = normalizeCollectorResult("hn", { title: "A", url: "https://a.com", points: 5, signals: { createdAt: "2026-01-01" } }, 0);
  assert.equal(result.signals.evidenceRole, "community_signal");
  assert.equal(result.signals.platformStability, "stable");
  assert.equal(result.signals.auth, "none");
  assert.equal(result.signals.createdAt, "2026-01-01");
});
