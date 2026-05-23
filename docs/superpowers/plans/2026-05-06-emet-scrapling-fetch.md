# emet Scrapling fetch implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a small async-first fetch adapter so `emet` can fall back to Scrapling only when pages are blocked, thin, or JS-driven.

**Architecture:** Keep `lib/web-research.js` as the orchestration layer, but move fetch selection into a tiny adapter module. The adapter will try the current fast HTTP path first, then escalate to Scrapling (`AsyncFetcher`, `DynamicFetcher`, `StealthyFetcher`) through a Python bridge only when heuristics say the page is unreadable or protected. Jina remains a separate reader fallback.

**Tech Stack:** Node.js ESM, `node:test`, `child_process`, Python 3, local Scrapling checkout via `PYTHONPATH`.

---

### Task 1: Add the fetch adapter and heuristic selection

**Files:**
- Create: `lib/page-fetch-adapter.js`
- Create: `test/page-fetch-adapter.test.js`

- [ ] **Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { assessPageAttempt, chooseScraplingMode } from "../lib/page-fetch-adapter.js";

test("chooseScraplingMode prefers async for thin blocked html", () => {
  const mode = chooseScraplingMode({ status: 429, body: "<html><body>Too Many Requests</body></html>", url: "https://example.com" });
  assert.equal(mode, "stealthy");
});

test("chooseScraplingMode prefers dynamic when html is a shell", () => {
  const mode = chooseScraplingMode({ status: 200, body: "<html><body><div id=app></div><script src=\"/app.js\"></script></body></html>", url: "https://example.com" });
  assert.equal(mode, "dynamic");
});

test("assessPageAttempt marks short plain text as weak", () => {
  const result = assessPageAttempt({ status: 200, body: "short", contentType: "text/html" });
  assert.equal(result.weak, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/page-fetch-adapter.test.js`
Expected: fail because the module and exports do not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `lib/page-fetch-adapter.js` with:
- `assessPageAttempt({ status, body, contentType, url })`
- `chooseScraplingMode({ status, body, url })`
- `fetchWithScrapling(url, mode, signal, config)`
- `fetchPageSourceWithFallback({ url, signal, config, fastFetch, jinaFetch })`

Use cheap string checks only:
- 403 / 429 => `stealthy`
- challenge / cloudflare / captcha / access denied => `stealthy`
- JS shell / app root / hydration markers / almost-empty DOM => `dynamic`
- plain weak HTML => `async`

Use a Python 3 bridge for Scrapling with `PYTHONPATH` pointed at the local `Scrapling/` checkout so `from scrapling.fetchers import AsyncFetcher, DynamicFetcher, StealthyFetcher` works.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/page-fetch-adapter.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/page-fetch-adapter.js test/page-fetch-adapter.test.js
git commit -m "feat: add Scrapling fetch adapter"
```

### Task 2: Wire the adapter into web research

**Files:**
- Modify: `lib/web-research.js`
- Modify: `test/web-research.test.js`

- [ ] **Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { fetchPageSource } from "../lib/web-research.js";

test("fetchPageSource escalates blocked pages through the adapter", async () => {
  const page = await fetchPageSource(
    "https://blocked.example.com",
    undefined,
    {
      pageTextLimit: 4000,
      minPageText: 300,
      useJinaFallback: true,
      fetchAdapter: {
        async fetchPageSourceWithFallback() {
          return {
            title: "Blocked Example",
            url: "https://blocked.example.com",
            text: "Recovered content " + "x".repeat(400),
            sourceType: "official_doc",
            publishDate: null,
            codeBlocks: [],
          };
        },
      },
    }
  );

  assert.equal(page.title, "Blocked Example");
  assert.match(page.text, /Recovered content/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/web-research.test.js -t "fetchPageSource escalates blocked pages through the adapter"`
Expected: fail because `fetchPageSource` ignores `fetchAdapter`.

- [ ] **Step 3: Write minimal implementation**

Update `fetchPageSource()` in `lib/web-research.js` so it:
- keeps the current fast HTTP path
- uses the adapter when the HTTP result is weak, blocked, or JS-driven
- still falls back to Jina reader when needed
- preserves cache keys and timeframe filtering

Keep the adapter optional:
- if `config.fetchAdapter` exists, use it
- otherwise use the default local adapter

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/web-research.test.js -t "fetchPageSource escalates blocked pages through the adapter"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/web-research.js test/web-research.test.js
git commit -m "feat: route page fetches through Scrapling adapter"
```

### Task 3: Run the full relevant test slice

**Files:**
- None

- [ ] **Step 1: Run the full web research suite**

Run: `node --test test/web-research.test.js test/page-fetch-adapter.test.js`
Expected: all tests pass.

- [ ] **Step 2: Check for regressions in the broader suite**

Run: `node --test`
Expected: existing tests still pass.

- [ ] **Step 3: Commit if anything changed during verification**

```bash
git add -A
git commit -m "test: verify Scrapling fetch integration"
```
