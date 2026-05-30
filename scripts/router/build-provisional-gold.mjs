#!/usr/bin/env node
import { fileURLToPath } from "node:url";

import { readJsonl, writeJsonl } from "./file-utils.mjs";
export function normalizeReviewedRow(task, row = {}) {
  if (task !== "sufficiency") return row;
  if (row.label !== "insufficient") return row;
  const rationale = String(row.rationale || "").toLowerCase();
  if (/conflict|contradict|disagree|disagreement/.test(rationale)) return { ...row, label: "need_conflict_resolution" };
  if (/primary|paper|doi|publisher|advisory|standard|regulator/.test(rationale)) return { ...row, label: "need_primary_source" };
  if (/authoritative|official/.test(rationale)) return { ...row, label: "need_authority" };
  if (/version|build flag|compatible|migration|upgrade/.test(rationale)) return { ...row, label: "need_version_context" };
  if (/current|latest|status|lts|release/.test(rationale)) return { ...row, label: "need_recency" };
  return { ...row, label: "need_more_sources" };
}

export function mergeReviewedRows(task, humanGold = [], aiReviewed = []) {
  const byQuery = new Map();
  for (const row of aiReviewed) byQuery.set(String(row.query || ""), normalizeReviewedRow(task, { ...row, reviewSource: row.reviewSource || "ai_prelabel" }));
  for (const row of humanGold) byQuery.set(String(row.query || ""), normalizeReviewedRow(task, { ...row, reviewSource: row.reviewSource || "human_gold" }));
  return [...byQuery.values()].sort((a, b) => String(a.query || "").localeCompare(String(b.query || "")));
}

function parseArgs(argv) {
  const args = {
    human: "",
    ai: "",
    out: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--human") args.human = argv[++index];
    else if (arg === "--ai") args.ai = argv[++index];
    else if (arg === "--out") args.out = argv[++index];
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return [
    "Usage: node scripts/router/build-provisional-gold.mjs --human data/router/gold-conflict.jsonl --ai data/router/gold-conflict-ai-reviewed.jsonl --out data/router/gold-conflict-provisional.jsonl",
    "Merges human gold and AI-reviewed rows, preferring human labels on duplicate queries.",
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const humanRows = readJsonl(args.human);
  const aiRows = readJsonl(args.ai);
  const inferredTask = /sufficiency/i.test(args.out) || /sufficiency/i.test(args.human) || /sufficiency/i.test(args.ai) ? "sufficiency" : "conflict";
  const merged = mergeReviewedRows(inferredTask, humanRows, aiRows);
  writeJsonl(args.out, merged);
  console.log(JSON.stringify({ human: humanRows.length, ai: aiRows.length, out: args.out, merged: merged.length }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}
