#!/usr/bin/env node
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { detectConflictSignals, evaluateSufficiency } from "../../../lib/research.js";
import { parseStructuredSources } from "../../../lib/router-structured-features.js";
import { readJsonl } from "../utils/file-utils.mjs";
export function parseSourcesFromInputText(inputText = "") {
  return parseStructuredSources(inputText).map((source) => ({
    ...source,
    snippet: source.text,
    url: `https://${source.sourceType}-${source.index}.example.test/${source.index}`,
  }));
}

function uniqueDomains(sources = []) {
  return new Set(sources.map((source) => {
    try {
      return new URL(source.url).hostname;
    } catch {
      return "";
    }
  }).filter(Boolean)).size;
}

export function predictConflictBaseline(row = {}) {
  const sources = parseSourcesFromInputText(row.inputText);
  const conflict = detectConflictSignals(sources);
  return conflict.detected ? "needs_review" : "no_conflict";
}

export function predictSufficiencyBaseline(row = {}) {
  const sources = parseSourcesFromInputText(row.inputText);
  const result = evaluateSufficiency({
    query: row.query || "",
    sources,
    conflictDetected: false,
    minSources: row.meta?.mode === "deep" || row.meta?.mode === "academic" ? 2 : 1,
  });

  if (result.sufficient) return "sufficient";
  if (!result.authoritativeSourcesFound) return "need_authority";
  return "need_more_sources";
}

export function evaluateConflictBaselineRow(row = {}) {
  const sources = parseSourcesFromInputText(row.inputText);
  const conflict = detectConflictSignals(sources);
  return {
    query: row.query,
    mode: row.meta?.mode || null,
    sourceCount: sources.length,
    domainCount: uniqueDomains(sources),
    gold: row.label,
    predicted: conflict.detected ? "needs_review" : "no_conflict",
    detected: conflict.detected,
    conflictSummary: conflict.conflictSummary || "",
  };
}

export function evaluateSufficiencyBaselineRow(row = {}) {
  const sources = parseSourcesFromInputText(row.inputText);
  const result = evaluateSufficiency({
    query: row.query || "",
    sources,
    conflictDetected: false,
    minSources: row.meta?.mode === "deep" || row.meta?.mode === "academic" ? 2 : 1,
  });
  return {
    query: row.query,
    mode: row.meta?.mode || null,
    sourceCount: sources.length,
    authoritativeSourcesFound: result.authoritativeSourcesFound,
    gold: row.label,
    predicted: result.sufficient ? "sufficient" : (!result.authoritativeSourcesFound ? "need_authority" : "need_more_sources"),
    sufficient: result.sufficient,
    confidenceScore: result.confidenceScore,
    missingAspects: result.missingAspects,
  };
}

function increment(counter, key) {
  counter[key] = (counter[key] || 0) + 1;
}

function classificationReport(rows) {
  const labels = [...new Set(rows.flatMap((row) => [row.gold, row.predicted]))].sort();
  const confusion = {};
  let correct = 0;
  for (const row of rows) {
    if (row.gold === row.predicted) correct += 1;
    increment(confusion, `${row.gold} -> ${row.predicted}`);
  }
  const perLabel = {};
  for (const label of labels) {
    const tp = rows.filter((row) => row.gold === label && row.predicted === label).length;
    const fp = rows.filter((row) => row.gold !== label && row.predicted === label).length;
    const fn = rows.filter((row) => row.gold === label && row.predicted !== label).length;
    const precision = tp + fp ? tp / (tp + fp) : 0;
    const recall = tp + fn ? tp / (tp + fn) : 0;
    const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
    perLabel[label] = { precision, recall, f1, support: rows.filter((row) => row.gold === label).length };
  }
  const macroF1 = labels.length ? labels.reduce((sum, label) => sum + perLabel[label].f1, 0) / labels.length : 0;
  return {
    accuracy: rows.length ? correct / rows.length : 0,
    macroF1,
    labels,
    perLabel,
    confusion,
  };
}

function evaluateConflict(rows) {
  const evaluated = rows.map(evaluateConflictBaselineRow);
  return {
    total: evaluated.length,
    ...classificationReport(evaluated),
    rows: evaluated,
  };
}

function evaluateSufficiencyRows(rows) {
  const evaluated = rows.map(evaluateSufficiencyBaselineRow);
  const falseSufficient = evaluated.filter((row) => row.predicted === "sufficient" && row.gold !== "sufficient").length;
  return {
    total: evaluated.length,
    falseSufficient,
    ...classificationReport(evaluated),
    rows: evaluated,
  };
}

function main() {
  const conflictRows = readJsonl(path.join(process.cwd(), "data", "router", "gold-conflict-provisional.jsonl"));
  const sufficiencyRows = readJsonl(path.join(process.cwd(), "data", "router", "gold-sufficiency-provisional.jsonl"));

  const conflictReport = evaluateConflict(conflictRows);
  const sufficiencyReport = evaluateSufficiencyRows(sufficiencyRows);

  const outDir = path.join(process.cwd(), "metrics", "router");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, "conflict-baseline-provisional.json"), JSON.stringify(conflictReport, null, 2));
  writeFileSync(path.join(outDir, "sufficiency-baseline-provisional.json"), JSON.stringify(sufficiencyReport, null, 2));

  console.log(JSON.stringify({
    conflict: { total: conflictReport.total, accuracy: conflictReport.accuracy, macroF1: conflictReport.macroF1 },
    sufficiency: { total: sufficiencyReport.total, accuracy: sufficiencyReport.accuracy, macroF1: sufficiencyReport.macroF1, falseSufficient: sufficiencyReport.falseSufficient },
  }, null, 2));
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main();
}
