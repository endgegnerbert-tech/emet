#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

function getMeta(example) {
  return example && typeof example.meta === "object" && example.meta ? example.meta : {};
}

function sortByQueryAndMode(rows) {
  return [...rows].sort((a, b) => {
    if (a.query !== b.query) return a.query.localeCompare(b.query);
    return String(a.meta?.mode || "").localeCompare(String(b.meta?.mode || ""));
  });
}

export function buildConflictGoldCandidates(examples = []) {
  return sortByQueryAndMode(
    examples
      .filter((example) => example?.task === "conflict" && example?.inputText)
      .map((example) => ({
        query: example.query,
        candidateLabel: example.label,
        rationale: "",
        inputText: example.inputText,
        meta: {
          mode: getMeta(example).mode || null,
          sourceCount: getMeta(example).sourceCount || 0,
          conflictSummary: getMeta(example).conflictSummary || "",
          labelSource: example.labelSource || "candidate_only",
        },
      }))
  );
}

export function buildSufficiencyGoldCandidates(examples = []) {
  return sortByQueryAndMode(
    examples
      .filter((example) => example?.task === "sufficiency" && example?.inputText)
      .map((example) => ({
        query: example.query,
        candidateLabel: example.label,
        rationale: "",
        inputText: example.inputText,
        meta: {
          mode: getMeta(example).mode || null,
          sourceCount: getMeta(example).sourceCount || 0,
          authoritativeSourcesFound: Boolean(getMeta(example).authoritativeSourcesFound),
          labelSource: example.labelSource || "pipeline",
        },
      }))
  );
}

function parseArgs(argv) {
  const args = {
    in: "data/router/examples.jsonl",
    conflictOut: "data/router/conflict-candidates.jsonl",
    sufficiencyOut: "data/router/sufficiency-candidates.jsonl",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--in") args.in = argv[++index];
    else if (arg === "--conflict-out") args.conflictOut = argv[++index];
    else if (arg === "--sufficiency-out") args.sufficiencyOut = argv[++index];
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return [
    "Usage: node scripts/router/prepare-gold-candidates.mjs [--in data/router/examples.jsonl] [--conflict-out data/router/conflict-candidates.jsonl] [--sufficiency-out data/router/sufficiency-candidates.jsonl]",
    "Builds deterministic manual-label candidate files for conflict and sufficiency gold sets.",
  ].join("\n");
}

function readJsonl(path) {
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function writeJsonl(path, rows) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const examples = readJsonl(args.in);
  const conflict = buildConflictGoldCandidates(examples);
  const sufficiency = buildSufficiencyGoldCandidates(examples);

  writeJsonl(args.conflictOut, conflict);
  writeJsonl(args.sufficiencyOut, sufficiency);

  console.log(JSON.stringify({
    in: args.in,
    conflictOut: args.conflictOut,
    sufficiencyOut: args.sufficiencyOut,
    conflictCandidates: conflict.length,
    sufficiencyCandidates: sufficiency.length,
  }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}
