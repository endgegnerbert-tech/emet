import test from "node:test";
import assert from "node:assert/strict";

import webResearchExtension from "../index.js";
import { collectorSessions } from "../lib/research-session.js";
import { selectedCommunityPlatforms } from "../lib/retrieval/community.js";
import { buildToolDefinition } from "../lib/tool-schema.js";

// Clean session state between tests
test.beforeEach(() => {
  collectorSessions.clear();
});

// --- Schema tests ---

test("MCP tool schema includes checkpoint/community options", () => {
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
  assert.ok(opts.hostAllowlist);
});

test("Pi extension schema includes checkpoint/community options", () => {
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
  assert.ok(opts.hostAllowlist);
});

// --- community platform selection tests ---

test("selectedCommunityPlatforms: explicit platforms", () => {
  assert.deepEqual(selectedCommunityPlatforms("anything", { platforms: ["hn"] }), ["hn"]);
  assert.deepEqual(selectedCommunityPlatforms("anything", { platforms: ["HN", "Reddit.com", "V2EX"] }), ["hn", "reddit", "v2ex"]);
  assert.deepEqual(selectedCommunityPlatforms("anything", { platforms: [] }), []);
});

test("selectedCommunityPlatforms: interactive alone is not community mode", () => {
  assert.deepEqual(selectedCommunityPlatforms("anything", { interactive: true }), []);
});

test("selectedCommunityPlatforms: normal web queries return empty", () => {
  assert.deepEqual(selectedCommunityPlatforms("How does React work?", {}), []);
  assert.deepEqual(selectedCommunityPlatforms("GitHub REST apiVersion deprecated", {}), []);
  assert.deepEqual(selectedCommunityPlatforms("Deploy to GitHub Pages", {}), []);
});

test("selectedCommunityPlatforms: platform wording", () => {
  assert.deepEqual(selectedCommunityPlatforms("What does HN think about React 19?", {}), ["hn"]);
  assert.deepEqual(selectedCommunityPlatforms("Hacker News discussion on TypeScript", {}), ["hn"]);
  assert.deepEqual(selectedCommunityPlatforms("V2EX best keyboard", {}), ["v2ex"]);
});

test("selectedCommunityPlatforms: GitHub issues/repos/discussions intent", () => {
  assert.deepEqual(selectedCommunityPlatforms("GitHub issues React 19 bug", {}), ["github"]);
  assert.deepEqual(selectedCommunityPlatforms("best GitHub repos for CLI tools", {}), ["github"]);
  assert.deepEqual(selectedCommunityPlatforms("GitHub discussions about Node.js", {}), ["github"]);
  assert.deepEqual(selectedCommunityPlatforms("GitHub trending this week", {}), ["github"]);
  assert.deepEqual(selectedCommunityPlatforms("top GitHub repos for Rust", {}), ["github"]);
});

// --- Interactive flow tests (with mocked fetch for collectors) ---

test("community checkpoint: unavailable collector returns structured error", async () => {
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
  assert.equal(result.action, "search");
  assert.equal("legacyAction" in result, false);
  assert.ok(result.collectorResults[0].available === false);
  assert.ok(result.collectorResults[0].reason);
});

test("community checkpoint: HN collector returns structured results", async () => {
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
    assert.equal(result.action, "search");
    assert.equal("legacyAction" in result, false);
    assert.ok(result.sessionId);
    assert.equal(result.turn, 1);
    assert.ok(Array.isArray(result.collectorResults));
    assert.equal(result.collectorResults.length, 1);
    assert.equal(result.collectorResults[0].platform, "hn");
    assert.equal(result.collectorResults[0].available, true);
    assert.equal(result.collectorResults[0].resultCount, 3);
    assert.ok(result.collectorResults[0].results.length === 3);
    // Stable IDs
    assert.match(result.collectorResults[0].results[0].id, /^hn:[a-f0-9]{10}$/);
    assert.match(result.collectorResults[0].results[1].id, /^hn:[a-f0-9]{10}$/);
    assert.match(result.collectorResults[0].results[2].id, /^hn:[a-f0-9]{10}$/);
    // Score normalized
    assert.ok(result.collectorResults[0].results[0].score > 0 && result.collectorResults[0].results[0].score <= 10);
    assert.ok(result.collectorResults[0].results[1].score > 0 && result.collectorResults[0].results[1].score <= 10);
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

test("community checkpoint: fetch uses selectedResultIds from prior search", async () => {
  const { runWebResearch, clearResearchMemory } = await import("../lib/web-research.js");
  clearResearchMemory();
  const previousFetch = globalThis.fetch;

  globalThis.fetch = async (url) => {
    const text = String(url);
    if (text.includes("hn.algolia.com")) {
      return {
        ok: true,
        headers: { get: () => "application/json" },
        async json() { return { hits: [{ title: "Result", url: "https://example.com/post", author: "t", points: 10, num_comments: 2, created_at: "2026-01-01" }] }; },
      };
    }
    return {
      status: 200,
      url: text,
      headers: { get: () => "text/html" },
      async text() { return `<html><title>${text}</title><body>${("community fetched evidence ").repeat(120)}</body></html>`; },
    };
  };

  try {
    const first = await runWebResearch(
      "React 19",
      { model: null, modelRegistry: { async getApiKeyAndHeaders() { return { ok: false }; } } },
      undefined,
      undefined,
      { platforms: ["hn"], interactive: true, isolate: true }
    );
    const selectedId = first.collectorResults[0].results[0].id;

    const second = await runWebResearch(
      "React 19",
      { model: null, modelRegistry: { async getApiKeyAndHeaders() { return { ok: false }; } } },
      undefined,
      undefined,
      { interactive: true, sessionId: first.sessionId, action: "fetch", selectedResultIds: [selectedId], isolate: true }
    );
    assert.equal(second.ok, true);
    assert.equal(second.action, "fetch");
    assert.equal("legacyAction" in second, false);
    assert.equal(second.pages.length, 1);
    assert.ok(second.nextActions.some((action) => action.action === "synthesize"));
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("community checkpoint: fetch preserves strict host policy", async () => {
  const { runWebResearch, clearResearchMemory } = await import("../lib/web-research.js");
  clearResearchMemory();
  const previousFetch = globalThis.fetch;
  let blockedUrlFetched = false;

  globalThis.fetch = async (url) => {
    const text = String(url);
    if (text.includes("hn.algolia.com")) {
      return {
        ok: true,
        headers: { get: () => "application/json" },
        async json() { return { hits: [{ title: "Result", url: "https://blocked.example/post", author: "t", points: 10, num_comments: 2, created_at: "2026-01-01" }] }; },
      };
    }
    if (text.includes("blocked.example")) blockedUrlFetched = true;
    return {
      status: 200,
      url: text,
      headers: { get: () => "text/html" },
      async text() { return `<html><body>${("blocked content ").repeat(120)}</body></html>`; },
    };
  };

  try {
    const first = await runWebResearch(
      "React 19",
      { model: null, modelRegistry: { async getApiKeyAndHeaders() { return { ok: false }; } } },
      undefined,
      undefined,
      { platforms: ["hn"], interactive: true, isolate: true }
    );
    const selectedId = first.collectorResults[0].results[0].id;

    const second = await runWebResearch(
      "React 19",
      { model: null, modelRegistry: { async getApiKeyAndHeaders() { return { ok: false }; } } },
      undefined,
      undefined,
      { platforms: ["hn"], interactive: true, sessionId: first.sessionId, action: "fetch", selectedResultIds: [selectedId], hostAllowlist: ["allowed.example"], isolate: true }
    );
    assert.equal(second.ok, true);
    assert.equal(second.pages.length, 0);
    assert.equal(second.fetchDiagnostics[0].reason, "source_policy");
    assert.equal(second.nextActions.some((action) => action.action === "synthesize"), false);
    assert.equal(blockedUrlFetched, false);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("community checkpoint: HN item fetch falls back to Algolia item API", async () => {
  const { runWebResearch, clearResearchMemory } = await import("../lib/web-research.js");
  clearResearchMemory();
  const previousFetch = globalThis.fetch;
  let newsFetched = false;
  let itemApiFetched = false;

  globalThis.fetch = async (url) => {
    const text = String(url);
    if (text.includes("hn.algolia.com/api/v1/search")) {
      return {
        ok: true,
        headers: { get: () => "application/json" },
        async json() { return { hits: [{ title: "HN-only thread", url: null, objectID: "4242", author: "t", points: 10, num_comments: 2, created_at: "2026-01-01" }] }; },
      };
    }
    if (text.includes("hn.algolia.com/api/v1/items/4242")) {
      itemApiFetched = true;
      return {
        ok: true,
        headers: { get: () => "application/json" },
        async json() {
          return {
            id: 4242,
            title: "HN-only thread",
            author: "t",
            points: 10,
            text: "<p>thread body",
            children: [{ author: "c", text: "<p>useful comment" }],
          };
        },
      };
    }
    if (text.includes("news.ycombinator.com")) newsFetched = true;
    return { ok: false, status: 429, headers: { get: () => "text/plain" }, async text() { return ""; } };
  };

  try {
    const first = await runWebResearch(
      "HN-only thread",
      { model: null, modelRegistry: { async getApiKeyAndHeaders() { return { ok: false }; } } },
      undefined,
      undefined,
      { platforms: ["hn"], interactive: true, isolate: true }
    );
    const selectedId = first.collectorResults[0].results[0].id;
    const second = await runWebResearch(
      "HN-only thread",
      { model: null, modelRegistry: { async getApiKeyAndHeaders() { return { ok: false }; } } },
      undefined,
      undefined,
      { interactive: true, sessionId: first.sessionId, action: "fetch", selectedResultIds: [selectedId], isolate: true }
    );

    assert.equal(second.ok, true);
    assert.equal(second.pages.length, 1);
    assert.equal(second.pages[0].url, "https://news.ycombinator.com/item?id=4242");
    assert.equal(itemApiFetched, true);
    assert.equal(newsFetched, false);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("community checkpoint: allowedSources does not block explicit community fetch", async () => {
  const { runWebResearch, clearResearchMemory } = await import("../lib/web-research.js");
  clearResearchMemory();
  const previousFetch = globalThis.fetch;

  globalThis.fetch = async (url) => {
    const text = String(url);
    if (text.includes("hn.algolia.com")) {
      return {
        ok: true,
        headers: { get: () => "application/json" },
        async json() { return { hits: [{ title: "Community result", url: "https://community.example/post", author: "t", points: 10, num_comments: 2, created_at: "2026-01-01" }] }; },
      };
    }
    return {
      status: 200,
      url: text,
      headers: { get: () => "text/html" },
      async text() { return `<html><title>Community</title><body>${("community evidence ").repeat(120)}</body></html>`; },
    };
  };

  try {
    const first = await runWebResearch(
      "community result",
      { model: null, modelRegistry: { async getApiKeyAndHeaders() { return { ok: false }; } } },
      undefined,
      undefined,
      { platforms: ["hn"], interactive: true, allowedSources: ["react.dev"], isolate: true }
    );
    const selectedId = first.collectorResults[0].results[0].id;
    const second = await runWebResearch(
      "community result",
      { model: null, modelRegistry: { async getApiKeyAndHeaders() { return { ok: false }; } } },
      undefined,
      undefined,
      { interactive: true, sessionId: first.sessionId, action: "fetch", selectedResultIds: [selectedId], allowedSources: ["react.dev"], isolate: true }
    );

    assert.equal(second.ok, true);
    assert.equal(second.pages.length, 1);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("community checkpoint: session turns across search and refine", async () => {
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

test("community checkpoint: max turns enforcement", async () => {
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

test("community checkpoint: multiple platforms run in parallel", async () => {
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

test("interactive without platforms runs normal pipeline, not collector checkpoint", async () => {
  const { runWebResearch, clearResearchMemory } = await import("../lib/web-research.js");
  clearResearchMemory();
  const previousFetch = globalThis.fetch;

  const ddgHtml = (results) => results.map(({ url, title, snippet }) => `
    <div class="result results_links">
      <h2 class="result__title"><a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(url)}&amp;rut=abc">${title}</a></h2>
      <a class="result__snippet">${snippet}</a>
    </div>
  `).join("\n");

  globalThis.fetch = async (url) => {
    const text = String(url);
    if (text.includes("duckduckgo.com/html")) {
      return {
        headers: { get: () => "text/html" },
        async text() {
          return ddgHtml([
            { url: "https://normal.example.com/1", title: "Normal 1", snippet: "pipeline evidence alpha" },
            { url: "https://normal.example.com/2", title: "Normal 2", snippet: "pipeline evidence beta" },
            { url: "https://normal.example.com/3", title: "Normal 3", snippet: "pipeline evidence gamma" },
          ]);
        },
      };
    }
    return {
      status: 200,
      url: text,
      headers: { get: () => "text/html" },
      async text() { return `<html><title>${text}</title><body>${("pipeline evidence ").repeat(120)}</body></html>`; },
    };
  };

  try {
    const result = await runWebResearch(
      "pipeline evidence",
      { model: null, modelRegistry: { async getApiKeyAndHeaders() { return { ok: false }; } } },
      undefined,
      undefined,
      { interactive: true, isolate: true }
    );
    assert.equal(result.ok, true);
    assert.equal(result.action, "final");
    assert.equal("legacyAction" in result, false);
    assert.equal(result.collectorResults, undefined);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("community synthesize action runs normal pipeline instead of legacy collector synthesis", async () => {
  const { runWebResearch, clearResearchMemory } = await import("../lib/web-research.js");
  clearResearchMemory();
  const previousFetch = globalThis.fetch;

  const ddgHtml = (results) => results.map(({ url, title, snippet }) => `
    <div class="result results_links">
      <h2 class="result__title"><a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(url)}&amp;rut=abc">${title}</a></h2>
      <a class="result__snippet">${snippet}</a>
    </div>
  `).join("\n");

  globalThis.fetch = async (url) => {
    const text = String(url);
    if (text.includes("hn.algolia.com")) {
      return {
        ok: true,
        headers: { get: () => "application/json" },
        async json() { return { hits: [{ title: "Community signal", url: "https://community.example.com/a", author: "h", points: 10, num_comments: 2 }] }; },
      };
    }
    if (text.includes("duckduckgo.com/html")) {
      return {
        headers: { get: () => "text/html" },
        async text() {
          return ddgHtml([
            { url: "https://official.example.com/a", title: "Official source", snippet: "community pipeline synthesis evidence" },
            { url: "https://official.example.com/b", title: "Official source B", snippet: "community pipeline synthesis evidence" },
            { url: "https://official.example.com/c", title: "Official source C", snippet: "community pipeline synthesis evidence" },
          ]);
        },
      };
    }
    return {
      status: 200,
      url: text,
      headers: { get: () => "text/html" },
      async text() { return `<html><title>${text}</title><body>${("community pipeline synthesis evidence ").repeat(120)}</body></html>`; },
    };
  };

  try {
    const result = await runWebResearch(
      "community pipeline synthesis evidence",
      { model: null, modelRegistry: { async getApiKeyAndHeaders() { return { ok: false }; } } },
      undefined,
      undefined,
      { platforms: ["hn"], interactive: true, action: "synthesize", isolate: true }
    );
    assert.equal(result.ok, true);
    assert.equal(result.action, "final");
    assert.equal("legacyAction" in result, false);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
