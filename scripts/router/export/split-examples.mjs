#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeResearchQuery } from "../../../lib/research-memory.js";

function splitExamples(examples, trainRatio = 0.70, valRatio = 0.15) {
  // 1. Group by normalized query to prevent leakage
  const groups = new Map();
  for (const ex of examples) {
    const norm = normalizeResearchQuery(ex.query);
    if (!groups.has(norm)) groups.set(norm, []);
    groups.get(norm).push(ex);
  }

  // 2. Sort groups deterministically
  const sortedGroups = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  // 3. Distribute
  const train = [];
  const val = [];
  const test = [];

  for (let i = 0; i < sortedGroups.length; i++) {
    const [, groupExamples] = sortedGroups[i];
    // Deterministic pseudo-randomness based on index (so splits don't change randomly)
    // using a simple hash of the normalized query string length and char code
    const stableHash = (sortedGroups[i][0].length * 31 + sortedGroups[i][0].charCodeAt(0)) % 100;

    if (stableHash < trainRatio * 100) {
      train.push(...groupExamples);
    } else if (stableHash < (trainRatio + valRatio) * 100) {
      val.push(...groupExamples);
    } else {
      test.push(...groupExamples);
    }
  }

  return { train, val, test };
}

function parseArgs(argv) {
  const args = { input: "data/router/examples.jsonl", out: "data/router/splits.json" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") args.input = argv[++index];
    else if (arg === "--out") args.out = argv[++index];
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Usage: node scripts/router/split-examples.mjs [--input data/router/examples.jsonl] [--out data/router/splits.json]");
    return;
  }

  const text = readFileSync(args.input, "utf8");
  const examples = text.split("\n").filter(Boolean).map(line => JSON.parse(line));

  const { train, val, test } = splitExamples(examples);

  const result = {
    trainCount: train.length,
    valCount: val.length,
    testCount: test.length,
    trainIds: train.map(e => e.id),
    valIds: val.map(e => e.id),
    testIds: test.map(e => e.id)
  };

  writeFileSync(args.out, JSON.stringify(result, null, 2) + "\n");

  console.log(JSON.stringify({
    out: args.out,
    trainCount: train.length,
    valCount: val.length,
    testCount: test.length
  }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}
