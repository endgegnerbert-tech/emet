import test from "node:test";
import assert from "node:assert/strict";

import {
  applyResearchPolicyControls,
  buildPolicyFollowUpQuery,
  buildResearchPolicyState,
  decideResearchPolicyAction,
  summarizeResearchPolicyDecision,
} from "../lib/research-next-action-policy.js";

test("research policy resolves conflicts before stopping", () => {
  const decision = decideResearchPolicyAction({
    query: "Node 22 support status",
    config: { mode: "deep", domainFamily: "developer-docs" },
    evidenceState: {
      sources: [
        { url: "https://nodejs.org/docs", host: "nodejs.org", source_type: "official_doc", authoritative: true, quality_score: 1 },
        { url: "https://example.com/blog", host: "example.com", source_type: "blog", quality_score: 0.8 },
      ],
    },
    sufficiency: { sufficient: true, confidenceScore: 0.92 },
    conflict: { finalDetected: true },
  });

  assert.equal(decision.action, "resolve_conflict");
  assert.deepEqual(decision.controls.sourcePolicyFlags, ["official-only"]);
});

test("research policy fetches version context for version-sensitive gaps", () => {
  const decision = decideResearchPolicyAction({
    query: "GitHub REST apiVersion 2022-11-28 breaking changes",
    config: { mode: "code", domainFamily: "developer-docs", sourcePolicyFlags: ["version-sensitive"] },
    evidenceState: { sources: [{ url: "https://docs.github.com", host: "docs.github.com", authoritative: true, source_type: "official_doc", version_match_score: 0 }] },
    sufficiency: { sufficient: false, confidenceScore: 0.65 },
  });

  assert.equal(decision.action, "fetch_version_context");
  assert.ok(decision.controls.overlays.includes("changelog"));
});

test("research policy stops only after evidence passes policy requirements", () => {
  const decision = decideResearchPolicyAction({
    query: "React useEffect docs",
    config: { mode: "fast", domainFamily: "developer-docs" },
    evidenceState: { sources: [{ url: "https://react.dev/reference/react/useEffect", host: "react.dev", authoritative: true, source_type: "official_doc", quality_score: 1 }] },
    sufficiency: { sufficient: true, confidenceScore: 0.86 },
  });

  assert.equal(decision.action, "stop");
});

test("research policy applies composable retrieval controls", () => {
  const config = applyResearchPolicyControls({ mode: "fast", domainFamily: "web", overlays: [] }, {
    action: "fetch_recent",
    controls: { sourcePolicyFlags: ["recency-required"], preferRecent: true, overlays: ["news-current-events"] },
  });

  assert.equal(config.preferRecent, true);
  assert.deepEqual(config.sourcePolicy.flags, ["recency-required"]);
  assert.deepEqual(config.sourcePolicy.overlays, ["news-current-events"]);
  assert.equal(config.requireAuthoritative, false);
});

test("research policy state exposes phase 8 evidence features", () => {
  const state = buildResearchPolicyState({
    query: "latest CVE advisory",
    config: { mode: "fast", domainFamily: "regulated", sourcePolicyFlags: ["official-only"], preferRecent: true },
    evidenceState: {
      sources: [
        { url: "https://nvd.nist.gov/vuln/detail/CVE-2026-1", host: "nvd.nist.gov", authoritative: true, source_type: "official_doc", freshness: "today", quality_score: 0.9 },
      ],
    },
    sufficiency: { sufficient: false, confidenceScore: 0.7 },
  });

  assert.equal(state.family, "regulated");
  assert.equal(state.highRisk, true);
  assert.equal(state.sourceCount, 1);
  assert.equal(state.authorityCount, 1);
  assert.equal(state.recentSourceCount, 1);
  assert.equal(state.distinctDomainCount, 1);
  assert.equal(state.recencyRequired, true);
});

test("research policy follow-up query maps composable actions to evidence gaps", () => {
  assert.match(buildPolicyFollowUpQuery("React 19 migration", { action: "fetch_version_context" }), /release notes|changelog|official/i);
});

test("research policy trace summary keeps only auditable policy fields", () => {
  const summary = summarizeResearchPolicyDecision({
    action: "fetch_more",
    reason: "test",
    confidence: 0.7,
    controls: {},
    state: { family: "web", sourceCount: 1, authorityCount: 0, query: "not serialized" },
  });

  assert.equal(summary.action, "fetch_more");
  assert.equal(summary.state.family, "web");
  assert.equal(summary.state.query, undefined);
});
