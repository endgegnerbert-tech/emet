#!/usr/bin/env node
import { fileURLToPath } from "node:url";

import { suggestAnnotation } from "../../lib/router-annotation.js";
import { readJsonl, writeJsonl } from "./file-utils.mjs";
export function prelabelDraftRows(task, rows = []) {
  return rows.map((row) => {
    const suggestion = suggestAnnotation(task, row);
    return {
      query: row.query,
      label: suggestion.label,
      rationale: suggestion.rationale,
      inputText: row.inputText || "",
      candidateLabel: row.candidateLabel || row.label || "",
      meta: row.meta && typeof row.meta === "object" ? row.meta : {},
      reviewSource: "ai_prelabel",
    };
  });
}

function parseArgs(argv) {
  const args = {
    task: "conflict",
    in: "",
    out: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--task") args.task = argv[++index];
    else if (arg === "--in") args.in = argv[++index];
    else if (arg === "--out") args.out = argv[++index];
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function defaultsForTask(task) {
  if (task === "sufficiency") {
    return {
      in: "data/router/gold-sufficiency-draft.jsonl",
      out: "data/router/gold-sufficiency-ai-reviewed.jsonl",
    };
  }
  return {
    in: "data/router/gold-conflict-draft.jsonl",
    out: "data/router/gold-conflict-ai-reviewed.jsonl",
  };
}

function usage() {
  return [
    "Usage: node scripts/router/prelabel-gold-drafts.mjs --task conflict|sufficiency [--in file] [--out file]",
    "Applies conservative AI prelabels to gold draft rows.",
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const defaults = defaultsForTask(args.task);
  const inPath = args.in || defaults.in;
  const outPath = args.out || defaults.out;
  const rows = readJsonl(inPath);
  const reviewed = prelabelDraftRows(args.task, rows);
  writeJsonl(outPath, reviewed);

  console.log(JSON.stringify({
    task: args.task,
    in: inPath,
    out: outPath,
    rows: reviewed.length,
  }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}
