#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  summarizeReviewProvenance,
  toCanonicalTrainingRow,
  validateCanonicalTrainingRow,
} from "../../lib/router-training-schema.js";

const DEFAULT_TRAIN_FILES = [
  { task: "domain", path: "data/router/log-candidates/domain-pi-accepted.jsonl" },
  { task: "sufficiency", path: "data/router/log-candidates/sufficiency-pi-accepted.jsonl" },
  { task: "conflict", path: "data/router/log-candidates/conflict-pi-accepted.jsonl" },
  { task: "followup", path: "data/followup/log-candidates/followup-pi-accepted.jsonl" },
];

const DEFAULT_GOLD_FILES = [
  { task: "domain", path: "data/router/gold-domain.jsonl" },
  { task: "sufficiency", path: "data/router/gold-sufficiency-structured.jsonl" },
  { task: "conflict", path: "data/router/gold-conflict-structured.jsonl" },
  { task: "followup", path: "data/followup/gold-followup.jsonl" },
];

function readJson(path) {
  if (!path || !existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

function readJsonl(path) {
  if (!path || !existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function parseFileList(value = "") {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [task, path] = item.includes(":") ? item.split(/:(.+)/) : ["domain", item];
      return { task, path };
    });
}

function auditRows(files = [], { holdout = false } = {}) {
  const reports = [];

  for (const file of files) {
    const rows = readJsonl(file.path);
    const reviewSummary = summarizeReviewProvenance(rows);
    const validationErrors = {};
    const validationWarnings = {};
    let validRows = 0;
    let trainableRows = 0;

    rows.forEach((row) => {
      const canonical = toCanonicalTrainingRow(row, { task: file.task, split: holdout ? "gold" : "train" });
      const validation = validateCanonicalTrainingRow(canonical, { allowHoldoutWithoutReview: holdout });
      if (validation.ok) validRows += 1;
      if (!holdout && validation.ok) trainableRows += 1;
      for (const error of validation.errors) validationErrors[error] = (validationErrors[error] || 0) + 1;
      for (const warning of validation.warnings) validationWarnings[warning] = (validationWarnings[warning] || 0) + 1;
    });

    reports.push({
      task: file.task,
      path: file.path,
      exists: existsSync(file.path),
      rows: rows.length,
      validRows,
      trainableRows,
      reviewSources: reviewSummary.reviewSources,
      prelabelRows: reviewSummary.prelabelRows,
      missingConfidenceRows: reviewSummary.missingConfidenceRows,
      needsHumanRows: reviewSummary.needsHumanRows,
      validationErrors,
      validationWarnings,
      ok: rows.length > 0 && Object.keys(validationErrors).length === 0,
    });
  }

  return { reports };
}

function auditSplits(path = "data/router/splits.json") {
  const splits = readJson(path);
  if (!splits) return { path, exists: false, ok: false, errors: ["missing_splits"] };
  const trainIds = new Set(splits.trainIds || []);
  const devIds = new Set(splits.devIds || splits.valIds || []);
  const testIds = new Set(splits.testIds || []);
  const errors = [];
  const overlap = (a, b) => [...a].filter((id) => b.has(id));
  if (!trainIds.size) errors.push("empty_train_split");
  if (!devIds.size) errors.push("empty_dev_split");
  if (!testIds.size) errors.push("empty_test_split");
  if (overlap(trainIds, devIds).length) errors.push("train_dev_overlap");
  if (overlap(trainIds, testIds).length) errors.push("train_test_overlap");
  if (overlap(devIds, testIds).length) errors.push("dev_test_overlap");
  return {
    path,
    exists: true,
    trainCount: trainIds.size,
    devCount: devIds.size,
    testCount: testIds.size,
    ok: errors.length === 0,
    errors,
  };
}

function auditManifest(path = "experiments/emet-superrouter/manifests/datasets.json") {
  const manifest = readJson(path);
  if (!manifest) return { path, exists: false, ok: false, errors: ["missing_manifest"] };
  const errors = [];
  const warnings = [];
  const aol = manifest.aol_query_log;
  if (!aol) warnings.push("aol_query_log_not_declared");
  else {
    if (aol.localPath) errors.push("aol_query_log_has_local_path");
    if (!String(aol.status || "").includes("privacy_sensitive") && !String(aol.notes || "").includes("privacy")) {
      errors.push("aol_query_log_not_marked_privacy_sensitive");
    }
  }
  return {
    path,
    exists: true,
    datasets: Object.keys(manifest).length,
    privacySensitiveOptOut: Boolean(aol && !aol.localPath),
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

export function auditDataGovernance(options = {}) {
  const train = auditRows(options.trainFiles || DEFAULT_TRAIN_FILES, { holdout: false });
  const gold = auditRows(options.goldFiles || DEFAULT_GOLD_FILES, { holdout: true });
  const splits = auditSplits(options.splits || "data/router/splits.json");
  const manifest = auditManifest(options.manifest || "experiments/emet-superrouter/manifests/datasets.json");
  const trainOk = train.reports.every((report) => report.ok);
  const goldOk = gold.reports.every((report) => report.exists && report.rows > 0);
  const ok = trainOk && goldOk && splits.ok && manifest.ok;

  return {
    generatedAt: new Date().toISOString(),
    ok,
    recommendation: ok
      ? "Phase 2 gates pass: reviewed train candidates, holdout files, split separation, and privacy manifest are present."
      : "Do not train/promote. Fix governance errors before using these rows for models.",
    trainFiles: train.reports,
    goldHoldouts: gold.reports,
    splits,
    manifest,
  };
}

function parseArgs(argv) {
  const args = {
    out: "metrics/router/data-governance.json",
    trainFiles: null,
    goldFiles: null,
    splits: "data/router/splits.json",
    manifest: "experiments/emet-superrouter/manifests/datasets.json",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") args.out = argv[++index];
    else if (arg === "--train") args.trainFiles = parseFileList(argv[++index]);
    else if (arg === "--gold") args.goldFiles = parseFileList(argv[++index]);
    else if (arg === "--splits") args.splits = argv[++index];
    else if (arg === "--manifest") args.manifest = argv[++index];
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return [
    "Usage: node scripts/router/audit-data-governance.mjs [--out metrics/router/data-governance.json]",
    "Optional --train/--gold format: task:path,task:path",
    "Validates Phase 2 data governance before router training.",
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  const report = auditDataGovernance(args);
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exitCode = 1;
  });
}
