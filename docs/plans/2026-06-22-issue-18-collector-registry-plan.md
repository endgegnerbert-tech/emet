# Issue #18: Internal No-Auth Collector Registry – Implementation Plan

**Date:** 2026-06-22
**Issue:** [#18](https://github.com/endgegnerbert-tech/emet/issues/18) – feat(collectors): add internal no-auth collector registry
**Status:** planning
**Split from:** #17

---

## Overview

Add a read-only, internal collector layer for social/platform data sources. Collectors are NOT exposed as separate MCP tools — they are internal capabilities usable by the existing `emet` tool and the `emet doctor` CLI.

## Design Decisions (from best-practice research)

| Decision | Rationale |
|----------|-----------|
| Shared output schema per collector | Normalize all platforms into `{ platform, resultCount, results: [{ title, url, author, score, signals, tier }], meta }` — single consumer contract |
| Lazy registry with `available` flag | Collectors that need optional runtimes (yt-dlp) degrade gracefully, never crash the server |
| `fetch` wrapper with timeout + structured errors | Circuit-breaker avoidance; every external call gets a timeout and a typed error |
| Prefer official/public APIs over scraping | HN uses Algolia, V2EX uses public JSON API, GitHub uses REST/search — no HTML parsing |
| No query/result logging to telemetry | Per issue constraints; only availability and error counters go to logs |
| ES modules, `node:test` + `node:assert/strict` | Match existing codebase conventions |

## File Plan

```
lib/collectors/
├── collector.js          # Base SocialCollector contract + shared output schema
├── hn.js                 # Hacker News via Algolia API
├── v2ex.js               # V2EX via public /api/topics/hot.json
├── github-collector.js   # GitHub via public REST/search endpoints
├── rss.js                # RSS/Atom feed fetch + parse (no deps)
├── youtube.js            # YouTube metadata/subtitles via yt-dlp (optional)
└── index.js              # Lazy registry, lookup, runCollectorDoctor()

lib/cli.js                # Modified: runDoctor() calls runCollectorDoctor()
test/
└── collectors.test.js    # Unit tests with mocked fetch
```

## Phase 1: Base Contract + Registry

### `lib/collectors/collector.js`

```js
// Base contract every collector must implement
class SocialCollector {
  // Unique platform key: "hn", "v2ex", "github", "rss", "youtube"
  get platform() { throw new Error("subclass must implement platform getter"); }

  // Human-readable label for doctor output
  get label() { throw new Error("subclass must implement label getter"); }

  // Is this collector usable right now? Checks runtime deps.
  // Returns { available: boolean, reason?: string, installHint?: string }
  checkAvailability() { return { available: true }; }

  // Search/query the platform. Returns the shared output shape:
  // { platform, resultCount, results: [{ title, url, author, score, signals, tier }], meta: { elapsedMs, apiCalls, cacheHits } }
  // query: string, options?: { limit?: number }
  async search(query, options = {}) { throw new Error("subclass must implement search()"); }

  // Default output shape factory
  static emptyResult(platform) {
    return { platform, resultCount: 0, results: [], meta: { elapsedMs: 0, apiCalls: 0, cacheHits: 0 } };
  }

  // Normalize a raw item into the shared result shape
  static normalizeResult(item) {
    return {
      title: item.title || "",
      url: item.url || "",
      author: item.author || "",
      score: typeof item.score === "number" ? item.score : 0,
      signals: item.signals || {},
      tier: item.tier || null,
    };
  }
}

// Structured fetch wrapper with timeout
async function fetchWithTimeout(url, options = {}) {
  const { timeout = 10_000, headers = {}, signal } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  const linkedSignal = signal
    ? AbortSignal.any?.([signal, controller.signal]) ?? controller.signal
    : controller.signal;
  try {
    const response = await fetch(url, { headers, signal: linkedSignal });
    clearTimeout(timeoutId);
    if (!response.ok) {
      const err = new Error(`HTTP ${response.status}`);
      err.statusCode = response.status;
      throw err;
    }
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === "AbortError" && !signal?.aborted) {
      const timeoutErr = new Error(`Request timeout after ${timeout}ms`);
      timeoutErr.code = "TIMEOUT";
      throw timeoutErr;
    }
    throw error;
  }
}
```

Key points:
- `fetchWithTimeout` is the single HTTP primitive — every collector uses it, no raw `fetch` allowed
- `SocialCollector.emptyResult()` shared factory prevents scattered boilerplate
- `SocialCollector.normalizeResult()` normalizes per-item shape

### `lib/collectors/index.js`

```js
import { HNCollector } from "./hn.js";
import { V2exCollector } from "./v2ex.js";
import { GitHubCollector } from "./github-collector.js";
import { RSSCollector } from "./rss.js";
import { YouTubeCollector } from "./youtube.js";

// Lazy registry — collectors instantiated only when first accessed
let _registry = null;

function buildRegistry() {
  if (_registry) return _registry;
  _registry = new Map([
    ["hn", new HNCollector()],
    ["v2ex", new V2exCollector()],
    ["github", new GitHubCollector()],
    ["rss", new RSSCollector()],
    ["youtube", new YouTubeCollector()],
  ]);
  return _registry;
}

export function getCollector(name) {
  return buildRegistry().get(name) ?? null;
}

export function listCollectors() {
  return [...buildRegistry().entries()].map(([name, c]) => ({
    name,
    label: c.label,
    ...c.checkAvailability(),
  }));
}

export function runCollectorDoctor() {
  const collectors = listCollectors();
  const checks = collectors.map((c) => ({
    name: `collector:${c.name}`,
    ok: c.available,
    note: c.available ? c.label : `${c.label}: ${c.reason || "unavailable"}`,
    fix: c.installHint || "",
  }));
  return {
    ok: checks.every((c) => c.ok || c.name === "collector:youtube"), // youtube is optional
    checks,
    collectors,
  };
}
```

Key points:
- Lazy instantiation via closure — no side effects on import
- `runCollectorDoctor()` mirrors `runDoctor()` return shape: `{ ok, checks }`
- YouTube is explicitly optional (deemed ok if unavailable)

## Phase 2: No-Auth Collectors

### HN Collector (`lib/collectors/hn.js`)

**API:** `https://hn.algolia.com/api/v1/search?query=...&hitsPerPage=...`
- Rate limit: 10,000 req/hour per IP (handled by caller, not internal)
- No auth required
- Reference: [algolia/hn-search](https://github.com/algolia/hn-search), [fraction/node-hacker-news-api](https://github.com/fraction/node-hacker-news-api)

```js
class HNCollector extends SocialCollector {
  get platform() { return "hn"; }
  get label() { return "Hacker News (Algolia)"; }

  async search(query, { limit = 20 } = {}) {
    const start = Date.now();
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&hitsPerPage=${Math.min(limit, 100)}`;
    const res = await fetchWithTimeout(url, { timeout: 8_000 });
    const data = await res.json();
    return {
      platform: this.platform,
      resultCount: data.hits?.length ?? 0,
      results: (data.hits || []).map((h) => SocialCollector.normalizeResult({
        title: h.title || "",
        url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
        author: h.author,
        score: h.points,
        signals: { comments: h.num_comments, createdAt: h.created_at },
      })),
      meta: { elapsedMs: Date.now() - start, apiCalls: 1, cacheHits: 0 },
    };
  }
}
```

### V2EX Collector (`lib/collectors/v2ex.js`)

**API:** `https://www.v2ex.com/api/topics/hot.json`
- Public JSON API, no auth, no rate limit documented
- Also available: `/api/topics/latest.json`, `/api/topics/show.json?node_name=...`

```js
class V2exCollector extends SocialCollector {
  get platform() { return "v2ex"; }
  get label() { return "V2EX (public API)"; }

  async search(query, { limit = 20 } = {}) {
    const start = Date.now();
    const url = "https://www.v2ex.com/api/topics/hot.json";
    const res = await fetchWithTimeout(url, {
      timeout: 8_000,
      headers: { "User-Agent": "emet-collector/1.0" },
    });
    const data = await res.json();
    // V2EX has no search API — fetch hot topics, filter client-side
    const filtered = data
      .filter((t) => !query || t.title?.toLowerCase().includes(query.toLowerCase()))
      .slice(0, limit);
    return {
      platform: this.platform,
      resultCount: filtered.length,
      results: filtered.map((t) => SocialCollector.normalizeResult({
        title: t.title,
        url: t.url,
        author: t.member?.username,
        score: t.replies ?? 0,
        signals: { node: t.node?.title, createdAt: t.created },
      })),
      meta: { elapsedMs: Date.now() - start, apiCalls: 1, cacheHits: 0 },
    };
  }
}
```

### GitHub Collector (`lib/collectors/github-collector.js`)

**API:** `https://api.github.com/search/repositories?q=...&sort=stars&per_page=...`
- Public REST API, no auth for basic search (60 req/hour unauthenticated)
- Also: `https://api.github.com/search/code?q=...`, `https://api.github.com/search/issues?q=...`

```js
class GitHubCollector extends SocialCollector {
  get platform() { return "github"; }
  get label() { return "GitHub (public REST)"; }

  async search(query, { limit = 10, type = "repositories" } = {}) {
    const start = Date.now();
    const typeMap = {
      repositories: "repositories",
      code: "code",
      issues: "issues",
    };
    const kind = typeMap[type] || "repositories";
    const url = `https://api.github.com/search/${kind}?q=${encodeURIComponent(query)}&sort=stars&per_page=${Math.min(limit, 100)}`;
    const res = await fetchWithTimeout(url, {
      timeout: 10_000,
      headers: {
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "emet-collector/1.0",
      },
    });
    const data = await res.json();
    return {
      platform: this.platform,
      resultCount: data.items?.length ?? 0,
      results: (data.items || []).map((item) => SocialCollector.normalizeResult({
        title: item.full_name || item.name || item.title || "",
        url: item.html_url || "",
        author: item.owner?.login || item.user?.login || "",
        score: item.stargazers_count ?? item.score ?? 0,
        signals: {
          forks: item.forks_count,
          language: item.language,
          description: item.description,
          updatedAt: item.updated_at,
        },
      })),
      meta: { elapsedMs: Date.now() - start, apiCalls: 1, cacheHits: 0 },
    };
  }
}
```

### RSS Collector (`lib/collectors/rss.js`)

**Design decision:** Parse RSS/Atom with zero dependencies. RSS 2.0 and Atom are well-specified XML formats. A minimal XML parser for these two specific schemas is ~60 lines.

Reference: [rbren/rss-parser](https://github.com/rbren/rss-parser) uses `xml2js` (heavy). We extract only `<title>`, `<link>`, `<author>`, `<pubDate>` from `<item>`/`<entry>` elements — no full XML tree needed.

```js
class RSSCollector extends SocialCollector {
  get platform() { return "rss"; }
  get label() { return "RSS/Atom feeds"; }

  async search(feedUrl, { limit = 20 } = {}) {
    const start = Date.now();
    const res = await fetchWithTimeout(feedUrl, { timeout: 12_000 });
    const xml = await res.text();
    const items = parseRSSItems(xml); // minimal regex-based extraction
    return {
      platform: this.platform,
      resultCount: items.length,
      results: items.slice(0, limit).map((item) => SocialCollector.normalizeResult(item)),
      meta: { elapsedMs: Date.now() - start, apiCalls: 1, cacheHits: 0 },
    };
  }
}
```

### YouTube Collector (`lib/collectors/youtube.js`)

**Runtime dep:** `yt-dlp` (checked via `checkAvailability()` — `which yt-dlp` or equivalent)
- Gracefully degrades when yt-dlp is missing
- Returns metadata + subtitle text for a given video URL
- NOT a search engine — takes a specific video URL

```js
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);

class YouTubeCollector extends SocialCollector {
  get platform() { return "youtube"; }
  get label() { return "YouTube (via yt-dlp)"; }

  checkAvailability() {
    // ponytail: sync which check, full async probe if needed later
    try {
      execFileSync("which", ["yt-dlp"], { stdio: "ignore" });
      return { available: true };
    } catch {
      return {
        available: false,
        reason: "yt-dlp not found",
        installHint: "Install yt-dlp: brew install yt-dlp or pip install yt-dlp",
      };
    }
  }

  async search(videoUrl, { limit = 1 } = {}) {
    // Returns metadata via yt-dlp --dump-json
    // Subtitle extraction requires --write-sub --skip-download
    const { stdout } = await execFileAsync("yt-dlp", [
      "--dump-json",
      "--no-playlist",
      "--flat-playlist",
      videoUrl,
    ], { timeout: 15_000 });
    const meta = JSON.parse(stdout);
    return {
      platform: this.platform,
      resultCount: 1,
      results: [SocialCollector.normalizeResult({
        title: meta.title,
        url: meta.webpage_url || videoUrl,
        author: meta.uploader,
        score: meta.view_count ?? 0,
        signals: {
          duration: meta.duration,
          uploadDate: meta.upload_date,
          description: meta.description?.slice(0, 200),
        },
      })],
      meta: { elapsedMs: 0, apiCalls: 0, cacheHits: 0 },
    };
  }
}
```

## Phase 3: Doctor Integration

Modify `lib/cli.js`:

```js
// Add import
import { runCollectorDoctor } from "./collectors/index.js";

// In runDoctor(), append collector checks:
export function runDoctor({ cwd = process.cwd(), nodeVersion = process.version } = {}) {
  // ... existing checks ...

  // Add collector availability
  const collectorResult = runCollectorDoctor();
  for (const check of collectorResult.checks) {
    checks.push(check);
    // Collector availability lines
    lines.push(`${check.ok ? "ok" : "warn"} ${check.name}: ${check.note}${check.fix ? `\n  fix: ${check.fix}` : ""}`);
  }

  // YouTube is optional — don't fail doctor for missing yt-dlp
  const hardFailures = checks.filter((check) =>
    !check.ok &&
    ["node", "package", "mcp binary", "pi extension"].includes(check.name)
  );
  return { ok: hardFailures.length === 0, checks, text: lines.join("\n") };
}
```

## Phase 4: Tests

File: `test/collectors.test.js`

Tests using `node:test` + `node:assert/strict` (matching existing conventions):

1. **Registry tests:**
   - `getCollector("hn")` returns an HNCollector instance
   - `getCollector("nonexistent")` returns null
   - `listCollectors()` returns 5 entries with name, label, available
   - `runCollectorDoctor()` returns `{ ok, checks, collectors }`

2. **Availability tests:**
   - All no-auth collectors report `available: true`
   - YouTube reports `available: false` when yt-dlp missing (mocked `execFileSync`)
   - `runCollectorDoctor().checks` includes a warn-level entry for youtube when unavailable

3. **HN collector tests (mocked fetch):**
   - Returns normalized results from Algolia JSON response
   - Handles empty hits gracefully
   - Respects `limit` parameter (clamped to 100)
   - Includes elapsedMs in meta

4. **GitHub collector tests (mocked fetch):**
   - Returns repositories search results normalized
   - Supports `type: "code"` and `type: "issues"` variants
   - Handles empty items array

5. **RSS collector tests (mocked fetch):**
   - Parses RSS 2.0 `<item>` entries extracting title, link, author, pubDate
   - Parses Atom `<entry>` entries extracting title, link, author, published
   - Handles empty/malformed feed gracefully (returns 0 results)

6. **Error handling tests:**
   - HTTP error status codes produce structured errors (not crashes)
   - Timeout produces TIMEOUT error code
   - Missing optional runtime (yt-dlp) returns `available: false`, not a crash

7. **Existing test invariance:**
   - `test/cli.test.js` — doctor still passes
   - `test/web-research.test.js` — all existing tests pass unchanged

Mocking pattern (matches `node:test` conventions):
```js
import test from "node:test";
import assert from "node:assert/strict";
import { MockAgent, setGlobalDispatcher } from "undici"; // or manual fetch mock

// ponytail: manual fetch mock if undici isn't already a dep
// Since better-sqlite3 is a native dep, undici is likely available transitively
```

## Phase 5: Integration Hooks (future, out of scope)

These are documented for visibility but NOT implemented in this issue. They belong in #19.

- `emet` tool can call `getCollector("hn").search(...)` internally for domain-specific enrichment
- `web_fetch` remains the raw URL fetch tool — collectors provide structured, normalized results
- `emet doctor` already reports collector availability (done in Phase 3)

## Acceptance Criteria

- [ ] `lib/collectors/collector.js` — base class with `fetchWithTimeout`, `emptyResult`, `normalizeResult`
- [ ] `lib/collectors/hn.js` — HN via Algolia, works without auth
- [ ] `lib/collectors/v2ex.js` — V2EX hot topics, works without auth
- [ ] `lib/collectors/github-collector.js` — GitHub REST search, works without auth
- [ ] `lib/collectors/rss.js` — RSS/Atom parsing, zero dependencies
- [ ] `lib/collectors/youtube.js` — yt-dlp metadata, degrades gracefully
- [ ] `lib/collectors/index.js` — lazy registry, `getCollector`, `listCollectors`, `runCollectorDoctor`
- [ ] `lib/cli.js` — `runDoctor()` includes collector availability
- [ ] `test/collectors.test.js` — registry lookup, availability, HN, GitHub, RSS with mocked fetch
- [ ] `npm test` — all existing tests pass, including cli.test.js
- [ ] `emet doctor` — reports all 5 collectors with availability status
- [ ] No new MCP tools in `tools/list`
- [ ] No new dependencies added to `package.json`
- [ ] No query/result content logged to telemetry

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| GitHub API 60 req/hour unauthenticated | Collectors are internal, called sparingly; rate limit is a caller concern |
| V2EX has no search endpoint | Client-side filter on hot topics; acceptable for low-volume use |
| RSS XML parsing fragile with regex | Only extract known fields (title, link, author, pubDate); fallback to empty on parse failure |
| yt-dlp not installed | `checkAvailability()` returns `available: false` with install hint; doctor warns, doesn't fail |

## Skipped / Ponytail Decisions

- **No `xml2js`/`feedparser` dependency** for RSS — minimal regex extraction from RSS 2.0 + Atom `<item>`/`<entry>` elements. If feeds with namespaced extensions become critical, add `feedparser` later.
- **No `algoliasearch` npm package** for HN — single REST endpoint via `fetch`, no client library needed.
- **No abstract factory or DI container** — plain Map-based lazy registry, 15 lines.
- **No per-collector config files** — hardcoded URLs and timeouts, change when needed.
- **No caching in collectors** — existing SQLite cache in `research-memory.js` handles this at a higher level.
- **No streaming/pagination** — bounded result limits per call (≤100 per collector).
