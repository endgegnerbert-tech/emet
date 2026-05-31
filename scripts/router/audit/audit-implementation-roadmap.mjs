#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const DEFAULT_ROADMAP_SLICES = [
  {
    id: "slice-1",
    title: "schemas and docs",
    checks: [
      file("canonical_training_row_schema", "docs/schemas/router-training-row.schema.json"),
      file("training_schema_validator", "lib/router-training-schema.js"),
      file("data_governance_audit", "scripts/router/audit/audit-data-governance.mjs"),
      file("training_readiness_audit", "scripts/router/audit/audit-training-readiness.mjs"),
      file("training_schema_tests", "test/router-training-schema.test.js"),
      file("evidence_trace_schema_tests", "test/evidence-schema.test.js"),
    ],
  },
  {
    id: "slice-2",
    title: "stronger domain router",
    checks: [
      file("family_overlay_router", "lib/domains/index.js"),
      file("family_overlay_tests", "test/research-policy-domain.test.js"),
      file("domain_model_report", "metrics/router/domain-model2vec-svc.json"),
      jsonNumberEquals("zero_high_risk_domain_downgrades", "metrics/router/domain-model2vec-svc.json", ["high_risk_downgrades"], 0),
      contains("domain_rollback_flag", "lib/tiny-router.js", "EMET_TINY_ROUTER_DOMAIN"),
    ],
  },
  {
    id: "slice-3",
    title: "query-understanding model",
    checks: [
      file("query_understanding_runtime", "lib/query-understanding.js"),
      file("query_understanding_trainer", "ml/router/train_query_understanding.py"),
      jsonlMinRows("query_understanding_holdout", "data/router/query-understanding-holdout.jsonl", 1),
      any("query_understanding_or_preflight_metrics", [
        file("query_understanding_metrics", "metrics/router/query-understanding-models.json"),
        file("preflight_superrouter_metrics", "metrics/router/preflight-superrouter.json"),
      ]),
      contains("query_understanding_rollback_flag", "lib/tiny-router.js", "EMET_TINY_ROUTER_QUERY_UNDERSTANDING"),
    ],
  },
  {
    id: "slice-4",
    title: "source authority + page quality",
    checks: [
      file("structured_feature_extractor", "lib/router-structured-features.js"),
      file("structured_baseline_trainer", "ml/router/train_structured_baseline.py"),
      file("source_authority_report", "metrics/router/source_authority-structured-models.json"),
      file("page_quality_report", "metrics/router/page_quality-structured-models.json"),
      contains("source_authority_rollback_flag", "lib/tiny-router.js", "EMET_TINY_ROUTER_SOURCE_AUTHORITY"),
      contains("page_quality_rollback_flag", "lib/tiny-router.js", "EMET_TINY_ROUTER_PAGE_QUALITY"),
    ],
  },
  {
    id: "slice-5",
    title: "evidence graph",
    checks: [
      file("evidence_state_builder", "lib/research-evidence.js"),
      file("evidence_replay_script", "scripts/router/tools/replay-evidence-trace.mjs"),
      file("evidence_schema_tests", "test/evidence-schema.test.js"),
      file("evidence_replay_tests", "test/evidence-replay.test.js"),
    ],
  },
  {
    id: "slice-6",
    title: "sufficiency/conflict/follow-up models",
    checks: [
      file("sufficiency_report", "metrics/router/sufficiency-structured-models.json"),
      file("conflict_report", "metrics/router/conflict-structured-models.json"),
      file("followup_report", "metrics/router/followup-model-gold.json"),
      contains("sufficiency_rollback_flag", "lib/tiny-router.js", "EMET_TINY_ROUTER_SUFFICIENCY"),
      contains("conflict_rollback_flag", "lib/tiny-router.js", "EMET_TINY_ROUTER_CONFLICT"),
      contains("followup_rollback_flag", "lib/tiny-router.js", "EMET_TINY_ROUTER_FOLLOWUP"),
    ],
  },
  {
    id: "slice-7",
    title: "unified research policy baseline",
    checks: [
      file("next_action_policy_runtime", "lib/research-next-action-policy.js"),
      file("next_action_policy_eval", "scripts/router/eval/eval_research_policy_baseline.mjs"),
      file("next_action_policy_tests", "test/research-next-action-policy.test.js"),
    ],
  },
  {
    id: "slice-8",
    title: "TRM policy experiment",
    checks: [
      file("trm_experiment_plan", "docs/archive/plans/feature-plans/emet-superrouter/09-trm-hrm-policy-experiment.md"),
      contains("trm_not_promoted_without_win", "docs/archive/plans/feature-plans/emet-superrouter/09-trm-hrm-policy-experiment.md", "Do not use TRM"),
      file("baseline_policy_before_trm", "lib/research-next-action-policy.js"),
    ],
  },
  {
    id: "slice-9",
    title: "active-learning loop",
    checks: [
      file("pi_review_candidates", "scripts/router/review/pi-review-candidates.mjs"),
      file("llm_review_candidates", "scripts/router/review/llm-review-candidates.mjs"),
      file("split_reviewed_candidates", "scripts/router/review/split-reviewed-candidates.mjs"),
      file("review_summary_report", "metrics/router/pi-review-summary.json"),
      file("training_readiness_report", "metrics/router/training-readiness.json"),
    ],
  },
  {
    id: "slice-10",
    title: "production hardening",
    checks: [
      file("promotion_gate_audit", "scripts/router/audit/audit-promotion-gates.mjs"),
      file("promotion_gate_report", "metrics/router/promotion-gates.json"),
      file("latency_report", "metrics/router/latency.json"),
      contains("global_router_rollback_flag", "lib/tiny-router.js", "EMET_TINY_ROUTER"),
      file("router_runbook", "ml/router/README.md"),
    ],
  },
];

function file(name, path) {
  return { kind: "file", name, path };
}

function contains(name, path, text) {
  return { kind: "contains", name, path, text };
}

function jsonlMinRows(name, path, minRows) {
  return { kind: "jsonl_min_rows", name, path, minRows };
}

function jsonNumberEquals(name, path, fieldPath, expected) {
  return { kind: "json_number_equals", name, path, fieldPath, expected };
}

function any(name, checks) {
  return { kind: "any", name, checks };
}

function resolvePath(baseDir, path) {
  return join(baseDir, path);
}

function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function readField(value, fieldPath = []) {
  return fieldPath.reduce((current, field) => (current && typeof current === "object" ? current[field] : undefined), value);
}

function countJsonlRows(path) {
  if (!existsSync(path)) return 0;
  return readFileSync(path, "utf8").split("\n").filter((line) => line.trim()).length;
}

export function auditRoadmapCheck(check, baseDir = process.cwd()) {
  if (check.kind === "any") {
    const alternatives = check.checks.map((nested) => auditRoadmapCheck(nested, baseDir));
    return {
      name: check.name,
      kind: check.kind,
      pass: alternatives.some((result) => result.pass),
      alternatives,
      warnings: alternatives.some((result) => result.pass) ? [] : ["no_alternative_passed"],
    };
  }

  const absolutePath = resolvePath(baseDir, check.path);

  if (check.kind === "file") {
    const pass = existsSync(absolutePath);
    return { ...check, pass, warnings: pass ? [] : ["missing_file"] };
  }

  if (check.kind === "contains") {
    const exists = existsSync(absolutePath);
    const content = exists ? readFileSync(absolutePath, "utf8") : "";
    const pass = exists && content.includes(check.text);
    return { ...check, pass, warnings: pass ? [] : [exists ? "missing_text" : "missing_file"] };
  }

  if (check.kind === "jsonl_min_rows") {
    const rows = countJsonlRows(absolutePath);
    const pass = rows >= check.minRows;
    return { ...check, rows, pass, warnings: pass ? [] : [existsSync(absolutePath) ? "too_few_rows" : "missing_file"] };
  }

  if (check.kind === "json_number_equals") {
    const json = readJson(absolutePath);
    const actual = Number(readField(json, check.fieldPath));
    const pass = Number.isFinite(actual) && actual === check.expected;
    return { ...check, actual: Number.isFinite(actual) ? actual : null, pass, warnings: pass ? [] : [json ? "unexpected_number" : "missing_or_invalid_json"] };
  }

  return { ...check, pass: false, warnings: ["unknown_check_kind"] };
}

export function auditImplementationRoadmap({ baseDir = process.cwd(), slices = DEFAULT_ROADMAP_SLICES } = {}) {
  const sliceReports = slices.map((slice) => {
    const checks = slice.checks.map((check) => auditRoadmapCheck(check, baseDir));
    return {
      id: slice.id,
      title: slice.title,
      pass: checks.every((check) => check.pass),
      checks,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    allSlicesReady: sliceReports.every((slice) => slice.pass),
    slices: sliceReports,
  };
}

function parseArgs(argv) {
  const args = { out: "metrics/router/implementation-roadmap.json", baseDir: process.cwd() };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") args.out = argv[++index];
    else if (arg === "--base-dir") args.baseDir = argv[++index];
    else if (arg === "--no-write") args.out = null;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = auditImplementationRoadmap({ baseDir: args.baseDir });
  const output = `${JSON.stringify(report, null, 2)}\n`;

  if (args.out) {
    const outPath = resolvePath(args.baseDir, args.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, output);
  }

  process.stdout.write(output);
  if (!report.allSlicesReady) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
