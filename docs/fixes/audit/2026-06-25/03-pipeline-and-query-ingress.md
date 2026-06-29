## Scope
Audited the end-to-end research ingress path: mode selection, domain/config resolution, query understanding, planner handoff, cache short-circuiting, and follow-up query generation.

## Files inspected
- `lib/research/pipeline.js`
- `lib/research/config.js`
- `lib/research/queries.js`
- `lib/research-intent.js`
- `lib/query-understanding.js`
- `lib/planner.js`
- `lib/research-memory.js`
- `lib/research/heuristics.js`
- `lib/research-next-action-policy.js`
- `lib/types.js`
- `docs/pipeline.md`

## Findings
1. **Confirmed: query-understanding hints are dropped before query generation.** `resolveQueryUnderstandingPlanning()` builds additive `queryHints`, but `resolveResearchConfig()` replaces `queryHints` with `domainConfig.queryHints` instead of merging them (`lib/research/config.js:21-52`). `buildQueries()` then re-resolves that stripped config and bases its search variants on the replacement hints (`lib/research/queries.js:43-72`). In practice, caller hints vanish: `getResearchConfig({ queryHints: ["manual-hint"] })` returns `[]`, and `buildQueries("emet roadmap", { mode: "fast", queryHints: ["manual-hint"] }, ...)` only emits the baseline fast queries. This is a planner/input-normalization bug, not just a style issue.
2. **Confirmed: the cache key ignores policy-sensitive fields, so strict and permissive requests can collide.** `modeCacheKey()` and `topicCacheKey()` hash only mode/files/allowedSources/hostAllowlist/allowedSourceTypes/maxPages/maxTurns/searchProvider (`lib/research-memory.js:269-294`). They do not include `requireAuthoritative`, `preferRecent`, `minYear`, `maxYear`, `queryHints`, `overlays`, or `sourcePolicyFlags`, even though those fields materially change admissibility and retrieval shape. `runWebResearch()` uses that key for both in-memory and disk short-circuiting before any fresh policy evaluation (`lib/research/pipeline.js:151-174`). Result: a stricter follow-up can reuse a looser cached answer.
3. **Likely: automatic mode routing never reaches the code planner for repo/package queries.** `classifyQueryIntent()` only upgrades comparison/versioned/temporal/best-practice/academic queries; `defaultMode()` returns `fast` for everything else (`lib/research/heuristics.js:227-245`). That means obvious GitHub/package-registry questions still enter `runWebResearch()` as fast searches unless the caller explicitly sets `mode: "code"`, even though `planResearch()` has a code-specific branch (`lib/planner.js:3-35`). This is planner/query-intent drift: the repo has code-aware retrieval logic, but auto ingress does not select it for repo/package-heavy prompts.

## Risks and open questions
- `planSubqueries()` falls back to a generic clarification search when there are no open subquestions, so a non-empty but still-insufficient turn can easily reuse the same shape of query on the next turn (`lib/research/queries.js:75-80`). I did not prove a user-visible regression here, but it is the main remaining redundant-work path after the cache issues above.
- `topicCacheKey()` intentionally strips years, versions, and URLs. That helps reuse, but without policy fields in the key it can also widen the blast radius of stale results.

## Recommended fixes
- Merge caller-supplied `queryHints` in `resolveResearchConfig()` instead of replacing them, and keep query-understanding hints additive.
- Extend cache-key stability to include policy-affecting inputs, or disable topic fallback when those inputs are present.
- Decide whether repo/package/documentation prompts should auto-upgrade to `code`; if yes, widen `classifyQueryIntent()`/`defaultMode()`. If no, remove the dead code-path ambiguity from `planResearch()`.

## Suggested tests
- `getResearchConfig({ queryHints: ["manual"] })` preserves manual hints and still merges domain hints.
- `buildQueries()` includes caller/query-understanding hints for fast, deep, and academic modes.
- `modeCacheKey()` and `topicCacheKey()` differ when `requireAuthoritative`, `preferRecent`, or `sourcePolicyFlags` change.
- Auto-routing test for `defaultMode()` or `runWebResearch()` on `github`/`package-registry` prompts, depending on the intended product behavior.
