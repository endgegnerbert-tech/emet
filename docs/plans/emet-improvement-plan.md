# emet improvement plan (revised)

## Goal
Improve research quality, reduce wasted turns, and make failures measurable by tightening follow-up planning, authority policy, weak-page handling, and eval coverage.

## Why this revision exists
The first plan was directionally right but underspecified in four places:
- blocked/weak-page handling had no concrete scoring model
- authority rules had no domain-specific definition
- eval upgrades had no deterministic measurement strategy
- there were no rollback criteria or turn/latency budgets

This revision fixes those gaps and anchors the work to current repo reality:
- `1.1.0` already added domain packs and authority biasing
- `1.1.1` already added Scrapling fallback and anti-bot escalation
- current logs still show real failures despite those additions

## Scope
Only the following areas:
- `lib/planner.js`
- `lib/research.js`
- `lib/web-research.js`
- `lib/page-fetch-adapter.js`
- `lib/research-intent.js`
- `lib/eval/runner.js`
- targeted tests/evals under `test/` and `eval/cases/`
- optional log cleanup in `lib/local-logger.js` and `index.js`

## Evidence from changelog and current analytics

### Existing capabilities already present
- `1.1.0`: domain packs, authority biasing, `requireAuthoritative`, output formatting
- `1.1.1`: Scrapling-backed fallback, blocked/thin/JS-heavy escalation, fast-path-first fetch flow

### Real failures seen in current logs
1. **Dead-end follow-up loop**
   - the query `quantum error correction survey 2025 ... authoritative review` repeated a conflict-resolution question-style follow-up
   - it produced **0 search results three times in a row**
   - the run still synthesized a result after wasting turns

2. **Blocked placeholder contamination**
   - `ResearchGate - Temporarily Unavailable` was cached with `textLength: 646`
   - it later appeared in synthesis as a final source
   - this means blocked/placeholder pages are currently treated as usable evidence

3. **Document/PDF fetch gap**
   - `oaqlabs.com/...pdf` returned `unsupported_content_type: application/pdf`
   - the engine surfaced the result in search, but could not read it
   - this is a real recall gap for paper-heavy and technical queries

4. **Authority heuristic miss**
   - `research.ibm.com/topics/quantum-error-correction` fetched successfully
   - it was still typed as `other`
   - vendor research pages like `research.ibm.com` and `research.google/blog` are not being recognized strongly enough as authoritative or semi-authoritative

5. **High-cost insufficient run**
   - one deep run ended with **3 turns**, **8 pages**, **71,879ms total fetch time**, `confidenceScore: 0.73`, and still `sufficient: false`
   - this confirms that the issue is not only low page count; it is query shape, source quality, and authority handling

## Design constraints
- Do **not** replace the current Scrapling fallback stack; build on top of it.
- Do **not** introduce new search providers in this pass.
- Keep phase 1 evals deterministic; no LLM-as-judge dependency required.
- Every new rule must be testable with fixtures or synthetic inputs.

## Execution plan

### 0. Freeze policy and measurement before code changes
Define the rules that later steps will implement, and store them as repo-visible policy rather than implicit code behavior.

Outputs:
1. weak/blocked-page criteria
2. domain authority matrix
3. turn/latency budget targets
4. rollback criteria
5. a committed policy document and matching code constants/config

Checkpoint:
- The policy is explicit enough that tests can be written against it without guessing.
- A future contributor can find the rules without reverse-engineering the implementation.

### 1. Lock in failing cases first
Create regression fixtures directly from the failures already seen in analytics.

Files:
- `test/`
- `eval/cases/`
- `lib/eval/runner.js`

Fixtures to add:
1. follow-up dead-end fixture:
   - initial broad query
   - zero-result follow-up loop
   - expected behavior: no repeated question-style follow-up
2. blocked placeholder fixture:
   - `Access denied` / `Cloudflare` / `Temporarily Unavailable`
   - expected behavior: excluded or heavily penalized
3. PDF gap fixture:
   - search hit that is `application/pdf`
   - expected behavior: routed to explicit fallback path or marked as unreadable without polluting final evidence
4. authority miss fixture:
   - vendor research page such as `research.ibm.com` or `research.google`
   - expected behavior: classified above generic `other`
5. high-cost insufficient fixture:
   - many pages, weak authority, conflict present
   - expected behavior: remains insufficient without wasting repeated empty turns

Checkpoint:
- Tests reproduce the current bad behavior before any logic changes.

### 2. Replace dead-end follow-up planning
Make follow-ups search-oriented, state-aware, and non-repetitive.

Files:
- `lib/research.js`
- `lib/planner.js`
- `lib/web-research.js`

Changes:
1. Rework `buildFollowUpQuery()` to emit keyword-style queries, not question sentences.
2. Generate follow-ups by gap type:
   - missing authority
   - conflict resolution
   - freshness/status
   - document/paper lookup
3. Preserve the core entity/topic tokens from the root query.
4. Add a guard against repeated empty follow-ups:
   - if a follow-up query returns zero results once, reformulate once
   - if the reformulation also returns zero, stop looping and surface the gap
5. Prefer authority-seeking rewrites over generic `official docs` suffixes when the domain suggests papers, vendor research, changelogs, or package registries.

Deterministic test rules:
- no question mark
- no `Which authoritative source...` phrasing
- token overlap with root query above a minimum threshold
- max query length cap
- no exact repeated zero-result follow-up query in consecutive turns

Checkpoint:
- Follow-up queries are compact, search-ready, and cannot get stuck in the observed dead-end loop.

### 3. Define and implement a domain authority matrix
Make authority explicit instead of heuristic-only.

Files:
- `lib/research.js`
- `lib/research-intent.js`
- `lib/web-research.js`

Policy:
1. `security`
   - authoritative: vendor advisories, NVD/NIST, CVE records, GitHub Security Advisories, official project security pages
   - secondary: security blogs, forums, mirrors
2. `vendor-status`
   - authoritative: official status pages, incident posts, vendor trust centers
   - secondary: social posts, aggregators
3. `package-registry`
   - authoritative: npm/PyPI/Cargo package pages, official docs, maintainer repo, release notes/changelogs
   - secondary: blog posts, issue mirrors
4. `github`
   - authoritative: canonical repo, README/docs, releases, maintainer-authored discussions
   - secondary: issues/PRs unless the question is explicitly about issue state
5. `papers`
   - authoritative: publisher pages, DOI, arXiv, Semantic Scholar, institutional pages
   - secondary by default: summaries, ResearchGate mirrors, blogs
   - important exception: ResearchGate handling must be page-level, not hostname-only; access walls and placeholders are never authoritative, but a fully readable mirrored paper page may remain usable as secondary evidence
6. `web` default
   - authoritative: official docs, vendor research portals, official references
   - secondary: blogs, generic news, forums

Concrete analytics-driven additions:
- vendor research hosts such as `research.ibm.com` and `research.google` must rank above generic blogs/news for relevant technical topics
- placeholder hosts/pages like ResearchGate access walls must never count as authoritative evidence

Checkpoint:
- Authority is defined per domain and validated with fixtures, not inferred ad hoc.

### 4. Add a concrete weak/blocked-page scoring model
Tune the existing fallback stack instead of replacing it.

Files:
- `lib/page-fetch-adapter.js`
- `lib/web-research.js`
- `lib/research.js`

Scoring model to implement:

#### Numeric thresholds
- `blocked`: HTTP `403`/`429`, or anti-bot/placeholder markers with extracted plain text `< 1200` chars
- `weak_text`: extracted plain text `< 400` chars
- `thin_text`: extracted plain text `400-1199` chars
- `query_overlap_low`: fewer than `2` meaningful query-term matches in title + first chunk
- a page is not demoted on text length alone; at least `2` independent negative signals are required unless it is hard-blocked

#### Hard blocked signals
Any of these mark the page as `blocked`:
- HTTP `403`, `429`, or repeated anti-bot response patterns
- titles/body markers like `Cloudflare`, `Access denied`, `Verify you are human`, `Security check`, `Temporarily Unavailable`
- anti-bot/placeholder markers combined with extracted plain text `< 1200` chars

#### Weak-page signals
These add penalties and may exclude the page from final synthesis:
- extracted plain text below threshold
- boilerplate-dominant content
- placeholder landing pages
- unsupported content types without successful fallback
- duplicate content hashes
- low query overlap in title + first content chunk
- low domain/authority score combined with low overlap or thin text

#### Cache policy
- blocked/placeholder pages must **not** be cached as normal successful pages
- cache them separately as weak/blocked outcomes with short TTL if needed
- unsupported PDFs should not silently disappear into the same success path as HTML pages

#### Synthesis policy
- blocked pages never appear as final sources if any clean alternative exists
- weak pages may remain only as last-resort evidence and must carry reduced score

Checkpoint:
- `Access denied`, `Cloudflare`, and similar placeholders no longer appear as normal sources in final synthesis.

### 5. Tighten sufficiency with explicit budgets
Replace the single generic notion of “good enough” with mode/domain-aware rules.

Files:
- `lib/research.js`
- `lib/web-research.js`

Changes:
1. Replace the single sufficiency threshold with mode/domain-aware thresholds.
2. Require authoritative evidence for high-risk domains before `sufficient: true` is possible.
3. Add budget guards:
   - max consecutive zero-result follow-up rounds: `1`
   - stop re-asking the same unresolved conflict query
   - if authority is required and absent after the first successful fetch round, pivot the next query set toward authority-specific sources
4. Separate these cases clearly:
   - enough pages but low authority
   - enough authority but unresolved conflict
   - unreadable/blocked retrieval despite promising search hits

Metrics to track:
- turns used
- consecutive empty follow-up rounds
- blocked-page rate in fetched pages
- blocked-page rate in final sources
- authoritative source count
- total fetch time per run

Checkpoint:
- Runs fail fast on dead-end follow-ups and do not waste turns repeating known-empty queries.

### 6. Upgrade evals with deterministic behavior scoring
Do not rely on vague “quality” claims.

Files:
- `test/`
- `eval/cases/`
- `lib/eval/runner.js`

Phase 1 scoring must be rule-based:
1. follow-up quality score
   - no question phrasing
   - enough root-query token retention
   - includes authority hints when needed
   - no repeated empty follow-up
   - note: token-overlap is only a lower-bound heuristic for semantic continuity, not proof of good follow-up quality
2. authority score
   - expected authoritative domains/types appear for the fixture
3. weak-page contamination score
   - blocked placeholders absent from final source set when alternatives exist
4. budget score
   - no more than one consecutive zero-result follow-up
   - run metadata stays within fixture budget

Only after phase 1 is stable may an optional LLM-judge layer be considered.

Checkpoint:
- Evals fail on the real observed regressions, not only on missing files or domain labels.

### 7. Slim down analytics/logging
Preserve useful diagnosis without bloating logs.

Files:
- `lib/local-logger.js`
- `index.js`

Changes:
1. Stop logging the full `systemPrompt` on every agent start.
2. Log compact summaries or hashes instead of full prompt bodies where possible.
3. Keep numeric signals needed for regression checks:
   - turns
   - pages fetched
   - blocked/weak counts
   - authority counts
   - sufficiency outcome
   - cache hit source
   - fetch errors
   - total fetch time

Checkpoint:
- Logs stay useful for measurement and postmortems but stop drowning the signal.

## Order of implementation
1. freeze policy + metrics
2. failing fixtures/tests
3. follow-up planner rewrite
4. authority matrix
5. weak/blocked scoring + cache policy
6. sufficiency budgets
7. eval runner upgrade
8. log cleanup

## Rollback criteria
Rollback the last logic change if any of these happen:
- deterministic eval pass rate drops
- no-source failure rate increases on sampled analytics re-runs
- authoritative classification regresses on fixture domains
- blocked placeholders reappear in final sources
- turn count or total fetch time increases on the dead-end fixtures without quality gain

## Acceptance criteria
- Follow-up queries are search-ready and no longer phrased as meta questions.
- Repeated zero-result follow-up loops are eliminated in regression fixtures.
- High-risk domains cannot return `sufficient: true` without domain-appropriate authoritative evidence.
- Vendor research hosts are classified above generic `other` for relevant queries.
- Blocked placeholders and access walls do not appear as normal final sources when clean alternatives exist.
- Unsupported PDFs are handled explicitly instead of silently degrading retrieval quality.
- Evals measure behavior with deterministic rules, not just file presence.
- Logs preserve key metrics while shrinking in size.

## Out of scope
- new search providers
- UI changes
- full document/PDF parser build-out beyond targeted fallback handling
- complete paper/PDF ingestion for all publisher formats; this remains explicit technical debt and may still limit `papers` recall in some cases
- speculative ranking rewrites outside the files above
