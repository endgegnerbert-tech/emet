import test from "node:test";
import assert from "node:assert/strict";

import webResearchExtension from "../index.js";
import { buildQueries, fetchPageSource, getResearchConfig, resolveResearchModel, runWebResearch } from "../lib/web-research.js";
import { compactResearchPayload, evaluateSufficiency, prioritizeSourceEntries, scoreSourceEntry } from "../lib/research.js";
import { clearResearchMemory, normalizeResearchQuery, readCachedResult, shouldSkipResearch, writeCachedResult } from "../lib/research-memory.js";
import { createResearchResult } from "../lib/types.js";

test("webResearchExtension registers a emet tool", () => {
  clearResearchMemory();
  const tools = [];
  const pi = {
    on() {},
    registerTool(tool) {
      tools.push(tool);
    },
  };

  webResearchExtension(pi);
  assert.equal(tools[0].name, "emet");
});

test("getResearchConfig supports code and academic profiles", () => {
  assert.equal(getResearchConfig("code").mode, "code");
  assert.equal(getResearchConfig("academic").mode, "academic");
  assert.equal(getResearchConfig("deep").maxTurns, 2);
  assert.equal(getResearchConfig("academic").searchProvider, "academic");
  assert.equal(getResearchConfig("fast").stealthTimeoutMs, 30000);
  assert.equal(getResearchConfig("deep").stealthTimeoutMs, 40000);
});

test("getResearchConfig merges deep research options", () => {
  const config = getResearchConfig({
    mode: "deep",
    maxSites: 9,
    deepResearchConfig: { depth: 3, breadth: 4, concurrency: 2 },
  });

  assert.equal(config.mode, "deep");
  assert.equal(config.maxTurns, 3);
  assert.equal(config.maxQueries, 12);
  assert.equal(config.maxPages, 9);
  assert.equal(config.concurrentQueries, 2);
});

test("evaluateSufficiency reports missing aspects and open questions", () => {
  const result = evaluateSufficiency({
    query: "DuckDB vs SQLite memory overhead",
    sources: [{ url: "https://blog.example.com/a" }],
    conflictDetected: true,
  });

  assert.equal(result.sufficient, false);
  assert.ok(result.missingAspects.includes("authoritative sources"));
  assert.ok(result.missingAspects.includes("conflict resolution"));
  assert.ok(!result.missingAspects.includes("benchmark data"));
  assert.ok(result.openSubQuestions.length > 0);
  assert.equal(typeof result.conflictSummary, "string");
});

test("evaluateSufficiency confidence reflects stronger source coverage", () => {
  const weak = evaluateSufficiency({
    query: "DuckDB vs SQLite memory overhead",
    sources: [{ url: "https://duckdb.org/docs" }],
    conflictDetected: false,
  });
  const strong = evaluateSufficiency({
    query: "DuckDB vs SQLite memory overhead",
    sources: [
      { url: "https://duckdb.org/docs" },
      { url: "https://sqlite.org/changes.html" },
      { url: "https://github.com/duckdb/duckdb" },
    ],
    conflictDetected: false,
  });

  assert.ok(strong.confidenceScore > weak.confidenceScore);
  assert.ok(strong.confidenceScore <= 0.95);
});

test("scoreSourceEntry and prioritizeSourceEntries prefer official docs", () => {
  const sources = [
    { title: "Blog", url: "https://blog.example.com/post" },
    { title: "Docs", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript" },
  ];

  const scored = scoreSourceEntry(sources[1], "javascript");
  assert.equal(scored.sourceType, "official_doc");
  assert.equal(scored.authoritative, true);
  assert.equal(prioritizeSourceEntries(sources, "javascript")[0].title, "Docs");
});

test("compactResearchPayload keeps citations, source metadata, code blocks, confidence, and unverified claims", () => {
  const compact = compactResearchPayload({
    answer: "A [1]",
    bullets: ["B [1]"],
    citations: [{ text: "Doc", sourceIndex: 1 }],
    codeBlocks: ["const x = 1;\n".repeat(30)],
    sources: [{ title: "Doc", url: "https://example.com", sourceType: "official_doc", score: 12, authoritative: true, local: true }],
    sufficient: true,
    authoritativeSourcesFound: true,
    confidence: 0.9,
    sourceTypes: ["official_doc"],
    unverifiedClaims: ["A"],
    meta: { turns: 1 },
  });

  assert.equal(compact.citations.length, 1);
  assert.equal(compact.sources[0].sourceType, "official_doc");
  assert.equal(compact.sources[0].score, 12);
  assert.equal(compact.sources[0].authoritative, true);
  assert.equal(compact.sources[0].local, true);
  assert.equal(compact.confidence, 0.9);
  assert.deepEqual(compact.sourceTypes, ["official_doc"]);
  assert.deepEqual(compact.unverifiedClaims, ["A"]);
  assert.equal(compact.meta.turns, 1);
  assert.ok(compact.codeBlocks[0].split("\n").length <= 21);
});

test("buildQueries uses heuristic fast planning without a model call", async () => {
  const ctx = {
    model: "expensive/model",
    modelRegistry: {
      async getApiKeyAndHeaders() {
        throw new Error("fast planning must not ask the model registry");
      },
    },
  };

  assert.deepEqual(await buildQueries("was ist Jina Reader?", "fast", ctx, undefined), ["Jina Reader"]);
});

test("buildQueries can use model-planned subqueries only in deep mode", async () => {
  const ctx = {
    async completeResearch() {
      return JSON.stringify({ queries: ["official docs", "migration guide", "github readme"] });
    },
  };

  assert.deepEqual(await buildQueries("playwright best practices", "deep", ctx, undefined), [
    "official docs",
    "migration guide",
    "github readme",
  ]);
});

test("resolveResearchModel prefers WEB_RESEARCH_MODEL over ctx.model", () => {
  const previous = process.env.WEB_RESEARCH_MODEL;
  process.env.WEB_RESEARCH_MODEL = "cheap/model";

  try {
    assert.equal(resolveResearchModel({ model: "expensive/model" }), "cheap/model");
  } finally {
    if (previous === undefined) delete process.env.WEB_RESEARCH_MODEL;
    else process.env.WEB_RESEARCH_MODEL = previous;
  }
});

test("normalizeResearchQuery and shouldSkipResearch only short-circuit identical queries", () => {
  const a = normalizeResearchQuery("DuckDB vs SQLite?");
  const b = normalizeResearchQuery("DuckDB vs SQLite");
  const c = normalizeResearchQuery("DuckDB vs Postgres");

  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(shouldSkipResearch({ queryHash: a, lastHash: a, lastWasSufficient: true }), true);
  assert.equal(shouldSkipResearch({ queryHash: c, lastHash: a, lastWasSufficient: true }), false);
  assert.equal(shouldSkipResearch({ queryHash: a, lastHash: a, lastWasSufficient: true, force: true }), false);
  assert.equal(shouldSkipResearch({ queryHash: a, lastHash: a, lastWasSufficient: true, isolate: true }), false);
});

test("persistent research cache can round-trip a cached result", () => {
  clearResearchMemory();
  writeCachedResult("cache-key", { answer: "cached", sufficient: true }, 10_000);
  assert.equal(readCachedResult("cache-key")?.answer, "cached");
});

test("createResearchResult normalizes missing schema fields", () => {
  const result = createResearchResult({ answer: "A", sources: [{ title: "Doc", url: "https://example.com" }] });

  assert.equal(result.answer, "A");
  assert.deepEqual(result.bullets, []);
  assert.equal(result.sources[0].sourceType, "other");
  assert.equal(result.sources[0].authoritative, false);
  assert.deepEqual(result.codeBlocks, []);
  assert.deepEqual(result.openSubQuestions, []);
  assert.equal(result.confidence, 0);
  assert.deepEqual(result.unverifiedClaims, []);
});

test("fetchPageSource uses Jina Reader proactively for known reader-friendly domains", async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return {
      url: String(url),
      headers: { get: () => "text/plain" },
      async text() {
        return "# Jina Title\n\n" + "Readable fallback content ".repeat(30);
      },
    };
  };

  try {
    const page = await fetchPageSource("https://medium.com/example/post", undefined, {
      pageTextLimit: 4000,
      minPageText: 300,
      useJinaFallback: true,
    });

    assert.equal(calls[0], "https://r.jina.ai/https://medium.com/example/post");
    assert.equal(page.url, "https://medium.com/example/post");
    assert.match(page.text, /Readable fallback content/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("fetchPageSource escalates blocked pages through the adapter", async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return {
      status: 429,
      url: String(url),
      headers: { get: (name) => (String(name).toLowerCase() === "content-type" ? "text/html" : "") },
      async text() {
        return "<html><body>Too Many Requests</body></html>";
      },
    };
  };

  try {
    const page = await fetchPageSource("https://blocked.example.com", undefined, {
      pageTextLimit: 4000,
      minPageText: 300,
      useJinaFallback: true,
      fetchAdapter: {
        assessPageAttempt() {
          return { weak: true, mode: "stealthy" };
        },
        async fetchWithScrapling(url, mode) {
          assert.equal(url, "https://blocked.example.com");
          assert.equal(mode, "stealthy");
          return {
            url,
            body: "<html><title>Recovered</title><body>" + "Recovered content ".repeat(40) + "</body></html>",
          };
        },
      },
    });

    assert.equal(page.title, "Recovered");
    assert.match(page.text, /Recovered content/);
    assert.ok(calls.length >= 1);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("fetchPageSource keeps scrapling-assisted pages cached beyond default page ttl", async () => {
  const previousFetch = globalThis.fetch;
  const previousNow = Date.now;
  let now = 1_000;
  let fetchCalls = 0;

  Date.now = () => now;
  globalThis.fetch = async (url) => {
    fetchCalls += 1;
    return {
      status: 429,
      url: String(url),
      headers: { get: () => "text/html" },
      async text() {
        return "<html><body>Too Many Requests</body></html>";
      },
    };
  };

  try {
    const config = {
      pageTextLimit: 4000,
      minPageText: 300,
      useJinaFallback: true,
      fetchAdapter: {
        assessPageAttempt() {
          return { weak: true, blocked: true, mode: "stealthy" };
        },
        async fetchWithScrapling(url) {
          return {
            url,
            body: "<html><title>Recovered</title><body>" + "Recovered content ".repeat(40) + "</body></html>",
          };
        },
      },
    };

    const first = await fetchPageSource("https://blocked-expensive.example.com", undefined, config);
    now += (31 * 60 * 1000);
    const second = await fetchPageSource("https://blocked-expensive.example.com", undefined, config);

    assert.equal(first.title, "Recovered");
    assert.equal(second.title, "Recovered");
    assert.equal(fetchCalls, 1);
  } finally {
    Date.now = previousNow;
    globalThis.fetch = previousFetch;
  }
});

test("runWebResearch fast mode aborts extra fetches after enough usable pages", async () => {
  clearResearchMemory();
  const previousFetch = globalThis.fetch;
  let abortedFetches = 0;

  function ddgHtml(results) {
    return results.map(({ url, title, snippet }) => `
      <div class="result results_links">
        <h2 class="result__title">
          <a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(url)}&amp;rut=abc">${title}</a>
        </h2>
        <a class="result__snippet">${snippet}</a>
      </div>
    `).join("\n");
  }

  globalThis.fetch = async (url, options = {}) => {
    const text = String(url);
    if (text.includes("duckduckgo.com/html")) {
      return {
        headers: { get: () => "text/html" },
        async text() {
          return ddgHtml([
            { url: "https://fast.example.com/1", title: "Fast 1", snippet: "topic guidance alpha" },
            { url: "https://fast.example.com/2", title: "Fast 2", snippet: "topic guidance beta" },
            { url: "https://fast.example.com/3", title: "Fast 3", snippet: "topic guidance gamma" },
            { url: "https://slow.example.com/4", title: "Slow 4", snippet: "topic guidance" },
            { url: "https://slow.example.com/5", title: "Slow 5", snippet: "topic guidance" },
            { url: "https://slow.example.com/6", title: "Slow 6", snippet: "topic guidance" },
          ]);
        },
      };
    }

    if (text.includes("slow.example.com")) {
      return await new Promise((resolve, reject) => {
        const abort = () => {
          abortedFetches += 1;
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        };
        if (options.signal?.aborted) return abort();
        options.signal?.addEventListener("abort", abort, { once: true });
      });
    }

    return {
      status: 200,
      url: text,
      headers: { get: () => "text/html" },
      async text() {
        return `<html><title>${text}</title><body>${(`topic guidance ${text} `).repeat(80)}</body></html>`;
      },
    };
  };

  try {
    const result = await runWebResearch(
      "topic guidance",
      { model: null, modelRegistry: { async getApiKeyAndHeaders() { return { ok: false }; } } },
      undefined,
      undefined,
      { mode: "fast", isolate: true }
    );

    assert.equal(result.ok, true);
    assert.ok(abortedFetches >= 1);
    assert.ok(result.pagesRead >= 3);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("runWebResearch in deep mode performs follow-up research and finalizes results", async () => {
  clearResearchMemory();
  const previousFetch = globalThis.fetch;
  const ddgCalls = [];

  function ddgHtml(results) {
    return results.map(({ url, title, snippet }) => `
      <div class="result results_links">
        <h2 class="result__title">
          <a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent(url)}&amp;rut=abc">${title}</a>
        </h2>
        <a class="result__snippet">${snippet}</a>
      </div>
    `).join("\n");
  }

  globalThis.fetch = async (url) => {
    const text = String(url);
    if (text.includes("duckduckgo.com/html")) {
      ddgCalls.push(text);
      return {
        headers: { get: () => "text/html" },
        async text() {
          return ddgHtml(ddgCalls.length <= 2 ? [
            { url: "https://blog-source.example.net/a", title: "Blog A", snippet: "topic analysis" },
            { url: "https://news-source.example.org/b", title: "News B", snippet: "topic context" },
          ] : [
            { url: "https://example.com/docs/topic", title: "Official Docs", snippet: "official docs" },
          ]);
        },
      };
    }

    return {
      url: text,
      headers: { get: () => "text/html" },
      async text() {
        return `<html><title>Page</title><body><pre>const x = 1;</pre>${"topic context guidance ".repeat(40)}</body></html>`;
      },
    };
  };

  try {
    const result = await runWebResearch(
      "topic guidance",
      { model: null, modelRegistry: { async getApiKeyAndHeaders() { return { ok: false }; } } },
      undefined,
      undefined,
      { mode: "deep", isolate: true, deepResearchConfig: { depth: 2, breadth: 2, concurrency: 2 } }
    );

    assert.equal(result.ok, true);
    assert.equal(result.followupRounds >= 1, true);
    assert.equal(result.conflictDetected, false);
    assert.match(result.followupQuery, /official docs/);
    assert.match(result.followupQuery, /-site:example\.com/);
    assert.ok(ddgCalls.length >= 2);
    assert.ok(Array.isArray(result.citations));
    assert.ok(result.pagesRead > 0);
    assert.ok(Array.isArray(result.openSubQuestions));
    assert.equal(typeof result.confidenceScore, "number");
    assert.equal(typeof result.conflictSummary, "string");
    assert.ok(Array.isArray(result.codeBlocks));
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("runWebResearch caches repeated identical queries and isolate bypasses cache", async () => {
  clearResearchMemory();
  const previousFetch = globalThis.fetch;
  let calls = 0;

  globalThis.fetch = async (url) => {
    calls += 1;
    const text = String(url);
    if (text.includes("duckduckgo.com/html")) {
      return {
        headers: { get: () => "text/html" },
        async text() {
          return `
            <div class="result results_links">
              <h2 class="result__title">
                <a class="result__a" href="//duckduckgo.com/l/?uddg=${encodeURIComponent("https://example.com/docs/cache")}&amp;rut=abc">Cache Docs</a>
              </h2>
              <a class="result__snippet">cache docs</a>
            </div>
          `;
        },
      };
    }

    return {
      url: text,
      headers: { get: () => "text/html" },
      async text() {
        return `<html><title>Cache Docs</title><body>${"cached guidance ".repeat(40)}</body></html>`;
      },
    };
  };

  try {
    const ctx = { model: null, modelRegistry: { async getApiKeyAndHeaders() { return { ok: false }; } } };
    const first = await runWebResearch("cache probe unique", ctx, undefined, undefined, { mode: "fast" });
    const afterFirst = calls;
    const second = await runWebResearch("cache probe unique", ctx, undefined, undefined, { mode: "fast" });
    const isolated = await runWebResearch("cache probe unique", ctx, undefined, undefined, { mode: "fast", isolate: true });

    assert.equal(first.ok, true);
    assert.equal(second.ok, true);
    assert.equal(isolated.ok, true);
    assert.ok(calls > afterFirst);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("runWebResearch academic mode uses academic providers and returns paper sources", async () => {
  clearResearchMemory();
  const previousFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url) => {
    const text = String(url);
    calls.push(text);

    if (text.includes("export.arxiv.org")) {
      return {
        headers: { get: () => "application/xml" },
        async text() {
          return `<?xml version="1.0"?><feed><entry><id>https://arxiv.org/abs/2401.12345</id><title>Example Paper</title><summary>Paper summary text.</summary><published>2024-01-15T00:00:00Z</published></entry></feed>`;
        },
      };
    }

    if (text.includes("api.semanticscholar.org")) {
      return {
        headers: { get: () => "application/json" },
        async json() {
          return { data: [{ title: "Semantic Paper", abstract: "Abstract text", url: "https://www.semanticscholar.org/paper/example", year: 2024 }] };
        },
      };
    }

    if (text.includes("api.crossref.org")) {
      return {
        headers: { get: () => "application/json" },
        async json() {
          return { message: { items: [{ title: ["Crossref Paper"], DOI: "10.1000/test-doi", abstract: "Crossref abstract", published: { "date-parts": [[2023, 5, 1]] } }] } };
        },
      };
    }

    if (text.includes("duckduckgo.com/html")) {
      return {
        headers: { get: () => "text/html" },
        async text() {
          return "";
        },
      };
    }

    return {
      url: text,
      headers: { get: () => "text/html" },
      async text() {
        return `<html><title>Paper</title><body><pre>print('paper snippet')</pre>${"paper text ".repeat(60)}</body></html>`;
      },
    };
  };

  try {
    const result = await runWebResearch(
      "retrieval augmented generation papers",
      { model: null, modelRegistry: { async getApiKeyAndHeaders() { return { ok: false }; } } },
      undefined,
      undefined,
      { mode: "academic", isolate: true }
    );

    assert.equal(result.ok, true);
    assert.ok(calls.some((call) => call.includes("export.arxiv.org")));
    assert.ok(calls.some((call) => call.includes("api.semanticscholar.org")));
    assert.ok(result.sources.some((source) => source.sourceType === "paper"));
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("runWebResearch academic mode normalizes paper titles", async () => {
  clearResearchMemory();
  const previousFetch = globalThis.fetch;

  globalThis.fetch = async (url) => {
    const text = String(url);

    if (text.includes("export.arxiv.org")) {
      return {
        headers: { get: () => "application/xml" },
        async text() {
          return `<?xml version="1.0"?><feed><entry><id>https://arxiv.org/abs/2401.12345</id><title>Title: Example Paper</title><summary>Paper summary text.</summary><published>2024-01-15T00:00:00Z</published></entry></feed>`;
        },
      };
    }

    if (text.includes("api.semanticscholar.org")) {
      return {
        headers: { get: () => "application/json" },
        async json() {
          return { data: [{ title: "Paper: Semantic Paper", abstract: "Abstract text", url: "https://www.semanticscholar.org/paper/example", year: 2024 }] };
        },
      };
    }

    if (text.includes("api.crossref.org")) {
      return {
        headers: { get: () => "application/json" },
        async json() {
          return { message: { items: [{ title: ["Title: Crossref Paper"], DOI: "10.1000/test-doi", abstract: "Crossref abstract", published: { "date-parts": [[2023, 5, 1]] } }] } };
        },
      };
    }

    if (text.includes("duckduckgo.com/html")) {
      return {
        headers: { get: () => "text/html" },
        async text() {
          return "";
        },
      };
    }

    return {
      url: text,
      headers: { get: () => "text/html" },
      async text() {
        return `<html><title>Paper</title><body>${"paper text ".repeat(60)}</body></html>`;
      },
    };
  };

  try {
    const result = await runWebResearch(
      "retrieval augmented generation papers",
      { model: null, modelRegistry: { async getApiKeyAndHeaders() { return { ok: false }; } } },
      undefined,
      undefined,
      { mode: "academic", isolate: true }
    );

    assert.equal(result.ok, true);
    assert.ok(result.sources.every((source) => !/^\s*(title|paper)\s*:/i.test(source.title)));
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("runWebResearch can merge local files as sources", async () => {
  clearResearchMemory();
  const result = await runWebResearch(
    "local docs",
    { model: null, modelRegistry: { async getApiKeyAndHeaders() { return { ok: false }; } } },
    undefined,
    undefined,
    { mode: "fast", isolate: true, files: [new URL(import.meta.url).pathname] }
  );

  assert.equal(result.ok, true);
  assert.ok(result.sources.some((source) => source.url.startsWith("file://")));
});

test("compactResearchPayload keeps claim metadata", () => {
  const compact = compactResearchPayload({
    claims: [{ text: "Claim", confidence: "high", evidence: [{ type: "web", source: "https://example.com", snippet: "Claim" }] }],
    evidenceSummary: "Multiple sources support the claim.",
  });

  assert.equal(compact.claims[0].text, "Claim");
  assert.equal(compact.evidenceSummary, "Multiple sources support the claim.");
});
