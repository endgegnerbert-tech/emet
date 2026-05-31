#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { classifyQueryUnderstandingHeuristically } from "../../../lib/query-understanding.js";

function readJsonl(filePath) {
  return readFileSync(filePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function hash(value) {
  return createHash("sha1").update(String(value || "")).digest("hex");
}

function parseArgs(argv) {
  const args = {
    input: path.join("data", "router", "examples.jsonl"),
    out: path.join("data", "router", "query-understanding-weak.jsonl"),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--input") args.input = argv[++index];
    else if (arg === "--out") args.out = argv[++index];
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return [
    "Usage: node scripts/router/export_query_understanding_examples.mjs [--input data/router/examples.jsonl] [--out data/router/query-understanding-weak.jsonl]",
    "Exports unique runtime queries with weak query-understanding labels.",
  ].join("\n");
}

function normalizeQuery(query = "") {
  return String(query || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function buildRows(entries = []) {
  const seen = new Set();
  const rows = [];

  for (const entry of entries) {
    if (entry.task !== "domain") continue;
    const query = String(entry.query || "").trim();
    if (!query) continue;
    const normalized = normalizeQuery(query);
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    const labels = classifyQueryUnderstandingHeuristically(query, { mode: entry.meta?.mode || "fast" });
    rows.push({
      id: hash(`query_understanding:${query}:${entry.meta?.mode || "fast"}`),
      dataset: "emet_runtime_weak",
      query,
      mode: entry.meta?.mode || "fast",
      split: "train",
      labels: {
        query_shape: labels.query_shape,
        answer_shape: labels.answer_shape,
        source_family: labels.source_family,
        recency_need: labels.recency_need,
        ambiguity: labels.ambiguity,
      },
      review: {
        source: "weak_label",
        confidence: Number(labels.confidence || 0.65),
        needs_human_review: false,
      },
      provenance: {
        source: "data/router/examples.jsonl",
        task: entry.task,
        cache_key: entry.meta?.cacheKey || null,
      },
    });
  }

  return rows.sort((a, b) => a.query.localeCompare(b.query));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const rows = buildRows(readJsonl(args.input));
  mkdirSync(path.dirname(args.out), { recursive: true });
  writeFileSync(args.out, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
  console.log(JSON.stringify({ out: args.out, rows: rows.length }, null, 2));
}

main();
