# Scope
Audit of cache layers, persistent DB semantics, topic fallback contamination, trace/log safety, and global vs project cache scope.

# Files inspected
- `/Users/einarjaeger/github/emet/lib/research-memory.js`
- `/Users/einarjaeger/github/emet/lib/research/pipeline.js`
- `/Users/einarjaeger/github/emet/lib/research/cache.js`
- `/Users/einarjaeger/github/emet/lib/research/search.js`
- `/Users/einarjaeger/github/emet/lib/research/fetch.js`
- `/Users/einarjaeger/github/emet/lib/local-logger.js`
- `/Users/einarjaeger/github/emet/lib/research-trace.js`
- `/Users/einarjaeger/github/emet/test/research-logging.test.js`
- `/Users/einarjaeger/github/emet/test/web-research.test.js`
- `/Users/einarjaeger/github/emet/test/boundary-audit.test.js`
- `/Users/einarjaeger/github/emet/docs/fixes/2026-06-25-cache-semantics-and-compat-leftovers.md`

# Findings
1. Confirmed: persistent cache scope is effectively global/user-wide, not project-scoped.
   - `lib/research-memory.js:11-31` resolves the DB under a user cache directory by default, and only `EMET_CONTEXT_PATH` changes that.
   - `lib/research-memory.js:64-69` and `:109-115` define `project` columns, but `writeCachedResult()` and `migrateFromJsonIfNeeded()` always write `project` as `''` (`:147-155`, `:326-328`).
   - `readCachedResult()` never filters by project (`:361-377`), so every project sharing the same cache path can read the same persisted answers.
   - Impact: queries, page snapshots, and dev cache artifacts can bleed across unrelated repos or workspaces, and the schema suggests isolation that does not exist.

2. Confirmed: topic fallback can replay semantically different answers after an exact cache miss.
   - `lib/research-memory.js:242-294` strips years, version strings, GitHub repo paths, and URLs when building `topicCacheKey()`.
   - `lib/research/pipeline.js:158-173` falls back to that topic key on an exact miss, then writes the same slim result back under both keys (`:665-669`).
   - Impact: versioned, changelog, deprecation, and URL-specific questions can inherit a cached answer from a broader topic query even when the retrieval constraints differ.

3. Confirmed: trace/log output is too permissive for a safety-sensitive cache pipeline.
   - `lib/local-logger.js:46-69` preserves full `Error.stack`, walks arbitrary objects recursively, and records `cwd` in every event (`:80-90`).
   - `lib/research/pipeline.js:143-145` logs full `config`, `versionContext`, and `queryUnderstandingDecision`; `:155` and `:172` log full cached result payloads; `:671-672` logs the final result again.
   - `lib/research/search.js:228-241` and `lib/research/fetch.js:176-188` pass raw error objects into the logger.
   - Impact: JSONL logs can capture local paths, source URLs, full query text, and internal decision state. If logs are shared or uploaded, that is a real privacy and secret-spill risk.

# Risks and open questions
- The `project` column in `global_usage_cache` and `events` looks like a future-proofing hook, but nothing reads it today.
- `EMET_DEV_CACHE` writes full result snapshots into the same user cache tree, so the dev path is also global unless callers isolate the environment.
- I did not find any test that asserts project isolation or denies topic fallback for version-sensitive queries.

# Recommended fixes
- Add an explicit project key to persistent cache reads and writes, or make the cache path project-local by default.
- Stop using topic fallback for versioned, changelog, deprecation, or URL-constrained queries.
- Redact or omit `cwd`, `stack`, and raw config/result blobs from default logs; keep them behind an opt-in debug mode if needed.
- If project isolation is not desired, remove the `project` columns to avoid implying a guarantee the code does not enforce.

# Suggested tests
- A cache isolation test that writes the same key under two different project contexts and proves they do not collide.
- A topic fallback test that verifies a `v1`/`v2` or changelog-style query does not reuse a broader topic cache entry.
- A logging test that asserts default events do not include `cwd`, `stack`, or full `config`/`result` objects.
- A dev-cache test that verifies `EMET_DEV_CACHE` does not cross-contaminate unrelated workspaces.
