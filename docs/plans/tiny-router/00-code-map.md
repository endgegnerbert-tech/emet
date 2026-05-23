# 00 — Code Map and Insertion Points

This plan is based on the current code paths in `lib/`.

## Former local model path

Files removed during Phase 6:

- `lib/local-slm.js`
- `lib/local-slm-setup.js`
- `test/local-slm.test.js`

Result:

- The older BitNet/JSON prompt path is gone.
- Tiny-router is the only local model path now.

## Domain routing point

File:

- `lib/web-research.js`

Function:

```js
async function resolveQuestionDomain(query, signal)
```

Current flow:

```text
tinyRouter.classifyDomain(query) high confidence
  || classifyQuestionDomain(query)
```

Best model:

- Model2Vec + linear/logistic classifier.
- Not TRM.

## Search planning point

Files:

- `lib/web-research.js` → `buildQueries()`
- `lib/planner.js`
- `lib/research.js` → `buildFastQueries()`, `buildDeepQueries()`

Current behavior:

- Heuristic query templates.
- Optional local SLM JSON planner.

Possible ML use:

- Do not use TRM for free-text query generation.
- If ML is used, classify an action like `need_official`, `need_release_notes`, `need_conflict_resolution`, then keep deterministic templates.

## Source ranking / page scoring

Files/functions:

- `lib/research.js` → `scoreSearchResult()`
- `lib/research.js` → `scoreFetchedPage()`
- `lib/research.js` → `rankSearchResults()`
- `lib/research.js` → `rankFetchedPages()`

Current behavior:

- Term overlap + source-type boosts + quality penalties.

Best model:

- Not first TRM target.
- Possible later learning-to-rank with Model2Vec features.

## Chunk selection

File/function:

- `lib/research.js` → `selectRelevantChunks(text, query, limit)`

Current behavior:

- Term-overlap sorting.

TRM opportunity:

- Query-aspect × chunk coverage matrix.
- TRM can decide a diverse set of chunks that covers all aspects instead of top-k overlap.

Risk:

- Requires labels or weak labels from final citations.
- Later than conflict/sufficiency.

## Conflict detection

File/function:

- `lib/research.js` → `detectConflictSignals(pages)`

Current behavior:

- Regex positive/negative signals across domains.
- This is exactly where false positives/false negatives are likely.

TRM opportunity:

- Strong target, but only with structured input and manual gold labels.
- Do not train from current `conflictDetected` as truth.

## Sufficiency / coverage

File/function:

- `lib/research.js` → `evaluateSufficiency(input)`

Current behavior:

- Source count + authoritative count + domain count + conflict penalty.

TRM opportunity:

- Strong target if reformulated as coverage reasoning:
  - query aspects × sources,
  - authority,
  - freshness,
  - conflict state,
  - unresolved aspect count.

Safety rule:

- V1 TRM may say `needs_more_research`.
- V1 TRM must not aggressively skip fetches until gold eval proves low false-sufficient rate.

## Follow-up selection

Files/functions:

- `lib/research.js` → `buildFollowUpQuery()`
- `lib/research-policy.js` → `buildAuthorityFollowUpQueries()`
- `lib/research-policy.js` → `buildConflictFollowUpQueries()`
- `lib/web-research.js` → `planSubqueries()`

TRM opportunity:

- Not free text.
- Predict discrete follow-up action:
  - `need_authority`
  - `need_conflict_resolution`
  - `need_recency`
  - `need_version_context`
  - `need_primary_source`
- Deterministic templates still generate the actual query.

## Fact check / citation verification

Files/functions:

- `lib/research.js` → `factCheckAnswer(answer, sources)`
- `lib/research.js` → final `unverifiedRatio` gate in `runWebResearch()`

Current behavior:

- Term overlap between answer sentences and source text.

TRM opportunity:

- Claim × source entailment/coverage grid.
- Strong structured reasoning candidate after conflict/sufficiency.

## Recommended insertion order

1. Add `lib/tiny-router.js` for domain only.
2. Add offline dataset scripts.
3. Add structured feature builder for conflict/sufficiency, no runtime use yet.
4. Add TRM experiment behind offline eval only.
5. Integrate TRM only as conservative warning/needs-more-research signal.
