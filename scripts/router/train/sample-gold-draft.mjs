#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

function readJsonl(path) {
  return readFileSync(path, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

function writeJsonl(path, rows) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
}

function bucketKey(row) {
  return `${row.candidateLabel || "unknown"}::${row.meta?.mode || "unknown"}`;
}

export function selectGoldDraftCandidates(candidates = [], existingGold = [], limit = 80) {
  const seenQueries = new Set(existingGold.map((row) => String(row?.query || "")).filter(Boolean));
  const filtered = candidates
    .filter((row) => row?.query && row?.inputText)
    .filter((row) => !seenQueries.has(row.query))
    .sort((a, b) => a.query.localeCompare(b.query));

  const buckets = new Map();
  for (const row of filtered) {
    const key = bucketKey(row);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  }

  const orderedKeys = [...buckets.keys()].sort((a, b) => {
    const sizeDiff = buckets.get(a).length - buckets.get(b).length;
    return sizeDiff || a.localeCompare(b);
  });

  const selected = [];
  while (selected.length < limit) {
    let progressed = false;
    for (const key of orderedKeys) {
      const bucket = buckets.get(key);
      if (!bucket?.length) continue;
      selected.push(bucket.shift());
      progressed = true;
      if (selected.length >= limit) break;
    }
    if (!progressed) break;
  }

  return selected;
}

function parseArgs(argv) {
  const args = {
    candidates: "data/router/conflict-candidates.jsonl",
    gold: "data/router/gold-conflict.jsonl",
    out: "data/router/gold-conflict-draft.jsonl",
    limit: 80,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--candidates") args.candidates = argv[++index];
    else if (arg === "--gold") args.gold = argv[++index];
    else if (arg === "--out") args.out = argv[++index];
    else if (arg === "--limit") args.limit = Number(argv[++index]);
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return [
    "Usage: node scripts/router/sample-gold-draft.mjs --candidates data/router/conflict-candidates.jsonl --gold data/router/gold-conflict.jsonl --out data/router/gold-conflict-draft.jsonl --limit 80",
    "Selects a deterministic, diverse draft set for manual gold labeling.",
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const candidates = readJsonl(args.candidates);
  const gold = readJsonl(args.gold);
  const selected = selectGoldDraftCandidates(candidates, gold, args.limit);
  writeJsonl(args.out, selected);
  console.log(JSON.stringify({
    candidates: args.candidates,
    gold: args.gold,
    out: args.out,
    selected: selected.length,
    limit: args.limit,
  }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}
