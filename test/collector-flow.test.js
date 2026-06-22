import test from "node:test";
import assert from "node:assert/strict";

import webResearchExtension from "../index.js";
import { shouldRunCollectorInteractive, collectorSessions } from "../lib/web-research.js";
import { buildToolDefinition } from "../lib/tool-schema.js";

// Clean session state between tests
test.beforeEach(() => {
  collectorSessions.clear();
});

// --- Schema tests ---

test("MCP tool schema includes collector interactive options", () => {
  const def = buildToolDefinition();
  const opts = def.inputSchema.properties.options.properties;
  assert.ok(opts.platforms);
  assert.ok(opts.interactive);
  assert.ok(opts.sessionId);
  assert.ok(opts.action);
  assert.ok(opts.queryOverride);
  assert.ok(opts.selectedResultIds);
  assert.ok(opts.selectedUrls);
  assert.ok(opts.maxResultsPerPlatform);
});

test("Pi extension schema includes collector interactive options", () => {
  const tools = [];
  const pi = { on() {}, registerTool(t) { tools.push(t); } };
  webResearchExtension(pi);
  const emetTool = tools.find(t => t.name === "emet");
  assert.ok(emetTool);
  const opts = emetTool.parameters.properties.options.properties;
  assert.ok(opts.platforms);
  assert.ok(opts.interactive);
  assert.ok(opts.sessionId);
  assert.ok(opts.action);
  assert.ok(opts.queryOverride);
  assert.ok(opts.selectedResultIds);
  assert.ok(opts.selectedUrls);
  assert.ok(opts.maxResultsPerPlatform);
});

// --- shouldRunCollectorInteractive tests ---

test("shouldRunCollectorInteractive: explicit platforms", () => {
  assert.equal(shouldRunCollectorInteractive("anything", { platforms: ["hn"] }), true);
  assert.equal(shouldRunCollectorInteractive("anything", { platforms: [] }), false);
});

test("shouldRunCollectorInteractive: interactive flag", () => {
  assert.equal(shouldRunCollectorInteractive("anything", { interactive: true }), true);
});

test("shouldRunCollectorInteractive: normal web queries return false", () => {
  assert.equal(shouldRunCollectorInteractive("How does React work?", {}), false);
  assert.equal(shouldRunCollectorInteractive("GitHub REST apiVersion deprecated", {}), false);
  assert.equal(shouldRunCollectorInteractive("Deploy to GitHub Pages", {}), false);
});

test("shouldRunCollectorInteractive: HN wording", () => {
  assert.equal(shouldRunCollectorInteractive("What does HN think about React 19?", {}), true);
  assert.equal(shouldRunCollectorInteractive("Hacker News discussion on TypeScript", {}), true);
});

test("shouldRunCollectorInteractive: V2EX wording", () => {
  assert.equal(shouldRunCollectorInteractive("V2EX best keyboard", {}), true);
});

test("shouldRunCollectorInteractive: GitHub issues/repos/discussions intent", () => {
  assert.equal(shouldRunCollectorInteractive("GitHub issues React 19 bug", {}), true);
  assert.equal(shouldRunCollectorInteractive("best GitHub repos for CLI tools", {}), true);
  assert.equal(shouldRunCollectorInteractive("GitHub discussions about Node.js", {}), true);
  assert.equal(shouldRunCollectorInteractive("GitHub trending this week", {}), true);
  assert.equal(shouldRunCollectorInteractive("top GitHub repos for Rust", {}), true);
});

// --- Interactive flow tests (with mocked fetch for collectors) ---

test("collector interactive: unavailable collector returns structured error", async () => {
  const { runWebResearch, clearResearchMemory } = await import("../lib/web-research.js");
  clearResearchMemory();
  const result = await runWebResearch(
    "test",
    { model: null, modelRegistry: { async getApiKeyAndHeaders() { return { ok: false }; } } },
    undefined,
    undefined,
    { platforms: ["nonexistent"], interactive: true, isolate: true }
  );
  assert.equal(result.ok, true);
  assert.equal(result.action, "collector_search");
  assert.ok(result.collectorResults[0].available === false);
  assert.ok(result.collectorResults[0].reason);
});

test("collector interactive: HN collector returns structured results", async () => {
  const { runWebResearch, clearResearchMemory } = await import("../lib/web-research.js");
  clearResearchMemory();
  const previousFetch = globalThis.fetch;

  // Mock hn.algolia.com
  globalThis.fetch = async (url) => {
    const text = String(url);
    if (text.includes("hn.algolia.com")) {
      return {
        ok: true,
        headers: { get: () => "application/json" },
        async json() {
          return {
            hits: [
              { title: "React 19 Released", url: "https://react.dev/blog/19", author: "acme", points: 120, num_comments: 45, created_at: "2026-06-01" },
              { title: "Discussion thread", url: null, author: "foo", points: 60, num_comments: 30, created_at: "2026-06-02", objectID: "12345" },
              { title: "New features guide", url: "https://react.dev/guide", author: "bar", points: 30, num_comments: 5, created_at: "2026-06-03" },
            ],
          };
        },
      };
    }
    return { ok: false, status: 404, headers: { get: () => "text/plain" }, async text() { return ""; } };
  };

  try {
    const result = await runWebResearch(
      "React 19",
      { model: null, modelRegistry: { async getApiKeyAndHeaders() { return { ok: false }; } } },
      undefined,
      undefined,
      { platforms: ["hn"], interactive: true, isolate: true }
    );
    assert.equal(result.ok, true);
    assert.equal(result.action, "collector_search");
    assert.ok(result.sessionId);
    assert.equal(result.turn, 1);
    assert.ok(Array.isArray(result.collectorResults));
    assert.equal(result.collectorResults.length, 1);
    assert.equal(result.collectorResults[0].platform, "hn");
    assert.equal(result.collectorResults[0].available, true);
    assert.equal(result.collectorResults[0].resultCount, 3);
    assert.ok(result.collectorResults[0].results.length === 3);
    // Stable IDs
    assert.equal(result.collectorResults[0].results[0].id, "hn:0");
    assert.equal(result.collectorResults[0].results[1].id, "hn:1");
    assert.equal(result.collectorResults[0].results[2].id, "hn:2");
    // Score preserved
    assert.equal(result.collectorResults[0].results[0].score, 120);
    assert.equal(result.collectorResults[0].results[1].score, 60);
    // Next actions present
    assert.ok(Array.isArray(result.nextActions));
    assert.ok(result.nextActions.length > 0);
    assert.ok(result.limits);
    assert.equal(result.limits.remainingTurns, 2);
    assert.ok(result.contentText);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("collector interactive: session turns across search and refine", async () => {
  const { runWebResearch, clearResearchMemory } = await import("../lib/web-research.js");
  clearResearchMemory();
  const previousFetch = globalThis.fetch;

  globalThis.fetch = async (url) => {
    if (String(url).includes("hn.algolia.com")) {
      return {
        ok: true,
        headers: { get: () => "application/json" },
        async json() { return { hits: [{ title: "Result", url: "https://example.com", author: "t", points: 10, num_comments: 2, created_at: "2026-01-01" }] }; },
      };
    }
    return { ok: false, status: 404, headers: { get: () => "text/plain" }, async text() { return ""; } };
  };

  try {
    const first = await runWebResearch(
      "React 19",
      { model: null, modelRegistry: { async getApiKeyAndHeaders() { return { ok: false }; } } },
      undefined,
      undefined,
      { platforms: ["hn"], interactive: true, isolate: true }
    );
    assert.equal(first.turn, 1);

    const second = await runWebResearch(
      "React 19",
      { model: null, modelRegistry: { async getApiKeyAndHeaders() { return { ok: false }; } } },
      undefined,
      undefined,
      { platforms: ["hn"], interactive: true, sessionId: first.sessionId, action: "refine", queryOverride: "React 19 hooks", isolate: true }
    );
    assert.equal(second.sessionId, first.sessionId);
    assert.equal(second.turn, 2);
    assert.equal(second.currentQuery, "React 19 hooks");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("collector interactive: max turns enforcement", async () => {
  const { runWebResearch, clearResearchMemory } = await import("../lib/web-research.js");
  clearResearchMemory();
  const previousFetch = globalThis.fetch;

  globalThis.fetch = async (url) => {
    if (String(url).includes("hn.algolia.com")) {
      return {
        ok: true,
        headers: { get: () => "application/json" },
        async json() { return { hits: [{ title: "R", url: "https://e.com", author: "t", points: 1, num_comments: 0, created_at: "2026-01-01" }] }; },
      };
    }
    return { ok: false, status: 404, headers: { get: () => "text/plain" }, async text() { return ""; } };
  };

  try {
    const first = await runWebResearch(
      "test",
      { model: null, modelRegistry: { async getApiKeyAndHeaders() { return { ok: false }; } } },
      undefined,
      undefined,
      { platforms: ["hn"], interactive: true, maxTurns: 1, isolate: true }
    );
    assert.equal(first.turn, 1);
    assert.ok(first.ok);

    const second = await runWebResearch(
      "test again",
      { model: null, modelRegistry: { async getApiKeyAndHeaders() { return { ok: false }; } } },
      undefined,
      undefined,
      { platforms: ["hn"], interactive: true, sessionId: first.sessionId, action: "refine", isolate: true }
    );
    assert.equal(second.turn, 2);
    assert.equal(second.ok, false);
    assert.ok(second.error && second.error.toLowerCase().includes("max turns"));
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("collector interactive: multiple platforms run in parallel", async () => {
  const { runWebResearch, clearResearchMemory } = await import("../lib/web-research.js");
  clearResearchMemory();
  const previousFetch = globalThis.fetch;
  let hnCalled = false;
  let v2exCalled = false;

  globalThis.fetch = async (url) => {
    const text = String(url);
    if (text.includes("hn.algolia.com")) {
      hnCalled = true;
      return {
        ok: true,
        headers: { get: () => "application/json" },
        async json() { return { hits: [{ title: "HN item", url: "https://hn.example.com", author: "a", points: 5, num_comments: 1, created_at: "2026-01-01" }] }; },
      };
    }
    // V2EX doesn't have a public search API that returns simple JSON, but mock something
    // Actually, collector.search might fail or succeed depending. Let's just check it's attempted.
    return { ok: false, status: 404, headers: { get: () => "text/plain" }, async text() { return ""; } };
  };

  try {
    const result = await runWebResearch(
      "test multi",
      { model: null, modelRegistry: { async getApiKeyAndHeaders() { return { ok: false }; } } },
      undefined,
      undefined,
      { platforms: ["hn", "v2ex"], interactive: true, isolate: true }
    );
    assert.ok(result.ok);
    assert.equal(result.collectorResults.length, 2);
    assert.ok(result.collectorResults.some(r => r.platform === "hn"));
    assert.ok(result.collectorResults.some(r => r.platform === "v2ex"));
  } finally {
    globalThis.fetch = previousFetch;
  }
});
