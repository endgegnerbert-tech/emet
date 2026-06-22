import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { getCollector, listCollectors, runCollectorDoctor } from "../lib/collectors/index.js";
import { HNCollector } from "../lib/collectors/hn.js";
import { V2exCollector } from "../lib/collectors/v2ex.js";
import { GitHubCollector } from "../lib/collectors/github-collector.js";
import { RSSCollector } from "../lib/collectors/rss.js";
import { YouTubeCollector } from "../lib/collectors/youtube.js";
import { fetchWithTimeout } from "../lib/collectors/collector.js";
import { runDoctor } from "../lib/cli.js";

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

test("getCollector returns instance for known collectors", () => {
  assert.ok(getCollector("hn") instanceof HNCollector);
  assert.ok(getCollector("v2ex") instanceof V2exCollector);
  assert.ok(getCollector("github") instanceof GitHubCollector);
  assert.ok(getCollector("rss") instanceof RSSCollector);
  assert.ok(getCollector("youtube") instanceof YouTubeCollector);
});

test("getCollector returns null for unknown name", () => {
  assert.equal(getCollector("nonexistent"), null);
});

test("listCollectors returns 5 entries with name, label, available", () => {
  const list = listCollectors();
  assert.equal(list.length, 5);
  for (const entry of list) {
    assert.ok(typeof entry.name === "string");
    assert.ok(typeof entry.label === "string");
    assert.ok("available" in entry);
  }
});

test("runCollectorDoctor returns checks with collector prefix", () => {
  const result = runCollectorDoctor();
  assert.ok(Array.isArray(result.checks));
  assert.equal(result.checks.length, 5);
  for (const check of result.checks) {
    assert.match(check.name, /^collector:/);
    assert.ok("ok" in check);
  }
});

// ---------------------------------------------------------------------------
// Doctor integration
// ---------------------------------------------------------------------------

test("doctor includes collector checks", () => {
  const result = runDoctor({ nodeVersion: process.version });
  const collectorChecks = result.checks.filter((c) => c.name.startsWith("collector:"));
  assert.equal(collectorChecks.length, 5);
  // Non-YouTube collectors should be available
  for (const c of collectorChecks) {
    if (c.name !== "collector:youtube") {
      assert.equal(c.ok, true, `${c.name} should be available`);
    }
  }
  assert.match(result.text, /collector:/);
});

// ---------------------------------------------------------------------------
// HN Collector
// ---------------------------------------------------------------------------

test("HN collector returns normalized results", async (t) => {
  const original = globalThis.fetch;
  t.after(() => globalThis.fetch = original);
  globalThis.fetch = async (url) => {
    assert.match(url, /hn\.algolia\.com/);
    return new Response(JSON.stringify({
      hits: [
        { title: "Test Post", url: "https://example.com", author: "user1", points: 42, num_comments: 7, created_at: "2026-01-01", objectID: "123" },
        { title: "Another Post", author: "user2", points: 10, num_comments: 0, created_at: "2026-01-02", objectID: "456" },
      ],
    }));
  };

  const col = new HNCollector();
  const result = await col.search("test");
  assert.equal(result.platform, "hn");
  assert.equal(result.resultCount, 2);
  assert.equal(result.results[0].title, "Test Post");
  assert.equal(result.results[0].author, "user1");
  assert.equal(result.results[0].score, 42);
  assert.equal(result.results[0].signals.comments, 7);
  assert.equal(result.results[0].url, "https://example.com");
  // Item without url uses HN fallback
  assert.equal(result.results[1].url, "https://news.ycombinator.com/item?id=456");
  assert.ok(result.meta.elapsedMs >= 0);
  assert.equal(result.meta.apiCalls, 1);
});

test("HN collector handles empty hits", async (t) => {
  const original = globalThis.fetch;
  t.after(() => globalThis.fetch = original);
  globalThis.fetch = async () => new Response(JSON.stringify({ hits: [] }));

  const result = await new HNCollector().search("empty");
  assert.equal(result.resultCount, 0);
  assert.equal(result.results.length, 0);
});

test("HN collector respects limit", async (t) => {
  const original = globalThis.fetch;
  t.after(() => globalThis.fetch = original);
  globalThis.fetch = async (url) => {
    assert.match(url, /hitsPerPage=5/);
    return new Response(JSON.stringify({ hits: Array.from({ length: 5 }, (_, i) => ({ title: `Post ${i}`, objectID: String(i) })) }));
  };

  const result = await new HNCollector().search("test", { limit: 5 });
  assert.equal(result.results.length, 5);
});

// ---------------------------------------------------------------------------
// V2EX Collector
// ---------------------------------------------------------------------------

test("V2EX collector filters client-side by query", async (t) => {
  const original = globalThis.fetch;
  t.after(() => globalThis.fetch = original);
  globalThis.fetch = async () => new Response(JSON.stringify([
    { title: "Hello World", url: "https://v2ex.com/t/1", member: { username: "alice" }, replies: 5, node: { title: "share" }, created: 1700000000 },
    { title: "JavaScript Tips", url: "https://v2ex.com/t/2", member: { username: "bob" }, replies: 3, node: { title: "programming" }, created: 1700000001 },
    { title: "Python News", url: "https://v2ex.com/t/3", member: { username: "charlie" }, replies: 8, node: { title: "python" }, created: 1700000002 },
  ]));

  const result = await new V2exCollector().search("javascript");
  assert.equal(result.platform, "v2ex");
  assert.equal(result.resultCount, 1);
  assert.equal(result.results[0].title, "JavaScript Tips");
  assert.equal(result.results[0].author, "bob");
});

// ---------------------------------------------------------------------------
// GitHub Collector
// ---------------------------------------------------------------------------

test("GitHub collector returns repositories", async (t) => {
  const original = globalThis.fetch;
  t.after(() => globalThis.fetch = original);
  globalThis.fetch = async (url) => {
    assert.match(url, /search\/repositories/);
    return new Response(JSON.stringify({
      items: [
        { full_name: "user/repo", html_url: "https://github.com/user/repo", owner: { login: "user" }, stargazers_count: 100, forks_count: 10, language: "JS", description: "A repo", updated_at: "2026-01-01" },
      ],
    }));
  };

  const result = await new GitHubCollector().search("test");
  assert.equal(result.platform, "github");
  assert.equal(result.resultCount, 1);
  assert.equal(result.results[0].title, "user/repo");
  assert.equal(result.results[0].author, "user");
  assert.equal(result.results[0].score, 100);
});

test("GitHub collector supports code and issues type", async (t) => {
  const original = globalThis.fetch;
  t.after(() => globalThis.fetch = original);
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(url);
    return new Response(JSON.stringify({ items: [] }));
  };

  await new GitHubCollector().search("test", { type: "code" });
  await new GitHubCollector().search("test", { type: "issues" });
  assert.match(urls[0], /search\/code/);
  assert.match(urls[1], /search\/issues/);
});

test("GitHub collector handles empty results", async (t) => {
  const original = globalThis.fetch;
  t.after(() => globalThis.fetch = original);
  globalThis.fetch = async () => new Response(JSON.stringify({ items: [] }));

  const result = await new GitHubCollector().search("zzzznonexistent");
  assert.equal(result.resultCount, 0);
});

// ---------------------------------------------------------------------------
// RSS Collector
// ---------------------------------------------------------------------------

const RSS_FIXTURE = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <item><title>Post One</title><link>https://example.com/1</link><author>author1</author><pubDate>Mon, 01 Jan 2026 00:00:00 GMT</pubDate></item>
    <item><title>Post Two</title><link>https://example.com/2</link><author>author2</author><pubDate>Tue, 02 Jan 2026 00:00:00 GMT</pubDate></item>
  </channel>
</rss>`;

const ATOM_FIXTURE = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Feed</title>
  <entry><title>Atom Post</title><link href="https://example.com/atom"/><author><name>atom-author</name></author><published>2026-01-01T00:00:00Z</published></entry>
</feed>`;

test("RSS collector parses RSS 2.0 items", async (t) => {
  const original = globalThis.fetch;
  t.after(() => globalThis.fetch = original);
  globalThis.fetch = async () => new Response(RSS_FIXTURE);

  const result = await new RSSCollector().search("https://example.com/feed");
  assert.equal(result.platform, "rss");
  assert.equal(result.resultCount, 2);
  assert.equal(result.results[0].title, "Post One");
  assert.equal(result.results[0].url, "https://example.com/1");
  assert.equal(result.results[0].author, "author1");
});

test("RSS collector parses Atom entries", async (t) => {
  const original = globalThis.fetch;
  t.after(() => globalThis.fetch = original);
  globalThis.fetch = async () => new Response(ATOM_FIXTURE);

  const result = await new RSSCollector().search("https://example.com/atom");
  assert.equal(result.resultCount, 1);
  assert.equal(result.results[0].title, "Atom Post");
  assert.equal(result.results[0].url, "https://example.com/atom");
  assert.equal(result.results[0].author, "atom-author");
});

test("RSS collector handles empty/malformed feed", async (t) => {
  const original = globalThis.fetch;
  t.after(() => globalThis.fetch = original);
  globalThis.fetch = async () => new Response("not xml");

  const result = await new RSSCollector().search("https://example.com/bad");
  assert.equal(result.resultCount, 0);
});

// ---------------------------------------------------------------------------
// Error handling: fetchWithTimeout
// ---------------------------------------------------------------------------

test("fetchWithTimeout throws structured error on HTTP error", async (t) => {
  const original = globalThis.fetch;
  t.after(() => globalThis.fetch = original);
  globalThis.fetch = async () => new Response("Not Found", { status: 404 });

  await assert.rejects(
    () => fetchWithTimeout("https://example.com/404"),
    (err) => {
      assert.equal(err.message, "HTTP 404");
      assert.equal(err.statusCode, 404);
      return true;
    },
  );
});

test("fetchWithTimeout throws TIMEOUT error on timeout", async (t) => {
  const original = globalThis.fetch;
  t.after(() => globalThis.fetch = original);
  globalThis.fetch = async (_url, opts) => {
    // Simulate real fetch: hang until signal is aborted
    await new Promise((resolve) => {
      if (opts?.signal?.aborted) resolve();
      else opts?.signal?.addEventListener?.("abort", resolve, { once: true });
    });
    throw new DOMException("The operation was aborted", "AbortError");
  };

  await assert.rejects(
    () => fetchWithTimeout("https://example.com/slow", { timeout: 50 }),
    (err) => {
      assert.match(err.message, /timeout/i);
      assert.equal(err.code, "TIMEOUT");
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// YouTube availability (without yt-dlp)
// ---------------------------------------------------------------------------

test("YouTube collector checkAvailability returns valid structure", () => {
  const status = new YouTubeCollector().checkAvailability();
  // Whether available or not depends on yt-dlp being installed
  assert.ok("available" in status);
  if (!status.available) {
    assert.ok(status.reason);
    assert.ok(status.installHint);
  }
});
