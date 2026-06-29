# Scope
Audit of layer boundaries, facade purity, deleted-architecture leftovers, and boundary-audit gaps.

# Files inspected
- `/Users/einarjaeger/github/emet/AGENTS.md`
- `/Users/einarjaeger/github/emet/docs/fixes/2026-06-25-full-audit-scope.md`
- `/Users/einarjaeger/github/emet/lib/web-research.js`
- `/Users/einarjaeger/github/emet/lib/research/pipeline.js`
- `/Users/einarjaeger/github/emet/lib/retrieval/community.js`
- `/Users/einarjaeger/github/emet/lib/research-memory.js`
- `/Users/einarjaeger/github/emet/lib/research.js`
- `/Users/einarjaeger/github/emet/lib/research-session.js`
- `/Users/einarjaeger/github/emet/lib/collectors/index.js`
- `/Users/einarjaeger/github/emet/lib/collectors/collector.js`
- `/Users/einarjaeger/github/emet/lib/collectors/hn.js`
- `/Users/einarjaeger/github/emet/lib/collectors/rss.js`
- `/Users/einarjaeger/github/emet/lib/collectors/github-collector.js`
- `/Users/einarjaeger/github/emet/lib/collectors/v2ex.js`
- `/Users/einarjaeger/github/emet/lib/collectors/youtube.js`
- `/Users/einarjaeger/github/emet/docs/pipeline.md`
- `/Users/einarjaeger/github/emet/test/boundary-audit.test.js`

# Findings
## Confirmed
1. `lib/retrieval/community.js:308-365` reaches back through `../web-research.js` at runtime for `fetchPageSource`, `synthesizeResearch`, and `shouldRequireAuthoritativeSources`. That creates an adapter -> facade -> adapter loop and breaks the intended layer direction. Because the imports are dynamic, the current boundary test does not see them.

## Likely
2. `lib/web-research.js:23-27` is still a thin facade, but it now exposes mutable compat surfaces (`clearResearchMemory`, `collectorSessions`, `runCollectorInteractive`, `shouldRunCollectorInteractive`) alongside the newer workbench exports. That keeps old collector-era state and control flow visible through the public entrypoint instead of letting the facade stay purely declarative.

3. `lib/research/pipeline.js:17` still imports `clearResearchMemory`, `readPageSnapshot`, and `writePageSnapshot` from `lib/research-memory.js`, but those symbols are not used in the file. `lib/retrieval/community.js:86,118,222,329,358,370` also still returns `legacyAction` values such as `collector_search`, `collector_fetch`, and `collector_synthesize`. These are compatibility leftovers, not active architecture, and they make the old collector model harder to delete cleanly.

## Boundary-audit gap
4. `test/boundary-audit.test.js:13-23,72-107,143-198` only scans static `import` statements with a regex and never inspects dynamic imports. It also does not directly cover `lib/web-research.js` or `lib/retrieval/community.js`, which are the two files most likely to regress boundary direction. As written, the test can pass while the real facade/adapter loop remains in place.

# Risks and open questions
- Do we still need the collector-era compatibility surface (`collectorSessions`, `collector_*`, `legacyAction`) for any shipped consumer, or can it be removed now?
- Should the community adapter receive `fetchPageSource`/`synthesizeResearch` via the workbench layer, or should those helpers move out of the facade so `community.js` stops importing `web-research.js`?
- Is there any reason to keep `clearResearchMemory` and page-snapshot helpers imported in `pipeline.js` if they are unused?

# Recommended fixes
- Break the runtime cycle by removing `web-research.js` imports from `lib/retrieval/community.js`; call the needed helpers from lower-layer modules or thread them in from `lib/research/pipeline.js`.
- Keep `lib/web-research.js` as re-export-only, and drop legacy session/cache exports unless there is a documented external dependency.
- Remove unused imports in `lib/research/pipeline.js` and prune `legacyAction`/`collector_*` output once the compatibility window closes.
- Strengthen the boundary audit so it checks dynamic imports and explicitly covers the facade and community adapter.

# Suggested tests
- Add a boundary test that fails if `lib/retrieval/community.js` imports `../web-research.js`.
- Extend `test/boundary-audit.test.js` to detect `import()` targets, not just static imports.
- Add a test that `lib/web-research.js` stays re-export-only, with any legacy exports explicitly whitelisted.
- Add a regression test for the old collector result shape only if it is still meant to remain supported.
