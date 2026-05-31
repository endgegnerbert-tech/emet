#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { decideResearchPolicyAction } from "../../../lib/research-next-action-policy.js";
import { parseStructuredSources } from "../../../lib/router-structured-features.js";
import { readJsonl } from "../utils/file-utils.mjs";

function evidenceSourcesFromRow(row = {}) {
  if (row.evidenceState?.sources) return row.evidenceState.sources;
  if (Array.isArray(row.sources)) return row.sources;
  return parseStructuredSources(row.inputText || "").map((source) => ({
    url: `https://${source.sourceType}-${source.index}.example.test/${source.index}`,
    host: `${source.sourceType}-${source.index}.example.test`,
    title: source.title,
    text_sample: source.text,
    source_type: source.sourceType,
    sourceType: source.sourceType,
    authoritative: source.authoritative,
    quality_score: source.blocked ? 0 : 1,
  }));
}

export function predictResearchPolicyBaseline(row = {}) {
  const decision = decideResearchPolicyAction({
    query: row.query || "",
    mode: row.meta?.mode || row.mode || "fast",
    config: row.config || row.meta?.config || { mode: row.meta?.mode || row.mode || "fast", domainFamily: row.meta?.domainFamily || row.meta?.domain_family || "web" },
    evidenceState: row.evidenceState || { sources: evidenceSourcesFromRow(row) },
    sufficiency: row.sufficiency || row.meta?.sufficiency || { sufficient: row.sufficient === true, confidenceScore: Number(row.confidenceScore || 0) },
    conflict: row.conflict || row.meta?.conflict || { finalDetected: row.conflictDetected === true },
    queryUnderstandingDecision: row.queryUnderstandingDecision || row.queryUnderstanding || row.meta?.queryUnderstandingDecision,
    previousActions: row.previousActions || row.meta?.previousActions || [],
  });
  return decision.action;
}

function increment(counter, key) {
  counter[key] = (counter[key] || 0) + 1;
}

function report(rows) {
  const labels = [...new Set(rows.flatMap((row) => [row.gold, row.predicted]))].filter(Boolean).sort();
  const confusion = {};
  let correct = 0;
  const perLabel = {};
  for (const row of rows) {
    if (row.gold === row.predicted) correct += 1;
    increment(confusion, `${row.gold} -> ${row.predicted}`);
  }
  for (const label of labels) {
    const tp = rows.filter((row) => row.gold === label && row.predicted === label).length;
    const fp = rows.filter((row) => row.gold !== label && row.predicted === label).length;
    const fn = rows.filter((row) => row.gold === label && row.predicted !== label).length;
    const precision = tp + fp ? tp / (tp + fp) : 0;
    const recall = tp + fn ? tp / (tp + fn) : 0;
    const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
    perLabel[label] = { precision, recall, f1, support: rows.filter((row) => row.gold === label).length };
  }
  return {
    total: rows.length,
    accuracy: rows.length ? correct / rows.length : 0,
    macroF1: labels.length ? labels.reduce((sum, label) => sum + perLabel[label].f1, 0) / labels.length : 0,
    labels,
    perLabel,
    confusion,
    rows,
  };
}

function main() {
  const inputPath = process.argv[2] || path.join(process.cwd(), "data", "router", "gold-research-policy.jsonl");
  if (!existsSync(inputPath)) {
    console.error(`Missing research-policy labels: ${inputPath}`);
    process.exitCode = 2;
    return;
  }

  const evaluated = readJsonl(inputPath)
    .map((row) => ({
      query: row.query || "",
      gold: row.action || row.label,
      predicted: predictResearchPolicyBaseline(row),
    }))
    .filter((row) => row.gold);
  const result = report(evaluated);
  const outDir = path.join(process.cwd(), "metrics", "router");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "research-policy-baseline.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ total: result.total, accuracy: result.accuracy, macroF1: result.macroF1 }, null, 2));
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main();
}
