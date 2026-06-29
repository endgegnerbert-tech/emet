# Scope
Audit of ranking, version-sensitive behavior, sufficiency/conflict handling, synthesis, fallback synthesis, and output grounding quality.

# Files inspected
- `/Users/einarjaeger/github/emet/lib/research/ranking.js`
- `/Users/einarjaeger/github/emet/lib/research/heuristics.js`
- `/Users/einarjaeger/github/emet/lib/version-context.js`
- `/Users/einarjaeger/github/emet/lib/research/coverage.js`
- `/Users/einarjaeger/github/emet/lib/research/synthesis.js`
- `/Users/einarjaeger/github/emet/lib/research-output.js`
- `/Users/einarjaeger/github/emet/lib/research-next-action-policy.js`
- `/Users/einarjaeger/github/emet/lib/research/pipeline.js`
- `/Users/einarjaeger/github/emet/test/version-context.test.js`
- `/Users/einarjaeger/github/emet/test/research-improvements.test.js`
- `/Users/einarjaeger/github/emet/test/output-formats.test.js`
- `/Users/einarjaeger/github/emet/test/web-research.test.js`
- `/Users/einarjaeger/github/emet/test/source-scoring.test.js`

# Findings
1. **Confirmed: non-authoritative pages can be promoted to authoritative by score alone.**
   - `lib/research/ranking.js:191-242` starts with `sourceAuthorityProfile()` but then flips `authoritative` to true whenever `total >= 10`.
   - That means a generic blog or mirror can become "authoritative" just by matching version/freshness/domain signals. I verified this at runtime with a blog URL that scored `15` and was marked `authoritative: true`.
   - This is high risk because `evaluateSufficiency()` and policy decisions trust `authoritativeSourcesFound`, so weak pages can prematurely satisfy sufficiency gates.

2. **Confirmed: conflict detection misses same-domain contradictions.**
   - `lib/research/coverage.js:54-85` returns no conflict when `domains.size < 2`.
   - I verified that two contradictory pages on the same host return `detected: false`, even when one says supported and the other says not supported.
   - This is risky for docs-heavy versioned queries, where the contradiction often lives across two pages on the same site.

3. **Confirmed: fallback synthesis ignores the best-ranked evidence when composing the answer.**
   - `lib/research/synthesis.js:20-54` builds a ranked `sources` array, but `answer` and `bullets` are rendered from `pages.slice(0, 5)` in original input order.
   - The fallback path therefore can quote weaker or older pages while the better-scored pages are only preserved in metadata.
   - This degrades grounding quality exactly when the model path fails and the deterministic fallback matters most.

4. **Confirmed: claim-level conflict/sufficiency logic is not wired into the runtime pipeline.**
   - `lib/research/coverage.js:13-20,200-214` has `detectClaimConflicts()` and claim-based gap handling, but `lib/research/pipeline.js:371-376` calls `evaluateSufficiency()` without a `claims` array.
   - In practice, runtime sufficiency depends on source heuristics alone; synthesized claims are only checked later via `factCheckAnswer()`, after the follow-up decision has already been made.
   - That leaves a gap between "answer quality" and "follow-up steering" for conflicting or unsupported claims.

# Risks and open questions
- `lib/research-next-action-policy.js` already treats `conflictSummary` and `missingAspects` as steering inputs, so any weakness in upstream conflict detection has downstream impact.
- `lib/research/heuristics.js:552-574` keeps markdown output grounded, but JSON/table formatting is intentionally minimal; it may be worth checking whether downstream consumers need citations/conflict metadata in those modes too.

# Recommended fixes
- Remove or sharply limit the `total >= 10` fallback in `scoreSourceEntry()`, or gate it behind stronger authority evidence.
- Let `detectConflictSignals()` compare same-domain pages when their text clearly disagrees.
- In fallback synthesis, render the answer from ranked sources, not the original page order.
- Thread synthesized claims into `evaluateSufficiency()` before policy follow-up, or delete the claim-based gap branch if it is not meant to steer runtime behavior.

# Suggested tests
- A ranking test that proves a high-scoring non-authoritative page does not become authoritative just from score.
- A conflict test for two contradictory pages on the same domain.
- A fallback synthesis test that asserts the answer uses the top-ranked pages, not the first input pages.
- A pipeline/sufficiency test that confirms claim conflicts influence follow-up decisions, or a regression test that proves the claim path is intentionally unused.
