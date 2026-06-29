# Scope
Audit of dependency value, trust boundaries, performance hotspots, product coherence, and delete-vs-repair candidates.

# Files inspected
- `/Users/einarjaeger/github/emet/package.json`
- `/Users/einarjaeger/github/emet/mcp/server.js`
- `/Users/einarjaeger/github/emet/mcp/handlers/tools.js`
- `/Users/einarjaeger/github/emet/lib/research/extraction.js`
- `/Users/einarjaeger/github/emet/lib/article-extractor.js`
- `/Users/einarjaeger/github/emet/lib/pdf-extractor.js`
- `/Users/einarjaeger/github/emet/lib/research/synthesis.js`
- `/Users/einarjaeger/github/emet/README.md`
- `/Users/einarjaeger/github/emet/CHANGELOG.md`

# Findings
1. Confirmed: telemetry is duplicated and crosses a third-party trust boundary on every MCP run and tool call.
   - `/Users/einarjaeger/github/emet/mcp/server.js:121-130` creates a `Pinglet` client at server startup and immediately tracks `run`.
   - `/Users/einarjaeger/github/emet/mcp/handlers/tools.js:8-15,53-84` creates a second `Pinglet` client and tracks each call/skip/success/error path.
   - Both paths default to `https://pinglet-production.up.railway.app/ping`, so the package emits telemetry twice from two modules unless the environment override is set.
   - This is a real trust-boundary cost for a read-only research tool and a needless startup/per-call latency risk.

2. Confirmed: the HTML/PDF extraction stack is heavier than the value it currently returns.
   - `/Users/einarjaeger/github/emet/lib/research/extraction.js:7-30` calls `extractArticle()`, but then immediately strips `article.content` back through `extractBasicArticle()`, so the third-party parser mostly contributes title/url guesswork.
   - `/Users/einarjaeger/github/emet/lib/article-extractor.js:1-24` exposes richer metadata, but the adapter discards author/published/description fields.
   - `/Users/einarjaeger/github/emet/lib/pdf-extractor.js:15-39` adds an optional native runtime path, but missing `@napi-rs/canvas` just returns `null`, so the feature silently degrades.
   - For a "zero-setup" product, this is a lot of install/build risk for best-effort extraction. The dependency set should either earn a stronger guarantee or be slimmed down.

3. Confirmed: `turndown` is dead weight in the current codebase.
   - `/Users/einarjaeger/github/emet/package.json:97-105` still ships `turndown`, but there is no runtime import or test reference anywhere in the repo.
   - The current code path uses `@extractus/article-extractor` plus regex fallback instead.
   - `/Users/einarjaeger/github/emet/CHANGELOG.md:197` still describes the HTML path as using turndown, so the public history is now ahead of the implementation.

4. Likely: `web_fetch` can produce oversized payloads that are expensive for clients.
   - `/Users/einarjaeger/github/emet/lib/research/synthesis.js:134-157` forces `pageTextLimit: 1_000_000` and returns the full page text.
   - That is convenient for raw reads, but large PDFs or long HTML pages can become very large IPC/MCP payloads and increase memory pressure.
   - A hard cap, chunked output, or a separate explicit large-content flow would reduce the blast radius.

# Risks and open questions
- Is telemetry meant to be always-on for both MCP and Pi entrypoints, or should consent happen at host setup time?
- Is article/PDF parsing a strategic feature, or just a fallback convenience?
- Should `web_fetch` stay able to emit arbitrarily large text, or should large content be gated behind a different surface?

# Recommended fixes
- Collapse telemetry into one optional adapter and make the trust boundary explicit.
- Remove `turndown` from `package.json` unless a real Markdown conversion step is restored.
- Either simplify the extraction stack or mark the heavy parsers optional so the package stays honest about its zero-setup promise.
- Put a size guard on `web_fetch` output before it reaches clients.

# Suggested tests
- A server test that verifies only one analytics path is initialized per run.
- A fallback test that `extractPageSnapshot()` still returns usable text when `@napi-rs/canvas` is unavailable.
- A manifest test that fails if unused dependencies like `turndown` reappear without a runtime import.
- A large-fixture test that asserts `webFetch()` stays under a defined output limit.
