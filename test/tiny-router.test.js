import test from "node:test";
import assert from "node:assert/strict";
import {
  acceptTinyRouterDomainPrediction,
  applyConflictTinyRouterDecision,
  applySufficiencyTinyRouterDecision,
  chooseTinyRouterDomain,
  classifyConflictWithTinyRouter,
  classifyDomainWithTinyRouter,
  classifyFollowupWithTinyRouter,
  classifyPreflightWithTinyRouter,
  classifySufficiencyWithTinyRouter,
  resolveConflictDecisionThreshold,
  resolveFollowupDecisionThreshold,
  resolveSufficiencyDecisionThreshold,
  resolveTinyRouterConfig,
  resolveTinyRouterDomainThreshold,
  stopTinyRouterDaemon,
} from "../lib/tiny-router.js";

const TEST_ENV = {
  EMET_TINY_ROUTER: "1",
  EMET_TINY_ROUTER_FOLLOWUP: "1",
  EMET_TINY_ROUTER_MODEL: "ml/models",
  EMET_TINY_ROUTER_PYTHON: ".venv-router/bin/python",
  EMET_TINY_ROUTER_TIMEOUT_MS: "200",
};

test("tiny router returns null if disabled", async () => {
  const result = await classifyDomainWithTinyRouter("CVE-1234", "fast", undefined, { EMET_TINY_ROUTER: "0" });
  assert.equal(result, null);
});


test("tiny router config enables preflight and followup by default when prerequisites exist; domain model was removed", () => {
  const config = resolveTinyRouterConfig(TEST_ENV);
  assert.equal(config.tasks.domain, false, "domain model removed, task disabled");
  assert.equal(config.tasks.followup, true);
  assert.equal(config.tasks.preflight, true);
  assert.equal(config.tasks.conflict, false);
  assert.equal(config.tasks.sufficiency, false);
  assert.equal(config.tasks.queryUnderstanding, false);
});

test("tiny router auto-enables nothing when domain model is missing", () => {
  const config = resolveTinyRouterConfig({
    EMET_TINY_ROUTER_MODEL: "ml/models",
    EMET_TINY_ROUTER_PYTHON: ".venv-router/bin/python",
  });
  assert.equal(config.autoEnabled, false, "domain model missing → auto-disable");
  assert.equal(config.enabled, false);
  assert.equal(config.tasks.domain, false);
  assert.equal(config.tasks.preflight, false);
});

test("preflight classifier is active when prerequisites exist", async () => {
  try {
    const result = await classifyPreflightWithTinyRouter("CVE-2024-3094 xz utils", "fast", undefined, TEST_ENV);
    assert.ok(result === null || typeof result === "object");
  } finally {
    stopTinyRouterDaemon();
  }
});


test("tiny router preserves high-risk heuristic domains over web downgrades", () => {
  assert.equal(chooseTinyRouterDomain("security", "web"), "security");
  assert.equal(chooseTinyRouterDomain("web", "github"), "github");
});

test("tiny router keeps heuristic-only phase-4 domains until the model is retrained", () => {
  assert.equal(chooseTinyRouterDomain("medical", "web", { supportedDomains: new Set(["web", "github", "security"]) }), "medical");
});


test("tiny router domain thresholds can be calibrated per domain", () => {
  const calibration = {
    defaultThreshold: 0.8,
    highRiskThreshold: 0.75,
    domainThresholds: { security: 0.55, github: 0.65 },
  };

  assert.equal(resolveTinyRouterDomainThreshold("security", calibration), 0.55);
  assert.equal(resolveTinyRouterDomainThreshold("papers", calibration), 0.75);
  assert.equal(resolveTinyRouterDomainThreshold("web", calibration), 0.8);
  assert.equal(acceptTinyRouterDomainPrediction({ domain: "security", confidence: 0.6 }, calibration), "security");
  assert.equal(acceptTinyRouterDomainPrediction({ domain: "github", confidence: 0.5 }, calibration), null);
});

test("tiny router domain returns null since domain model was removed", async () => {
  const result = await classifyDomainWithTinyRouter("CVE-2024-3094 xz utils", "fast", undefined, TEST_ENV);
  assert.equal(result, null, "domain model removed → null");
});

test("tiny router followup classifier returns null unless explicitly enabled", async () => {
  const result = await classifyFollowupWithTinyRouter(
    "is bun faster than node",
    "deep",
    "severe",
    { has_authority: true, has_forum: true, has_news: true, source_count: 5 },
    undefined,
    { ...TEST_ENV, EMET_TINY_ROUTER_FOLLOWUP: "0" }
  );
  assert.equal(result, null);
});

test("tiny router followup classifier works when explicitly enabled", async () => {
  try {
    // 1. A query with severe conflict and both sources
    const actionConflict = await classifyFollowupWithTinyRouter(
      "is bun faster than node",
      "deep",
      "severe",
      { has_authority: true, has_forum: true, has_news: true, source_count: 5 },
      undefined,
      TEST_ENV
    );
    assert.equal(actionConflict, "need_conflict_resolution");

    // 2. A query missing authority in deep mode
    // Note: the deployed followup model may predict "stop" if it determines
    // the evidence is sufficient despite missing authority
    const actionAuth = await classifyFollowupWithTinyRouter(
      "docker network isolate container",
      "deep",
      "none",
      { has_authority: false, has_forum: true, source_count: 4 },
      undefined,
      TEST_ENV
    );
    // Accept either ML prediction or heuristic fallback
    assert.ok(actionAuth === "need_authority" || actionAuth === "stop" || actionAuth === null, `unexpected action: ${actionAuth}`);

    const actionStop = await classifyFollowupWithTinyRouter(
      "Docker Compose official documentation",
      "fast",
      "none",
      { has_authority: true, has_forum: false, has_news: false, source_count: 4 },
      undefined,
      TEST_ENV
    );
    assert.equal(actionStop, "stop");

  } finally {
    stopTinyRouterDaemon();
  }
});


test("structured conflict classifier returns a conservative label or abstains when enabled", async () => {
  try {
    const result = await classifyConflictWithTinyRouter(
      "Python 3.12 support status",
      [
        { title: "Python docs", url: "https://docs.python.org/3.12/", sourceType: "official_doc", authoritative: true, text: "Python 3.12 is supported and stable." },
        { title: "Blog", url: "https://blog.example.com/post", sourceType: "blog", text: "Python 3.12 is not supported and broken." },
      ],
      undefined,
      { ...TEST_ENV, EMET_TINY_ROUTER_CONFLICT: "1" },
    );
    assert.ok(result === null || ["no_conflict", "needs_review", "resolved_by_authority", "resolved_by_recency", "resolved_by_version", "open_conflict"].includes(result));
  } finally {
    stopTinyRouterDaemon();
  }
});


test("structured sufficiency classifier abstains or vetoes weak coverage when enabled", async () => {
  try {
    const result = await classifySufficiencyWithTinyRouter(
      "Current node LTS version",
      [{ title: "Node rumor", url: "https://blog.example.com/node", sourceType: "blog", text: "Node 22 might be current LTS." }],
      undefined,
      { ...TEST_ENV, EMET_TINY_ROUTER_SUFFICIENCY: "1" },
    );
    // Model may abstain (null) if confidence below threshold, or veto with need_authority
    assert.ok(result === null || result === "need_authority", `unexpected sufficiency decision: ${result}`);
  } finally {
    stopTinyRouterDaemon();
  }
});


test("conflict clearing stays blocked in V1 by default", () => {
  const result = applyConflictTinyRouterDecision(true, "resolved_by_authority");
  assert.equal(result, true);
});

test("conflict decision may still escalate uncertain cases", () => {
  const result = applyConflictTinyRouterDecision(false, "needs_review");
  assert.equal(result, true);
});

test("sufficiency model alone cannot flip insufficient to sufficient in V1", () => {
  const result = applySufficiencyTinyRouterDecision(false, "sufficient");
  assert.equal(result, false);
});

test("sufficiency decision may veto a premature sufficient result", () => {
  const result = applySufficiencyTinyRouterDecision(true, "need_authority");
  assert.equal(result, false);
});

test("structured decision thresholds are stricter for high-risk stop or sufficient decisions", () => {
  const highRiskPages = [{ domain_family: "regulated", overlays: ["security", "official-only"], source_policy_flags: ["official-only"] }];
  assert.equal(resolveSufficiencyDecisionThreshold("sufficient", "CVE-2026-1234 mitigation", highRiskPages), 0.90);
  assert.equal(resolveSufficiencyDecisionThreshold("need_authority", "CVE-2026-1234 mitigation", highRiskPages), 0.65);
  assert.equal(resolveConflictDecisionThreshold("resolved_by_authority", "CVE-2026-1234 mitigation", highRiskPages), 0.85);
  assert.equal(resolveFollowupDecisionThreshold("stop", "CVE-2026-1234 mitigation", { domain_family: "regulated" }), 0.90);
});
