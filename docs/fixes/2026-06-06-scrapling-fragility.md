# Scrapling Daemon: Fragile Python Dependency Chain

**Severity:** MEDIUM — JS-heavy/blocked pages lose fallback when daemon is unavailable

## Problem

`lib/page-fetch-adapter.js` spawns a Python daemon process for JS-heavy and blocked pages:

```python
from scrapling.fetchers import AsyncFetcher, AsyncDynamicSession, AsyncStealthySession
```

Prerequisites:
- `.venv-scrapling/bin/python` (or system python with scrapling installed)
- `lxml`, `patchright`, `playwright`, `scrapling` Python packages
- Playwright Chromium binary (hundreds of MB)

## Failure Modes

1. **Missing venv** → `validateScraplingRuntime()` returns `{ ok: false }` → `ensureScraplingDaemon()` throws → `fetchWithScrapling()` returns `null`
2. **Daemon idle timeout** (DAEMON_IDLE_TIMEOUT_MS = 3000) → daemon self-kills after 3s idle → next request must restart it (cold start ~2-5s)
3. **Stderr floods** → buffer grows unchecked (clamped at 20KB) → memory pressure
4. **Daemon crash** → `failDaemonState()` rejects all pending → pending requests return `null`
5. **No exit hook** → daemon orphaned if parent process crashes before `SIGKILL`

## Impact

- Pages behind Cloudflare or with heavy JS → no content retrieved
- The fallback (Jina Reader) can handle some but not all
- Dynamic session pages (SPA, React) fail silently

## Fix

### Option A: Replace with Playwright in Node.js

- Use `playwright-core` (already a dependency through `patchright`)
- No Python daemon, no IPC, no idle timeout
- Single `browser.newPage()` call per request

```js
import { chromium } from "playwright-core";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto(url, { waitUntil: "networkidle" });
const content = await page.content();
```

### Option B: Keep daemon but make it robust

- Increase idle timeout (30s+)
- Add health-check ping every 5s
- Auto-restart on crash
- Add daemon-ready timeout (currently unlimited)

### Option C: Use Jina Reader as primary, Scrapling as last resort

Flip the priority: Jina Reader handles the common case (including JS rendering), Scrapling only for pages Jina can't reach.

**Recommended:** Option C (quickest path, no new dependencies) then Option A (long-term).
