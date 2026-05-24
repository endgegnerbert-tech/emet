#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { classifyQuestionDomain } from "../../lib/research-intent.js";
import { normalizeResearchQuery } from "../../lib/research-memory.js";

const REQUIRED_FIELDS = [
  "query",
  "mode",
  "sufficient",
  "conflictDetected",
  "authoritativeSourcesFound",
  "sources",
  "sourceTypes",
];

const HIGH_RISK_DOMAINS = new Set(["security", "papers", "specs"]);

function increment(map, key) {
  const normalized = key === undefined || key === null || key === "" ? "missing" : String(key);
  map[normalized] = (map[normalized] || 0) + 1;
}

function sortedObject(input) {
  return Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b)));
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

function sourceTypeValues(run) {
  const values = [];
  if (Array.isArray(run.sourceTypes)) values.push(...run.sourceTypes);
  if (Array.isArray(run.sources)) {
    for (const source of run.sources) {
      if (source?.sourceType) values.push(source.sourceType);
    }
  }
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function compactConflictCandidate(cacheKey, run, domain) {
  return {
    cacheKey,
    query: run.query,
    mode: run.mode || null,
    domain,
    conflictDetected: Boolean(run.conflictDetected),
    conflictSummary: run.conflictSummary || "",
    conflictingSourcePairs: Array.isArray(run.conflictingSourcePairs) ? run.conflictingSourcePairs.slice(0, 5) : [],
    sourceCount: Array.isArray(run.sources) ? run.sources.length : 0,
    sourceTypes: sourceTypeValues(run),
  };
}

export function analyzeResearchCache(cache) {
  const entries = cache && typeof cache === "object" ? Object.entries(cache) : [];
  const modes = {};
  const domains = {};
  const sufficient = {};
  const conflictDetected = {};
  const authoritativeSourcesFound = {};
  const sourceTypes = {};
  const sourceCountDistribution = {};
  const versionSensitive = {};
  const versionCoverage = { exactMatchRuns: 0, mismatchRuns: 0, changelogRuns: 0 };
  const missingFields = Object.fromEntries(REQUIRED_FIELDS.map((field) => [field, 0]));
  const highRiskDomains = { security: 0, papers: 0, specs: 0 };
  const normalizedQueries = new Map();
  const conflictCandidates = [];
  let usableRuns = 0;

  for (const [cacheKey, entry] of entries) {
    const run = getValue(entry);
    if (!isUsableRun(run)) continue;

    usableRuns += 1;
    const normalizedQuery = normalizeResearchQuery(run.query);
    const domain = classifyQuestionDomain(run.query);
    const sourceCount = Array.isArray(run.sources) ? run.sources.length : 0;

    increment(modes, run.mode);
    increment(domains, domain);
    increment(sufficient, typeof run.sufficient === "boolean" ? run.sufficient : "missing");
    increment(conflictDetected, typeof run.conflictDetected === "boolean" ? run.conflictDetected : "missing");
    increment(authoritativeSourcesFound, typeof run.authoritativeSourcesFound === "boolean" ? run.authoritativeSourcesFound : "missing");
    increment(sourceCountDistribution, sourceCount);
    const versionContext = run.meta?.versionContext || {};
    const versionSummary = run.meta?.versionCoverage || run.runtimeTrace?.final?.versionSummary || {};
    increment(versionSensitive, Boolean(versionContext.versionSensitive));

    if (Number(versionSummary.exactMatchSources || 0) > 0) versionCoverage.exactMatchRuns += 1;
    if (Number(versionSummary.mismatchSources || 0) > 0) versionCoverage.mismatchRuns += 1;
    if (Number(versionSummary.changelogSources || 0) > 0) versionCoverage.changelogRuns += 1;

    for (const type of sourceTypeValues(run)) increment(sourceTypes, type);
    for (const field of REQUIRED_FIELDS) {
      if (run[field] === undefined || run[field] === null || (Array.isArray(run[field]) && run[field].length === 0)) missingFields[field] += 1;
    }

    if (HIGH_RISK_DOMAINS.has(domain)) highRiskDomains[domain] += 1;

    if (!normalizedQueries.has(normalizedQuery)) normalizedQueries.set(normalizedQuery, []);
    normalizedQueries.get(normalizedQuery).push({ cacheKey, query: run.query });

    if (run.conflictDetected || run.conflictSummary || (Array.isArray(run.conflictingSourcePairs) && run.conflictingSourcePairs.length > 0)) {
      conflictCandidates.push(compactConflictCandidate(cacheKey, run, domain));
    }
  }

  const duplicateNormalizedQueries = [...normalizedQueries.entries()]
    .filter(([, values]) => values.length > 1)
    .map(([normalizedQuery, values]) => ({ normalizedQuery, count: values.length, examples: values.slice(0, 5) }))
    .sort((a, b) => b.count - a.count || a.normalizedQuery.localeCompare(b.normalizedQuery));

  return {
    generatedAt: new Date().toISOString(),
    totalEntries: entries.length,
    usableRuns,
    modes: sortedObject(modes),
    domains: sortedObject(domains),
    highRiskDomains: sortedObject(highRiskDomains),
    sufficient: sortedObject(sufficient),
    conflictDetected: sortedObject(conflictDetected),
    authoritativeSourcesFound: sortedObject(authoritativeSourcesFound),
    sourceCountDistribution: sortedObject(sourceCountDistribution),
    sourceTypes: sortedObject(sourceTypes),
    versionSensitive: sortedObject(versionSensitive),
    versionCoverage,
    missingFields: sortedObject(missingFields),
    duplicateNormalizedQueries,
    conflictCandidates: conflictCandidates.sort((a, b) => a.query.localeCompare(b.query)).slice(0, 100),
  };
}

export function writeAuditReport(cache, outPath) {
  const report = analyzeResearchCache(cache);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

function parseArgs(argv) {
  const args = { cache: ".cache/research-cache.json", out: "data/router/dataset-report.json" };
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
    "Usage: node scripts/router/audit-cache.mjs [--cache .cache/research-cache.json] [--out data/router/dataset-report.json]",
    "",
    "Writes a deterministic audit report for router training/eval planning.",
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  const cache = JSON.parse(readFileSync(args.cache, "utf8"));
  const report = writeAuditReport(cache, args.out);
  console.log(JSON.stringify({ out: args.out, totalEntries: report.totalEntries, usableRuns: report.usableRuns }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error?.message || error);
    process.exitCode = 1;
  });
}
