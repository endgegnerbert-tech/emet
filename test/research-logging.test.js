import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { getResearchLogPath, logResearchEvent } from "../lib/local-logger.js";
import { fetchPageSource, searchDuckDuckGo } from "../lib/web-research.js";

test("research logger uses explicit log path and writes structured JSONL", async () => {
  const dir = await mkdtemp(join(tmpdir(), "emet-log-test-"));
  const previous = process.env.EMET_LOG_PATH;
  process.env.EMET_LOG_PATH = join(dir, "emet.jsonl");

  try {
    assert.equal(getResearchLogPath(), process.env.EMET_LOG_PATH);
    await logResearchEvent("unit_event", { reason: "success", outcome: "success", error: new Error("boom") });
    const line = (await readFile(process.env.EMET_LOG_PATH, "utf8")).trim();
    const parsed = JSON.parse(line);
    assert.equal(parsed.schemaVersion, 1);
    assert.equal(parsed.type, "unit_event");
    assert.equal(parsed.event, "unit_event");
    assert.equal(parsed.data.reason, "success");
    assert.equal(parsed.data.error.name, "Error");
  } finally {
    if (previous === undefined) delete process.env.EMET_LOG_PATH;
    else process.env.EMET_LOG_PATH = previous;
    await rm(dir, { recursive: true, force: true });
  }
});

test("research logger follows context-aware path when EMET_CONTEXT_PATH is set", () => {
  const previousLog = process.env.EMET_LOG_PATH;
  const previousContext = process.env.EMET_CONTEXT_PATH;
  delete process.env.EMET_LOG_PATH;
  process.env.EMET_CONTEXT_PATH = "/tmp/emet-context/emet-context.db";

  try {
    assert.match(getResearchLogPath(new Date("2026-06-12T00:00:00.000Z")), /\/tmp\/emet-context\/logs\/emet-2026-06-12\.jsonl$/);
  } finally {
    if (previousLog === undefined) delete process.env.EMET_LOG_PATH;
    else process.env.EMET_LOG_PATH = previousLog;
    if (previousContext === undefined) delete process.env.EMET_CONTEXT_PATH;
    else process.env.EMET_CONTEXT_PATH = previousContext;
  }
});

test("fetch logging records stable reason and retry fields for transient HTTP failures", async () => {
  const dir = await mkdtemp(join(tmpdir(), "emet-fetch-log-test-"));
  const previousLog = process.env.EMET_LOG_PATH;
  const previousFetch = globalThis.fetch;
  process.env.EMET_LOG_PATH = join(dir, "emet.jsonl");
  let calls = 0;

  globalThis.fetch = async () => {
    calls += 1;
    return {
      ok: false,
      status: 503,
      url: "https://example.com/down",
      headers: { get: () => "text/html" },
      async text() { return ""; },
    };
  };

  try {
    const page = await fetchPageSource("https://example.com/down", undefined, {
      pageTextLimit: 4000,
      minPageText: 300,
      useJinaFallback: false,
      pageTimeoutMs: 1000,
      isolate: true,
    });
    assert.equal(page, null);
    assert.equal(calls, 2);
    const events = (await readFile(process.env.EMET_LOG_PATH, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    const errorEvent = events.find((event) => event.type === "fetch_error");
    assert.equal(errorEvent.data.reason, "http_5xx");
    assert.equal(errorEvent.data.statusCode, 503);
    assert.equal(errorEvent.data.fallbackUsed, true);
    assert.equal(typeof errorEvent.data.retryCount, "number");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousLog === undefined) delete process.env.EMET_LOG_PATH;
    else process.env.EMET_LOG_PATH = previousLog;
    await rm(dir, { recursive: true, force: true });
  }
});

test("search logging records provider fallthrough and ranked set size", async () => {
  const dir = await mkdtemp(join(tmpdir(), "emet-search-log-test-"));
  const previousLog = process.env.EMET_LOG_PATH;
  const previousFetch = globalThis.fetch;
  process.env.EMET_LOG_PATH = join(dir, "emet.jsonl");

  globalThis.fetch = async (url) => {
    const text = String(url);
    if (text.includes("html.duckduckgo.com")) {
      return { ok: true, status: 200, headers: { get: () => "text/html" }, async text() { return ""; } };
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => "text/html" },
      async text() {
        return `<a class="result-link" rel="nofollow" href="https://docs.example.com/a">Docs</a><td class="result-snippet">topic docs</td>`;
      },
    };
  };

  try {
    await searchDuckDuckGo("topic docs", undefined, { ...{ resultsPerQuery: 3, searchProvider: "ddg_html", isolate: true }, allowedSourceTypes: [], allowedSources: [] });
    const events = (await readFile(process.env.EMET_LOG_PATH, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    assert.ok(events.some((event) => event.type === "search_provider_result" && event.data.provider === "ddg_html" && event.data.reason === "search_empty"));
    assert.ok(events.some((event) => event.type === "search_results_summary" && typeof event.data.finalRankedSetSize === "number"));
  } finally {
    globalThis.fetch = previousFetch;
    if (previousLog === undefined) delete process.env.EMET_LOG_PATH;
    else process.env.EMET_LOG_PATH = previousLog;
    await rm(dir, { recursive: true, force: true });
  }
});
