# Scope
Cross-report dedupe and ranking for the 2026-06-25 audit. This matrix consolidates overlapping findings from workers 01-11 and orders them by severity, blast radius, and repair cost.

# Files inspected
- `docs/fixes/2026-06-25-full-audit-scope.md`
- `docs/fixes/audit/2026-06-25/01-public-contract-and-release-surface.md`
- `docs/fixes/audit/2026-06-25/02-architecture-and-boundaries.md`
- `docs/fixes/audit/2026-06-25/03-pipeline-and-query-ingress.md`
- `docs/fixes/audit/2026-06-25/04-domain-routing-and-policy.md`
- `docs/fixes/audit/2026-06-25/05-search-fetch-and-source-controls.md`
- `docs/fixes/audit/2026-06-25/06-ranking-version-sufficiency-and-synthesis.md`
- `docs/fixes/audit/2026-06-25/07-cache-memory-and-trace-safety.md`
- `docs/fixes/audit/2026-06-25/08-community-collectors-and-session-flow.md`
- `docs/fixes/audit/2026-06-25/09-cli-mcp-pi-host-integrations.md`
- `docs/fixes/audit/2026-06-25/10-tests-eval-docs-and-dead-code.md`
- `docs/fixes/audit/2026-06-25/11-dependency-security-performance-product.md`

# Findings
| Priority | Cluster | Severity | Blast radius | Repair cost | Source reports | Consolidated verdict |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | Source controls, authority gates, and fetch-time policy enforcement | Critical | Very high | Medium | 04, 05, 06, 11 | Confirmed. The repo has multiple ways to bypass or weaken source policy: strict allowlists are not enforced at the fetch boundary, academic results bypass filtering, host/path matching is broader than advertised, and authority can be regained by score alone. These are the most user-visible safety and correctness risks because they affect normal web research, explicit fetches, and sufficiency decisions. |
| P2 | Cache contamination and stale-answer reuse | High | High | Medium | 03, 07 | Confirmed. Query hints and policy-sensitive fields are dropped from config/cache identity, topic fallback can replay semantically different answers, and persistent cache scope is effectively global. This creates stale or looser-answer reuse across stricter follow-up turns and across workspaces. |
| P3 | Legacy compatibility surfaces and runtime boundary drift | High | Medium-high | Medium-low | 02, 08, 09, 10 | Confirmed/likely mix. The old collector/session model is still leaking through dynamic imports, public re-exports, and session state shape; community checkpoint and CLI/MCP behaviors also diverge from the main flow. The main risk is not one bug but continued drift that makes future fixes hard to reason about and easy to regress. |
| P4 | Ranking, conflict handling, and fallback synthesis quality | Medium-high | Medium | Medium | 06, 10 | Confirmed. Non-authoritative pages can be promoted by score, same-domain contradictions are missed, and fallback synthesis uses input order instead of rank order. This degrades answer quality and can prematurely satisfy follow-up logic even when the retrieval set is weak. |
| P5 | Trace/telemetry and payload size overhead | Medium | Medium | Low-medium | 07, 11, 09 | Confirmed/likely mix. Logs include too much internal state, telemetry is duplicated across modules, and `web_fetch` can emit very large payloads. These are lower priority than correctness bugs, but they increase privacy risk, runtime cost, and support noise. |

1. **P1: source controls and authority gates are porous.** This is the top issue because it combines several overlapping findings into one policy failure class. The most important repair is to make source constraints fail closed before network I/O or ranking, then remove the post-hoc authority promotion path that can turn weak sources into authoritative ones. The overlap here is intentional: workers 04, 05, 06, and 11 all described different symptoms of the same enforcement gap.
2. **P2: cache identity is too broad for the product’s policy model.** Worker 03 found policy-sensitive query config being dropped; worker 07 found the persistent and topic caches are wider than they appear. Together, they mean a stricter query can inherit a looser answer. This is high blast radius because it affects both correctness and user trust, but it is still a bounded repair: tighten keys and scope, then stop topic fallback where it is unsafe.
3. **P3: compatibility drift is now a maintenance risk, not just a cleanup item.** The collector-era surfaces, dynamic facade imports, session shape mismatches, and CLI/MCP flag routing all point to one conclusion: legacy paths remain active enough to confuse behavior, but not disciplined enough to be relied on. This is a moderate-cost cleanup because the work is mostly deletion or narrowing, not deep redesign.
4. **P4: ranking and fallback synthesis need to be made more faithful to the chosen evidence.** This cluster is narrower than P1/P2, but it still matters because weak ranking undermines the result quality even when policy is working. It is a good follow-on after the policy/cache fixes because its repair cost is modest and the user-visible gains are immediate.
5. **P5: observability and payload hygiene are worth fixing, but they are not the first-order failure mode.** The logging and telemetry issues are real, especially for privacy and supportability, but they should come after the correctness and policy gates above unless there is a customer-facing incident tied to them.

# Risks and open questions
- Which legacy surfaces are still intentionally supported? The audit reports disagree only in emphasis, not substance: collector-era compatibility, session resume shape, and CLI/MCP fallback may still be needed, but they are now the main source of drift.
- Should strict source policies ever allow post-ranking promotion? If yes, the policy needs a formal exception model; if not, the ranking code should stop overriding authority labels.
- Is topic fallback meant to be a core feature or a best-effort optimization? That answer determines whether cache tightening or deletion is the right fix.
- Do we want to treat telemetry and trace redaction as a product requirement or just a support hardening task?

# Recommended fixes
- Enforce source allowlists and host/path constraints before any fetch or academic-provider merge, and keep authority labels from being upgraded by score alone.
- Tighten cache keys to include policy-affecting inputs, and disable topic fallback when query shape is versioned, URL-specific, or otherwise policy-sensitive.
- Remove or sharply narrow collector-era compatibility exports, then align CLI/MCP/session resume behavior with the main pipeline instead of preserving parallel flows.
- Make fallback synthesis choose ranked evidence, not original input order, and wire conflict signals into follow-up decisions if they are meant to steer runtime behavior.
- Redact default logs, deduplicate telemetry, and cap large fetch outputs before they reach clients.

# Suggested tests
- A fail-closed fetch test that proves disallowed hosts never reach the network, plus a search test that verifies academic providers are filtered under strict source policy.
- A cache regression suite that checks policy-sensitive config changes alter cache identity and that topic fallback is skipped for versioned or URL-specific queries.
- A boundary test that rejects dynamic imports from the facade/adapter loop, plus a session resume test that preserves checkpoint platforms without requiring the caller to resend them.
- A ranking/fallback test that ensures top-ranked evidence drives synthesis and that high-scoring non-authoritative pages do not become authoritative automatically.
- A logging/telemetry test that asserts default events do not leak full config, stack, or duplicate analytics setup, and a payload-size test for `web_fetch`.
