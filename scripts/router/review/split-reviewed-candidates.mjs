#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TASK_FILES = {
  domain: {
    reviewed: "data/router/log-candidates/domain-pi-reviewed.jsonl",
    accepted: "data/router/log-candidates/domain-pi-accepted.jsonl",
    human: "data/router/log-candidates/domain-needs-human.jsonl",
  },
  sufficiency: {
    reviewed: "data/router/log-candidates/sufficiency-pi-reviewed.jsonl",
    accepted: "data/router/log-candidates/sufficiency-pi-accepted.jsonl",
    human: "data/router/log-candidates/sufficiency-needs-human.jsonl",
  },
  conflict: {
    reviewed: "data/router/log-candidates/conflict-pi-reviewed.jsonl",
    accepted: "data/router/log-candidates/conflict-pi-accepted.jsonl",
    human: "data/router/log-candidates/conflict-needs-human.jsonl",
  },
  followup: {
    reviewed: "data/followup/log-candidates/followup-pi-reviewed.jsonl",
    accepted: "data/followup/log-candidates/followup-pi-accepted.jsonl",
    human: "data/followup/log-candidates/followup-needs-human.jsonl",
  },
};

function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

function writeJsonl(path, rows) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""));
}

function countLabels(rows) {
  const counts = {};
  for (const row of rows) counts[row.label || "<missing>"] = (counts[row.label || "<missing>"] || 0) + 1;
  return counts;
}

export function splitReviewedRows(rows = [], minConfidence = 0.85) {
  const accepted = [];
  const human = [];
  for (const row of rows) {
    if (Number(row.confidence || 0) >= minConfidence && !row.needs_human_review) accepted.push(row);
    else human.push(row);
  }
  return { accepted, human };
}

function parseArgs(argv) {
  const args = { task: "all", minConfidence: 0.85, report: "metrics/router/pi-review-summary.json" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--task") args.task = argv[++index];
    else if (arg === "--min-confidence") args.minConfidence = Number(argv[++index]);
    else if (arg === "--report") args.report = argv[++index];
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return "Usage: node scripts/router/split-reviewed-candidates.mjs [--task all|domain|sufficiency|conflict|followup] [--min-confidence 0.85]";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const taskNames = args.task === "all" ? Object.keys(TASK_FILES) : [args.task];
  const report = { generatedAt: new Date().toISOString(), minConfidence: args.minConfidence, tasks: {} };
  for (const task of taskNames) {
    const files = TASK_FILES[task];
    if (!files) throw new Error(`Unknown task: ${task}`);
    const rows = readJsonl(files.reviewed);
    const { accepted, human } = splitReviewedRows(rows, args.minConfidence);
    writeJsonl(files.accepted, accepted);
    writeJsonl(files.human, human);
    report.tasks[task] = {
      reviewed: rows.length,
      accepted: accepted.length,
      needsHuman: human.length,
      acceptedLabels: countLabels(accepted),
      humanLabels: countLabels(human),
      files,
    };
  }
  mkdirSync(dirname(args.report), { recursive: true });
  writeFileSync(args.report, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}
