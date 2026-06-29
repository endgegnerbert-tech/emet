# Scope
Checkpoint flow, interactive/session semantics, community/web transition behavior, and collector implementation value/drift.

# Files inspected
- `/Users/einarjaeger/github/emet/lib/research/pipeline.js`
- `/Users/einarjaeger/github/emet/lib/research-flow.js`
- `/Users/einarjaeger/github/emet/lib/research-session.js`
- `/Users/einarjaeger/github/emet/lib/retrieval/community.js`
- `/Users/einarjaeger/github/emet/lib/retrieval/normalize.js`
- `/Users/einarjaeger/github/emet/lib/web-research.js`
- `/Users/einarjaeger/github/emet/lib/tool-schema.js`
- `/Users/einarjaeger/github/emet/lib/collectors/index.js`
- `/Users/einarjaeger/github/emet/lib/collectors/rss.js`
- `/Users/einarjaeger/github/emet/lib/collectors/youtube.js`
- `/Users/einarjaeger/github/emet/test/collector-flow.test.js`
- `/Users/einarjaeger/github/emet/test/retrieval-community.test.js`
- `/Users/einarjaeger/github/emet/test/retrieval-normalize.test.js`
- `/Users/einarjaeger/github/emet/test/research-session.test.js`
- `/Users/einarjaeger/github/emet/test/collectors.test.js`

# Findings
- **[Confirmed, high] Session continuation is brittle because `sessionId` does not preserve the platform set, so a resumed checkpoint can silently fall back to the normal web pipeline.** `runWebResearch()` only enters `runCommunityCheckpoint()` when `selectedCommunityPlatforms()` returns a non-empty list, but `selectedCommunityPlatforms()` re-derives platforms from the new query/config each turn and `research-session.js` stores only query/turn/results, not platforms. That means `sessionId` + `action` is not enough to resume unless the caller repeats `platforms`. References: `lib/research/pipeline.js:137-148`, `lib/research-session.js:35-65`, `lib/retrieval/community.js:15-19`, `lib/retrieval/community.js:74-133`.
- **[Confirmed, high] The community platform contract is mismatched for `rss` and `youtube`.** `runCommunitySearch()` passes the research query string to every platform, but `RSSCollector.search()` expects a feed URL and `YouTubeCollector.search()` expects a video URL. Because `tool-schema.js` advertises `platforms` as community/media backends, explicit `platforms: ["rss"]` or `["youtube"]` is effectively broken for topic-driven checkpoint/search flows. References: `lib/retrieval/community.js:389-419`, `lib/collectors/rss.js:62-78`, `lib/collectors/youtube.js:25-52`, `lib/tool-schema.js:66-90`.
- **[Likely, medium] The old collector-interactive path is still public and diverges from the checkpoint pipeline.** `lib/web-research.js` still re-exports `shouldRunCollectorInteractive()` and `runCollectorInteractive()`, but `runWebResearch()` now branches to `runCommunityCheckpoint()` instead. That keeps `collector_*` legacy actions and two session/result contracts alive, which makes future drift likely and leaves callers with a path that no longer reflects the main flow. References: `lib/web-research.js:23-27`, `lib/research/pipeline.js:147-148`, `lib/retrieval/community.js:74-157`.
- **[Likely, medium] Checkpoint search bypasses the normal web pipeline’s ranking/dedup/fetch logic.** The community checkpoint returns raw collector results and next actions directly, while the normal pipeline reranks, dedupes, fetches pages, and synthesizes before returning. That means the same community-intent query can produce materially different quality depending on whether the caller supplied checkpoint inputs. References: `lib/retrieval/community.js:104-133`, `lib/research/pipeline.js:231-390`.

# Risks and open questions
- Should `sessionId` imply stored checkpoint state, including platforms, or should the API require callers to resend `platforms` every time?
- Do we want `rss` and `youtube` in the same `platforms` list as query-search collectors, or should they move to a URL-seeded/media-only flow?
- Is the legacy collector-interactive surface still needed by any external caller, or can it be removed instead of kept as compatibility drift?

# Recommended fixes
- Persist checkpoint platform selection in `research-session.js`, or teach `runWebResearch()` to reuse the session’s prior platform set on resume.
- Split URL-seeded collectors (`rss`, `youtube`) from query-search collectors, or make `runCommunitySearch()` reject them unless a valid seed URL is supplied.
- Remove or clearly deprecate `runCollectorInteractive()` / `shouldRunCollectorInteractive()` once no host depends on the legacy collector-only contract.

# Suggested tests
- Add a resume test that calls checkpoint search once, then resumes with only `sessionId` + `action`, and verifies the same community branch is used.
- Add contract tests proving `platforms: ["rss"]` and `platforms: ["youtube"]` fail fast or require a URL seed instead of trying to search a topic string.
- Add a regression test asserting the public checkpoint path and the legacy collector path do not diverge silently on the same inputs, or else document the difference explicitly.
