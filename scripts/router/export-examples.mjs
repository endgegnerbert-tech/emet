#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { classifyQuestionDomain } from "../../lib/research-intent.js";

const HIGH_RISK_DOMAINS = new Set(["security", "papers", "specs", "changelog", "medical", "legal", "finance", "trading", "standards"]);

function hashString(str) {
  return createHash("sha1").update(String(str || "")).digest("hex");
}

function getValue(entry) {
  if (entry && typeof entry === "object" && entry.value && typeof entry.value === "object") return entry.value;
  return entry && typeof entry === "object" ? entry : null;
}

function isUsableRun(value) {
  if (!value || typeof value !== "object") return false;
  if (!value.query || typeof value.query !== "string") return false;
  return value.ok === true || value.action === "web_research" || Array.isArray(value.sources);
}

function buildSourceText(sources) {
  if (!Array.isArray(sources)) return "";
  return sources
    .map(s => `[${s.sourceType || "web"}] ${s.title}\n${s.snippet || s.text || ""}`)
    .join("\n\n")
    .trim();
}

function versionMeta(run = {}) {
  return {
    versionContext: run.meta?.versionContext || null,
    versionCoverage: run.meta?.versionCoverage || run.runtimeTrace?.final?.versionSummary || null,
  };
}

export function exportExamples(cache) {
  const entries = cache && typeof cache === "object" ? Object.entries(cache) : [];
  const examples = [];

  for (const [cacheKey, rawEntry] of entries) {
    const run = getValue(rawEntry);
    if (!isUsableRun(run)) continue;

    const query = run.query.trim();
    if (!query) continue;

    const domain = classifyQuestionDomain(query);
    const risk = HIGH_RISK_DOMAINS.has(domain) ? "high" : "low";
    const sourceCount = Array.isArray(run.sources) ? run.sources.length : 0;
    
    // Task 1: Domain
    examples.push({
      id: hashString(`domain:${query}`),
      task: "domain",
      query,
      inputText: query,
      label: domain,
      labelSource: "heuristic",
      risk,
      meta: {
        cacheKey,
        mode: run.mode || "fast",
        ...versionMeta(run),
      }
    });

    // Task 2: Sufficiency (only if sources exist)
    if (sourceCount > 0 && typeof run.sufficient === "boolean") {
      examples.push({
        id: hashString(`sufficiency:${query}:${sourceCount}`),
        task: "sufficiency",
        query,
        inputText: `Query: ${query}\n\nSources:\n${buildSourceText(run.sources)}`,
        label: run.sufficient ? "sufficient" : "insufficient",
        labelSource: "pipeline",
        risk,
        meta: {
          cacheKey,
          mode: run.mode || "fast",
          sourceCount,
          authoritativeSourcesFound: Boolean(run.authoritativeSourcesFound),
          ...versionMeta(run),
        }
      });
    }

    // Task 3: Conflict (export as candidate_only, NOT truth)
    if (sourceCount > 1 && typeof run.conflictDetected === "boolean") {
      examples.push({
        id: hashString(`conflict:${query}:${sourceCount}`),
        task: "conflict",
        query,
        inputText: `Query: ${query}\n\nSources:\n${buildSourceText(run.sources)}`,
        label: run.conflictDetected ? "conflict" : "no_conflict",
        labelSource: "candidate_only",
        risk,
        meta: {
          cacheKey,
          mode: run.mode || "fast",
          sourceCount,
          conflictSummary: run.conflictSummary || "",
          ...versionMeta(run),
        }
      });
    }
  }

  // Sort deterministically
  return examples.sort((a, b) => {
    if (a.task !== b.task) return a.task.localeCompare(b.task);
    return a.id.localeCompare(b.id);
  });
}

function parseArgs(argv) {
  const args = { cache: ".cache/research-cache.json", out: "data/router/examples.jsonl" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--cache") args.cache = argv[++index];
    else if (arg === "--out") args.out = argv[++index];
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function usage() {
  return [
    "Usage: node scripts/router/export-examples.mjs [--cache .cache/research-cache.json] [--out data/router/examples.jsonl]",
    "Exports usable runs into JSONL examples for router training."
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  
  const cache = JSON.parse(readFileSync(args.cache, "utf8"));
  const examples = exportExamples(cache);
  
  mkdirSync(dirname(args.out), { recursive: true });
  const lines = examples.map(ex => JSON.stringify(ex)).join("\n");
  writeFileSync(args.out, lines + "\n");
  
  console.log(JSON.stringify({ 
    out: args.out, 
    totalExamples: examples.length,
    domain: examples.filter(e => e.task === "domain").length,
    sufficiency: examples.filter(e => e.task === "sufficiency").length,
    conflict: examples.filter(e => e.task === "conflict").length
  }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}
