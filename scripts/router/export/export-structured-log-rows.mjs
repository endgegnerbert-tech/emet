#!/usr/bin/env node
/**
 * export-structured-log-rows.mjs
 *
 * Extracts training candidates from structured runtime logs.
 * Handles both:
 *   - legacy format (single emet.jsonl, pre-v1.3.2, no outcome/reason on research_end)
 *   - new format (daily emet-YYYY-MM-DD.jsonl with schemaVersion, outcome/reason fields)
 *
 * Output is a unified JSONL usable by build-log-training-candidates.mjs
 * and downstream training scripts.
 *
 * Usage:
 *   # Legacy migration (one-time)
 *   node scripts/router/export/export-structured-log-rows.mjs \
 *     --legacy ~/.pi/logs/emet.jsonl \
 *     --out data/router/log-candidates/legacy-migration.jsonl
 *
 *   # New structured logs (daily)
 *   node scripts/router/export/export-structured-log-rows.mjs \
 *     --log-dir ~/Library/Logs/emet \
 *     --out data/router/log-candidates/structured-v1.jsonl
 *
 *   # Both at once
 *   node scripts/router/export/export-structured-log-rows.mjs \
 *     --legacy ~/.pi/logs/emet.jsonl \
 *     --log-dir ~/Library/Logs/emet \
 *     --out data/router/log-candidates/all-structured.jsonl
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { classifyQuestionDomain } from "../../../lib/research-intent.js";

const HIGH_RISK_DOMAINS = new Set([
  "security", "papers", "specs", "changelog", "medical",
  "legal", "finance", "trading", "standards",
]);

function hashString(value = "") {
  return createHash("sha1").update(String(value)).digest("hex");
}

function safeJsonParse(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function readLegacyLog(path) {
  if (!path || !existsSync(path)) return [];
  const text = readFileSync(path, "utf8");
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const ev = safeJsonParse(line);
      if (!ev) return null;
      return { ...ev, logPath: path, sourceFormat: "legacy" };
    })
    .filter(Boolean);
}

async function readDailyLogs(dirPath) {
  if (!dirPath || !existsSync(dirPath)) return [];
  const files = (await readdir(dirPath))
    .filter((name) => name.startsWith("emet-") && name.endsWith(".jsonl"))
    .sort()
    .map((name) => join(dirPath, name));

  const events = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      const ev = safeJsonParse(line);
      if (!ev) continue;
      events.push({ ...ev, logPath: file, sourceFormat: "daily" });
    }
  }
  return events;
}

function getResearchEndEvents(events) {
  return events.filter((ev) => ev.type === "research_end");
}

function assessOutcome(data, isLegacy) {
  // New-format logs have explicit outcome/reason
  if (!isLegacy && data.outcome) {
    return { outcome: data.outcome, reason: data.reason || "success" };
  }

  // Legacy: derive from available fields
  if (data.ok === false) {
    return { outcome: "hard_failure", reason: data.reason || "no_readable_sources" };
  }
  if (data.cacheHit) {
    return { outcome: "cache_hit", reason: "cache_hit" };
  }
  if (data.sufficient === true) {
    return { outcome: "sufficient", reason: "success" };
  }
  return { outcome: "partial_success", reason: "success" };
}

function extractSourceCount(data) {
  if (typeof data.sourceCount === "number") return data.sourceCount;
  if (Array.isArray(data.sources)) return data.sources.length;
  if (typeof data.pagesRead === "number") return data.pagesRead;
  return 0;
}

function extractDomain(data, query) {
  // Check runtimeTrace first (new format)
  const rt = data.runtimeTrace;
  if (rt && rt.domainDecision && rt.domainDecision.finalDomain) {
    return rt.domainDecision.finalDomain;
  }
  // Fall back to heuristic
  return classifyQuestionDomain(query);
}

function buildStructuredFeatures(data, query) {
  const sourceCount = extractSourceCount(data);
  const authoritativeCount = data.authoritativeSourcesFound ? 1 : 0;
  const followupRounds = data.followupRounds || 0;

  return {
    query_temporal: /current|recent|latest|as of|202[4-9]|203\d/.test(query) ? 1 : 0,
    query_versioned: /\bv?\d+(\.\d+){0,2}\b/.test(query) ? 1 : 0,
    query_explicit_version: /\bv?\d+\.\d+\.\d+\b/.test(query) ? 1 : 0,
    query_deprecated_intent: /deprecated|removed|migrat|sunset/i.test(query) ? 1 : 0,
    query_comparison: /\b(vs\.?|versus|compare|difference|alternative|or\b)/i.test(query) ? 1 : 0,
    query_academic: /\b(paper|study|arxiv|doi|published|research)\b/i.test(query) ? 1 : 0,
    query_procedural: /\b(how to|guide|tutorial|steps|setup|install|configure)\b/i.test(query) ? 1 : 0,
    source_count: sourceCount,
    authoritative_source_count: authoritativeCount,
    followup_rounds: followupRounds,
    blocked_source_count: 0,
    positive_signal_sources: authoritativeCount,
    negative_signal_sources: 0,
    official_doc_count: 0,
    paper_count: 0,
    github_readme_count: 0,
    forum_count: 0,
  };
}

function buildSufficiencyRow(data, query, sourceCount, isLegacy, sessionId) {
  if (data.sufficient === undefined || data.sufficient === null) return null;

  const outcome = assessOutcome(data, isLegacy);
  const label = data.sufficient ? "sufficient" : "insufficient";
  const domain = extractDomain(data, query);
  const risk = HIGH_RISK_DOMAINS.has(domain) ? "high" : "low";
  const features = buildStructuredFeatures(data, query);

  return {
    task: "sufficiency",
    query,
    label,
    labelSource: outcome.outcome === "cache_hit" ? "cache_weak" : "runtime_weak",
    risk,
    features,
    meta: {
      source: "structured_log",
      logOutcome: outcome.outcome,
      logReason: outcome.reason,
      sourceCount,
      authoritativeSourcesFound: Boolean(data.authoritativeSourcesFound),
      domain,
      mode: data.mode || "fast",
      sessionId,
    },
    id: hashString(`structured:sufficiency:${sessionId}`),
  };
}

function buildConflictRow(data, query, sourceCount, isLegacy, sessionId) {
  if (typeof data.conflictDetected !== "boolean") return null;
  if (sourceCount < 2) return null;

  const domain = extractDomain(data, query);
  const risk = HIGH_RISK_DOMAINS.has(domain) ? "high" : "low";
  const features = buildStructuredFeatures(data, query);

  return {
    task: "conflict",
    query,
    label: data.conflictDetected ? "conflict" : "no_conflict",
    labelSource: "runtime_weak",
    risk,
    features: {
      ...features,
      conflicting_pairs: Array.isArray(data.conflictingSourcePairs) ? data.conflictingSourcePairs.length : (typeof data.conflictingSourcePairs === "number" ? data.conflictingSourcePairs : 0),
      has_conflict_summary: data.conflictSummary ? (typeof data.conflictSummary === "string" && data.conflictSummary.length > 0 ? 1 : 0) : 0,
    },
    meta: {
      source: "structured_log",
      conflictSummary: data.conflictSummary || "",
      domain,
      mode: data.mode || "fast",
      sessionId,
    },
    id: hashString(`structured:conflict:${sessionId}`),
  };
}

function buildDomainRow(data, query, isLegacy, sessionId) {
  const domain = extractDomain(data, query);
  const rt = data.runtimeTrace;
  const hasRuntimeDomain = Boolean(rt && rt.domainDecision && rt.domainDecision.finalDomain);

  return {
    task: "domain",
    query,
    inputText: query,
    label: domain,
    labelSource: hasRuntimeDomain ? "runtime_decision" : "heuristic",
    risk: HIGH_RISK_DOMAINS.has(domain) ? "high" : "low",
    meta: {
      source: "structured_log",
      mode: data.mode || "fast",
      hasRuntimeDomain,
      okayStatus: Boolean(data.ok),
      sufficient: data.sufficient,
      sessionId,
    },
    id: hashString(`structured:domain:${sessionId}`),
  };
}

function buildFollowupRow(data, query, isLegacy, sessionId) {
  const followupRounds = data.followupRounds || 0;
  const followupQuery = data.followupQuery || null;

  if (!followupRounds && !followupQuery && data.sufficient !== false) return null;

  const outcome = assessOutcome(data, isLegacy);
  const domain = extractDomain(data, query);
  const risk = HIGH_RISK_DOMAINS.has(domain) ? "high" : "low";
  const sourceCount = extractSourceCount(data);

  let label = "stop";
  if (outcome.outcome === "partial_success" || data.sufficient === false) {
    label = "need_more_sources";
  }
  if (data.conflictDetected) {
    label = "need_conflict_resolution";
  }
  if (data.authoritativeSourcesFound === false && sourceCount > 0) {
    label = "need_authority";
  }
  if (followupQuery && followupRounds > 0) {
    label = "need_more_sources";
  }

  let conflictState = "none";
  if (data.conflictDetected) {
    conflictState = data.authoritativeSourcesFound ? "minor" : "severe";
  }

  return {
    id: hashString(`structured:followup:${sessionId}`),
    task: "followup",
    query,
    group: query.toLowerCase().replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ").trim(),
    mode: data.mode || "fast",
    conflict: conflictState,
    sources: {
      has_authority: Boolean(data.authoritativeSourcesFound),
      has_recent: true,
      source_count: sourceCount,
    },
    label,
    labelSource: "runtime_weak",
    followupQuery,
    firstTurnUrls: Array.isArray(data.sources)
      ? data.sources.map((s) => s.url).filter(Boolean).slice(0, 10)
      : [],
    meta: {
      source: "structured_log",
      domain,
      risk,
      followupRounds,
      outcome: outcome.outcome,
      reason: outcome.reason,
      sessionId,
    },
  };
}

function extractRows(events) {
  const rows = [];
  const seenIds = new Set();

  for (const event of events) {
    const data = event.data || {};
    const query = String(data.query || "").trim();
    if (!query) continue;

    // Use pid + ts as session-level uniqueness so every log event produces distinct rows
    const sessionId = `${event.pid || "unknown"}:${event.ts || Date.now()}`;
    const isLegacy = event.sourceFormat === "legacy";
    const sourceCount = extractSourceCount(data);

    const sufficiencyRow = buildSufficiencyRow(data, query, sourceCount, isLegacy, sessionId);
    if (sufficiencyRow && !seenIds.has(sufficiencyRow.id)) {
      seenIds.add(sufficiencyRow.id);
      rows.push(sufficiencyRow);
    }

    const conflictRow = buildConflictRow(data, query, sourceCount, isLegacy, sessionId);
    if (conflictRow && !seenIds.has(conflictRow.id)) {
      seenIds.add(conflictRow.id);
      rows.push(conflictRow);
    }

    const domainRow = buildDomainRow(data, query, isLegacy, sessionId);
    if (domainRow && !seenIds.has(domainRow.id)) {
      seenIds.add(domainRow.id);
      rows.push(domainRow);
    }

    const followupRow = buildFollowupRow(data, query, isLegacy, sessionId);
    if (followupRow && !seenIds.has(followupRow.id)) {
      seenIds.add(followupRow.id);
      rows.push(followupRow);
    }
  }

  return rows;
}

function buildReport(events, rows) {
  const byTask = {};
  const byLabelSource = {};
  let totalResearchEnd = 0;

  for (const event of events) {
    if (event.type === "research_end") totalResearchEnd++;
  }

  for (const row of rows) {
    byTask[row.task] = (byTask[row.task] || 0) + 1;
    byLabelSource[row.labelSource] = (byLabelSource[row.labelSource] || 0) + 1;
  }

  return {
    totalEvents: events.length,
    researchEndEvents: totalResearchEnd,
    extractedRows: rows.length,
    byTask,
    byLabelSource,
  };
}

function parseArgs(argv) {
  const args = {
    legacy: null,
    logDir: null,
    out: "data/router/log-candidates/structured-log-rows.jsonl",
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--legacy") args.legacy = argv[++i];
    else if (arg === "--log-dir") args.logDir = argv[++i];
    else if (arg === "--out") args.out = argv[++i];
    else if (arg === "--help" || arg === "-h") args.help = true;
  }

  return args;
}

function usage() {
  return [
    "Usage: node scripts/router/export/export-structured-log-rows.mjs [options]",
    "",
    "Options:",
    "  --legacy <path>   Path to legacy emet.jsonl (pre-v1.3.2, single-file format)",
    "  --log-dir <dir>   Directory with daily structured logs (emet-YYYY-MM-DD.jsonl)",
    "  --out <path>      Output JSONL path (default: data/router/log-candidates/structured-log-rows.jsonl)",
    "  --help            Show this help",
    "",
    "Examples:",
    "  # Legacy migration (one-time, highest leverage)",
    "  node scripts/router/export/export-structured-log-rows.mjs \\",
    "    --legacy ~/.pi/logs/emet.jsonl \\",
    "    --out data/router/log-candidates/legacy-migration.jsonl",
    "",
    "  # New structured logs (daily)",
    "  node scripts/router/export/export-structured-log-rows.mjs \\",
    "    --log-dir ~/Library/Logs/emet \\",
    "    --out data/router/log-candidates/structured-v1.jsonl",
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const allEvents = [];

  if (args.legacy) {
    console.error(`Reading legacy log: ${args.legacy}`);
    const legacyEvents = readLegacyLog(args.legacy);
    allEvents.push(...legacyEvents);
    console.error(`  Found ${legacyEvents.length} events`);
  }

  if (args.logDir) {
    console.error(`Reading daily logs from: ${args.logDir}`);
    const dailyEvents = await readDailyLogs(args.logDir);
    allEvents.push(...dailyEvents);
    console.error(`  Found ${dailyEvents.length} events`);
  }

  if (!allEvents.length) {
    console.error("No events found. Use --legacy and/or --log-dir.");
    console.error(usage());
    process.exitCode = 1;
    return;
  }

  const researchEndEvents = getResearchEndEvents(allEvents);
  console.error(`Research end events: ${researchEndEvents.length}`);

  const rows = extractRows(researchEndEvents);
  const report = buildReport(allEvents, rows);

  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
  writeFileSync(
    args.out.replace(/\.jsonl$/, "-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );

  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exitCode = 1;
  });
}
