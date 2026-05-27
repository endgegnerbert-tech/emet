#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { summarizeReviewProvenance } from "../../lib/router-training-schema.js";

const DEFAULT_TASKS = {
  domain: {
    gold: "data/router/gold-domain.jsonl",
    candidates: "data/router/log-candidates/domain-pi-accepted.jsonl",
    minClassCount: 5,
    requiredLabels: ["security", "vendor-status", "papers", "specs", "package-registry", "github", "changelog", "forums", "web"],
  },
  followup: {
    gold: "data/followup/gold-followup.jsonl",
    candidates: "data/followup/log-candidates/followup-pi-accepted.jsonl",
    minClassCount: 5,
    requiredLabels: ["stop", "need_more_sources", "need_authority", "need_primary_source", "need_recency", "need_version_context", "need_conflict_resolution"],
  },
  conflict: {
    gold: "data/router/gold-conflict-structured.jsonl",
    candidates: "data/router/log-candidates/conflict-pi-accepted.jsonl",
    minClassCount: 5,
    requiredLabels: ["no_conflict", "resolved_by_authority", "resolved_by_recency", "needs_review"],
  },
  sufficiency: {
    gold: "data/router/gold-sufficiency-structured.jsonl",
    candidates: "data/router/log-candidates/sufficiency-pi-accepted.jsonl",
    minClassCount: 5,
    requiredLabels: ["sufficient", "need_authority", "need_more_sources", "need_recency", "need_version_context"],
  },
};

function readJsonl(path) {
  if (!path || !existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function countBy(rows, field) {
  const out = {};
  for (const row of rows) {
    const value = row?.[field] || "<missing>";
    out[value] = (out[value] || 0) + 1;
  }
  return out;
}

function duplicateQueries(rows) {
  const counts = countBy(rows.filter((row) => row?.query), "query");
  return Object.entries(counts).filter(([, count]) => count > 1).map(([query, count]) => ({ query, count }));
}

function minClassCount(labelCounts = {}) {
  const values = Object.values(labelCounts).filter((value) => Number.isFinite(Number(value)));
  return values.length ? Math.min(...values) : 0;
}

export function auditTask(name, config = {}) {
  const gold = readJsonl(config.gold);
  const candidates = readJsonl(config.candidates);
  const labelCounts = countBy(gold, "label");
  const candidateLabelCounts = countBy(candidates, "label");
  const reviewSummary = summarizeReviewProvenance(candidates);
  const duplicates = duplicateQueries(gold);
  const minCount = minClassCount(labelCounts);
  const presentLabels = new Set(Object.keys(labelCounts).filter((label) => label !== "<missing>"));
  const missingRequiredLabels = Array.isArray(config.requiredLabels)
    ? config.requiredLabels.filter((label) => !presentLabels.has(label))
    : [];
  const warnings = [];

  if (!gold.length) warnings.push("no_gold_rows");
  if (presentLabels.size < 2) warnings.push("single_class_gold");
  if (missingRequiredLabels.length) warnings.push("missing_required_labels");
  if (duplicates.length) warnings.push("duplicate_gold_queries");
  if (minCount < Number(config.minClassCount || 5)) warnings.push("low_min_class_count");
  if (candidates.length && reviewSummary.reviewedRows === 0) warnings.push("new_candidates_not_human_reviewed");
  if (reviewSummary.prelabelRows) warnings.push("prelabels_must_not_be_promoted_without_review");
  if (reviewSummary.missingReviewRows) warnings.push("candidate_missing_review_source");
  if (reviewSummary.missingConfidenceRows) warnings.push("candidate_missing_review_confidence");
  if (reviewSummary.needsHumanRows) warnings.push("candidate_needs_human_review");

  return {
    task: name,
    goldPath: config.gold,
    candidatePath: config.candidates,
    goldRows: gold.length,
    candidateRows: candidates.length,
    reviewedCandidateRows: reviewSummary.reviewedRows,
    prelabelCandidateRows: reviewSummary.prelabelRows,
    missingReviewCandidateRows: reviewSummary.missingReviewRows,
    missingConfidenceCandidateRows: reviewSummary.missingConfidenceRows,
    needsHumanCandidateRows: reviewSummary.needsHumanRows,
    labelCounts,
    candidateLabelCounts,
    candidateReviewSources: reviewSummary.reviewSources,
    duplicateGoldQueries: duplicates.slice(0, 20),
    missingRequiredLabels,
    minClassCount: minCount,
    minClassCountRequired: Number(config.minClassCount || 5),
    trainWithNewCandidates: reviewSummary.reviewedRows > 0 && !warnings.includes("duplicate_gold_queries"),
    promoteSafe: warnings.length === 0,
    warnings,
  };
}

export function auditTrainingReadiness(tasks = DEFAULT_TASKS) {
  const taskReports = Object.fromEntries(Object.entries(tasks).map(([name, config]) => [name, auditTask(name, config)]));
  const promoteSafe = Object.values(taskReports).every((report) => report.promoteSafe);
  return {
    generatedAt: new Date().toISOString(),
    promoteSafe,
    recommendation: promoteSafe
      ? "All gates passed. Train and promote only after standard holdout evaluation."
      : "Do not train/promote with new log candidates yet. Review candidate labels, fix warnings, then rerun this audit.",
    tasks: taskReports,
  };
}

function parseArgs(argv) {
  const args = { out: "metrics/router/training-readiness.json" };
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
    "Usage: node scripts/router/audit-training-readiness.mjs [--out metrics/router/training-readiness.json]",
    "Checks whether reviewed log candidates are safe to merge into training gold sets.",
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const report = auditTrainingReadiness();
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
