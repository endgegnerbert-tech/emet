import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { auditPromotionGates } from "../scripts/router/audit-promotion-gates.mjs";

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeJsonl(path, rows) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
}

function writeFile(path, value = "ok\n") {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, value);
}

function seedPassingPromotionFixture(baseDir) {
  writeJsonl(join(baseDir, "data/router/gold-domain.jsonl"), [{ query: "cve", label: "security" }]);
  writeJsonl(join(baseDir, "data/router/query-understanding-holdout.jsonl"), [{ query: "cve", label: "fact_lookup" }]);
  writeJsonl(join(baseDir, "data/router/gold-source-authority-structured.jsonl"), [{ query: "docs", label: "authoritative" }]);
  writeJsonl(join(baseDir, "data/router/gold-sufficiency-structured.jsonl"), [{ query: "docs", label: "sufficient" }]);
  writeJsonl(join(baseDir, "data/router/gold-conflict-structured.jsonl"), [{ query: "docs", label: "no_conflict" }]);
  writeJsonl(join(baseDir, "data/followup/gold-followup.jsonl"), [{ query: "docs", label: "stop" }]);
  writeJson(join(baseDir, "eval/cases/security/basic.json"), { query: "CVE" });
  writeFile(join(baseDir, "test/research-guardrails.test.js"));
  writeFile(join(baseDir, "test/tiny-router.test.js"));

  writeJson(join(baseDir, "metrics/router/domain-baseline.json"), {
    task: "domain",
    accuracy: 0.8,
    macro_f1: 0.8,
    high_risk_downgrades: 0,
  });
  writeJson(join(baseDir, "metrics/router/domain-model2vec-svc.json"), {
    task: "domain",
    accuracy: 0.9,
    macro_f1: 0.9,
    high_risk_downgrades: 0,
  });
  writeJson(join(baseDir, "metrics/router/query-understanding-models.json"), {
    task: "query_understanding",
    best_model: "svc",
    merged: { macro_f1: 0.9 },
    raw: { macro_f1: 0.85 },
    baseline: { macro_f1: 0.7 },
  });
  writeJson(join(baseDir, "metrics/router/source_authority-structured-models.json"), {
    task: "source_authority",
    best_model: "lr",
    models: {
      lr: {
        accuracy: 0.95,
        macro_f1: 0.9,
        rows: [{ gold: "authoritative", pred: "authoritative" }],
      },
    },
  });
  writeJson(join(baseDir, "metrics/router/page_quality-structured-models.json"), {
    task: "page_quality",
    best_model: "lr",
    models: {
      lr: {
        accuracy: 0.95,
        macro_f1: 0.9,
        rows: [{ gold: "official_doc", pred: "usable" }],
      },
    },
  });
  writeJson(join(baseDir, "metrics/router/sufficiency-structured-models.json"), {
    task: "sufficiency",
    best_model: "lr",
    promotion_gate: {
      beats_baseline_macro_f1: true,
      beats_baseline_accuracy: true,
      high_risk_false_sufficient_zero: true,
    },
    models: { lr: { accuracy: 0.9, macro_f1: 0.9, selective: { high_risk_false_sufficient: 0 } } },
  });
  writeJson(join(baseDir, "metrics/router/conflict-structured-models.json"), {
    task: "conflict",
    best_model: "svc",
    promotion_gate: {
      beats_baseline_macro_f1: true,
      beats_baseline_accuracy: true,
      high_risk_false_sufficient_zero: true,
    },
    models: { svc: { accuracy: 0.9, macro_f1: 0.9 } },
  });
  writeJson(join(baseDir, "metrics/router/followup-model-gold.json"), {
    accuracy: 0.9,
    classification_report: { "macro avg": { "f1-score": 0.9 } },
  });
  writeJson(join(baseDir, "metrics/router/research-policy-baseline.json"), {
    accuracy: 0.9,
    macroF1: 0.9,
    high_risk_downgrades: 0,
  });
  writeJson(join(baseDir, "metrics/router/latency.json"), {
    task: "domain",
    latency_ms: { p95: 1.2, samples: 25 },
  });

  writeFile(join(baseDir, "lib/tiny-router.js"), "EMET_TINY_ROUTER EMET_TINY_ROUTER_DOMAIN EMET_TINY_ROUTER_PREFLIGHT EMET_TINY_ROUTER_FOLLOWUP EMET_TINY_ROUTER_CONFLICT EMET_TINY_ROUTER_SUFFICIENCY EMET_TINY_ROUTER_SOURCE_AUTHORITY EMET_TINY_ROUTER_PAGE_QUALITY EMET_TINY_ROUTER_QUERY_UNDERSTANDING function classifyFollowupHeuristically() {}");
  for (const artifact of ["domain", "preflight", "followup", "conflict-structured", "sufficiency-structured"]) {
    writeFile(join(baseDir, `ml/models/${artifact}/model.joblib`));
  }
}

test("auditPromotionGates passes when eval sets, metrics, latency, and rollback hooks pass", () => {
  const baseDir = mkdtempSync(join(tmpdir(), "emet-promotion-pass-"));
  seedPassingPromotionFixture(baseDir);

  const report = auditPromotionGates({ baseDir });

  assert.equal(report.promoteSafe, true);
  assert.equal(report.requiredEvalSets.every((gate) => gate.pass), true);
  assert.equal(report.modelGates.every((gate) => gate.pass), true);
  assert.equal(report.rollback.pass, true);
});

test("auditPromotionGates blocks missing required eval sets", () => {
  const baseDir = mkdtempSync(join(tmpdir(), "emet-promotion-missing-"));
  seedPassingPromotionFixture(baseDir);
  const report = auditPromotionGates({
    baseDir,
    requiredEvalSets: {
      missing_holdout: { path: "data/router/missing.jsonl", kind: "jsonl", minRows: 1 },
    },
  });

  assert.equal(report.promoteSafe, false);
  assert.equal(report.requiredEvalSets[0].pass, false);
  assert.ok(report.requiredEvalSets[0].warnings.includes("missing_eval_set"));
});

test("auditPromotionGates blocks high-risk domain downgrades", () => {
  const baseDir = mkdtempSync(join(tmpdir(), "emet-promotion-risk-"));
  seedPassingPromotionFixture(baseDir);
  writeJson(join(baseDir, "metrics/router/domain-model2vec-svc.json"), {
    task: "domain",
    accuracy: 0.9,
    macro_f1: 0.9,
    high_risk_downgrades: 1,
  });

  const report = auditPromotionGates({ baseDir });
  const domainGate = report.modelGates.find((gate) => gate.name === "domain_router");

  assert.equal(report.promoteSafe, false);
  assert.equal(domainGate.pass, false);
  assert.ok(domainGate.warnings.includes("high_risk_downgrades_nonzero"));
});

test("auditPromotionGates requires an explicit rules fallback function", () => {
  const baseDir = mkdtempSync(join(tmpdir(), "emet-promotion-fallback-"));
  seedPassingPromotionFixture(baseDir);
  writeFile(join(baseDir, "lib/tiny-router.js"), "EMET_TINY_ROUTER EMET_TINY_ROUTER_DOMAIN EMET_TINY_ROUTER_PREFLIGHT EMET_TINY_ROUTER_FOLLOWUP EMET_TINY_ROUTER_CONFLICT EMET_TINY_ROUTER_SUFFICIENCY EMET_TINY_ROUTER_SOURCE_AUTHORITY EMET_TINY_ROUTER_PAGE_QUALITY EMET_TINY_ROUTER_QUERY_UNDERSTANDING return null");

  const report = auditPromotionGates({ baseDir });

  assert.equal(report.promoteSafe, false);
  assert.equal(report.rollback.rulesFallbackPresent, false);
  assert.ok(report.rollback.warnings.includes("missing_rules_fallback_marker"));
});
