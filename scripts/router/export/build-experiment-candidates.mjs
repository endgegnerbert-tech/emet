#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import readline from "node:readline";
import fs from "node:fs";

function hashString(value = "") {
  return createHash("sha1").update(String(value)).digest("hex");
}

async function processAuxiliary(limit = 10000) {
  const filePath = "experiments/emet-superrouter/datasets/processed/auxiliary-query-understanding.jsonl";
  if (!existsSync(filePath)) {
    console.warn("Auxiliary file not found:", filePath);
    return [];
  }

  const rows = [];
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const data = JSON.parse(line);
      const query = String(data.query || "").trim();
      if (query.length > 3) {
        rows.push({
          query,
          candidateLabel: "needs_review",
          rationale: "From auxiliary dataset",
          inputText: query,
          meta: { source: "auxiliary", dataset: data.dataset },
          reviewSource: "candidate_heuristic"
        });
        if (rows.length >= limit) break;
      }
    } catch (e) {}
  }
  return rows;
}

function processNtrs(limit = 5000) {
  const filePath = "experiments/emet-superrouter/datasets/raw/QueryClassification/NTRS_queries.txt";
  if (!existsSync(filePath)) return [];

  const lines = readFileSync(filePath, "utf-8").split("\n");
  const rows = [];
  for (const line of lines) {
    const query = line.trim();
    if (query.length > 5 && !/^[0-9,]+$/.test(query)) {
      rows.push({
        query,
        candidateLabel: "needs_review",
        rationale: "From NTRS dataset",
        inputText: query,
        meta: { source: "ntrs" },
        reviewSource: "candidate_heuristic"
      });
      if (rows.length >= limit) break;
    }
  }
  return rows;
}

async function main() {
  console.log("Extracting massive datasets for LLM review...");
  const auxRows = await processAuxiliary(10000);
  const ntrsRows = processNtrs(5000);

  const allRows = [...auxRows, ...ntrsRows];

  const outPath = "data/router/experiment-candidates/domain-draft.jsonl";
  writeFileSync(outPath, allRows.map(r => JSON.stringify(r)).join("\n") + "\n");

  console.log(`Generated ${allRows.length} draft candidates -> ${outPath}`);
}

main().catch(console.error);
