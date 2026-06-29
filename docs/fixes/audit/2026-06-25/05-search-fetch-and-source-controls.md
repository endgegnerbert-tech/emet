# Scope
Audit of provider ordering/fallbacks, source filtering, host/path controls, fetch pipeline behavior, article extraction, and PDF extraction.

# Files inspected
- `/Users/einarjaeger/github/emet/lib/research/search.js`
- `/Users/einarjaeger/github/emet/lib/research/fetch.js`
- `/Users/einarjaeger/github/emet/lib/page-fetch-adapter.js`
- `/Users/einarjaeger/github/emet/lib/article-extractor.js`
- `/Users/einarjaeger/github/emet/lib/pdf-extractor.js`
- `/Users/einarjaeger/github/emet/lib/research/extraction.js`
- `/Users/einarjaeger/github/emet/lib/research/helpers.js`
- `/Users/einarjaeger/github/emet/lib/research/config.js`
- `/Users/einarjaeger/github/emet/lib/domains/index.js`
- `/Users/einarjaeger/github/emet/lib/research/synthesis.js`
- `/Users/einarjaeger/github/emet/lib/retrieval/community.js`
- `/Users/einarjaeger/github/emet/lib/tool-schema.js`
- `/Users/einarjaeger/github/emet/test/page-fetch-adapter.test.js`
- `/Users/einarjaeger/github/emet/test/page-store.test.js`
- `/Users/einarjaeger/github/emet/test/source-scoring.test.js`
- `/Users/einarjaeger/github/emet/test/web-research.test.js`
- `/Users/einarjaeger/github/emet/test/research-logging.test.js`

# Findings
1. **Confirmed: strict host/path controls are not enforced at the fetch boundary, so disallowed URLs can still be retrieved.**
   - The public contract says `hostAllowlist` is a "strict fail-closed host or host/path allowlist" in `/Users/einarjaeger/github/emet/lib/tool-schema.js:53-54`.
   - But `/Users/einarjaeger/github/emet/lib/research/fetch.js:72-190` never checks `matchesAllowedHosts()` or `filterBySourceOptions()` before calling `fetchTextWithRetry()`, `fetchJinaPageSource()`, or PDF extraction.
   - The same applies to the public `webFetch()` path in `/Users/einarjaeger/github/emet/lib/research/synthesis.js:134-157` and the collector fetch path in `/Users/einarjaeger/github/emet/lib/retrieval/community.js:308-349`, which both call `fetchPageSource()` directly.
   - Result: source controls are applied after network I/O in some places, and not at all for explicit fetch entrypoints. That is a real policy bypass if callers rely on allowlists to prevent touching certain hosts.

2. **Confirmed: academic search results bypass source filtering and host allowlists.**
   - `/Users/einarjaeger/github/emet/lib/research/search.js:245-252` appends `searchArxiv()`, `searchSemanticScholar()`, and `searchCrossref()` output after the DuckDuckGo loop.
   - Those academic results never go back through `filterSearchResults()` or `filterBySourceOptions()`.
   - This means `allowedSourceTypes`, `allowedSources`, and `hostAllowlist` are enforced for DDG results but not for the appended academic providers, so a restricted run can still surface disallowed paper sources.

3. **Confirmed: host/path matching is too broad and can overmatch sibling paths.**
   - `/Users/einarjaeger/github/emet/lib/research/search.js:57-63` uses `parsed.pathname.toLowerCase().startsWith(constraint.pathPrefix)`.
   - A constraint like `example.com/docs` therefore matches `/docs`, `/docs/`, and also `/docsx` or `/docs-evil`.
   - That weakens the "strict fail-closed host or host/path allowlist" contract and can admit unintended pages from the same host.

# Risks and open questions
- `searchDuckDuckGo()` caches by query, result count, provider name, and filter settings in `/Users/einarjaeger/github/emet/lib/research/search.js:167-175`, but not by `mode`. Today that mostly stays hidden because the default profiles use different `searchProvider` values, yet a manual `mode`/`searchProvider` mix could still reuse the wrong cache shape.
- `extractPageSnapshot()` in `/Users/einarjaeger/github/emet/lib/research/extraction.js:7-25` is structurally fine, but it always re-parses article HTML through `extractBasicArticle()`. I did not see a correctness bug there, just a mild risk of losing article-extractor metadata if downstream code ever expects it.

# Recommended fixes
- Add a strict allowlist check inside `fetchPageSource()` before any network request, and have `webFetch()` / collector fetch paths honor the same gate instead of relying on later pipeline filtering.
- Re-filter the academic provider results in `searchDuckDuckGo()` before ranking/caching, or route them through the same source filter helper as DDG.
- Replace the path-prefix `startsWith()` check with a segment-aware boundary match so `/docs` does not match `/docsx`.
- If cache reuse across modes is intentional, encode `mode` in the search cache key; otherwise treat it as a bug and prevent cross-mode reuse.

# Suggested tests
- A fetch test that proves `webFetch()` and `fetchPageSource()` refuse a URL outside `hostAllowlist`.
- A search test that runs `mode: "academic"` with a restrictive allowlist and verifies arxiv/crossref results are filtered out.
- A path-control test that asserts `example.com/docs` does not match `https://example.com/docsx`.
- A cache regression test that proves fast and academic search results do not share a stale cache entry when their provider mix differs.
