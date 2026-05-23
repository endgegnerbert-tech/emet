#!/usr/bin/env node
import path from "node:path";

import { extractConflictStructuredFeatures, extractSufficiencyStructuredFeatures } from "../../lib/router-structured-features.js";
import { readJsonl, writeJsonl } from "./file-utils.mjs";
export function buildStructuredRows(task, rows = []) {
  return rows.map((row) => ({
    task,
    query: row.query,
    label: row.label,
    rationale: row.rationale || "",
    meta: row.meta && typeof row.meta === "object" ? row.meta : {},
    features: task === "conflict"
      ? extractConflictStructuredFeatures(row)
      : extractSufficiencyStructuredFeatures(row),
  }));
}

function main() {
  const conflictPath = path.join(process.cwd(), "data", "router", "gold-conflict-provisional.jsonl");
  const sufficiencyPath = path.join(process.cwd(), "data", "router", "gold-sufficiency-provisional.jsonl");
  const outDir = path.join(process.cwd(), "data", "router");

  const conflictRows = buildStructuredRows("conflict", readJsonl(conflictPath));
  const sufficiencyRows = buildStructuredRows("sufficiency", readJsonl(sufficiencyPath));

  writeJsonl(path.join(outDir, "gold-conflict-structured.jsonl"), conflictRows);
  writeJsonl(path.join(outDir, "gold-sufficiency-structured.jsonl"), sufficiencyRows);

  console.log(JSON.stringify({
    conflict: conflictRows.length,
    sufficiency: sufficiencyRows.length,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  main();
}
