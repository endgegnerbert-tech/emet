#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_REQUIRED_EVAL_SETS = {
  domain_holdout: { path: "data/router/gold-domain.jsonl", kind: "jsonl", minRows: 1 },
  query_understanding_holdout: { path: "data/router/query-understanding-holdout.jsonl", kind: "jsonl", minRows: 1 },
  source_authority_holdout: { path: "data/router/gold-source-authority-structured.jsonl", kind: "jsonl", minRows: 1 },
  sufficiency_holdout: { path: "data/router/gold-sufficiency-structured.jsonl", kind: "jsonl", minRows: 1 },
  conflict_holdout: { path: "data/router/gold-conflict-structured.jsonl", kind: "jsonl", minRows: 1 },
  followup_action_holdout: { path: "data/followup/gold-followup.jsonl", kind: "jsonl", minRows: 1 },
  end_to_end_research_eval_cases: { path: "eval/cases", kind: "json-directory", minRows: 1 },
  high_risk_regression_suite: {
    paths: ["test/research-guardrails.test.js", "test/tiny-router.test.js"],
    kind: "files",
    minRows: 2,
  },
};

const DEFAULT_MODEL_GATES = {
  domain_router: {
    kind: "domain",
    report: "metrics/router/domain-model2vec-svc.json",
    baseline: "metrics/router/domain-baseline.json",
  },
  query_understanding: {
    kind: "metric",
    report: "metrics/router/query-understanding-models.json",
    requiredFields: ["merged.macro_f1"],
  },
  source_authority: {
    kind: "source-authority",
    report: "metrics/router/source_authority-structured-models.json",
  },
  page_quality: {
    kind: "page-quality",
    report: "metrics/router/page_quality-structured-models.json",
  },
  sufficiency: {
    kind: "structured-promotion",
    report: "metrics/router/sufficiency-structured-models.json",
    safetyField: "high_risk_false_sufficient",
  },
  conflict: {
    kind: "structured-promotion",
    report: "metrics/router/conflict-structured-models.json",
  },
  followup_action: {
    kind: "metric",
    report: "metrics/router/followup-model-gold.json",
  },
  research_policy: {
    kind: "research-policy",
    report: "metrics/router/research-policy-baseline.json",
  },
  runtime_latency: {
    kind: "latency",
    report: "metrics/router/latency.json",
    p95BudgetMs: 50,
  },
};

const DEFAULT_ROLLBACK = {
  routerFile: "lib/tiny-router.js",
  requiredFlags: [
    "EMET_TINY_ROUTER",
    "EMET_TINY_ROUTER_DOMAIN",
    "EMET_TINY_ROUTER_PREFLIGHT",
    "EMET_TINY_ROUTER_FOLLOWUP",
    "EMET_TINY_ROUTER_CONFLICT",
    "EMET_TINY_ROUTER_SUFFICIENCY",
    "EMET_TINY_ROUTER_SOURCE_AUTHORITY",
    "EMET_TINY_ROUTER_PAGE_QUALITY",
    "EMET_TINY_ROUTER_QUERY_UNDERSTANDING",
  ],
  requiredArtifacts: [
    "ml/models/domain/model.joblib",
    "ml/models/preflight/model.joblib",
    "ml/models/followup/model.joblib",
    "ml/models/conflict-structured/model.joblib",
    "ml/models/sufficiency-structured/model.joblib",
  ],
};

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

function countJsonlRows(path) {
  if (!existsSync(path)) return 0;
  return readFileSync(path, "utf8").split("\n").filter((line) => line.trim()).length;
}

function countJsonFilesRecursive(path) {
  if (!existsSync(path)) return 0;
  const stat = statSync(path);
  if (stat.isFile()) return path.endsWith(".json") ? 1 : 0;
  let count = 0;
  for (const entry of readdirSync(path)) {
    count += countJsonFilesRecursive(join(path, entry));
  }
  return count;
}

function countExistingFiles(paths) {
  return paths.filter((path) => existsSync(path)).length;
}

function normalizeSpecs(specs) {
  return Object.entries(specs || {}).map(([name, spec]) => ({ name, ...spec }));
}

export function auditEvalSet(name, spec, baseDir = process.cwd()) {
  const relativePaths = spec.paths || [spec.path];
  const paths = relativePaths.filter(Boolean).map((path) => resolvePath(baseDir, path));
  const warnings = [];
  let rows = 0;

  if (!paths.length || paths.some((path) => !existsSync(path))) warnings.push("missing_eval_set");

  if (spec.kind === "jsonl") rows = paths.reduce((sum, path) => sum + countJsonlRows(path), 0);
  else if (spec.kind === "json-directory") rows = paths.reduce((sum, path) => sum + countJsonFilesRecursive(path), 0);
  else if (spec.kind === "files") rows = countExistingFiles(paths);
  else rows = paths.filter((path) => existsSync(path)).length;

  const minRows = Number(spec.minRows || 1);
  if (rows < minRows) warnings.push("too_few_eval_rows");

  return {
    name,
    kind: spec.kind || "file",
    paths: relativePaths,
    rows,
    minRows,
    pass: warnings.length === 0,
    warnings,
  };
}

function reportRows(report) {
  if (!report || typeof report !== "object") return [];
  const model = bestModel(report);
  if (Array.isArray(model?.rows)) return model.rows;
  if (Array.isArray(report.rows)) return report.rows;
  return [];
}

function bestModel(report) {
  if (!report || typeof report !== "object") return null;
  if (report.best_model && report.models?.[report.best_model]) return report.models[report.best_model];
  return report;
}

function macroF1(report) {
  const model = bestModel(report) || {};
  return firstFinite(
    model.macro_f1,
    model.macroF1,
    model.classification_report?.["macro avg"]?.["f1-score"],
    report?.macro_f1,
    report?.macroF1,
    report?.merged?.macro_f1,
    report?.raw?.macro_f1,
    report?.classification_report?.["macro avg"]?.["f1-score"],
  );
}

function accuracy(report) {
  const model = bestModel(report) || {};
  return firstFinite(model.accuracy, report?.accuracy);
}

function firstFinite(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function allPromotionBooleansPass(gate = {}) {
  const entries = Object.entries(gate).filter(([, value]) => typeof value === "boolean");
  return entries.length > 0 && entries.every(([, value]) => value === true);
}

function auditMetricGate(name, spec, baseDir) {
  const path = resolvePath(baseDir, spec.report);
  const report = readJson(path);
  const warnings = [];
  if (!report) warnings.push("missing_metric_report");

  const f1 = macroF1(report);
  const acc = accuracy(report);
  if (report && f1 === null) warnings.push("missing_macro_f1");

  return {
    name,
    kind: spec.kind,
    reportPath: spec.report,
    macroF1: f1,
    accuracy: acc,
    pass: warnings.length === 0,
    warnings,
  };
}

function auditDomainGate(name, spec, baseDir) {
  const report = readJson(resolvePath(baseDir, spec.report));
  const baseline = readJson(resolvePath(baseDir, spec.baseline));
  const warnings = [];
  if (!report) warnings.push("missing_metric_report");
  if (!baseline) warnings.push("missing_baseline_report");

  const f1 = macroF1(report);
  const baselineF1 = macroF1(baseline);
  const acc = accuracy(report);
  const highRiskDowngrades = Number(report?.high_risk_downgrades ?? NaN);

  if (f1 === null) warnings.push("missing_macro_f1");
  if (baselineF1 === null) warnings.push("missing_baseline_macro_f1");
  if (f1 !== null && baselineF1 !== null && f1 < baselineF1) warnings.push("held_out_eval_not_improved");
  if (!Number.isFinite(highRiskDowngrades) || highRiskDowngrades !== 0) warnings.push("high_risk_downgrades_nonzero");

  return {
    name,
    kind: spec.kind,
    reportPath: spec.report,
    baselinePath: spec.baseline,
    macroF1: f1,
    baselineMacroF1: baselineF1,
    accuracy: acc,
    highRiskDowngrades: Number.isFinite(highRiskDowngrades) ? highRiskDowngrades : null,
    pass: warnings.length === 0,
    warnings,
  };
}

function auditStructuredPromotionGate(name, spec, baseDir) {
  const report = readJson(resolvePath(baseDir, spec.report));
  const warnings = [];
  if (!report) warnings.push("missing_metric_report");
  if (report && !allPromotionBooleansPass(report.promotion_gate)) warnings.push("promotion_gate_failed");

  const model = bestModel(report);
  const safetyValue = spec.safetyField ? Number(model?.selective?.[spec.safetyField] ?? 0) : 0;
  if (spec.safetyField && safetyValue !== 0) warnings.push(`${spec.safetyField}_nonzero`);

  return {
    name,
    kind: spec.kind,
    reportPath: spec.report,
    macroF1: macroF1(report),
    accuracy: accuracy(report),
    promotionGate: report?.promotion_gate || null,
    pass: warnings.length === 0,
    warnings,
  };
}

function auditSourceAuthorityGate(name, spec, baseDir) {
  const metric = auditMetricGate(name, spec, baseDir);
  const rows = reportRows(readJson(resolvePath(baseDir, spec.report)));
  const authoritativeFalseDiscards = rows.filter((row) => row?.gold === "authoritative" && row?.pred !== "authoritative").length;
  if (rows.length && authoritativeFalseDiscards > 0) metric.warnings.push("authoritative_false_discard_nonzero");
  if (!rows.length) metric.warnings.push("source_authority_safety_not_measured");
  metric.authoritativeFalseDiscards = authoritativeFalseDiscards;
  metric.pass = metric.warnings.length === 0;
  return metric;
}

function auditPageQualityGate(name, spec, baseDir) {
  const metric = auditMetricGate(name, spec, baseDir);
  const rows = reportRows(readJson(resolvePath(baseDir, spec.report)));
  const officialDocRows = rows.filter((row) => row?.gold === "official_doc");
  const officialDocLosses = officialDocRows.filter((row) => ["blocked", "thin", "unusable"].includes(row?.pred)).length;
  if (officialDocRows.length && officialDocLosses > 0) metric.warnings.push("official_doc_loss_nonzero");
  if (!officialDocRows.length) metric.warnings.push("official_doc_safety_not_measured");
  metric.officialDocLosses = officialDocLosses;
  metric.pass = metric.warnings.length === 0;
  return metric;
}

function auditResearchPolicyGate(name, spec, baseDir) {
  const metric = auditMetricGate(name, spec, baseDir);
  const report = readJson(resolvePath(baseDir, spec.report));
  const highRiskDowngrades = Number(report?.high_risk_downgrades ?? 0);
  if (highRiskDowngrades !== 0) metric.warnings.push("high_risk_downgrades_nonzero");
  metric.highRiskDowngrades = highRiskDowngrades;
  metric.pass = metric.warnings.length === 0;
  return metric;
}

function auditLatencyGate(name, spec, baseDir) {
  const report = readJson(resolvePath(baseDir, spec.report));
  const warnings = [];
  if (!report) warnings.push("missing_latency_report");
  const p95 = firstFinite(report?.latency_ms?.p95, report?.p95);
  if (p95 === null) warnings.push("missing_p95_latency");
  if (p95 !== null && p95 > Number(spec.p95BudgetMs || 50)) warnings.push("p95_latency_over_budget");
  return {
    name,
    kind: spec.kind,
    reportPath: spec.report,
    p95Ms: p95,
    p95BudgetMs: Number(spec.p95BudgetMs || 50),
    pass: warnings.length === 0,
    warnings,
  };
}

export function auditModelGate(name, spec, baseDir = process.cwd()) {
  if (spec.kind === "domain") return auditDomainGate(name, spec, baseDir);
  if (spec.kind === "structured-promotion") return auditStructuredPromotionGate(name, spec, baseDir);
  if (spec.kind === "source-authority") return auditSourceAuthorityGate(name, spec, baseDir);
  if (spec.kind === "page-quality") return auditPageQualityGate(name, spec, baseDir);
  if (spec.kind === "research-policy") return auditResearchPolicyGate(name, spec, baseDir);
  if (spec.kind === "latency") return auditLatencyGate(name, spec, baseDir);
  return auditMetricGate(name, spec, baseDir);
}

export function auditRollback(config = DEFAULT_ROLLBACK, baseDir = process.cwd()) {
  const routerPath = resolvePath(baseDir, config.routerFile);
  const routerSource = existsSync(routerPath) ? readFileSync(routerPath, "utf8") : "";
  const missingFlags = config.requiredFlags.filter((flag) => !routerSource.includes(flag));
  const missingArtifacts = config.requiredArtifacts.filter((path) => !existsSync(resolvePath(baseDir, path)));
  const rulesFallbackPresent = /(?:export\s+)?function\s+classifyFollowupHeuristically\b/.test(routerSource);
  const warnings = [];
  if (!routerSource) warnings.push("missing_router_file");
  if (missingFlags.length) warnings.push("missing_rollback_flags");
  if (!rulesFallbackPresent) warnings.push("missing_rules_fallback_marker");
  if (missingArtifacts.length) warnings.push("missing_model_artifacts");

  return {
    routerFile: config.routerFile,
    missingFlags,
    missingArtifacts,
    rulesFallbackPresent,
    pass: warnings.length === 0,
    warnings,
  };
}

export function auditPromotionGates(options = {}) {
  const baseDir = options.baseDir || process.cwd();
  const requiredEvalSets = normalizeSpecs(options.requiredEvalSets || DEFAULT_REQUIRED_EVAL_SETS)
    .map((spec) => auditEvalSet(spec.name, spec, baseDir));
  const modelGates = normalizeSpecs(options.modelGates || DEFAULT_MODEL_GATES)
    .map((spec) => auditModelGate(spec.name, spec, baseDir));
  const rollback = auditRollback(options.rollback || DEFAULT_ROLLBACK, baseDir);
  const promoteSafe = requiredEvalSets.every((gate) => gate.pass)
    && modelGates.every((gate) => gate.pass)
    && rollback.pass;

  return {
    generatedAt: new Date().toISOString(),
    phase: "11-evaluation-promotion-rollout",
    promoteSafe,
    recommendation: promoteSafe
      ? "All Phase 11 gates pass. Promote only through shadow mode, internal flag, low-risk rollout, guardrail-veto rollout, then production default."
      : "Do not promote. Fix failed eval, metric, latency, or rollback gates first.",
    rolloutOrder: [
      "shadow mode",
      "feature flag for internal runs",
      "low-risk families only",
      "all families with guardrail veto",
      "production default",
    ],
    requiredEvalSets,
    modelGates,
    rollback,
  };
}

function parseArgs(argv) {
  const args = { out: "metrics/router/promotion-gates.json" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") args.out = argv[++index];
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return [
    "Usage: node scripts/router/audit-promotion-gates.mjs [--out metrics/router/promotion-gates.json]",
    "Checks Phase 11 eval-set, metric, latency, rollout, and rollback gates before model promotion.",
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  const report = auditPromotionGates();
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.promoteSafe) process.exitCode = 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exitCode = 1;
  });
}
