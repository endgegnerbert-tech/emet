# Scope
Audit of domain packs, overlay/source-policy composition, guardrails, authority/recency/version gates, and fail-open vs fail-closed behavior.

# Files inspected
- `/Users/einarjaeger/github/emet/lib/domains/index.js`
- `/Users/einarjaeger/github/emet/lib/domains/changelog.js`
- `/Users/einarjaeger/github/emet/lib/domains/legal.js`
- `/Users/einarjaeger/github/emet/lib/domains/vendor-status.js`
- `/Users/einarjaeger/github/emet/lib/domains/local-howto.js`
- `/Users/einarjaeger/github/emet/lib/domains/github.js`
- `/Users/einarjaeger/github/emet/lib/research/pipeline.js`
- `/Users/einarjaeger/github/emet/lib/research-guardrails.js`
- `/Users/einarjaeger/github/emet/lib/research-policy.js`
- `/Users/einarjaeger/github/emet/lib/research/ranking.js`
- `/Users/einarjaeger/github/emet/lib/research/search.js`
- `/Users/einarjaeger/github/emet/lib/research-flow.js`
- `/Users/einarjaeger/github/emet/lib/research-next-action-policy.js`
- `/Users/einarjaeger/github/emet/lib/research-intent.js`
- `/Users/einarjaeger/github/emet/test/domain-packs.test.js`
- `/Users/einarjaeger/github/emet/test/intent-router.test.js`
- `/Users/einarjaeger/github/emet/test/research-guardrails.test.js`
- `/Users/einarjaeger/github/emet/test/research-policy-domain.test.js`
- `/Users/einarjaeger/github/emet/test/research-next-action-policy.test.js`

# Findings
1. Confirmed: guardrails do not participate in domain selection, so high-risk routing can still downgrade to a weak family before policy enforcement kicks in. `runWebResearch()` computes guardrails, but `resolveQuestionDomain()` ignores them and always returns the heuristic/explicit domain path. `guardrailVetoesDomainDowngrade()` exists, but nothing calls it. That means the first routing decision is still fail-open for guardrail-sensitive inputs, and any later `requireAuthoritative` fixup happens after the domain pack and query-hint choice are already locked in. Files: `/Users/einarjaeger/github/emet/lib/research/pipeline.js:57-71`, `/Users/einarjaeger/github/emet/lib/research-guardrails.js:124-129`.
2. Confirmed: authoritative GitHub state pages can be upgraded back to authoritative by score, which undermines the explicit non-authoritative GitHub policy. `sourceAuthorityProfile()` deliberately marks GitHub issues/pulls/discussions as non-authoritative unless they are README/releases/blob pages, but `scoreSourceEntry()` later flips `authoritative` to true whenever the total score reaches 10. Because `classifySourceType()` collapses all GitHub repo paths into `github_repo`, issue/discussion pages can still satisfy authority gates if they score well enough. That is a policy bypass, not just a ranking quirk. Files: `/Users/einarjaeger/github/emet/lib/research-policy.js:201-207`, `/Users/einarjaeger/github/emet/lib/research/ranking.js:207-242`, `/Users/einarjaeger/github/emet/lib/research/heuristics.js:136-141`.
3. Likely issue: several “authoritative” domain packs are only soft hints, not fail-closed allowlists, because they mix concrete hosts with non-host keywords. `inferAllowedHosts()` only returns a strict host/path filter when every `allowedSources` entry parses as a host constraint; otherwise `filterBySourceOptions()` returns true and the pack behaves like a ranking hint. That affects packs such as `changelog`, `legal`, `vendor-status`, and `local-howto`, where entries like `release notes`, `gov`, `status`, or `official` disable strict host filtering. Those packs still request authority/recentness, but they do not actually close the source surface. Files: `/Users/einarjaeger/github/emet/lib/research/search.js:74-101`, `/Users/einarjaeger/github/emet/lib/domains/changelog.js:1-7`, `/Users/einarjaeger/github/emet/lib/domains/legal.js:1-7`, `/Users/einarjaeger/github/emet/lib/domains/vendor-status.js:1-7`, `/Users/einarjaeger/github/emet/lib/domains/local-howto.js:1-7`.

# Risks and open questions
- If the permissive source hints are intentional, then the main risk is documentation drift: these packs read like hard policy but execute like soft ranking.
- The GitHub authority behavior may be deliberate for README/blob pages, but the current implementation also lets issue/discussion pages cross the authority threshold.
- I did not find a runtime use of `guardrailVetoesDomainDowngrade()`, so if that helper is meant to be the enforcement point, it is currently dead policy.

# Recommended fixes
- Wire guardrails into domain selection, or call `guardrailVetoesDomainDowngrade()` from the routing path before finalizing the domain family.
- Split GitHub repo authority scoring from repository-page classification so issues/discussions cannot be promoted to authoritative by a numeric threshold alone.
- Separate “ranking hints” from “strict source filters” in the domain pack model; if a pack is supposed to be fail-closed, only concrete host/path entries should live in `allowedSources`.
- For high-risk packs, add explicit host/path allowlists instead of relying on mixed keyword hints.

# Suggested tests
- Add a routing test that a high-risk query cannot be downgraded to `web` when guardrails require authority/primary sources.
- Add a source-scoring test that GitHub issue/discussion URLs remain non-authoritative even with strong text or version-match signals.
- Add pack tests that verify fail-closed behavior for `changelog`, `legal`, `vendor-status`, and `local-howto` when the pack is supposed to be strict.
- Add a search-filter test that mixed `allowedSources` entries do not accidentally disable strict host filtering without an explicit opt-in.
